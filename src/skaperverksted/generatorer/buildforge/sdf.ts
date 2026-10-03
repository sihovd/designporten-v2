/**
 * Signed distance fields for BuildForge (handoff §7.1): d(p) < 0 inside,
 * 0 on the surface, > 0 outside, in millimetres.
 *
 * The primitives are exact distances. Unions, differences, clipping and the
 * smooth union keep the field 1-Lipschitz (it never changes faster than the
 * distance to the point), which is what the meshing and the collision check
 * rely on: a field value bounds how far the surface can be. Primitives are
 * sized by their dimensions, never by scaling, so this holds everywhere.
 */

export type V3 = [number, number, number];
export type Felt = (x: number, y: number, z: number) => number;

export interface Boks {
  min: V3;
  maks: V3;
}

export const TOM: Felt = () => Infinity;

export function kule(r: number): Felt {
  return (x, y, z) => Math.hypot(x, y, z) - r;
}

/** Box with half extents (hx, hy, hz) and every edge rounded by r. */
export function avrundetBoks(hx: number, hy: number, hz: number, r: number): Felt {
  const rr = Math.max(0, Math.min(r, hx, hy, hz));
  const bx = hx - rr,
    by = hy - rr,
    bz = hz - rr;
  return (x, y, z) => {
    const qx = Math.abs(x) - bx,
      qy = Math.abs(y) - by,
      qz = Math.abs(z) - bz;
    const ute = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return ute + Math.min(Math.max(qx, qy, qz), 0) - rr;
  };
}

/** Upright cylinder (axis Z, centred) with radius R, height h and rounded rims r. */
export function sylinder(R: number, h: number, r: number): Felt {
  const rr = Math.max(0, Math.min(r, R, h / 2));
  return (x, y, z) => {
    const dx = Math.hypot(x, y) - (R - rr);
    const dz = Math.abs(z) - (h / 2 - rr);
    return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - rr;
  };
}

/** Upright prism of a 2D rounded rectangle (half sizes hx, hy, corner radius r) between z0 and z1. */
export function avrundetPrisme(hx: number, hy: number, r: number, z0: number, z1: number): Felt {
  const rr = Math.max(0, Math.min(r, hx, hy));
  const zc = (z0 + z1) / 2,
    hz = (z1 - z0) / 2;
  return (x, y, z) => {
    const qx = Math.abs(x) - (hx - rr),
      qy = Math.abs(y) - (hy - rr);
    const d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    const dz = Math.abs(z - zc) - hz;
    return Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0);
  };
}

/** Axis-aligned box between two corners. */
export function boksMellom(a: V3, b: V3): Felt {
  const f = avrundetBoks((b[0] - a[0]) / 2, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2, 0);
  const cx = (a[0] + b[0]) / 2,
    cy = (a[1] + b[1]) / 2,
    cz = (a[2] + b[2]) / 2;
  return (x, y, z) => f(x - cx, y - cy, z - cz);
}

export function union(...f: Felt[]): Felt {
  return (x, y, z) => {
    let d = Infinity;
    for (const g of f) d = Math.min(d, g(x, y, z));
    return d;
  };
}

export function differanse(a: Felt, b: Felt): Felt {
  return (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
}

/**
 * Polynomial smooth minimum. k is the blend radius in mm (a design value,
 * not a tolerance). The result never exceeds min(a, b) by less than
 * k/4, and its gradient is a convex blend of the inputs' gradients, so it
 * stays 1-Lipschitz.
 */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** Rotation matrix (row-major) from Euler angles in degrees, applied X, then Y, then Z. */
export function rotasjon(grader: V3): number[] {
  const [a, b, c] = grader.map((g) => (g * Math.PI) / 180) as V3;
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b),
    cc = Math.cos(c),
    sc = Math.sin(c);
  // Rz · Ry · Rx
  return [
    cc * cb,
    cc * sb * sa - sc * ca,
    cc * sb * ca + sc * sa,
    sc * cb,
    sc * sb * sa + cc * ca,
    sc * sb * ca - cc * sa,
    -sb,
    cb * sa,
    cb * ca,
  ];
}

/** Place a field: rotate by `grader`, then move to `pos`. */
export function plasser(f: Felt, pos: V3, grader: V3): Felt {
  if (grader[0] === 0 && grader[1] === 0 && grader[2] === 0)
    return (x, y, z) => f(x - pos[0], y - pos[1], z - pos[2]);
  const r = rotasjon(grader);
  // inverse rotation = transpose
  return (x, y, z) => {
    const px = x - pos[0],
      py = y - pos[1],
      pz = z - pos[2];
    return f(
      r[0]! * px + r[3]! * py + r[6]! * pz,
      r[1]! * px + r[4]! * py + r[7]! * pz,
      r[2]! * px + r[5]! * py + r[8]! * pz,
    );
  };
}

/** Find where a ray first meets the surface (sphere tracing). */
export function straale(f: Felt, start: V3, retning: V3, maks: number): V3 | null {
  let t = 0;
  for (let i = 0; i < 256 && t <= maks; i++) {
    const x = start[0] + retning[0] * t,
      y = start[1] + retning[1] * t,
      z = start[2] + retning[2] * t;
    const d = f(x, y, z);
    if (d < 0.01) return [x, y, z];
    t += Math.max(d, 0.01);
  }
  return null;
}

export function boksUnion(a: Boks | null, b: Boks | null): Boks | null {
  if (!a) return b;
  if (!b) return a;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    maks: [Math.max(a.maks[0], b.maks[0]), Math.max(a.maks[1], b.maks[1]), Math.max(a.maks[2], b.maks[2])],
  };
}

export function boksSnitt(a: Boks | null, b: Boks | null): Boks | null {
  if (!a || !b) return null;
  const min: V3 = [Math.max(a.min[0], b.min[0]), Math.max(a.min[1], b.min[1]), Math.max(a.min[2], b.min[2])];
  const maks: V3 = [
    Math.min(a.maks[0], b.maks[0]),
    Math.min(a.maks[1], b.maks[1]),
    Math.min(a.maks[2], b.maks[2]),
  ];
  return min[0] <= maks[0] && min[1] <= maks[1] && min[2] <= maks[2] ? { min, maks } : null;
}

export function utvid(b: Boks | null, d: number): Boks | null {
  if (!b) return null;
  return {
    min: [b.min[0] - d, b.min[1] - d, b.min[2] - d],
    maks: [b.maks[0] + d, b.maks[1] + d, b.maks[2] + d],
  };
}

/** Gradient by central differences (outward normal, not normalised). */
export function gradient(f: Felt, p: V3, e = 0.05): V3 {
  return [
    f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]),
    f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]),
    f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e),
  ];
}
