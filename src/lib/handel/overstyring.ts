/**
 * The catalogue as Studio (the CMS on the PHP build) has it now. Studio keeps
 * every product in its database and may change or add any of them after the
 * site was built. The page server (php/api/cms/side.php → php/api/_katalog.php)
 * renders the product cards and pages from it and puts every product in
 * <script type="application/json" id="dp-katalog">, with `side` naming the
 * product a product page is about. Scripts and islands read the products from
 * here, so cards, the product window, the choices and the cart all show what
 * the payment route charges.
 *
 * Without that element (the Node build, or Studio has not saved the shop)
 * every product is exactly as built.
 */
import type { ProduktVisning } from './visning';

interface Katalog {
  produkter: Record<string, ProduktVisning>;
  side: string | null;
}

let lest: Katalog | null | undefined;

/** Studio's catalogue on this page, or null when the page is as built. Read once. */
export function studioKatalog(): Katalog | null {
  if (lest !== undefined) return lest;
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('dp-katalog');
  lest = null;
  if (!el) return lest;
  try {
    const data = JSON.parse(el.textContent ?? '') as Partial<Katalog>;
    if (data && typeof data.produkter === 'object' && data.produkter) {
      lest = { produkter: data.produkter, side: typeof data.side === 'string' ? data.side : null };
    }
  } catch {
    lest = null;
  }
  return lest;
}

/** The product as the shop sells it now. */
export function medButikk<T extends ProduktVisning>(p: T): T {
  const k = studioKatalog();
  if (!k) return p;
  // The product template (src/lib/handel/mal.ts) stands for the page's own product.
  const id = p.id === '§id§' && k.side ? k.side : p.id;
  return (k.produkter[id] as T | undefined) ?? p;
}

/**
 * Every product the shop has now, given the ones the page was built with.
 * With Studio's catalogue, a product Studio removed is gone and one it added
 * is there.
 */
export function alleProdukter(bygget: Record<string, ProduktVisning>): Record<string, ProduktVisning> {
  return studioKatalog()?.produkter ?? bygget;
}

/** Only for tests: forget what was read. */
export function glemKatalog(): void {
  lest = undefined;
}
