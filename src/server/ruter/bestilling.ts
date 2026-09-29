/**
 * Order requests from the cart («forespørsel» provider, ADR-001).
 * Validates, checks against the catalogue, delivers via src/lib/skjema/levering.ts.
 * No payment is taken.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { bestillingSkjema, feltfeil, type Bestillingssvar } from '@/lib/handel/bestilling';
import { lagInnsending } from '@/lib/handel/foresporsel';
import { tilVisning, type ProduktVisning } from '@/lib/handel/visning';
import { lever, referanse } from '@/lib/skjema/levering';
import { fraJson, tilJson } from '@/skaperverksted/core/dokument';

export const prerender = false;

/** Designs carry their document JSON, so allow a few megabytes. */
const MAKS_BYTE = 4 * 1024 * 1024;

function svar(data: Bestillingssvar, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return svar({ ok: false, grunn: 'Forespørselen må sendes som JSON.' }, 415);
  }
  const raa = await request.text();
  if (raa.length > MAKS_BYTE) return svar({ ok: false, grunn: 'Forespørselen er for stor.' }, 413);

  let json: unknown;
  try {
    json = JSON.parse(raa);
  } catch {
    return svar({ ok: false, grunn: 'Forespørselen kunne ikke leses.' }, 400);
  }

  const tolket = bestillingSkjema.safeParse(json);
  if (!tolket.success) {
    const felt = feltfeil(tolket.error);
    // A filled honeypot looks like success to the bot and is never delivered.
    if (felt.nettside) return svar({ ok: true, referanse: referanse(), kanal: 'epost' }, 200);
    return svar({ ok: false, grunn: 'Sjekk feltene som er markert.', felt }, 400);
  }

  const katalog = new Map<string, ProduktVisning>(
    (await getCollection('produkter')).map((p) => [p.id, tilVisning(p.id, p.data)]),
  );
  const kontroll = lagInnsending(tolket.data, {
    finnProdukt: (id) => katalog.get(id),
    sjekkDokument: (dokument, generator) => {
      try {
        const d = fraJson(JSON.stringify(dokument));
        return d.generator === generator ? tilJson(d) : null;
      } catch {
        return null;
      }
    },
  });
  if (!kontroll.ok) return svar({ ok: false, grunn: kontroll.grunn }, 400);

  const resultat = await lever(kontroll.innsending);
  if (!resultat.ok) return svar({ ok: false, grunn: resultat.grunn }, 503);
  return svar({ ok: true, referanse: resultat.referanse, kanal: resultat.kanal }, 200);
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
