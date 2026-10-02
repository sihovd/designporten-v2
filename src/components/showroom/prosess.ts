/**
 * The arithmetic of the process timeline (design revision 2026-10-02, §6).
 * The line is the main character: it fills with scrolling, and a step becomes
 * active only when the line actually reaches its point. Points sit at
 * i / (n − 1) along the line, so the first point is reached at once and the
 * last one only when the line is full.
 *
 * A short rest at each end of the track lets the first step be read before
 * the line starts, and the last one before the section scrolls away.
 */
const START = 0.04;
const SLUTT = 0.1;

const klamp = (x: number) => Math.max(0, Math.min(1, x));

/** How full the line is (0–1) at a given share (0–1) of the scroll track. */
export function fyllForAndel(andel: number): number {
  return klamp((andel - START) / (1 - START - SLUTT));
}

/** The point the line was last at: the active step. */
export function stegForFyll(fyll: number, n: number): number {
  if (n <= 1) return 0;
  return Math.min(n - 1, Math.floor(fyll * (n - 1) + 1e-6));
}

/**
 * Where on the track (0–1) to scroll to show step i: just after the line has
 * reached its point, so the step is active and the line has visibly arrived.
 */
export function andelForSteg(i: number, n: number): number {
  if (n <= 1) return 0;
  const fyll = i >= n - 1 ? 1 : (i + 0.12) / (n - 1);
  return START + fyll * (1 - START - SLUTT);
}
