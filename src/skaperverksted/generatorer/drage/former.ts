/**
 * Closed-mesh primitives for the dragon: lofts, domes, revolved bodies,
 * tubes and extrusions. Every function returns one closed, outward-facing
 * shell (checked by the tests with `sjekkManifold`). Millimetres, Z up.
 */
import earcut from 'earcut';
import { MeshBygger, type Mesh } from '../../geometri/mesh';

export type V2 = [number, number];
export type V3 = [number, number, number];

/** Signed area (positive = counter-clockwise). */
export function areal(p: V2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Triangulate a simple horizontal polygon at height z, facing up or down. */
export function flate(b: MeshBygger, punkter: V2[], z: number, opp: boolean): void {
  const flat: number[] = [];
  for (const p of punkter) flat.push(p[0], p[1]);
  const t = earcut(flat);
  const ix = punkter.map((p) => b.punkt(p[0], p[1], z));
  for (let i = 0; i < t.length; i += 3) {
    const a = punkter[t[i]!]!;
    const c = punkter[t[i + 1]!]!;
    const d = punkter[t[i + 2]!]!;
    const ccw = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]) > 0;
    if (ccw === opp) b.trekant(ix[t[i]!]!, ix[t[i + 1]!]!, ix[t[i + 2]!]!);
    else b.trekant(ix[t[i]!]!, ix[t[i + 2]!]!, ix[t[i + 1]!]!);
  }
}

export type Ende = { type: 'plan' } | { type: 'vifte' } | { type: 'punkt'; p: V3 } | { type: 'apen' };

/**
 * Loft through rings of equal length. Rings are counter-clockwise seen
 * from the far end (looking back along the loft direction... i.e. seen
 * from above for an upward loft). `plan` caps assume a horizontal ring.
 */
export function loft(b: MeshBygger, ringer: V3[][], bunn: Ende, topp: Ende): void {
  const n = ringer[0]!.length;
  const ix = ringer.map((r) => r.map((p) => b.punkt(p[0], p[1], p[2])));
  for (let k = 0; k + 1 < ix.length; k++) {
    const lo = ix[k]!;
    const up = ix[k + 1]!;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      b.firkant(lo[i]!, lo[j]!, up[j]!, up[i]!);
    }
  }
  lukk(b, ringer[0]!, ix[0]!, bunn, false);
  lukk(b, ringer.at(-1)!, ix.at(-1)!, topp, true);
}

function lukk(b: MeshBygger, ring: V3[], ix: number[], ende: Ende, topp: boolean): void {
  const n = ring.length;
  if (ende.type === 'apen') return;
  if (ende.type === 'plan') {
    flate(
      b,
      ring.map((p) => [p[0], p[1]] as V2),
      ring[0]![2],
      topp,
    );
    return;
  }
  let senter: V3;
  if (ende.type === 'punkt') senter = ende.p;
  else {
    senter = [0, 0, 0];
    for (const p of ring) for (let k = 0; k < 3; k++) senter[k]! += p[k]! / n;
  }
  const c = b.punkt(senter[0], senter[1], senter[2]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (topp) b.trekant(ix[i]!, ix[j]!, c);
    else b.trekant(ix[j]!, ix[i]!, c);
  }
}

/** Superellipse outline with separate front/back half-lengths. */
export interface Omriss {
  cx: number;
  cy: number;
  /** Half-length forward (+X) and backward (−X). */
  af: number;
  ab: number;
  /** Half-width. */
  b: number;
  /** Superellipse exponent (2 = ellipse, higher = boxier). */
  n: number;
  /** Rotation about Z, radians. */
  vinkel?: number;
}

export function omrissPunkt(o: Omriss, t: number, skala = 1): V2 {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const lx = (c >= 0 ? o.af : o.ab) * Math.sign(c) * Math.abs(c) ** (2 / o.n) * skala;
  const ly = o.b * Math.sign(s) * Math.abs(s) ** (2 / o.n) * skala;
  const v = o.vinkel ?? 0;
  if (!v) return [o.cx + lx, o.cy + ly];
  return [o.cx + lx * Math.cos(v) - ly * Math.sin(v), o.cy + lx * Math.sin(v) + ly * Math.cos(v)];
}

/** 0 at the centre, 1 on the outline (unrotated outlines only). */
export function omrissNorm(o: Omriss, x: number, y: number): number {
  const dx = x - o.cx;
  const dy = y - o.cy;
  const ax = dx >= 0 ? o.af : o.ab;
  return (Math.abs(dx / ax) ** o.n + Math.abs(dy / o.b) ** o.n) ** (1 / o.n);
}

/** Curve parameter of a point on the outline (unrotated outlines only). */
export function omrissParameter(o: Omriss, x: number, y: number): number {
  const dx = x - o.cx;
  const dy = y - o.cy;
  const ax = dx >= 0 ? o.af : o.ab;
  const u = Math.sign(dx) * Math.abs(dx / ax) ** (o.n / 2);
  const w = Math.sign(dy) * Math.abs(dy / o.b) ** (o.n / 2);
  return Math.atan2(w, u);
}

/** Vertical dome profile: walls straight up to `vegg`, then elliptical to `hoyde`. */
export interface Kuppelprofil {
  vegg: number;
  hoyde: number;
  /** Number of rings in the rounded part. */
  ringer: number;
}

export function kuppelNivaa(p: Kuppelprofil): { z: number; skala: number }[] {
  const ut: { z: number; skala: number }[] = [];
  for (let k = 1; k < p.ringer; k++) {
    const beta = (k / p.ringer) * (Math.PI / 2);
    ut.push({ z: p.vegg + (p.hoyde - p.vegg) * Math.sin(beta), skala: Math.cos(beta) });
  }
  return ut;
}

/** Height of a dome's surface above (x, y), or 0 outside. */
export function kuppelHoyde(o: Omriss, p: Kuppelprofil, x: number, y: number): number {
  const r = omrissNorm(o, x, y);
  if (r > 1) return 0;
  return p.vegg + (p.hoyde - p.vegg) * Math.sqrt(1 - r * r);
}

/** Flat-bottomed dome over an outline. */
export function kuppel(o: Omriss, p: Kuppelprofil, segmenter = 48, zBunn = 0): Mesh {
  const b = new MeshBygger();
  const ts = Array.from({ length: segmenter }, (_, i) => -Math.PI + (i / segmenter) * 2 * Math.PI);
  const ring = (z: number, s: number): V3[] =>
    ts.map((t) => {
      const q = omrissPunkt(o, t, s);
      return [q[0], q[1], z];
    });
  const ringer: V3[][] = [ring(zBunn, 1)];
  if (p.vegg > zBunn) ringer.push(ring(p.vegg, 1));
  for (const n of kuppelNivaa(p)) ringer.push(ring(n.z, n.skala));
  loft(b, ringer, { type: 'vifte' }, { type: 'punkt', p: [o.cx, o.cy, p.hoyde] });
  return b.bygg();
}

/** Solid of revolution about a vertical axis. Profile [r, z] from bottom to top, r > 0. */
export function omdreining(cx: number, cy: number, profil: [number, number][], segmenter = 32): Mesh {
  const b = new MeshBygger();
  const ringer = profil.map(([r, z]) =>
    Array.from({ length: segmenter }, (_, i) => {
      const t = (i / segmenter) * 2 * Math.PI;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t), z] as V3;
    }),
  );
  loft(b, ringer, { type: 'vifte' }, { type: 'vifte' });
  return b.bygg();
}

export function boks(min: V3, maks: V3): Mesh {
  const b = new MeshBygger();
  const ring = (z: number): V3[] => [
    [min[0], min[1], z],
    [maks[0], min[1], z],
    [maks[0], maks[1], z],
    [min[0], maks[1], z],
  ];
  loft(b, [ring(min[2]), ring(maks[2])], { type: 'vifte' }, { type: 'vifte' });
  return b.bygg();
}

function normaliser(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function kryss(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Tube along a path with a radius per point; a final radius of 0 ends in a
 * point (horns, spikes, claws). Rings stay perpendicular to the path.
 */
export function ror(sti: V3[], radier: number[], segmenter = 16): Mesh {
  const b = new MeshBygger();
  const ringer: V3[][] = [];
  let spiss: V3 | null = null;
  let forrigeU: V3 | null = null;
  for (let k = 0; k < sti.length; k++) {
    const p = sti[k]!;
    const r = radier[k]!;
    const fra = sti[Math.max(0, k - 1)]!;
    const til = sti[Math.min(sti.length - 1, k + 1)]!;
    const d = normaliser([til[0] - fra[0], til[1] - fra[1], til[2] - fra[2]]);
    if (r <= 0 && k === sti.length - 1) {
      spiss = p;
      break;
    }
    // Stable frame: keep the previous ring's u as close as possible.
    let u: V3 = forrigeU ?? (Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
    u = normaliser(kryss(kryss(d, u), d));
    const w = kryss(d, u);
    forrigeU = u;
    ringer.push(
      Array.from({ length: segmenter }, (_, i) => {
        const t = (i / segmenter) * 2 * Math.PI;
        const c = Math.cos(t) * r;
        const s = Math.sin(t) * r;
        return [p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s] as V3;
      }),
    );
  }
  loft(b, ringer, { type: 'vifte' }, spiss ? { type: 'punkt', p: spiss } : { type: 'vifte' });
  return b.bygg();
}

/** Ellipsoid (lat-long). */
export function ellipsoide(senter: V3, radier: V3, segmenter = 24, bredder = 12): Mesh {
  const b = new MeshBygger();
  const ringer: V3[][] = [];
  for (let k = 1; k < bredder; k++) {
    const phi = -Math.PI / 2 + (k / bredder) * Math.PI;
    const z = senter[2] + radier[2] * Math.sin(phi);
    const c = Math.cos(phi);
    ringer.push(
      Array.from({ length: segmenter }, (_, i) => {
        const t = (i / segmenter) * 2 * Math.PI;
        return [senter[0] + radier[0] * c * Math.cos(t), senter[1] + radier[1] * c * Math.sin(t), z] as V3;
      }),
    );
  }
  loft(
    b,
    ringer,
    { type: 'punkt', p: [senter[0], senter[1], senter[2] - radier[2]] },
    { type: 'punkt', p: [senter[0], senter[1], senter[2] + radier[2]] },
  );
  return b.bygg();
}

/** Extrude a simple polygon (any winding) from z0 to z1. */
export function ekstruder(polygon: V2[], z0: number, z1: number): Mesh {
  const p = areal(polygon) < 0 ? [...polygon].reverse() : polygon;
  const b = new MeshBygger();
  const ring = (z: number): V3[] => p.map((q) => [q[0], q[1], z]);
  loft(b, [ring(z0), ring(z1)], { type: 'plan' }, { type: 'plan' });
  return b.bygg();
}

/**
 * Extrude a polygon drawn in the XZ plane (x, z) through y0..y1: upright
 * plates such as back plates. Handles the axis swap's mirror.
 */
export function ekstruderXZ(polygon: V2[], y0: number, y1: number): Mesh {
  const m = ekstruder(polygon, y0, y1);
  const p = m.posisjoner;
  for (let i = 0; i < p.length; i += 3) {
    const y = p[i + 1]!;
    p[i + 1] = p[i + 2]!;
    p[i + 2] = y;
  }
  const t = m.indekser;
  for (let i = 0; i < t.length; i += 3) {
    const x = t[i + 1]!;
    t[i + 1] = t[i + 2]!;
    t[i + 2] = x;
  }
  return m;
}

/** Translate and/or mirror a mesh in Y (mirroring flips the winding). */
export function speilY(m: Mesh): Mesh {
  const p = new Float32Array(m.posisjoner);
  for (let i = 1; i < p.length; i += 3) p[i] = -p[i]!;
  const t = new Uint32Array(m.indekser);
  for (let i = 0; i < t.length; i += 3) {
    const x = t[i + 1]!;
    t[i + 1] = t[i + 2]!;
    t[i + 2] = x;
  }
  return { posisjoner: p, indekser: t };
}

export function flytt(m: Mesh, dx: number, dy: number, dz: number): Mesh {
  const p = new Float32Array(m.posisjoner);
  for (let i = 0; i < p.length; i += 3) {
    p[i] = p[i]! + dx;
    p[i + 1] = p[i + 1]! + dy;
    p[i + 2] = p[i + 2]! + dz;
  }
  return { posisjoner: p, indekser: m.indekser };
}
