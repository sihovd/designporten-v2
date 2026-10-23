/**
 * Measurements on built meshes: pieces, the distance between two parts and
 * thin walls. Distances are measured on the meshes themselves (vertex to
 * triangle), not taken from the fields, so they report what is exported.
 */
import type { Mesh } from '../../geometri/mesh';
import { gradient, type Felt } from './sdf';
import { normaliser, type V3 } from './vektor';

/** The pieces of a mesh: triangles sharing a vertex belong together. Returns the piece of every triangle. */
function biter(m: Mesh): { bit: Int32Array; antall: number } {
  const n = m.posisjoner.length / 3;
  const foreldre = new Int32Array(n).map((_, i) => i);
  const finn = (i: number): number => {
    while (foreldre[i] !== i) {
      foreldre[i] = foreldre[foreldre[i]!]!;
      i = foreldre[i]!;
    }
    return i;
  };
  const ix = m.indekser;
  for (let t = 0; t < ix.length; t += 3) {
    const ra = finn(ix[t]!);
    foreldre[finn(ix[t + 1]!)] = ra;
    foreldre[finn(ix[t + 2]!)] = ra;
  }
  const nummer = new Map<number, number>();
  const bit = new Int32Array(ix.length / 3);
  for (let t = 0; t < ix.length; t += 3) {
    const r = finn(ix[t]!);
    let b = nummer.get(r);
    if (b === undefined) nummer.set(r, (b = nummer.size));
    bit[t / 3] = b;
  }
  return { bit, antall: nummer.size };
}

/** How many separate pieces a mesh has. */
export const antallBiter = (m: Mesh): number => biter(m).antall;

/**
 * Removes specks: pieces whose box is smaller than `grense` in every
 * direction. Marching leaves such crumbs where two cut surfaces nearly touch
 * (a tenth of a millimetre, far below what a printer makes). Larger pieces
 * are kept, so a part that really falls apart is still found.
 */
export function fjernSmuler(m: Mesh, grense: number): { mesh: Mesh; fjernet: number } {
  const { bit, antall } = biter(m);
  if (antall < 2) return { mesh: m, fjernet: 0 };
  const min = new Float64Array(antall * 3).fill(Infinity),
    maks = new Float64Array(antall * 3).fill(-Infinity);
  const p = m.posisjoner,
    ix = m.indekser;
  for (let t = 0; t < ix.length; t++) {
    const b = bit[Math.floor(t / 3)]!;
    for (let k = 0; k < 3; k++) {
      const v = p[ix[t]! * 3 + k]!;
      min[b * 3 + k] = Math.min(min[b * 3 + k]!, v);
      maks[b * 3 + k] = Math.max(maks[b * 3 + k]!, v);
    }
  }
  const smule = (b: number) => [0, 1, 2].every((k) => maks[b * 3 + k]! - min[b * 3 + k]! < grense);
  const behold: number[] = [];
  let fjernet = 0;
  const sett = new Set<number>();
  for (let t = 0; t < ix.length; t += 3) {
    const b = bit[t / 3]!;
    if (smule(b)) {
      if (!sett.has(b)) fjernet++;
      sett.add(b);
      continue;
    }
    behold.push(ix[t]!, ix[t + 1]!, ix[t + 2]!);
  }
  return fjernet
    ? { mesh: { posisjoner: p, indekser: new Uint32Array(behold) }, fjernet }
    : { mesh: m, fjernet: 0 };
}

/**
 * Whether a mesh with shared vertices is closed and consistently oriented:
 * every directed edge appears once and its opposite once. (The marcher
 * shares vertices per grid edge, so no welding is needed.)
 */
export function tetthet(m: Mesh): { lukket: boolean; aapneKanter: number; feilKanter: number } {
  const n = m.posisjoner.length / 3;
  const ix = m.indekser;
  const kanter = new Float64Array(ix.length);
  for (let t = 0; t < ix.length; t += 3)
    for (let e = 0; e < 3; e++) kanter[t + e] = ix[t + e]! * n + ix[t + ((e + 1) % 3)]!;
  kanter.sort();
  const finnes = (k: number) => {
    let lo = 0,
      hi = kanter.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = kanter[mid]!;
      if (v === k) return true;
      if (v < k) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  };
  let aapne = 0,
    feil = 0;
  for (let i = 0; i < kanter.length; i++) {
    const k = kanter[i]!;
    if (i > 0 && kanter[i - 1] === k) {
      feil++;
      continue;
    }
    const a = Math.floor(k / n);
    if (!finnes((k - a * n) * n + a)) aapne++;
  }
  return { lukket: aapne === 0 && feil === 0, aapneKanter: aapne, feilKanter: feil };
}

/** Squared distance from p to the triangle abc (closest point on triangle, Ericson 5.1.5). */
function avstandTilTrekant(p: V3, a: V3, b: V3, c: V3): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  const d1 = dot(ab, ap),
    d2 = dot(ac, ap);
  const til = (q: number[]) => (p[0] - q[0]!) ** 2 + (p[1] - q[1]!) ** 2 + (p[2] - q[2]!) ** 2;
  if (d1 <= 0 && d2 <= 0) return til(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp),
    d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return til(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return til([a[0] + ab[0]! * v, a[1] + ab[1]! * v, a[2] + ab[2]! * v]);
  }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp),
    d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return til(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return til([a[0] + ac[0]! * w, a[1] + ac[1]! * w, a[2] + ac[2]! * w]);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return til([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom,
    w = vc * denom;
  return til([
    a[0] + ab[0]! * v + ac[0]! * w,
    a[1] + ab[1]! * v + ac[1]! * w,
    a[2] + ab[2]! * v + ac[2]! * w,
  ]);
}

/** Triangles of a mesh inside a region, sorted into a uniform grid for distance queries. */
class Trekantgitter {
  private celler = new Map<number, number[]>();
  private readonly pos: Float32Array;
  private readonly ix: Uint32Array;
  constructor(
    m: Mesh,
    private celle: number,
    omrade: { min: V3; maks: V3 },
  ) {
    const p = (this.pos = m.posisjoner),
      ix = (this.ix = m.indekser);
    const c = this.celle;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]! * 3,
        b = ix[t + 1]! * 3,
        d = ix[t + 2]! * 3;
      const x0 = Math.min(p[a]!, p[b]!, p[d]!),
        x1 = Math.max(p[a]!, p[b]!, p[d]!);
      const y0 = Math.min(p[a + 1]!, p[b + 1]!, p[d + 1]!),
        y1 = Math.max(p[a + 1]!, p[b + 1]!, p[d + 1]!);
      const z0 = Math.min(p[a + 2]!, p[b + 2]!, p[d + 2]!),
        z1 = Math.max(p[a + 2]!, p[b + 2]!, p[d + 2]!);
      if (x1 < omrade.min[0] || x0 > omrade.maks[0] || y1 < omrade.min[1] || y0 > omrade.maks[1]) continue;
      if (z1 < omrade.min[2] || z0 > omrade.maks[2]) continue;
      for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
        for (let j = Math.floor(y0 / c); j <= Math.floor(y1 / c); j++)
          for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) {
            const nokkel = Trekantgitter.nokkel(i, j, k);
            const liste = this.celler.get(nokkel);
            if (liste) liste.push(t);
            else this.celler.set(nokkel, [t]);
          }
    }
  }

  private static nokkel(i: number, j: number, k: number): number {
    return (i + 4096) * 67_108_864 + (j + 4096) * 8192 + (k + 4096);
  }

  /** Distance from p to the mesh if it is closer than `grense`, else `grense`. */
  avstand(p: V3, grense: number): number {
    const c = this.celle;
    const r = Math.ceil(grense / c);
    const cx = Math.floor(p[0] / c),
      cy = Math.floor(p[1] / c),
      cz = Math.floor(p[2] / c);
    let best = grense * grense;
    const pos = this.pos,
      ix = this.ix;
    const hent = (i: number): V3 => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
    for (let a = cx - r; a <= cx + r; a++)
      for (let b = cy - r; b <= cy + r; b++)
        for (let d = cz - r; d <= cz + r; d++) {
          const liste = this.celler.get(Trekantgitter.nokkel(a, b, d));
          if (!liste) continue;
          for (const t of liste) {
            const d2 = avstandTilTrekant(p, hent(ix[t]!), hent(ix[t + 1]!), hent(ix[t + 2]!));
            if (d2 < best) best = d2;
          }
        }
    return Math.sqrt(best);
  }
}

/** A mesh's bounding box. */
export function meshboks(m: Mesh): { min: V3; maks: V3 } {
  const p = m.posisjoner;
  const min: V3 = [Infinity, Infinity, Infinity],
    maks: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[i + k]!);
      maks[k] = Math.max(maks[k]!, p[i + k]!);
    }
  return { min, maks };
}

/** Distance from a point to a box (0 inside). */
export function tilBoks(x: number, y: number, z: number, b: { min: V3; maks: V3 }): number {
  const dx = Math.max(b.min[0] - x, 0, x - b.maks[0]),
    dy = Math.max(b.min[1] - y, 0, y - b.maks[1]),
    dz = Math.max(b.min[2] - z, 0, z - b.maks[2]);
  return Math.hypot(dx, dy, dz);
}

export interface Naerhet {
  /** Smallest distance between the two surfaces found within the search range (mm). */
  minste: number;
  /** Where (a vertex of one of the parts). */
  hvor: V3 | null;
  /** Vertices of one part inside the other. */
  inni: number;
}

/**
 * How close two parts come: vertex to triangle in both directions, within
 * `grense` mm. A vertex inside the other part (by its field) is an overlap.
 */
export function naerhet(a: Mesh, fa: Felt, b: Mesh, fb: Felt, grense: number): Naerhet {
  let minste = grense,
    hvor: V3 | null = null,
    inni = 0;
  const en = (m: Mesh, annen: Mesh, felt: Felt) => {
    // the vertices that come near the other part (by its field), nearest first; far from its box, none can
    const p = m.posisjoner;
    const boks = meshboks(annen);
    const naere: { i: number; f: number }[] = [];
    for (let i = 0; i < p.length; i += 3) {
      if (tilBoks(p[i]!, p[i + 1]!, p[i + 2]!, boks) > grense + 1) continue;
      const f = felt(p[i]!, p[i + 1]!, p[i + 2]!);
      if (f > grense + 1) continue;
      if (f < -0.02) {
        inni++;
        if (minste > 0 || !hvor) hvor = [p[i]!, p[i + 1]!, p[i + 2]!];
        minste = 0;
        continue;
      }
      naere.push({ i, f });
    }
    if (!naere.length || minste === 0) return;
    naere.sort((x, y) => x.f - y.f);
    // measured exactly on the meshes, as long as the field says a vertex could still be the closest
    const grenseFelt = naere[0]!.f + 0.5;
    const valgte = naere.filter((n) => n.f <= grenseFelt);
    const min: V3 = [Infinity, Infinity, Infinity],
      maks: V3 = [-Infinity, -Infinity, -Infinity];
    for (const { i } of valgte)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, p[i + k]! - grense);
        maks[k] = Math.max(maks[k]!, p[i + k]! + grense);
      }
    const gitter = new Trekantgitter(annen, Math.max(0.5, grense / 2), { min, maks });
    for (const { i } of valgte) {
      const q: V3 = [p[i]!, p[i + 1]!, p[i + 2]!];
      const d = gitter.avstand(q, minste);
      if (d < minste) {
        minste = d;
        hvor = q;
      }
    }
  };
  en(a, b, fb);
  en(b, a, fa);
  return { minste, hvor, inni };
}

/**
 * Thin walls: from each vertex near `senter` (within `radius`), step inwards
 * along the field's normal; if the part is left again within `minVegg`,
 * the wall there is thinner. Every second vertex is tested. Returns the thinnest wall found (or null).
 */
export function tynnesteVegg(
  m: Mesh,
  felt: Felt,
  senter: V3,
  radius: number,
  minVegg: number,
): { tykkelse: number; hvor: V3; antall: number } | null {
  const p = m.posisjoner;
  let funnet: { tykkelse: number; hvor: V3; antall: number } | null = null;
  const steg = Math.max(0.1, minVegg / 8);
  // every second vertex: a thin edge is a band of many vertices, so none is missed
  for (let i = 0; i < p.length; i += 6) {
    const q: V3 = [p[i]!, p[i + 1]!, p[i + 2]!];
    if (Math.hypot(q[0] - senter[0], q[1] - senter[1], q[2] - senter[2]) > radius) continue;
    const n = normaliser(gradient(felt, q));
    for (let s = steg * 2; s < minVegg; s += steg) {
      if (felt(q[0] - n[0] * s, q[1] - n[1] * s, q[2] - n[2] * s) > 0) {
        if (!funnet) funnet = { tykkelse: s, hvor: q, antall: 0 };
        funnet.antall++;
        if (s < funnet.tykkelse) {
          funnet.tykkelse = s;
          funnet.hvor = q;
        }
        break;
      }
    }
  }
  return funnet;
}
