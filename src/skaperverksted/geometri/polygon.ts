/**
 * Planar regions in millimetres and robust booleans/offsets via Clipper2.
 * Coordinates are scaled to integers (SKALA per mm) inside Clipper so
 * results are exact and shared vertices stay bit-identical, which keeps
 * the extruded meshes watertight.
 *
 * Library: clipper2-ts (TypeScript port of Clipper2, BSL-1.0). The older
 * clipper2-js port was rejected: its PolyTree output and miter offsets
 * are broken.
 */
import {
  ClipType,
  EndType,
  FillRule,
  JoinType,
  PolyTree64,
  area as clipperAreal,
  booleanOpWithPolyTree,
  inflatePaths,
  simplifyPaths,
  triangulate,
  TriangulateResult,
  type Path64,
  type Paths64,
  type PolyPath64,
} from 'clipper2-ts';
import type { Vec2 } from '../core/geometri2d';

/** Integer units per millimetre (0.1 µm resolution). */
export const SKALA = 10_000;

/** A closed ring. Outer rings counter-clockwise (Y up), holes clockwise. */
export type Ring = Vec2[];

/** A polygon with holes. */
export interface Flate {
  ytre: Ring;
  hull: Ring[];
}

/** A region: zero or more disjoint polygons with holes. */
export type Region = Flate[];

export type Fyllregel = 'nonzero' | 'evenodd';

function tilPath(r: Ring): Path64 {
  return r.map((v) => ({ x: Math.round(v.x * SKALA), y: Math.round(v.y * SKALA) }));
}

function tilPaths(ringer: Ring[]): Paths64 {
  return ringer.filter((r) => r.length >= 3).map(tilPath);
}

/**
 * Integer path → ring in mm, without duplicate or exactly collinear
 * vertices. Clipper keeps collinear points by default; the triangulator
 * drops them, which would leave T-junctions in the mesh. Removing them
 * here, in exact integer arithmetic, keeps every consumer consistent.
 */
function fraPath(p: Path64): Ring {
  const q: { x: number; y: number }[] = [];
  for (const v of p) {
    const siste = q.at(-1);
    if (!siste || siste.x !== v.x || siste.y !== v.y) q.push({ x: v.x, y: v.y });
  }
  while (q.length > 1 && q[0]!.x === q.at(-1)!.x && q[0]!.y === q.at(-1)!.y) q.pop();
  let endret = true;
  while (endret && q.length >= 3) {
    endret = false;
    for (let i = 0; i < q.length && q.length >= 3; i++) {
      const a = q[(i + q.length - 1) % q.length]!,
        b = q[i]!,
        c = q[(i + 1) % q.length]!;
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) === 0) {
        q.splice(i, 1);
        i--;
        endret = true;
      }
    }
  }
  return q.map((v) => ({ x: v.x / SKALA, y: v.y / SKALA }));
}

/** All rings of a region (outer and holes) as flat paths. */
export function ringerI(region: Region): Ring[] {
  const ut: Ring[] = [];
  for (const f of region) {
    ut.push(f.ytre);
    for (const h of f.hull) ut.push(h);
  }
  return ut;
}

function fraTre(tre: PolyTree64): Region {
  const ut: Region = [];
  const besok = (node: PolyPath64) => {
    for (let i = 0; i < node.count; i++) {
      const ytre = node.child(i);
      if (!ytre.polygon) continue;
      // ytre is an outer ring; its children are holes; their children are islands
      const flate: Flate = { ytre: fraPath(ytre.polygon), hull: [] };
      for (let j = 0; j < ytre.count; j++) {
        const hull = ytre.child(j);
        if (hull.polygon) {
          const r = fraPath(hull.polygon);
          if (r.length >= 3) flate.hull.push(r);
        }
        besok(hull);
      }
      if (flate.ytre.length >= 3) ut.push(flate);
    }
  };
  besok(tre);
  return ut;
}

function fyll(regel: Fyllregel): FillRule {
  return regel === 'evenodd' ? FillRule.EvenOdd : FillRule.NonZero;
}

function tilRegion(type: ClipType, a: Paths64, b: Paths64 | null, regel: FillRule): Region {
  const tre = new PolyTree64();
  booleanOpWithPolyTree(type, a, b, tre, regel);
  return fraTre(tre);
}

/** Normalise arbitrary rings (any orientation, overlaps) into a clean region. */
export function regionFraRinger(ringer: Ring[], regel: Fyllregel = 'nonzero'): Region {
  return tilRegion(ClipType.Union, tilPaths(ringer), null, fyll(regel));
}

function operasjon(type: ClipType, a: Region, b: Region): Region {
  return tilRegion(type, tilPaths(ringerI(a)), tilPaths(ringerI(b)), FillRule.NonZero);
}

export const union = (a: Region, b: Region): Region => operasjon(ClipType.Union, a, b);
export const differanse = (a: Region, b: Region): Region => operasjon(ClipType.Difference, a, b);
export const snitt = (a: Region, b: Region): Region => operasjon(ClipType.Intersection, a, b);

export function unionAlle(regioner: Region[]): Region {
  return regionFraRinger(regioner.flatMap(ringerI));
}

export type Hjorne = 'rund' | 'skarp' | 'faset';

/**
 * Offset a region by `avstand` mm (positive grows, negative shrinks).
 * Returns [] when shrinking removes everything.
 */
export function forskyv(region: Region, avstand: number, hjorne: Hjorne = 'rund'): Region {
  if (Math.abs(avstand) < 1e-6) return region;
  const join = hjorne === 'rund' ? JoinType.Round : hjorne === 'faset' ? JoinType.Bevel : JoinType.Miter;
  // ~0.01 mm arc tolerance: smooth enough for printing, cheap enough for preview
  const ut = inflatePaths(tilPaths(ringerI(region)), avstand * SKALA, join, EndType.Polygon, 2, 0.01 * SKALA);
  return tilRegion(ClipType.Union, ut, null, FillRule.NonZero);
}

/** Area in mm² (holes subtracted). */
export function areal(region: Region): number {
  let a = 0;
  for (const r of ringerI(region)) a += clipperAreal(tilPath(r));
  return a / (SKALA * SKALA);
}

/** Remove near-collinear points and tiny slivers (tolerance in mm). */
export function forenkle(region: Region, toleranse = 0.005): Region {
  const ps = simplifyPaths(tilPaths(ringerI(region)), toleranse * SKALA, true);
  return tilRegion(ClipType.Union, ps, null, FillRule.NonZero);
}

/** Signed area of a ring (positive = counter-clockwise). */
export function ringAreal(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]!.x + r[i]!.x) * (r[j]!.y - r[i]!.y);
  return -a / 2;
}

export function regionBoks(region: Region): { minX: number; minY: number; maksX: number; maksY: number } {
  let minX = Infinity,
    minY = Infinity,
    maksX = -Infinity,
    maksY = -Infinity;
  for (const f of region)
    for (const p of f.ytre) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maksX = Math.max(maksX, p.x);
      maksY = Math.max(maksY, p.y);
    }
  return { minX, minY, maksX, maksY };
}

export function transformerRegion(region: Region, fn: (p: Vec2) => Vec2): Region {
  const snu = (() => {
    // mirror transforms flip orientation; detect with a unit triangle
    const a = fn({ x: 0, y: 0 });
    const b = fn({ x: 1, y: 0 });
    const c = fn({ x: 0, y: 1 });
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0;
  })();
  const t = (r: Ring) => {
    const u = r.map(fn);
    return snu ? u.reverse() : u;
  };
  return region.map((f) => ({ ytre: t(f.ytre), hull: f.hull.map(t) }));
}

/**
 * Triangulate one polygon with holes (constrained Delaunay, no added
 * vertices). Returns triangles as mm coordinates, or null if the
 * triangulator gives up (the caller falls back to earcut).
 */
export function trianguler(f: Flate, delaunay = true): [Vec2, Vec2, Vec2][] | null {
  const { result, solution } = triangulate(tilPaths([f.ytre, ...f.hull]), delaunay);
  if (result !== TriangulateResult.success) return null;
  const ut: [Vec2, Vec2, Vec2][] = [];
  for (const t of solution) {
    if (t.length !== 3) continue;
    const [a, b, c] = t as [Path64[number], Path64[number], Path64[number]];
    ut.push([
      { x: a.x / SKALA, y: a.y / SKALA },
      { x: b.x / SKALA, y: b.y / SKALA },
      { x: c.x / SKALA, y: c.y / SKALA },
    ]);
  }
  return ut;
}
