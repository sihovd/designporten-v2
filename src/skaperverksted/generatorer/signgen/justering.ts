/**
 * Align and distribute, as pure calculations (Sign Forge, 2026-10-07). What
 * the edges line up against is the reference: the selection's own box, the
 * build plate, or a guide line. Distribute spreads the objects with equal
 * gaps between two limits: the outermost objects, the plate edges, or the two
 * outermost guide lines.
 */
import type { Boks } from '../../core/geometri2d';

export type Justering = 'venstre' | 'midtX' | 'hoyre' | 'topp' | 'midtY' | 'bunn';

/** A line (guide) or a box (selection, plate) the objects line up against. */
export type Justeringsmal = { type: 'boks'; boks: Boks } | { type: 'linje'; akse: 'x' | 'y'; verdi: number };

const erVannrett = (j: Justering) => j === 'venstre' || j === 'midtX' || j === 'hoyre';

/** A vertical guide only lines things up sideways, a horizontal one only up and down. */
export function justeringGjelder(j: Justering, mal: Justeringsmal): boolean {
  if (mal.type === 'boks') return true;
  return mal.akse === 'x' ? erVannrett(j) : !erVannrett(j);
}

/** How far to move an object with box `b` to line up with the reference. */
export function justeringsforskyvning(b: Boks, j: Justering, mal: Justeringsmal): { dx: number; dy: number } {
  if (!justeringGjelder(j, mal)) return { dx: 0, dy: 0 };
  const r: Boks =
    mal.type === 'boks'
      ? mal.boks
      : mal.akse === 'x'
        ? { minX: mal.verdi, maksX: mal.verdi, minY: 0, maksY: 0 }
        : { minX: 0, maksX: 0, minY: mal.verdi, maksY: mal.verdi };
  switch (j) {
    case 'venstre':
      return { dx: r.minX - b.minX, dy: 0 };
    case 'hoyre':
      return { dx: r.maksX - b.maksX, dy: 0 };
    case 'midtX':
      return { dx: (r.minX + r.maksX) / 2 - (b.minX + b.maksX) / 2, dy: 0 };
    case 'bunn':
      return { dx: 0, dy: r.minY - b.minY };
    case 'topp':
      return { dx: 0, dy: r.maksY - b.maksY };
    case 'midtY':
      return { dx: 0, dy: (r.minY + r.maksY) / 2 - (b.minY + b.maksY) / 2 };
  }
}

/**
 * Equal gaps between the objects, from `start` to `slutt` along the axis (the outermost objects'
 * outer edges when not given). Returns how far each object moves along that axis.
 */
export function fordelingsforskyvninger(
  objekter: { id: string; boks: Boks }[],
  akse: 'x' | 'y',
  grenser?: { start: number; slutt: number },
): Map<string, number> {
  const lav = (b: Boks) => (akse === 'x' ? b.minX : b.minY);
  const hoy = (b: Boks) => (akse === 'x' ? b.maksX : b.maksY);
  const sortert = [...objekter].sort((a, b) => lav(a.boks) - lav(b.boks));
  const ut = new Map<string, number>();
  if (sortert.length < 2) return ut;
  const start = grenser?.start ?? lav(sortert[0]!.boks);
  const slutt = grenser?.slutt ?? Math.max(...sortert.map((o) => hoy(o.boks)));
  const sum = sortert.reduce((s, o) => s + (hoy(o.boks) - lav(o.boks)), 0);
  const gap = (slutt - start - sum) / (sortert.length - 1);
  let pos = start;
  for (const o of sortert) {
    ut.set(o.id, pos - lav(o.boks));
    pos += hoy(o.boks) - lav(o.boks) + gap;
  }
  return ut;
}
