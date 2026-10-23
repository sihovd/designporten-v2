/**
 * The hierarchy: where every part is, where every joint is, and the
 * operations that change it. The root keeps its own position and rotation;
 * every other part is placed by the joint it hangs on, so moving a parent
 * moves its children without breaking anything.
 *
 * A joint's frame has its axis along the parent snap point's normal, turned
 * by the joint's rotation; its up direction is the snap point's «opp». The
 * child is placed so its own snap point faces back along the axis with the
 * same up direction, `avstand` further along.
 */
import { nyId } from '../../core/dokument';
import { boksFor, feltFor, grunnformer, snappunkterFor, type Deltype, type Snappunkt } from './grunnformer';
import { kuppelFelt } from './kuppel';
import { standardLedd, type CfParametre, type Del, type Ende, type Ledd } from './parametre';
import {
  anvend,
  fraEuler,
  gange,
  kolonne,
  kolonner,
  kryss,
  minus,
  pluss,
  skaler,
  transponer,
  type M3,
  type V3,
} from './vektor';

export interface Plassering {
  /** Part frame → figure coordinates: p_world = R · p + t. */
  R: M3;
  t: V3;
}

export interface Leddramme {
  /** The joint point (figure coordinates). */
  punkt: V3;
  /** Columns: axis (towards the child), s, up. */
  R: M3;
}

export const snappunkter = (d: Del): Snappunkt[] => snappunkterFor(d);
export const finnPunkt = (d: Del, id: string): Snappunkt | undefined =>
  snappunkter(d).find((s) => s.id === id);

/** The snap point's basis: columns normal, up × normal, up. */
const basis = (s: Snappunkt): M3 => kolonner(s.normal, kryss(s.opp, s.normal), s.opp);
/** Turns the axis and the side half round, keeping up: the child faces the parent. */
const SNU: M3 = [-1, 0, 0, 0, -1, 0, 0, 0, 1];

export const rot = (p: CfParametre): Del | undefined => {
  const barn = new Set(p.ledd.map((l) => l.barn.del));
  return p.deler.find((d) => !barn.has(d.id));
};

export const leddTil = (p: CfParametre, delId: string): Ledd | undefined =>
  p.ledd.find((l) => l.barn.del === delId);
export const leddFra = (p: CfParametre, delId: string): Ledd[] =>
  p.ledd.filter((l) => l.forelder.del === delId);
export const finnDel = (p: CfParametre, id: string): Del | undefined => p.deler.find((d) => d.id === id);

export interface Oppsett {
  deler: Map<string, Plassering>;
  ledd: Map<string, Leddramme>;
}

/** The frame a joint turns from: the parent snap point's basis in figure coordinates (before the joint's own rotation). */
export function grunnramme(p: CfParametre, oppsett: Oppsett, l: Ledd): M3 | null {
  const f = finnDel(p, l.forelder.del);
  const sf = f && finnPunkt(f, l.forelder.punkt);
  const pl = f && oppsett.deler.get(f.id);
  return sf && pl ? gange(pl.R, basis(sf)) : null;
}

/** Places every part and joint, parents before children. Assumes validated data. */
export function plasser(p: CfParametre): Oppsett {
  const deler = new Map<string, Plassering>();
  const ledd = new Map<string, Leddramme>();
  const r = rot(p);
  if (!r) return { deler, ledd };
  deler.set(r.id, { R: fraEuler(r.rotasjon ?? [0, 0, 0]), t: r.posisjon ?? [0, 0, 0] });
  const ko = [r.id];
  while (ko.length) {
    const fId = ko.shift()!;
    const f = finnDel(p, fId)!;
    const fp = deler.get(fId)!;
    for (const l of leddFra(p, fId)) {
      const b = finnDel(p, l.barn.del);
      const sf = finnPunkt(f, l.forelder.punkt);
      const sb = b && finnPunkt(b, l.barn.punkt);
      if (!b || !sf || !sb) continue;
      const Rj = gange(gange(fp.R, basis(sf)), fraEuler(l.rotasjon));
      const akse = kolonne(Rj, 0);
      const punkt = pluss(
        pluss(fp.t, anvend(fp.R, pluss(sf.posisjon, l.forskyvning))),
        skaler(akse, l.avstand / 2),
      );
      ledd.set(l.id, { punkt, R: Rj });
      const Rb = gange(gange(Rj, SNU), transponer(basis(sb)));
      const barnPunkt = pluss(punkt, skaler(akse, l.avstand / 2));
      deler.set(b.id, { R: Rb, t: pluss(barnPunkt, skaler(anvend(Rb, sb.posisjon), -1)) });
      ko.push(b.id);
    }
  }
  return { deler, ledd };
}

/** A snap point in figure coordinates. */
export function punktIVerden(pl: Plassering, s: Snappunkt): { punkt: V3; normal: V3 } {
  return { punkt: pluss(pl.t, anvend(pl.R, s.posisjon)), normal: anvend(pl.R, s.normal) };
}

/** Free parent snap points a new part of this type can hang on, with the child point it would use. */
export function ledigeFor(
  p: CfParametre,
  type: Deltype,
): { forelder: Ende; barnPunkt: string; navn: string }[] {
  const brukt = new Set(p.ledd.map((l) => `${l.forelder.del}/${l.forelder.punkt}`));
  const ny = grunnformer[type];
  const barnPunkter = snappunkterFor({
    type,
    lengde: ny.lengde.standard,
    tykkelse: ny.tykkelse.standard,
  }).filter((s) => s.side === 'barn');
  const ut: { forelder: Ende; barnPunkt: string; navn: string }[] = [];
  for (const d of p.deler)
    for (const s of snappunkter(d)) {
      if (s.side !== 'forelder' || brukt.has(`${d.id}/${s.id}`)) continue;
      const passer = barnPunkter.find((b) => b.type === s.type);
      if (passer)
        ut.push({
          forelder: { del: d.id, punkt: s.id },
          barnPunkt: passer.id,
          navn: `${s.navn} på ${d.navn}`,
        });
    }
  return ut;
}

export type Resultat = { ok: true; p: CfParametre; id: string } | { ok: false; grunn: string };

/** Which side a part is on: from the sided snap point (`-v`, `-h`) it or one of its ancestors hangs on. */
export function side(p: CfParametre, delId: string): 'v' | 'h' | null {
  let l = leddTil(p, delId);
  while (l) {
    if (l.forelder.punkt.endsWith('-v')) return 'v';
    if (l.forelder.punkt.endsWith('-h')) return 'h';
    l = leddTil(p, l.forelder.del);
  }
  return null;
}

const SIDENAVN = { v: 'Venstre', h: 'Høyre' } as const;

/** «Arm», «Venstre arm», «Høyre arm 2», «Hale 3». */
function nyttNavn(p: CfParametre, type: Deltype, sideAv: 'v' | 'h' | null): string {
  const grunn = grunnformer[type].navn;
  const navn = sideAv ? `${SIDENAVN[sideAv]} ${grunn.toLowerCase()}` : grunn;
  if (!p.deler.some((d) => d.navn === navn)) return navn;
  for (let i = 2; ; i++) if (!p.deler.some((d) => d.navn === `${navn} ${i}`)) return `${navn} ${i}`;
}

function nyDel(p: CfParametre, type: Deltype, variant?: string, sideAv: 'v' | 'h' | null = null): Del {
  const g = grunnformer[type];
  const d: Del = {
    id: nyId('del'),
    type,
    navn: nyttNavn(p, type, sideAv),
    farge: g.farge,
    lengde: g.lengde.standard,
    tykkelse: g.tykkelse.standard,
  };
  if (variant && variant !== g.varianter[0]!.id && g.varianter.some((v) => v.id === variant))
    d.variant = variant;
  return d;
}

/** The head (or another part) as the figure's root, standing on the plate. Only when the figure is empty. */
export function leggTilRot(p: CfParametre, type: Deltype, variant?: string): Resultat {
  if (p.deler.length) return { ok: false, grunn: 'Figuren har allerede en del å bygge videre fra.' };
  const d = nyDel(p, type, variant);
  // high enough that an upper body under it stands on the plate
  d.posisjon = [0, 0, Math.round(d.lengde / 2 + grunnformer.overkropp.lengde.standard - 4)];
  d.rotasjon = [0, 0, 0];
  return { ok: true, p: { ...p, deler: [d] }, id: d.id };
}

/** Hangs a new part on a free parent snap point, with an automatic joint. */
export function koble(p: CfParametre, type: Deltype, forelder: Ende, variant?: string): Resultat {
  const f = finnDel(p, forelder.del);
  const sf = f && finnPunkt(f, forelder.punkt);
  if (!f || !sf || sf.side !== 'forelder') return { ok: false, grunn: 'Punktet finnes ikke.' };
  if (p.ledd.some((l) => l.forelder.del === forelder.del && l.forelder.punkt === forelder.punkt))
    return { ok: false, grunn: `${sf.navn} på ${f.navn} er allerede i bruk.` };
  const sideAv = forelder.punkt.endsWith('-v') ? 'v' : forelder.punkt.endsWith('-h') ? 'h' : side(p, f.id);
  const b = nyDel(p, type, variant, sideAv);
  const sb = snappunkter(b).find((s) => s.side === 'barn' && s.type === sf.type);
  if (!sb) return { ok: false, grunn: `${grunnformer[type].navn} passer ikke på ${sf.navn.toLowerCase()}.` };
  const ledd: Ledd = {
    id: nyId('ledd'),
    forelder,
    barn: { del: b.id, punkt: sb.id },
    mekanisme: 'kjede',
    forskyvning: [0, 0, 0],
    rotasjon: [0, 0, 0],
    ...standardLedd(f, b),
  };
  const ny = { ...p, deler: [...p.deler, b], ledd: [...p.ledd, ledd] };
  const avstand = fristilt(ny, ledd);
  if (avstand !== ledd.avstand) ledd.avstand = avstand;
  return { ok: true, p: ny, id: b.id };
}

/** How close the two shapes may come outside the dome (mm): the trial clearance with a margin. */
const FRI_AVSTAND = 0.5;

/**
 * The smallest distance (from the joint's own, in 0.5 mm steps, at most 12 mm further out) at which
 * the new part's base shape stays clear of its parent's everywhere the dome does not cut. A part on
 * a curved flank (an arm on a pear-shaped body, a leg under a round hip) otherwise grows into the
 * parent beside the joint. Measured on the base shapes at 1 mm, before any cut.
 */
function fristilt(p: CfParametre, ledd: Ledd): number {
  const f = finnDel(p, ledd.forelder.del),
    b = finnDel(p, ledd.barn.del);
  if (!f || !b) return ledd.avstand;
  const ff = feltFor(f),
    fb = feltFor(b);
  const kuppel = kuppelFelt(ledd.kuppel);
  const bx = boksFor(b);
  // points inside the child, in its own frame
  const inne: V3[] = [];
  for (let x = bx.min[0]; x <= bx.maks[0]; x += 1)
    for (let y = bx.min[1]; y <= bx.maks[1]; y += 1)
      for (let z = bx.min[2]; z <= bx.maks[2]; z += 1) if (fb(x, y, z) < 0) inne.push([x, y, z]);
  for (let avstand = ledd.avstand; avstand <= ledd.avstand + 12; avstand += 0.5) {
    const q = { ...p, ledd: p.ledd.map((l) => (l.id === ledd.id ? { ...l, avstand } : l)) };
    const o = plasser(q);
    const pf = o.deler.get(f.id),
      pb = o.deler.get(b.id),
      r = o.ledd.get(ledd.id);
    if (!pf || !pb || !r) return ledd.avstand;
    const tilF = transponer(pf.R),
      tilLedd = transponer(r.R);
    const kolliderer = inne.some((pkt) => {
      const w = pluss(anvend(pb.R, pkt), pb.t);
      const iF = anvend(tilF, minus(w, pf.t));
      if (ff(...iF) >= FRI_AVSTAND) return false;
      return kuppel(...anvend(tilLedd, minus(w, r.punkt))) > 0;
    });
    if (!kolliderer) return avstand;
  }
  return ledd.avstand;
}

/** All parts that hang below a part, at any depth. */
export function etterkommere(p: CfParametre, id: string): string[] {
  const ut: string[] = [];
  const ko = [id];
  while (ko.length) {
    const n = ko.shift()!;
    for (const l of leddFra(p, n)) {
      ut.push(l.barn.del);
      ko.push(l.barn.del);
    }
  }
  return ut;
}

/** Removes a part, everything hanging on it and their joints. */
export function slett(p: CfParametre, id: string): CfParametre {
  const borte = new Set([id, ...etterkommere(p, id)]);
  return {
    ...p,
    deler: p.deler.filter((d) => !borte.has(d.id)),
    ledd: p.ledd.filter((l) => !borte.has(l.barn.del) && !borte.has(l.forelder.del)),
  };
}
