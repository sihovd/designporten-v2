/**
 * Advanced colour selection for the Mask step (Sivert, 2026-11-11: «gjerne
 * noe avansert fargeselection valg også»), after Photoshop's «Color Range».
 *
 * Several colour samples make one selection: a pixel is selected when its
 * colour lies within the fuzziness of any sample. Colours are compared as
 * the eye sees them (CIELAB, ΔE) or per RGB channel. The selection can be
 * limited to the areas connected to where the samples were taken, and the
 * light, middle or dark tones can be selected in one go.
 *
 * Pure: works on RGBA arrays at mask resolution, so it runs in tests
 * without a browser. Transparent pixels count as white, as elsewhere.
 */
import type { Utvalg } from './tryllestav';

export interface Fargeprove {
  /** Where it was taken, in mask pixels (for «bare sammenhengende»). */
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

export type Fargemaling = 'oppfattet' | 'rgb';
export type Toneomrade = 'lyse' | 'mellom' | 'morke';

export interface Fargeomradevalg {
  prover: Fargeprove[];
  /** 0–100: how far from a sample a colour may be and still be selected. */
  uskarphet: number;
  maling: Fargemaling;
  sammenhengende: boolean;
}

/** The colour at (x, y), with transparency laid over white. */
export function fargeVed(data: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (Math.round(y) * w + Math.round(x)) * 4;
  const a = data[i + 3]! / 255;
  const over = (v: number) => Math.round(v * a + 255 * (1 - a));
  return { r: over(data[i]!), g: over(data[i + 1]!), b: over(data[i + 2]!) };
}

const lineaer = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116);

/** sRGB to CIELAB (D65). */
export function tilLab(r: number, g: number, b: number): [number, number, number] {
  const R = lineaer(r);
  const G = lineaer(g);
  const B = lineaer(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fy = f(y);
  return [116 * fy - 16, 500 * (f(x) - fy), 200 * (fy - f(z))];
}

/** Every pixel as Lab (3 numbers each), for repeated selections on the same image. */
export function labBilde(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const ut = new Float32Array(w * h * 3);
  const minne = new Map<number, [number, number, number]>();
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3]! / 255;
    const r = Math.round(data[i * 4]! * a + 255 * (1 - a));
    const g = Math.round(data[i * 4 + 1]! * a + 255 * (1 - a));
    const b = Math.round(data[i * 4 + 2]! * a + 255 * (1 - a));
    const nokkel = (r << 16) | (g << 8) | b;
    let lab = minne.get(nokkel);
    if (!lab) {
      lab = tilLab(r, g, b);
      if (minne.size < 200_000) minne.set(nokkel, lab);
    }
    ut[i * 3] = lab[0];
    ut[i * 3 + 1] = lab[1];
    ut[i * 3 + 2] = lab[2];
  }
  return ut;
}

/** ΔE (CIE76) that the fuzziness 0–100 allows; 100 is a wide range, 0 the exact colour. */
const deltaE = (uskarphet: number) => (uskarphet / 100) * 60;
/** Largest per-channel difference the fuzziness allows in RGB. */
const kanalgrense = (uskarphet: number) => (uskarphet / 100) * 160;

/**
 * The colour range: all pixels near any sample. `lab` is `labBilde` of the
 * same image (passed in so it is computed once per image).
 */
export function fargeomrade(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  valg: Fargeomradevalg,
  lab?: Float32Array,
): Utvalg {
  const ut = new Uint8Array(w * h) as Utvalg;
  if (!valg.prover.length) return ut;
  const treff = new Uint8Array(w * h);
  if (valg.maling === 'oppfattet') {
    const l = lab ?? labBilde(data, w, h);
    const grense = deltaE(valg.uskarphet) ** 2;
    const prover = valg.prover.map((p) => tilLab(p.r, p.g, p.b));
    for (let i = 0; i < w * h; i++) {
      const L = l[i * 3]!;
      const A = l[i * 3 + 1]!;
      const B = l[i * 3 + 2]!;
      for (const p of prover)
        if ((L - p[0]) ** 2 + (A - p[1]) ** 2 + (B - p[2]) ** 2 <= grense) {
          treff[i] = 1;
          break;
        }
    }
  } else {
    const grense = kanalgrense(valg.uskarphet);
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3]! / 255;
      const r = data[i * 4]! * a + 255 * (1 - a);
      const g = data[i * 4 + 1]! * a + 255 * (1 - a);
      const b = data[i * 4 + 2]! * a + 255 * (1 - a);
      for (const p of valg.prover)
        if (Math.max(Math.abs(r - p.r), Math.abs(g - p.g), Math.abs(b - p.b)) <= grense) {
          treff[i] = 1;
          break;
        }
    }
  }
  if (!valg.sammenhengende) {
    for (let i = 0; i < w * h; i++) ut[i] = treff[i]!;
    return ut;
  }
  // only what is connected (8 neighbours) to a sample point
  const ko: number[] = [];
  for (const p of valg.prover) {
    const x = Math.min(w - 1, Math.max(0, Math.round(p.x)));
    const y = Math.min(h - 1, Math.max(0, Math.round(p.y)));
    const i = y * w + x;
    if (treff[i] && !ut[i]) {
      ut[i] = 1;
      ko.push(i);
    }
  }
  while (ko.length) {
    const i = ko.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (treff[j] && !ut[j]) {
          ut[j] = 1;
          ko.push(j);
        }
      }
  }
  return ut;
}

/** Light (L* over 70), middle (30–70) or dark (under 30) tones, as Photoshop's Highlights/Midtones/Shadows. */
export function toneomrade(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tone: Toneomrade,
  lab?: Float32Array,
): Utvalg {
  const l = lab ?? labBilde(data, w, h);
  const ut = new Uint8Array(w * h) as Utvalg;
  for (let i = 0; i < w * h; i++) {
    const L = l[i * 3]!;
    ut[i] = tone === 'lyse' ? +(L > 70) : tone === 'morke' ? +(L < 30) : +(L >= 30 && L <= 70);
  }
  return ut;
}

/** The sample nearest in colour to (r, g, b), for Alt + click that removes one. */
export function naermesteProve(prover: Fargeprove[], r: number, g: number, b: number): number {
  let best = -1;
  let bestD = Infinity;
  const m = tilLab(r, g, b);
  prover.forEach((p, i) => {
    const q = tilLab(p.r, p.g, p.b);
    const d = (m[0] - q[0]) ** 2 + (m[1] - q[1]) ** 2 + (m[2] - q[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export const hexAv = (p: { r: number; g: number; b: number }) =>
  `#${[p.r, p.g, p.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
