/**
 * Vektorverksted, step 1 (Sivert, 2026-11-09): pixels into regions.
 *
 * The cropped and masked image is reduced to a few colours, every pixel
 * gets a colour index (or -1 for «nothing»: masked away, outside the crop
 * or background), connected pixels of one colour become a region, and
 * regions that are too small are merged into the neighbour they share the
 * longest border with. The result is a label image where every pixel
 * belongs to exactly one region or to nothing, which is what lets the next
 * step draw borders that neighbours share.
 *
 * Pure: works on ImageData-shaped pixels.
 */
import {
  blandingsfarge,
  flatUtAlfa,
  hovedfarger,
  otsu,
  tilHex,
  type Farge,
  type Piksler,
} from '../vektoriser';

export interface Regionvalg {
  /** 1 = one colour by a brightness threshold, 2–10 = that many colours. */
  farger: number;
  /** One colour: brightness limit 0–255, or null for automatic (Otsu). */
  terskel: number | null;
  /** One colour: swap what counts as drawing and background. */
  inverter: boolean;
  /** Leave out the background (the colour most common along the edge of what is kept). */
  fjernBakgrunn: boolean;
  /** Passes of a 3 × 3 majority filter over the colour indices: removes jagged seams. */
  stoyfilter: number;
  /** Parts smaller than this many square pixels (in the traced image) are merged away. */
  minAreal: number;
  /** Parts thinner than this many pixels are merged away (0 = off). */
  minTykkelse: number;
  /** Holes (a part entirely inside one other part) smaller than this are filled. */
  minHull: number;
  /** What happens to a part that is too small: merged into its neighbour, or removed. */
  smaaDeler: 'sla-sammen' | 'fjern';
}

export const STANDARD_REGIONVALG: Regionvalg = {
  farger: 1,
  terskel: null,
  inverter: false,
  fjernBakgrunn: true,
  stoyfilter: 1,
  minAreal: 24,
  minTykkelse: 1.5,
  minHull: 24,
  smaaDeler: 'sla-sammen',
};

export interface Regioninfo {
  /** #rrggbb */
  farge: string;
  /** Palette index the colour came from. */
  fargeIndeks: number;
  areal: number;
}

export interface Regionkart {
  bredde: number;
  hoyde: number;
  /** Region per pixel, -1 = nothing. */
  etikett: Int32Array;
  regioner: Regioninfo[];
  palett: string[];
  terskel: number | null;
  /** How many parts the small-part rules merged or removed. */
  fjernet: number;
}

const lys = (d: Uint8ClampedArray, i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;

/** Colour index per pixel; -1 where the mask says no. */
export function fargeindekser(
  bilde: Piksler,
  maske: Uint8Array | null,
  valg: Regionvalg,
): { ind: Int32Array; palett: Farge[]; bakgrunn: number; terskel: number | null } {
  const p = flatUtAlfa(bilde);
  const { width: w, height: h, data: d } = p;
  const n = w * h;
  const ind = new Int32Array(n);
  const behold = (i: number) => !maske || maske[i]! > 0;
  let antall = 0;
  for (let i = 0; i < n; i++) if (behold(i)) antall++;
  // the pixels that are kept, as one long row, so masked parts never colour the palette
  const kept = new Uint8ClampedArray(Math.max(1, antall) * 4);
  for (let i = 0, k = 0; i < n; i++) {
    if (!behold(i)) continue;
    kept[k++] = d[i * 4]!;
    kept[k++] = d[i * 4 + 1]!;
    kept[k++] = d[i * 4 + 2]!;
    kept[k++] = 255;
  }
  const beholdt: Piksler = { width: Math.max(1, antall), height: 1, data: kept };

  let palett: Farge[];
  let terskel: number | null = null;
  if (valg.farger <= 1) {
    terskel = valg.terskel ?? otsu(beholdt);
    palett = [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ];
    for (let i = 0; i < n; i++) {
      if (!behold(i)) {
        ind[i] = -1;
        continue;
      }
      let mork = lys(d, i * 4) < terskel;
      if (valg.inverter) mork = !mork;
      ind[i] = mork ? 0 : 1;
    }
  } else {
    palett = hovedfarger(beholdt, Math.min(12, Math.round(valg.farger) + (valg.fjernBakgrunn ? 1 : 0)));
    const minne = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      if (!behold(i)) {
        ind[i] = -1;
        continue;
      }
      const r = d[i * 4]!,
        g = d[i * 4 + 1]!,
        b = d[i * 4 + 2]!;
      const nokkel = (r << 16) | (g << 8) | b;
      let k = minne.get(nokkel);
      if (k === undefined) {
        k = blandingsfarge(palett, r, g, b);
        minne.set(nokkel, k);
      }
      ind[i] = k;
    }
  }
  let bakgrunn = -1;
  if (valg.farger <= 1) bakgrunn = 1;
  else if (valg.fjernBakgrunn) bakgrunn = kantfarge(ind, w, h, palett.length);
  return { ind, palett, bakgrunn, terskel };
}

/** The colour most common along the edge of what is kept: the image edge and the mask edge. */
export function kantfarge(ind: Int32Array, w: number, h: number, antall: number): number {
  const tell = new Array<number>(antall).fill(0);
  const hent = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : ind[y * w + x]!);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = ind[y * w + x]!;
      if (k < 0) continue;
      if (hent(x - 1, y) < 0 || hent(x + 1, y) < 0 || hent(x, y - 1) < 0 || hent(x, y + 1) < 0) tell[k]!++;
    }
  }
  let beste = 0;
  for (let k = 1; k < antall; k++) if (tell[k]! > tell[beste]!) beste = k;
  return tell[beste]! > 0 ? beste : -1;
}

/** One pass of a 3 × 3 majority filter; «nothing» (-1) takes part like a colour. */
export function flertallsfilter(ind: Int32Array, w: number, h: number, antall: number): Int32Array {
  const ut = new Int32Array(ind.length);
  const tell = new Int32Array(antall + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tell.fill(0);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          tell[ind[yy * w + xx]! + 1]!++;
        }
      }
      const egen = ind[y * w + x]!;
      let k = egen + 1;
      for (let j = 0; j <= antall; j++) if (tell[j]! > tell[k]!) k = j;
      // only change a pixel when a clear majority (6 of 9) disagrees; with 5
      // the filter would eat the pixel in every sharp convex corner
      ut[y * w + x] = tell[k]! >= 6 ? k - 1 : egen;
    }
  }
  return ut;
}

/** Connected pixels of one colour (4-neighbourhood) get one label each; -1 stays -1. */
export function komponenter(ind: Int32Array, w: number, h: number): { etikett: Int32Array; farge: number[] } {
  const etikett = new Int32Array(ind.length).fill(-2);
  const farge: number[] = [];
  const ko = new Int32Array(ind.length);
  for (let s = 0; s < ind.length; s++) {
    if (etikett[s] !== -2) continue;
    const k = ind[s]!;
    if (k < 0) {
      etikett[s] = -1;
      continue;
    }
    const id = farge.length;
    farge.push(k);
    let hode = 0,
      hale = 0;
    ko[hale++] = s;
    etikett[s] = id;
    while (hode < hale) {
      const i = ko[hode++]!;
      const x = i % w,
        y = (i - x) / w;
      if (x > 0 && etikett[i - 1] === -2 && ind[i - 1] === k) {
        etikett[i - 1] = id;
        ko[hale++] = i - 1;
      }
      if (x < w - 1 && etikett[i + 1] === -2 && ind[i + 1] === k) {
        etikett[i + 1] = id;
        ko[hale++] = i + 1;
      }
      if (y > 0 && etikett[i - w] === -2 && ind[i - w] === k) {
        etikett[i - w] = id;
        ko[hale++] = i - w;
      }
      if (y < h - 1 && etikett[i + w] === -2 && ind[i + w] === k) {
        etikett[i + w] = id;
        ko[hale++] = i + w;
      }
    }
  }
  return { etikett, farge };
}

/**
 * Thickness per region: twice the largest chamfer distance from any of its
 * pixels to the region's border (a 6 px wide line has thickness about 6).
 */
export function tykkelser(
  etikett: Int32Array,
  w: number,
  h: number,
  antall: number,
  omkrets?: ArrayLike<number>,
): Float32Array {
  const INF = 1e9;
  const dt = new Float32Array(etikett.length);
  const lik = (i: number, x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && etikett[y * w + x] === etikett[i];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const kant = !lik(i, x - 1, y) || !lik(i, x + 1, y) || !lik(i, x, y - 1) || !lik(i, x, y + 1);
      dt[i] = kant ? 1 : INF;
    }
  }
  const a = 1,
    b = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = dt[i]!;
      if (x > 0 && etikett[i - 1] === etikett[i]) v = Math.min(v, dt[i - 1]! + a);
      if (y > 0 && etikett[i - w] === etikett[i]) v = Math.min(v, dt[i - w]! + a);
      if (x > 0 && y > 0 && etikett[i - w - 1] === etikett[i]) v = Math.min(v, dt[i - w - 1]! + b);
      if (x < w - 1 && y > 0 && etikett[i - w + 1] === etikett[i]) v = Math.min(v, dt[i - w + 1]! + b);
      dt[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = dt[i]!;
      if (x < w - 1 && etikett[i + 1] === etikett[i]) v = Math.min(v, dt[i + 1]! + a);
      if (y < h - 1 && etikett[i + w] === etikett[i]) v = Math.min(v, dt[i + w]! + a);
      if (x < w - 1 && y < h - 1 && etikett[i + w + 1] === etikett[i]) v = Math.min(v, dt[i + w + 1]! + b);
      if (x > 0 && y < h - 1 && etikett[i + w - 1] === etikett[i]) v = Math.min(v, dt[i + w - 1]! + b);
      dt[i] = v;
    }
  }
  const t = new Float32Array(antall);
  for (let i = 0; i < etikett.length; i++) {
    const e = etikett[i]!;
    if (e >= 0 && dt[i]! > t[e]!) t[e] = dt[i]!;
  }
  // the inscribed width is odd-numbered in whole pixels; for long thin parts
  // twice the area over the perimeter gives the in-between widths (a 2 px line ≈ 2)
  const flate = new Float32Array(antall);
  if (omkrets) for (let i = 0; i < etikett.length; i++) if (etikett[i]! >= 0) flate[etikett[i]!]!++;
  for (let e = 0; e < antall; e++) {
    const innskrevet = t[e]! * 2 - 1;
    const snitt = omkrets && omkrets[e]! > 0 ? (2 * flate[e]!) / omkrets[e]! : 0;
    t[e] = Math.max(innskrevet, snitt);
  }
  return t;
}

/** Shared border length (in pixel edges) between each pair of labels; -1 is «nothing». */
function naboer(etikett: Int32Array, w: number, h: number): Map<number, Map<number, number>> {
  const m = new Map<number, Map<number, number>>();
  const legg = (a: number, b: number) => {
    if (a === b) return;
    for (const [p, q] of [
      [a, b],
      [b, a],
    ] as const) {
      let r = m.get(p);
      if (!r) m.set(p, (r = new Map()));
      r.set(q, (r.get(q) ?? 0) + 1);
    }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = etikett[y * w + x]!;
      legg(e, x < w - 1 ? etikett[y * w + x + 1]! : -1);
      legg(e, y < h - 1 ? etikett[(y + 1) * w + x]! : -1);
      if (x === 0) legg(e, -1);
      if (y === 0) legg(e, -1);
    }
  }
  return m;
}

/**
 * The small-part rules. Smallest first, each part that is too small, too
 * thin, or a hole smaller than the hole limit is merged into the neighbour
 * it shares the longest border with (or removed, by the user's choice).
 * Merging rather than deleting means no gap is left where it was.
 */
export function fjernSmaaDeler(
  etikett: Int32Array,
  w: number,
  h: number,
  farge: number[],
  valg: Pick<Regionvalg, 'minAreal' | 'minTykkelse' | 'minHull' | 'smaaDeler'>,
): { etikett: Int32Array; farge: number[]; areal: number[]; fjernet: number } {
  const antall = farge.length;
  const areal = new Array<number>(antall).fill(0);
  for (let i = 0; i < etikett.length; i++) if (etikett[i]! >= 0) areal[etikett[i]!]!++;
  const nb = naboer(etikett, w, h);
  const omkrets = new Float32Array(antall);
  for (let e = 0; e < antall; e++) for (const l of nb.get(e)?.values() ?? []) omkrets[e] = omkrets[e]! + l;
  const tykk = valg.minTykkelse > 0 ? tykkelser(etikett, w, h, antall, omkrets) : null;
  // union-find from region to the region it went into; -1 = removed
  const til = new Int32Array(antall).map((_, i) => i);
  const finn = (e: number): number => {
    if (e < 0) return -1;
    let r = e;
    while (r >= 0 && til[r] !== r) r = til[r]!;
    return r;
  };
  const rekkefolge = [...areal.keys()].sort((a, b) => areal[a]! - areal[b]!);
  let fjernet = 0;
  for (const e of rekkefolge) {
    if (finn(e) !== e) continue;
    const mine = nb.get(e) ?? new Map<number, number>();
    const ekte = new Map<number, number>();
    for (const [n, l] of mine) {
      const r = finn(n);
      if (r !== e) ekte.set(r, (ekte.get(r) ?? 0) + l);
    }
    const erHull = ekte.size === 1 && !ekte.has(-1);
    const forLiten =
      areal[e]! < valg.minAreal ||
      (tykk !== null && tykk[e]! < valg.minTykkelse) ||
      (erHull && areal[e]! < valg.minHull);
    if (!forLiten) continue;
    let mal = -1;
    if (valg.smaaDeler === 'sla-sammen' || erHull) {
      let lengst = -1;
      for (const [n, l] of ekte) {
        if (l > lengst || (l === lengst && n >= 0)) {
          lengst = l;
          mal = n;
        }
      }
    }
    fjernet++;
    til[e] = mal >= 0 ? mal : -1;
    if (mal >= 0) {
      areal[mal] = areal[mal]! + areal[e]!;
      // the merged neighbourhood
      const nm = nb.get(mal) ?? new Map<number, number>();
      for (const [n, l] of mine) if (n !== mal) nm.set(n, (nm.get(n) ?? 0) + l);
      nb.set(mal, nm);
      if (tykk) tykk[mal] = Math.max(tykk[mal]!, tykk[e]!);
    } else {
      const nm = nb.get(-1) ?? new Map<number, number>();
      for (const [n, l] of mine) nm.set(n, (nm.get(n) ?? 0) + l);
      nb.set(-1, nm);
    }
  }
  // compact labels
  const ny = new Int32Array(antall).fill(-1);
  const nyFarge: number[] = [];
  const nyAreal: number[] = [];
  for (let e = 0; e < antall; e++) {
    if (finn(e) !== e) continue;
    ny[e] = nyFarge.length;
    nyFarge.push(farge[e]!);
    nyAreal.push(areal[e]!);
  }
  const ut = new Int32Array(etikett.length);
  for (let i = 0; i < etikett.length; i++) {
    const r = finn(etikett[i]!);
    ut[i] = r < 0 ? -1 : ny[r]!;
  }
  return { etikett: ut, farge: nyFarge, areal: nyAreal, fjernet };
}

/** The whole step: pixels and mask in, label image out. */
export function lagRegionkart(bilde: Piksler, maske: Uint8Array | null, valg: Regionvalg): Regionkart {
  const w = bilde.width,
    h = bilde.height;
  const { ind: raa, palett, bakgrunn, terskel } = fargeindekser(bilde, maske, valg);
  let ind = raa;
  for (let k = 0; k < valg.stoyfilter; k++) ind = flertallsfilter(ind, w, h, palett.length);
  // the mask is absolute: the filter never brings back masked pixels
  if (maske) for (let i = 0; i < ind.length; i++) if (!maske[i]) ind[i] = -1;
  // the background takes part in the small-part rules as a colour of its own,
  // so a speck of background inside a shape is a hole that can be filled
  const { etikett, farge } = komponenter(ind, w, h);
  const rens = fjernSmaaDeler(etikett, w, h, farge, valg);
  const hex = palett.map((f) => tilHex(f));
  const ny = new Int32Array(rens.farge.length).fill(-1);
  const regioner: Regioninfo[] = [];
  rens.farge.forEach((k, i) => {
    if (k === bakgrunn) return;
    ny[i] = regioner.length;
    regioner.push({ farge: valg.farger <= 1 ? '#000000' : hex[k]!, fargeIndeks: k, areal: rens.areal[i]! });
  });
  const ut = rens.etikett.map((e) => (e < 0 ? -1 : ny[e]!));
  return {
    bredde: w,
    hoyde: h,
    etikett: ut,
    regioner,
    palett: hex,
    terskel,
    fjernet: rens.fjernet,
  };
}
