/**
 * The commerce boundary (ADR-001). Designporten does not build its own
 * checkout or payment engine. A CommerceProvider takes the cart and either
 * hands it to a hosted checkout or, as now, sends it as an order request.
 *
 * Adding Stripe Checkout, Vipps or another hosted provider later means
 * adding a provider here (plus its server route) and switching
 * `aktivLeverandor`. Cart and pages do not change.
 */
import type { Bestilling, Bestillingssvar } from './bestilling';

export interface CommerceProvider {
  id: string;
  /** Shown to the visitor, e.g. on the submit button's help text. */
  navn: string;
  /** True only when the provider actually takes payment. */
  tarBetalt: boolean;
  /** Label for the cart's submit button. */
  sendeTekst: string;
  /** Sends the cart. A payment provider would return a redirect URL here. */
  sendBestilling(bestilling: Bestilling): Promise<Bestillingssvar>;
}

/** «Forespørsel»: the cart is sent as an order request. No payment is taken. */
export const foresporsel: CommerceProvider = {
  id: 'foresporsel',
  navn: 'Bestillingsforespørsel',
  tarBetalt: false,
  sendeTekst: 'Send bestillingsforespørsel',
  async sendBestilling(bestilling) {
    try {
      const svar = await fetch('/api/bestilling/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(bestilling),
      });
      const data = (await svar.json().catch(() => null)) as Bestillingssvar | null;
      if (data && typeof data.ok === 'boolean') return data;
      return { ok: false, grunn: 'Vi fikk ikke svar fra serveren. Prøv igjen om litt.' };
    } catch {
      return { ok: false, grunn: 'Du ser ut til å være uten nett. Prøv igjen når du er på nett igjen.' };
    }
  },
};

export const aktivLeverandor: CommerceProvider = foresporsel;
