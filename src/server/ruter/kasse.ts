/**
 * Card payment (Stripe Checkout, hosted). GET tells the cart page whether card
 * payment is on; POST checks the cart against the catalogue and returns the
 * Checkout URL. Prices always come from the catalogue, never from the browser.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { bestillingSkjema, feltfeil } from '@/lib/handel/bestilling';
import { butikk } from '@/lib/handel/butikk';
import { lagKasse, stripeParametre, type Kassestatus, type Kassesvar } from '@/lib/handel/kasse';
import { tilVisning, type ProduktVisning } from '@/lib/handel/visning';
import { referanse } from '@/lib/skjema/levering';
import { harStripe, nettstedUrl, stripe } from '@/server/stripe';

export const prerender = false;

const MAKS_BYTE = 256 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function kassestatus(): Kassestatus {
  if (!butikk.betaling) return { aktiv: false, grunn: 'Kortbetaling er ikke slått på ennå.' };
  if (!harStripe()) return { aktiv: false, grunn: 'Betalingsløsningen er ikke koblet til ennå.' };
  if (butikk.frakt.length === 0) return { aktiv: false, grunn: 'Frakt er ikke satt opp ennå.' };
  return { aktiv: true };
}

export const GET: APIRoute = () => json(kassestatus());

export const POST: APIRoute = async ({ request }) => {
  const status = kassestatus();
  if (!status.aktiv) return json({ ok: false, grunn: status.grunn } satisfies Kassesvar, 503);
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return json({ ok: false, grunn: 'Forespørselen må sendes som JSON.' } satisfies Kassesvar, 415);
  }
  const raa = await request.text();
  if (raa.length > MAKS_BYTE) return json({ ok: false, grunn: 'Forespørselen er for stor.' }, 413);
  let data: unknown;
  try {
    data = JSON.parse(raa);
  } catch {
    return json({ ok: false, grunn: 'Forespørselen kunne ikke leses.' } satisfies Kassesvar, 400);
  }
  const tolket = bestillingSkjema.safeParse(data);
  if (!tolket.success) {
    return json(
      { ok: false, grunn: 'Sjekk feltene som er markert.', felt: feltfeil(tolket.error) } satisfies Kassesvar,
      400,
    );
  }
  const b = tolket.data;
  const katalog = new Map<string, ProduktVisning>(
    (await getCollection('produkter')).map((p) => [p.id, tilVisning(p.id, p.data)]),
  );
  const kasse = lagKasse(b, (id) => katalog.get(id));
  if (!kasse.ok) return json({ ok: false, grunn: kasse.grunn } satisfies Kassesvar, 400);

  const ref = referanse();
  const parametre = stripeParametre(kasse.linjer, b, butikk.frakt, nettstedUrl(request), ref);
  const okt = await stripe<{ url: string }>('POST', '/checkout/sessions', parametre, ref);
  if (!okt.ok) {
    console.error(`Stripe: kunne ikke opprette betaling (${okt.status}): ${okt.melding}`);
    return json(
      {
        ok: false,
        grunn: 'Betalingen kunne ikke startes. Prøv igjen, eller send som forespørsel.',
      } satisfies Kassesvar,
      502,
    );
  }
  return json({ ok: true, url: okt.data.url } satisfies Kassesvar);
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
