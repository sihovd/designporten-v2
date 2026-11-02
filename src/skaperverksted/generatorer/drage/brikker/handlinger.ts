/**
 * Brick mode in the dragon document: which mode a project is in, reading
 * the brick project out of `Dokument.parametre`, and running graph
 * operations as one undo step each.
 *
 * The classic parameters stay in the same `parametre` object, so switching
 * between the classic dragon and the brick builder never loses either.
 * A document without `modus` is a classic dragon (every older project).
 */
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import type { Dokument } from '../../../core/dokument';
import { lesParametre } from '../parametre';
import { referansedrage, type Resultat } from './graf';
import { lesBrikkeprosjekt, tomtBrikkeprosjekt, type Brikkeprosjekt, type Innlesing } from './modell';

export type Drageomodus = 'klassisk' | 'brikker';

export function modusFor(parametre: Record<string, unknown> | undefined): Drageomodus {
  return parametre?.modus === 'brikker' ? 'brikker' : 'klassisk';
}

const innlest = new WeakMap<object, Innlesing>();

/** The brick project of a document's parameters (cached per stored object). */
export function brikkerFra(parametre: Record<string, unknown> | undefined): Innlesing {
  const raa = parametre?.brikker;
  if (!raa || typeof raa !== 'object') return { prosjekt: tomtBrikkeprosjekt(), problemer: [] };
  const ferdig = innlest.get(raa);
  if (ferdig) return ferdig;
  const ny = lesBrikkeprosjekt(raa);
  innlest.set(raa, ny);
  return ny;
}

/** Turn the brick builder on. Without bricks yet, it starts from the reference dragon in the classic choices. */
export function medBrikkemodus(parametre: Record<string, unknown>): Record<string, unknown> {
  const har = brikkerFra(parametre).prosjekt.instanser.length > 0;
  const klassisk = lesParametre(parametre);
  const hode = { rund: 'hode-rundt', lang: 'hode-langt', bred: 'hode-bredt' }[klassisk.hode];
  const hale = { spade: 'hale-spade', spiss: 'hale-spiss', kolle: 'hale-kolle' }[klassisk.hale];
  return {
    ...parametre,
    modus: 'brikker',
    brikker: har ? parametre.brikker : referansedrage(hode, hale),
  };
}

export function utenBrikkemodus(parametre: Record<string, unknown>): Record<string, unknown> {
  return { ...parametre, modus: 'klassisk' };
}

/** Bring a stored brick project up to date on open: repaired references, one group per connected set. */
export function lesInnBrikker(dok: Dokument): Dokument {
  if (modusFor(dok.parametre) !== 'brikker') return dok;
  const { prosjekt } = brikkerFra(dok.parametre);
  const lagret = JSON.stringify(dok.parametre.brikker ?? null);
  if (lagret === JSON.stringify(prosjekt)) return dok;
  return { ...dok, parametre: { ...dok.parametre, brikker: prosjekt } };
}

export function brikkeprosjekt(benk: Arbeidsbenk): Brikkeprosjekt {
  return brikkerFra(benk.dok.parametre).prosjekt;
}

/**
 * Run one graph operation as one undo step. A refused operation changes
 * nothing, makes no step and tells the user why.
 */
export function endreBrikker(
  benk: Arbeidsbenk,
  operasjon: (p: Brikkeprosjekt) => Resultat,
  slaSammen?: string,
): Resultat {
  const r = operasjon(brikkeprosjekt(benk));
  if (!r.ok) {
    benk.melde(r.grunn);
    return r;
  }
  benk.endre({
    navn: r.melding,
    slaSammen,
    anvend: (d) => ({ ...d, parametre: { ...d.parametre, modus: 'brikker', brikker: r.p } }),
  });
  benk.melde(r.melding);
  return r;
}

export function byttModus(benk: Arbeidsbenk, modus: Drageomodus): void {
  if (modusFor(benk.dok.parametre) === modus) return;
  benk.endre({
    navn: modus === 'brikker' ? 'Åpne brikkebyggeren' : 'Tilbake til ferdig drage',
    anvend: (d) => ({
      ...d,
      parametre: modus === 'brikker' ? medBrikkemodus(d.parametre) : utenBrikkemodus(d.parametre),
    }),
  });
}
