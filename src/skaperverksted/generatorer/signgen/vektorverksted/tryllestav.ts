/**
 * Vektorverksted: the magic wand for the mask step (Sivert, 2026-11-09:
 * «et bedre verktøy slik som magic wand i photoshop som kan regne ut hva du
 * ønsker å fjerne»).
 *
 * A selection is one byte per pixel (1 = selected) over the image at mask
 * resolution. The wand picks the pixels whose colour lies within the
 * tolerance of the clicked colour: either only those connected to the click
 * (contiguous) or all of them in the image. «Bakgrunn» seeds the wand from
 * every pixel along the image edge, which finds a plain background in one go.
 *
 * Pure: works on RGBA arrays, so it runs in tests without a browser.
 */

export type Utvalg = Uint8Array;

/** Largest per-channel difference (alpha included), as Photoshop's tolerance. */
function forskjell(d: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number): number {
  return Math.max(
    Math.abs(d[i]! - r),
    Math.abs(d[i + 1]! - g),
    Math.abs(d[i + 2]! - b),
    Math.abs(d[i + 3]! - a),
  );
}

/**
 * The wand from one point. `toleranse` is 0–255; `sammenhengende` limits
 * the selection to pixels connected (8-neighbourhood) to the point.
 */
export function tryllestav(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  toleranse: number,
  sammenhengende: boolean,
): Utvalg {
  const ut = new Uint8Array(w * h);
  const sx = Math.max(0, Math.min(w - 1, Math.floor(x))),
    sy = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const s = (sy * w + sx) * 4;
  const r = data[s]!,
    g = data[s + 1]!,
    b = data[s + 2]!,
    a = data[s + 3]!;
  if (!sammenhengende) {
    for (let i = 0; i < w * h; i++) if (forskjell(data, i * 4, r, g, b, a) <= toleranse) ut[i] = 1;
    return ut;
  }
  return fyll(data, w, h, [sy * w + sx], (i) => forskjell(data, i * 4, r, g, b, a) <= toleranse);
}

/** Flood fill from the seeds through pixels that pass `med` (8-neighbourhood). */
function fyll(
  _data: Uint8ClampedArray,
  w: number,
  h: number,
  fro: number[],
  med: (i: number) => boolean,
): Utvalg {
  const ut = new Uint8Array(w * h);
  const ko = new Int32Array(w * h);
  let hale = 0;
  for (const f of fro) {
    if (ut[f] || !med(f)) continue;
    ut[f] = 1;
    ko[hale++] = f;
  }
  let hode = 0;
  while (hode < hale) {
    const i = ko[hode++]!;
    const x = i % w,
      y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if ((!dx && !dy) || xx < 0 || xx >= w) continue;
        const j = yy * w + xx;
        if (ut[j] || !med(j)) continue;
        ut[j] = 1;
        ko[hale++] = j;
      }
    }
  }
  return ut;
}

/** A colour with alpha, 0–255 per channel. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The most common colour along the image edge (in 16 levels per channel), averaged. */
export function kantfarge(data: Uint8ClampedArray, w: number, h: number): Rgba {
  const tell = new Map<number, { n: number; r: number; g: number; b: number; a: number }>();
  for (const i of kantpiksler(w, h)) {
    const p = i * 4;
    const k =
      ((data[p]! >> 4) << 12) | ((data[p + 1]! >> 4) << 8) | ((data[p + 2]! >> 4) << 4) | (data[p + 3]! >> 4);
    const t = tell.get(k);
    if (t) {
      t.n++;
      t.r += data[p]!;
      t.g += data[p + 1]!;
      t.b += data[p + 2]!;
      t.a += data[p + 3]!;
    } else tell.set(k, { n: 1, r: data[p]!, g: data[p + 1]!, b: data[p + 2]!, a: data[p + 3]! });
  }
  let beste = { n: 0, r: 255, g: 255, b: 255, a: 255 };
  for (const t of tell.values()) if (t.n > beste.n) beste = t;
  const n = Math.max(1, beste.n);
  return { r: beste.r / n, g: beste.g / n, b: beste.b / n, a: beste.a / n };
}

function kantpiksler(w: number, h: number): number[] {
  const kant: number[] = [];
  for (let x = 0; x < w; x++) kant.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) kant.push(y * w, y * w + w - 1);
  return kant;
}

/**
 * The background: the wand seeded from the image edge. Each edge pixel is
 * compared with the most common edge colour, so a logo touching the edge
 * is not taken along.
 */
export function bakgrunnsutvalg(data: Uint8ClampedArray, w: number, h: number, toleranse: number): Utvalg {
  const { r, g, b, a } = kantfarge(data, w, h);
  return fyll(data, w, h, kantpiksler(w, h), (i) => forskjell(data, i * 4, r, g, b, a) <= toleranse);
}

/** The colour at (x, y). */
export function fargeVed(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): Rgba {
  const sx = Math.max(0, Math.min(w - 1, Math.floor(x)));
  const sy = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const p = (sy * w + sx) * 4;
  return { r: data[p]!, g: data[p + 1]!, b: data[p + 2]!, a: data[p + 3]! };
}

/** Number of steps in the colour spectrum (4 tolerance levels each). */
export const SPEKTERSTEG = 64;

export interface Fargespekter {
  /**
   * The image's own colours ordered by how far they lie from the chosen
   * colour: the average colour (over white) of the pixels in each step of
   * tolerance, or null where the image has none.
   */
  farger: ({ r: number; g: number; b: number } | null)[];
  /** Share of the image (0–1) within each tolerance 0–255, for «x % av bildet». */
  andelInnenfor: Float32Array;
}

/**
 * The colours of the image as the tolerance slider reaches them
 * (Sivert, 2026-11-12: «en glider som viser toleranse i det valgte
 * fargespekteret»). Tolerance is measured as in the wand.
 */
export function fargespekter(data: Uint8ClampedArray, w: number, h: number, f: Rgba): Fargespekter {
  const sum = new Float64Array(SPEKTERSTEG * 3);
  const antall = new Float64Array(SPEKTERSTEG);
  const perToleranse = new Float64Array(256);
  for (let i = 0; i < w * h; i++) {
    const d = forskjell(data, i * 4, f.r, f.g, f.b, f.a);
    perToleranse[d]!++;
    const steg = Math.min(SPEKTERSTEG - 1, Math.floor((d * SPEKTERSTEG) / 256));
    const a = data[i * 4 + 3]! / 255;
    sum[steg * 3] = sum[steg * 3]! + data[i * 4]! * a + 255 * (1 - a);
    sum[steg * 3 + 1] = sum[steg * 3 + 1]! + data[i * 4 + 1]! * a + 255 * (1 - a);
    sum[steg * 3 + 2] = sum[steg * 3 + 2]! + data[i * 4 + 2]! * a + 255 * (1 - a);
    antall[steg]!++;
  }
  const farger = Array.from({ length: SPEKTERSTEG }, (_, s) =>
    antall[s]
      ? {
          r: Math.round(sum[s * 3]! / antall[s]!),
          g: Math.round(sum[s * 3 + 1]! / antall[s]!),
          b: Math.round(sum[s * 3 + 2]! / antall[s]!),
        }
      : null,
  );
  const andelInnenfor = new Float32Array(256);
  let samlet = 0;
  for (let t = 0; t < 256; t++) {
    samlet += perToleranse[t]!;
    andelInnenfor[t] = samlet / Math.max(1, w * h);
  }
  return { farger, andelInnenfor };
}

/** Union, difference or replacement of two selections. */
export function kombiner(gammel: Utvalg | null, ny: Utvalg, modus: 'ny' | 'legg-til' | 'trekk-fra'): Utvalg {
  if (!gammel || modus === 'ny') return ny;
  const ut = new Uint8Array(ny.length);
  for (let i = 0; i < ny.length; i++)
    ut[i] = modus === 'legg-til' ? gammel[i]! | ny[i]! : gammel[i]! & (1 - ny[i]!);
  return ut;
}

export function inverterUtvalg(u: Utvalg): Utvalg {
  return u.map((v) => 1 - v);
}

/** Grows (r > 0) or shrinks (r < 0) a selection by r pixels (square neighbourhood, separable). */
export function utvid(u: Utvalg, w: number, h: number, r: number): Utvalg {
  const n = Math.round(Math.abs(r));
  if (!n) return u.slice();
  const vokse = r > 0;
  const mal = vokse ? 1 : 0;
  const rad = new Uint8Array(u.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1 - mal;
      for (let k = -n; k <= n && v !== mal; k++) {
        const xx = x + k;
        const p = xx < 0 || xx >= w ? 0 : u[y * w + xx]!;
        if (p === mal) v = mal;
      }
      rad[y * w + x] = v;
    }
  }
  const ut = new Uint8Array(u.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1 - mal;
      for (let k = -n; k <= n && v !== mal; k++) {
        const yy = y + k;
        const p = yy < 0 || yy >= h ? 0 : rad[yy * w + x]!;
        if (p === mal) v = mal;
      }
      ut[y * w + x] = v;
    }
  }
  return ut;
}

export function antallValgt(u: Utvalg): number {
  let n = 0;
  for (let i = 0; i < u.length; i++) n += u[i]!;
  return n;
}

/** The selection drawn as an overlay: tinted inside, solid along its edge. */
export function utvalgsbilde(u: Utvalg, w: number, h: number, ut: Uint8ClampedArray): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      if (!u[i]) {
        ut[p + 3] = 0;
        continue;
      }
      const kant =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 || !u[i - 1] || !u[i + 1] || !u[i - w] || !u[i + w];
      ut[p] = kant ? 255 : 57;
      ut[p + 1] = kant ? 255 : 208;
      ut[p + 2] = kant ? 255 : 255;
      ut[p + 3] = kant ? 255 : 95;
    }
  }
}
