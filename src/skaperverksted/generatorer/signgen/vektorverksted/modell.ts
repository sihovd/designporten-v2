/**
 * Vektorverksted, step 4: the editable vector (Sivert, 2026-11-09).
 *
 * The model is a map of shared borders: curves (one per chain between two
 * nodes) and parts (one per region) whose rings are lists of curves, used
 * forwards or backwards. A part's outline is never stored on its own, so
 * whatever is edited (a point moved, a border simplified, two parts
 * merged) changes both neighbours at once and they keep meeting exactly.
 *
 * Every function here returns a new model or mutates a copy the caller
 * made; the UI keeps the history.
 */
import { byggRinger, finnKjeder, type Kjedebruk } from './kanter';
import type { Regionkart } from './regioner';
import {
  avstandSegment,
  glattPunkter,
  STANDARD_TILPASNING,
  tilpassKjede,
  tilpassSpenn,
  type Anker,
  type P,
  type Tilpasningsvalg,
} from './tilpass';

export interface Kurve {
  id: number;
  /** Pixel-corner points the curve was traced from (flat x, y). */
  punkter: number[];
  lukket: boolean;
  /** End nodes; -1 for a closed curve. */
  fra: number;
  til: number;
  /** Part on the left / right, -1 = nothing. */
  venstre: number;
  hoyre: number;
  forsteRetning: number;
  sisteRetning: number;
  ankre: Anker[];
  /** The settings it was last fitted with. */
  valg: Tilpasningsvalg;
}

export interface Del {
  id: number;
  farge: string;
  areal: number;
  ringer: Kjedebruk[][];
}

export interface Vektormodell {
  bredde: number;
  hoyde: number;
  kurver: (Kurve | null)[];
  deler: (Del | null)[];
}

export const kopier = (m: Vektormodell): Vektormodell => structuredClone(m);

/** The model of a label image, every border fitted with the given settings. */
export function byggModell(kart: Regionkart, valg: Tilpasningsvalg = STANDARD_TILPASNING): Vektormodell {
  const kjeder = finnKjeder(kart.etikett, kart.bredde, kart.hoyde);
  const kurver: Kurve[] = kjeder.map((k, id) => {
    const t = tilpassKjede(k.punkter, k.lukket, valg);
    return {
      id,
      punkter: t.punkter,
      lukket: k.lukket,
      fra: k.fra,
      til: k.til,
      venstre: k.venstre,
      hoyre: k.hoyre,
      forsteRetning: k.forsteRetning,
      sisteRetning: k.sisteRetning,
      ankre: t.ankre,
      valg: { ...valg },
    };
  });
  const ringer = byggRinger(kurver, kart.regioner.length);
  return ryddFlate({
    bredde: kart.bredde,
    hoyde: kart.hoyde,
    kurver,
    deler: kart.regioner.map((r, id) => ({ id, farge: r.farge, areal: r.areal, ringer: ringer[id]! })),
  });
}

/** The area a part's fitted outline encloses (holes subtracted), from points along its curves. */
export function tegnetAreal(m: Vektormodell, del: Del): number {
  let sum = 0;
  for (const ring of del.ringer) {
    const pts: P[] = [];
    for (const b of ring) {
      const k = m.kurver[b.kjede];
      if (!k) continue;
      const u = utvalgspunkter(k, 6);
      pts.push(...(b.bakover ? u.reverse() : u));
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!,
        c = pts[(i + 1) % pts.length]!;
      sum += a[0] * c[1] - c[0] * a[1];
    }
  }
  return Math.abs(sum / 2);
}

/**
 * A sliver one pixel wide can lose its area when both its sides are made
 * straight between the same corners. Such parts are merged into the
 * neighbour they share the most border with.
 */
function ryddFlate(m: Vektormodell): Vektormodell {
  let ut = m;
  for (const d of m.deler) {
    if (!d || !ut.deler[d.id]) continue;
    if (tegnetAreal(ut, ut.deler[d.id]!) >= 0.5) continue;
    const lengde = new Map<number, number>();
    for (const k of ut.kurver) {
      if (!k || (k.venstre !== d.id && k.hoyre !== d.id)) continue;
      const nabo = k.venstre === d.id ? k.hoyre : k.venstre;
      lengde.set(nabo, (lengde.get(nabo) ?? 0) + k.punkter.length);
    }
    let mal = -1,
      lengst = -1;
    for (const [n, l] of lengde) {
      if (l > lengst) {
        mal = n;
        lengst = l;
      }
    }
    ut = omdop(ut, new Set([d.id]), mal);
  }
  return ut;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (p: P | { x: number; y: number }) =>
  'x' in p ? `${r2(p.x)} ${r2(p.y)}` : `${r2(p[0])} ${r2(p[1])}`;

/** The points of a curve in the direction it is used. */
export function ankreI(k: Kurve, bakover: boolean): Anker[] {
  if (!bakover) return k.ankre;
  return [...k.ankre].reverse().map((a) => ({ ...a, inn: a.ut, ut: a.inn }));
}

/** Path data of one ring. */
export function ringSti(m: Vektormodell, ring: Kjedebruk[]): string {
  let d = '';
  for (const bruk of ring) {
    const k = m.kurver[bruk.kjede];
    if (!k) continue;
    const a = ankreI(k, bruk.bakover);
    if (!d) d = `M${fmt(a[0]!)}`;
    let forrige = a[0]!;
    for (let i = 1; i < a.length; i++) {
      const p = a[i]!;
      if (forrige.ut || p.inn) d += `C${fmt(forrige.ut ?? forrige)} ${fmt(p.inn ?? p)} ${fmt(p)}`;
      else d += `L${fmt(p)}`;
      forrige = p;
    }
  }
  return d ? `${d}Z` : '';
}

/** Path data of one part, holes included. */
export function delSti(m: Vektormodell, del: Del): string {
  return del.ringer.map((r) => ringSti(m, r)).join('');
}

export interface Tall {
  deler: number;
  farger: number;
  /** Points written to the SVG file (each part writes its own copy of a shared point). */
  punkter: number;
  /** Points in the shared map, each counted once. */
  unikePunkter: number;
  kurvesegmenter: number;
  linjesegmenter: number;
  kanter: number;
}

export function tall(m: Vektormodell): Tall {
  let punkter = 0;
  const farger = new Set<string>();
  let deler = 0;
  for (const d of m.deler) {
    if (!d) continue;
    deler++;
    farger.add(d.farge);
    for (const ring of d.ringer) {
      for (const b of ring) {
        const k = m.kurver[b.kjede];
        if (k) punkter += k.ankre.length - 1;
      }
    }
  }
  const noder = new Set<number>();
  let indre = 0,
    kurvesegmenter = 0,
    linjesegmenter = 0,
    kanter = 0;
  for (const k of m.kurver) {
    if (!k) continue;
    kanter++;
    if (k.lukket) indre += k.ankre.length - 1;
    else {
      noder.add(k.fra);
      noder.add(k.til);
      indre += k.ankre.length - 2;
    }
    for (let i = 0; i + 1 < k.ankre.length; i++) {
      if (k.ankre[i]!.ut || k.ankre[i + 1]!.inn) kurvesegmenter++;
      else linjesegmenter++;
    }
  }
  return {
    deler,
    farger: farger.size,
    punkter,
    unikePunkter: indre + noder.size,
    kurvesegmenter,
    linjesegmenter,
    kanter,
  };
}

/** The model as an SVG file: one path per part, optionally grouped by colour. */
export function tilSvg(
  m: Vektormodell,
  opt: {
    grupperEtterFarge?: boolean;
    bredde?: number;
    hoyde?: number;
    /** Colours (layers) in drawing order, first at the bottom; the rest follow. */
    rekkefolge?: string[];
    /** Colours (layers) left out. */
    skjulte?: Set<string>;
    /** Group titles per colour (layer names). */
    navn?: Record<string, string | undefined>;
    /** Width and height are in millimetres (Finalize's size), not pixels. */
    mm?: boolean;
    /** Markup drawn under and over the parts (Finalize's contour). */
    under?: string;
    over?: string;
    /** Room around the drawing (vector units), for a contour that reaches outside it. */
    marg?: number;
  } = {},
): string {
  const rang = (f: string) => {
    const i = opt.rekkefolge?.indexOf(f) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const deler = m.deler
    .filter((d): d is Del => !!d && !opt.skjulte?.has(d.farge))
    .sort((a, b) => rang(a.farge) - rang(b.farge));
  const sti = (d: Del) => `<path id="del-${d.id}" fill="${d.farge}" d="${delSti(m, d)}"/>`;
  let innhold: string;
  if (opt.grupperEtterFarge) {
    const grupper = new Map<string, Del[]>();
    for (const d of deler) grupper.set(d.farge, [...(grupper.get(d.farge) ?? []), d]);
    innhold = [...grupper]
      .map(([f, ds]) => {
        const t = opt.navn?.[f];
        const tittel = t ? `<title>${t.replace(/[<&"]/g, (c) => `&#${c.charCodeAt(0)};`)}</title>` : '';
        return `<g id="farge-${f.slice(1)}">${tittel}${ds.map(sti).join('')}</g>`;
      })
      .join('');
  } else innhold = deler.map(sti).join('');
  const e = opt.mm ? 'mm' : '';
  const g = Math.max(0, opt.marg ?? 0);
  const st =
    opt.bredde && opt.hoyde
      ? ` width="${r2((opt.bredde * (m.bredde + 2 * g)) / m.bredde)}${e}" height="${r2((opt.hoyde * (m.hoyde + 2 * g)) / m.hoyde)}${e}"`
      : '';
  const vb = g
    ? `${-r2(g)} ${-r2(g)} ${r2(m.bredde + 2 * g)} ${r2(m.hoyde + 2 * g)}`
    : `0 0 ${m.bredde} ${m.hoyde}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${st}>${opt.under ?? ''}${innhold}${opt.over ?? ''}</svg>`;
}

// ---------------------------------------------------------------- editing

/** A curve turned around: same shape, start and end swapped. */
export function snu(k: Kurve): Kurve {
  const n = k.punkter.length / 2;
  const punkter: number[] = [];
  for (let i = n - 1; i >= 0; i--) punkter.push(k.punkter[i * 2]!, k.punkter[i * 2 + 1]!);
  return {
    ...k,
    punkter,
    fra: k.til,
    til: k.fra,
    venstre: k.hoyre,
    hoyre: k.venstre,
    forsteRetning: (k.sisteRetning + 2) % 4,
    sisteRetning: (k.forsteRetning + 2) % 4,
    ankre: ankreI(k, true).map((a) => ({ ...a, ri: n - 1 - a.ri })),
  };
}

function byggDelRinger(m: Vektormodell): void {
  const tett = m.kurver.filter((k): k is Kurve => !!k);
  const ringer = byggRinger(tett, m.deler.length);
  // byggRinger numbers curves by their place in the dense list
  ringer.forEach((rs, d) => {
    const del = m.deler[d];
    if (del) del.ringer = rs.map((r) => r.map((b) => ({ kjede: tett[b.kjede]!.id, bakover: b.bakover })));
  });
}

/**
 * A curve that has just become closed starts at what was a node. If the
 * border runs straight through it, the closed curve is turned to start at
 * its next point and the old node is dropped.
 */
function rensLukket(k: Kurve): Kurve {
  const a = k.ankre;
  if (a.length < 4) return k;
  const forste = a[0]!,
    forrige = a[a.length - 2]!,
    neste = a[1]!,
    siste = a[a.length - 1]!;
  if (forste.ut || siste.inn || forrige.ut || neste.inn) return k;
  const kryss = (neste.x - forste.x) * (forste.y - forrige.y) - (neste.y - forste.y) * (forste.x - forrige.x);
  const l1 = Math.hypot(neste.x - forste.x, neste.y - forste.y),
    l2 = Math.hypot(forste.x - forrige.x, forste.y - forrige.y);
  if (!l1 || !l2 || Math.abs(kryss / (l1 * l2)) > Math.sin((3 * Math.PI) / 180)) return k;
  const n = k.punkter.length / 2;
  const s = neste.ri;
  const punkter = [...k.punkter.slice(s * 2), ...k.punkter.slice(0, s * 2)];
  const midt = a.slice(1, -1).map((x) => ({ ...x, ri: (x.ri - s + n) % n }));
  return { ...k, punkter, ankre: [...midt, { ...midt[0]!, ri: 0 }] };
}

/** Joins curves that meet at a node no other curve uses any more. */
function slaSammenVedNoder(m: Vektormodell): void {
  for (let runde = 0; runde < 100000; runde++) {
    const ender = new Map<number, number[]>();
    for (const k of m.kurver) {
      if (!k || k.lukket) continue;
      ender.set(k.fra, [...(ender.get(k.fra) ?? []), k.id]);
      ender.set(k.til, [...(ender.get(k.til) ?? []), k.id]);
    }
    let endret = false;
    for (const [node, ks] of ender) {
      if (ks.length !== 2) continue;
      const [ia, ib] = ks as [number, number];
      if (ia === ib) {
        // both ends of one curve: it is a closed loop now
        const k = m.kurver[ia]!;
        m.kurver[ia] = rensLukket({ ...k, lukket: true, fra: -1, til: -1 });
        endret = true;
        break;
      }
      let a = m.kurver[ia]!,
        b = m.kurver[ib]!;
      if (a.til !== node) a = snu(a);
      if (b.fra !== node) b = snu(b);
      if (a.venstre !== b.venstre || a.hoyre !== b.hoyre) continue;
      const na = a.punkter.length / 2;
      const ledd = a.ankre[a.ankre.length - 1]!;
      const forste = b.ankre[0]!;
      const midt: Anker = { x: ledd.x, y: ledd.y, inn: ledd.inn, ut: forste.ut, hjorne: true, ri: na - 1 };
      const forrige = a.ankre[a.ankre.length - 2]!,
        neste = b.ankre[1]!;
      // the old node is only kept where the border really turns there
      const retning = (p: Anker, q: { x: number; y: number }) => Math.atan2(q.y - p.y, q.x - p.x);
      const inn = midt.inn
        ? retning({ ...midt, x: midt.inn[0], y: midt.inn[1] }, midt)
        : retning(forrige, midt);
      const ut = midt.ut ? retning(midt, { x: midt.ut[0], y: midt.ut[1] }) : retning(midt, neste);
      let knekk = Math.abs(inn - ut);
      if (knekk > Math.PI) knekk = 2 * Math.PI - knekk;
      const rettInn = !midt.inn && !forrige.ut,
        rettUt = !midt.ut && !neste.inn;
      const fjern = rettInn && rettUt && knekk < (3 * Math.PI) / 180;
      if (!fjern && knekk < (8 * Math.PI) / 180 && !rettInn && !rettUt) midt.hjorne = false;
      const ankre: Anker[] = [
        ...a.ankre.slice(0, -1),
        ...(fjern ? [] : [midt]),
        ...b.ankre.slice(1).map((x) => ({ ...x, ri: x.ri + na - 1 })),
      ];
      m.kurver[ia] = {
        ...a,
        id: ia,
        punkter: [...a.punkter, ...b.punkter.slice(2)],
        til: b.til,
        sisteRetning: b.sisteRetning,
        ankre,
      };
      m.kurver[ib] = null;
      endret = true;
      break;
    }
    if (!endret) return;
  }
}

/**
 * Parts in `fra` become part `til` (-1 removes them). Borders between parts
 * that are now the same disappear, and the curves left on each side of a
 * node that is no longer a meeting point are joined into one.
 */
export function omdop(m0: Vektormodell, fra: Set<number>, til: number): Vektormodell {
  const m = kopier(m0);
  const ny = (d: number) => (fra.has(d) ? til : d);
  m.kurver = m.kurver.map((k) => {
    if (!k) return null;
    const v = ny(k.venstre),
      h = ny(k.hoyre);
    return v === h ? null : { ...k, venstre: v, hoyre: h };
  });
  let areal = 0;
  for (const d of fra) areal += m.deler[d]?.areal ?? 0;
  const mal = til >= 0 ? m.deler[til] : null;
  if (mal) mal.areal = (fra.has(til) ? 0 : mal.areal) + areal;
  for (const d of fra) if (d !== til) m.deler[d] = null;
  slaSammenVedNoder(m);
  byggDelRinger(m);
  return m;
}

/** Merge parts: the largest keeps its colour. */
export function slaSammenDeler(m: Vektormodell, ider: number[]): Vektormodell {
  const deler = ider.map((i) => m.deler[i]).filter((d): d is Del => !!d);
  if (deler.length < 2) return m;
  const storst = deler.reduce((a, b) => (b.areal > a.areal ? b : a));
  return omdop(m, new Set(deler.map((d) => d.id)), storst.id);
}

export function slettDeler(m: Vektormodell, ider: number[]): Vektormodell {
  return omdop(m, new Set(ider), -1);
}

export function settFarge(m0: Vektormodell, ider: number[], farge: string): Vektormodell {
  const m = kopier(m0);
  for (const i of ider) if (m.deler[i]) m.deler[i]!.farge = farge;
  return m;
}

/** Every part of one colour gets another. */
export function byttFarge(m0: Vektormodell, fra: string, til: string): Vektormodell {
  const m = kopier(m0);
  for (const d of m.deler) if (d && d.farge === fra) d.farge = til;
  return m;
}

/** Moves the ends of a curve to where its nodes are now, handles along. */
function festEnder(k: Kurve, start: { x: number; y: number }, slutt: { x: number; y: number }): void {
  const flytt = (a: Anker, til: { x: number; y: number }) => {
    const dx = til.x - a.x,
      dy = til.y - a.y;
    a.x = til.x;
    a.y = til.y;
    if (a.inn) a.inn = [a.inn[0] + dx, a.inn[1] + dy];
    if (a.ut) a.ut = [a.ut[0] + dx, a.ut[1] + dy];
  };
  flytt(k.ankre[0]!, start);
  flytt(k.ankre[k.ankre.length - 1]!, slutt);
}

/**
 * Fits curves afresh from their traced pixels with other settings: the
 * simplify tool. The ends stay where they are now, so the neighbouring
 * curves still meet them.
 */
export function tilpassPaNytt(
  m0: Vektormodell,
  ider: number[],
  endring: Partial<Tilpasningsvalg>,
): Vektormodell {
  const m = kopier(m0);
  for (const id of ider) {
    const k = m.kurver[id];
    if (!k) continue;
    const start = { ...k.ankre[0]! },
      slutt = { ...k.ankre[k.ankre.length - 1]! };
    const valg = { ...k.valg, ...endring };
    if (k.lukket) {
      const t = tilpassKjede(k.punkter, true, valg);
      m.kurver[id] = { ...k, punkter: t.punkter, ankre: t.ankre, valg };
    } else {
      const t = tilpassKjede(k.punkter, false, valg);
      const ny = { ...k, punkter: t.punkter, ankre: t.ankre, valg };
      festEnder(ny, start, slutt);
      m.kurver[id] = ny;
    }
  }
  return m;
}

/** Simplify: a larger curve tolerance and fewer corners. Styrke 0–1. */
export function forenkle(m: Vektormodell, ider: number[], styrke: number): Vektormodell {
  const s = Math.max(0, Math.min(1, styrke));
  // mostly by tolerance: corners and straight sides should survive a simplify
  return tilpassPaNytt(m, ider, {
    kurveToleranse: 0.8 + s * 5,
    rettToleranse: 1 + s * 2,
    glatting: 1.2 + s * 1,
    hjorneVinkel: 55 + s * 15,
    hjorneSkala: 4 + s * 3,
  });
}

/** Every side between two corners becomes a straight line. */
export function gjorRett(m: Vektormodell, ider: number[]): Vektormodell {
  return tilpassPaNytt(m, ider, { beregnForm: true, rettToleranse: Infinity });
}

/** Curves only, no straight sides. */
export function gjorBuet(m: Vektormodell, ider: number[]): Vektormodell {
  return tilpassPaNytt(m, ider, { beregnForm: false });
}

/** The curves that start or end at a node. */
function vedNode(m: Vektormodell, node: number): Kurve[] {
  return m.kurver.filter((k): k is Kurve => !!k && !k.lukket && (k.fra === node || k.til === node));
}

/** Moves a point (and its handles); a node moves the ends of every curve that meets there. */
export function flyttAnker(
  m0: Vektormodell,
  kurveId: number,
  idx: number,
  x: number,
  y: number,
): Vektormodell {
  const m = kopier(m0);
  const k = m.kurver[kurveId];
  if (!k) return m0;
  const siste = k.ankre.length - 1;
  const flytt = (a: Anker) => {
    const dx = x - a.x,
      dy = y - a.y;
    a.x = x;
    a.y = y;
    if (a.inn) a.inn = [a.inn[0] + dx, a.inn[1] + dy];
    if (a.ut) a.ut = [a.ut[0] + dx, a.ut[1] + dy];
  };
  if ((idx === 0 || idx === siste) && !k.lukket) {
    const node = idx === 0 ? k.fra : k.til;
    for (const n of vedNode(m, node)) {
      if (n.fra === node) flytt(n.ankre[0]!);
      if (n.til === node) flytt(n.ankre[n.ankre.length - 1]!);
    }
  } else if (idx === 0 || idx === siste) {
    flytt(k.ankre[0]!);
    flytt(k.ankre[siste]!);
  } else flytt(k.ankre[idx]!);
  return m;
}

/** Moves a handle; on a smooth point the opposite handle turns with it. */
export function flyttHandtak(
  m0: Vektormodell,
  kurveId: number,
  idx: number,
  hvilken: 'inn' | 'ut',
  x: number,
  y: number,
  bryt = false,
): Vektormodell {
  const m = kopier(m0);
  const k = m.kurver[kurveId];
  if (!k) return m0;
  const a = k.ankre[idx];
  if (!a) return m0;
  a[hvilken] = [x, y];
  const siste = k.ankre.length - 1;
  // the opposite handle: on the same point, or across the start of a closed curve
  let motsatt: { a: Anker; side: 'inn' | 'ut' } | null = null;
  if (idx > 0 && idx < siste) motsatt = { a, side: hvilken === 'inn' ? 'ut' : 'inn' };
  else if (k.lukket)
    motsatt = idx === 0 ? { a: k.ankre[siste]!, side: 'inn' } : { a: k.ankre[0]!, side: 'ut' };
  if (motsatt && !a.hjorne && !bryt) {
    const h = motsatt.a[motsatt.side];
    const l = h ? Math.hypot(h[0] - a.x, h[1] - a.y) : Math.hypot(x - a.x, y - a.y);
    const v = Math.hypot(x - a.x, y - a.y) || 1;
    motsatt.a[motsatt.side] = [a.x - ((x - a.x) / v) * l, a.y - ((y - a.y) / v) * l];
  }
  if (bryt) {
    a.hjorne = true;
    if (k.lukket && (idx === 0 || idx === siste)) k.ankre[idx === 0 ? siste : 0]!.hjorne = true;
  }
  return m;
}

/** Sharp corner or smooth point; a smooth point gets its handles lined up. */
export function settAnkertype(m0: Vektormodell, kurveId: number, idx: number, hjorne: boolean): Vektormodell {
  const m = kopier(m0);
  const k = m.kurver[kurveId];
  const a = k?.ankre[idx];
  if (!k || !a) return m0;
  a.hjorne = hjorne;
  if (!hjorne && a.inn && a.ut && idx > 0 && idx < k.ankre.length - 1) {
    const ri = Math.hypot(a.inn[0] - a.x, a.inn[1] - a.y);
    const ru = Math.hypot(a.ut[0] - a.x, a.ut[1] - a.y);
    const d = [a.ut[0] - a.inn[0], a.ut[1] - a.inn[1]];
    const l = Math.hypot(d[0]!, d[1]!) || 1;
    a.inn = [a.x - (d[0]! / l) * ri, a.y - (d[1]! / l) * ri];
    a.ut = [a.x + (d[0]! / l) * ru, a.y + (d[1]! / l) * ru];
  }
  return m;
}

/** Removes an inner point; the two segments either side become one, fitted to the traced pixels. */
export function slettAnker(m0: Vektormodell, kurveId: number, idx: number): Vektormodell {
  const m = kopier(m0);
  const k = m.kurver[kurveId];
  if (!k || idx <= 0 || idx >= k.ankre.length - 1) return m0;
  const a = k.ankre[idx - 1]!,
    b = k.ankre[idx + 1]!;
  const rett = !a.ut && !b.inn && !k.ankre[idx]!.inn && !k.ankre[idx]!.ut;
  k.ankre.splice(idx, 1);
  if (rett) return m;
  const raa: P[] = [];
  for (let i = 0; i < k.punkter.length; i += 2) raa.push([k.punkter[i]!, k.punkter[i + 1]!]);
  const sm = glattPunkter(raa, k.valg.glatting, k.lukket);
  const n = sm.length;
  const data: P[] = [[a.x, a.y]];
  const slutt = b.ri <= a.ri && k.lukket ? b.ri + n : b.ri;
  for (let i = a.ri + 1; i < slutt; i++) data.push(sm[i % n]!);
  data.push([b.x, b.y]);
  const t1: P = a.ut ? [a.ut[0] - a.x, a.ut[1] - a.y] : [b.x - a.x, b.y - a.y];
  const t2: P = b.inn ? [b.inn[0] - b.x, b.inn[1] - b.y] : [a.x - b.x, a.y - b.y];
  const [enkel] = tilpassSpenn(data, t1, t2, Infinity);
  if (enkel) {
    a.ut = enkel[1];
    b.inn = enkel[2];
  }
  return m;
}

function delCasteljau(p0: P, p1: P, p2: P, p3: P, t: number): [P, P, P, P, P] {
  const l = (a: P, b: P): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = l(p0, p1),
    b = l(p1, p2),
    c = l(p2, p3);
  const d = l(a, b),
    e = l(b, c);
  return [a, d, l(d, e), e, c];
}

/** Adds a point on segment `seg` at parameter t, without changing the shape. */
export function leggTilAnker(m0: Vektormodell, kurveId: number, seg: number, t: number): Vektormodell {
  const m = kopier(m0);
  const k = m.kurver[kurveId];
  if (!k) return m0;
  const a = k.ankre[seg],
    b = k.ankre[seg + 1];
  if (!a || !b) return m0;
  const ri = Math.round(a.ri + (b.ri - a.ri) * t);
  if (!a.ut && !b.inn) {
    k.ankre.splice(seg + 1, 0, {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      inn: null,
      ut: null,
      hjorne: true,
      ri,
    });
    return m;
  }
  const p0: P = [a.x, a.y],
    p3: P = [b.x, b.y];
  const [h1, inn, midt, ut, h2] = delCasteljau(p0, a.ut ?? p0, b.inn ?? p3, p3, t);
  a.ut = h1;
  b.inn = h2;
  k.ankre.splice(seg + 1, 0, { x: midt[0], y: midt[1], inn, ut, hjorne: false, ri });
  return m;
}

// ---------------------------------------------------------------- picking

/** Points along a curve, a few per segment, for hit testing and area selection. */
export function utvalgspunkter(k: Kurve, perSegment = 8): P[] {
  const ut: P[] = [];
  for (let i = 0; i + 1 < k.ankre.length; i++) {
    const a = k.ankre[i]!,
      b = k.ankre[i + 1]!;
    const p0: P = [a.x, a.y],
      p3: P = [b.x, b.y];
    const p1 = a.ut ?? p0,
      p2 = b.inn ?? p3;
    const steg = a.ut || b.inn ? perSegment : 1;
    for (let s = 0; s < steg; s++) {
      const t = s / steg,
        u = 1 - t;
      ut.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  const s = k.ankre[k.ankre.length - 1];
  if (s) ut.push([s.x, s.y]);
  return ut;
}

/** The curve nearest to a point, within `maks`; with the segment and parameter. */
export function naermesteKurve(
  m: Vektormodell,
  x: number,
  y: number,
  maks: number,
): { kurve: number; seg: number; t: number; avstand: number } | null {
  let beste: { kurve: number; seg: number; t: number; avstand: number } | null = null;
  for (const k of m.kurver) {
    if (!k) continue;
    for (let i = 0; i + 1 < k.ankre.length; i++) {
      const a = k.ankre[i]!,
        b = k.ankre[i + 1]!;
      if (
        Math.min(a.x, b.x, a.ut?.[0] ?? a.x, b.inn?.[0] ?? b.x) - maks > x ||
        Math.max(a.x, b.x, a.ut?.[0] ?? a.x, b.inn?.[0] ?? b.x) + maks < x ||
        Math.min(a.y, b.y, a.ut?.[1] ?? a.y, b.inn?.[1] ?? b.y) - maks > y ||
        Math.max(a.y, b.y, a.ut?.[1] ?? a.y, b.inn?.[1] ?? b.y) + maks < y
      )
        continue;
      const p0: P = [a.x, a.y],
        p3: P = [b.x, b.y],
        p1 = a.ut ?? p0,
        p2 = b.inn ?? p3;
      const steg = a.ut || b.inn ? 24 : 1;
      let q = p0;
      for (let s = 1; s <= steg; s++) {
        const t = s / steg,
          u = 1 - t;
        const r: P = [
          u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ];
        const d = avstandSegment([x, y], q, r);
        if (d <= maks && (!beste || d < beste.avstand)) {
          // parameter of the nearest spot on this little piece
          const ab: P = [r[0] - q[0], r[1] - q[1]];
          const l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
          const f = Math.max(0, Math.min(1, ((x - q[0]) * ab[0] + (y - q[1]) * ab[1]) / l2));
          beste = { kurve: k.id, seg: i, t: (s - 1 + f) / steg, avstand: d };
        }
        q = r;
      }
    }
  }
  return beste;
}

/** Curves lying mostly inside a rectangle: the «simplify area» selection. */
export function kurverIOmrade(
  m: Vektormodell,
  r: { x0: number; y0: number; x1: number; y1: number },
  andel = 0.5,
): number[] {
  const x0 = Math.min(r.x0, r.x1),
    x1 = Math.max(r.x0, r.x1),
    y0 = Math.min(r.y0, r.y1),
    y1 = Math.max(r.y0, r.y1);
  const ut: number[] = [];
  for (const k of m.kurver) {
    if (!k) continue;
    const pts = utvalgspunkter(k, 4);
    let inne = 0;
    for (const p of pts) if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) inne++;
    if (inne / pts.length >= andel) ut.push(k.id);
  }
  return ut;
}

/** The parts on either side of the given curves. */
export function delerVed(m: Vektormodell, kurveIder: number[]): number[] {
  const s = new Set<number>();
  for (const id of kurveIder) {
    const k = m.kurver[id];
    if (!k) continue;
    if (k.venstre >= 0) s.add(k.venstre);
    if (k.hoyre >= 0) s.add(k.hoyre);
  }
  return [...s];
}

/** The curves around the given parts. */
export function kurverRundt(m: Vektormodell, delIder: number[]): number[] {
  const s = new Set(delIder);
  return m.kurver.filter((k): k is Kurve => !!k && (s.has(k.venstre) || s.has(k.hoyre))).map((k) => k.id);
}

/**
 * Levels straight segments that are nearly horizontal or vertical (within
 * `grader`): both ends get their mean y (or x). Ends that are nodes move
 * for every curve that meets there, so neighbours follow.
 */
export function vater(m0: Vektormodell, ider: number[], grader = 3): Vektormodell {
  let m = m0;
  const grense = Math.tan((grader * Math.PI) / 180);
  for (const id of ider) {
    const antall = m.kurver[id]?.ankre.length ?? 0;
    for (let i = 0; i + 1 < antall; i++) {
      const k = m.kurver[id]!;
      const a = k.ankre[i]!,
        b = k.ankre[i + 1]!;
      if (a.ut || b.inn) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      if (Math.abs(dx) > 1e-9 && Math.abs(dy / dx) <= grense && dy !== 0) {
        const y = (a.y + b.y) / 2;
        m = flyttAnker(m, id, i, a.x, y);
        m = flyttAnker(m, id, i + 1, m.kurver[id]!.ankre[i + 1]!.x, y);
      } else if (Math.abs(dy) > 1e-9 && Math.abs(dx / dy) <= grense && dx !== 0) {
        const x = (a.x + b.x) / 2;
        m = flyttAnker(m, id, i, x, a.y);
        m = flyttAnker(m, id, i + 1, x, m.kurver[id]!.ankre[i + 1]!.y);
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------- drawn fields

/** Fills the pixels whose centres lie inside the rings (even-odd) with `verdi`. */
export function fyllRinger(e: Int32Array, w: number, h: number, ringer: P[][], verdi: number): number {
  let antall = 0;
  let y0 = h,
    y1 = 0;
  for (const r of ringer)
    for (const p of r) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
  const fra = Math.max(0, Math.floor(y0)),
    til = Math.min(h - 1, Math.ceil(y1));
  for (let y = fra; y <= til; y++) {
    const yc = y + 0.5;
    const kryss: number[] = [];
    for (const r of ringer) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i]!,
          b = r[(i + 1) % r.length]!;
        if (a[1] <= yc === b[1] <= yc) continue;
        kryss.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    kryss.sort((a, b) => a - b);
    for (let i = 0; i + 1 < kryss.length; i += 2) {
      const xa = Math.max(0, Math.ceil(kryss[i]! - 0.5)),
        xb = Math.min(w - 1, Math.ceil(kryss[i + 1]! - 0.5) - 1);
      for (let x = xa; x <= xb; x++) {
        e[y * w + x] = verdi;
        antall++;
      }
    }
  }
  return antall;
}

/** The pixel rings of a part, from the traced points of its curves. */
function pikselringer(m: Vektormodell, del: Del): P[][] {
  return del.ringer.map((ring) => {
    const pts: P[] = [];
    for (const b of ring) {
      const k = m.kurver[b.kjede];
      if (!k) continue;
      const n = k.punkter.length / 2;
      for (let s = 0; s < n; s++) {
        const i = b.bakover ? n - 1 - s : s;
        pts.push([k.punkter[i * 2]!, k.punkter[i * 2 + 1]!]);
      }
    }
    return pts;
  });
}

/** The label image the model was traced from, merges and removals included. */
export function etikettbilde(m: Vektormodell): Int32Array {
  const e = new Int32Array(m.bredde * m.hoyde).fill(-1);
  for (const d of m.deler) if (d) fyllRinger(e, m.bredde, m.hoyde, pikselringer(m, d), d.id);
  return e;
}

function snuPunkter(p: number[]): number[] {
  const ut: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) ut.push(p[i]!, p[i + 1]!);
  return ut;
}

/** A stable key for a traced chain: its points, or for a closed one its points from the smallest. */
function kjedenokkel(punkter: number[], lukket: boolean): string {
  if (!lukket) return punkter.join(',');
  const n = punkter.length / 2;
  let s = 0;
  for (let i = 1; i < n; i++) {
    const y = punkter[i * 2 + 1]!,
      x = punkter[i * 2]!;
    const sy = punkter[s * 2 + 1]!,
      sx = punkter[s * 2]!;
    if (y < sy || (y === sy && x < sx)) s = i;
  }
  const ut: number[] = [];
  for (let i = 0; i < n; i++) ut.push(punkter[((s + i) % n) * 2]!, punkter[((s + i) % n) * 2 + 1]!);
  return `o${ut.join(',')}`;
}

/**
 * A field the user drew with the pen becomes a new part (Sivert,
 * 2026-11-09: «penneverktøy likt som illustrator … tegne inn felt selv som
 * man kan slå sammen med»). It is laid over the traced pixels and the map is
 * traced again, so the field shares its borders with the parts it touches
 * like every other part does. Borders the field does not touch keep their
 * curves exactly as they were, edits included; borders it touches are
 * fitted afresh. Returns the model unchanged and -1 when the field covers
 * no pixel.
 */
export function leggTilFelt(
  m0: Vektormodell,
  omriss: P[],
  farge: string,
): { modell: Vektormodell; id: number } {
  const w = m0.bredde,
    h = m0.hoyde;
  const e = etikettbilde(m0);
  const nyId = m0.deler.length;
  if (!fyllRinger(e, w, h, [omriss], nyId)) return { modell: m0, id: -1 };
  const gamle = new Map<string, Kurve>();
  let valg = STANDARD_TILPASNING;
  for (const k of m0.kurver) {
    if (!k) continue;
    valg = k.valg;
    gamle.set(`${kjedenokkel(k.punkter, k.lukket)}|${k.venstre}|${k.hoyre}`, k);
  }
  const kjeder = finnKjeder(e, w, h);
  const noder = new Map<number, { x: number; y: number }>();
  const nye: number[] = [];
  const kurver: Kurve[] = kjeder.map((kj, id) => {
    const grunn = {
      id,
      lukket: kj.lukket,
      fra: kj.fra,
      til: kj.til,
      venstre: kj.venstre,
      hoyre: kj.hoyre,
      forsteRetning: kj.forsteRetning,
      sisteRetning: kj.sisteRetning,
    };
    const rett = gamle.get(`${kjedenokkel(kj.punkter, kj.lukket)}|${kj.venstre}|${kj.hoyre}`);
    const snudd = rett
      ? null
      : gamle.get(`${kjedenokkel(snuPunkter(kj.punkter), kj.lukket)}|${kj.hoyre}|${kj.venstre}`);
    const gammel = rett ?? (snudd ? snu(snudd) : null);
    if (gammel && (kj.lukket || kj.punkter.join(',') === gammel.punkter.join(','))) {
      const k: Kurve = {
        ...grunn,
        punkter: gammel.punkter,
        ankre: structuredClone(gammel.ankre),
        valg: gammel.valg,
      };
      if (!k.lukket) {
        noder.set(k.fra, { x: k.ankre[0]!.x, y: k.ankre[0]!.y });
        const s = k.ankre[k.ankre.length - 1]!;
        noder.set(k.til, { x: s.x, y: s.y });
      }
      return k;
    }
    nye.push(id);
    const t = tilpassKjede(kj.punkter, kj.lukket, valg);
    return { ...grunn, punkter: t.punkter, ankre: t.ankre, valg: { ...valg } };
  });
  // new borders end exactly where the kept borders they meet end
  for (const id of nye) {
    const k = kurver[id]!;
    if (k.lukket) continue;
    const a = k.ankre[0]!,
      b = k.ankre[k.ankre.length - 1]!;
    festEnder(k, noder.get(k.fra) ?? { x: a.x, y: a.y }, noder.get(k.til) ?? { x: b.x, y: b.y });
  }
  const areal = new Map<number, number>();
  for (const v of e) if (v >= 0) areal.set(v, (areal.get(v) ?? 0) + 1);
  const deler: (Del | null)[] = [
    ...m0.deler.map((d) => (d ? { ...d } : null)),
    { id: nyId, farge, areal: 0, ringer: [] },
  ];
  for (const d of deler) {
    if (!d) continue;
    const a = areal.get(d.id) ?? 0;
    if (!a) deler[d.id] = null;
    else d.areal = a;
  }
  const m: Vektormodell = { bredde: w, hoyde: h, kurver, deler };
  byggDelRinger(m);
  const ut = ryddFlate(m);
  return { modell: ut, id: ut.deler[nyId] ? nyId : -1 };
}

/** Points along a closed pen path (anchors with handles), for filling. */
export function pennepunkter(ankre: Anker[], perSegment = 24): P[] {
  const ut: P[] = [];
  const n = ankre.length;
  for (let i = 0; i < n; i++) {
    const a = ankre[i]!,
      b = ankre[(i + 1) % n]!;
    const p0: P = [a.x, a.y],
      p3: P = [b.x, b.y];
    const p1 = a.ut ?? p0,
      p2 = b.inn ?? p3;
    const steg = a.ut || b.inn ? perSegment : 1;
    for (let s = 0; s < steg; s++) {
      const t = s / steg,
        u = 1 - t;
      ut.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  return ut;
}
