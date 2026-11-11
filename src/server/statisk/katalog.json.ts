/**
 * The catalogue as the build has it (php build only): the products from
 * src/content/produkter, the shop settings (card payment switch, shipping)
 * and the lists a product may choose from (colours, material types,
 * categories, Skaperverksted tools). Nothing here is secret.
 *
 * On one.com this is only the starting point: Studio (the CMS) keeps the
 * whole catalogue in its database and can change or add any product without
 * a new build (php/api/_katalog.php). Payment, order requests and the pages
 * all read the catalogue from there. The Node build checks against the
 * content collection directly.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { butikk } from '@/lib/handel/butikk';
import { kategorier } from '@/lib/handel/kategorier';
import { tilVisning } from '@/lib/handel/visning';
import { DOKUMENT_VERSJON } from '@/skaperverksted/core/dokument';
import { materialer, materialtyper } from '@/skaperverksted/core/materialer';
import { katalog as generatorer } from '@/skaperverksted/generatorer';

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
      kategori: v.kategori,
      kategoriNavn: v.kategoriNavn,
      // The pictures as the build has them; Studio may pick others from its media library.
      bilde: v.bilde.src,
      bildeData: v.bilde,
      bildeAlternativ: v.bildeAlternativ,
      mal: v.mal,
      generator: v.generator,
      rekkefolge: p.data.rekkefolge,
      lagtTil: p.data.lagtTil.toISOString().slice(0, 10),
      href: v.href,
    };
  });
  const referanse = {
    farger: materialer.map((m) => ({ id: m.id, navn: m.navn, hex: m.hex, type: m.type })),
    materialtyper: Object.values(materialtyper).map((m) => ({ type: m.type, beskrivelse: m.beskrivelse })),
    kategorier: kategorier.map((k) => ({ slug: k.slug, navn: k.navn, ingress: k.ingress })),
    generatorer: generatorer.map((g) => ({ id: g.id, navn: g.navn })),
  };
  return new Response(JSON.stringify({ dokumentVersjon: DOKUMENT_VERSJON, produkter, butikk, referanse }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
