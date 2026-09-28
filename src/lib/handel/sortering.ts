/** Filtering and sorting of the product listing. Pure; used on server and client. */
import type { Sortering } from './katalog';

export interface Sorteringsgrunnlag {
  id: string;
  navn: string;
  kategori: string;
  prisOre: number | null;
  utvalgt: number;
  nyeste: number;
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
): string[] {
  const filtrert = kategori === 'alle' ? produkter : produkter.filter((p) => p.kategori === kategori);
  return sorter(filtrert, sortering).map((p) => p.id);
}

export function antallTekst(n: number): string {
  return n === 1 ? '1 produkt' : `${n} produkter`;
}
