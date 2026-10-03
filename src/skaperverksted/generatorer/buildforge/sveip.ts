/**
 * Collision through the whole travel (handoff §5.3).
 *
 * The moving top M is pressed straight down by s ∈ [0, vandring]. Its swept
 * volume is E = ∪ T(s)(M), and a point p lies in E when p + s·ẑ lies in M
 * for some s. Fixed geometry S must stay at least `klaring` from E:
 *
 *   f(p) = max( S(p), E(p) − klaring ),   collision-free ⇔ f > 0 everywhere.
 *
 * E(p) is the minimum of M along a vertical segment, sampled every h mm, and
 * f is sampled on a grid with spacing g. Because every field here is
 * 1-Lipschitz, the true minimum of f is at least the sampled minimum minus
 *
 *   feilgrense = g·√3/2 + h/2,
 *
 * so a sampled minimum above that bound proves the gap (for these fields),
 * a sampled value ≤ 0 is a real violation, and anything between is refined
 * on a finer grid around the uncertain points, then reported as uncertain.
 * End positions alone are not enough: a part can pass through something
 * mid-travel and be clear again at the bottom; this check sees that.
 */
import { boksSnitt, boksUnion, utvid, type Boks, type Felt, type V3 } from './sdf';

export interface Sveippar {
  statisk: Felt;
  statiskBoks: Boks;
  bevegelig: Felt;
  bevegeligBoks: Boks;
}

export interface Sveipresultat {
  status: 'fri' | 'kollisjon' | 'for-naer' | 'usikker';
  /** Proven lower bound of the gap beyond the clearance (mm) when free, else the sampled value. */
  margin: number | null;
  feilgrense: number;
  /** For a violation: where it first happens in the travel, and how far in. Otherwise the worst point. */
  punkt?: V3;
  vedVandring?: number;
  /** Index of the pair with the worst point. */
  par?: number;
  noder: number;
}

function sveipBoks(b: Boks, vandring: number): Boks {
  return { min: [b.min[0], b.min[1], b.min[2] - vandring], maks: b.maks };
}

export function sjekkSveip(
  par: Sveippar[],
  vandring: number,
  klaring: number,
  maksNoder = 90_000,
  maksNivaa = 4,
): Sveipresultat {
  const pad = klaring + 2;
  let omrade: Boks | null = null;
  for (const p of par)
    omrade = boksUnion(
      omrade,
      boksSnitt(utvid(p.statiskBoks, pad), utvid(sveipBoks(p.bevegeligBoks, vandring), pad)),
    );
  if (!omrade) return { status: 'fri', margin: null, feilgrense: 0, noder: 0 };

  let noder = 0;
  let siste: Sveipresultat = { status: 'fri', margin: null, feilgrense: 0, noder: 0 };
  for (let nivaa = 0; nivaa < maksNivaa && omrade; nivaa++) {
    const sx = omrade.maks[0] - omrade.min[0],
      sy = omrade.maks[1] - omrade.min[1],
      sz = omrade.maks[2] - omrade.min[2];
    const g = Math.min(
      1,
      Math.max(0.04, Math.cbrt((Math.max(sx, 0.01) * Math.max(sy, 0.01) * Math.max(sz, 0.01)) / maksNoder)),
    );
    const K = Math.max(2, Math.ceil(vandring / Math.min(g, vandring)) + 1);
    const h = vandring / (K - 1);
    const e = (g * Math.sqrt(3)) / 2 + h / 2;
    const nx = Math.floor(sx / g) + 2,
      ny = Math.floor(sy / g) + 2,
      nz = Math.floor(sz / g) + 2;
    let fmin = Infinity;
    let beste: { p: V3; s: number; par: number; overlapp: boolean } | null = null;
    let forste: { p: V3; s: number; par: number } | null = null;
    const usikre: Boks = { min: [Infinity, Infinity, Infinity], maks: [-Infinity, -Infinity, -Infinity] };
    let antallUsikre = 0;
    for (let k = 0; k < nz; k++) {
      const z = omrade.min[2] + k * g;
      for (let j = 0; j < ny; j++) {
        const y = omrade.min[1] + j * g;
        for (let n = 0; n < nx; n++) {
          const x = omrade.min[0] + n * g;
          noder++;
          for (let pi = 0; pi < par.length; pi++) {
            const pr = par[pi]!;
            const dS = pr.statisk(x, y, z);
            if (dS > e) continue;
            let dE = Infinity,
              sMin = 0,
              forsteS = -1;
            for (let i = 0; i < K; i++) {
              const s = i * h;
              const d = pr.bevegelig(x, y, z + s);
              if (forsteS < 0 && d - klaring <= 0) forsteS = s;
              if (d < dE) {
                dE = d;
                sMin = s;
              }
            }
            // earliest point in the travel where anything is violated
            if (dS <= 0 && forsteS >= 0 && (!forste || forsteS < forste.s))
              forste = { p: [x, y, z], s: forsteS, par: pi };
            const f = Math.max(dS, dE - klaring);
            if (f <= e) {
              antallUsikre++;
              usikre.min = [
                Math.min(usikre.min[0], x),
                Math.min(usikre.min[1], y),
                Math.min(usikre.min[2], z),
              ];
              usikre.maks = [
                Math.max(usikre.maks[0], x),
                Math.max(usikre.maks[1], y),
                Math.max(usikre.maks[2], z),
              ];
            }
            if (f < fmin) {
              fmin = f;
              beste = { p: [x, y, z], s: sMin, par: pi, overlapp: Math.max(dS, dE) <= 0 };
            }
          }
        }
      }
    }
    if (fmin <= 0 && beste)
      return {
        status: beste.overlapp ? 'kollisjon' : 'for-naer',
        margin: fmin,
        feilgrense: e,
        punkt: forste?.p ?? beste.p,
        vedVandring: forste?.s ?? beste.s,
        par: forste?.par ?? beste.par,
        noder,
      };
    if (!antallUsikre)
      return { status: 'fri', margin: Number.isFinite(fmin) ? fmin - e : null, feilgrense: e, noder };
    siste = {
      status: 'usikker',
      margin: fmin,
      feilgrense: e,
      punkt: beste?.p,
      vedVandring: beste?.s,
      par: beste?.par,
      noder,
    };
    omrade = utvid(usikre, g);
  }
  return siste;
}
