/**
 * Guide lines (Sign Forge, 2026-10-07): pure helpers on the document, and
 * the actions the canvas, the rulers and the panels share. A guide is
 * dragged out of a ruler, can be moved, locked and deleted, hidden with
 * all the others, and is a snap target and an alignment reference. It is
 * saved with the project and never reaches the model or the export.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { nyId, type Dokument, type Hjelpelinje } from '../../core/dokument';

export const hjelpelinjerAv = (dok: Dokument): Hjelpelinje[] => dok.hjelpelinjer ?? [];

const med = (dok: Dokument, linjer: Hjelpelinje[]): Dokument => ({ ...dok, hjelpelinjer: linjer });

/** Round to 0.01 mm: a guide dragged by hand does not need more digits. */
const rund = (v: number) => Math.round(v * 100) / 100;

export function nyHjelpelinje(akse: 'x' | 'y', verdi: number): Hjelpelinje {
  return { id: nyId('g'), akse, verdi: rund(verdi) };
}

export function leggTilHjelpelinje(dok: Dokument, linje: Hjelpelinje): Dokument {
  return med(dok, [...hjelpelinjerAv(dok), { ...linje, verdi: rund(linje.verdi) }]);
}

export function oppdaterHjelpelinje(dok: Dokument, id: string, endring: Partial<Hjelpelinje>): Dokument {
  return med(
    dok,
    hjelpelinjerAv(dok).map((g) =>
      g.id === id
        ? { ...g, ...endring, verdi: endring.verdi !== undefined ? rund(endring.verdi) : g.verdi }
        : g,
    ),
  );
}

export function slettHjelpelinje(dok: Dokument, id: string): Dokument {
  return med(
    dok,
    hjelpelinjerAv(dok).filter((g) => g.id !== id),
  );
}

export function slettAlleHjelpelinjer(dok: Dokument): Dokument {
  return med(
    dok,
    hjelpelinjerAv(dok).filter((g) => g.last),
  );
}

/** The guide nearest a model point within `toleranse` mm (null if none; locked ones only when asked). */
export function narmesteHjelpelinje(
  linjer: Hjelpelinje[],
  p: { x: number; y: number },
  toleranse: number,
  medLaaste = false,
): Hjelpelinje | null {
  let best: Hjelpelinje | null = null;
  let bestD = toleranse;
  for (const g of linjer) {
    if (g.last && !medLaaste) continue;
    const d = Math.abs((g.akse === 'x' ? p.x : p.y) - g.verdi);
    if (d <= bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

// ---------- actions ----------

export function leggTilHjelpelinjeI(benk: Arbeidsbenk, akse: 'x' | 'y', verdi: number): Hjelpelinje {
  const g = nyHjelpelinje(akse, verdi);
  benk.endre({ navn: 'Ny hjelpelinje', anvend: (d) => leggTilHjelpelinje(d, g) });
  return g;
}

export function flyttHjelpelinjeTil(benk: Arbeidsbenk, id: string, verdi: number, slaSammen?: string): void {
  benk.endre({ navn: 'Flytt hjelpelinje', slaSammen, anvend: (d) => oppdaterHjelpelinje(d, id, { verdi }) });
}

export function slettHjelpelinjeI(benk: Arbeidsbenk, id: string): void {
  benk.endre({ navn: 'Slett hjelpelinje', anvend: (d) => slettHjelpelinje(d, id) });
}

export function laasHjelpelinje(benk: Arbeidsbenk, id: string, last: boolean): void {
  benk.endre({
    navn: last ? 'Lås hjelpelinje' : 'Lås opp hjelpelinje',
    anvend: (d) => oppdaterHjelpelinje(d, id, { last }),
  });
}
