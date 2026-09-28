/**
 * The dragon generator's plug-in core: everything except UI, so it can be
 * tested and run in a worker. `index.ts` adds the UI contributions.
 */
import { tomtDokument, type Dokument } from '../../core/dokument';
import type { GeneratorPlugin } from '../../core/generator';
import { standardPrinter } from '../../core/materialer';
import { byggDrageModell, UTVIKLINGSGEOMETRI_TEKST } from './bygg';
import { lesParametre, standardParametre } from './parametre';

export const DRAGE_ID = 'drage';

export const drageKjerne: Omit<GeneratorPlugin, 'ui'> = {
  id: DRAGE_ID,
  navn: 'Artikulert drage',
  beskrivelse: 'Sett sammen din egen bevegelige drage. Den printes i ett stykke med ferdige ledd.',
  status: 'tilgjengelig',
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
  async byggModell(dok) {
    const r = await byggDrageModell(lesParametre(dok.parametre));
    return { deler: r.deler, advarsler: r.advarsler };
  },
  utviklingsgeometri: UTVIKLINGSGEOMETRI_TEKST,
};
