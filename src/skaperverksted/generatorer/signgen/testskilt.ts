/**
 * The starting sign from before 2026-10-05: a base plate layer with a
 * text layer on top. Tests that exercise plates, Kontur and influences
 * use it; the editor's own start sign has no plate.
 */
import type { Dokument } from '../../core/dokument';
import {
  leggTilLag,
  leggTilObjekt,
  nyForm,
  nyttLag,
  nyttObjekt,
  nyttSigngenDokument,
  nyttTekstlag,
} from './dokument';

export function skiltMedPlate(): Dokument {
  const start = nyttSigngenDokument();
  const tekst = start.lag[0]!;
  const tekstObjekt = start.objekter[start.rekkefolge[tekst.id]![0]!]!;
  const bunn = nyttLag('Bunnplate', 'pla-grafitt', 3);
  const lag = nyttTekstlag('Tekst', 'pla-kritthvit');
  let d: Dokument = {
    ...start,
    lag: [],
    objekter: {},
    rekkefolge: {},
    parametre: { autoZ: true, lagHoyde: 0.2 },
  };
  d = leggTilLag(d, bunn);
  d = leggTilLag(d, lag, bunn.id);
  d = leggTilObjekt(d, nyttObjekt(bunn.id, nyForm('rektangel', 120, 42, 6), {}, 'Bunnplate'));
  return leggTilObjekt(d, { ...tekstObjekt, lagId: lag.id });
}
