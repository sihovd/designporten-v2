/**
 * Company details verified in Brreg on 2026-10-14 at Sivert's request.
 * The contact mailbox exists in the authenticated one.com control panel.
 * Phone and opening hours remain unset until confirmed.
 */
export const kontakt: {
  epost: string | null;
  telefon: string | null;
  apningstider: string | null;
} = {
  epost: 'kontakt@designporten.no',
  telefon: null,
  apningstider: null,
};

export const virksomhet = {
  navn: 'Designporten Hovde',
  organisasjonsnummer: '835792552',
  organisasjonsnummerVisning: '835 792 552',
  adresse: 'Nyveien 1457',
  poststed: '1960 Løken',
  kilde: 'https://virksomhet.brreg.no/nb/oppslag/enheter/835792552',
} as const;
