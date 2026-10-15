import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { erOffentlig } from '@/components/showroom/inspirasjon/typer';
import { katalog } from '@/skaperverksted/generatorer';
import { hentProdukter, kategorierMedProdukter } from '@/lib/handel/katalog';
import { nettsti } from '@/lib/nettsti';
import { skaperverkstedApent } from '@/lib/flagg';

export const prerender = true;

const statiskeSider = [
  '/',
  '/produkter/',
  ...(skaperverkstedApent ? ['/skaperverksted/'] : []),
  '/spesialdesign/',
  '/bedrift/',
  '/inspirasjon/',
  '/om/',
  '/kontakt/',
  '/vilkar/',
  '/personvern/',
  '/frakt-og-levering/',
];

const xml = (verdi: string) =>
  verdi
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('Astro site URL is required to generate sitemap.xml.');

  const produkter = (await hentProdukter()).filter((p) => p.status === 'bekreftet');
  const artikler = await getCollection(
    'inspirasjon',
    (sak) => sak.data.status !== 'plassholder' && erOffentlig(sak.data),
  );
  const stier = [
    ...statiskeSider,
    ...kategorierMedProdukter(produkter).map((kategori) => `/produkter/kategori/${kategori.slug}/`),
    ...produkter.map((produkt) => `/produkter/${produkt.id}/`),
    ...artikler.map((sak) => `/inspirasjon/${sak.id}/`),
    ...(skaperverkstedApent ? katalog.map((generator) => `/skaperverksted/${generator.id}/`) : []),
  ];
  const url = (sti: string) => xml(new URL(nettsti(sti), site).href);
  const body = stier.map((sti) => `  <url><loc>${url(sti)}</loc></url>`).join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
