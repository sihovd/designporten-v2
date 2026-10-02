/** Client-side search over the build-time index (/sok.json). Pure, tested. */

export interface Sokepost {
  tittel: string;
  tekst: string;
  url: string;
  /** Shown as a label: Side, Produkt, Inspirasjon, Verktøy. */
  type: string;
  /** Extra words that should match (categories, materials). */
  ord?: string;
  /** Which group the result is shown under. Default: sider. */
  kategori?: Sokekategori;
}

export type Sokekategori = 'produkter' | 'verktoy' | 'inspirasjon' | 'sider';

/** Result groups in the order they are shown (design revision 2026-10-02, §24). */
export const sokekategorier: { id: Sokekategori; navn: string }[] = [
  { id: 'produkter', navn: 'Produkter' },
  { id: 'verktoy', navn: 'Skaperverksted' },
  { id: 'inspirasjon', navn: 'Inspirasjon' },
  { id: 'sider', navn: 'Sider' },
];

/** Groups results by category, keeping the ranking inside each group and leaving out empty groups. */
export function grupper(treff: readonly Sokepost[]): { id: Sokekategori; navn: string; treff: Sokepost[] }[] {
  return sokekategorier
    .map((k) => ({ ...k, treff: treff.filter((t) => (t.kategori ?? 'sider') === k.id) }))
    .filter((g) => g.treff.length > 0);
}

/** Lowercase and fold accents, but keep æ, ø and å. */
export function normaliser(s: string): string {
  return [...s.toLowerCase()]
    .map((c) => ('æøå'.includes(c) ? c : c.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
    .join('');
}

export function sok(poster: readonly Sokepost[], sporring: string, maks = 30): Sokepost[] {
  const ord = normaliser(sporring).split(/\s+/).filter(Boolean);
  if (!ord.length) return [];
  const treff: { p: Sokepost; poeng: number }[] = [];
  for (const p of poster) {
    const tittel = normaliser(p.tittel);
    const resten = normaliser(`${p.tekst} ${p.ord ?? ''}`);
    let poeng = 0;
    let alle = true;
    for (const o of ord) {
      if (tittel.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(o))) poeng += 5;
      else if (tittel.includes(o)) poeng += 3;
      else if (resten.includes(o)) poeng += 1;
      else alle = false;
    }
    if (alle) treff.push({ p, poeng });
  }
  return treff
    .sort((a, b) => b.poeng - a.poeng || a.p.tittel.localeCompare(b.p.tittel, 'nb'))
    .slice(0, maks)
    .map((t) => t.p);
}
