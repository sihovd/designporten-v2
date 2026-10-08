/** Short answers for the help search in Sign Forge: how a task is done in the editor as it is now. */
import type { Hjelpeemne } from '../../core/generator';

export const HJELPEEMNER: Hjelpeemne[] = [
  {
    sporsmal: 'Lage et nytt lag',
    svar: 'Trykk på plussen under lagpanelet. Laget kommer rett over det valgte laget.',
    ord: 'tomt lag ny',
  },
  {
    sporsmal: 'Flytte et lag eller et omriss',
    svar: 'Dra i prikkene til venstre på raden og slipp ved streken. Slipp midt på et tekstlag for å legge det inni.',
    ord: 'rekkefølge omorganisere dra rad',
  },
  {
    sporsmal: 'Lage omriss rundt teksten',
    svar: 'Velg tekstlaget og trykk «+ Omriss», eller høyreklikk laget og velg «Nytt lag rundt teksten».',
    ord: 'underlag kant ramme',
  },
  {
    sporsmal: 'Lage hull til oppheng eller nøkkelring',
    svar: 'Velg Hull-verktøyet (H) og klikk på skiltet. Formen velger du i linjen øverst. Utenfor kanten blir hullet et øye.',
    ord: 'nøkkelring hengehull øye sirkel firkant',
  },
  {
    sporsmal: 'Justere objekter mot hverandre',
    svar: 'Velg objektene. Ikonene for venstre, midt, høyre, topp og bunn står i linjen øverst. Velg om de justeres mot utvalget, plata eller en hjelpelinje.',
    ord: 'align fordele midtstille sentrere',
  },
  {
    sporsmal: 'Flytte rundt på lerretet',
    svar: 'Hold nede mellomromstasten eller midtknappen og dra. Musehjulet zoomer.',
    ord: 'panorere zoome',
  },
  {
    sporsmal: 'Lage en hjelpelinje',
    svar: 'Dra ut fra linjalen på lerretet. Dra den tilbake for å fjerne den. Hjelpelinjer-panelet lar deg skrive inn posisjonen.',
    ord: 'guide snap',
  },
  {
    sporsmal: 'Endre størrelsen på byggeplaten',
    svar: 'Åpne Prosjektinnstillinger med tannhjulet øverst i lagpanelet, eller via Innstillinger.',
    ord: 'plate kanvas bredde dybde høyde',
  },
  {
    sporsmal: 'Bytte farger på skiltet',
    svar: 'Velg objektet eller laget og trykk på fargen i Egenskaper. Hele settet endrer du i Prosjektinnstillinger under «Endre fargeprofil».',
    ord: 'filament fargeprofil',
  },
  {
    sporsmal: 'Gi én tekst en annen farge enn resten',
    svar: 'Trykk på fargeprøven ved teksten i lagpanelet, eller velg teksten og endre fargen i Egenskaper.',
    ord: 'tekstfarge',
  },
  {
    sporsmal: 'Endre printlaghøyde',
    svar: 'Printlaghøyden står i Prosjektinnstillinger. Den brukes i forhåndsvisningen av printlagene.',
    ord: 'lagtykkelse',
  },
  {
    sporsmal: 'Bytte mellom lys og mørk modus',
    svar: 'Åpne Innstillinger i menylinjen. Der velger du også bakgrunnen i editoren.',
    ord: 'tema bakgrunn gradient farge',
  },
  {
    sporsmal: 'Laste ned 3MF eller STL',
    svar: 'Trykk «Eksporter / Bestill». 3MF tar med fargene, STL er bare formen.',
    ord: 'eksport fil last ned print',
  },
  {
    sporsmal: 'Lage mange skilt fra en CSV-fil',
    svar: 'Åpne Fil-menyen og velg «Lag skilt fra CSV …». Eller bruk «Eksporter via CSV» i eksportvinduet.',
    ord: 'navneskilt masseproduksjon excel serie',
  },
  {
    sporsmal: 'Angre og gjøre om',
    svar: 'Ctrl+Z angrer og Ctrl+Shift+Z gjør om. Knappene står øverst i menylinjen.',
    ord: 'undo redo',
  },
  {
    sporsmal: 'Tegne en kurve eller fri form',
    svar: 'Velg Penn (B). Klikk for hjørner, dra for jevne kurver. Dobbeltklikk en vektor for å redigere punktene.',
    ord: 'bezier vektor bane',
  },
  {
    sporsmal: 'Male et strøk med varierende bredde',
    svar: 'Velg Paint (F). Bredde og profil står i linjen øverst. Strøket blir en vektor du kan redigere etterpå.',
    ord: 'pensel tegne frihånd',
  },
  {
    sporsmal: 'Legge til en SVG',
    svar: 'Trykk SVG i verktøyskinnen. Har filen flere deler, velger du hvilke du vil ha og hvilken farge hver får.',
    ord: 'vektor import logo',
  },
  {
    sporsmal: 'Sette inn et dekor fra galleriet',
    svar: 'Trykk Dekor i verktøyskinnen og velg et element. Du kan også lagre egne vektorer der.',
    ord: 'ikon pynt',
  },
  {
    sporsmal: 'Endre profilen på siden av skiltet',
    svar: 'Åpne Profil-panelet. Dra punktene på kurven for å forme tverrsnittet av laget.',
    ord: 'sideprofil kant skråning tverrsnitt',
  },
  {
    sporsmal: 'Skrive inn et tall nøyaktig',
    svar: 'Klikk i tallfeltet og skriv, eller dra på skalaen under feltet. Piler opp og ned gir små steg.',
    ord: 'scrubber verdi mål',
  },
  {
    sporsmal: 'Vise eller skjule paneler',
    svar: 'Bruk Paneler-menyen i menylinjen. Panelene kan dras, dokkes og lagres som arbeidsrom.',
    ord: 'arbeidsrom layout',
  },
  {
    sporsmal: 'Lagre prosjektet',
    svar: 'Prosjektet lagres automatisk i nettleseren. Fil → «Lagre som fil» (Ctrl+S) tar vare på det som en fil.',
    ord: 'last åpne fil gjest',
  },
];
