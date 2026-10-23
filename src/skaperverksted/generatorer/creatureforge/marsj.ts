/**
 * Meshing a field on a regular grid with marching tetrahedra. Every cube is
 * split into the same six tetrahedra around its main diagonal, so
 * neighbouring cubes agree on their shared faces; vertices are shared per
 * grid edge. The result is closed and 2-manifold whenever the field is
 * positive on the grid border (the box is padded so it is).
 */
import type { Mesh } from '../../geometri/mesh';
import type { Boks, Felt } from './sdf';

export interface Rutenett {
  min: [number, number, number];
  /** Cell size (mm). */
  g: number;
  nx: number;
  ny: number;
  nz: number;
}

/** A grid over `boks`, padded by two cells, with at most `maksNoder` nodes and cells no finer than `celle`. */
export function lagRutenett(boks: Boks, celle: number, maksNoder: number): Rutenett {
  const sx = boks.maks[0] - boks.min[0],
    sy = boks.maks[1] - boks.min[1],
    sz = boks.maks[2] - boks.min[2];
  let g = Math.max(celle, Math.cbrt((sx * sy * sz) / maksNoder));
  const antall = (c: number) => (Math.ceil(sx / c) + 5) * (Math.ceil(sy / c) + 5) * (Math.ceil(sz / c) + 5);
  while (antall(g) > maksNoder) g *= 1.05;
  return {
    min: [boks.min[0] - 2 * g, boks.min[1] - 2 * g, boks.min[2] - 2 * g],
    g,
    nx: Math.ceil(sx / g) + 5,
    ny: Math.ceil(sy / g) + 5,
    nz: Math.ceil(sz / g) + 5,
  };
}

const HJORNER = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
] as const;

const TETRAER = [
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
  [0, 5, 1, 6],
] as const;

/** Blocks of BLOKK³ cells are tested at their centre first (narrow band). */
const BLOKK = 4;
/** The fields are close to distances but not all exact, so a block is skipped only with this margin. */
const SIKKERHET = 1.3;

/**
 * Samples `f` at every node that matters for the zero level. A block whose
 * centre is further from the surface than the block's half diagonal (times
 * a margin) lies wholly inside or outside, so its nodes get that sign
 * without being evaluated; every block the surface may cross is sampled in
 * full, after the others, so its values are exact.
 */
export function sampleSmaltBand(r: Rutenett, f: Felt): Float32Array {
  const { nx, ny, nz, g, min } = r;
  const verdier = new Float32Array(nx * ny * nz);
  const eksakt = new Uint8Array(nx * ny * nz);
  const halvDiagonal = (BLOKK * g * Math.sqrt(3)) / 2;
  const fulle: [number, number, number][] = [];
  for (let k0 = 0; k0 < nz - 1; k0 += BLOKK)
    for (let j0 = 0; j0 < ny - 1; j0 += BLOKK)
      for (let n0 = 0; n0 < nx - 1; n0 += BLOKK) {
        const v = f(
          min[0] + (n0 + BLOKK / 2) * g,
          min[1] + (j0 + BLOKK / 2) * g,
          min[2] + (k0 + BLOKK / 2) * g,
        );
        if (Math.abs(v) <= halvDiagonal * SIKKERHET) {
          fulle.push([n0, j0, k0]);
          continue;
        }
        const fyll = v > 0 ? 1 : -1;
        for (let k = k0; k <= Math.min(nz - 1, k0 + BLOKK); k++)
          for (let j = j0; j <= Math.min(ny - 1, j0 + BLOKK); j++) {
            const rad = nx * (j + ny * k);
            for (let n = n0; n <= Math.min(nx - 1, n0 + BLOKK); n++)
              if (!eksakt[rad + n]) verdier[rad + n] = fyll;
          }
      }
  for (const [n0, j0, k0] of fulle)
    for (let k = k0; k <= Math.min(nz - 1, k0 + BLOKK); k++) {
      const z = min[2] + k * g;
      for (let j = j0; j <= Math.min(ny - 1, j0 + BLOKK); j++) {
        const y = min[1] + j * g;
        const rad = nx * (j + ny * k);
        for (let n = n0; n <= Math.min(nx - 1, n0 + BLOKK); n++) {
          const id = rad + n;
          if (eksakt[id]) continue;
          verdier[id] = f(min[0] + n * g, y, z);
          eksakt[id] = 1;
        }
      }
    }
  return verdier;
}

/** Mesh the zero level of `f` over the grid. Outside the grid counts as outside. */
export function marsjer(r: Rutenett, f: Felt): Mesh {
  const { nx, ny, nz, g, min } = r;
  const total = nx * ny * nz;
  const verdier = sampleSmaltBand(r, f);
  // exact zeros would put vertices on nodes and make slivers
  for (let i = 0; i < total; i++) if (Math.abs(verdier[i]!) < 1e-6) verdier[i] = 1e-6;

  const pts: number[] = [];
  const tris: number[] = [];
  const kantPunkt = new Map<number, number>();
  const pos = (id: number, ut: number[]) => {
    const n = id % nx,
      j = Math.floor(id / nx) % ny,
      k = Math.floor(id / (nx * ny));
    ut[0] = min[0] + n * g;
    ut[1] = min[1] + j * g;
    ut[2] = min[2] + k * g;
  };
  const pa = [0, 0, 0],
    pc = [0, 0, 0];
  const punkt = (a: number, c: number): number => {
    const lav = a < c ? a : c,
      hoy = a < c ? c : a;
    const nokkel = lav * total + hoy;
    const finnes = kantPunkt.get(nokkel);
    if (finnes !== undefined) return finnes;
    const va = verdier[a]!,
      vc = verdier[c]!;
    const t = Math.min(0.999, Math.max(0.001, va / (va - vc)));
    pos(a, pa);
    pos(c, pc);
    const id = pts.length / 3;
    pts.push(pa[0]! + (pc[0]! - pa[0]!) * t, pa[1]! + (pc[1]! - pa[1]!) * t, pa[2]! + (pc[2]! - pa[2]!) * t);
    kantPunkt.set(nokkel, id);
    return id;
  };
  const sentrum = (ids: number[], ut: number[]) => {
    ut[0] = ut[1] = ut[2] = 0;
    const q = [0, 0, 0];
    for (const id of ids) {
      pos(id, q);
      ut[0] += q[0]! / ids.length;
      ut[1] += q[1]! / ids.length;
      ut[2] += q[2]! / ids.length;
    }
  };
  const inneS = [0, 0, 0],
    uteS = [0, 0, 0];
  // a triangle facing from the inside corners towards the outside corners
  const trekant = (p: number, q: number, s: number) => {
    if (p === q || q === s || p === s) return;
    const ax = pts[q * 3]! - pts[p * 3]!,
      ay = pts[q * 3 + 1]! - pts[p * 3 + 1]!,
      az = pts[q * 3 + 2]! - pts[p * 3 + 2]!;
    const bx = pts[s * 3]! - pts[p * 3]!,
      by = pts[s * 3 + 1]! - pts[p * 3 + 1]!,
      bz = pts[s * 3 + 2]! - pts[p * 3 + 2]!;
    const nx_ = ay * bz - az * by,
      ny_ = az * bx - ax * bz,
      nz_ = ax * by - ay * bx;
    const ret = nx_ * (uteS[0]! - inneS[0]!) + ny_ * (uteS[1]! - inneS[1]!) + nz_ * (uteS[2]! - inneS[2]!);
    if (ret >= 0) tris.push(p, q, s);
    else tris.push(p, s, q);
  };

  const hjorne = new Array<number>(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let n = 0; n < nx - 1; n++) {
        let inne = 0;
        for (let c = 0; c < 8; c++) {
          const h = HJORNER[c]!;
          const id = n + h[0] + nx * (j + h[1] + ny * (k + h[2]));
          hjorne[c] = id;
          if (verdier[id]! < 0) inne++;
        }
        if (inne === 0 || inne === 8) continue;
        for (const tet of TETRAER) {
          const ids = tet.map((c) => hjorne[c]!);
          const inn = ids.filter((id) => verdier[id]! < 0);
          if (inn.length === 0 || inn.length === 4) continue;
          const ut = ids.filter((id) => verdier[id]! >= 0);
          sentrum(inn, inneS);
          sentrum(ut, uteS);
          if (inn.length === 1)
            trekant(punkt(inn[0]!, ut[0]!), punkt(inn[0]!, ut[1]!), punkt(inn[0]!, ut[2]!));
          else if (inn.length === 3)
            trekant(punkt(inn[0]!, ut[0]!), punkt(inn[1]!, ut[0]!), punkt(inn[2]!, ut[0]!));
          else {
            const a = punkt(inn[0]!, ut[0]!),
              b = punkt(inn[0]!, ut[1]!),
              c = punkt(inn[1]!, ut[1]!),
              d = punkt(inn[1]!, ut[0]!);
            trekant(a, b, c);
            trekant(a, c, d);
          }
        }
      }
  return { posisjoner: new Float32Array(pts), indekser: new Uint32Array(tris) };
}
