/**
 * Geometry helpers for the dragon tests (classic and brick mode): smallest
 * gap between two sets of closed shells, vertex to surface both ways, and
 * whether a vertex lies inside the other set.
 */
import { avgrensning, type Mesh } from '../../geometri/mesh';
import type { Skall } from './bibliotek';

type V = [number, number, number];

function punkt(m: Mesh, i: number): V {
  return [m.posisjoner[i * 3]!, m.posisjoner[i * 3 + 1]!, m.posisjoner[i * 3 + 2]!];
}

function sub(a: V, b: V): V {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: V, b: V): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V, b: V): V {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Closest distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
function avstandTrekant(p: V, a: V, b: V, c: V): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  const naer = (q: V) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const langs = (o: V, v: V, t: number): V => [o[0] + v[0] * t, o[1] + v[1] * t, o[2] + v[2] * t];
  if (d1 <= 0 && d2 <= 0) return naer(a);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return naer(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return naer(langs(a, ab, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return naer(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return naer(langs(a, ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return naer(langs(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return naer([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

/** Ray-parity inside test against a closed mesh (skewed ray avoids edges). */
function inni(p: V, m: Mesh): boolean {
  const dir: V = [0.5773, 0.5779, 0.5769];
  let treff = 0;
  const t = m.indekser;
  for (let i = 0; i < t.length; i += 3) {
    const a = punkt(m, t[i]!);
    const b = punkt(m, t[i + 1]!);
    const c = punkt(m, t[i + 2]!);
    const e1 = sub(b, a);
    const e2 = sub(c, a);
    const h = cross(dir, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const s = sub(p, a);
    const u = f * dot(s, h);
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1);
    const v = f * dot(dir, q);
    if (v < 0 || u + v > 1) continue;
    if (f * dot(e2, q) > 1e-9) treff++;
  }
  return treff % 2 === 1;
}

const bokser = new WeakMap<Mesh, ReturnType<typeof avgrensning>>();
function iBoks(p: V, m: Mesh, margin: number): boolean {
  let b = bokser.get(m);
  if (!b) {
    b = avgrensning(m);
    bokser.set(m, b);
  }
  return [0, 1, 2].every((k) => p[k]! >= b.min[k]! - margin && p[k]! <= b.maks[k]! + margin);
}

/** Smallest gap between two articulated pieces (vertex to surface, both ways). */
export function minsteAvstand(a: Skall[], b: Skall[], margin: number): { avstand: number; inni: boolean } {
  let avstand = Infinity;
  let inne = false;
  for (const [fra, til] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const s of fra) {
      const n = s.mesh.posisjoner.length / 3;
      for (let i = 0; i < n; i++) {
        const p = punkt(s.mesh, i);
        for (const t of til) {
          if (!iBoks(p, t.mesh, margin)) continue;
          if (inni(p, t.mesh)) inne = true;
          const ix = t.mesh.indekser;
          for (let k = 0; k < ix.length; k += 3) {
            avstand = Math.min(
              avstand,
              avstandTrekant(p, punkt(t.mesh, ix[k]!), punkt(t.mesh, ix[k + 1]!), punkt(t.mesh, ix[k + 2]!)),
            );
          }
        }
      }
    }
  }
  return { avstand, inni: inne };
}
