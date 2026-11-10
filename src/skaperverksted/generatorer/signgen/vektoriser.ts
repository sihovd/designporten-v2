/**
 * Vektorisering (Sivert, 2026-11-08: «En vektorizer som vi kan ha i signforge»).
 * A raster image (logo, drawing, photo of a sketch) is traced into filled
 * SVG paths, one path per colour, which then go through the ordinary SVG
 * import (svgimport.ts) and the part picker like any SVG file.
 *
 * Pure: works on ImageData-shaped pixels, so it runs in tests without a
 * browser. Loading a file into pixels is done by the dialog.
 * Tracing is imagetracerjs (public domain).
 */
import ImageTracer from 'imagetracerjs';

/** Pixels as in ImageData: RGBA, row by row. */
export interface Piksler {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Vektorvalg {
  /** 1 = one colour (black/white by a threshold), 2–6 = that many colours. */
  farger: number;
  /** 0 = sharp corners and small details, 1 = soft curves. */
  glatthet: number;
  /** Pieces smaller than this many pixels (in the original image) are dropped. */
  flekker: number;
  /** Leave out the background (the colour along the image edge). */
  fjernBakgrunn: boolean;
  /** One colour: swap what counts as drawing and background. */
  inverter: boolean;
  /** One colour: brightness limit 0–255, or null for automatic (Otsu). */
  terskel: number | null;
}

export const STANDARD_VEKTORVALG: Vektorvalg = {
  farger: 1,
  glatthet: 0.5,
  flekker: 8,
  fjernBakgrunn: true,
  inverter: false,
  terskel: null,
};

export interface Vektorlag {
  /** #rrggbb */
  farge: string;
  /** Path data in image pixels, holes included (evenodd). */
  d: string;
  /** Number of separate pieces. */
  deler: number;
}

export interface Vektorresultat {
  svg: string;
  lag: Vektorlag[];
  bredde: number;
  hoyde: number;
  /** The threshold used in one-colour mode. */
  terskel: number | null;
}

export class VektorFeil extends Error {}

interface Segment {
  type: 'L' | 'Q';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
}
interface Sporbane {
  segments: Segment[];
  isholepath: boolean;
  holechildren: number[];
  boundingbox: [number, number, number, number];
}
export interface Farge {
  r: number;
  g: number;
  b: number;
  a: number;
}
interface Spordata {
  layers: Sporbane[][];
  palette: Farge[];
  width: number;
  height: number;
}

const klem = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lys = (d: Uint8ClampedArray, i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;

export function tilHex(f: { r: number; g: number; b: number }): string {
  return '#' + [f.r, f.g, f.b].map((v) => klem(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

/** Transparent pixels are laid over white, so a cut-out logo gets a plain background. */
export function flatUtAlfa(p: Piksler): Piksler {
  const d = new Uint8ClampedArray(p.data);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]! / 255;
    if (a < 1) {
      d[i] = d[i]! * a + 255 * (1 - a);
      d[i + 1] = d[i + 1]! * a + 255 * (1 - a);
      d[i + 2] = d[i + 2]! * a + 255 * (1 - a);
      d[i + 3] = 255;
    }
  }
  return { width: p.width, height: p.height, data: d };
}

/** Otsu's threshold on brightness: the limit that best splits the image in two. */
export function otsu(p: Piksler): number {
  const hist = new Array<number>(256).fill(0);
  const d = p.data;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) hist[Math.round(lys(d, i))]!++;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t]!;
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let terskel = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const mellom = wB * wF * (mB - mF) * (mB - mF);
    if (mellom > best) {
      best = mellom;
      terskel = t + 0.5;
    }
  }
  return terskel;
}

/** Black where darker than the threshold (or lighter, inverted), white elsewhere. */
export function svartHvitt(p: Piksler, terskel: number, inverter: boolean): Piksler {
  const d = new Uint8ClampedArray(p.data.length);
  for (let i = 0; i < d.length; i += 4) {
    let mork = lys(p.data, i) < terskel;
    if (inverter) mork = !mork;
    const v = mork ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  return { width: p.width, height: p.height, data: d };
}

function naermeste(pal: Farge[], r: number, g: number, b: number): number {
  let beste = 0;
  let bestAvstand = Infinity;
  pal.forEach((f, k) => {
    const a = (f.r - r) ** 2 + (f.g - g) ** 2 + (f.b - b) ** 2;
    if (a < bestAvstand) {
      bestAvstand = a;
      beste = k;
    }
  });
  return beste;
}

/** The palette entry most common along the image edge: the background. */
export function bakgrunnIndeks(p: Piksler, pal: Farge[]): number {
  const { width: w, height: h, data: d } = p;
  const tell = new Array<number>(pal.length).fill(0);
  const px = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    tell[naermeste(pal, d[i]!, d[i + 1]!, d[i + 2]!)]!++;
  };
  for (let x = 0; x < w; x++) {
    px(x, 0);
    px(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    px(0, y);
    px(w - 1, y);
  }
  let beste = 0;
  for (let k = 1; k < tell.length; k++) if (tell[k]! > tell[beste]!) beste = k;
  return beste;
}

/**
 * The image's main colours. Pixels are counted in a 32-level-per-channel
 * histogram; the start colours are picked farthest-first among colours
 * that cover a noticeable share of the image (so the blended pixels along
 * anti-aliased edges never become a colour of their own), then refined
 * with a few rounds of weighted k-means.
 */
export function hovedfarger(p: Piksler, antall: number): Farge[] {
  const d = p.data;
  const n = d.length / 4;
  const tell = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < d.length; i += 4) {
    const k = ((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3);
    const b = tell.get(k);
    if (b) {
      b.r += d[i]!;
      b.g += d[i + 1]!;
      b.b += d[i + 2]!;
      b.n++;
    } else tell.set(k, { r: d[i]!, g: d[i + 1]!, b: d[i + 2]!, n: 1 });
  }
  const botter = [...tell.values()].map((b) => ({ r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, n: b.n }));
  botter.sort((a, b) => b.n - a.n);
  const avstand = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
    (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  // candidates: buckets that, with their near neighbours, cover at least 0.3 % of the image
  const grense = Math.max(1, n * 0.003);
  const kandidater = botter.filter((b) => {
    let sum = 0;
    for (const o of botter) if (avstand(b, o) <= 24 * 24) sum += o.n;
    return sum >= grense;
  });
  const kilde = kandidater.length ? kandidater : botter;
  const sentre = [{ ...kilde[0]! }];
  while (sentre.length < antall) {
    let beste: (typeof kilde)[number] | null = null;
    let bestAvstand = 0;
    for (const b of kilde) {
      const a = Math.min(...sentre.map((c) => avstand(b, c)));
      if (a > bestAvstand) {
        bestAvstand = a;
        beste = b;
      }
    }
    if (!beste || bestAvstand < 12 * 12) break; // no more distinct colours
    sentre.push({ ...beste });
  }
  for (let runde = 0; runde < 8; runde++) {
    const sum = sentre.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const b of botter) {
      let ki = 0;
      let ka = Infinity;
      sentre.forEach((c, k) => {
        const a = avstand(b, c);
        if (a < ka) {
          ka = a;
          ki = k;
        }
      });
      const s = sum[ki]!;
      s.r += b.r * b.n;
      s.g += b.g * b.n;
      s.b += b.b * b.n;
      s.n += b.n;
    }
    sum.forEach((s, k) => {
      if (s.n) sentre[k] = { r: s.r / s.n, g: s.g / s.n, b: s.b / s.n, n: s.n };
    });
  }
  return sentre.map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), a: 255 }));
}

/**
 * The palette colour a pixel belongs to. A pixel on an anti-aliased edge is
 * a blend of the two colours either side; it may lie nearer to a third
 * colour (grey between black and white is nearer to red than to either),
 * so a pixel that is explained much better as a blend of two colours is
 * given the one of those two it is closest to along the blend.
 */
export function blandingsfarge(pal: Farge[], r: number, g: number, b: number): number {
  const direkte = naermeste(pal, r, g, b);
  const f = pal[direkte]!;
  const dDirekte = (f.r - r) ** 2 + (f.g - g) ** 2 + (f.b - b) ** 2;
  let beste = direkte;
  let bestAvstand = dDirekte * 0.25;
  for (let i = 0; i < pal.length; i++) {
    for (let j = i + 1; j < pal.length; j++) {
      const a = pal[i]!,
        c = pal[j]!;
      const vr = c.r - a.r,
        vg = c.g - a.g,
        vb = c.b - a.b;
      const len = vr * vr + vg * vg + vb * vb;
      if (!len) continue;
      const t = ((r - a.r) * vr + (g - a.g) * vg + (b - a.b) * vb) / len;
      if (t <= 0 || t >= 1) continue;
      const avst = (a.r + t * vr - r) ** 2 + (a.g + t * vg - g) ** 2 + (a.b + t * vb - b) ** 2;
      if (avst < bestAvstand) {
        bestAvstand = avst;
        beste = t < 0.5 ? i : j;
      }
    }
  }
  return beste;
}

/**
 * Every pixel set to its nearest palette colour, then each pixel takes the
 * colour most of its 3 × 3 neighbourhood has, which cleans the seams where
 * two colours meet.
 */
export function fargelegg(p: Piksler, pal: Farge[]): Piksler {
  const { width: w, height: h, data: d } = p;
  const ind = new Uint8Array(w * h);
  const minne = new Map<number, number>();
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4]!,
      g = d[i * 4 + 1]!,
      b = d[i * 4 + 2]!;
    const nokkel = (r << 16) | (g << 8) | b;
    let k = minne.get(nokkel);
    if (k === undefined) {
      k = blandingsfarge(pal, r, g, b);
      minne.set(nokkel, k);
    }
    ind[i] = k;
  }
  const ut = new Uint8ClampedArray(w * h * 4);
  const tell = new Array<number>(pal.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tell.fill(0);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          tell[ind[yy * w + xx]!]!++;
        }
      }
      let k = ind[y * w + x]!;
      for (let j = 0; j < pal.length; j++) if (tell[j]! > tell[k]!) k = j;
      const f = pal[k]!;
      ut.set([f.r, f.g, f.b, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data: ut };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** One traced ring as path data; holes are written backwards. */
function ringSti(s: Segment[], bakover: boolean): string {
  let ut: string;
  if (!bakover) {
    ut = `M${r2(s[0]!.x1)} ${r2(s[0]!.y1)}`;
    for (const g of s) {
      ut +=
        g.type === 'Q' ? `Q${r2(g.x2)} ${r2(g.y2)} ${r2(g.x3!)} ${r2(g.y3!)}` : `L${r2(g.x2)} ${r2(g.y2)}`;
    }
  } else {
    const sist = s[s.length - 1]!;
    ut = sist.type === 'Q' ? `M${r2(sist.x3!)} ${r2(sist.y3!)}` : `M${r2(sist.x2)} ${r2(sist.y2)}`;
    for (let i = s.length - 1; i >= 0; i--) {
      const g = s[i]!;
      ut += g.type === 'Q' ? `Q${r2(g.x2)} ${r2(g.y2)} ${r2(g.x1)} ${r2(g.y1)}` : `L${r2(g.x1)} ${r2(g.y1)}`;
    }
  }
  return `${ut}Z`;
}

/** Tracer settings from the user's choices. */
function sporvalg(valg: Vektorvalg, skala: number) {
  const g = klem(valg.glatthet, 0, 1);
  return {
    ltres: 0.5 + g * 2.5,
    qtres: 0.5 + g * 2.5,
    pathomit: Math.max(0, Math.round(valg.flekker * skala)),
    rightangleenhance: g < 0.7,
    blurradius: 0,
    colorsampling: 2,
    colorquantcycles: 4,
    mincolorratio: 0,
    layering: 0,
    scale: 1,
    roundcoords: 2,
    linefilter: false,
  };
}

/** Soft box blur of the brightness before the threshold, so jagged edges trace smoother. */
function myk(p: Piksler, radius: number): Piksler {
  if (radius < 1) return p;
  return ImageTracer.blur(
    { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) },
    radius,
    1024,
  ) as Piksler;
}

/**
 * Trace pixels into one filled path per colour. `skala` is the factor the
 * pixels were resized by from the original image, so «flekker» means the
 * same whatever size the image was traced at.
 */
export function vektoriser(bilde: Piksler, valg: Vektorvalg, skala = 1): Vektorresultat {
  if (!bilde.width || !bilde.height) throw new VektorFeil('Bildet er tomt.');
  const flat = flatUtAlfa(bilde);
  const farger = klem(Math.round(valg.farger), 1, 6);
  const sv = sporvalg(valg, skala);
  const g = klem(valg.glatthet, 0, 1);
  const blur = g > 0.6 ? Math.round((g - 0.6) * 10) : 0;

  let spordata: Spordata;
  let bakgrunn = -1;
  let terskel: number | null = null;
  if (farger === 1) {
    const kilde = myk(flat, blur);
    terskel = valg.terskel ?? otsu(kilde);
    const sh = svartHvitt(kilde, terskel, valg.inverter);
    spordata = ImageTracer.imagedataToTracedata(sh, {
      ...sv,
      numberofcolors: 2,
      colorquantcycles: 1,
      pal: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ],
    }) as Spordata;
    bakgrunn = 1;
  } else {
    const kilde = myk(flat, blur);
    const pal = hovedfarger(kilde, farger + (valg.fjernBakgrunn ? 1 : 0));
    spordata = ImageTracer.imagedataToTracedata(fargelegg(kilde, pal), {
      ...sv,
      numberofcolors: pal.length,
      colorquantcycles: 1,
      pal,
    }) as Spordata;
    if (valg.fjernBakgrunn) bakgrunn = bakgrunnIndeks(flat, spordata.palette);
  }

  // one path per colour; colours that end up equal are joined
  const perFarge = new Map<string, Vektorlag & { flate: number }>();
  spordata.layers.forEach((lag, l) => {
    if (l === bakgrunn) return;
    const farge = farger === 1 ? '#000000' : tilHex(spordata.palette[l]!);
    let d = '';
    let deler = 0;
    let flate = 0;
    for (const bane of lag) {
      if (bane.isholepath || !bane.segments.length) continue;
      d += ringSti(bane.segments, false);
      deler++;
      const b = bane.boundingbox;
      flate += Math.abs((b[2] - b[0]) * (b[3] - b[1]));
      for (const h of bane.holechildren) {
        const hull = lag[h];
        if (hull?.segments.length) d += ringSti(hull.segments, true);
      }
    }
    if (!d) return;
    const fra = perFarge.get(farge);
    if (fra) {
      fra.d += d;
      fra.deler += deler;
      fra.flate += flate;
    } else perFarge.set(farge, { farge, d, deler, flate });
  });
  // the largest areas are painted first, so small details lie on top
  const lag = [...perFarge.values()].sort((a, b) => b.flate - a.flate);
  if (!lag.length) throw new VektorFeil('Fant ingen former i bildet. Prøv en annen terskel eller Inverter.');
  return {
    svg: tilSvg(
      lag.map(({ farge, d, deler }) => ({ farge, d, deler })),
      spordata.width,
      spordata.height,
    ),
    lag: lag.map(({ farge, d, deler }) => ({ farge, d, deler })),
    bredde: spordata.width,
    hoyde: spordata.height,
    terskel,
  };
}

/** The traced layers as an SVG file. */
export function tilSvg(lag: Vektorlag[], bredde: number, hoyde: number): string {
  const stier = lag.map((l) => `<path fill="${l.farge}" fill-rule="evenodd" d="${l.d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bredde} ${hoyde}">${stier}</svg>`;
}

/** Longest side the image is traced at: big enough for clean curves, small enough to be quick. */
export const MAKS_SIDE = 1200;
/** Small images are scaled up first; tracing a few hundred pixels gives jagged curves. */
export const MIN_SIDE = 600;

/** The factor an image of this size is resized by before tracing. */
export function sporskala(bredde: number, hoyde: number): number {
  const lengst = Math.max(bredde, hoyde);
  if (lengst > MAKS_SIDE) return MAKS_SIDE / lengst;
  if (lengst < MIN_SIDE) return Math.min(4, MIN_SIDE / lengst);
  return 1;
}
