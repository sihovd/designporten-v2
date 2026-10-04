/**
 * Check results shared by both families: findings, the digital status and
 * the build result type the editor, the export and the report read.
 */
import type { Advarsel, Modellresultat } from '../../core/generator';
import type { Leddprofil } from './ledd';
import type { Mekanikkprofil } from './profil';
import type { Boks } from './sdf';
import type { Sveipresultat } from './sveip';

export type Evidens = 'beregnet' | 'estimert' | 'ikke-testet';

export const evidensTekst: Record<Evidens, string> = {
  beregnet: 'Beregnet på modellen',
  estimert: 'Anslag',
  'ikke-testet': 'Ikke fysisk testet',
};

export interface Funn {
  regel: string;
  niva: 'feil' | 'advarsel' | 'info';
  tittel: string;
  arsak: string;
  konsekvens: string;
  forslag: string;
  objekter: string[];
  evidens: Evidens;
}

export type Digitalstatus = 'gronn' | 'gul' | 'rod';

export interface Kroppsdata {
  /** Clicker: `topp` or `underdel`. Modular builder: the part's id. */
  kropp: string;
  /** Solid volume of the body (mm³), from the grid. */
  volum: number;
  tyngdepunkt: [number, number, number];
  /** Grid cell used for the decoration mesh (mm). */
  celle: number;
}

export interface Kontroll {
  revisjon: string;
  status: Digitalstatus;
  funn: Funn[];
  /** The clicker's switch profile. */
  profil: Mekanikkprofil | null;
  /** The modular builder's joint profile. */
  leddprofil?: Leddprofil | null;
  /** Collision through the click (clicker only). */
  sveip: Sveipresultat | null;
  kropper: Kroppsdata[];
}

export interface BuildforgeResultat extends Modellresultat {
  kontroll: Kontroll;
}

export function erBuildforgeResultat(m: Modellresultat | null): m is BuildforgeResultat {
  return !!m && 'kontroll' in m;
}

export function tilAdvarsler(funn: Funn[]): Advarsel[] {
  return funn.map((f) => ({
    niva: f.niva,
    tekst: `${f.tittel}. ${f.forslag}`,
    objektId: f.objekter[0],
  }));
}

export function statusFra(funn: Funn[]): Digitalstatus {
  return funn.some((f) => f.niva === 'feil')
    ? 'rod'
    : funn.some((f) => f.niva === 'advarsel')
      ? 'gul'
      : 'gronn';
}

/** Grid index range of a box inside a grid. */
export function indeksomrade(r: { min: number[]; g: number; nx: number; ny: number; nz: number }, b: Boks) {
  const lo = (v: number, k: number) => Math.max(0, Math.floor((v - r.min[k]!) / r.g));
  const hi = (v: number, k: number, n: number) => Math.min(n - 1, Math.ceil((v - r.min[k]!) / r.g));
  return [
    lo(b.min[0], 0),
    hi(b.maks[0], 0, r.nx),
    lo(b.min[1], 1),
    hi(b.maks[1], 1, r.ny),
    lo(b.min[2], 2),
    hi(b.maks[2], 2, r.nz),
  ] as const;
}

/** A result with no parts: the build stopped before any geometry. */
export function stopp(
  rev: string,
  funn: Funn[],
  profil: Mekanikkprofil | null,
  leddprofil: Leddprofil | null = null,
): BuildforgeResultat {
  return {
    deler: [],
    advarsler: tilAdvarsler(funn),
    kontroll: { revisjon: rev, status: 'rod', funn, profil, leddprofil, sveip: null, kropper: [] },
  };
}
