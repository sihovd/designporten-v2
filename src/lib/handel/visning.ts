/**
 * The serialisable view of a product that client code (card capsule,
 * product window, cart page) receives. Built on the server from the content
 * collection; pure, so it can be tested without Astro.
 */
import type { ProduktData } from '@/content/produkter/samling';
import { utklippbilder, type Bilde } from '@/lib/ressurser';
import { materialer, materialtyper, type Materialtype } from '@/skaperverksted/core/materialer';
import { finnKategori } from './kategorier';

export interface FargeValg {
  id: string;
  navn: string;
  hex: string;
}

export interface MaterialValg {
  type: string;
  beskrivelse: string;
}

export interface ProduktVisning {
  id: string;
  navn: string;
  status: 'bekreftet' | 'plassholder';
  kategori: string;
  kategoriNavn: string;
  kortBeskrivelse: string;
  href: string;
  bilde: Bilde;
  bildeAlternativ: Bilde | null;
  mal: { bredde: number; dybde: number; hoyde: number } | null;
  prisOre: number | null;
  materialer: MaterialValg[];
  farger: FargeValg[];
  egenTekst: { maksTegn: number; tilleggOre: number | null } | null;
  generator: string | null;
}

export function produktHref(id: string): string {
  return `/produkter/${id}/`;
}

export function tilVisning(id: string, d: ProduktData): ProduktVisning {
  return {
    id,
    navn: d.navn,
    status: d.status,
    kategori: d.kategori,
    kategoriNavn: finnKategori(d.kategori)?.navn ?? d.kategori,
    kortBeskrivelse: d.kortBeskrivelse,
    href: produktHref(id),
    bilde: utklippbilder[d.bilde],
    bildeAlternativ: d.bildeAlternativ ? utklippbilder[d.bildeAlternativ] : null,
    mal: d.mal,
    prisOre: d.prisOre,
    materialer: d.materialer.map((t) => ({
      type: t,
      beskrivelse: materialtyper[t as Materialtype]?.beskrivelse ?? '',
    })),
    farger: d.farger.flatMap((fid) => {
      const m = materialer.find((x) => x.id === fid);
      return m ? [{ id: m.id, navn: m.navn, hex: m.hex }] : [];
    }),
    egenTekst: d.egenTekst,
    generator: d.generator,
  };
}

/** «120 × 80 × 45 mm» (width × depth × height), or null while not fixed. */
export function formaterMal(mal: ProduktVisning['mal']): string | null {
  if (!mal) return null;
  const f = (n: number) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(n);
  return `${f(mal.bredde)} × ${f(mal.dybde)} × ${f(mal.hoyde)} mm`;
}
