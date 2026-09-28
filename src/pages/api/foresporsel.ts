/**
 * Receives the idea form and the contact form (multipart/form-data).
 * JSON in, JSON out when the browser asks for it (enhanced form);
 * otherwise a 303 redirect to the receipt page (plain HTML form).
 */
import type { APIRoute } from 'astro';
import { lever } from '@/lib/skjema/levering';
import { tolkSkjema } from '@/components/showroom/skjema/tolk';

export const prerender = false;

function kvittering(parametre: Record<string, string>): string {
  return `/skjema/kvittering/?${new URLSearchParams(parametre).toString()}`;
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const vilJson = (request.headers.get('accept') ?? '').includes('application/json');

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    const grunn = 'Skjemaet kunne ikke leses. Prøv igjen.';
    return vilJson
      ? Response.json({ ok: false, grunn }, { status: 400 })
      : redirect(kvittering({ feil: grunn }), 303);
  }

  const tolket = await tolkSkjema(data);
  if (!tolket.ok) {
    const grunn = Object.values(tolket.feil).join(' ');
    return vilJson
      ? Response.json({ ok: false, feil: tolket.feil, grunn }, { status: 400 })
      : redirect(kvittering({ feil: grunn }), 303);
  }

  const type = tolket.innsending.type;
  // Honeypot filled in: answer like a success, deliver nothing.
  if (tolket.honningkrukke) {
    return vilJson
      ? Response.json({ ok: true, referanse: '', kanal: 'epost' })
      : redirect(kvittering({ type }), 303);
  }

  const resultat = await lever(tolket.innsending);
  if (!resultat.ok) {
    return vilJson
      ? Response.json({ ok: false, grunn: resultat.grunn }, { status: 503 })
      : redirect(kvittering({ feil: resultat.grunn }), 303);
  }

  return vilJson
    ? Response.json({ ok: true, referanse: resultat.referanse, kanal: resultat.kanal })
    : redirect(kvittering({ type, ref: resultat.referanse, kanal: resultat.kanal }), 303);
};
