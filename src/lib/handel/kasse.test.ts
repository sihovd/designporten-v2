import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { sjekkSignatur } from '@/server/stripe';
import { butikkSkjema } from './butikk';
import { hvorforIkkeKort, lagKasse, stripeParametre } from './kasse';
import { tilVisning, type ProduktVisning } from './visning';

const grunn = {
  navn: 'Spiralvase',
  status: 'bekreftet' as const,
  kategori: 'interior' as const,
  kortBeskrivelse: 'Kort.',
  beskrivelse: 'Lang.',
  bilde: 'spiralvase' as const,
  mal: null,
  prisOre: 24900,
  materialer: ['PLA', 'PETG'],
  farger: ['pla-lilla', 'pla-cyan'],
  egenTekst: { maksTegn: 5, tilleggOre: 5000 },
  generator: null,
  rekkefolge: 1,
  lagtTil: new Date('2026-09-28'),
};
const katalog: Record<string, ProduktVisning> = {
  vase: tilVisning('vase', grunn),
  plass: tilVisning('plass', { ...grunn, navn: 'Plassholder', status: 'plassholder' }),
  upris: tilVisning('upris', { ...grunn, navn: 'Uten pris', prisOre: null }),
};
const finn = (id: string) => katalog[id];
const kunde = { navn: 'Ola Nordmann', epost: 'ola@example.no', telefon: '', melding: '', nettside: '' };
const linje = (
  produktId: string,
  valg: Record<string, string> = { farge: 'pla-lilla', materiale: 'PLA' },
) => ({
  produktId,
  antall: 2,
  valg,
});

describe('kasse', () => {
  it('allows card only for confirmed, priced products', () => {
    expect(hvorforIkkeKort([linje('vase')], finn)).toBeNull();
    expect(hvorforIkkeKort([linje('vase'), linje('plass')], finn)).toMatch(/ikke klart for salg/);
    expect(hvorforIkkeKort([linje('upris')], finn)).toMatch(/ingen fastsatt pris/);
    expect(hvorforIkkeKort([linje('skaperverksted-lampe')], finn)).toMatch(/forespørsel/);
    expect(hvorforIkkeKort([], finn)).toMatch(/tom/);
  });

  it('prices from the catalogue, including the text surcharge', () => {
    const k = lagKasse(
      {
        ...kunde,
        linjer: [linje('vase'), linje('vase', { farge: 'pla-cyan', materiale: 'PETG', tekst: 'Ola' })],
      },
      finn,
    );
    expect(k.ok).toBe(true);
    if (!k.ok) return;
    expect(k.linjer.map((l) => l.enhetOre)).toEqual([24900, 29900]);
    expect(k.sumOre).toBe(2 * 24900 + 2 * 29900);
    expect(k.linjer[1]?.beskrivelse).toBe('Farge: Cyan, Materiale: PETG, Tekst: «Ola»');
  });

  it('rejects unknown choices and too long text', () => {
    expect(
      lagKasse({ ...kunde, linjer: [linje('vase', { farge: 'svart', materiale: 'PLA' })] }, finn).ok,
    ).toBe(false);
    expect(
      lagKasse(
        { ...kunde, linjer: [linje('vase', { farge: 'pla-lilla', materiale: 'PLA', tekst: 'For lang' })] },
        finn,
      ).ok,
    ).toBe(false);
  });

  it('builds Checkout parameters in NOK with the shop shipping options', () => {
    const k = lagKasse({ ...kunde, linjer: [linje('vase')] }, finn);
    if (!k.ok) throw new Error(k.grunn);
    const p = stripeParametre(
      k.linjer,
      kunde,
      [{ navn: 'Henting', prisOre: 0, dagerMin: null, dagerMaks: null }],
      'https://x.no',
      'DP-1',
    );
    expect(p.get('mode')).toBe('payment');
    expect(p.get('line_items[0][price_data][unit_amount]')).toBe('24900');
    expect(p.get('line_items[0][price_data][currency]')).toBe('nok');
    expect(p.get('line_items[0][quantity]')).toBe('2');
    expect(p.get('shipping_options[0][shipping_rate_data][display_name]')).toBe('Henting');
    expect(p.get('success_url')).toBe('https://x.no/handlekurv/betalt/?okt={CHECKOUT_SESSION_ID}');
    expect(p.get('client_reference_id')).toBe('DP-1');
  });

  it('ships with card payment off and no invented shipping', async () => {
    const fil = await import('@/content/butikk/innstillinger.json');
    const b = butikkSkjema.parse(fil.default);
    expect(b.betaling).toBe(false);
    expect(b.frakt).toEqual([]);
  });
});

describe('stripe-signatur', () => {
  const hemmelighet = 'whsec_test';
  const payload = '{"type":"checkout.session.completed"}';
  const signer = (t: number) => createHmac('sha256', hemmelighet).update(`${t}.${payload}`).digest('hex');

  it('accepts a valid, fresh signature', () => {
    expect(sjekkSignatur(payload, `t=1000,v1=${signer(1000)}`, hemmelighet, 1010)).toBe(true);
  });

  it('rejects wrong, old or missing signatures', () => {
    expect(sjekkSignatur(payload, `t=1000,v1=${signer(999)}`, hemmelighet, 1010)).toBe(false);
    expect(sjekkSignatur(payload, `t=1000,v1=${signer(1000)}`, hemmelighet, 2000)).toBe(false);
    expect(sjekkSignatur(payload, null, hemmelighet)).toBe(false);
    expect(sjekkSignatur(payload + ' ', `t=1000,v1=${signer(1000)}`, hemmelighet, 1010)).toBe(false);
  });
});
