import { describe, expect, it } from 'vitest';
import { bestillingSkjema } from './bestilling';
import { lagInnsending } from './foresporsel';
import { beregnPris, valgTilPoster } from './pris';
import { antallAktiveFilter, antallTekst, sorter, utvalgFor, type Sorteringsgrunnlag } from './sortering';
import { formaterMal, tilVisning, type ProduktVisning } from './visning';

const data = {
  navn: 'Nøkkelring med navn',
  status: 'plassholder' as const,
  kategori: 'personlige-gaver' as const,
  kortBeskrivelse: 'Kort.',
  beskrivelse: 'Lang.',
  bilde: 'nokkelring' as const,
  mal: null,
  prisOre: null,
  materialer: ['PLA', 'PETG'],
  farger: ['pla-lilla', 'pla-cyan'],
  egenTekst: { maksTegn: 5, tilleggOre: null },
  generator: null,
  rekkefolge: 1,
  lagtTil: new Date('2026-09-28'),
};

describe('visning', () => {
  it('builds a client view from content data', () => {
    const v = tilVisning('nokkelring', data);
    expect(v.href).toBe('/produkter/nokkelring/');
    expect(v.kategoriNavn).toBe('Personlige gaver');
    expect(v.farger.map((f) => f.navn)).toEqual(['Lilla', 'Cyan']);
    expect(v.materialer[1]?.type).toBe('PETG');
    expect(v.bilde.konsept).toBe(true);
  });

  it('formats dimensions or returns null', () => {
    expect(formaterMal(null)).toBeNull();
    expect(formaterMal({ bredde: 120, dybde: 80.5, hoyde: 45 })).toBe('120 × 80,5 × 45 mm');
  });
});

describe('pris', () => {
  it('never invents a price', () => {
    expect(beregnPris({ prisOre: null, egenTekst: null }, {})).toBeNull();
    expect(beregnPris({ prisOre: 24900, egenTekst: null }, {})).toBe(24900);
  });

  it('adds the declared text surcharge, or gives no price when it is not set', () => {
    expect(
      beregnPris({ prisOre: 10000, egenTekst: { maksTegn: 10, tilleggOre: 4900 } }, { tekst: 'Ola' }),
    ).toBe(14900);
    expect(
      beregnPris({ prisOre: 10000, egenTekst: { maksTegn: 10, tilleggOre: null } }, { tekst: 'Ola' }),
    ).toBeNull();
    expect(
      beregnPris({ prisOre: 10000, egenTekst: { maksTegn: 10, tilleggOre: null } }, { tekst: '  ' }),
    ).toBe(10000);
  });

  it('leaves empty text out of the cart choices', () => {
    expect(valgTilPoster({ farge: 'a', materiale: 'PLA', tekst: ' ' })).toEqual({
      farge: 'a',
      materiale: 'PLA',
    });
    expect(valgTilPoster({ farge: 'a', materiale: 'PLA', tekst: ' Ola ' }).tekst).toBe('Ola');
  });
});

describe('sortering', () => {
  const liste: Sorteringsgrunnlag[] = [
    { id: 'a', navn: 'Østlig', kategori: 'x', prisOre: null, utvalgt: 1, nyeste: 1 },
    { id: 'b', navn: 'Alfa', kategori: 'y', prisOre: 500, utvalgt: 2, nyeste: 3 },
    { id: 'c', navn: 'Beta', kategori: 'x', prisOre: 200, utvalgt: 3, nyeste: 2 },
  ];

  it('sorts by featured, newest, price and Norwegian name order', () => {
    expect(sorter(liste, 'utvalgt').map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(sorter(liste, 'nyeste').map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(sorter(liste, 'pris').map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(sorter(liste, 'navn').map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('filters by category', () => {
    expect(utvalgFor(liste, 'x', 'utvalgt')).toEqual(['a', 'c']);
    expect(utvalgFor(liste, 'alle', 'utvalgt')).toHaveLength(3);
    expect(antallTekst(1)).toBe('1 produkt');
  });

  it('filters by colour, material and own text inside the category', () => {
    const f: Sorteringsgrunnlag[] = [
      {
        id: 'a',
        navn: 'A',
        kategori: 'x',
        prisOre: null,
        utvalgt: 1,
        nyeste: 0,
        farger: ['hvit'],
        materialer: ['PLA'],
      },
      {
        id: 'b',
        navn: 'B',
        kategori: 'x',
        prisOre: null,
        utvalgt: 2,
        nyeste: 0,
        farger: ['svart'],
        materialer: ['PETG'],
        egenTekst: true,
      },
      {
        id: 'c',
        navn: 'C',
        kategori: 'y',
        prisOre: null,
        utvalgt: 3,
        nyeste: 0,
        farger: ['hvit', 'svart'],
        materialer: ['PLA', 'PETG'],
      },
    ];
    expect(utvalgFor(f, 'alle', 'utvalgt', { farger: ['hvit'], materialer: [], egenTekst: false })).toEqual([
      'a',
      'c',
    ]);
    expect(
      utvalgFor(f, 'x', 'utvalgt', { farger: ['hvit', 'svart'], materialer: ['PETG'], egenTekst: false }),
    ).toEqual(['b']);
    expect(utvalgFor(f, 'alle', 'utvalgt', { farger: [], materialer: [], egenTekst: true })).toEqual(['b']);
    expect(antallAktiveFilter({ farger: ['a', 'b'], materialer: ['PLA'], egenTekst: true })).toBe(4);
  });
});

describe('bestilling', () => {
  const gyldig = {
    navn: 'Kari',
    epost: 'kari@example.com',
    linjer: [
      { produktId: 'nokkelring', antall: 2, valg: { farge: 'pla-cyan', materiale: 'PETG', tekst: 'Kari' } },
    ],
  };
  const katalog = new Map<string, ProduktVisning>([['nokkelring', tilVisning('nokkelring', data)]]);
  const oppslag = {
    finnProdukt: (id: string) => katalog.get(id),
    sjekkDokument: (d: unknown, generator: string) =>
      (d as { generator?: string })?.generator === generator ? JSON.stringify(d) : null,
  };

  it('validates the request', () => {
    expect(bestillingSkjema.safeParse(gyldig).success).toBe(true);
    expect(bestillingSkjema.safeParse({ ...gyldig, epost: 'nei' }).success).toBe(false);
    expect(bestillingSkjema.safeParse({ ...gyldig, linjer: [] }).success).toBe(false);
    expect(bestillingSkjema.safeParse({ ...gyldig, nettside: 'spam' }).success).toBe(false);
  });

  it('turns a valid cart into an order request that says no payment is taken', () => {
    const k = lagInnsending(bestillingSkjema.parse(gyldig), oppslag);
    expect(k.ok).toBe(true);
    if (!k.ok) return;
    const felter = Object.fromEntries(k.innsending.felter);
    expect(k.innsending.type).toBe('bestilling');
    expect(felter.Varer).toContain('2 × Nøkkelring med navn');
    expect(felter.Varer).toContain('Farge: Cyan');
    expect(felter.Varer).toContain('pris ikke fastsatt');
    expect(felter.Betaling).toContain('Ingen betaling');
  });

  it('rejects unknown products, invalid choices and too long text', () => {
    const b = bestillingSkjema.parse(gyldig);
    const finn = oppslag;
    expect(lagInnsending({ ...b, linjer: [{ ...b.linjer[0]!, produktId: 'borte' }] }, finn).ok).toBe(false);
    expect(
      lagInnsending({ ...b, linjer: [{ ...b.linjer[0]!, valg: { farge: 'x', materiale: 'PLA' } }] }, finn).ok,
    ).toBe(false);
    expect(
      lagInnsending(
        {
          ...b,
          linjer: [{ ...b.linjer[0]!, valg: { farge: 'pla-cyan', materiale: 'PLA', tekst: 'Altfor lang' } }],
        },
        finn,
      ).ok,
    ).toBe(false);
  });

  const designlinje = {
    produktId: 'skaperverksted-signgen',
    navn: 'Skilt fra Sign Forge: Dør',
    antall: 1,
    valg: { Mål: '160 × 45 × 6 mm', Lag: '2' },
    design: {
      id: 'design_abc123',
      generator: 'signgen',
      navn: 'Dør',
      sammendrag: ['Mål: 160 × 45 × 6 mm'],
      dokument: { generator: 'signgen', lag: [] },
    },
  };

  it('sends Skaperverksted designs as «pris avtales» with the document attached', () => {
    const k = lagInnsending(bestillingSkjema.parse({ ...gyldig, linjer: [designlinje] }), oppslag);
    expect(k.ok).toBe(true);
    if (!k.ok) return;
    const felter = Object.fromEntries(k.innsending.felter);
    expect(felter.Varer).toContain('Skilt fra Sign Forge: Dør [Skaperverksted: signgen, pris avtales]');
    expect(felter.Varer).toContain('Mål: 160 × 45 × 6 mm');
    expect(felter.Sum).toContain('pris avtales');
    expect(k.innsending.vedlegg?.[0]?.filnavn).toBe('design-design_abc123.json');
  });

  it('rejects a design line without a valid design', () => {
    const { design: _d, ...utenDesign } = designlinje;
    expect(lagInnsending(bestillingSkjema.parse({ ...gyldig, linjer: [utenDesign] }), oppslag).ok).toBe(
      false,
    );
    const feilGenerator = {
      ...designlinje,
      design: { ...designlinje.design, dokument: { generator: 'lampe' } },
    };
    expect(lagInnsending(bestillingSkjema.parse({ ...gyldig, linjer: [feilGenerator] }), oppslag).ok).toBe(
      false,
    );
  });
});
