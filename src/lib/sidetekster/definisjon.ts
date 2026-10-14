/**
 * Page texts: the words on the showroom pages, kept in one JSON file per page
 * (src/content/sider/<side>.json) so they can be edited in two places that
 * share one truth: the content editor at /admin and inline on the page itself
 * (src/scripts/redigering.ts). This file describes every field once; the
 * editor's form, the build's validation and the tests are all generated from
 * it.
 *
 * Only words live here. Links, pictures, prices and anything a rule depends
 * on stay in code.
 */

export type Felt =
  /** One line or one paragraph of plain text. `lang` gives a bigger box in /admin. */
  | { type: 'tekst'; etikett: string; hint?: string; lang?: boolean; valgfri?: boolean }
  | { type: 'gruppe'; etikett: string; felt: Record<string, Felt> }
  | {
      type: 'liste';
      etikett: string;
      entall: string;
      felt: Record<string, Felt>;
      min?: number;
      max?: number;
      /** Field shown in the list summary in /admin. */
      sammendrag: string;
    };

const linje = (etikett: string, hint?: string): Felt => ({ type: 'tekst', etikett, hint });
const avsnitt = (etikett: string, hint?: string): Felt => ({ type: 'tekst', etikett, hint, lang: true });
const gruppe = (etikett: string, felt: Record<string, Felt>): Felt => ({ type: 'gruppe', etikett, felt });

/** Search engine title and description: edited in /admin only (not visible on the page). */
const meta = gruppe('Søkemotorer og deling', {
  tittel: linje('Sidetittel', 'Vises i fanen og i søkeresultater.'),
  beskrivelse: avsnitt('Beskrivelse', 'Én eller to setninger, helst under 160 tegn.'),
});

/** Image hero (BildeHelt) and page opening (SideHode). */
const helt = (medKnapp = 0) =>
  gruppe('Toppen av siden', {
    etikett: linje('Liten etikett over tittelen'),
    tittel: linje('Tittel'),
    ingress: avsnitt('Ingress'),
    ...Object.fromEntries(
      Array.from({ length: medKnapp }, (_, i) => [`knapp${i + 1}`, linje(`Knapp ${i + 1}`)]),
    ),
  });

export interface Side {
  etikett: string;
  /** Path on the site, for the «Se siden» link in /admin. */
  sti: string;
  felt: Record<string, Felt>;
}

export const sider = {
  forside: {
    etikett: 'Forsiden',
    sti: '/',
    felt: {
      meta,
      helt: helt(2),
      populaere: gruppe('Populære produkter', {
        etikett: linje('Liten etikett'),
        tittel: linje('Tittel'),
        lenke: linje('Lenke til hele utvalget'),
      }),
      snarveier: {
        type: 'liste',
        etikett: 'Snarveier',
        entall: 'Snarvei',
        min: 3,
        max: 3,
        sammendrag: 'tittel',
        felt: { etikett: linje('Liten etikett'), tittel: linje('Tittel'), tekst: linje('Tekst') },
      },
      prosess: gruppe('Prosessen', { etikett: linje('Liten etikett'), tittel: linje('Tittel') }),
      portal: gruppe('Skaperverksted', {
        etikett: linje('Liten etikett'),
        tittel: linje('Tittel'),
        ingress: avsnitt('Ingress'),
        knapp: linje('Knapp'),
      }),
    },
  },
  om: {
    etikett: 'Om Designporten',
    sti: '/om/',
    felt: {
      meta,
      topp: gruppe('Toppen av siden', {
        etikett: linje('Liten etikett'),
        tittel: linje('Tittel'),
        ingress: avsnitt('Ingress'),
      }),
      historie: {
        type: 'liste',
        etikett: 'Historien',
        entall: 'Avsnitt',
        min: 1,
        max: 8,
        sammendrag: 'tekst',
        felt: { tekst: avsnitt('Avsnitt', 'Det første avsnittet vises med stor skrift.') },
      },
      profil: gruppe('Personen bak', {
        etikett: linje('Liten etikett'),
        tittel: linje('Navn'),
        avsnitt1: avsnitt('Avsnitt 1'),
        avsnitt2: avsnitt('Avsnitt 2'),
        knapp1: linje('Knapp 1'),
        knapp2: linje('Knapp 2'),
      }),
      lager: gruppe('Det vi lager', {
        etikett: linje('Liten etikett'),
        tittel: linje('Tittel'),
        punkter: {
          type: 'liste',
          etikett: 'Punkter',
          entall: 'Punkt',
          min: 1,
          max: 8,
          sammendrag: 'navn',
          felt: { navn: linje('Navn'), tekst: linje('Tekst') },
        },
      }),
    },
  },
  spesialdesign: {
    etikett: 'Spesialdesign',
    sti: '/spesialdesign/',
    felt: {
      meta,
      helt: helt(),
      innganger: gruppe('Hvem er du?', {
        tittel: linje('Tittel'),
        privat: gruppe('Privatkunde', {
          etikett: linje('Liten etikett'),
          tittel: linje('Tittel'),
          tekst: avsnitt('Tekst'),
          knapp: linje('Knapp'),
        }),
        bedrift: gruppe('Bedriftskunde', {
          etikett: linje('Liten etikett'),
          tittel: linje('Tittel'),
          tekst: avsnitt('Tekst'),
          knapp: linje('Knapp'),
        }),
        merknad: avsnitt('Merknad under kortene', 'Lenken «for bedrifter» legges til etter teksten.'),
      }),
      prosess: gruppe('Prosessen', { etikett: linje('Liten etikett'), tittel: linje('Tittel') }),
    },
  },
  bedrift: {
    etikett: 'For bedrifter',
    sti: '/bedrift/',
    felt: {
      meta,
      helt: helt(1),
      tjenester: gruppe('Tjenester', {
        etikett: linje('Liten etikett'),
        tittel: linje('Tittel'),
        sendEtikett: linje('Etikett foran «send oss»'),
        liste: {
          type: 'liste',
          etikett: 'Tjenester',
          entall: 'Tjeneste',
          min: 1,
          max: 12,
          sammendrag: 'navn',
          felt: {
            navn: linje('Navn'),
            tekst: avsnitt('Tekst'),
            send: avsnitt('Hva de bør sende oss'),
          },
        },
      }),
      avslutning: gruppe('Avslutning', {
        tittel: linje('Tittel'),
        tekst: avsnitt('Tekst'),
        knapp: linje('Knapp'),
      }),
    },
  },
  kontakt: {
    etikett: 'Kontakt',
    sti: '/kontakt/',
    felt: {
      meta,
      helt: helt(),
      skjema: gruppe('Boksen ved siden av skjemaet', {
        etikett: linje('Liten etikett'),
        tekst: avsnitt('Tekst'),
        lenke: linje('Lenke'),
      }),
    },
  },
} satisfies Record<string, Side>;

export type SideId = keyof typeof sider;
export const sideIder = Object.keys(sider) as SideId[];

/** Where a page's texts live in the repository. */
export const sideFil = (id: SideId) => `src/content/sider/${id}.json`;
