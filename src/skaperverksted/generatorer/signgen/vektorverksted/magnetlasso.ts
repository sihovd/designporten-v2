/**
 * The magnetic lasso for the Mask step (Sivert, 2026-11-11: «Legg til magnet
 * lasso som et verktøy kjent fra photoshop»).
 *
 * The line between two anchor points follows the strongest edges in the
 * image: every pixel costs less the stronger the edge through it, and the
 * cheapest path (Dijkstra, 8 neighbours) inside a box around the two points
 * is the line. The cursor itself snaps to the strongest edge within `bredde`
 * pixels, as Photoshop's «Width».
 *
 * Pure: works on RGBA arrays at mask resolution, so it runs in tests
 * without a browser.
 */

export interface Punkt {
  x: number;
  y: number;
}

export interface Kantkart {
  bredde: number;
  hoyde: number;
  /** Edge strength per pixel, 0 (flat) to 1 (the strongest edge in the image). */
  styrke: Float32Array;
}

/** Edge strength from a Sobel filter on each colour channel; the strongest channel wins. */
export function lagKantkart(data: Uint8ClampedArray, bredde: number, hoyde: number): Kantkart {
  const styrke = new Float32Array(bredde * hoyde);
  // transparent pixels count as white, as in the rest of the converter
  const kanal = new Float32Array(bredde * hoyde * 3);
  for (let i = 0; i < bredde * hoyde; i++) {
    const a = data[i * 4 + 3]! / 255;
    for (let c = 0; c < 3; c++) kanal[i * 3 + c] = data[i * 4 + c]! * a + 255 * (1 - a);
  }
  let maks = 0;
  for (let y = 1; y < hoyde - 1; y++)
    for (let x = 1; x < bredde - 1; x++) {
      let best = 0;
      for (let c = 0; c < 3; c++) {
        const v = (dx: number, dy: number) => kanal[((y + dy) * bredde + x + dx) * 3 + c]!;
        const gx = v(1, -1) + 2 * v(1, 0) + v(1, 1) - v(-1, -1) - 2 * v(-1, 0) - v(-1, 1);
        const gy = v(-1, 1) + 2 * v(0, 1) + v(1, 1) - v(-1, -1) - 2 * v(0, -1) - v(1, -1);
        const g = gx * gx + gy * gy;
        if (g > best) best = g;
      }
      const s = Math.sqrt(best);
      styrke[y * bredde + x] = s;
      if (s > maks) maks = s;
    }
  if (maks > 0) for (let i = 0; i < styrke.length; i++) styrke[i] = styrke[i]! / maks;
  return { bredde, hoyde, styrke };
}

const klem = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** The pixel with the strongest edge within `radius` of p; p itself when nothing there is an edge. */
export function festTilKant(k: Kantkart, p: Punkt, radius: number): Punkt {
  const px = klem(Math.round(p.x), 0, k.bredde - 1);
  const py = klem(Math.round(p.y), 0, k.hoyde - 1);
  const r = Math.max(0, Math.round(radius));
  let best = { x: px, y: py };
  let bestVerdi = k.styrke[py * k.bredde + px]!;
  for (let y = Math.max(0, py - r); y <= Math.min(k.hoyde - 1, py + r); y++)
    for (let x = Math.max(0, px - r); x <= Math.min(k.bredde - 1, px + r); x++) {
      const d2 = (x - px) ** 2 + (y - py) ** 2;
      if (d2 > r * r) continue;
      // ties go to the nearer pixel
      const v = k.styrke[y * k.bredde + x]! - d2 * 1e-6;
      if (v > bestVerdi) {
        bestVerdi = v;
        best = { x, y };
      }
    }
  return bestVerdi > 0.08 ? best : { x: px, y: py };
}

/** A binary min-heap of pixel indices by cost. */
class Haug {
  private ider: number[] = [];
  private kost: number[] = [];
  get tom() {
    return this.ider.length === 0;
  }
  legg(id: number, k: number) {
    this.ider.push(id);
    this.kost.push(k);
    let i = this.ider.length - 1;
    while (i > 0) {
      const f = (i - 1) >> 1;
      if (this.kost[f]! <= this.kost[i]!) break;
      this.bytt(i, f);
      i = f;
    }
  }
  ta(): [number, number] {
    const ut: [number, number] = [this.ider[0]!, this.kost[0]!];
    const sid = this.ider.pop()!;
    const sk = this.kost.pop()!;
    if (this.ider.length) {
      this.ider[0] = sid;
      this.kost[0] = sk;
      let i = 0;
      for (;;) {
        const v = 2 * i + 1;
        const h = v + 1;
        let m = i;
        if (v < this.ider.length && this.kost[v]! < this.kost[m]!) m = v;
        if (h < this.ider.length && this.kost[h]! < this.kost[m]!) m = h;
        if (m === i) break;
        this.bytt(i, m);
        i = m;
      }
    }
    return ut;
  }
  private bytt(a: number, b: number) {
    [this.ider[a], this.ider[b]] = [this.ider[b]!, this.ider[a]!];
    [this.kost[a], this.kost[b]] = [this.kost[b]!, this.kost[a]!];
  }
}

/** Largest side of the search box, so one segment never takes long. */
const MAKS_BOKS = 500;

/**
 * The cheapest path from `fra` to `til` along the edges, as pixel points
 * (both ends included). The search stays inside the box around the two
 * points grown by `marg` pixels.
 */
export function kantsti(k: Kantkart, fra: Punkt, til: Punkt, marg = 12): Punkt[] {
  const a = { x: klem(Math.round(fra.x), 0, k.bredde - 1), y: klem(Math.round(fra.y), 0, k.hoyde - 1) };
  const b = { x: klem(Math.round(til.x), 0, k.bredde - 1), y: klem(Math.round(til.y), 0, k.hoyde - 1) };
  if (a.x === b.x && a.y === b.y) return [a];
  const x0 = Math.max(0, Math.min(a.x, b.x) - marg);
  const x1 = Math.min(k.bredde - 1, Math.max(a.x, b.x) + marg);
  const y0 = Math.max(0, Math.min(a.y, b.y) - marg);
  const y1 = Math.min(k.hoyde - 1, Math.max(a.y, b.y) + marg);
  // a very long segment: a straight line is better than a slow search
  if (x1 - x0 > MAKS_BOKS || y1 - y0 > MAKS_BOKS) return rettLinje(a, b);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const n = w * h;
  const avstand = new Float64Array(n).fill(Infinity);
  const fraId = new Int32Array(n).fill(-1);
  const ferdig = new Uint8Array(n);
  const lokal = (x: number, y: number) => (y - y0) * w + (x - x0);
  const start = lokal(a.x, a.y);
  const maal = lokal(b.x, b.y);
  avstand[start] = 0;
  const haug = new Haug();
  haug.legg(start, 0);
  const SQRT2 = Math.SQRT2;
  while (!haug.tom) {
    const [i, d] = haug.ta();
    if (ferdig[i]) continue;
    ferdig[i] = 1;
    if (i === maal) break;
    const x = (i % w) + x0;
    const y = Math.floor(i / w) + y0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const j = lokal(nx, ny);
        if (ferdig[j]) continue;
        // a strong edge costs almost nothing; a flat area costs one per pixel
        const s = k.styrke[ny * k.bredde + nx]!;
        const steg = (1 - s) ** 2 + 0.02;
        const nd = d + steg * (dx && dy ? SQRT2 : 1);
        if (nd < avstand[j]!) {
          avstand[j] = nd;
          fraId[j] = i;
          haug.legg(j, nd);
        }
      }
  }
  if (fraId[maal] === -1) return rettLinje(a, b);
  const sti: Punkt[] = [];
  for (let i = maal; i !== -1; i = fraId[i]!) sti.push({ x: (i % w) + x0, y: Math.floor(i / w) + y0 });
  return sti.reverse();
}

function rettLinje(a: Punkt, b: Punkt): Punkt[] {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const ut: Punkt[] = [];
  for (let i = 0; i <= n; i++)
    ut.push({ x: Math.round(a.x + ((b.x - a.x) * i) / n), y: Math.round(a.y + ((b.y - a.y) * i) / n) });
  return ut;
}

/** Drops points on straight runs, so the outline stays light. */
export function forenkleSti(sti: Punkt[]): Punkt[] {
  if (sti.length < 3) return sti.slice();
  const ut: Punkt[] = [sti[0]!];
  for (let i = 1; i < sti.length - 1; i++) {
    const p = ut[ut.length - 1]!;
    const q = sti[i]!;
    const r = sti[i + 1]!;
    if ((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) !== 0) ut.push(q);
  }
  ut.push(sti[sti.length - 1]!);
  return ut;
}
