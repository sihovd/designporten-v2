import { describe, expect, it } from 'vitest';
import { kronerTilOre } from '@/components/cms/Butikk';
import { brukOverstyring } from './overstyring';
import { beregnPris } from './pris';

const vase = {
  id: 'vase',
  navn: 'Vase',
  status: 'plassholder' as const,
  prisOre: null,
  kortBeskrivelse: 'En vase.',
  egenTekst: { maksTegn: 20, tilleggOre: null },
  farger: [{ id: 'hvit', navn: 'Hvit', hex: '#fff' }],
};

describe('Studio-endringer over produktdataene (overstyring.ts)', () => {
  it('lar produktet være som bygget uten endring', () => {
    expect(brukOverstyring(vase, undefined)).toBe(vase);
  });

  it('legger navn, status, pris og teksttillegg over, og beholder resten', () => {
    const p = brukOverstyring(vase, {
      navn: 'Spiralvase',
      status: 'bekreftet',
      prisOre: 24900,
      kortBeskrivelse: 'Ny tekst.',
      tilleggOre: 5000,
    });
    expect(p).toMatchObject({
      navn: 'Spiralvase',
      status: 'bekreftet',
      prisOre: 24900,
      kortBeskrivelse: 'Ny tekst.',
    });
    expect(p.egenTekst).toEqual({ maksTegn: 20, tilleggOre: 5000 });
    expect(p.farger).toBe(vase.farger);
    expect(beregnPris(p, { farge: 'hvit', materiale: 'PLA', tekst: 'Hei' })).toBe(29900);
  });

  it('ignorerer felt med feil form', () => {
    const p = brukOverstyring(
      { ...vase, prisOre: 10000 },
      {
        navn: '  ',
        status: 'solgt' as never,
        prisOre: -5,
        tilleggOre: 1.5,
      },
    );
    expect(p).toMatchObject({ navn: 'Vase', status: 'plassholder', prisOre: 10000 });
    expect(p.egenTekst).toEqual(vase.egenTekst);
  });

  it('kan fjerne en pris (null = ikke fastsatt)', () => {
    expect(brukOverstyring({ ...vase, prisOre: 10000 }, { prisOre: null }).prisOre).toBeNull();
  });

  it('gir ikke teksttillegg til et produkt uten egen tekst', () => {
    expect(brukOverstyring({ ...vase, egenTekst: null }, { tilleggOre: 5000 }).egenTekst).toBeNull();
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
