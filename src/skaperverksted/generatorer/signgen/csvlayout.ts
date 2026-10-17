/**
 * Rule-driven layout for CSV signs (Sivert, 2026-10-16).
 *
 * Every sign is built from the same unchanged master, never from the sign before it. The name is
 * measured first (its real letters, in the real font); then everything else is placed by rules that
 * hold a reference in the master, so a longer name makes a wider sign instead of a squeezed or
 * overlapping one:
 *
 *  1. Text that belongs together keeps its gaps (`gruppeavstander`): first and last name, a symbol in
 *     front of the name. The group keeps its centre and grows from the middle.
 *  2. Holes, decorations and other free objects hold a distance to the name (`Anker`): on a side with a
 *     fixed gap, centred over or under it, or in the same place along it when they overlap it on purpose.
 *  3. A plate round the name (a rectangle or an ellipse in a plain layer) is a body: each of its edges
 *     moves as far as the content (name and what is anchored to it) moved on that side, so the margins
 *     of the master stay, and so does the distance from a hole to the edge. Height stays unless the
 *     name needs more.
 *  4. After the layout, intended overlaps in the master stay and unintended ones are reported.
 *
 * Nothing here shrinks text, scales the whole design or moves things by percentages.
 */
import { finnLag, objekterILag, type Dokument, type FormKilde, type Objekt } from '../../core/dokument';
import { erTom, slaSammen, tomBoks, type Boks, type Vec2 } from '../../core/geometri2d';
import { feltNavn, oppdaterObjekter } from './dokument';
import { blekkBoks, fotavtrykkBoks, lokalGeometri, verdensBoks } from './modell';

// ---------- spacing inside a group ----------

/**
 * The gap between texts (and vectors) that belong together is a rule:
 * measured on the master sign and kept on every sign, so first and last
 * name sit the same distance apart whatever the names are (Sivert,
 * 2026-10-05). The group keeps its centre, so it grows from the middle.
 *
 * Texts that sit side by side (or stacked) form a group whether they are in
 * one text layer or in several. Side by side, the gap is the visible one,
 * from the last letter to the next text's first letter; stacked, it is the
 * gap between the lines, so the baselines keep a steady pitch whatever
 * ascenders and descenders the names have.
 */
export interface Gruppeavstand {
  /** The text layer of the first object. */
  lagId: string;
  akse: 'x' | 'y';
  /** The group's objects in reading order: left to right, or top to bottom. */
  ider: string[];
  /** Gap before each object after the first (mm). */
  gap: number[];
  /** The group's centre along the axis (mm). */
  senter: number;
}

/** Gaps below this are overlaps, not spacing (mm). */
const MIN_GAP = -2;

/** What gaps are measured on: the printed letters across, the line boxes down. */
function gruppeboks(o: Objekt): Boks {
  const ink = blekkBoks(o);
  const linje = verdensBoks(o);
  return { minX: ink.minX, maksX: ink.maksX, minY: linje.minY, maksY: linje.maksY };
}

interface Medlem {
  o: Objekt;
  b: Boks;
}

/** Along the axis: the gap between two boxes (negative when they overlap). */
function langsAkse(akse: 'x' | 'y', a: Boks, b: Boks): number {
  return akse === 'x'
    ? Math.max(a.minX - b.maksX, b.minX - a.maksX)
    : Math.max(a.minY - b.maksY, b.minY - a.maksY);
}

/** Across the axis: how far the boxes overlap (side by side: in height; stacked: in width). */
function tversAvAkse(akse: 'x' | 'y', a: Boks, b: Boks): number {
  return akse === 'x'
    ? Math.min(a.maksY, b.maksY) - Math.max(a.minY, b.minY)
    : Math.min(a.maksX, b.maksX) - Math.max(a.minX, b.minX);
}

/** The objects a gap rule can hold: text and vectors in the visible text layers. */
function gruppemedlemmer(master: Dokument): Medlem[] {
  const ut: Medlem[] = [];
  for (const lag of master.lag) {
    if (!lag.tekstlag || !lag.synlig) continue;
    for (const o of objekterILag(master, lag.id)) {
      if (o.synlig && o.operasjon === 'legg-til' && o.kilde.type !== 'form') ut.push({ o, b: gruppeboks(o) });
    }
  }
  return ut;
}

export function gruppeavstander(master: Dokument): Gruppeavstand[] {
  const ut: Gruppeavstand[] = [];
  const brukt = new Set<string>();
  // rows first: a text with something beside it belongs to the row, not to a stack
  for (const akse of ['x', 'y'] as const) {
    const frie = gruppemedlemmer(master).filter((m) => !brukt.has(m.o.id));
    const forelder = frie.map((_, i) => i);
    const rot = (i: number): number => {
      while (forelder[i] !== i) {
        forelder[i] = forelder[forelder[i]!]!;
        i = forelder[i]!;
      }
      return i;
    };
    for (let i = 0; i < frie.length; i++) {
      for (let j = i + 1; j < frie.length; j++) {
        const a = frie[i]!.b;
        const b = frie[j]!.b;
        // next to each other along the axis, and level with each other across it
        if (langsAkse(akse, a, b) >= MIN_GAP && tversAvAkse(akse, a, b) > -MIN_GAP) forelder[rot(i)] = rot(j);
      }
    }
    const grupper = new Map<number, Medlem[]>();
    frie.forEach((m, i) => grupper.set(rot(i), [...(grupper.get(rot(i)) ?? []), m]));
    for (const g of grupper.values()) {
      // only worth a rule when something in the group varies from sign to sign
      if (g.length < 2 || !g.some((m) => feltNavn(m.o))) continue;
      const sortert = [...g].sort((a, b) => (akse === 'x' ? a.b.minX - b.b.minX : b.b.maksY - a.b.maksY));
      const gap = sortert.slice(1).map((m, i) => langsAkse(akse, sortert[i]!.b, m.b));
      if (!gap.every((v) => v >= MIN_GAP)) continue;
      const fra = Math.min(...g.map((m) => (akse === 'x' ? m.b.minX : m.b.minY)));
      const til = Math.max(...g.map((m) => (akse === 'x' ? m.b.maksX : m.b.maksY)));
      for (const m of g) brukt.add(m.o.id);
      ut.push({
        lagId: sortert[0]!.o.lagId,
        akse,
        ider: sortert.map((m) => m.o.id),
        gap,
        senter: (fra + til) / 2,
      });
    }
  }
  return ut;
}

/** Lay a group out again with its measured gaps, around its centre. */
export function brukGruppeavstand(dok: Dokument, regler: Gruppeavstand[]): Dokument {
  let d = dok;
  for (const r of regler) {
    // a hidden member (a decoration left out) takes no room and leaves no gap
    const med = r.ider
      .map((id, i) => ({ o: d.objekter[id], foran: i > 0 ? r.gap[i - 1]! : 0 }))
      .filter((m): m is { o: Objekt; foran: number } => !!m.o && m.o.synlig);
    if (med.length < 2) continue;
    const bokser = med.map((m) => gruppeboks(m.o));
    const storrelse = bokser.map((b) => (r.akse === 'x' ? b.maksX - b.minX : b.maksY - b.minY));
    const total = storrelse.reduce((a, v) => a + v, 0) + med.slice(1).reduce((a, m) => a + m.foran, 0);
    let pos = r.akse === 'x' ? r.senter - total / 2 : r.senter + total / 2;
    const flytt = new Map<string, number>();
    med.forEach((m, i) => {
      const b = bokser[i]!;
      if (r.akse === 'x') {
        if (i > 0) pos += m.foran;
        flytt.set(m.o.id, pos - b.minX);
        pos += storrelse[i]!;
      } else {
        if (i > 0) pos -= m.foran;
        flytt.set(m.o.id, pos - b.maksY);
        pos -= storrelse[i]!;
      }
    });
    d = oppdaterObjekter(d, [...flytt.keys()], (o) => {
      const v = flytt.get(o.id)!;
      return Math.abs(v) < 1e-9
        ? o
        : { ...o, transform: { ...o.transform, [r.akse]: o.transform[r.akse] + v } };
    });
  }
  return d;
}

// ---------- the name ----------

/** The box of everything that makes up the name: the printed letters across, the lines down. */
export function navneboks(dok: Dokument): Boks | null {
  let b = tomBoks();
  for (const m of gruppemedlemmer(dok)) b = slaSammen(b, m.b);
  return erTom(b) ? null : b;
}

// ---------- bodies, and who follows the name ----------

export type Hullside = 'venstre' | 'hoyre' | 'topp' | 'bunn';
export type Plassvalg = 'auto' | 'navn' | 'fast';

/** The setting an object has: its own, or the one a hanging hole carried before every object had one. */
export function plassFor(o: Objekt): Plassvalg {
  if (o.plass) return o.plass;
  if (o.kilde.type === 'form' && o.kilde.form === 'hull' && o.kilde.plass) return o.kilde.plass;
  return 'auto';
}

/** Text and vectors in a text layer are placed by the gap rules, not anchored one by one. */
function erGruppemedlem(dok: Dokument, o: Objekt): boolean {
  return !!finnLag(dok, o.lagId)?.tekstlag && o.operasjon === 'legg-til' && o.kilde.type !== 'form';
}

/** How much of the name a box covers (0–1). */
function dekning(navn: Boks, b: Boks): number {
  const flate = (navn.maksX - navn.minX) * (navn.maksY - navn.minY);
  const w = Math.min(navn.maksX, b.maksX) - Math.max(navn.minX, b.minX);
  const h = Math.min(navn.maksY, b.maksY) - Math.max(navn.minY, b.minY);
  return flate > 0 && w > 0 && h > 0 ? (w * h) / flate : 0;
}

/**
 * The bodies of the sign: shapes and vectors in plain layers that carry the name (a plate, a frame). A
 * text on a plate is an intended overlap; the plate is not something the name is next to.
 */
export function kropper(dok: Dokument): Objekt[] {
  const n = navneboks(dok);
  if (!n) return [];
  return Object.values(dok.objekter).filter(
    (o) =>
      o.synlig &&
      o.operasjon === 'legg-til' &&
      ((o.kilde.type === 'form' && o.kilde.form !== 'hull') || o.kilde.type === 'svg') &&
      !finnLag(dok, o.lagId)?.tekstlag &&
      dekning(n, verdensBoks(o)) >= 0.5,
  );
}

/** A rectangle or an ellipse can be made wider and narrower without changing its character. */
export function kanTilpasses(o: Objekt): boolean {
  return (
    o.kilde.type === 'form' &&
    (o.kilde.form === 'rektangel' || o.kilde.form === 'ellipse') &&
    Math.abs(o.transform.rotasjon) < 1e-6 &&
    plassFor(o) !== 'fast'
  );
}

/** Some body cannot change size (a frame, a polygon, a plate set to «Fast plass»): then nothing is moved on its account. */
export function kropperFaste(dok: Dokument): boolean {
  return kropper(dok).some((o) => !kanTilpasses(o));
}

/** Can the object be anchored to the name at all? Not the name's own group, not a body. */
export function kanForankres(dok: Dokument, o: Objekt): boolean {
  if (o.kilde.type === 'tekst' || erGruppemedlem(dok, o)) return false;
  return !kropper(dok).some((k) => k.id === o.id);
}

/**
 * Does the object follow the name? Its own setting wins. Automatically it does, unless a body round the
 * name cannot change size: a fixed plate or frame keeps its objects where they are.
 */
export function folgerNavnet(dok: Dokument, o: Objekt, tilpass = true): boolean {
  if (!kanForankres(dok, o)) return false;
  const valg = plassFor(o);
  return valg === 'auto' ? tilpass && !kropperFaste(dok) : valg === 'navn';
}

export interface Hullanker {
  id: string;
  side: Hullside;
  /** Clear distance from the name's box to the object's edge on that side (mm, negative = overlap). */
  gap: number;
  /** How far the object's centre lies from the name's centre across that side (mm). */
  tvers: number;
  /**
   * The object overlaps the name on purpose: it keeps its place along the name, measured from its left
   * edge, its centre or its right edge, whichever it is nearest.
   */
  innvendig?: { ref: 'venstre' | 'midt' | 'hoyre'; dx: number };
}

/** Where an object lies in relation to the name: the side it is furthest out on, its gap and its place across. */
export function hullanker(dok: Dokument, o: Objekt): Hullanker | null {
  const n = navneboks(dok);
  if (!n) return null;
  const h = verdensBoks(o);
  if (erTom(h)) return null;
  const hx = (h.minX + h.maksX) / 2,
    hy = (h.minY + h.maksY) / 2;
  const kandidater: { side: Hullside; gap: number }[] = [
    { side: 'venstre', gap: n.minX - h.maksX },
    { side: 'hoyre', gap: h.minX - n.maksX },
    { side: 'topp', gap: h.minY - n.maksY },
    { side: 'bunn', gap: n.minY - h.maksY },
  ];
  // the side the object lies furthest out on
  const best = kandidater.reduce((a, b) => (b.gap > a.gap ? b : a));
  const vannrett = best.side === 'venstre' || best.side === 'hoyre';
  const ncx = (n.minX + n.maksX) / 2,
    ncy = (n.minY + n.maksY) / 2;
  const anker: Hullanker = {
    id: o.id,
    side: best.side,
    gap: best.gap,
    tvers: vannrett ? hy - ncy : hx - ncx,
  };
  // mostly on the name: it keeps its place along the name instead of a gap to it
  if (best.gap < -Math.min(h.maksX - h.minX, h.maksY - h.minY) / 2) {
    const tredjedel = (n.maksX - n.minX) / 3;
    const ref = hx < n.minX + tredjedel ? 'venstre' : hx > n.maksX - tredjedel ? 'hoyre' : 'midt';
    const x = ref === 'venstre' ? n.minX : ref === 'hoyre' ? n.maksX : ncx;
    return { ...anker, tvers: hy - ncy, innvendig: { ref, dx: hx - x } };
  }
  return anker;
}

/** Move objects to their references from the name of this sign. */
function brukAnkre(dok: Dokument, ankre: Hullanker[]): Dokument {
  const n = navneboks(dok);
  if (!n || !ankre.length) return dok;
  let d = dok;
  const cx = (n.minX + n.maksX) / 2,
    cy = (n.minY + n.maksY) / 2;
  for (const a of ankre) {
    const o = d.objekter[a.id];
    if (!o) continue;
    const h = verdensBoks(o);
    if (erTom(h)) continue;
    const hcx = (h.minX + h.maksX) / 2,
      hcy = (h.minY + h.maksY) / 2;
    let dx = 0,
      dy = 0;
    if (a.innvendig) {
      const x = a.innvendig.ref === 'venstre' ? n.minX : a.innvendig.ref === 'hoyre' ? n.maksX : cx;
      dx = x + a.innvendig.dx - hcx;
      dy = cy + a.tvers - hcy;
    } else {
      if (a.side === 'venstre') dx = n.minX - a.gap - h.maksX;
      else if (a.side === 'hoyre') dx = n.maksX + a.gap - h.minX;
      else if (a.side === 'topp') dy = n.maksY + a.gap - h.minY;
      else dy = n.minY - a.gap - h.maksY;
      if (a.side === 'venstre' || a.side === 'hoyre') dy = cy + a.tvers - hcy;
      else dx = cx + a.tvers - hcx;
    }
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
    d = oppdaterObjekter(d, [o.id], (x) => ({
      ...x,
      transform: { ...x.transform, x: x.transform.x + dx, y: x.transform.y + dy },
    }));
  }
  return d;
}

/** Move an object so it lies `gap` mm from the name on the side it is on (the inspector's distance field). */
export function settHullavstand(dok: Dokument, id: string, gap: number): Dokument {
  const o = dok.objekter[id];
  const a = o && hullanker(dok, o);
  return a && !a.innvendig ? brukAnkre(dok, [{ ...a, gap }]) : dok;
}

// ---------- the rules of a master ----------

export interface Layoutregler {
  /** All bodies of the master (ids), also those that cannot change size: the name must stay inside them. */
  kropperAlle: string[];
  /** The objects that follow the name, with their references. */
  ankre: Hullanker[];
  /** The bodies that change size with the content (ids). Empty when a body is fixed. */
  kropper: string[];
  /** The master's content: the name and what follows it. Null without a name. */
  innhold: Boks | null;
}

export const INGEN_LAYOUT: Layoutregler = { kropperAlle: [], ankre: [], kropper: [], innhold: null };

function synligeBokser(dok: Dokument, ids: readonly string[]): Boks {
  let b = tomBoks();
  for (const id of ids) {
    const o = dok.objekter[id];
    if (o?.synlig) b = slaSammen(b, verdensBoks(o));
  }
  return b;
}

/**
 * Read the rules off the master: who follows the name, which bodies change size, and the content the
 * bodies were drawn round. `tilpass` false is the old behaviour: bodies keep their size, and so does
 * everything that sits on them.
 */
export function layoutregler(master: Dokument, tilpass = true): Layoutregler {
  const n = navneboks(master);
  if (!n) return INGEN_LAYOUT;
  const fast = !tilpass || kropperFaste(master);
  const ankre: Hullanker[] = [];
  for (const o of Object.values(master.objekter)) {
    if (!folgerNavnet(master, o, tilpass)) continue;
    const a = hullanker(master, o);
    if (a) ankre.push(a);
  }
  const innhold = slaSammen(
    n,
    synligeBokser(
      master,
      ankre.map((a) => a.id),
    ),
  );
  const alle = kropper(master).map((o) => o.id);
  return {
    kropperAlle: alle,
    ankre,
    kropper: fast ? [] : alle,
    innhold: erTom(innhold) ? n : innhold,
  };
}

const senter = (b: Boks): Vec2 => ({ x: (b.minX + b.maksX) / 2, y: (b.minY + b.maksY) / 2 });

/** The largest (x/a)² + (y/b)² of the corners of a box round an ellipse centre: 1 is on the edge. */
function ellipseFyll(innhold: Boks, c: Vec2, a: number, b: number): number {
  let f = 0;
  for (const x of [innhold.minX, innhold.maksX]) {
    for (const y of [innhold.minY, innhold.maksY]) {
      f = Math.max(f, ((x - c.x) / a) ** 2 + ((y - c.y) / b) ** 2);
    }
  }
  return f;
}

/** Give a body the box it should have: its width and height, kept in its own scale, and its centre. */
function settBoks(o: Objekt, fra: Boks, til: Boks): Objekt {
  const k = o.kilde as FormKilde;
  const sx = Math.abs(o.transform.skalaX) || 1;
  const sy = Math.abs(o.transform.skalaY) || 1;
  const c0 = senter(fra);
  const c1 = senter(til);
  return {
    ...o,
    kilde: { ...k, bredde: (til.maksX - til.minX) / sx, hoyde: (til.maksY - til.minY) / sy },
    transform: { ...o.transform, x: o.transform.x + c1.x - c0.x, y: o.transform.y + c1.y - c0.y },
  };
}

/** Never narrower than this (mm): a plate must stay a plate. */
const MIN_KROPPBREDDE = 1;

/**
 * Let the bodies follow the content. Each edge moves as far as the content moved on that side; the
 * height only grows. An ellipse is widened further when the corners of the name would leave it, so it
 * is never tighter round the name than the master was.
 */
function tilpassKropper(dok: Dokument, regler: Layoutregler): Dokument {
  const n = navneboks(dok);
  if (!n || !regler.innhold || !regler.kropper.length) return dok;
  const c0 = regler.innhold;
  const c1 = slaSammen(
    n,
    synligeBokser(
      dok,
      regler.ankre.map((a) => a.id),
    ),
  );
  if (erTom(c1)) return dok;
  let d = dok;
  for (const id of regler.kropper) {
    const o = d.objekter[id];
    if (!o) continue;
    const e0 = verdensBoks(o);
    let ny: Boks = {
      minX: e0.minX + (c1.minX - c0.minX),
      maksX: e0.maksX + (c1.maksX - c0.maksX),
      minY: e0.minY - Math.max(0, c0.minY - c1.minY),
      maksY: e0.maksY + Math.max(0, c1.maksY - c0.maksY),
    };
    if (ny.maksX - ny.minX < MIN_KROPPBREDDE) continue;
    if (o.kilde.type === 'form' && o.kilde.form === 'ellipse') {
      const f0 = ellipseFyll(c0, senter(e0), (e0.maksX - e0.minX) / 2, (e0.maksY - e0.minY) / 2);
      const c = senter(ny);
      const b = (ny.maksY - ny.minY) / 2;
      const passer = (a: number) => ellipseFyll(c1, c, a, b) <= f0 + 1e-9;
      let lav = (ny.maksX - ny.minX) / 2;
      if (!passer(lav)) {
        let hoy = lav * 4 + 50;
        for (let i = 0; i < 30; i++) {
          const mid = (lav + hoy) / 2;
          if (passer(mid)) hoy = mid;
          else lav = mid;
        }
        ny = { ...ny, minX: c.x - hoy, maksX: c.x + hoy };
      }
    }
    d = oppdaterObjekter(d, [id], (x) => settBoks(x, e0, ny));
  }
  return d;
}

/** Apply the rules of the master to one sign, after its text has been laid out. */
export function brukLayout(dok: Dokument, regler: Layoutregler): Dokument {
  if (!regler.ankre.length && !regler.kropper.length) return dok;
  return tilpassKropper(brukAnkre(dok, regler.ankre), regler);
}

// ---------- checks ----------

/** Walls thinner than this around a hole do not print reliably (mm). */
export const MIN_HULLVEGG = 1.2;

/** Boxes overlap by more than this in both directions (mm). */
const OVERLAPP = 0.3;

function overlapper(a: Boks, b: Boks): boolean {
  return (
    Math.min(a.maksX, b.maksX) - Math.max(a.minX, b.minX) > OVERLAPP &&
    Math.min(a.maksY, b.maksY) - Math.max(a.minY, b.minY) > OVERLAPP
  );
}

function erHull(o: Objekt): boolean {
  return o.kilde.type === 'form' && o.kilde.form === 'hull';
}

/**
 * What the layout could not keep: objects that now overlap the name or each other although they did
 * not in the master, and holes with too little material to the edge of the sign. It only reports; it
 * never moves anything.
 */
export function layoutProblemer(master: Dokument, dok: Dokument, regler: Layoutregler): string[] {
  const ut: string[] = [];
  const n = navneboks(dok);
  const n0 = navneboks(master);
  const folgere = regler.ankre.map((a) => dok.objekter[a.id]).filter((o): o is Objekt => !!o && o.synlig);
  for (const o of folgere) {
    const b = verdensBoks(o);
    if (n && n0 && overlapper(b, n) && !overlapper(verdensBoks(master.objekter[o.id]!), n0)) {
      ut.push(`«${o.navn}» overlapper navnet`);
    }
  }
  for (let i = 0; i < folgere.length; i++) {
    for (let j = i + 1; j < folgere.length; j++) {
      const a = folgere[i]!,
        b = folgere[j]!;
      const a0 = master.objekter[a.id],
        b0 = master.objekter[b.id];
      if (
        overlapper(verdensBoks(a), verdensBoks(b)) &&
        !(a0 && b0 && overlapper(verdensBoks(a0), verdensBoks(b0)))
      ) {
        ut.push(`«${a.navn}» overlapper «${b.navn}»`);
      }
    }
  }
  const fot = fotavtrykkBoks(dok);
  if (fot) {
    for (const o of Object.values(dok.objekter)) {
      if (!o.synlig || !erHull(o)) continue;
      const h = verdensBoks(o);
      const vegg = Math.min(h.minX - fot.minX, fot.maksX - h.maksX, h.minY - fot.minY, fot.maksY - h.maksY);
      if (vegg < MIN_HULLVEGG) {
        ut.push(`hullet har bare ${Math.max(0, vegg).toFixed(1).replace('.', ',')} mm materiale til kanten`);
      }
    }
  }
  return ut;
}

/** Texts that now stick out of a body that could not change size (a fixed plate or frame). */
export function tekstUtenforKropp(dok: Dokument, regler: Layoutregler): string[] {
  let grense = tomBoks();
  for (const id of regler.kropperAlle) {
    const o = dok.objekter[id];
    if (o?.synlig) grense = slaSammen(grense, verdensBoks(o));
  }
  if (erTom(grense)) return [];
  const ut: string[] = [];
  for (const o of Object.values(dok.objekter)) {
    if (!o.synlig || o.kilde.type !== 'tekst' || !lokalGeometri(o.kilde)) continue;
    const b = verdensBoks(o);
    const margin = 1;
    if (
      b.minX < grense.minX + margin ||
      b.maksX > grense.maksX - margin ||
      b.minY < grense.minY + margin ||
      b.maksY > grense.maksY - margin
    ) {
      ut.push(`«${o.kilde.tekst.slice(0, 24)}» er for lang for skiltet`);
    }
  }
  return ut;
}
