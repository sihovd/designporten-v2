import type { inspirasjonstyper } from '@/content/inspirasjon/samling';

export type Inspirasjonstype = (typeof inspirasjonstyper)[number];

/** Display names, singular and plural. */
export const typenavn: Record<Inspirasjonstype, { en: string; flere: string }> = {
  prosjekt: { en: 'Prosjekt', flere: 'Prosjekter' },
  historie: { en: 'Historie', flere: 'Historier' },
  prosess: { en: 'Prosess', flere: 'Prosess' },
  guide: { en: 'Guide', flere: 'Guider' },
};
