/**
 * The dragon generator's plug-in core: everything except UI, so it can be
 * tested and run in a worker. `index.ts` adds the UI contributions.
 */
import { tall } from '../../core/enheter';
import { tomtDokument, type Dokument } from '../../core/dokument';
import type { GeneratorPlugin } from '../../core/generator';
import { finnMateriale, standardPrinter } from '../../core/materialer';
import { byggDrageModell } from './bygg';
import { byggTegning } from './tegning/bygg';
import { lagOppsett } from './tegning/geometri';
import { modusFor, tegningFra } from './tegning/handlinger';
import { standardTegning } from './tegning/modell';

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
  // one workspace: the drawing views with live 3D, or the 3D view for dragons made with the part picker
  visninger: ['2d'],
  nyttDokument(): Dokument {
    const dok = tomtDokument(DRAGE_ID, 'Min drage', {
      bredde: standardPrinter.plateBredde,
      dybde: standardPrinter.plateDybde,
      hoyde: standardPrinter.byggHoyde,
      printerProfilId: standardPrinter.id,
    });
    return {
      ...dok,
      parametre: { ...structuredClone(standardParametre), modus: 'tegning', tegning: standardTegning() },
    };
  },
  lesInn(dok) {
    if (modusFor(dok.parametre) !== 'tegning') return dok;
    const { tegning } = tegningFra(dok.parametre);
    if (JSON.stringify(dok.parametre.tegning ?? null) === JSON.stringify(tegning)) return dok;
    return { ...dok, parametre: { ...dok.parametre, tegning } };
  },
  async byggModell(dok) {
    if (modusFor(dok.parametre) === 'tegning') {
      const { tegning, problemer } = tegningFra(dok.parametre);
      const r = byggTegning(tegning, lesParametre(dok.parametre), problemer);
      return { deler: r.deler, advarsler: r.advarsler };
    }
    const r = await byggDrageModell(lesParametre(dok.parametre));
    return { deler: r.deler, advarsler: r.advarsler };
  },
  utviklingsgeometri: UTVIKLINGSMERKE,
  eksport(dok, modell) {
    // the part-picker dragon keeps the shared default (one 3MF, one combined STL)
    if (modusFor(dok.parametre) !== 'tegning') return {};
    const feil = modell.advarsler.filter((a) => a.niva === 'feil');
    return {
      stlPerDel: true,
      merknad:
        'Hver del er et eget legeme i filen, printet ferdig koblet i stillingen du tegnet. Leddene er en prøveprofil som ikke er fysisk testet i bøyd stilling, så dette er en prøveprint.',
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
    if (modusFor(dok.parametre) === 'tegning') {
      const { tegning } = tegningFra(dok.parametre);
      const o = lagOppsett(tegning);
      return {
        produktId: 'skaperverksted-drage',
        navn: `Drage fra Skaperverksted: ${dok.navn}`,
        valg: <Record<string, string>>{
          Modell: 'Tegnet drage (utviklingsgeometri, prøveledd)',
          Rygg: `${tall(o.L, 0)} mm`,
          Deler: `${o.segmenter.length} deler, ${o.ledd.length} ledd`,
          Hode: navnPa(katalog.hode, tegning.hode.form),
          Horn: navnPa(katalog.horn, tegning.hode.horn),
          Hale: navnPa(katalog.hale, tegning.hale),
          Pigger: String(o.segmenter.filter((s) => s.pigg).length),
          Mønster: navnPa(katalog.monster, p.monster),
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
