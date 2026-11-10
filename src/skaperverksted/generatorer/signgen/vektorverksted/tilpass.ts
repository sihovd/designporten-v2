/**
 * Vektorverksted, step 3: a chain of pixel corners into a few points with
 * Bézier handles (Sivert, 2026-11-09: «istedenfor å bruke mange punkter …
 * bruker modellen punkter med kurvehendler som genereres perfekt etter
 * linjene», and «calculate shape, som prøver å finne sider som skal være
 * rette og sider som skal være buede»).
 *
 * 1. The staircase of pixel corners is smoothed with a Gaussian whose window
 *    shrinks towards the ends, so the end points (nodes shared with other
 *    chains) never move.
 * 2. Corners are where the direction turns more than the corner angle over
 *    the corner scale; they become sharp points placed on the exact pixel
 *    corner, not on the rounded smoothed line.
 * 3. Calculate shape: a side between two corners that stays within the
 *    straightness tolerance of its chord becomes one straight line. Two
 *    straight sides meeting at a corner are extended to meet exactly.
 * 4. Every other side is fitted with as few cubic Béziers as the curve
 *    tolerance allows (Schneider's algorithm, «An algorithm for
 *    automatically fitting digitized curves», Graphics Gems 1990), with
 *    smooth (G1) joins between them.
 */

export type P = [number, number];

export interface Anker {
  x: number;
  y: number;
  /** Incoming and outgoing handle, absolute; null on a straight segment. */
  inn: P | null;
  ut: P | null;
  /** A sharp corner (handles move independently) or a smooth point. */
  hjorne: boolean;
  /** Index into the chain's pixel points this point came from. */
  ri: number;
}

export interface Tilpasningsvalg {
  /** Gaussian sigma in pixels for the staircase. */
  glatting: number;
  /** A turn sharper than this many degrees is a corner. */
  hjorneVinkel: number;
  /** Distance in pixels the turn is measured over. */
  hjorneSkala: number;
  /** Largest distance in pixels a curve may stray from the traced border. */
  kurveToleranse: number;
  /** A side within this many pixels of its chord becomes a straight line. */
  rettToleranse: number;
  /** Look for straight sides (calculate shape). */
  beregnForm: boolean;
}

export const STANDARD_TILPASNING: Tilpasningsvalg = {
  glatting: 1.2,
  hjorneVinkel: 60,
  hjorneSkala: 4,
  kurveToleranse: 0.8,
  rettToleranse: 1,
  beregnForm: true,
};

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, s: number): P => [a[0] * s, a[1] * s];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const len = (a: P) => Math.hypot(a[0], a[1]);
const norm = (a: P): P => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
};

/** Distance from p to the segment a–b. */
export function avstandSegment(p: P, a: P, b: P): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return len(sub(p, a));
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return len(sub(p, add(a, mul(ab, t))));
}

/** Gaussian smoothing; open chains keep their end points. */
export function glatt(pts: P[], sigma: number, lukket: boolean): P[] {
  const n = pts.length;
  if (sigma <= 0.05 || n < 3) return pts.map((p) => [p[0], p[1]]);
  const R = Math.ceil(2.5 * sigma);
  const vekt = Array.from({ length: R + 1 }, (_, k) => Math.exp(-(k * k) / (2 * sigma * sigma)));
  const ut: P[] = [];
  for (let i = 0; i < n; i++) {
    const r = lukket ? Math.min(R, Math.floor((n - 1) / 2)) : Math.min(R, i, n - 1 - i);
    let sx = 0,
      sy = 0,
      sw = 0;
    for (let k = -r; k <= r; k++) {
      const q = pts[(((i + k) % n) + n) % n]!;
      const v = vekt[Math.abs(k)]!;
      sx += q[0] * v;
      sy += q[1] * v;
      sw += v;
    }
    ut.push([sx / sw, sy / sw]);
  }
  return ut;
}

/** Indices of the corners: turns sharper than the corner angle, strongest first, k apart. */
export function finnHjorner(sm: P[], lukket: boolean, vinkelGrader: number, skala: number): number[] {
  const n = sm.length;
  const k = Math.max(1, Math.round(skala));
  if (n < 2 * k + 1) return [];
  const grense = (vinkelGrader * Math.PI) / 180;
  const sving: { i: number; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (!lukket && (i < k || i > n - 1 - k)) continue;
    const a = sm[(i - k + n) % n]!,
      p = sm[i]!,
      b = sm[(i + k) % n]!;
    const u = norm(sub(p, a)),
      w = norm(sub(b, p));
    const v = Math.acos(Math.max(-1, Math.min(1, dot(u, w))));
    if (v >= grense) sving.push({ i, v });
  }
  sving.sort((a, b) => b.v - a.v);
  const valgt: number[] = [];
  const naer = (i: number, j: number) => {
    const d = Math.abs(i - j);
    return (lukket ? Math.min(d, n - d) : d) < k;
  };
  for (const s of sving) if (!valgt.some((j) => naer(j, s.i))) valgt.push(s.i);
  return valgt.sort((a, b) => a - b);
}

type Bezier = [P, P, P, P];

function bez(b: Bezier, t: number): P {
  const s = 1 - t;
  return [
    s * s * s * b[0][0] + 3 * s * s * t * b[1][0] + 3 * s * t * t * b[2][0] + t * t * t * b[3][0],
    s * s * s * b[0][1] + 3 * s * s * t * b[1][1] + 3 * s * t * t * b[2][1] + t * t * t * b[3][1],
  ];
}
function bezD1(b: Bezier, t: number): P {
  const s = 1 - t;
  return [
    3 * (s * s * (b[1][0] - b[0][0]) + 2 * s * t * (b[2][0] - b[1][0]) + t * t * (b[3][0] - b[2][0])),
    3 * (s * s * (b[1][1] - b[0][1]) + 2 * s * t * (b[2][1] - b[1][1]) + t * t * (b[3][1] - b[2][1])),
  ];
}
function bezD2(b: Bezier, t: number): P {
  const s = 1 - t;
  return [
    6 * (s * (b[2][0] - 2 * b[1][0] + b[0][0]) + t * (b[3][0] - 2 * b[2][0] + b[1][0])),
    6 * (s * (b[2][1] - 2 * b[1][1] + b[0][1]) + t * (b[3][1] - 2 * b[2][1] + b[1][1])),
  ];
}

function kordeParam(pts: P[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1]! + len(sub(pts[i]!, pts[i - 1]!)));
  const tot = u[u.length - 1]! || 1;
  return u.map((v) => v / tot);
}

function lagBezier(pts: P[], u: number[], t1: P, t2: P): Bezier {
  const p0 = pts[0]!,
    p3 = pts[pts.length - 1]!;
  let c00 = 0,
    c01 = 0,
    c11 = 0,
    x0 = 0,
    x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i]!,
      s = 1 - t;
    const b1 = 3 * s * s * t,
      b2 = 3 * s * t * t;
    const a1 = mul(t1, b1),
      a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const b0 = s * s * s + b1,
      b3 = b2 + t * t * t;
    const tmp = sub(pts[i]!, add(mul(p0, b0), mul(p3, b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alfa1 = 0,
    alfa2 = 0;
  if (Math.abs(det) > 1e-12) {
    alfa1 = (x0 * c11 - c01 * x1) / det;
    alfa2 = (c00 * x1 - c01 * x0) / det;
  }
  const lengde = len(sub(p3, p0));
  const eps = 1e-6 * lengde;
  if (alfa1 < eps || alfa2 < eps || alfa1 > lengde * 2 || alfa2 > lengde * 2) {
    alfa1 = alfa2 = lengde / 3;
  }
  return [p0, add(p0, mul(t1, alfa1)), add(p3, mul(t2, alfa2)), p3];
}

function maksFeil(pts: P[], b: Bezier, u: number[]): { feil: number; ved: number } {
  let feil = 0,
    ved = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len(sub(bez(b, u[i]!), pts[i]!));
    if (d > feil) {
      feil = d;
      ved = i;
    }
  }
  return { feil, ved };
}

function nyParam(pts: P[], b: Bezier, u: number[]): number[] {
  return u.map((t, i) => {
    const d = sub(bez(b, t), pts[i]!);
    const d1 = bezD1(b, t),
      d2 = bezD2(b, t);
    const teller = dot(d, d1);
    const nevner = dot(d1, d1) + dot(d, d2);
    if (Math.abs(nevner) < 1e-12) return t;
    return Math.max(0, Math.min(1, t - teller / nevner));
  });
}

/** Schneider: the fewest cubics that keep within `toleranse` of the points. */
export function tilpassKubisk(pts: P[], t1: P, t2: P, toleranse: number, dybde = 0): Bezier[] {
  const p0 = pts[0]!,
    p3 = pts[pts.length - 1]!;
  if (pts.length <= 2) {
    const d = len(sub(p3, p0)) / 3;
    return [[p0, add(p0, mul(t1, d)), add(p3, mul(t2, d)), p3]];
  }
  let u = kordeParam(pts);
  let b = lagBezier(pts, u, t1, t2);
  let { feil, ved } = maksFeil(pts, b, u);
  if (feil <= toleranse) return [b];
  if (feil <= toleranse * 4) {
    for (let k = 0; k < 6; k++) {
      u = nyParam(pts, b, u);
      b = lagBezier(pts, u, t1, t2);
      ({ feil, ved } = maksFeil(pts, b, u));
      if (feil <= toleranse) return [b];
    }
  }
  if (dybde > 24 || pts.length < 4) return [b];
  ved = Math.max(1, Math.min(pts.length - 2, ved));
  const forrige = pts[ved - 1]!,
    neste = pts[ved + 1]!;
  let midt = norm(sub(forrige, neste));
  if (!midt[0] && !midt[1]) midt = norm(sub(pts[ved - 1]!, pts[ved]!));
  return [
    ...tilpassKubisk(pts.slice(0, ved + 1), t1, midt, toleranse, dybde + 1),
    ...tilpassKubisk(pts.slice(ved), mul(midt, -1), t2, toleranse, dybde + 1),
  ];
}

/** Unit tangent leaving point `fra` along `pts` (pts[0] is the point itself). */
function tangentFra(pts: P[], m: number): P {
  const n = pts.length;
  const a = pts[0]!;
  // average of directions to the next few points: steadier than one point
  let s: P = [0, 0];
  for (let i = 1; i <= Math.min(m, n - 1); i++) s = add(s, norm(sub(pts[i]!, a)));
  const t = norm(s);
  return t[0] || t[1] ? t : norm(sub(pts[n - 1]!, a));
}

/** Least-squares line through points: centre and unit direction. */
function linjeGjennom(pts: P[]): { c: P; d: P } {
  let cx = 0,
    cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (const p of pts) {
    const dx = p[0] - cx,
      dy = p[1] - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const vinkel = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { c: [cx, cy], d: [Math.cos(vinkel), Math.sin(vinkel)] };
}

function skjaering(a: { c: P; d: P }, b: { c: P; d: P }): P | null {
  const kryss = a.d[0] * b.d[1] - a.d[1] * b.d[0];
  if (Math.abs(kryss) < 0.15) return null; // nearly parallel: keep the pixel corner
  const w = sub(b.c, a.c);
  const t = (w[0] * b.d[1] - w[1] * b.d[0]) / kryss;
  return add(a.c, mul(a.d, t));
}

export interface Tilpasning {
  /** The chain's pixel points, rotated for a closed chain so it starts at a corner. */
  punkter: number[];
  /** Points in order; a closed chain repeats its first point at the end. */
  ankre: Anker[];
}

/** Fits one chain. `punkter` are flat pixel-corner coordinates. */
export function tilpassKjede(punkter: number[], lukket: boolean, valg: Tilpasningsvalg): Tilpasning {
  let raa: P[] = [];
  for (let i = 0; i < punkter.length; i += 2) raa.push([punkter[i]!, punkter[i + 1]!]);
  const n = raa.length;
  if (n < 2) {
    const p = raa[0] ?? [0, 0];
    const a: Anker = { x: p[0], y: p[1], inn: null, ut: null, hjorne: true, ri: 0 };
    return { punkter: punkter.slice(), ankre: [a, { ...a }] };
  }
  let sm = glatt(raa, valg.glatting, lukket);
  let hjorner = finnHjorner(sm, lukket, valg.hjorneVinkel, valg.hjorneSkala);
  if (lukket && hjorner.length) {
    // rotate so the chain starts on a corner
    const s = hjorner[0]!;
    raa = [...raa.slice(s), ...raa.slice(0, s)];
    sm = [...sm.slice(s), ...sm.slice(0, s)];
    hjorner = hjorner.map((i) => (i - s + n) % n).sort((a, b) => a - b);
  }
  const rotert: number[] = [];
  for (const p of raa) rotert.push(p[0], p[1]);
  const hent = (i: number) => sm[i % n]!;
  // span ends: indices into sm; a closed chain ends at n (= index 0 again)
  let ender: number[];
  if (lukket) ender = hjorner.length ? [...hjorner, n] : [0, n];
  else ender = [0, ...hjorner.filter((i) => i > 0 && i < n - 1), n - 1];
  // corners sit on the exact pixel corner; open ends are the nodes themselves
  const posisjon = ender.map((i): P => {
    if (!lukket && (i === 0 || i === n - 1)) return raa[i]!;
    return hjorner.length ? raa[i % n]! : hent(i);
  });
  // the smoothing window: how far a corner's rounding reaches along each side
  const kant = valg.glatting > 0.05 ? Math.ceil(2.5 * valg.glatting) : 0;
  const m = Math.max(2, Math.round(valg.hjorneSkala));

  type Spenn = { a: number; b: number; pa: P; pb: P; indre: P[]; rett: boolean; linje?: { c: P; d: P } };
  const minSide = Math.max(4, 2 * m);
  /**
   * Calculate shape for one side: straight if it stays near its chord;
   * otherwise, if it is two straight pieces meeting at a soft corner the
   * corner angle missed (a polygon with blunt corners), split it there.
   */
  const delSide = (a: number, b: number, pa: P, pb: P, idx: number[], dybde: number): Spenn[] => {
    const indre = idx.map(hent);
    const enkel: Spenn = { a, b, pa, pb, indre, rett: b - a <= 2 };
    if (enkel.rett || !valg.beregnForm) return [enkel];
    // at a node three colours meet and the pixels are mixed: leave those out of the test
    const t = Math.min(kant + 1, Math.floor(indre.length / 4));
    const proeve = indre.slice(
      !lukket && a === 0 ? t : 0,
      !lukket && b === n - 1 ? indre.length - t : indre.length,
    );
    if (erRett(proeve, pa, pb, valg.rettToleranse)) {
      return [{ ...enkel, rett: true, linje: indre.length >= 3 ? linjeGjennom(indre) : undefined }];
    }
    if (dybde >= 4 || idx.length < 2 * minSide + 1) return [enkel];
    let maks = -1,
      ved = -1;
    indre.forEach((p, i) => {
      const d = avstandSegment(p, pa, pb);
      if (d > maks) {
        maks = d;
        ved = i;
      }
    });
    if (ved < minSide || ved > idx.length - 1 - minSide) return [enkel];
    const venstre = indre.slice(0, ved),
      hoyre = indre.slice(ved + 1);
    const l1 = linjeGjennom(venstre),
      l2 = linjeGjennom(hoyre);
    const hjorne = skjaering(l1, l2) ?? indre[ved]!;
    if (len(sub(hjorne, indre[ved]!)) > 2 + valg.glatting) return [enkel];
    if (!erRett(venstre, pa, hjorne, valg.rettToleranse) || !erRett(hoyre, hjorne, pb, valg.rettToleranse))
      return [enkel];
    const c = idx[ved]!;
    return [
      ...delSide(a, c, pa, hjorne, idx.slice(0, ved), dybde + 1),
      ...delSide(c, b, hjorne, pb, idx.slice(ved + 1), dybde + 1),
    ];
  };

  const spenn: Spenn[] = [];
  for (let s = 0; s + 1 < ender.length; s++) {
    const a = ender[s]!,
      b = ender[s + 1]!;
    // the smoothed points of the side, without the rounded bit at each corner;
    // open ends are nodes (never smoothed away), every other end is a corner
    const fraA = (lukket ? hjorner.length > 0 : a !== 0) ? kant : 0;
    const fraB = (lukket ? hjorner.length > 0 : b !== n - 1) ? kant : 0;
    const idx: number[] = [];
    for (let i = a + 1 + fraA; i <= b - 1 - fraB; i++) idx.push(i);
    spenn.push(...delSide(a, b, posisjon[s]!, posisjon[s + 1]!, idx, 0));
  }
  // two straight sides meet exactly where their lines cross, if that is close to the pixel corner
  const naboer = lukket && spenn.length > 1 ? spenn.length : spenn.length - 1;
  for (let s = 0; s < naboer; s++) {
    const x = spenn[s]!,
      y = spenn[(s + 1) % spenn.length]!;
    if (!x.rett || !y.rett || !x.linje || !y.linje) continue;
    if (!lukket && (x.b === n - 1 || y.a === 0)) continue;
    const ved = skjaering(x.linje, y.linje);
    if (ved && len(sub(ved, x.pb)) <= 1.5 + valg.glatting) {
      x.pb = ved;
      y.pa = ved;
    }
  }

  const ankre: Anker[] = [];
  const glattStart = lukket && !hjorner.length;
  spenn.forEach((sp) => {
    const { pa, pb } = sp;
    if (!ankre.length)
      ankre.push({ x: pa[0], y: pa[1], inn: null, ut: null, hjorne: !glattStart, ri: sp.a % n });
    const start = ankre[ankre.length - 1]!;
    start.x = pa[0];
    start.y = pa[1];
    if (sp.rett) {
      start.ut = null;
      ankre.push({ x: pb[0], y: pb[1], inn: null, ut: null, hjorne: true, ri: sp.b % n });
      return;
    }
    const data: P[] = [pa, ...sp.indre, pb];
    let t1: P, t2: P;
    if (glattStart) {
      t1 = norm(sub(hent(1), hent(n - 1)));
      t2 = mul(t1, -1);
    } else {
      t1 = tangentFra(data, m);
      t2 = tangentFra([...data].reverse(), m);
    }
    const biter = reduser(data, tilpassBiter(data, t1, t2, valg.kurveToleranse, 0, 0), valg.kurveToleranse);
    const fraA = (sp.indre.length ? Math.round(sp.a + (sp.b - sp.a - sp.indre.length) / 2) : sp.a) - 1;
    biter.forEach((k, j) => {
      ankre[ankre.length - 1]!.ut = k.b[1];
      const siste = j === biter.length - 1;
      ankre.push({
        x: k.b[3][0],
        y: k.b[3][1],
        inn: k.b[2],
        ut: null,
        hjorne: siste ? !glattStart : false,
        ri: (siste ? sp.b : Math.max(sp.a, Math.min(sp.b, fraA + k.til))) % n,
      });
    });
  });
  // the closing point of a closed curve is its first point
  if (lukket) {
    const f = ankre[0]!,
      l = ankre[ankre.length - 1]!;
    l.x = f.x;
    l.y = f.y;
  }
  if (glattStart) ankre[ankre.length - 1]!.hjorne = false;
  return { punkter: rotert, ankre };
}

/**
 * Robust straightness: noise from anti-aliasing and compression puts a few
 * points off the line, so most points (90 %) must be within the tolerance
 * and none far outside it.
 */
function erRett(pts: P[], a: P, b: P, toleranse: number): boolean {
  if (!pts.length) return true;
  if (!Number.isFinite(toleranse)) return true;
  const d = pts.map((p) => avstandSegment(p, a, b)).sort((x, y) => x - y);
  const p90 = d[Math.min(d.length - 1, Math.floor(d.length * 0.9))]!;
  return p90 <= toleranse && d[d.length - 1]! <= toleranse * 2.5 + 0.5;
}

interface Bit {
  b: Bezier;
  /** Data indices the piece covers. */
  fra: number;
  til: number;
}

/** Schneider with the data range of each piece, so pieces can be joined again. */
function tilpassBiter(pts: P[], t1: P, t2: P, toleranse: number, forskyvning: number, dybde: number): Bit[] {
  const p0 = pts[0]!,
    p3 = pts[pts.length - 1]!;
  const ende = forskyvning + pts.length - 1;
  if (pts.length <= 2) {
    const d = len(sub(p3, p0)) / 3;
    return [{ b: [p0, add(p0, mul(t1, d)), add(p3, mul(t2, d)), p3], fra: forskyvning, til: ende }];
  }
  const { b, feil, ved } = enKubisk(pts, t1, t2, toleranse);
  if (feil <= toleranse || dybde > 24 || pts.length < 4) return [{ b, fra: forskyvning, til: ende }];
  const v = Math.max(1, Math.min(pts.length - 2, ved));
  let midt = norm(sub(pts[v - 1]!, pts[v + 1]!));
  if (!midt[0] && !midt[1]) midt = norm(sub(pts[v - 1]!, pts[v]!));
  return [
    ...tilpassBiter(pts.slice(0, v + 1), t1, midt, toleranse, forskyvning, dybde + 1),
    ...tilpassBiter(pts.slice(v), mul(midt, -1), t2, toleranse, forskyvning + v, dybde + 1),
  ];
}

/** One cubic through the points with fixed end tangents, refined by reparametrisation. */
function enKubisk(pts: P[], t1: P, t2: P, toleranse: number): { b: Bezier; feil: number; ved: number } {
  let u = kordeParam(pts);
  let b = lagBezier(pts, u, t1, t2);
  let { feil, ved } = maksFeil(pts, b, u);
  if (feil > toleranse && feil <= toleranse * 6) {
    for (let k = 0; k < 8; k++) {
      u = nyParam(pts, b, u);
      const ny = lagBezier(pts, u, t1, t2);
      const f = maksFeil(pts, ny, u);
      b = ny;
      feil = f.feil;
      ved = f.ved;
      if (feil <= toleranse) break;
    }
  }
  return { b, feil, ved };
}

/**
 * Fewer points: two neighbouring pieces are replaced by one wherever one
 * cubic over both stays within the tolerance (a little slack, since the
 * split point itself is forced on the data). Weakest join first.
 */
function reduser(pts: P[], biter: Bit[], toleranse: number): Bit[] {
  const ut = biter.slice();
  for (let runde = 0; runde < 200 && ut.length > 1; runde++) {
    let beste = -1,
      bestFeil = Infinity,
      bestBit: Bit | null = null;
    for (let j = 0; j + 1 < ut.length; j++) {
      const a = ut[j]!,
        c = ut[j + 1]!;
      const data = pts.slice(a.fra, c.til + 1);
      const t1 = norm(sub(a.b[1], a.b[0])),
        t2 = norm(sub(c.b[2], c.b[3]));
      if ((!t1[0] && !t1[1]) || (!t2[0] && !t2[1])) continue;
      const { b, feil } = enKubisk(data, t1, t2, toleranse);
      if (feil < bestFeil) {
        bestFeil = feil;
        beste = j;
        bestBit = { b, fra: a.fra, til: c.til };
      }
    }
    if (!bestBit || bestFeil > toleranse * 1.25) break;
    ut.splice(beste, 2, bestBit);
  }
  return ut;
}

/** Fits one span afresh between two existing points, keeping their tangents. */
export function tilpassSpenn(data: P[], t1: P, t2: P, toleranse: number): Bezier[] {
  return tilpassKubisk(data, norm(t1), norm(t2), toleranse);
}

export { glatt as glattPunkter };
