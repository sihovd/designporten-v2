/**
 * Adaptive measurement grid (spec: skaperverksted.md, "Canvas and adaptive
 * measurement grid"). Steps come from 1-2-5 × 10ⁿ mm. Minor lines stay at
 * least `minPx` screen pixels apart; the major step is the next decade-ish
 * step. Labels switch to cm once the major step is ≥ 10 mm.
 */

const TRINN = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export interface Rutenettnivaa {
  /** Minor spacing in mm. */
  liten: number;
  /** Major spacing in mm. */
  stor: number;
  /** 0..1 opacity for minor lines (fades in as they get room). */
  litenSynlighet: number;
  /** Label unit for rulers. */
  enhet: 'mm' | 'cm';
}

/** `pxPerMm` = current screen pixels per millimetre (zoom × PX_PER_MM). */
export function rutenettnivaa(pxPerMm: number, minPx = 8): Rutenettnivaa {
  let i = TRINN.findIndex((s) => s * pxPerMm >= minPx);
  if (i < 0) i = TRINN.length - 1;
  const liten = TRINN[i]!;
  // major: 5× or 10× minor so majors fall on round numbers
  const stor = TRINN.find((s) => s >= liten * 5 && (s / liten) % 5 === 0 && s * pxPerMm >= 40) ?? liten * 10;
  const px = liten * pxPerMm;
  const litenSynlighet = Math.min(1, Math.max(0, (px - minPx) / (minPx * 1.5)));
  return { liten, stor, litenSynlighet: 0.35 + 0.65 * litenSynlighet, enhet: stor >= 10 ? 'cm' : 'mm' };
}

/** Format a ruler label for a position in mm. */
export function linjalEtikett(mm: number, enhet: 'mm' | 'cm'): string {
  const v = enhet === 'cm' ? mm / 10 : mm;
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toLocaleString('nb-NO');
}

/** Snap a value to the nearest multiple of `trinn`. */
export function snapTil(v: number, trinn: number): number {
  return Math.round(v / trinn) * trinn;
}
