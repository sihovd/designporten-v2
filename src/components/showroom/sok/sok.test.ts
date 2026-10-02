import { describe, expect, it } from 'vitest';
import { normaliser, sok, type Sokepost, grupper } from './sok';

const poster: Sokepost[] = [
  { tittel: 'Spesialdesign', tekst: 'Send en skisse eller et bilde', url: '/spesialdesign/', type: 'Side' },
  { tittel: 'PLA eller PETG?', tekst: 'Materialet avgjør om delen holder', url: '/g/', type: 'Inspirasjon' },
  {
    tittel: 'Skaperverksted',
    tekst: 'Design selv i millimeter',
    url: '/s/',
    type: 'Verktøy',
    ord: 'skilt navn',
  },
  { tittel: 'Frakt og levering', tekst: 'Plassholder', url: '/f/', type: 'Side' },
];

describe('sok', () => {
  it('normalises case and accents but keeps æøå', () => {
    expect(normaliser('IDÉ Ærlig Ø Å')).toBe('ide ærlig ø å');
  });

  it('ranks title word matches above text matches', () => {
    const r = sok(poster, 'skisse spesial');
    expect(r[0]?.url).toBe('/spesialdesign/');
  });

  it('requires every word to match somewhere', () => {
    expect(sok(poster, 'petg materialet').map((p) => p.url)).toEqual(['/g/']);
    expect(sok(poster, 'petg frakt')).toEqual([]);
  });

  it('matches extra words and ignores empty queries', () => {
    expect(sok(poster, 'skilt')[0]?.url).toBe('/s/');
    expect(sok(poster, '   ')).toEqual([]);
  });

  it('finds «idé» when typing «ide»', () => {
    expect(sok([{ tittel: 'Har du en idé?', tekst: '', url: '/i/', type: 'Side' }], 'ide')).toHaveLength(1);
  });
});

describe('grupper', () => {
  it('groups results by category in a fixed order and keeps the ranking', () => {
    const treff = [
      { tittel: 'Om', tekst: '', url: '/om/', type: 'Side' },
      {
        tittel: 'Sign Forge',
        tekst: '',
        url: '/skaperverksted/signgen/',
        type: 'Verktøy',
        kategori: 'verktoy' as const,
      },
      { tittel: 'Vase', tekst: '', url: '/produkter/vase/', type: 'Produkt', kategori: 'produkter' as const },
      {
        tittel: 'Lampe',
        tekst: '',
        url: '/produkter/lampe/',
        type: 'Produkt',
        kategori: 'produkter' as const,
      },
    ];
    const g = grupper(treff);
    expect(g.map((x) => x.id)).toEqual(['produkter', 'verktoy', 'sider']);
    expect(g[0]!.treff.map((t) => t.tittel)).toEqual(['Vase', 'Lampe']);
  });
});
