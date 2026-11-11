import { afterEach, describe, expect, it, vi } from 'vitest';
import { kronerTilOre } from '@/components/cms/Butikk';
import { alleProdukter, glemKatalog, medButikk } from './overstyring';
import type { ProduktVisning } from './visning';

const vase: ProduktVisning = {
  id: 'vase',
  navn: 'Vase',
  status: 'plassholder',
  kategori: 'interior',
  kategoriNavn: 'Interiør',
  kortBeskrivelse: 'En vase.',
  href: '/produkter/vase/',
  bilde: { src: '/vase.webp', alt: 'Vase', bredde: 900, hoyde: 900, konsept: true, midlertidig: true },
  bildeAlternativ: null,
  mal: null,
  prisOre: null,
  materialer: [{ type: 'PLA', beskrivelse: '' }],
  farger: [{ id: 'pla-kritthvit', navn: 'Kritthvit', hex: '#fff' }],
  egenTekst: { maksTegn: 20, tilleggOre: null },
  generator: null,
};

/** A page whose <script id="dp-katalog"> holds `tekst` (no DOM library needed). */
function side(tekst: string | null): void {
  glemKatalog();
  vi.stubGlobal('document', {
    getElementById: (id: string) => (id === 'dp-katalog' && tekst !== null ? { textContent: tekst } : null),
  });
}
const katalog = (data: unknown) => side(JSON.stringify(data));

afterEach(() => {
  vi.unstubAllGlobals();
  glemKatalog();
});

describe('Studio-katalogen på siden (overstyring.ts)', () => {
  it('lar produktet være som bygget uten Studio-katalog', () => {
    side(null);
    expect(medButikk(vase)).toBe(vase);
    expect(alleProdukter({ vase })).toEqual({ vase });
  });

  it('bruker produktet slik Studio har det nå', () => {
    const ny = { ...vase, navn: 'Spiralvase', status: 'bekreftet' as const, prisOre: 24900 };
    katalog({ produkter: { vase: ny }, side: null });
    expect(medButikk(vase)).toEqual(ny);
  });

  it('kjenner produkter Studio har lagt til, og glemmer dem Studio har fjernet', () => {
    const krok = { ...vase, id: 'krok', navn: 'Krok' };
    katalog({ produkter: { krok }, side: null });
    expect(Object.keys(alleProdukter({ vase }))).toEqual(['krok']);
  });

  it('lar produktmalen stå for sidens eget produkt', () => {
    const krok = { ...vase, id: 'krok', navn: 'Krok' };
    katalog({ produkter: { krok }, side: 'krok' });
    expect(medButikk({ ...vase, id: '§id§' }).navn).toBe('Krok');
    // A product the catalogue does not have stays as it was.
    expect(medButikk(vase)).toBe(vase);
  });

  it('tåler en ødelagt katalog', () => {
    side('{ikke json');
    expect(medButikk(vase)).toBe(vase);
  });
});

describe('kronefelt i Studio', () => {
  it('tar bare hele kroner', () => {
    expect(kronerTilOre('249')).toBe(24900);
    expect(kronerTilOre(' 1 249 ')).toBe(124900);
    expect(kronerTilOre('')).toBeNull();
    expect(kronerTilOre('249,50')).toBeNaN();
    expect(kronerTilOre('-1')).toBeNaN();
  });
});
