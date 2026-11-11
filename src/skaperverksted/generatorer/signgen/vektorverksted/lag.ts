/**
 * Layers and local redraw for Vectorim (Sivert, 2026-11-11: «Når det
 * vektoriseres så vektoriseres det i lag så da må merge være med», and «et
 * verktøy som lar deg markere et område som tegner på nytt med lokale
 * innstillinger akkurat der markeringen ligger»).
 *
 * A layer is all parts of one colour, which is also how the SVG groups them.
 * A layer's name, visibility, lock and order are kept beside the model, keyed
 * by its colour, so the model itself stays plain.
 */
import {
  kurverIOmrade,
  slaSammenDeler,
  slettDeler,
  tegnetAreal,
  tilpassPaNytt,
  type Vektormodell,
} from './modell';
import type { Tilpasningsvalg } from './tilpass';

export interface Lagmeta {
  navn?: string;
  skjult?: boolean;
  last?: boolean;
}
export type Lagkart = Record<string, Lagmeta>;

export interface Omrade {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The layers (colours) in order: the given order first, then the rest by area, largest first. */
export function lagrekkefolge(m: Vektormodell, rekkefolge: string[]): string[] {
  const areal = new Map<string, number>();
  for (const d of m.deler) if (d) areal.set(d.farge, (areal.get(d.farge) ?? 0) + Math.abs(tegnetAreal(m, d)));
  const kjent = rekkefolge.filter((f) => areal.has(f));
  const resten = [...areal.keys()]
    .filter((f) => !kjent.includes(f))
    .sort((a, b) => areal.get(b)! - areal.get(a)!);
  return [...kjent, ...resten];
}

/** A layer's metadata moves with it when its colour changes; merging into an existing layer keeps that one's. */
export function flyttLag(
  lag: Lagkart,
  rekkefolge: string[],
  fra: string,
  til: string,
): {
  lag: Lagkart;
  rekkefolge: string[];
} {
  const ny = { ...lag };
  const finnes = til in ny || rekkefolge.includes(til);
  if (!finnes && ny[fra]) ny[til] = ny[fra]!;
  delete ny[fra];
  const r = finnes ? rekkefolge.filter((f) => f !== fra) : rekkefolge.map((f) => (f === fra ? til : f));
  return { lag: ny, rekkefolge: r };
}

/** Parts that a hidden or locked layer leaves alone: ids of parts in the given colours. */
export function delerIFarger(m: Vektormodell, farger: Set<string>): Set<number> {
  const s = new Set<number>();
  for (const d of m.deler) if (d && farger.has(d.farge)) s.add(d.id);
  return s;
}

/** A border is locked when a part on either side of it is locked: moving it would change that part. */
export function kurveLast(m: Vektormodell, id: number, laste: Set<number>): boolean {
  const k = m.kurver[id];
  return !!k && (laste.has(k.venstre) || laste.has(k.hoyre));
}

/** Parts lying wholly inside the area: every border of theirs is inside it. */
export function delerIOmrade(m: Vektormodell, r: Omrade): number[] {
  const inne = new Set(kurverIOmrade(m, r, 0.98));
  return m.deler.flatMap((d) =>
    d && d.ringer.every((ring) => ring.every((b) => inne.has(b.kjede))) ? [d.id] : [],
  );
}

/** The neighbour a part shares the longest border with (-1 when it borders only the outside). */
function lengsteNabo(m: Vektormodell, id: number): number {
  const lengde = new Map<number, number>();
  for (const k of m.kurver) {
    if (!k) continue;
    const annen = k.venstre === id ? k.hoyre : k.hoyre === id ? k.venstre : null;
    if (annen === null || annen < 0) continue;
    lengde.set(annen, (lengde.get(annen) ?? 0) + k.punkter.length);
  }
  let best = -1,
    bestL = -1;
  for (const [n, l] of lengde)
    if (l > bestL) {
      best = n;
      bestL = l;
    }
  return best;
}

/**
 * Parts among `ider` smaller than `minAreal` (vector units²) go into the
 * neighbour they share the longest border with, the smallest first; a part
 * with no neighbour is removed. Locked parts are left alone.
 */
export function slaSmaaDelerInn(
  m0: Vektormodell,
  ider: number[],
  minAreal: number,
  laste: Set<number> = new Set(),
): { modell: Vektormodell; antall: number } {
  let m = m0;
  let antall = 0;
  const kandidater = ider
    .map((id) => m.deler[id])
    .filter((d) => d && !laste.has(d.id))
    .map((d) => ({ id: d!.id, areal: Math.abs(tegnetAreal(m, d!)) }))
    .filter((d) => d.areal < minAreal)
    .sort((a, b) => a.areal - b.areal);
  for (const { id } of kandidater) {
    const d = m.deler[id];
    if (!d || Math.abs(tegnetAreal(m, d)) >= minAreal) continue;
    const nabo = lengsteNabo(m, id);
    if (nabo >= 0 && laste.has(nabo)) continue;
    // the neighbour keeps its colour even when the small part is larger in pixels than its drawn area says
    m = nabo >= 0 ? slaSammenTil(m, id, nabo) : slettDeler(m, [id]);
    antall++;
  }
  return { modell: m, antall };
}

/** Merges `fra` into `til`, and `til` keeps its colour. */
function slaSammenTil(m: Vektormodell, fra: number, til: number): Vektormodell {
  const farge = m.deler[til]!.farge;
  const ny = slaSammenDeler(m, [fra, til]);
  const beholder = ny.deler[til] ? til : fra;
  if (ny.deler[beholder] && ny.deler[beholder]!.farge !== farge) {
    const k = structuredClone(ny);
    k.deler[beholder]!.farge = farge;
    return k;
  }
  return ny;
}

/** Local settings for redrawing an area. */
export interface Lokalvalg {
  tilpasning: Partial<Tilpasningsvalg>;
  /** Parts wholly inside the area smaller than this (vector units²) go into a neighbour; 0 leaves them. */
  minAreal: number;
}

/**
 * Redraws the marked area with its own settings: the borders inside it are
 * fitted again (ends stay put, so the borders outside still meet them), and
 * small parts inside it are merged into a neighbour.
 */
export function tegnOmradePaNytt(
  m: Vektormodell,
  r: Omrade,
  valg: Lokalvalg,
  laste: Set<number> = new Set(),
): { modell: Vektormodell; kurver: number; smaaDeler: number } {
  let modell = m;
  let smaa = 0;
  if (valg.minAreal > 0) {
    const s = slaSmaaDelerInn(modell, delerIOmrade(modell, r), valg.minAreal, laste);
    modell = s.modell;
    smaa = s.antall;
  }
  const kurver = kurverIOmrade(modell, r).filter((id) => !kurveLast(modell, id, laste));
  modell = tilpassPaNytt(modell, kurver, valg.tilpasning);
  return { modell, kurver: kurver.length, smaaDeler: smaa };
}
