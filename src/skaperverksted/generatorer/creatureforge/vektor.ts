/**
 * Small vector and rotation helpers for Creature Forge. Millimetres, figure
 * coordinates with Z up and the front towards −Y. Matrices are 3 × 3, row
 * major; a matrix's columns are the rotated X, Y and Z axes.
 */
export type V3 = [number, number, number];
export type M3 = number[];

export const ENHET: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const pluss = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const skaler = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const prikk = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const kryss = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const lengde = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

export function normaliser(a: V3): V3 {
  const l = lengde(a);
  return l < 1e-12 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l];
}

export function gange(a: M3, b: M3): M3 {
  const r: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
  return r;
}

export const anvend = (m: M3, v: V3): V3 => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
];

export const transponer = (m: M3): M3 => [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];

/** The matrix whose columns are a, b and c. */
export const kolonner = (a: V3, b: V3, c: V3): M3 => [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
export const kolonne = (m: M3, i: number): V3 => [m[i]!, m[3 + i]!, m[6 + i]!];

/** Rotation about a unit axis, in degrees. */
export function omAkse(akse: V3, grader: number): M3 {
  const [x, y, z] = normaliser(akse);
  const v = (grader * Math.PI) / 180;
  const c = Math.cos(v),
    s = Math.sin(v),
    t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

/** Euler angles in degrees, order XYZ as three.js uses it (R = Rx · Ry · Rz). */
export function fraEuler(g: V3): M3 {
  return gange(gange(omAkse([1, 0, 0], g[0]), omAkse([0, 1, 0], g[1])), omAkse([0, 0, 1], g[2]));
}

/** The inverse of `fraEuler` (degrees), as three.js `Euler.setFromRotationMatrix` with order XYZ. */
export function tilEuler(m: M3): V3 {
  const grad = 180 / Math.PI;
  const m13 = m[2]!;
  const y = Math.asin(Math.max(-1, Math.min(1, m13)));
  let x: number, z: number;
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-m[5]!, m[8]!);
    z = Math.atan2(-m[1]!, m[0]!);
  } else {
    x = Math.atan2(m[7]!, m[4]!);
    z = 0;
  }
  const r = (v: number) => Math.round(v * grad * 1000) / 1000 + 0;
  return [r(x), r(y), r(z)];
}

/** A unit vector perpendicular to `a`, as close to `onsket` as possible. */
export function vinkelrett(a: V3, onsket: V3): V3 {
  const n = normaliser(a);
  let v = minus(onsket, skaler(n, prikk(onsket, n)));
  if (lengde(v) < 1e-6) {
    const reserve: V3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, -1, 0];
    v = minus(reserve, skaler(n, prikk(reserve, n)));
  }
  return normaliser(v);
}

/** Angle between two directions, in degrees. */
export function vinkel(a: V3, b: V3): number {
  const c = prikk(normaliser(a), normaliser(b));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}
