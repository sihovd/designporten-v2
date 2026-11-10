/**
 * The catalogue facts the PHP order and payment routes check a cart against
 * (php build only): the same data the product pages show, plus the shop
 * settings (card payment switch, shipping), so nothing here is secret.
 * Studio (the CMS) shows these as the build's values and lays its own changes
 * over them (php/api/_butikk.php). The Node build checks against the content
 * collection directly.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { butikk } from '@/lib/handel/butikk';
import { tilVisning } from '@/lib/handel/visning';
import { DOKUMENT_VERSJON } from '@/skaperverksted/core/dokument';

export const prerender = true;

export const GET: APIRoute = async () => {
  const produkter = (await getCollection('produkter')).map((p) => {
    const v = tilVisning(p.id, p.data);
    return {
      id: v.id,
      navn: v.navn,
      status: v.status,
      prisOre: v.prisOre,
      farger: v.farger.map((f) => ({ id: f.id, navn: f.navn })),
      materialer: v.materialer.map((m) => m.type),
      egenTekst: v.egenTekst,
      kortBeskrivelse: v.kortBeskrivelse,
      beskrivelse: p.data.beskrivelse.trim() || v.kortBeskrivelse,
      kategoriNavn: v.kategoriNavn,
      bilde: v.bilde.src,
      href: v.href,
    };
  });
  return new Response(JSON.stringify({ dokumentVersjon: DOKUMENT_VERSJON, produkter, butikk }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
