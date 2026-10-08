/** Which layers an object can be moved to, and the move itself (what «Lag» in the context bar does). */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, type Dokument, type Objekt } from '../../core/dokument';
import { flyttTilLag, kanLiggeI, losUtObjekt } from './dokument';

/** The value of the choice «its own layer, out of the group». */
export const EGET = '__eget-tekstlag';

export interface Lagvalg {
  id: string;
  navn: string;
}

/** The layers the object may lie in (text in text layers, shapes in plain layers), top layer first. */
export function lagValgFor(dok: Dokument, o: Objekt): Lagvalg[] {
  const lag = finnLag(dok, o.lagId);
  const iGruppe = !!lag?.tekstlag && (dok.rekkefolge[o.lagId]?.length ?? 0) > 1;
  const valg: Lagvalg[] = [...dok.lag]
    .reverse()
    .filter((l) => l.id === o.lagId || kanLiggeI(o, l))
    .map((l) => ({
      id: l.id,
      navn: `${l.navn}${l.tekstlag && l.id !== o.lagId ? ' (grupper med)' : ''}`,
    }));
  if (iGruppe && o.kilde.type === 'tekst') valg.push({ id: EGET, navn: 'Eget tekstlag (løs ut av gruppen)' });
  if (iGruppe && o.kilde.type === 'svg') valg.push({ id: EGET, navn: 'Eget lag (løs ut av gruppen)' });
  return valg;
}

export function flyttObjektTilValg(benk: Arbeidsbenk, o: Objekt, valg: string): void {
  if (valg === EGET) {
    let ny: string | null = null;
    benk.endre({
      navn: 'Løs ut av gruppen',
      anvend: (d) => {
        const r = losUtObjekt(d, o.id);
        ny = r.lagId;
        return r.dok;
      },
    });
    if (ny) benk.velg({ lag: ny });
    return;
  }
  benk.endre({ navn: 'Flytt til lag', anvend: (d) => flyttTilLag(d, [o.id], valg) });
  benk.velg({ lag: valg });
}
