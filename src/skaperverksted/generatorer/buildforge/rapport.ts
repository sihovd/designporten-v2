/**
 * The control report that goes with every BuildForge export (handoff §9 and
 * §12): the project revision, the exact profile version and its physical
 * status, units, each exported part with a checksum of its geometry, and
 * every finding. The files and the report come from the same build, so the
 * checksums tie them together.
 */
import type { Dokument } from '../../core/dokument';
import { finnMateriale } from '../../core/materialer';
import { avgrensning, volum } from '../../geometri/mesh';
import { evidensTekst, type BuildforgeResultat } from './bygg';
import { kontrollsum } from './parametre';
import { sikkerhetTekst, type Maal } from './profil';
import { meta } from './meta';

export const MOTORVERSJON = '0.3.0';

const rund = (v: number) => Math.round(v * 100) / 100;

export function lagRapport(dok: Dokument, r: BuildforgeResultat, laget = new Date()): object {
  const k = r.kontroll;
  const p = k.profil;
  const maal = (gruppe: Record<string, Maal>) =>
    Object.values(gruppe).map((m) => ({
      navn: m.navn,
      verdi: m.verdi,
      sikkerhet: sikkerhetTekst[m.sikkerhet],
    }));
  return {
    rapport: 'BuildForge kontrollrapport',
    rapportversjon: 1,
    laget: laget.toISOString(),
    verktoy: { id: meta.id, navn: meta.navn, versjon: MOTORVERSJON },
    prosjekt: { id: dok.id, navn: dok.navn, revisjon: k.revisjon },
    enhet: 'mm',
    eksporttype: 'Digital prototype',
    familie: k.leddprofil ? 'modul' : 'klikker',
    forbehold: k.leddprofil
      ? [
          'Leddene er ikke fysisk testet. Filene er ikke godkjent for produksjon eller salg.',
          'En grønn digital kontroll betyr ikke at produktet er trygt leketøy eller garantert printbart.',
          'Hvert ledd har klaring så de to delene det binder sammen, ikke treffer hverandre når det dreies (og for kuleledd: bøyes innenfor største bøy). Om en del treffer andre deler når den beveges, er ikke kontrollert.',
          'Delene ligger i samlet stilling. Snu og plasser dem i sliceren.',
          'Hver del består av flere lukkede skall som overlapper. Slicere slår dem sammen ved utskrift.',
        ]
      : [
          'Mekanikken er ikke fysisk testet. Filene er ikke godkjent for produksjon eller salg.',
          'En grønn digital kontroll betyr ikke at produktet er trygt leketøy eller garantert printbart.',
          'Bryteren er en innkjøpt del. Den vises bare som referanse i verktøyet og er ikke med i filene.',
          'Delene ligger i samlet stilling. Snu og plasser dem i sliceren.',
          'Hver del består av flere lukkede skall som overlapper. Slicere slår dem sammen ved utskrift.',
        ],
    profil: p
      ? {
          id: p.id,
          versjon: p.versjon,
          navn: p.navn,
          fysiskStatus: p.fysiskStatus === 'testet' ? 'Testet' : 'Ikke testet',
          merknad: p.merknad,
          mal: [
            ...maal(p.bryter),
            ...maal(p.topp),
            ...maal(p.underdel),
            ...maal({ klaring: p.klaring }),
            ...maal(p.grenser),
          ],
        }
      : null,
    leddprofil: k.leddprofil
      ? {
          id: k.leddprofil.id,
          versjon: k.leddprofil.versjon,
          navn: k.leddprofil.navn,
          fysiskStatus: k.leddprofil.fysiskStatus === 'testet' ? 'Testet' : 'Ikke testet',
          merknad: k.leddprofil.merknad,
          mal: maal(k.leddprofil.maal),
        }
      : null,
    kuleprofil: k.kuleprofil
      ? {
          id: k.kuleprofil.id,
          versjon: k.kuleprofil.versjon,
          navn: k.kuleprofil.navn,
          fysiskStatus: k.kuleprofil.fysiskStatus === 'testet' ? 'Testet' : 'Ikke testet',
          merknad: k.kuleprofil.merknad,
          mal: maal(k.kuleprofil.maal),
        }
      : null,
    deler: r.deler.map((d) => {
      const b = avgrensning(d.mesh);
      return {
        id: d.id,
        navn: d.navn,
        materiale: finnMateriale(d.materialId).navn,
        trekanter: d.mesh.indekser.length / 3,
        boks: { min: b.min.map(rund), maks: b.maks.map(rund) },
        volumSkallMm3: rund(volum(d.mesh)),
        kontrollsum: kontrollsum(
          new Uint8Array(
            d.mesh.posisjoner.buffer,
            d.mesh.posisjoner.byteOffset,
            d.mesh.posisjoner.byteLength,
          ),
        ),
      };
    }),
    kontroll: {
      status: k.status === 'gronn' ? 'Grønn' : k.status === 'gul' ? 'Gul' : 'Rød',
      klikk: k.sveip
        ? {
            resultat: k.sveip.status,
            feilgrenseMm: rund(k.sveip.feilgrense),
            vedVandringMm: k.sveip.vedVandring ?? null,
          }
        : k.leddprofil
          ? null
          : { resultat: 'ingen pynt å kontrollere; festene er kontrollert i profilen' },
      funn: k.funn.map((f) => ({
        regel: f.regel,
        niva: f.niva,
        tittel: f.tittel,
        arsak: f.arsak,
        konsekvens: f.konsekvens,
        forslag: f.forslag,
        objekter: f.objekter,
        evidens: evidensTekst[f.evidens],
      })),
      kropper: k.kropper.map((x) => ({
        kropp: x.kropp,
        massivtVolumMm3: Math.round(x.volum),
        tyngdepunkt: x.tyngdepunkt.map(rund),
        rutenettCelleMm: rund(x.celle),
      })),
    },
  };
}
