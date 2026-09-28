/** Server-side access to the product catalogue (content collection). */
import { getCollection } from 'astro:content';
import { kategorier, type Kategori } from './kategorier';
import { tilVisning, type ProduktVisning } from './visning';

export type Sortering = 'utvalgt' | 'nyeste' | 'pris' | 'navn';

export async function hentProdukter(): Promise<ProduktVisning[]> {
  const alle = await getCollection('produkter');
  return alle
    .sort((a, b) => a.data.rekkefolge - b.data.rekkefolge || a.data.navn.localeCompare(b.data.navn, 'nb'))
    .map((p) => tilVisning(p.id, p.data));
}

/** Sort keys per product, embedded in the listing for client-side sorting. */
export async function sorteringsnokler(): Promise<Record<string, { utvalgt: number; nyeste: number }>> {
  const alle = await getCollection('produkter');
  return Object.fromEntries(
    alle.map((p) => [p.id, { utvalgt: p.data.rekkefolge, nyeste: p.data.lagtTil.getTime() }]),
  );
}

/** Categories that have at least one product, in the spec's order. */
export function kategorierMedProdukter(produkter: ProduktVisning[]): Kategori[] {
  return kategorier.filter((k) => produkter.some((p) => p.kategori === k.slug));
}

/**
 * Sort options that mean something for this data. «Pris» needs at least two
 * priced products and «Nyeste» at least two different dates; otherwise they
 * are left out rather than shown doing nothing.
 */
export function tilgjengeligeSorteringer(
  produkter: ProduktVisning[],
  nokler: Record<string, { nyeste: number }>,
): { verdi: Sortering; navn: string }[] {
  const ut: { verdi: Sortering; navn: string }[] = [{ verdi: 'utvalgt', navn: 'Utvalgt' }];
  const datoer = new Set(produkter.map((p) => nokler[p.id]?.nyeste));
  if (datoer.size > 1) ut.push({ verdi: 'nyeste', navn: 'Nyeste' });
  if (produkter.filter((p) => p.prisOre !== null).length > 1) ut.push({ verdi: 'pris', navn: 'Pris' });
  ut.push({ verdi: 'navn', navn: 'Navn A–Å' });
  return ut;
}
