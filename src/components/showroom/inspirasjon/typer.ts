import type { inspirasjonstyper } from '@/content/inspirasjon/samling';

export type Inspirasjonstype = (typeof inspirasjonstyper)[number];

/** Display names, singular and plural. */
export const typenavn: Record<Inspirasjonstype, { en: string; flere: string }> = {
  prosjekt: { en: 'Prosjekt', flere: 'Prosjekter' },
  historie: { en: 'Historie', flere: 'Historier' },
  prosess: { en: 'Prosess', flere: 'Prosess' },
  guide: { en: 'Guide', flere: 'Guider' },
  tips: { en: 'Tips', flere: 'Tips' },
  nyhet: { en: 'Nyhet', flere: 'Nyheter' },
};

/** What a public visitor may see today (no member login exists yet). */
export function erOffentlig(
  sak: { tilgang?: 'offentlig' | 'medlemmer-forst'; offentligFra?: Date },
  naa: Date = new Date(),
): boolean {
  if (!sak.tilgang || sak.tilgang === 'offentlig') return true;
  return !!sak.offentligFra && sak.offentligFra.getTime() <= naa.getTime();
}
