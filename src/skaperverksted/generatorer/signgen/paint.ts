/**
 * Paint strokes on the sign (Sivert, 2026-10-06): put a finished stroke on
 * the sign as a vector that remembers its centre line and width profile,
 * change the width afterwards, or turn it into an ordinary vector.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Vec2 } from '../../core/geometri2d';
import { regionBoks } from '../../geometri/polygon';
import {
  MAKS_BREDDE,
  MIN_BREDDE,
  PROFILER,
  flyttStrek,
  forenklePunkter,
  nyttStrek,
  ryddBreddepunkter,
  strekRegion,
  strekTilSti,
  tynnPunkter,
  type Strek,
} from '../../geometri/strek';
import type { SvgKilde } from '../../core/dokument';
import { leggTil } from './handlinger';
import { oppdaterKilde } from './dokument';
import type { Paintvalg } from './tilstand';

export const NAVN_STREK = 'Strek';

/** Control points from the raw pointer samples: thin out, then keep what matters. */
export function strekFraPunkter(raa: Vec2[], v: Paintvalg): Strek | null {
  const punkter = forenklePunkter(tynnPunkter(raa, 0.3), 0.12);
  if (punkter.length < 2) return null;
  const strek = nyttStrek(punkter, clampBredde(v.bredde), v.profil, v.glatt);
  return { ...strek, tuppStart: v.tuppStart, tuppSlutt: v.tuppSlutt };
}

export const clampBredde = (b: number) => Math.min(MAKS_BREDDE, Math.max(MIN_BREDDE, b));

/** Put a stroke on the sign as a vector of its own; returns its id (null when it has no area). */
export function leggTilStrek(benk: Arbeidsbenk, strek: Strek): string | null {
  const boks = regionBoks(strekRegion(strek));
  if (!isFinite(boks.minX)) return null;
  const cx = (boks.minX + boks.maksX) / 2,
    cy = (boks.minY + boks.maksY) / 2;
  const lokal = flyttStrek(strek, -cx, -cy);
  const kilde: SvgKilde = {
    type: 'svg',
    stier: [strekTilSti(lokal)],
    filnavn: NAVN_STREK,
    fyllregel: 'nonzero',
    strek: lokal,
  };
  const o = leggTil(benk, kilde, { x: cx, y: cy }, NAVN_STREK);
  return o?.id ?? null;
}

/** Change a stroke's source and rebuild its outline. */
export function endreStrek(
  benk: Arbeidsbenk,
  id: string,
  navn: string,
  fn: (s: Strek) => Strek,
  slaSammen?: string,
): void {
  benk.endre({
    navn,
    slaSammen,
    anvend: (d) => {
      const o = d.objekter[id];
      if (!o || o.kilde.type !== 'svg' || !o.kilde.strek) return d;
      const neste = fn(o.kilde.strek);
      return oppdaterKilde(d, id, {
        strek: { ...neste, breddepunkter: ryddBreddepunkter(neste.breddepunkter) },
        stier: [strekTilSti({ ...neste, breddepunkter: ryddBreddepunkter(neste.breddepunkter) })],
      });
    },
  });
}

/** The stroke becomes an ordinary vector: its outline points can be edited, the width no longer can. */
export function gjorStrekTilVektor(benk: Arbeidsbenk, id: string): void {
  benk.endre({
    navn: 'Gjør strek om til vektor',
    anvend: (d) => {
      const o = d.objekter[id];
      if (!o || o.kilde.type !== 'svg' || !o.kilde.strek) return d;
      const { strek: _bort, ...resten } = o.kilde;
      void _bort;
      return {
        ...d,
        objekter: {
          ...d.objekter,
          [id]: { ...o, kilde: resten as SvgKilde, navn: o.navn === NAVN_STREK ? 'Tegning' : o.navn },
        },
      };
    },
  });
  benk.melde('Streken er nå en vanlig vektor. Punktene kan redigeres, men bredden kan ikke endres lenger.');
}

export { PROFILER };
