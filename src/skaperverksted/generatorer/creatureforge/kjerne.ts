/**
 * Creature Forge's plug-in core: everything except UI, so it can be tested.
 * `index.ts` adds the UI contributions.
 */
import { tomtDokument, type Dokument } from '../../core/dokument';
import type { GeneratorPlugin } from '../../core/generator';
import { standardPrinter } from '../../core/materialer';
import { beregn } from './beregning';
import type { CfResultat } from './bygg';
import { KJEDELEDD_PROVE, SIKKERHET_NAVN } from './ledd';
import { meta } from './meta';
import { tomtProsjekt } from './parametre';

export const PROTOTYPEMERKE = 'Prototype: leddene er ikke testprintet';

/** The control report that goes with every export: what was built, from what, and what is not known. */
export function kontrollrapport(dok: Dokument, r: CfResultat): string {
  return JSON.stringify(
    {
      verktoy: meta.navn,
      prosjekt: dok.navn,
      revisjon: r.revisjon,
      laget: new Date().toISOString(),
      enheter: 'mm',
      printposisjon: 'Liggende på ryggen, forsiden opp, alle ledd i null.',
      status: r.status,
      fysiskTestet: false,
      profil: r.profil && {
        id: r.profil.id,
        versjon: r.profil.versjon,
        fysiskStatus: r.profil.fysiskStatus,
        maal: Object.fromEntries(
          Object.entries(r.profil.maal).map(([k, m]) => [
            k,
            { verdi: m.verdi, enhet: m.enhet, sikkerhet: SIKKERHET_NAVN[m.sikkerhet] },
          ]),
        ),
      },
      toleranser: r.toleranser,
      deler: r.deler.map((d) => ({
        id: d.id,
        navn: d.navn,
        farge: d.materialId,
        trekanter: d.mesh.indekser.length / 3,
      })),
      ledd: r.ledd.map((l) => ({ id: l.id, sving: l.sving, fangst: Math.round(l.fangst * 100) / 100 })),
      funn: r.funn,
    },
    null,
    2,
  );
}

export const creatureKjerne: Omit<GeneratorPlugin, 'ui'> = {
  id: meta.id,
  navn: meta.navn,
  beskrivelse: meta.beskrivelse,
  status: meta.status,
  visninger: ['3d'],
  flate: 'lys',
  utviklingsgeometri: PROTOTYPEMERKE,
  nyttDokument(): Dokument {
    const dok = tomtDokument(meta.id, 'Min figur', {
      bredde: standardPrinter.plateBredde,
      dybde: standardPrinter.plateDybde,
      hoyde: standardPrinter.byggHoyde,
      printerProfilId: standardPrinter.id,
    });
    const p = tomtProsjekt({ id: KJEDELEDD_PROVE.id, versjon: KJEDELEDD_PROVE.versjon });
    return { ...dok, parametre: p as unknown as Record<string, unknown> };
  },
  byggModell: (dok) => beregn(dok.parametre),
  eksport(dok, modell) {
    const r = modell as CfResultat;
    const rode = (r.funn ?? []).filter((f) => f.niva === 'feil');
    return {
      sperret: !r.deler.length
        ? 'Figuren er tom. Start med et hode.'
        : rode.length
          ? `Rett dette først: ${rode.map((f) => f.tittel).join('; ')}. Prosjektet kan fortsatt lagres.`
          : undefined,
      merknad:
        'Filene er i printposisjon: figuren ligger på ryggen med alle ledd i null. Leddene er en prøveprofil og er ikke testprintet, så det er ikke kjent om de løsner eller tåler bruk. Figuren er ikke testet som leke.',
      stlPerDel: true,
      vedlegg: r.funn && {
        navn: 'Kontrollrapport (JSON)',
        filnavn: `${dok.navn || 'figur'}-kontrollrapport.json`,
        innhold: kontrollrapport(dok, r),
        type: 'application/json',
      },
    };
  },
};
