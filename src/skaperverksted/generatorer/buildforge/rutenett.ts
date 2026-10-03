/**
 * Sampling a field on a regular grid, meshing it and measuring it.
 *
 * Meshing uses marching tetrahedra: every cube is split into six
 * tetrahedra around its main diagonal, the same way in every cube, so
 * neighbouring cubes agree on shared faces and the result is closed and
 * consistently oriented whenever the field is positive on the grid border.
 * Vertices are shared by grid edge, so the mesh is 2-manifold.
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
  verdier: Float32Array;
}

/**
 * Grid over `boks` (padded by two cells) with at most `maksNoder` nodes
 * and no finer than `minCelle`. Returns null for an empty box.
 */
export function lagRutenett(boks: Boks, maksNoder: number, minCelle: number): Omit<Rutenett, 'verdier'> {
  const sx = boks.maks[0] - boks.min[0],
    sy = boks.maks[1] - boks.min[1],
    sz = boks.maks[2] - boks.min[2];
  let g = Math.max(minCelle, Math.cbrt((sx * sy * sz) / maksNoder));
  // padding changes the count, so grow until it fits
  for (let i = 0; i < 20; i++) {
    const n = (Math.ceil(sx / g) + 5) * (Math.ceil(sy / g) + 5) * (Math.ceil(sz / g) + 5);
    if (n <= maksNoder) break;
    g *= 1.08;
  }
  const nx = Math.ceil(sx / g) + 5,
    ny = Math.ceil(sy / g) + 5,
    nz = Math.ceil(sz / g) + 5;
  return { min: [boks.min[0] - 2 * g, boks.min[1] - 2 * g, boks.min[2] - 2 * g], g, nx, ny, nz };
}

export function sample(r: Omit<Rutenett, 'verdier'>, f: Felt): Rutenett {
  const v = new Float32Array(r.nx * r.ny * r.nz);
  let i = 0;
  for (let k = 0; k < r.nz; k++) {
    const z = r.min[2] + k * r.g;
    for (let j = 0; j < r.ny; j++) {
      const y = r.min[1] + j * r.g;
      for (let n = 0; n < r.nx; n++) v[i++] = f(r.min[0] + n * r.g, y, z);
    }
  }
  return { ...r, verdier: v };
}

// cube corners as (dx, dy, dz)
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

// six tetrahedra sharing the diagonal 0–6
const TETRAER = [
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
  [0, 5, 1, 6],
] as const;

/** Mesh the zero level of a sampled field. Outside the grid counts as outside. */
export function marsjer(r: Rutenett): Mesh {
  const { nx, ny, nz, g, min, verdier } = r;
  const pts: number[] = [];
  const tris: number[] = [];
  const kantPunkt = new Map<number, number>();
  const nodeId = (n: number, j: number, k: number) => n + nx * (j + ny * k);
  const total = nx * ny * nz;
  const verdi = (id: number) => {
    const v = verdier[id]!;
    // exact zeros would put vertices on nodes and create slivers
    return Math.abs(v) < 1e-7 ? 1e-7 : v;
  };
  const pos = (id: number): [number, number, number] => {
    const n = id % nx,
      j = Math.floor(id / nx) % ny,
      k = Math.floor(id / (nx * ny));
    return [min[0] + n * g, min[1] + j * g, min[2] + k * g];
  };
  const punkt = (a: number, c: number): number => {
    const lav = Math.min(a, c),
      hoy = Math.max(a, c);
    const nokkel = lav * total + hoy;
    const finnes = kantPunkt.get(nokkel);
    if (finnes !== undefined) return finnes;
    const va = verdi(a),
      vc = verdi(c);
    const t = Math.min(0.99, Math.max(0.01, va / (va - vc)));
    const pa = pos(a),
      pc = pos(c);
    const id = pts.length / 3;
    pts.push(pa[0] + (pc[0] - pa[0]) * t, pa[1] + (pc[1] - pa[1]) * t, pa[2] + (pc[2] - pa[2]) * t);
    kantPunkt.set(nokkel, id);
    return id;
  };

  const trekant = (p: number, q: number, s: number, inne: number[], ute: number[]) => {
    // orient so the normal points from the inside corners to the outside corners
    const P = (i: number) => [pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!];
    const a = P(p),
      c = P(q),
      d = P(s);
    const u = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const w = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
    const nrm = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const sentrum = (ids: number[]) => {
      const s3: [number, number, number] = [0, 0, 0];
      for (const id of ids) {
        const x = pos(id);
        s3[0] += x[0];
        s3[1] += x[1];
        s3[2] += x[2];
      }
      return s3.map((v) => v / ids.length);
    };
    const ci = sentrum(inne),
      cu = sentrum(ute);
    const dir = [cu[0]! - ci[0]!, cu[1]! - ci[1]!, cu[2]! - ci[2]!];
    if (nrm[0]! * dir[0]! + nrm[1]! * dir[1]! + nrm[2]! * dir[2]! < 0) tris.push(p, s, q);
    else tris.push(p, q, s);
  };

  const ids = new Array<number>(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let n = 0; n < nx - 1; n++) {
        let inne = 0,
          ute = 0;
        for (let c = 0; c < 8; c++) {
          const h = HJORNER[c]!;
          ids[c] = nodeId(n + h[0], j + h[1], k + h[2]);
          if (verdi(ids[c]!) < 0) inne++;
          else ute++;
        }
        if (inne === 0 || ute === 0) continue;
        for (const t of TETRAER) {
          const v = t.map((c) => ids[c]!);
          const i = v.filter((id) => verdi(id) < 0);
          const u = v.filter((id) => verdi(id) >= 0);
          if (i.length === 0 || u.length === 0) continue;
          if (i.length === 1) trekant(punkt(i[0]!, u[0]!), punkt(i[0]!, u[1]!), punkt(i[0]!, u[2]!), i, u);
          else if (u.length === 1)
            trekant(punkt(u[0]!, i[0]!), punkt(u[0]!, i[1]!), punkt(u[0]!, i[2]!), i, u);
          else {
            const a = punkt(i[0]!, u[0]!),
              c = punkt(i[0]!, u[1]!),
              d = punkt(i[1]!, u[1]!),
              e = punkt(i[1]!, u[0]!);
            trekant(a, c, d, i, u);
            trekant(a, d, e, i, u);
          }
        }
      }
  return { posisjoner: new Float32Array(pts), indekser: new Uint32Array(tris) };
}

export interface Maaling {
  /** Solid volume (mm³) from the inside cells. */
  volum: number;
  tyngdepunkt: [number, number, number];
  /** Connected inside regions; each lists its node ids. */
  komponenter: number[][];
}

/** Volume, centroid and 6-connected inside regions of a sampled field. */
export function maal(r: Rutenett): Maaling {
  const { nx, ny, nz, g, min, verdier } = r;
  const merke = new Int32Array(verdier.length).fill(-1);
  const komponenter: number[][] = [];
  let n = 0;
  const sum: [number, number, number] = [0, 0, 0];
  for (let id = 0; id < verdier.length; id++) {
    if (verdier[id]! >= 0) continue;
    n++;
    const x = id % nx,
      y = Math.floor(id / nx) % ny,
      z = Math.floor(id / (nx * ny));
    sum[0] += min[0] + x * g;
    sum[1] += min[1] + y * g;
    sum[2] += min[2] + z * g;
    if (merke[id] !== -1) continue;
    const komp: number[] = [];
    const ko = [id];
    merke[id] = komponenter.length;
    while (ko.length) {
      const c = ko.pop()!;
      komp.push(c);
      const cx = c % nx,
        cy = Math.floor(c / nx) % ny,
        cz = Math.floor(c / (nx * ny));
      const nabo: number[] = [];
      if (cx > 0) nabo.push(c - 1);
      if (cx < nx - 1) nabo.push(c + 1);
      if (cy > 0) nabo.push(c - nx);
      if (cy < ny - 1) nabo.push(c + nx);
      if (cz > 0) nabo.push(c - nx * ny);
      if (cz < nz - 1) nabo.push(c + nx * ny);
      for (const m of nabo)
        if (merke[m] === -1 && verdier[m]! < 0) {
          merke[m] = komponenter.length;
          ko.push(m);
        }
    }
    komponenter.push(komp);
  }
  const volum = n * g * g * g;
  return {
    volum,
    tyngdepunkt: n ? [sum[0] / n, sum[1] / n, sum[2] / n] : [0, 0, 0],
    komponenter,
  };
}

export function nodePosisjon(r: Omit<Rutenett, 'verdier'>, id: number): [number, number, number] {
  const x = id % r.nx,
    y = Math.floor(id / r.nx) % r.ny,
    z = Math.floor(id / (r.nx * r.ny));
  return [r.min[0] + x * r.g, r.min[1] + y * r.g, r.min[2] + z * r.g];
}
