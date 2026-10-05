/**
 * Stripe webhook (POST /api/stripe/webhook/). On a paid Checkout Session the
 * order goes to Designporten's inbox through the same delivery as the forms
 * (src/lib/skjema/levering.ts). The customer's receipt is sent by Stripe.
 * Orders, refunds and disputes are handled in the Stripe dashboard.
 */
import type { APIRoute } from 'astro';
import { formaterKroner } from '@/lib/handel/kurv';
import { lever } from '@/lib/skjema/levering';
import { env, sjekkSignatur, stripe } from '@/server/stripe';

export const prerender = false;

interface Okt {
  id: string;
  payment_status: string;
  amount_total: number | null;
  client_reference_id: string | null;
  customer_details: { name?: string | null; email?: string | null; phone?: string | null } | null;
  collected_information?: { shipping_details?: Adresse | null } | null;
  shipping_details?: Adresse | null;
  shipping_cost?: { amount_total: number; shipping_rate?: string | { display_name?: string } | null } | null;
  metadata: Record<string, string>;
}

interface Adresse {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    postal_code?: string | null;
    city?: string | null;
  };
}

interface Varelinje {
  description: string | null;
  quantity: number | null;
  amount_total: number;
}

function adressetekst(a: Adresse | null | undefined): string {
  if (!a?.address) return '';
  const x = a.address;
  return [a.name, x.line1, x.line2, [x.postal_code, x.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join('\n');
}

async function meldOrdre(okt: Okt): Promise<boolean> {
  const linjer = await stripe<{ data: Varelinje[] }>(
    'GET',
    `/checkout/sessions/${okt.id}/line_items?limit=100`,
  );
  const varer =
    linjer.ok && Array.isArray(linjer.data.data)
      ? linjer.data.data.map(
          (l) => `${l.quantity ?? 1} × ${l.description ?? 'Vare'}  ${formaterKroner(l.amount_total)}`,
        )
      : ['(Varelinjene kunne ikke hentes. Se ordren i Stripe-dashbordet.)'];
  const kunde = okt.customer_details ?? {};
  const resultat = await lever({
    type: 'bestilling',
    emne: `Betalt ordre ${okt.client_reference_id ?? okt.id} fra ${okt.metadata.navn || kunde.name || 'kunde'}`,
    svarTil: kunde.email ?? undefined,
    felter: [
      ['Referanse', okt.client_reference_id ?? ''],
      ['Navn', okt.metadata.navn || kunde.name || ''],
      ['E-post', kunde.email ?? ''],
      ['Telefon', kunde.phone || okt.metadata.telefon || ''],
      ['Leveringsadresse', adressetekst(okt.collected_information?.shipping_details ?? okt.shipping_details)],
      ['Melding', okt.metadata.melding ?? ''],
      ['Varer', varer.join('\n')],
      ['Frakt', okt.shipping_cost ? formaterKroner(okt.shipping_cost.amount_total) : ''],
      ['Totalt betalt', okt.amount_total !== null ? formaterKroner(okt.amount_total) : ''],
      ['Betaling', `Betalt med kort via Stripe. Stripe-økt: ${okt.id}`],
    ],
  });
  return resultat.ok;
}

export const POST: APIRoute = async ({ request }) => {
  const hemmelighet = env('STRIPE_WEBHOOK_SECRET');
  if (!hemmelighet) return new Response('Webhook er ikke satt opp', { status: 503 });
  const payload = await request.text();
  if (!sjekkSignatur(payload, request.headers.get('stripe-signature'), hemmelighet)) {
    return new Response('Ugyldig signatur', { status: 400 });
  }
  const hendelse = JSON.parse(payload) as { type: string; data: { object: Okt } };
  if (
    (hendelse.type === 'checkout.session.completed' && hendelse.data.object.payment_status === 'paid') ||
    hendelse.type === 'checkout.session.async_payment_succeeded'
  ) {
    // A failed delivery answers 500 so Stripe tries again later.
    if (!(await meldOrdre(hendelse.data.object))) return new Response('Kunne ikke levere', { status: 500 });
  }
  return new Response('ok', { status: 200 });
};
