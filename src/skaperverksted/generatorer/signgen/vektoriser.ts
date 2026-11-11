/**
 * Fargeanalyse for bilder som skal vektoriseres (Sivert, 2026-11-08, og
 * 2026-11-11: Vectorium erstatter det gamle vektorverktøyet). Vectorium
 * (vektorverksted/) bruker disse funksjonene til å finne fargene i bildet:
 * terskel, hovedfarger, blanding mellom farger og tilhørende palett.
 *
 * Ren beregning på piksler i ImageData-format, så den kjører i tester uten
 * nettleser. Den gamle sporingen (imagetracerjs) er fjernet.
 */
/** Pixels as in ImageData: RGBA, row by row. */
export interface Piksler {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Farge {
  r: number;
  g: number;
  b: number;
  a: number;
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
