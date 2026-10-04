/**
 * BuildForge's plug-in core: everything except UI, so it can be tested
 * without a browser. `index.ts` adds the UI contributions.
 */
import { tomtDokument, type Dokument } from '../../core/dokument';
import type { GeneratorPlugin } from '../../core/generator';
import { standardPrinter } from '../../core/materialer';
import { finnStartmal } from './bibliotek';
import { modulprosjekt } from './kroppsbibliotek';
import { erBuildforgeResultat } from './bygg';
import { beregn } from './beregning';
import { meta } from './meta';
import { filnavn } from '../../eksport/tremf';
import { lagRapport } from './rapport';
import { familieFor } from './parametre';

export const PROTOTYPEMERKE = 'Digital prototype: mekanikken er ikke fysisk testet';

/**
 * A new document. Without a clicker template it is a modular project with a
 * blank Main Body and no start chosen, so «La oss bygge …» opens (handoff §3).
 */
export function nyttBuildforgeDokument(malId?: string): Dokument {
  const mal = malId ? finnStartmal(malId) : null;
  const dok = tomtDokument(meta.id, mal?.navn ?? 'Uten navn', {
    bredde: standardPrinter.plateBredde,
    dybde: standardPrinter.plateDybde,
    hoyde: standardPrinter.byggHoyde,
    printerProfilId: standardPrinter.id,
  });
  return { ...dok, parametre: { ...(mal ? mal.parametre() : modulprosjekt('blank', 'ny')) } };
}

export const buildforgeKjerne: Omit<GeneratorPlugin, 'ui'> = {
  id: meta.id,
  navn: meta.navn,
  beskrivelse: meta.beskrivelse,
  status: meta.status,
  visninger: ['3d'],
  nyttDokument: () => nyttBuildforgeDokument(),
  byggModell: (dok) => beregn(dok.parametre),
  utviklingsgeometri: PROTOTYPEMERKE,
  venstrepanelNavn: 'Deler',
  // the locked part and the decoration are separate shells inside each body
  delerOverlapper: true,
  eksport(dok, modell) {
    if (!erBuildforgeResultat(modell)) return { sperret: 'Modellen er ikke kontrollert ennå.' };
    const k = modell.kontroll;
    const rapport = {
      navn: 'Kontrollrapport (JSON)',
      filnavn: filnavn(dok.navn, 'stl').replace(/\.stl$/, '.kontroll.json'),
      innhold: JSON.stringify(lagRapport(dok, modell), null, 2),
      type: 'application/json',
    };
    if (k.status === 'rod')
      return {
        sperret:
          'Kontrollen fant feil som må rettes før filene kan lastes ned. Prosjektet kan fortsatt lagres. Se merknadene over.',
        vedlegg: rapport,
      };
    const modul = familieFor(dok.parametre as { familie?: 'klikker' | 'modul' }) === 'modul';
    return {
      merknad: modul
        ? 'Dette er en prototype. Leddene er ikke fysisk testet, så det er ikke kjent om pluggene sitter for stramt eller for løst. Hver del er en egen fil; sett modellen sammen etter utskrift. Filene er ikke godkjent for produksjon eller salg, og modellen er ikke testet som leketøy.'
        : 'Dette er en prototype. Mekanikken er ikke fysisk testet, så passform, klikk og retur er ikke bekreftet. Filene er ikke godkjent for produksjon eller salg. Bryteren kjøper du selv; den er ikke med i filene.',
      stlPerDel: true,
      vedlegg: rapport,
    };
  },
};
