/**
 * Card payment through Stripe Checkout (hosted, ADR-001: no own payment
 * engine). Pure helpers shared by the cart page and the server routes:
 *  - which carts can be paid by card (confirmed products with a price only;
 *    placeholders, unpriced products and Skaperverksted designs go as requests);
 *  - the server-side check that recomputes every price from the catalogue;
 *  - the form parameters for Stripe's «create Checkout Session» call.
 */
import { erDesignlinje, type Bestilling } from './bestilling';
import type { Frakt } from './butikk';
import { beregnPris } from './pris';
import type { ProduktVisning } from './visning';

export interface Kasselinje {
  produktId: string;
  navn: string;
  /** Choices in plain words, shown under the name in Checkout and the e-mail. */
  beskrivelse: string;
  enhetOre: number;
  antall: number;
}

export type Kassekontroll = { ok: true; linjer: Kasselinje[]; sumOre: number } | { ok: false; grunn: string };

/** Why a cart cannot be paid by card, or null when it can. */
export function hvorforIkkeKort(
  linjer: { produktId: string; designId?: string; valg: Record<string, string> }[],
  finn: (id: string) => ProduktVisning | undefined,
): string | null {
  if (linjer.length === 0) return 'Handlekurven er tom.';
  for (const l of linjer) {
    if (erDesignlinje(l))
      return 'Design fra Skaperverksted prises sammen med deg, så de sendes som forespørsel.';
    const p = finn(l.produktId);
    if (!p) return 'Et produkt i handlekurven finnes ikke lenger.';
    if (p.status !== 'bekreftet') return `«${p.navn}» er ikke klart for salg ennå.`;
    if (beregnPris(p, { tekst: l.valg.tekst ?? '' }) === null) return `«${p.navn}» har ingen fastsatt pris.`;
  }
  return null;
}

/** Server check: same rules, prices from the catalogue, never from the browser. */
export function lagKasse(b: Bestilling, finn: (id: string) => ProduktVisning | undefined): Kassekontroll {
  const grunn = hvorforIkkeKort(b.linjer, finn);
  if (grunn) return { ok: false, grunn };
  const linjer: Kasselinje[] = [];
  for (const l of b.linjer) {
    const p = finn(l.produktId)!;
    const farge = p.farger.find((f) => f.id === l.valg.farge);
    const materiale = p.materialer.find((m) => m.type === l.valg.materiale);
    if (!farge || !materiale) {
      return { ok: false, grunn: `Valgene for «${p.navn}» er ikke gyldige lenger. Legg varen inn på nytt.` };
    }
    const ukjente = Object.keys(l.valg).filter((k) => !['farge', 'materiale', 'tekst'].includes(k));
    if (ukjente.length) return { ok: false, grunn: 'Handlekurven inneholder ukjente valg.' };
    const tekst = (l.valg.tekst ?? '').trim();
    if (tekst && (!p.egenTekst || tekst.length > p.egenTekst.maksTegn)) {
      return { ok: false, grunn: `Teksten for «${p.navn}» er for lang eller ikke tillatt.` };
    }
    linjer.push({
      produktId: p.id,
      navn: p.navn,
      beskrivelse: [`Farge: ${farge.navn}`, `Materiale: ${materiale.type}`, tekst && `Tekst: «${tekst}»`]
        .filter(Boolean)
        .join(', '),
      enhetOre: beregnPris(p, { tekst })!,
      antall: l.antall,
    });
  }
  return { ok: true, linjer, sumOre: linjer.reduce((s, l) => s + l.enhetOre * l.antall, 0) };
}

export interface Kassekunde {
  navn: string;
  epost: string;
  telefon: string;
  melding: string;
}

/**
 * Parameters for POST https://api.stripe.com/v1/checkout/sessions
 * (application/x-www-form-urlencoded). Prices include VAT; Norwegian addresses only.
 */
export function stripeParametre(
  linjer: Kasselinje[],
  kunde: Kassekunde,
  frakt: Frakt[],
  base: string,
  referanse: string,
): URLSearchParams {
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('locale', 'nb');
  p.set('currency', 'nok');
  p.set('customer_email', kunde.epost);
  p.set('client_reference_id', referanse);
  p.set('success_url', `${base}/handlekurv/betalt/?okt={CHECKOUT_SESSION_ID}`);
  p.set('cancel_url', `${base}/handlekurv/`);
  p.set('shipping_address_collection[allowed_countries][0]', 'NO');
  p.set('phone_number_collection[enabled]', 'true');
  p.set('metadata[referanse]', referanse);
  p.set('metadata[navn]', kunde.navn.slice(0, 500));
  if (kunde.telefon) p.set('metadata[telefon]', kunde.telefon.slice(0, 500));
  if (kunde.melding) p.set('metadata[melding]', kunde.melding.slice(0, 500));
  linjer.forEach((l, i) => {
    const k = `line_items[${i}]`;
    p.set(`${k}[quantity]`, String(l.antall));
    p.set(`${k}[price_data][currency]`, 'nok');
    p.set(`${k}[price_data][unit_amount]`, String(l.enhetOre));
    p.set(`${k}[price_data][product_data][name]`, l.navn);
    if (l.beskrivelse) p.set(`${k}[price_data][product_data][description]`, l.beskrivelse);
    p.set(`${k}[price_data][product_data][metadata][produktId]`, l.produktId);
  });
  frakt.forEach((f, i) => {
    const k = `shipping_options[${i}][shipping_rate_data]`;
    p.set(`${k}[type]`, 'fixed_amount');
    p.set(`${k}[display_name]`, f.navn);
    p.set(`${k}[fixed_amount][amount]`, String(f.prisOre));
    p.set(`${k}[fixed_amount][currency]`, 'nok');
    if (f.dagerMin && f.dagerMaks) {
      p.set(`${k}[delivery_estimate][minimum][unit]`, 'business_day');
      p.set(`${k}[delivery_estimate][minimum][value]`, String(f.dagerMin));
      p.set(`${k}[delivery_estimate][maximum][unit]`, 'business_day');
      p.set(`${k}[delivery_estimate][maximum][value]`, String(Math.max(f.dagerMin, f.dagerMaks)));
    }
  });
  return p;
}

/** What GET /api/kasse/ tells the cart page. */
export type Kassestatus = { aktiv: true } | { aktiv: false; grunn: string };

export type Kassesvar =
  { ok: true; url: string } | { ok: false; grunn: string; felt?: Record<string, string> };
