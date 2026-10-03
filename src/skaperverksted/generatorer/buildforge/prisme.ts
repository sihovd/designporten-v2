/**
 * Exact meshes for the protected mechanics (handoff §7.2): prisms with
 * stepped or blind holes, built from straight walls and triangulated caps.
 * These are never voxelised, so the switch seat and the cross socket keep
 * their exact sizes in the exported file.
 */
import earcut from 'earcut';
import { MeshBygger, type Mesh } from '../../geometri/mesh';

export type P2 = [number, number];

/** Counter-clockwise rounded rectangle with half sizes hx, hy. */
export function avrundetRektangel(hx: number, hy: number, r: number, segmenter = 6): P2[] {
  const rr = Math.max(0, Math.min(r, hx, hy));
  if (rr === 0)
    return [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
    ];
  const ut: P2[] = [];
  const hjorner: [number, number, number][] = [
    [hx - rr, -hy + rr, -Math.PI / 2],
    [hx - rr, hy - rr, 0],
    [-hx + rr, hy - rr, Math.PI / 2],
    [-hx + rr, -hy + rr, Math.PI],
  ];
  for (const [cx, cy, a0] of hjorner)
    for (let i = 0; i <= segmenter; i++) {
      const a = a0 + (i / segmenter) * (Math.PI / 2);
      ut.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  return ut;
}

/** Counter-clockwise circle. */
export function sirkel(r: number, segmenter = 32): P2[] {
  return Array.from({ length: segmenter }, (_, i) => {
    const a = (i / segmenter) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a)] as P2;
  });
}

/** Counter-clockwise plus-shaped outline: arm length l (tip to tip), thickness t. */
export function kors(l: number, t: number): P2[] {
  const a = l / 2,
    b = t / 2;
  return [
    [b, -a],
    [b, -b],
    [a, -b],
    [a, b],
    [b, b],
    [b, a],
    [-b, a],
    [-b, b],
    [-a, b],
    [-a, -b],
    [-b, -b],
    [-b, -a],
  ];
}

export interface Hullseksjon {
  /** Counter-clockwise outline, inside the outer outline. */
  omriss: P2[];
  z0: number;
  z1: number;
}

function areal(p: P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i]!,
      r = p[(i + 1) % p.length]!;
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a / 2;
}

/**
 * Triangulate the region inside `ytre` and outside `hull` (may be null) at
 * height z. `opp` = normal +Z.
 */
function lokk(b: MeshBygger, ytre: P2[], hull: P2[] | null, z: number, opp: boolean): void {
  const flat: number[] = [];
  for (const p of ytre) flat.push(p[0], p[1]);
  const hullStart = flat.length / 2;
  if (hull) for (const p of hull) flat.push(p[0], p[1]);
  const t = earcut(flat, hull ? [hullStart] : undefined);
  const ids = [];
  for (let i = 0; i < flat.length / 2; i++) ids.push(b.punkt(flat[i * 2]!, flat[i * 2 + 1]!, z));
  for (let i = 0; i < t.length; i += 3) {
    const a = ids[t[i]!]!,
      c = ids[t[i + 1]!]!,
      d = ids[t[i + 2]!]!;
    // earcut keeps the winding of the input (CCW seen from +Z) for these inputs; check per triangle
    const pa = flat.slice(t[i]! * 2, t[i]! * 2 + 2),
      pc = flat.slice(t[i + 1]! * 2, t[i + 1]! * 2 + 2),
      pd = flat.slice(t[i + 2]! * 2, t[i + 2]! * 2 + 2);
    const ccw = (pc[0]! - pa[0]!) * (pd[1]! - pa[1]!) - (pc[1]! - pa[1]!) * (pd[0]! - pa[0]!) > 0;
    if (ccw === opp) b.trekant(a, c, d);
    else b.trekant(a, d, c);
  }
}

/** Vertical walls along a loop. `utover` = normals point away from the loop's inside. */
function vegger(b: MeshBygger, omriss: P2[], z0: number, z1: number, utover: boolean): void {
  const n = omriss.length;
  for (let i = 0; i < n; i++) {
    const p = omriss[i]!,
      q = omriss[(i + 1) % n]!;
    const a = b.punkt(p[0], p[1], z0),
      c = b.punkt(q[0], q[1], z0),
      d = b.punkt(q[0], q[1], z1),
      e = b.punkt(p[0], p[1], z1);
    if (utover) b.firkant(a, c, d, e);
    else b.firkant(a, e, d, c);
  }
}

/**
 * A closed prism from z0 to z1 with an optional hole made of stacked
 * sections that start at the bottom (z0) and follow each other without
 * gaps. A hole that stops below z1 gets a ceiling (a blind hole); one that
 * reaches z1 goes through. Caps are separate vertices from the walls, so
 * consumers merge positions when they check closedness (sjekkManifold does).
 */
export function prisme(ytre: P2[], z0: number, z1: number, hull: Hullseksjon[] = []): Mesh {
  const b = new MeshBygger();
  const o = areal(ytre) < 0 ? [...ytre].reverse() : ytre;
  const seksjoner = hull.map((h) => ({
    ...h,
    omriss: areal(h.omriss) < 0 ? [...h.omriss].reverse() : h.omriss,
  }));
  vegger(b, o, z0, z1, true);
  if (!seksjoner.length) {
    lokk(b, o, null, z0, false);
    lokk(b, o, null, z1, true);
    return b.bygg();
  }
  const forste = seksjoner[0]!;
  const siste = seksjoner.at(-1)!;
  lokk(b, o, forste.omriss, z0, false);
  for (let i = 0; i < seksjoner.length; i++) {
    const s = seksjoner[i]!;
    vegger(b, s.omriss, s.z0, s.z1, false);
    const neste = seksjoner[i + 1];
    if (neste) {
      // step between two sections: the ring between the larger and the smaller outline
      if (Math.abs(areal(neste.omriss)) < Math.abs(areal(s.omriss)))
        lokk(b, s.omriss, neste.omriss, s.z1, false); // ceiling of the wider section below
      else lokk(b, neste.omriss, s.omriss, s.z1, true); // floor of the wider section above
    }
  }
  if (siste.z1 >= z1 - 1e-9) lokk(b, o, siste.omriss, z1, true);
  else {
    lokk(b, siste.omriss, null, siste.z1, false); // ceiling of a blind hole
    lokk(b, o, null, z1, true);
  }
  return b.bygg();
}
