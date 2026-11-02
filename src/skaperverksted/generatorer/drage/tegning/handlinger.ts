/**
 * The drawing in the dragon document: which kind of dragon a project is,
 * reading the drawing out of `Dokument.parametre`, and changing it as one
 * undo step.
 *
 * New dragons are drawn (`modus: 'tegning'`). A document without that mode
 * is a dragon made with the earlier part picker and opens as before.
 */
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import { lesTegning, standardTegning, type Tegning, type Tegningsinnlesing } from './modell';

export type Drageomodus = 'klassisk' | 'tegning';

export function modusFor(parametre: Record<string, unknown> | undefined): Drageomodus {
  return parametre?.modus === 'tegning' ? 'tegning' : 'klassisk';
}

const innlest = new WeakMap<object, Tegningsinnlesing>();

/** The drawing of a document's parameters (cached per stored object). */
export function tegningFra(parametre: Record<string, unknown> | undefined): Tegningsinnlesing {
  const raa = parametre?.tegning;
  if (!raa || typeof raa !== 'object') return { tegning: standardTegning(), problemer: [] };
  const ferdig = innlest.get(raa);
  if (ferdig) return ferdig;
  const ny = lesTegning(raa);
  innlest.set(raa, ny);
  return ny;
}

export function tegning(benk: Arbeidsbenk): Tegning {
  return tegningFra(benk.dok.parametre).tegning;
}

/**
 * Change the drawing as one undo step (`slaSammen` merges a drag into one
 * step). An unchanged drawing makes no step.
 */
export function endreTegning(
  benk: Arbeidsbenk,
  navn: string,
  endring: (t: Tegning) => Tegning,
  slaSammen?: string,
): void {
  benk.endre({
    navn,
    slaSammen,
    anvend: (d) => {
      const forrige = tegningFra(d.parametre).tegning;
      const neste = lesTegning(endring(structuredClone(forrige))).tegning;
      if (JSON.stringify(neste) === JSON.stringify(forrige)) return d;
      return { ...d, parametre: { ...d.parametre, modus: 'tegning', tegning: neste } };
    },
  });
}
