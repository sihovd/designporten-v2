/**
 * What the drawing views read: the drawing, its layout, each piece's shape
 * from above and from the side, and which pieces collide. Cached per stored
 * drawing, so the top view, the side view and the properties panel share
 * one computation.
 */
import { useMemo } from 'preact/hooks';
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import { brukUtdrag } from '../../../shell/bruk-benk';
import { funnTilAdvarsel, kontroller } from './bygg';
import type { Advarsel } from '../../../core/generator';
import { lagOppsett, segmentform, type Oppsett, type Segmentform } from './geometri';
import { tegningFra } from './handlinger';
import type { Tegning } from './modell';

export interface Tegnebilde {
  tegning: Tegning;
  oppsett: Oppsett;
  former: Segmentform[];
  funn: Advarsel[];
  /** Pieces that are part of a problem (collision, too sharp bend, too short). */
  feilDeler: Set<number>;
  feilLedd: Set<number>;
}

const hurtig = new WeakMap<object, Tegnebilde>();

export function tegnebilde(parametre: Record<string, unknown>): Tegnebilde {
  const nokkel = (parametre.tegning as object | undefined) ?? parametre;
  const ferdig = hurtig.get(nokkel);
  if (ferdig) return ferdig;
  const { tegning } = tegningFra(parametre);
  const oppsett = lagOppsett(tegning);
  const former = oppsett.segmenter.map((s) => segmentform(tegning, oppsett, s));
  const funn = oppsett.segmenter.length ? kontroller(tegning, oppsett) : oppsett.funn.map(funnTilAdvarsel);
  const feilDeler = new Set<number>();
  const feilLedd = new Set<number>();
  for (const f of funn) {
    if (f.niva !== 'feil' || !f.objektId) continue;
    const [type, ider] = f.objektId.split(':');
    for (const x of (ider ?? '').split(',').map(Number)) (type === 'ledd' ? feilLedd : feilDeler).add(x);
  }
  const b: Tegnebilde = { tegning, oppsett, former, funn, feilDeler, feilLedd };
  hurtig.set(nokkel, b);
  return b;
}

export function brukTegnebilde(benk: Arbeidsbenk): Tegnebilde {
  const raa = brukUtdrag(benk, (t) => t.dok.parametre);
  return useMemo(() => tegnebilde(raa), [raa]);
}
