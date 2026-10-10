/**
 * Manual placement of generated signs on the build plate (Sivert, 2026-10-10). Only the placement is changed;
 * a sign's geometry, colours and CSV connections are never touched. Where a sign may go is the job of the
 * snap engine (`snapmotor.ts`).
 *
 * A moved sign is kept as an offset from where the automatic packing puts it (`Csvarbeid.plateflytt`), so
 * «Tilbakestill» goes back to the packing and the files are written from the placement shown.
 */
import type { Byggeplate, Plassering } from './batch';
import type { PlassertSkilt } from './snapmotor';
import type { Silhuett } from './silhuett';

/** Offset (mm) added to the automatic placement of a sign, by CSV row. */
export type Plateflytt = Record<number, { dx: number; dy: number }>;

/** The plates as laid out: the automatic packing plus the offsets the user has made. */
export function brukPlateflytt<T extends Byggeplate>(plater: T[], flytt: Plateflytt | undefined): T[] {
  if (!flytt || !Object.keys(flytt).length) return plater;
  return plater.map((p) => ({
    ...p,
    plasseringer: p.plasseringer.map((pl) => {
      const f = flytt[pl.variant.indeks];
      return f ? { ...pl, dx: pl.dx + f.dx, dy: pl.dy + f.dy } : pl;
    }),
  }));
}

/** The offsets without the rows in `rader` (back to the automatic packing). */
export function utenFlytt(flytt: Plateflytt | undefined, rader: readonly number[]): Plateflytt {
  const ut: Plateflytt = { ...(flytt ?? {}) };
  for (const r of rader) delete ut[r];
  return ut;
}

/** Set the offset of one sign so it lies at (dx, dy) in total when the packing puts it at (autoDx, autoDy). */
export function settFlytt(
  flytt: Plateflytt | undefined,
  rad: number,
  dx: number,
  dy: number,
  autoDx: number,
  autoDy: number,
): Plateflytt {
  const f = { dx: round(dx - autoDx), dy: round(dy - autoDy) };
  const ut = { ...(flytt ?? {}) };
  if (Math.abs(f.dx) < 1e-6 && Math.abs(f.dy) < 1e-6) delete ut[rad];
  else ut[rad] = f;
  return ut;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** A sign on a plate as plain data for the snap engine; `punkter` are its snap points in its own coordinates. */
export function tilPlassert(
  pl: Plassering,
  silhuett: Silhuett,
  punkter: { x: number; y: number }[] = [],
): PlassertSkilt {
  return { id: pl.variant.indeks, silhuett, boks: pl.variant.boks, dx: pl.dx, dy: pl.dy, punkter };
}
