/**
 * Edge Snap (Sivert, 2026-10-10): the outer outline of a printed sign, from the real parts, so signs on a
 * build plate can be put against each other by their contours and not by their boxes. Outlines and
 * decorations are in it because every part is rasterised, and holes inside the sign are filled so a small
 * sign does not slip into the eye of a letter.
 *
 * The outline is a grid of cells (`OPPLOSNING` mm). From it comes a distance field, so the distance between
 * two signs at any placement is read, not searched for. The distance is accurate to about one cell. Nothing
 * here changes a sign: it only reads its geometry and gives back where it may be placed.
 */
import type { Mesh } from '../../geometri/mesh';
import type { Region, Ring } from '../../geometri/polygon';

/** Millimetres per cell. Thin outlines are at least 0.6 mm, so they are always at least a few cells wide. */
export const OPPLOSNING = 0.2;

/** How far outside the sign the distance field reaches by default (mm); farther away counts as «far enough». */
export const FELTRAND = 12;

/** The margin a silhouette needs to hold a wanted distance and still see the neighbour coming (mm). */
export const feltrandFor = (avstand: number, fangavstand: number) =>
  Math.max(FELTRAND, avstand + fangavstand + 2);

export interface Silhuett {
  /** How far outside the sign the distance field reaches (mm). */
  felt: number;
  /** Lower left corner of cell (0, 0) in the sign's own coordinates (mm). */
  minX: number;
  minY: number;
  /** Size in cells. */
  b: number;
  h: number;
  /** 1 where the sign is (with holes filled). */
  fylt: Uint8Array;
  /** Cells on the outline: filled with an empty neighbour. */
  rand: Int32Array;
  /** Distance in mm from each cell centre to the nearest filled cell; 0 inside. Read with `avstandVed`. */
  avstand: Float32Array;
}

/** Fill every cell whose centre is inside the triangle (projected to the plate). */
function fyllTrekant(
  fylt: Uint8Array,
  b: number,
  h: number,
  minX: number,
  minY: number,
  p: readonly number[],
): void {
  const [x0, y0, x1, y1, x2, y2] = p.map((v, i) =>
    i % 2 === 0 ? (v - minX) / OPPLOSNING : (v - minY) / OPPLOSNING,
  ) as [number, number, number, number, number, number];
  const areal = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  const iy0 = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const iy1 = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
  const ix0 = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const ix1 = Math.min(b - 1, Math.ceil(Math.max(x0, x1, x2)));
  if (Math.abs(areal) < 1e-9) return;
  const fortegn = areal > 0 ? 1 : -1;
  for (let y = iy0; y <= iy1; y++) {
    const cy = y + 0.5;
    for (let x = ix0; x <= ix1; x++) {
      const cx = x + 0.5;
      const e0 = ((x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0)) * fortegn;
      const e1 = ((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)) * fortegn;
      const e2 = ((x0 - x2) * (cy - y2) - (y0 - y2) * (cx - x2)) * fortegn;
      if (e0 >= -1e-6 && e1 >= -1e-6 && e2 >= -1e-6) fylt[y * b + x] = 1;
    }
  }
}

/** Mark the cells of the empty region that reach the border, so what is left empty inside is a hole. */
function fyllHull(fylt: Uint8Array, b: number, h: number): void {
  const utenfor = new Uint8Array(b * h);
  const ko = new Int32Array(b * h);
  let hode = 0;
  let hale = 0;
  const legg = (i: number) => {
    if (fylt[i] || utenfor[i]) return;
    utenfor[i] = 1;
    ko[hale++] = i;
  };
  for (let x = 0; x < b; x++) {
    legg(x);
    legg((h - 1) * b + x);
  }
  for (let y = 0; y < h; y++) {
    legg(y * b);
    legg(y * b + b - 1);
  }
  while (hode < hale) {
    const i = ko[hode++]!;
    const x = i % b;
    const y = (i - x) / b;
    if (x > 0) legg(i - 1);
    if (x < b - 1) legg(i + 1);
    if (y > 0) legg(i - b);
    if (y < h - 1) legg(i + b);
  }
  for (let i = 0; i < fylt.length; i++) if (!utenfor[i]) fylt[i] = 1;
}

const UENDELIG = 1e20;

/** One dimension of the exact Euclidean distance transform (Felzenszwalb and Huttenlocher), squared distances. */
function dt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -UENDELIG;
  z[1] = UENDELIG;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = UENDELIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dq = q - v[k]!;
    d[q] = dq * dq + f[v[k]!]!;
  }
}

function avstandsfelt(fylt: Uint8Array, b: number, h: number): Float32Array {
  const grid = new Float64Array(b * h);
  for (let i = 0; i < grid.length; i++) grid[i] = fylt[i] ? 0 : UENDELIG;
  const n = Math.max(b, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < b; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * b + x]!;
    dt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * b + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) f[x] = grid[y * b + x]!;
    dt1d(f, b, d, v, z);
    for (let x = 0; x < b; x++) grid[y * b + x] = d[x]!;
  }
  const ut = new Float32Array(b * h);
  for (let i = 0; i < ut.length; i++) ut[i] = Math.sqrt(grid[i]!) * OPPLOSNING;
  return ut;
}

const tomSilhuett = (felt: number): Silhuett => ({
  felt,
  minX: 0,
  minY: 0,
  b: 1,
  h: 1,
  fylt: new Uint8Array(1),
  rand: new Int32Array(0),
  avstand: new Float32Array(1),
});

/** A grid that holds `[minX, maksX] × [minY, maksY]` with the margin around it. */
function lagRutenett(minX: number, minY: number, maksX: number, maksY: number, felt: number) {
  const rand0 = Math.ceil(felt / OPPLOSNING);
  return {
    gx: minX - rand0 * OPPLOSNING,
    gy: minY - rand0 * OPPLOSNING,
    b: Math.ceil((maksX - minX) / OPPLOSNING) + 2 * rand0 + 1,
    h: Math.ceil((maksY - minY) / OPPLOSNING) + 2 * rand0 + 1,
  };
}

/** The filled cells become a silhouette: holes filled, the outline cells found, the distance field made. */
function ferdigSilhuett(
  gx: number,
  gy: number,
  b: number,
  h: number,
  fylt: Uint8Array,
  felt: number,
): Silhuett {
  fyllHull(fylt, b, h);
  const rand: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      const i = y * b + x;
      if (!fylt[i]) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === b - 1 ||
        y === h - 1 ||
        !fylt[i - 1] ||
        !fylt[i + 1] ||
        !fylt[i - b] ||
        !fylt[i + b]
      ) {
        rand.push(i);
      }
    }
  }
  return {
    felt,
    minX: gx,
    minY: gy,
    b,
    h,
    fylt,
    rand: Int32Array.from(rand),
    avstand: avstandsfelt(fylt, b, h),
  };
}

/** The outline of a set of meshes (a sign's parts, in the sign's own coordinates). */
export function lagSilhuett(meshes: readonly Mesh[], felt = FELTRAND): Silhuett {
  let minX = Infinity;
  let minY = Infinity;
  let maksX = -Infinity;
  let maksY = -Infinity;
  for (const m of meshes) {
    const p = m.posisjoner;
    for (let i = 0; i < p.length; i += 3) {
      minX = Math.min(minX, p[i]!);
      maksX = Math.max(maksX, p[i]!);
      minY = Math.min(minY, p[i + 1]!);
      maksY = Math.max(maksY, p[i + 1]!);
    }
  }
  if (!Number.isFinite(minX)) return tomSilhuett(felt);
  const { gx, gy, b, h } = lagRutenett(minX, minY, maksX, maksY, felt);
  const fylt = new Uint8Array(b * h);
  for (const m of meshes) {
    const p = m.posisjoner;
    const ix = m.indekser;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]! * 3;
      const bb = ix[t + 1]! * 3;
      const c = ix[t + 2]! * 3;
      fyllTrekant(fylt, b, h, gx, gy, [p[a]!, p[a + 1]!, p[bb]!, p[bb + 1]!, p[c]!, p[c + 1]!]);
    }
  }
  return ferdigSilhuett(gx, gy, b, h, fylt, felt);
}

/**
 * The outline of flat regions (the shapes of the 2D editor: text, vectors, outlines), in the same
 * coordinates as the regions. A cell is filled when its centre is inside a polygon and outside its holes.
 */
export function lagSilhuettFraRegioner(regioner: readonly Region[], felt = FELTRAND): Silhuett {
  const ringer: Ring[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maksX = -Infinity;
  let maksY = -Infinity;
  for (const r of regioner) {
    for (const f of r) {
      for (const ring of [f.ytre, ...f.hull]) {
        if (ring.length < 3) continue;
        ringer.push(ring);
        if (ring === f.ytre) {
          for (const p of ring) {
            minX = Math.min(minX, p.x);
            maksX = Math.max(maksX, p.x);
            minY = Math.min(minY, p.y);
            maksY = Math.max(maksY, p.y);
          }
        }
      }
    }
  }
  if (!Number.isFinite(minX)) return tomSilhuett(felt);
  const { gx, gy, b, h } = lagRutenett(minX, minY, maksX, maksY, felt);
  const fylt = new Uint8Array(b * h);
  // even-odd scanline per row of cell centres: a hole of a polygon is crossed twice more, so it stays empty
  for (let y = 0; y < h; y++) {
    const cy = gy + (y + 0.5) * OPPLOSNING;
    const kryss: number[] = [];
    for (const ring of ringer) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j]!;
        const c = ring[i]!;
        if (a.y > cy === c.y > cy) continue;
        kryss.push(a.x + ((cy - a.y) / (c.y - a.y)) * (c.x - a.x));
      }
    }
    kryss.sort((p, q) => p - q);
    for (let k = 0; k + 1 < kryss.length; k += 2) {
      const x0 = Math.max(0, Math.ceil((kryss[k]! - gx) / OPPLOSNING - 0.5));
      const x1 = Math.min(b - 1, Math.floor((kryss[k + 1]! - gx) / OPPLOSNING - 0.5));
      for (let x = x0; x <= x1; x++) fylt[y * b + x] = 1;
    }
  }
  return ferdigSilhuett(gx, gy, b, h, fylt, felt);
}

/** Distance (mm) from a point in the sign's own coordinates to the sign; the margin of the field and up when it is outside it. */
export function avstandVed(s: Silhuett, x: number, y: number): number {
  const cx = Math.floor((x - s.minX) / OPPLOSNING);
  const cy = Math.floor((y - s.minY) / OPPLOSNING);
  if (cx < 0 || cy < 0 || cx >= s.b || cy >= s.h) return s.felt;
  return s.avstand[cy * s.b + cx]!;
}

/** The centre of a cell in the sign's own coordinates. */
function cellesenter(s: Silhuett, i: number): [number, number] {
  const x = i % s.b;
  const y = (i - x) / s.b;
  return [s.minX + (x + 0.5) * OPPLOSNING, s.minY + (y + 0.5) * OPPLOSNING];
}

export interface Kontakt {
  /**
   * The shortest distance between the two outlines (mm), 0 when they touch or overlap. The cells are read
   * at their centres, so a straight gap measures one cell too wide; that cell is taken off.
   */
  d: number;
  /** The outlines cross each other. */
  overlapper: boolean;
  /** The closest point on the first sign, in plate coordinates. */
  a: [number, number];
  /** The closest point on the second sign, in plate coordinates. */
  b: [number, number];
  /** Unit vector pointing from the second sign towards the first at the contact. */
  retning: [number, number];
}

/** The outline cells of `fra` read against the distance field of `til`: the shortest distance and where it is. */
function enVei(
  fra: Silhuett,
  fdx: number,
  fdy: number,
  til: Silhuett,
  tdx: number,
  tdy: number,
): { d: number; p: [number, number]; g: [number, number] } {
  let best = Infinity;
  let punkt: [number, number] = [0, 0];
  for (let k = 0; k < fra.rand.length; k++) {
    const [lx, ly] = cellesenter(fra, fra.rand[k]!);
    const wx = lx + fdx;
    const wy = ly + fdy;
    const d = avstandVed(til, wx - tdx, wy - tdy);
    if (d < best) {
      best = d;
      punkt = [wx, wy];
    }
  }
  // the direction away from `til` at that point
  return { d: best, p: punkt, g: gradient(til, punkt[0] - tdx, punkt[1] - tdy) };
}

/**
 * The shortest distance between two signs, each placed with an offset (the offset is added to the sign's
 * own coordinates). Reads the outline of each against the distance field of the other, so a sign that lies
 * wholly inside the other is found as well.
 */
export function minsteAvstand(
  a: Silhuett,
  adx: number,
  ady: number,
  b: Silhuett,
  bdx: number,
  bdy: number,
): Kontakt {
  const ab = enVei(a, adx, ady, b, bdx, bdy);
  const ba = enVei(b, bdx, bdy, a, adx, ady);
  const tilGap = (raa: number) => Math.max(0, raa - OPPLOSNING);
  if (ab.d <= ba.d) {
    return {
      d: tilGap(ab.d),
      overlapper: ab.d < OPPLOSNING / 2,
      a: ab.p,
      b: [ab.p[0] - ab.g[0] * ab.d, ab.p[1] - ab.g[1] * ab.d],
      retning: ab.g,
    };
  }
  return {
    d: tilGap(ba.d),
    overlapper: ba.d < OPPLOSNING / 2,
    a: [ba.p[0] - ba.g[0] * ba.d, ba.p[1] - ba.g[1] * ba.d],
    b: ba.p,
    retning: [-ba.g[0], -ba.g[1]],
  };
}

/** Unit direction in which the distance to the sign grows fastest at a point (away from the sign). */
function gradient(s: Silhuett, x: number, y: number): [number, number] {
  const e = OPPLOSNING * 1.5;
  const gx = avstandVed(s, x + e, y) - avstandVed(s, x - e, y);
  const gy = avstandVed(s, x, y + e) - avstandVed(s, x, y - e);
  const l = Math.hypot(gx, gy);
  return l < 1e-6 ? [0, 1] : [gx / l, gy / l];
}
