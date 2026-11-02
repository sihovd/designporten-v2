/**
 * Edits on a drawing, as pure functions so they can be tested without the
 * canvas. Each returns a new drawing; the canvas and the properties panel
 * run them through `endreTegning` as one undo step.
 */
import type { DrageParametre } from '../parametre';
import { lagOppsett, lagSti, naermesteLengde } from './geometri';
import {
  BREDDE_MAKS,
  BREDDE_MIN,
  HOYDE_MAKS,
  HOYDE_MIN,
  nyElementId,
  RYGG_MAKS_PUNKTER,
  standardTegning,
  type Elementform,
  type Profilpunkt,
  type Tegning,
  type V2,
} from './modell';

const klemme = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const RUTE = 5;

/** Snap a plate position to the 5 mm grid. */
export function festTilRute(p: V2): V2 {
  return [Math.round(p[0] / RUTE) * RUTE, Math.round(p[1] / RUTE) * RUTE];
}

export function flyttPunkt(t: Tegning, i: number, p: V2): Tegning {
  if (i < 0 || i >= t.rygg.length) return t;
  const rygg = t.rygg.map((q, k): V2 => (k === i ? p : q));
  return { ...t, rygg };
}

export function flyttHele(t: Tegning, dx: number, dy: number): Tegning {
  return { ...t, rygg: t.rygg.map((q): V2 => [q[0] + dx, q[1] + dy]) };
}

/** Insert a spine point where the curve passes nearest `p`; returns the drawing and the new point's index. */
export function settInnPunkt(t: Tegning, p: V2): { tegning: Tegning; i: number } {
  if (t.rygg.length >= RYGG_MAKS_PUNKTER) return { tegning: t, i: -1 };
  const sti = lagSti(t.rygg);
  const { s } = naermesteLengde(sti, p);
  // arc length of every drawn point, then the gap the new one falls in
  const sPunkter = t.rygg.map((q) => naermesteLengde(sti, q).s);
  let i = sPunkter.findIndex((x) => x > s);
  if (i <= 0) i = i === 0 ? 1 : t.rygg.length;
  const rygg = [...t.rygg.slice(0, i), p, ...t.rygg.slice(i)];
  return { tegning: { ...t, rygg }, i };
}

export function slettPunkt(t: Tegning, i: number): Tegning {
  if (t.rygg.length <= 2 || i < 0 || i >= t.rygg.length) return t;
  return { ...t, rygg: t.rygg.filter((_, k) => k !== i) };
}

/** Reverse the spine: the tail end becomes the nose. Width, height and elements follow the body. */
export function snu(t: Tegning): Tegning {
  const speil = (p: Profilpunkt[]) => p.map((q) => ({ t: 1 - q.t, verdi: q.verdi })).reverse();
  return {
    ...t,
    rygg: [...t.rygg].reverse(),
    bredde: speil(t.bredde),
    hoyde: speil(t.hoyde),
    elementer: t.elementer.map((e) => ({ ...e, t: 1 - e.t })),
  };
}

/* ---------------- width and height profiles ---------------- */

export type Profilnavn = 'bredde' | 'hoyde';

const grenser: Record<Profilnavn, [number, number]> = {
  bredde: [BREDDE_MIN, BREDDE_MAKS],
  hoyde: [HOYDE_MIN, HOYDE_MAKS],
};

/** Move profile point i: its spot along the spine stays between its neighbours. */
export function settProfilpunkt(t: Tegning, navn: Profilnavn, i: number, p: Partial<Profilpunkt>): Tegning {
  const liste = t[navn];
  const q = liste[i];
  if (!q) return t;
  const [min, maks] = grenser[navn];
  const lo = i > 0 ? liste[i - 1]!.t + 0.01 : 0;
  const hi = i < liste.length - 1 ? liste[i + 1]!.t - 0.01 : 1;
  const ny: Profilpunkt = {
    t: p.t === undefined ? q.t : klemme(p.t, Math.min(lo, hi), Math.max(lo, hi)),
    verdi: p.verdi === undefined ? q.verdi : klemme(p.verdi, min, maks),
  };
  return { ...t, [navn]: liste.map((x, k) => (k === i ? ny : x)) };
}

export function leggTilProfilpunkt(
  t: Tegning,
  navn: Profilnavn,
  p: Profilpunkt,
): { tegning: Tegning; i: number } {
  const [min, maks] = grenser[navn];
  const ny = { t: klemme(p.t, 0, 1), verdi: klemme(p.verdi, min, maks) };
  const liste = [...t[navn].filter((q) => Math.abs(q.t - ny.t) > 0.005), ny].sort((a, b) => a.t - b.t);
  return { tegning: { ...t, [navn]: liste }, i: liste.indexOf(ny) };
}

export function slettProfilpunkt(t: Tegning, navn: Profilnavn, i: number): Tegning {
  if (t[navn].length <= 1) return t;
  return { ...t, [navn]: t[navn].filter((_, k) => k !== i) };
}

/* ---------------- elements ---------------- */

/**
 * Put a spike on the piece at spine position `tPos`, in the middle of that
 * piece (one per piece). Refused with a reason when the piece already has one.
 */
export function leggTilPigg(
  t: Tegning,
  tPos: number,
  form: Elementform,
): { tegning: Tegning; id: string } | { grunn: string } {
  const o = lagOppsett(t);
  if (!o.segmenter.length) return { grunn: 'Tegn ryggen lengre først, så dragen får deler.' };
  const s = klemme(tPos, 0, 1) * o.L;
  const seg = o.segmenter.find((x) => s >= x.s0 && s <= x.s1) ?? o.segmenter.at(-1)!;
  if (seg.elementer.length) return { grunn: `${seg.navn} har allerede en pigg.` };
  if (seg.indeks === 0 && t.hode.horn !== 'ingen')
    return { grunn: 'Hodet har horn. Velg «Ingen» horn for å sette en pigg der.' };
  const id = nyElementId(t);
  const midt = (seg.s0 + seg.s1) / 2 / o.L;
  return { tegning: { ...t, elementer: [...t.elementer, { id, type: 'pigg', t: midt, form }] }, id };
}

export function flyttElement(t: Tegning, id: string, tPos: number): Tegning {
  return { ...t, elementer: t.elementer.map((e) => (e.id === id ? { ...e, t: klemme(tPos, 0, 1) } : e)) };
}

export function endreElement(t: Tegning, id: string, form: Elementform): Tegning {
  return { ...t, elementer: t.elementer.map((e) => (e.id === id ? { ...e, form } : e)) };
}

export function slettElement(t: Tegning, id: string): Tegning {
  return { ...t, elementer: t.elementer.filter((e) => e.id !== id) };
}

/* ---------------- drawing a new spine ---------------- */

function avstandTilLinje(p: V2, a: V2, b: V2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / l;
}

/** Ramer–Douglas–Peucker: the few points that keep a freehand stroke's shape within `toleranse` mm. */
export function forenkle(p: V2[], toleranse = 2.5): V2[] {
  if (p.length < 3) return p;
  let maks = 0;
  let k = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = avstandTilLinje(p[i]!, p[0]!, p.at(-1)!);
    if (d > maks) {
      maks = d;
      k = i;
    }
  }
  if (maks <= toleranse) return [p[0]!, p.at(-1)!];
  return [...forenkle(p.slice(0, k + 1), toleranse).slice(0, -1), ...forenkle(p.slice(k), toleranse)];
}

/**
 * A freehand stroke as the new spine (nose where the stroke started).
 * Too short strokes are refused, so a stray tap never erases the dragon.
 */
export function tegnRygg(t: Tegning, strek: V2[]): { tegning: Tegning } | { grunn: string } {
  let lengde = 0;
  for (let i = 1; i < strek.length; i++)
    lengde += Math.hypot(strek[i]![0] - strek[i - 1]![0], strek[i]![1] - strek[i - 1]![1]);
  if (strek.length < 2 || lengde < 30)
    return { grunn: 'Streken var for kort. Tegn ryggen fra nesen til halespissen.' };
  let tol = 2.5;
  let punkter = forenkle(strek, tol);
  while (punkter.length > 14) punkter = forenkle(strek, (tol *= 1.4));
  // keep at least one point in the middle so the curve can be shaped afterwards
  if (punkter.length === 2) punkter = [punkter[0]!, strek[Math.floor(strek.length / 2)]!, punkter[1]!];
  const rund = (q: V2): V2 => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10];
  return { tegning: { ...t, rygg: punkter.map(rund) } };
}

/* ---------------- from the earlier part picker ---------------- */

/** A drawing that keeps the choices of a dragon made with the part picker (head, horns, eyes, tail, spikes). */
export function fraKlassisk(p: DrageParametre): Tegning {
  const s = standardTegning();
  return {
    ...s,
    hode: { form: p.hode, horn: p.horn, oyne: p.detaljer.oyne },
    hale: p.hale,
    elementer: p.pigger === 'ingen' ? [] : s.elementer.map((e) => ({ ...e, form: p.pigger as Elementform })),
  };
}
