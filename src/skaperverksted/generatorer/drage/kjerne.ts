/**
 * The dragon generator's plug-in core: everything except UI, so it can be
 * tested and run in a worker. `index.ts` adds the UI contributions.
 */
import { tall } from '../../core/enheter';
import { tomtDokument, type Dokument } from '../../core/dokument';
import type { GeneratorPlugin } from '../../core/generator';
import { finnMateriale, standardPrinter } from '../../core/materialer';
import { byggDrageModell } from './bygg';
import { byggBrikker } from './brikker/bygg';
import { navnPa as brikkenavn } from './brikker/graf';
import { brikkerFra, lesInnBrikker, modusFor } from './brikker/handlinger';

/** Short label on the canvas; the full explanation is in the model notes. */
export const UTVIKLINGSMERKE = 'Foreløpige dragedeler (utviklingsgeometri)';
import { meta } from './meta';
import { katalog, lesParametre, standardParametre } from './parametre';

export const DRAGE_ID = meta.id;

function navnPa<T extends string>(liste: readonly { id: T; navn: string }[], id: T): string {
  return liste.find((v) => v.id === id)?.navn ?? id;
}

export const drageKjerne: Omit<GeneratorPlugin, 'ui'> = {
  id: meta.id,
  navn: meta.navn,
  beskrivelse: meta.beskrivelse,
  status: meta.status,
  visninger: ['3d'],
  nyttDokument(): Dokument {
    const dok = tomtDokument(DRAGE_ID, 'Min drage', {
      bredde: standardPrinter.plateBredde,
      dybde: standardPrinter.plateDybde,
      hoyde: standardPrinter.byggHoyde,
      printerProfilId: standardPrinter.id,
    });
    return { ...dok, parametre: { ...structuredClone(standardParametre) } };
  },
  lesInn(dok) {
    return lesInnBrikker(dok);
  },
  async byggModell(dok) {
    if (modusFor(dok.parametre) === 'brikker') {
      const { prosjekt, problemer } = brikkerFra(dok.parametre);
      const r = byggBrikker(prosjekt, lesParametre(dok.parametre), problemer);
      return { deler: r.deler, advarsler: r.advarsler };
    }
    const r = await byggDrageModell(lesParametre(dok.parametre));
    return { deler: r.deler, advarsler: r.advarsler };
  },
  utviklingsgeometri: UTVIKLINGSMERKE,
  eksport(dok, modell) {
    // The classic dragon keeps the shared default (one 3MF, one combined STL).
    if (modusFor(dok.parametre) !== 'brikker') return {};
    const feil = modell.advarsler.filter((a) => a.niva === 'feil');
    return {
      stlPerDel: true,
      merknad:
        'Hver brikke er et eget legeme i filen. Leddene er en prøveprofil som ikke er fysisk testet som brikkeledd, så dette er en prøveprint.',
      ...(feil.length
        ? {
            sperret: `Eksporten er stoppet fordi kontrollen fant ${feil.length === 1 ? 'en feil' : `${feil.length} feil`}: ${feil.map((f) => f.tekst).join(' ')}`,
          }
        : {}),
    };
  },
  bestilling(dok, modell) {
    const p = lesParametre(dok.parametre);
    const farger = [...new Set(modell.deler.map((d) => finnMateriale(d.materialId).navn))];
    if (modusFor(dok.parametre) === 'brikker') {
      const { prosjekt } = brikkerFra(dok.parametre);
      return {
        produktId: 'skaperverksted-drage',
        navn: `Drage fra Skaperverksted: ${dok.navn}`,
        valg: <Record<string, string>>{
          Modell: 'Brikkedrage (utviklingsgeometri, prøveledd)',
          Brikker: prosjekt.instanser.map((i) => brikkenavn(prosjekt, i.id)).join(', '),
          Koblinger: String(prosjekt.forbindelser.length),
          Farger: farger.join(', '),
        },
      };
    }
    return {
      produktId: 'skaperverksted-drage',
      navn: `Drage fra Skaperverksted: ${dok.navn}`,
      valg: {
        Lengde: `${tall(p.lengde, 0)} mm`,
        Kropp: navnPa(katalog.kropp, p.kropp),
        Hode: navnPa(katalog.hode, p.hode),
        Horn: navnPa(katalog.horn, p.horn),
        Pigger: navnPa(katalog.pigger, p.pigger),
        Hale: navnPa(katalog.hale, p.hale),
        Vinger: navnPa(katalog.vinger, p.vinger),
        Mønster: navnPa(katalog.monster, p.monster),
        Farger: farger.join(', '),
      },
    };
  },
};
