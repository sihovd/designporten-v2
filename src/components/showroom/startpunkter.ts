/**
 * The four ways to start a special order (information-architecture.md
 * #spesialdesign-and-the-idea-form). Shared by the idea band, the
 * Spesialdesign page and the idea form, which emphasises the right fields.
 */
export type Startpunkt = 'ide' | 'tegning' | 'modell' | 'del';

export interface Startvalg {
  id: Startpunkt;
  tittel: string;
  kort: string;
  tekst: string;
  /** Example text in the description field for this start. */
  eksempel: string;
}

export const startpunkter: readonly Startvalg[] = [
  {
    id: 'ide',
    tittel: 'Jeg har en idé',
    kort: 'Idé',
    tekst: 'Beskriv hva du vil ha, og hva det skal brukes til. En setning holder for å begynne.',
    eksempel: 'For eksempel: en holder til tre plantestiklinger som kan stå i vinduskarmen.',
  },
  {
    id: 'tegning',
    tittel: 'Jeg har en tegning eller et bilde',
    kort: 'Tegning eller bilde',
    tekst: 'Last opp skissen, bildet eller et skjermbilde av noe som ligner.',
    eksempel: 'For eksempel: skissen viser en lampeskjerm, omtrent 20 cm høy, i hvit PLA.',
  },
  {
    id: 'modell',
    tittel: 'Jeg har en 3D-modell',
    kort: '3D-modell',
    tekst: 'Send STL, 3MF, STEP eller OBJ. Vi ser på om den lar seg printe som den er.',
    eksempel: 'For eksempel: filen er en brakett jeg har tegnet selv, og jeg trenger fire stykker.',
  },
  {
    id: 'del',
    tittel: 'Jeg trenger en del',
    kort: 'Ødelagt del',
    tekst: 'Noe har gått i stykker? Send bilder av delen og målene du har.',
    eksempel: 'For eksempel: klipsen på oppvaskmaskinkurven har knekt. Bilder og mål er vedlagt.',
  },
];

export function erStartpunkt(v: unknown): v is Startpunkt {
  return startpunkter.some((s) => s.id === v);
}
