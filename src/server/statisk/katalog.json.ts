/**
 * The catalogue facts the PHP order route checks a cart against (php build
 * only): the same data the product pages show, so nothing here is secret.
 * The Node build checks against the content collection directly.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
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
    };
  });
  return new Response(JSON.stringify({ dokumentVersjon: DOKUMENT_VERSJON, produkter }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
