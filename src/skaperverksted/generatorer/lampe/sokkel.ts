/**
 * The base of a lamp built around a light module (Bambu Lab LED Lamp Kit 001
 * or a user-defined puck), and the small fit-test piece.
 *
 * The base is a stack of slabs with vertical walls, each slab a planar
 * region (see maskinvare.ts `Modulmal` for the section):
 *
 *   [0, zKanal]       outline − cable hole − cable channel (open underneath)
 *   [zKanal, zGulv]   outline − cable hole                  (floor)
 *   [zGulv, zKlem]    outline − recess
 *   [zKlem, zTopp]    outline − lip opening                 (only with a lip)
 *
 * Horizontal faces are the region differences between neighbouring slabs,
 * like geometri/ekstruder.ts. The channel cuts the outline, so slab walls
 * meet at points that lie inside a neighbour's wall edge (T-junctions);
 * `sveis` merges the vertices and splits those edges so the solid is one
 * watertight 2-manifold. The lamp's shade is joined on top the same way.
 */
import { MeshBygger, type Mesh } from '../../geometri/mesh';
import { triangulerSikkert } from '../../geometri/ekstruder';
import {
  SKALA,
  differanse,
  regionFraRinger,
  ringAreal,
  type Region,
  type Ring,
} from '../../geometri/polygon';
import { PROVEBIT_KANT, type Modulmal } from './maskinvare';

/** Round to the Clipper grid, so vertices built here and by Clipper coincide exactly. */
export const rund = (v: number): number => Math.round(v * SKALA) / SKALA;

/** Circle as a counter-clockwise ring on the Clipper grid. */
export function sirkel(r: number, n = 160): Ring {
  const ut: Ring = [];
  for (let j = 0; j < n; j++) {
    const v = (j / n) * Math.PI * 2;
    ut.push({ x: rund(r * Math.cos(v)), y: rund(r * Math.sin(v)) });
  }
  return ut;
}

/** The cable channel: a strip from the centre out through the back (+Y). */
function kanal(bredde: number, lengde: number): Ring {
  const b = rund(bredde / 2);
  const l = rund(lengde);
  return [
    { x: -b, y: 0 },
    { x: b, y: 0 },
    { x: b, y: l },
    { x: -b, y: l },
  ];
}

interface Skive {
  z0: number;
  z1: number;
  region: Region;
}

function orienter(r: Ring, ccw: boolean): Ring {
  return ringAreal(r) > 0 === ccw ? r : [...r].reverse();
}

function flate(b: MeshBygger, region: Region, z: number, opp: boolean): void {
  for (const f of region) {
    for (const [p, q, r] of triangulerSikkert(f)) {
      const areal = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      if (areal === 0) continue;
      const a = b.punkt(p.x, p.y, z);
      const c = b.punkt(q.x, q.y, z);
      const d = b.punkt(r.x, r.y, z);
      if (areal > 0 === opp) b.trekant(a, c, d);
      else b.trekant(a, d, c);
    }
  }
}

function vegger(b: MeshBygger, s: Skive): void {
  for (const f of s.region) {
    for (const r of [orienter(f.ytre, true), ...f.hull.map((h) => orienter(h, false))]) {
      for (let i = 0; i < r.length; i++) {
        const p = r[i]!;
        const q = r[(i + 1) % r.length]!;
        const a0 = b.punkt(p.x, p.y, s.z0);
        const b0 = b.punkt(q.x, q.y, s.z0);
        const b1 = b.punkt(q.x, q.y, s.z1);
        const a1 = b.punkt(p.x, p.y, s.z1);
        b.trekant(a0, b0, b1);
        b.trekant(a0, b1, a1);
      }
    }
  }
}

/** Slabs for a base with the given outline (a ring on the Clipper grid). */
export function sokkelSkiver(omriss: Ring, m: Modulmal): Skive[] {
  const O = regionFraRinger([omriss]);
  let R = 0;
  for (const v of omriss) R = Math.max(R, Math.hypot(v.x, v.y));
  const hull = regionFraRinger([sirkel(m.rHull)]);
  const lomme = regionFraRinger([sirkel(m.rLomme)]);
  const utenHull = differanse(O, hull);
  const skiver: Skive[] = [
    { z0: 0, z1: m.zKanal, region: differanse(utenHull, regionFraRinger([kanal(m.kanalBredde, R + 10)])) },
    { z0: m.zKanal, z1: m.zGulv, region: utenHull },
    { z0: m.zGulv, z1: m.zKlem, region: differanse(O, lomme) },
  ];
  if (m.zTopp - m.zKlem > 1e-6) {
    skiver.push({
      z0: m.zKlem,
      z1: m.zTopp,
      region: differanse(O, regionFraRinger([sirkel(m.rApning)])),
    });
  }
  return skiver;
}

/**
 * Build the slab stack into `b`. The top face at zTopp is `topp` (for a lamp:
 * the area inside the shade's inner wall minus the opening); undefined means
 * the whole top slab (the fit-test piece).
 */
export function byggSokkel(b: MeshBygger, omriss: Ring, m: Modulmal, topp?: Region): void {
  const skiver = sokkelSkiver(omriss, m);
  flate(b, skiver[0]!.region, skiver[0]!.z0, false);
  for (let k = 0; k < skiver.length; k++) {
    const s = skiver[k]!;
    vegger(b, s);
    const neste = skiver[k + 1];
    if (neste) {
      flate(b, differanse(s.region, neste.region), s.z1, true);
      flate(b, differanse(neste.region, s.region), s.z1, false);
    } else {
      flate(b, topp ?? s.region, s.z1, true);
    }
  }
}

/** The area inside a ring minus the opening at the top of the base. */
export function toppFlate(indre: Ring, m: Modulmal): Region {
  return differanse(regionFraRinger([indre]), regionFraRinger([sirkel(m.rApning)]));
}

/** Fit-test piece: only the recess, lip, floor and cable route, in a thin ring. */
export function byggProvebit(m: Modulmal): Mesh {
  const b = new MeshBygger();
  byggSokkel(b, sirkel(m.rLomme + PROVEBIT_KANT), m);
  return sveis(b.bygg());
}

/**
 * Merge coincident vertices, then split every edge that has another
 * vertex lying inside it (T-junctions from slabs whose walls are cut at
 * different points). Returns a new mesh.
 */
export function sveis(m: Mesh, toleranse = 1e-4): Mesh {
  const p = m.posisjoner;
  const q = 1 / toleranse;
  const kart = new Map<string, number>();
  const pos: number[] = [];
  const nytt = new Uint32Array(p.length / 3);
  for (let i = 0; i < p.length / 3; i++) {
    const x = p[i * 3]!;
    const y = p[i * 3 + 1]!;
    const z = p[i * 3 + 2]!;
    const k = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = kart.get(k);
    if (id === undefined) {
      id = pos.length / 3;
      pos.push(x, y, z);
      kart.set(k, id);
    }
    nytt[i] = id;
  }
  let tris: number[] = [];
  for (let t = 0; t < m.indekser.length; t += 3) {
    const a = nytt[m.indekser[t]!]!;
    const b = nytt[m.indekser[t + 1]!]!;
    const c = nytt[m.indekser[t + 2]!]!;
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }

  for (let runde = 0; runde < 4; runde++) {
    const kanter = new Map<string, number>();
    for (let t = 0; t < tris.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const k = `${tris[t + e]}>${tris[t + ((e + 1) % 3)]}`;
        kanter.set(k, (kanter.get(k) ?? 0) + 1);
      }
    }
    // Open edges and the vertices on them: T-junction vertices are among them.
    const apne: number[] = [];
    const kandidater = new Set<number>();
    for (let t = 0; t < tris.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = tris[t + e]!;
        const b = tris[t + ((e + 1) % 3)]!;
        if (!kanter.has(`${b}>${a}`)) {
          apne.push(t, e);
          kandidater.add(a).add(b);
        }
      }
    }
    if (!apne.length) break;
    const kand = [...kandidater];
    const splitt = new Map<number, { e: number; punkter: number[] }>();
    for (let i = 0; i < apne.length; i += 2) {
      const t = apne[i]!;
      const e = apne[i + 1]!;
      if (splitt.has(t)) continue;
      const a = tris[t + e]!;
      const b = tris[t + ((e + 1) % 3)]!;
      const ax = pos[a * 3]!,
        ay = pos[a * 3 + 1]!,
        az = pos[a * 3 + 2]!;
      const dx = pos[b * 3]! - ax,
        dy = pos[b * 3 + 1]! - ay,
        dz = pos[b * 3 + 2]! - az;
      const l2 = dx * dx + dy * dy + dz * dz;
      if (l2 < 1e-12) continue;
      const pa: { s: number; v: number }[] = [];
      for (const v of kand) {
        if (v === a || v === b) continue;
        const vx = pos[v * 3]! - ax,
          vy = pos[v * 3 + 1]! - ay,
          vz = pos[v * 3 + 2]! - az;
        const s = (vx * dx + vy * dy + vz * dz) / l2;
        if (s <= 1e-7 || s >= 1 - 1e-7) continue;
        const ex = vx - s * dx,
          ey = vy - s * dy,
          ez = vz - s * dz;
        if (ex * ex + ey * ey + ez * ez < toleranse * toleranse) pa.push({ s, v });
      }
      if (pa.length) {
        pa.sort((x, y) => x.s - y.s);
        splitt.set(t, { e, punkter: pa.map((x) => x.v) });
      }
    }
    if (!splitt.size) break;
    const ut: number[] = [];
    for (let t = 0; t < tris.length; t += 3) {
      const s = splitt.get(t);
      if (!s) {
        ut.push(tris[t]!, tris[t + 1]!, tris[t + 2]!);
        continue;
      }
      const a = tris[t + s.e]!;
      const b = tris[t + ((s.e + 1) % 3)]!;
      const c = tris[t + ((s.e + 2) % 3)]!;
      const kjede = [a, ...s.punkter, b];
      for (let k = 0; k < kjede.length - 1; k++) ut.push(kjede[k]!, kjede[k + 1]!, c);
    }
    tris = ut;
  }
  return { posisjoner: new Float32Array(pos), indekser: new Uint32Array(tris) };
}
