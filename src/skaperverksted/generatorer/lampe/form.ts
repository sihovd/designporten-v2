/**
 * The lamp's outer surface as a function r(θ, t): silhouette radius plus the
 * wall pattern. Pure; shared by the mesher, the printability check and the
 * 2D silhouette editor.
 */
import type { ProfilPunkt } from '../../core/profil';
import { MIN_RADIUS, type LampeParametre } from './parametre';

function bezier(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const m = 1 - s;
  return m * m * m * p0 + 3 * m * m * s * p1 + 3 * m * s * s * p2 + s * s * s * p3;
}

/**
 * Sample the silhouette chain into (u mm, t) pairs from bottom to top. Unlike
 * core/profil.ts `samplerProfil`, u keeps its sign (waists are negative).
 * Heights are forced non-decreasing so the curve is a function of t.
 */
export function samplerSilhuett(pk: ProfilPunkt[], perSegment = 24): { u: number; t: number }[] {
  if (pk.length < 2) {
    return [
      { u: 0, t: 0 },
      { u: 0, t: 1 },
    ];
  }
  const ut: { u: number; t: number }[] = [{ u: pk[0]!.u, t: pk[0]!.t }];
  for (let i = 0; i < pk.length - 1; i++) {
    const a = pk[i]!;
    const b = pk[i + 1]!;
    const c1 = a.ut ?? a;
    const c2 = b.inn ?? b;
    const n = !a.ut && !b.inn ? 1 : perSegment;
    for (let k = 1; k <= n; k++) {
      const s = k / n;
      ut.push({ u: bezier(a.u, c1.u, c2.u, b.u, s), t: bezier(a.t, c1.t, c2.t, b.t, s) });
    }
  }
  for (let i = 1; i < ut.length; i++) {
    if (ut[i]!.t < ut[i - 1]!.t) ut[i]!.t = ut[i - 1]!.t;
  }
  for (const s of ut) s.t = Math.min(1, Math.max(0, s.t));
  return ut;
}

export interface Form {
  p: LampeParametre;
  /** Silhouette radius at height fraction t, before the pattern (mm). */
  radius(t: number): number;
  /** Outer surface radius at angle θ (radians) and height fraction t (mm). */
  ytre(theta: number, t: number): number;
  /** True when the silhouette had to be lifted to MIN_RADIUS somewhere. */
  klemt: boolean;
}

const TO_PI = Math.PI * 2;

export function lagForm(p: LampeParametre): Form {
  const prover = samplerSilhuett(p.silhuett);
  const rB = p.diameterBunn / 2;
  const rT = p.diameterTopp / 2;
  // Lookup table of u over t, evaluated by linear interpolation.
  const N = 256;
  const tabell = new Float64Array(N + 1);
  let k = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    while (k < prover.length - 2 && prover[k + 1]!.t < t) k++;
    const a = prover[k]!;
    const b = prover[Math.min(k + 1, prover.length - 1)]!;
    const d = b.t - a.t;
    const s = d > 1e-9 ? Math.min(1, Math.max(0, (t - a.t) / d)) : 1;
    tabell[i] = a.u + (b.u - a.u) * s;
  }
  let klemt = false;
  const radius = (t: number): number => {
    const tt = Math.min(1, Math.max(0, t));
    const x = tt * N;
    const i = Math.min(N - 1, Math.floor(x));
    const u = tabell[i]! + (tabell[i + 1]! - tabell[i]!) * (x - i);
    const r = rB + (rT - rB) * tt + u;
    if (r < MIN_RADIUS) {
      klemt = true;
      return MIN_RADIUS;
    }
    return r;
  };

  const { type, antall: n, dybde } = p.monster;
  const vri = (p.vridning * Math.PI) / 180;
  const ytre = (theta: number, t: number): number => {
    const r = radius(t);
    const fase = vri * t;
    switch (type) {
      case 'glatt':
        return r;
      case 'ribber':
        return r + dybde * (0.5 + 0.5 * Math.cos(n * (theta - fase)));
      case 'diamant': {
        const a = 0.5 + 0.5 * Math.cos(n * (theta - fase));
        const b = 0.5 + 0.5 * Math.cos(n * (theta + fase));
        return r + dybde * Math.max(a, b);
      }
      case 'bolger':
        return r + dybde * (0.5 - 0.5 * Math.cos(TO_PI * n * t));
      case 'fasetter': {
        // Regular n-gon with its corners on the silhouette radius.
        const sektor = TO_PI / n;
        let v = (theta - fase) % sektor;
        if (v < 0) v += sektor;
        return Math.max(MIN_RADIUS, (r * Math.cos(Math.PI / n)) / Math.cos(v - Math.PI / n));
      }
    }
  };

  return {
    p,
    radius,
    ytre,
    get klemt() {
      return klemt;
    },
  };
}

/** Angular samples: enough per rib/facet, with sharp facet corners on samples. */
export function antallVinkler(p: LampeParametre): number {
  const { type, antall } = p.monster;
  if (type === 'glatt' || type === 'bolger') return 160;
  const perPeriode = type === 'fasetter' && p.vridning === 0 ? 2 : Math.max(8, Math.ceil(192 / antall));
  return Math.min(576, Math.max(160, antall * perPeriode));
}

/** Height samples: follow silhouette detail, waves and twist, within a budget. */
export function antallRader(p: LampeParametre, vinkler: number): number {
  const { type, antall } = p.monster;
  let m = Math.ceil(p.hoyde / 1.5);
  if (type === 'bolger') m = Math.max(m, antall * 16);
  if (type !== 'glatt' && type !== 'bolger')
    m = Math.max(m, Math.ceil((6 * antall * Math.abs(p.vridning)) / 360));
  m = Math.min(360, Math.max(40, m));
  const budsjett = 60_000;
  return Math.max(40, Math.min(m, Math.floor(budsjett / vinkler)));
}
