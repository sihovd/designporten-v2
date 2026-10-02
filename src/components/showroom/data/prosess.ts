/**
 * Process timeline content. Homepage: six steps from idea to finished product
 * (design revision 2026-10-02, §6), each with its own background picture; Spesialdesign:
 * the six-step service flow (interaction-and-motion.md#steps). Test-bench
 * copy is kept where it fits; promises that need Sivert's confirmation
 * (response time, what an enquiry costs, an included reprint round, files
 * kept on the account) are left out until confirmed.
 */
import type { Prosesssteg } from '@/components/showroom/ProsessSlider.astro';
import { bakgrunner } from '@/lib/ressurser';

export const hjemmeprosess: Prosesssteg[] = [
  {
    kort: 'Idé',
    tittel: 'Idé',
    tekst:
      'Det starter med noe du vil ha, eller noe som mangler. En vase i akkurat den formen, en del som passer akkurat din hylle.',
    scene: { type: 'ingen' },
    bakgrunn: { bilde: bakgrunner.samarbeid, posisjon: '30% 50%' },
  },
  {
    kort: 'Skisse',
    tittel: 'Skisse',
    tekst:
      'Du sender en skisse, et mål eller et bilde av delen som er ødelagt. Vi svarer med hva som lar seg printe, og hva som må avklares.',
    scene: { type: 'ark', panel: 0 },
    bakgrunn: { bilde: bakgrunner.samarbeid, posisjon: '70% 60%' },
  },
  {
    kort: 'Modell',
    tittel: '3D-modell',
    tekst:
      'Vi tegner delen i CAD og viser deg modellen før noe produseres. Her velger du materiale, farge og hvor mye delen skal tåle.',
    scene: { type: 'bygg', tilstand: 'mesh' },
    bakgrunn: { bilde: bakgrunner.verksted, posisjon: '20% 45%' },
  },
  {
    kort: 'Print',
    tittel: '3D-print',
    tekst:
      'Delen printes lag for lag. Første print går til kontroll og oppmåling, og passer den ikke, justerer vi modellen og printer på nytt.',
    scene: { type: 'bygg', tilstand: 'print' },
    bakgrunn: { bilde: bakgrunner.verksted, posisjon: '75% 50%' },
  },
  {
    kort: 'Etterarbeid',
    tittel: 'Etterarbeid',
    tekst:
      'Støttemateriale fjernes, kanter pusses og delen kontrolleres mot målene før den regnes som ferdig.',
    scene: { type: 'ark', panel: 2 },
    bakgrunn: { bilde: bakgrunner.samarbeid, posisjon: '50% 40%' },
  },
  {
    kort: 'Ferdig',
    tittel: 'Ferdig produkt',
    tekst: 'Delen pakkes godt inn og sendes til deg, klar til bruk.',
    scene: { type: 'ark', panel: 3 },
    bakgrunn: { bilde: bakgrunner.verksted, posisjon: '50% 40%' },
  },
];

export const spesialprosess: Prosesssteg[] = [
  {
    kort: 'Idé',
    tittel: 'Idé',
    tekst:
      'Du forteller hva du vil ha laget. En setning holder for å begynne; bilder, skisser og mål hjelper.',
    scene: { type: 'ark', panel: 0 },
    bakgrunn: { bilde: bakgrunner.samarbeid, posisjon: '30% 50%' },
  },
  {
    kort: 'Dialog',
    tittel: 'Dialog',
    tekst: 'Vi leser forespørselen, spør om det som mangler og sier fra om hva som lar seg printe.',
    scene: { type: 'bygg', tilstand: 'kontur' },
    bakgrunn: { bilde: bakgrunner.samarbeid, posisjon: '70% 55%' },
  },
  {
    kort: 'Design',
    tittel: 'Design',
    tekst: 'Vi tegner modellen i CAD og viser den til deg før noe produseres. Du velger materiale og farge.',
    scene: { type: 'bygg', tilstand: 'mesh' },
    bakgrunn: { bilde: bakgrunner.verksted, posisjon: '20% 45%' },
  },
  {
    kort: 'Prototype',
    tittel: 'Prototype',
    tekst: 'Første eksemplar printes og kontrolleres mot målene. Passer det ikke, justerer vi modellen.',
    scene: { type: 'ark', panel: 2 },
    bakgrunn: { bilde: bakgrunner.samarbeid, posisjon: '50% 40%' },
  },
  {
    kort: 'Produksjon',
    tittel: 'Produksjon',
    tekst: 'Når modellen er godkjent, produseres ett eksemplar eller en liten serie i valgt materiale.',
    scene: { type: 'bygg', tilstand: 'print' },
    bakgrunn: { bilde: bakgrunner.verksted, posisjon: '75% 50%' },
  },
  {
    kort: 'Ferdig',
    tittel: 'Ferdig produkt',
    tekst: 'Delen kontrolleres og sendes til deg.',
    scene: { type: 'bygg', tilstand: 'objekt' },
    bakgrunn: { bilde: bakgrunner.verksted, posisjon: '50% 40%' },
  },
];
