import { nettsti } from '@/lib/nettsti';
/**
 * Product categories. Source: docs/content/information-architecture.md#produkter.
 * A category with no products is not shown in the filter row; it appears as
 * soon as a product uses it. «Spesialbestillinger» never lists products: it
 * links into Spesialdesign.
 */

export const kategoriSlugger = ['personlige-gaver', 'interior', 'figurer', 'tilbehor', 'bedrift'] as const;

export type KategoriSlug = (typeof kategoriSlugger)[number];

export interface Kategori {
  slug: KategoriSlug;
  navn: string;
  /** One line for the category page intro and meta description. */
  ingress: string;
}

export const kategorier: readonly Kategori[] = [
  {
    slug: 'personlige-gaver',
    navn: 'Personlige gaver',
    ingress: 'Ting med navn, tekst eller en detalj som bare passer én person.',
  },
  { slug: 'interior', navn: 'Interiør', ingress: 'Vaser, potter, lamper og ting som skal stå fremme.' },
  { slug: 'figurer', navn: 'Figurer', ingress: 'Figurer og små skulpturer, printet i lag.' },
  { slug: 'tilbehor', navn: 'Tilbehør', ingress: 'Små deler som gjør hverdagen ryddigere.' },
  { slug: 'bedrift', navn: 'Bedrift', ingress: 'Skilt, profilprodukter og deler for bedrifter.' },
];

/** The sixth category: a link into Spesialdesign, not a product list. */
export const spesialbestillinger = {
  navn: 'Spesialbestillinger',
  href: nettsti('/spesialdesign/'),
} as const;

export function finnKategori(slug: string): Kategori | undefined {
  return kategorier.find((k) => k.slug === slug);
}
