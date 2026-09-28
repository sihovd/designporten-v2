/**
 * Extrusion of a planar region into a closed, watertight solid, with an
 * optional side profile.
 *
 * A profile is realised as a stack of slabs at the print layer height:
 * slab k is the region offset inwards by the profile's inset at that
 * height. This is exactly what an FDM printer produces, so the preview
 * and the export show what will print. Consecutive slabs with the same
 * inset are merged, so a straight wall is a single prism.
 *
 * Faces:
 *   bottom  R₀ facing down
 *   walls   every ring of every slab
 *   steps   Rₖ \ Rₖ₊₁ facing up and Rₖ₊₁ \ Rₖ facing down at each slab boundary
 *   top     Rₙ facing up
 * All coordinates stay on the Clipper integer grid, so shared edges have
 * bit-identical vertices and the mesh closes exactly.
 */
import earcut from 'earcut';
import { MeshBygger, type Mesh } from './mesh';
import {
  SKALA,
  differanse,
  forskyv,
  ringAreal,
  trianguler,
  type Flate,
  type Region,
  type Ring,
} from './polygon';
import { samplerProfil, type Profil } from '../core/profil';
import type { Vec2 } from '../core/geometri2d';

export interface Ekstrudering {
  mesh: Mesh;
  /** Height actually built (mm); lower than requested if the profile consumed the shape. */
  toppZ: number;
  /** The profile removed the whole shape before the top. */
  forbrukt: boolean;
}

interface Skive {
  z0: number;
  z1: number;
  region: Region;
}

class Hjornekart {
  private kart = new Map<string, number>();
  constructor(private b: MeshBygger) {}
  punkt(x: number, y: number, z: number): number {
    const k = `${Math.round(x * SKALA)},${Math.round(y * SKALA)},${Math.round(z * SKALA)}`;
    let i = this.kart.get(k);
    if (i === undefined) {
      i = this.b.punkt(x, y, z);
      this.kart.set(k, i);
    }
    return i;
  }
}

function orienter(r: Ring, ccw: boolean): Ring {
  return ringAreal(r) > 0 === ccw ? r : [...r].reverse();
}

/** Triangulate a region at height z, facing up (+Z) or down. */
function flate(b: MeshBygger, hk: Hjornekart, region: Region, z: number, opp: boolean): void {
  for (const f of region) triangulerFlate(b, hk, f, z, opp);
}

type Trekant = [Vec2, Vec2, Vec2];

/**
 * A triangulation is accepted only if it covers the polygon's area and
 * uses every boundary edge, so neighbouring faces and walls share edges
 * exactly (no T-junctions, no holes).
 */
function gyldig(f: Flate, tris: Trekant[]): boolean {
  const n = (p: Vec2) => `${Math.round(p.x * SKALA)},${Math.round(p.y * SKALA)}`;
  const kanter = new Set<string>();
  let sum = 0;
  for (const [p, q, r] of tris) {
    sum += Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / 2;
    const a = n(p),
      b = n(q),
      c = n(r);
    kanter
      .add(`${a}|${b}`)
      .add(`${b}|${a}`)
      .add(`${b}|${c}`)
      .add(`${c}|${b}`)
      .add(`${c}|${a}`)
      .add(`${a}|${c}`);
  }
  let areal = Math.abs(ringAreal(f.ytre));
  for (const h of f.hull) areal -= Math.abs(ringAreal(h));
  if (Math.abs(sum - areal) > Math.max(1e-6, areal * 1e-6)) return false;
  for (const r of [f.ytre, ...f.hull]) {
    for (let i = 0; i < r.length; i++) {
      if (!kanter.has(`${n(r[i]!)}|${n(r[(i + 1) % r.length]!)}`)) return false;
    }
  }
  return true;
}

function earcutTrekanter(f: Flate): Trekant[] {
  const ringer = [f.ytre, ...f.hull];
  const koord: number[] = [];
  const hullIndekser: number[] = [];
  const pkt: Vec2[] = [];
  ringer.forEach((r, ri) => {
    if (ri > 0) hullIndekser.push(koord.length / 2);
    for (const p of r) {
      koord.push(p.x, p.y);
      pkt.push(p);
    }
  });
  const ix = earcut(koord, hullIndekser.length ? hullIndekser : undefined, 2);
  const ut: Trekant[] = [];
  for (let t = 0; t < ix.length; t += 3) ut.push([pkt[ix[t]!]!, pkt[ix[t + 1]!]!, pkt[ix[t + 2]!]!]);
  return ut;
}

/**
 * Triangulate one polygon with holes. Constrained Delaunay first (handles
 * holes that touch the outline, common in glyphs such as «Ø»), earcut as
 * a fallback; each result is validated before use.
 */
export function triangulerSikkert(f: Flate): Trekant[] {
  const cdt = trianguler(f);
  if (cdt && gyldig(f, cdt)) return cdt;
  const ec = earcutTrekanter(f);
  if (gyldig(f, ec)) return ec;
  // Last resort: Clipper's plain (non-Delaunay) mode. If that fails too the
  // export's manifold check reports the problem instead of hiding it.
  const enkel = trianguler(f, false);
  if (enkel && gyldig(f, enkel)) return enkel;
  return cdt ?? ec;
}

function triangulerFlate(b: MeshBygger, hk: Hjornekart, f: Flate, z: number, opp: boolean): void {
  for (const [p, q, r] of triangulerSikkert(f)) {
    const areal = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    if (areal === 0) continue;
    const a = hk.punkt(p.x, p.y, z),
      c = hk.punkt(q.x, q.y, z),
      d = hk.punkt(r.x, r.y, z);
    if (areal > 0 === opp) b.trekant(a, c, d);
    else b.trekant(a, d, c);
  }
}

function vegger(b: MeshBygger, hk: Hjornekart, s: Skive): void {
  for (const f of s.region) {
    const ringer: Ring[] = [orienter(f.ytre, true), ...f.hull.map((h) => orienter(h, false))];
    for (const r of ringer) {
      for (let i = 0; i < r.length; i++) {
        const p = r[i]!,
          q = r[(i + 1) % r.length]!;
        const a0 = hk.punkt(p.x, p.y, s.z0),
          b0 = hk.punkt(q.x, q.y, s.z0);
        const b1 = hk.punkt(q.x, q.y, s.z1),
          a1 = hk.punkt(p.x, p.y, s.z1);
        b.trekant(a0, b0, b1);
        b.trekant(a0, b1, a1);
      }
    }
  }
}

/** Inset (mm) at height fraction t, linear between samples. */
function insetVed(prover: { inset: number; t: number }[], t: number): number {
  if (t <= prover[0]!.t) return prover[0]!.inset;
  for (let i = 1; i < prover.length; i++) {
    const a = prover[i - 1]!,
      b = prover[i]!;
    if (t <= b.t) {
      if (b.t - a.t < 1e-9) return b.inset;
      return a.inset + ((t - a.t) / (b.t - a.t)) * (b.inset - a.inset);
    }
  }
  return prover.at(-1)!.inset;
}

/** Plan the slabs (z ranges and insets) for a profile. */
export function planleggSkiver(
  profil: Profil,
  hoyde: number,
  lagHoyde: number,
): { z0: number; z1: number; inset: number }[] {
  if (profil.bredde <= 0 || profil.type === 'rett') return [{ z0: 0, z1: hoyde, inset: 0 }];
  const prover = samplerProfil(profil, 16);
  const n = Math.max(1, Math.round(hoyde / Math.max(0.05, lagHoyde)));
  const ut: { z0: number; z1: number; inset: number }[] = [];
  for (let k = 0; k < n; k++) {
    const z0 = (hoyde * k) / n,
      z1 = (hoyde * (k + 1)) / n;
    // sample at the slab's middle; quantise to 0.01 mm so equal insets merge
    const inset = Math.round(insetVed(prover, (k + 0.5) / n) * 100) / 100;
    const forrige = ut.at(-1);
    if (forrige && Math.abs(forrige.inset - inset) < 1e-9) forrige.z1 = z1;
    else ut.push({ z0, z1, inset });
  }
  return ut;
}

/**
 * Extrude `region` (already normalised through Clipper) from zBunn to
 * zBunn + hoyde with the given profile. `lagHoyde` is the print layer
 * height used to realise curved profiles.
 */
export function ekstruder(
  region: Region,
  zBunn: number,
  hoyde: number,
  profil: Profil,
  lagHoyde = 0.2,
  hjorne: 'rund' | 'skarp' | 'faset' = 'rund',
): Ekstrudering {
  const b = new MeshBygger();
  const hk = new Hjornekart(b);
  if (!region.length || hoyde <= 0) return { mesh: b.bygg(), toppZ: zBunn, forbrukt: false };

  const plan = planleggSkiver(profil, hoyde, lagHoyde);
  const cache = new Map<number, Region>();
  const skiver: Skive[] = [];
  let forbrukt = false;
  for (const p of plan) {
    let r = cache.get(p.inset);
    if (!r) {
      r = forskyv(region, -p.inset, hjorne);
      cache.set(p.inset, r);
    }
    if (!r.length) {
      forbrukt = true;
      break;
    }
    skiver.push({ z0: zBunn + p.z0, z1: zBunn + p.z1, region: r });
  }
  if (!skiver.length) return { mesh: b.bygg(), toppZ: zBunn, forbrukt: true };

  flate(b, hk, skiver[0]!.region, skiver[0]!.z0, false);
  for (let k = 0; k < skiver.length; k++) {
    const s = skiver[k]!;
    vegger(b, hk, s);
    const neste = skiver[k + 1];
    if (neste) {
      flate(b, hk, differanse(s.region, neste.region), s.z1, true);
      flate(b, hk, differanse(neste.region, s.region), s.z1, false);
    } else {
      flate(b, hk, s.region, s.z1, true);
    }
  }
  return { mesh: b.bygg(), toppZ: skiver.at(-1)!.z1, forbrukt };
}
