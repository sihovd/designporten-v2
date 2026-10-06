/**
 * Double-click on the canvas. A pointerdown has no click count, so the
 * second press is recognised by time and place instead.
 */
import type { Vec2 } from '../../core/geometri2d';

let sist: { t: number; p: Vec2 } | null = null;

/** Call on every press; true on the second press of a double-click. */
export function erDobbeltklikk(skjerm: Vec2, vindu = 400, avstandPx = 6): boolean {
  const na = performance.now();
  const dobbel =
    !!sist && na - sist.t < vindu && Math.hypot(skjerm.x - sist.p.x, skjerm.y - sist.p.y) < avstandPx;
  sist = dobbel ? null : { t: na, p: skjerm };
  return dobbel;
}
