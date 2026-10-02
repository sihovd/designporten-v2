/** Filtering and sorting of the product listing. Pure; used on server and client. */
import type { Sortering } from './katalog';

export interface Sorteringsgrunnlag {
  id: string;
  navn: string;
  kategori: string;
  prisOre: number | null;
  utvalgt: number;
  nyeste: number;
  /** Colour ids the product comes in (filter). */
  farger?: readonly string[];
  /** Material types (filter). */
  materialer?: readonly string[];
  /** Can carry the customer's own text (filter). */
  egenTekst?: boolean;
}

/** Filters beyond the category. Empty lists mean «no limit». */
export interface Filter {
  farger: readonly string[];
  materialer: readonly string[];
  egenTekst: boolean;
}

export const tomtFilter: Filter = { farger: [], materialer: [], egenTekst: false };

export function antallAktiveFilter(f: Filter): number {
  return f.farger.length + f.materialer.length + (f.egenTekst ? 1 : 0);
}

/** A product matches when it has at least one chosen colour and one chosen material. */
export function passerFilter(p: Sorteringsgrunnlag, f: Filter): boolean {
  if (f.farger.length && !f.farger.some((id) => p.farger?.includes(id))) return false;
  if (f.materialer.length && !f.materialer.some((m) => p.materialer?.includes(m))) return false;
  if (f.egenTekst && !p.egenTekst) return false;
  return true;
}

const navnSammenlign = new Intl.Collator('nb', { sensitivity: 'base' }).compare;

export function sorter<T extends Sorteringsgrunnlag>(produkter: readonly T[], sortering: Sortering): T[] {
  const liste = [...produkter];
  switch (sortering) {
    case 'navn':
      return liste.sort((a, b) => navnSammenlign(a.navn, b.navn));
    case 'nyeste':
      return liste.sort((a, b) => b.nyeste - a.nyeste || a.utvalgt - b.utvalgt);
    case 'pris':
      // Unpriced products go last, never first as if they were free.
      return liste.sort((a, b) => {
        if (a.prisOre === null && b.prisOre === null) return a.utvalgt - b.utvalgt;
        if (a.prisOre === null) return 1;
        if (b.prisOre === null) return -1;
        return a.prisOre - b.prisOre || a.utvalgt - b.utvalgt;
      });
    default:
      return liste.sort((a, b) => a.utvalgt - b.utvalgt || navnSammenlign(a.navn, b.navn));
  }
}

/** Ids to show, in order, for a category ('alle' = every category). */
export function utvalgFor<T extends Sorteringsgrunnlag>(
  produkter: readonly T[],
  kategori: string,
  sortering: Sortering,
  filter: Filter = tomtFilter,
): string[] {
  const filtrert = produkter.filter(
    (p) => (kategori === 'alle' || p.kategori === kategori) && passerFilter(p, filter),
  );
  return sorter(filtrert, sortering).map((p) => p.id);
}

export function antallTekst(n: number): string {
  return n === 1 ? '1 produkt' : `${n} produkter`;
}
