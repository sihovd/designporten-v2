/**
 * What Studio (the CMS on the PHP build) has changed for a product after the
 * site was built: name, status, price, text surcharge and short description.
 * The page server (php/api/cms/side.php → php/api/_butikk.php) puts them in
 * <script type="application/json" id="dp-butikk"> and changes the static
 * markup itself; scripts and islands lay the same changes over the product
 * data they were built with, so cards, the product window, the choices and
 * the cart all show what the payment route charges.
 *
 * Without that element (the Node build, or nothing changed) every product is
 * returned exactly as built.
 */
import type { ProduktVisning } from './visning';

export interface Overstyring {
  navn: string;
  status: 'bekreftet' | 'plassholder';
  prisOre: number | null;
  kortBeskrivelse: string;
  tilleggOre: number | null;
}

type Produktdata = Pick<
  ProduktVisning,
  'id' | 'navn' | 'status' | 'prisOre' | 'kortBeskrivelse' | 'egenTekst'
>;

let lest: Record<string, Overstyring> | null = null;

/** The changes on this page, read once. */
export function butikkOverstyring(): Record<string, Overstyring> {
  if (lest) return lest;
  if (typeof document === 'undefined') return {};
  try {
    const data: unknown = JSON.parse(document.getElementById('dp-butikk')?.textContent ?? '{}');
    lest = data && typeof data === 'object' ? (data as Record<string, Overstyring>) : {};
  } catch {
    lest = {};
  }
  return lest;
}

/** One product with a change laid over it. Pure; fields of the wrong form keep the built value. */
export function brukOverstyring<T extends Produktdata>(p: T, o: Partial<Overstyring> | undefined): T {
  if (!o) return p;
  const ore = (v: unknown): v is number | null => v === null || (Number.isInteger(v) && (v as number) > 0);
  const tekst = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
  return {
    ...p,
    navn: tekst(o.navn) ? o.navn : p.navn,
    status: o.status === 'bekreftet' || o.status === 'plassholder' ? o.status : p.status,
    prisOre: ore(o.prisOre) ? o.prisOre : p.prisOre,
    kortBeskrivelse: tekst(o.kortBeskrivelse) ? o.kortBeskrivelse : p.kortBeskrivelse,
    egenTekst: p.egenTekst && ore(o.tilleggOre) ? { ...p.egenTekst, tilleggOre: o.tilleggOre } : p.egenTekst,
  };
}

/** The product as the shop sells it now. */
export function medButikk<T extends Produktdata>(p: T): T {
  return brukOverstyring(p, butikkOverstyring()[p.id]);
}
