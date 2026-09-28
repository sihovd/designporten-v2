/**
 * Lamp edits. Pure parameter functions (tested) plus the thin wrapper that
 * sends them through the workbench history.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { ProfilPunkt } from '../../core/profil';
import { lesParametre, medParametre } from './modell';
import { GRENSER, MIN_RADIUS, type LampeParametre } from './parametre';

/** Change the lamp through history. `slaSammen` merges a drag or arrow steps into one undo step. */
export function endreLampe(
  benk: Arbeidsbenk,
  navn: string,
  endring: (p: LampeParametre) => Partial<LampeParametre>,
  slaSammen?: string,
): void {
  benk.endre({
    navn,
    anvend: (d) => {
      const ny = medParametre(d, endring(lesParametre(d)));
      return JSON.stringify(ny.parametre) === JSON.stringify(d.parametre) ? d : ny;
    },
    slaSammen,
  });
}

const klem = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Straight-line radius between the bottom and top diameters at height fraction t. */
export function grunnRadius(p: LampeParametre, t: number): number {
  return p.diameterBunn / 2 + ((p.diameterTopp - p.diameterBunn) / 2) * t;
}

/** Actual silhouette radius (mm) of anchor i. */
export function ankerRadius(p: LampeParametre, i: number): number {
  const a = p.silhuett[i]!;
  return grunnRadius(p, a.t) + a.u;
}

/**
 * Move anchor i to radius r (mm) and height z (mm). The bottom and top
 * anchors set the diameters (their height is fixed); the others move freely
 * between their neighbours and carry their handles along.
 */
export function flyttAnker(p: LampeParametre, i: number, r: number, z: number): Partial<LampeParametre> {
  const pk = p.silhuett;
  const siste = pk.length - 1;
  const d = klem(2 * r, GRENSER.diameter.min, GRENSER.diameter.maks);
  if (i === 0) return { diameterBunn: d };
  if (i === siste) return { diameterTopp: d };
  const forrige = pk[i - 1]!.t;
  const neste = pk[i + 1]!.t;
  const t = klem(z / p.hoyde, forrige + 0.01, neste - 0.01);
  const u = klem(Math.max(r, MIN_RADIUS) - grunnRadius(p, t), GRENSER.bule.min, GRENSER.bule.maks);
  const a = pk[i]!;
  const du = u - a.u;
  const dt = t - a.t;
  const flytt = (h?: { u: number; t: number }) => (h ? { u: h.u + du, t: klem(h.t + dt, 0, 1) } : undefined);
  const ny: ProfilPunkt = { u, t };
  const ut = flytt(a.ut);
  const inn = flytt(a.inn);
  if (ut) ny.ut = ut;
  if (inn) ny.inn = inn;
  return { silhuett: pk.map((x, k) => (k === i ? ny : x)) };
}

/** Move a Bézier handle of anchor i to radius r and height z (mm). */
export function flyttHandtak(
  p: LampeParametre,
  i: number,
  del: 'ut' | 'inn',
  r: number,
  z: number,
): Partial<LampeParametre> {
  const t = klem(z / p.hoyde, 0, 1);
  const u = klem(r - grunnRadius(p, t), GRENSER.bule.min, GRENSER.bule.maks);
  return { silhuett: p.silhuett.map((x, k) => (k === i ? { ...x, [del]: { u, t } } : x)) };
}

/** Insert an anchor halfway between anchor i and the next one. Returns the new index. */
export function leggTilAnker(
  p: LampeParametre,
  i: number,
): { endring: Partial<LampeParametre>; indeks: number } {
  const pk = p.silhuett;
  const k = klem(i, 0, pk.length - 2);
  const a = pk[k]!;
  const b = pk[k + 1]!;
  const ny: ProfilPunkt = { u: (a.u + b.u) / 2, t: (a.t + b.t) / 2 };
  return { endring: { silhuett: [...pk.slice(0, k + 1), ny, ...pk.slice(k + 1)] }, indeks: k + 1 };
}

export function fjernAnker(p: LampeParametre, i: number): Partial<LampeParametre> {
  if (i <= 0 || i >= p.silhuett.length - 1) return {};
  return { silhuett: p.silhuett.filter((_, k) => k !== i) };
}

/** Toggle anchor i between a sharp corner and a smooth Bézier point. */
export function vekslGlatt(p: LampeParametre, i: number): Partial<LampeParametre> {
  const pk = p.silhuett.map((x) => ({ ...x }));
  const q = pk[i]!;
  if (q.ut || q.inn) {
    delete q.ut;
    delete q.inn;
  } else {
    const forrige = pk[i - 1];
    const neste = pk[i + 1];
    // Handles along the chord between the neighbours keep the curve smooth.
    const fra = forrige ?? q;
    const til = neste ?? q;
    const du = (til.u - fra.u) / 6;
    const dt = (til.t - fra.t) / 6;
    if (neste) q.ut = { u: q.u + du, t: klem(q.t + dt, 0, 1) };
    if (forrige) q.inn = { u: q.u - du, t: klem(q.t - dt, 0, 1) };
  }
  return { silhuett: pk };
}
