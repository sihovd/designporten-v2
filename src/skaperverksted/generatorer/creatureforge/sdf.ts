/**
 * Signed distance fields for Creature Forge: negative inside, positive
 * outside, millimetres. Some primitives are bounds rather than exact
 * distances; the mesher only needs the sign and a smooth zero level, and the
 * checks measure distances on the meshes, not on these numbers.
 *
 * Shapes meant to print without supports keep their faces at 45° or steeper
 * in their own frame, where +v is up in the print pose: bicones, and bars
 * and rings with a diamond cross-section.
 */
import { anvend, type M3, type V3 } from './vektor';

export type Felt = (x: number, y: number, z: number) => number;

export interface Boks {
  min: V3;
  maks: V3;
}

export const TOM: Felt = () => Infinity;
const R2 = Math.SQRT1_2;

export function kule(r: number): Felt {
  return (x, y, z) => Math.hypot(x, y, z) - r;
}

/** Ellipsoid with half axes rx, ry, rz (a close bound, exact on the axes). */
export function ellipsoide(rx: number, ry: number, rz: number): Felt {
  return (x, y, z) => {
    const k0 = Math.hypot(x / rx, y / ry, z / rz);
    const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
    if (k1 < 1e-12) return -Math.min(rx, ry, rz);
    return (k0 * (k0 - 1)) / k1;
  };
}

/** Box with half sizes hx, hy, hz and rounded edges (radius r). */
export function avrundetBoks(hx: number, hy: number, hz: number, r: number): Felt {
  const rr = Math.min(r, hx, hy, hz);
  return (x, y, z) => {
    const qx = Math.abs(x) - hx + rr,
      qy = Math.abs(y) - hy + rr,
      qz = Math.abs(z) - hz + rr;
    return (
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr
    );
  };
}

/**
 * Round cone along Z: a sphere of radius r1 at z = 0 and one of radius r2 at
 * z = h, joined by their common tangent cone.
 */
export function avrundetKjegle(r1: number, r2: number, h: number): Felt {
  const b = (r1 - r2) / h;
  const a = Math.sqrt(Math.max(0, 1 - b * b));
  return (x, y, z) => {
    const qx = Math.hypot(x, y);
    const k = -b * qx + a * z;
    if (k < 0) return Math.hypot(qx, z) - r1;
    if (k > a * h) return Math.hypot(qx, z - h) - r2;
    return qx * a + z * b - r1;
  };
}

/** Bicone about the v axis (the third coordinate): radius r at v = 0, 45° faces up and down. */
export function bikjegle(r: number): Felt {
  return (t, s, v) => (Math.hypot(t, s) + Math.abs(v) - r) * R2;
}

/** Vertical cylinder about the v axis from v0 to v1. */
export function sylinder(r: number, v0: number, v1: number): Felt {
  return (t, s, v) => Math.max(Math.hypot(t, s) - r, v0 - v, v - v1);
}

/** Bar along t from t0 to t1, diamond cross-section with half diagonal e, centred at v = vc. */
export function diamantstang(t0: number, t1: number, e: number, vc = 0): Felt {
  const midt = (t0 + t1) / 2,
    halv = Math.abs(t1 - t0) / 2;
  return (t, s, v) => Math.max((Math.abs(s) + Math.abs(v - vc) - e) * R2, Math.abs(t - midt) - halv);
}

/** Ring about the v axis with centre radius R and a diamond cross-section (half diagonal e). */
export function diamantring(R: number, e: number): Felt {
  return (t, s, v) => (Math.abs(Math.hypot(t, s) - R) + Math.abs(v) - e) * R2;
}

/**
 * The room a radial diamond bar sweeps when it turns ±`sving` degrees about
 * the v axis: the bar runs along +t from radius r0 to r1 at v = vc.
 */
export function sveiptStang(r0: number, r1: number, e: number, sving: number, vc = 0): Felt {
  const grense = (sving * Math.PI) / 180;
  return (t, s, v) => {
    const rho = Math.hypot(t, s);
    const utenfor = Math.max(0, Math.abs(Math.atan2(s, t)) - grense);
    const sideveis = utenfor >= Math.PI / 2 ? rho : rho * Math.sin(utenfor);
    return Math.max((sideveis + Math.abs(v - vc) - e) * R2, rho - r1, r0 - rho);
  };
}

export function union(...f: Felt[]): Felt {
  const liste = f.filter((x) => x !== TOM);
  if (!liste.length) return TOM;
  if (liste.length === 1) return liste[0]!;
  return (x, y, z) => {
    let d = Infinity;
    for (const g of liste) d = Math.min(d, g(x, y, z));
    return d;
  };
}

export function differanse(a: Felt, b: Felt): Felt {
  if (b === TOM) return a;
  return (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
}

/** Grow (positive d) or shrink a field. */
export function vokse(f: Felt, d: number): Felt {
  if (f === TOM) return TOM;
  return (x, y, z) => f(x, y, z) - d;
}

/** A field given in a local frame (columns of `ramme` = the frame's axes in the world) placed at `origo`. */
export function iRamme(f: Felt, ramme: M3, origo: V3): Felt {
  if (f === TOM) return TOM;
  // the inverse of a rotation is its transpose: local = Rᵀ · (p − origo)
  const [a, b, c, d, e, g, h, i, j] = ramme as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const [ox, oy, oz] = origo;
  return (x, y, z) => {
    const px = x - ox,
      py = y - oy,
      pz = z - oz;
    return f(a * px + d * py + h * pz, b * px + e * py + i * pz, c * px + g * py + j * pz);
  };
}

/** Skips a field outside its box (grown by `margin`), where it cannot change a union or a cut. */
export function avgrenset(f: Felt, b: Boks, margin = 1): Felt {
  if (f === TOM) return TOM;
  const [x0, y0, z0] = b.min,
    [x1, y1, z1] = b.maks;
  return (x, y, z) => {
    const ute = Math.max(x0 - x, x - x1, y0 - y, y - y1, z0 - z, z - z1);
    return ute > margin ? ute : f(x, y, z);
  };
}

export function boksUnion(a: Boks | null, b: Boks | null): Boks | null {
  if (!a) return b;
  if (!b) return a;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    maks: [Math.max(a.maks[0], b.maks[0]), Math.max(a.maks[1], b.maks[1]), Math.max(a.maks[2], b.maks[2])],
  };
}

export const utvid = (b: Boks, d: number): Boks => ({
  min: [b.min[0] - d, b.min[1] - d, b.min[2] - d],
  maks: [b.maks[0] + d, b.maks[1] + d, b.maks[2] + d],
});

/** The world box of a local box moved into a frame. */
export function boksIRamme(b: Boks, ramme: M3, origo: V3): Boks {
  let ut: Boks | null = null;
  for (let i = 0; i < 8; i++) {
    const p: V3 = [i & 1 ? b.maks[0] : b.min[0], i & 2 ? b.maks[1] : b.min[1], i & 4 ? b.maks[2] : b.min[2]];
    const w = anvend(ramme, p);
    const q: V3 = [w[0] + origo[0], w[1] + origo[1], w[2] + origo[2]];
    ut = boksUnion(ut, { min: q, maks: q });
  }
  return ut!;
}

/** A sphere's box. */
export const kuleboks = (senter: V3, r: number): Boks => ({
  min: [senter[0] - r, senter[1] - r, senter[2] - r],
  maks: [senter[0] + r, senter[1] + r, senter[2] + r],
});

/** Field gradient from four samples on a tetrahedron (not normalised). */
export function gradient(f: Felt, p: V3, e = 0.05): V3 {
  const a = f(p[0] + e, p[1] - e, p[2] - e),
    b = f(p[0] - e, p[1] - e, p[2] + e),
    c = f(p[0] - e, p[1] + e, p[2] - e),
    d = f(p[0] + e, p[1] + e, p[2] + e);
  return [a - b - c + d, -a - b + c + d, -a + b - c + d];
}
