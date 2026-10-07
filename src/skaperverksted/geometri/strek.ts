/**
 * Paint strokes (Sivert, 2026-10-06, Sign Forge «Paint»): a vector drawn
 * freehand as a centre line with a width profile. The stroke is kept as its
 * source (control points, base width, width points, smoothing, taper) and the
 * closed outline is computed from it, so the width can be changed afterwards.
 *
 * Centre line: a Catmull-Rom spline through the control points, after an
 * optional smoothing of the points. Width: the base width times a profile of
 * width points (position 0 to 1 along the stroke, 1 = 100 %), joined by a
 * smooth monotone curve, times a taper at the start and the end. The outline
 * is the left and right edge with round caps; self-overlaps on tight bends
 * are resolved by the polygon clipper.
 */
import type { Vec2 } from '../core/geometri2d';
import { banerTilSti, type Bane, type Node } from './bane';
import { forenkle, regionFraRinger, ringerI, type Region, type Ring } from './polygon';

/** One width point: `t` is the position along the stroke (0 to 1), `v` the width as a multiple of the base (1 = 100 %). */
export interface Breddepunkt {
  t: number;
  v: number;
}

export interface Strek {
  /** Control points of the centre line, in the vector's own coordinates (mm). */
  punkter: Vec2[];
  /** Base width (mm), what 100 % means. */
  bredde: number;
  /** Width along the stroke, sorted by `t`, at least two points. */
  breddepunkter: Breddepunkt[];
  /** Smoothing of the centre line, 0 (none) to 1 (strong). */
  glatt: number;
  /** Fraction of the stroke at the start that tapers from nothing up to full width (0 = round start). */
  tuppStart: number;
  /** Same for the end. */
  tuppSlutt: number;
}

export const MIN_BREDDE = 0.2;
export const MAKS_BREDDE = 60;
/** The widest a width point can be, as a multiple of the base width. */
export const MAKS_BREDDEFAKTOR = 4;

/** Ready-made width profiles. «Penselstrøk» is Sivert's example: 100 % to 160 % to 70 % to 0 %. */
export const PROFILER = {
  jevn: [
    { t: 0, v: 1 },
    { t: 1, v: 1 },
  ],
  penselstrok: [
    { t: 0, v: 1 },
    { t: 0.35, v: 1.6 },
    { t: 0.7, v: 0.7 },
    { t: 1, v: 0 },
  ],
  spiss: [
    { t: 0, v: 0 },
    { t: 0.4, v: 1 },
    { t: 1, v: 0 },
  ],
} satisfies Record<string, Breddepunkt[]>;

export type ProfilId = keyof typeof PROFILER;

export const PROFILNAVN: Record<ProfilId, string> = {
  jevn: 'Jevn',
  penselstrok: 'Penselstrøk',
  spiss: 'Spiss',
};

export function nyttStrek(punkter: Vec2[], bredde: number, profil: ProfilId = 'jevn', glatt = 0.4): Strek {
  return {
    punkter,
    bredde,
    breddepunkter: PROFILER[profil].map((p) => ({ ...p })),
    glatt,
    tuppStart: 0,
    tuppSlutt: 0,
  };
}

const avst = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Keep the points that matter (Ramer-Douglas-Peucker), so a hand-drawn stroke has few control points. */
export function forenklePunkter(punkter: Vec2[], toleranse: number): Vec2[] {
  if (punkter.length < 3) return punkter.slice();
  const behold = new Array<boolean>(punkter.length).fill(false);
  behold[0] = behold[punkter.length - 1] = true;
  const stakk: [number, number][] = [[0, punkter.length - 1]];
  while (stakk.length) {
    const [a, b] = stakk.pop()!;
    const pa = punkter[a]!,
      pb = punkter[b]!;
    const dx = pb.x - pa.x,
      dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy);
    let maks = 0,
      idx = -1;
    for (let i = a + 1; i < b; i++) {
      const p = punkter[i]!;
      const d = len < 1e-9 ? avst(p, pa) : Math.abs((p.x - pa.x) * dy - (p.y - pa.y) * dx) / len;
      if (d > maks) {
        maks = d;
        idx = i;
      }
    }
    if (idx >= 0 && maks > toleranse) {
      behold[idx] = true;
      stakk.push([a, idx], [idx, b]);
    }
  }
  return punkter.filter((_, i) => behold[i]);
}

/** Remove points closer than `minst` to the one before (a still hand adds many). */
export function tynnPunkter(punkter: Vec2[], minst: number): Vec2[] {
  const ut: Vec2[] = [];
  for (const p of punkter) {
    const siste = ut[ut.length - 1];
    if (!siste || avst(siste, p) >= minst) ut.push(p);
  }
  // the end of the stroke is where the pen was lifted
  const sist = punkter[punkter.length - 1];
  if (sist && ut.length > 1 && ut[ut.length - 1] !== sist) ut[ut.length - 1] = sist;
  else if (sist && ut.length === 1 && avst(ut[0]!, sist) > 1e-9) ut.push(sist);
  return ut;
}

/** Smooth the control points (the ends stay): `glatt` 0 to 1 is up to ten passes of averaging. */
export function glattPunkter(punkter: Vec2[], glatt: number): Vec2[] {
  let p = punkter;
  const ganger = Math.round(Math.max(0, Math.min(1, glatt)) * 10);
  for (let k = 0; k < ganger && p.length > 2; k++) {
    p = p.map((q, i) =>
      i === 0 || i === p.length - 1
        ? q
        : {
            x: q.x * 0.5 + (p[i - 1]!.x + p[i + 1]!.x) * 0.25,
            y: q.y * 0.5 + (p[i - 1]!.y + p[i + 1]!.y) * 0.25,
          },
    );
  }
  return p;
}

export interface Senterpunkt {
  p: Vec2;
  /** Position along the stroke, 0 to 1 by length. */
  t: number;
}

/**
 * The centre line as dense points about `avstand` mm apart, along a
 * centripetal Catmull-Rom spline through the (smoothed) control points.
 */
export function senterlinje(strek: Strek, avstand = 0.4): Senterpunkt[] {
  const p = glattPunkter(strek.punkter, strek.glatt);
  if (p.length === 0) return [];
  if (p.length === 1) return [{ p: p[0]!, t: 0 }];
  // pad the ends so the spline reaches the first and last point
  const f = (i: number) => p[Math.max(0, Math.min(p.length - 1, i))]!;
  const rå: Vec2[] = [p[0]!];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = i === 0 ? { x: 2 * p[0]!.x - p[1]!.x, y: 2 * p[0]!.y - p[1]!.y } : f(i - 1);
    const p1 = f(i),
      p2 = f(i + 1);
    const p3 =
      i + 2 > p.length - 1
        ? { x: 2 * p[p.length - 1]!.x - p[p.length - 2]!.x, y: 2 * p[p.length - 1]!.y - p[p.length - 2]!.y }
        : f(i + 2);
    // centripetal parameterisation (no loops or overshoot on uneven spacing)
    const t0 = 0;
    const t1 = t0 + Math.sqrt(avst(p0, p1)) || 1e-4;
    const t2 = t1 + Math.sqrt(avst(p1, p2)) || t1 + 1e-4;
    const t3 = t2 + Math.sqrt(avst(p2, p3)) || t2 + 1e-4;
    const n = Math.max(2, Math.ceil(avst(p1, p2) / avstand));
    for (let k = 1; k <= n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const mix = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
        const u = (t - ta) / (tb - ta);
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      };
      const a1 = mix(p0, p1, t0, t1),
        a2 = mix(p1, p2, t1, t2),
        a3 = mix(p2, p3, t2, t3);
      const b1 = mix(a1, a2, t0, t2),
        b2 = mix(a2, a3, t1, t3);
      rå.push(mix(b1, b2, t1, t2));
    }
  }
  let sum = 0;
  const lengder = [0];
  for (let i = 1; i < rå.length; i++) {
    sum += avst(rå[i - 1]!, rå[i]!);
    lengder.push(sum);
  }
  return rå.map((q, i) => ({ p: q, t: sum > 0 ? lengder[i]! / sum : 0 }));
}

/** The length of the centre line (mm). */
export function strekLengde(strek: Strek): number {
  const s = senterlinje(strek, 1);
  let sum = 0;
  for (let i = 1; i < s.length; i++) sum += avst(s[i - 1]!.p, s[i]!.p);
  return sum;
}

const glatt01 = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

/** Sort, clamp and make sure the profile has a point at 0 and at 1. */
export function ryddBreddepunkter(punkter: Breddepunkt[]): Breddepunkt[] {
  const p = punkter
    .map((x) => ({
      t: Math.max(0, Math.min(1, x.t)),
      v: Math.max(0, Math.min(MAKS_BREDDEFAKTOR, x.v)),
    }))
    .sort((a, b) => a.t - b.t);
  if (!p.length) return PROFILER.jevn.map((x) => ({ ...x }));
  if (p[0]!.t > 0) p.unshift({ t: 0, v: p[0]!.v });
  if (p[p.length - 1]!.t < 1) p.push({ t: 1, v: p[p.length - 1]!.v });
  return p;
}

/** The width factor at `t` (0 to 1): a smooth monotone curve through the width points (PCHIP). */
export function breddefaktor(punkter: Breddepunkt[], t: number): number {
  const p = ryddBreddepunkter(punkter);
  if (t <= p[0]!.t) return p[0]!.v;
  if (t >= p[p.length - 1]!.t) return p[p.length - 1]!.v;
  let i = 0;
  while (i < p.length - 2 && t > p[i + 1]!.t) i++;
  const h = (k: number) => Math.max(1e-9, p[k + 1]!.t - p[k]!.t);
  const d = (k: number) => (p[k + 1]!.v - p[k]!.v) / h(k);
  // tangents (Fritsch-Carlson): zero at a local extreme, else the harmonic mean
  const tang = (k: number): number => {
    if (k === 0) return d(0);
    if (k === p.length - 1) return d(p.length - 2);
    const a = d(k - 1),
      b = d(k);
    if (a * b <= 0) return 0;
    const w1 = 2 * h(k) + h(k - 1),
      w2 = h(k) + 2 * h(k - 1);
    return (w1 + w2) / (w1 / a + w2 / b);
  };
  const hh = h(i);
  const u = (t - p[i]!.t) / hh;
  const m0 = tang(i) * hh,
    m1 = tang(i + 1) * hh;
  const u2 = u * u,
    u3 = u2 * u;
  const v =
    (2 * u3 - 3 * u2 + 1) * p[i]!.v +
    (u3 - 2 * u2 + u) * m0 +
    (-2 * u3 + 3 * u2) * p[i + 1]!.v +
    (u3 - u2) * m1;
  return Math.max(0, v);
}

/** The full width (mm) at position `t` of the stroke, taper included. */
export function breddeVed(strek: Strek, t: number): number {
  let w = strek.bredde * breddefaktor(strek.breddepunkter, t);
  if (strek.tuppStart > 0) w *= glatt01(t / strek.tuppStart);
  if (strek.tuppSlutt > 0) w *= glatt01((1 - t) / strek.tuppSlutt);
  return Math.max(0, w);
}

/** Half a circle round an end of the stroke: the angle runs from `fra` by -π, clockwise. */
function kappe(senter: Vec2, radius: number, fra: number, ut: Ring): void {
  const n = Math.max(4, Math.min(24, Math.ceil(radius * 6)));
  for (let i = 1; i < n; i++) {
    const a = fra - (Math.PI * i) / n;
    ut.push({ x: senter.x + Math.cos(a) * radius, y: senter.y + Math.sin(a) * radius });
  }
}

/**
 * The closed outline of the stroke as one ring. It may overlap itself on
 * tight bends; `strekRegion` resolves that. Empty for fewer than two points.
 */
export function strekRing(strek: Strek): Ring {
  const s = senterlinje(strek);
  if (s.length < 2) return [];
  const n = s.length;
  const tangent = (i: number): Vec2 => {
    // a wider window than the neighbours: the dense points would make the normal jitter
    const a = s[Math.max(0, i - 2)]!.p,
      b = s[Math.min(n - 1, i + 2)]!.p;
    const l = avst(a, b) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const venstre: Ring = [];
  const hoyre: Ring = [];
  const bredder: number[] = [];
  const tang: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const w = breddeVed(strek, s[i]!.t) / 2;
    const t = tangent(i);
    bredder.push(w);
    tang.push(t);
    const nx = -t.y,
      ny = t.x;
    venstre.push({ x: s[i]!.p.x + nx * w, y: s[i]!.p.y + ny * w });
    hoyre.push({ x: s[i]!.p.x - nx * w, y: s[i]!.p.y - ny * w });
  }
  const ring: Ring = [...venstre];
  // end cap: from the left edge round to the right edge
  const slutt = tang[n - 1]!;
  if (bredder[n - 1]! > 1e-4) kappe(s[n - 1]!.p, bredder[n - 1]!, Math.atan2(slutt.x, -slutt.y), ring);
  for (let i = n - 1; i >= 0; i--) ring.push(hoyre[i]!);
  const start = tang[0]!;
  if (bredder[0]! > 1e-4) kappe(s[0]!.p, bredder[0]!, Math.atan2(-start.x, start.y), ring);
  return ring;
}

/** The stroke as a clean region: overlaps on tight bends are merged. */
export function strekRegion(strek: Strek): Region {
  const ring = strekRing(strek);
  if (ring.length < 3) return [];
  return forenkle(regionFraRinger([ring], 'nonzero'), 0.01);
}

const hjorne = (p: Vec2): Node => ({ p, inn: null, ut: null, glatt: false });

/** The outline as paths of corner points, ready for a vector (holes from a loop in the stroke are kept). */
export function strekBaner(strek: Strek): Bane[] {
  const baner: Bane[] = [];
  for (const r of ringerI(strekRegion(strek))) {
    if (r.length >= 3) baner.push({ noder: r.map(hjorne), lukket: true });
  }
  return baner;
}

/** Path data for the outline, in the stroke's own coordinates. */
export function strekTilSti(strek: Strek): string {
  return banerTilSti(strekBaner(strek));
}

/** Move the stroke's points (the vector is re-centred on its outline when it is made). */
export function flyttStrek(strek: Strek, dx: number, dy: number): Strek {
  return { ...strek, punkter: strek.punkter.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}
