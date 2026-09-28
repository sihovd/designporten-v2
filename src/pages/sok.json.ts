/** Build-time search index for /sok/: pages, products, inspiration and tools. */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import type { Sokepost } from '@/components/showroom/sok/sok';
import { typenavn } from '@/components/showroom/inspirasjon/typer';

export const prerender = true;

const sider: Sokepost[] = [
  {
    tittel: 'Produkter',
    tekst: 'Ferdige produkter fra verkstedet.',
    url: '/produkter/',
    type: 'Side',
    ord: 'kjøp butikk finn noe personlige gaver interiør figurer tilbehør bedrift spesialbestillinger',
  },
  {
    tittel: 'Skaperverksted',
    tekst: 'Design skilt, navn og former selv, i nettleseren, i millimeter.',
    url: '/skaperverksted/',
    type: 'Verktøy',
    ord: 'lag noe signgen skilt navneskilt lampe drage generator 3d stl 3mf',
  },
  {
    tittel: 'Spesialdesign',
    tekst: 'Har du tegningen, bildet eller bare ideen? Vi hjelper deg å gjøre den fysisk.',
    url: '/spesialdesign/',
    type: 'Side',
    ord: 'idé skisse bilde 3d-modell ødelagt del reservedel forespørsel skjema mål',
  },
  {
    tittel: 'For bedrifter',
    tekst: 'Prototyper, småserier, produktutvikling, grafisk design og profilering.',
    url: '/bedrift/',
    type: 'Side',
    ord: 'bedrift firma logo profil skilt',
  },
  { tittel: 'Inspirasjon', tekst: 'Prosjekter, historier og guider.', url: '/inspirasjon/', type: 'Side' },
  {
    tittel: 'Om Designporten',
    tekst: 'Et verksted som både tegner og produserer.',
    url: '/om/',
    type: 'Side',
  },
  {
    tittel: 'Kontakt',
    tekst: 'Skriv hva det gjelder, så svarer vi på e-post.',
    url: '/kontakt/',
    type: 'Side',
    ord: 'e-post melding spørsmål',
  },
  { tittel: 'Personvern', tekst: 'Hvordan vi bruker det du sender oss.', url: '/personvern/', type: 'Side' },
  { tittel: 'Vilkår', tekst: 'Kjøpsvilkår.', url: '/vilkar/', type: 'Side' },
  { tittel: 'Frakt og levering', tekst: 'Frakt og levering.', url: '/frakt-og-levering/', type: 'Side' },
];

export const GET: APIRoute = async () => {
  const produkter = (await getCollection('produkter')).map<Sokepost>((p) => {
    const data = p.data as { navn: string; beskrivelse?: string };
    return { tittel: data.navn, tekst: data.beskrivelse ?? '', url: `/produkter/${p.id}/`, type: 'Produkt' };
  });
  const inspirasjon = (await getCollection('inspirasjon')).map<Sokepost>((s) => ({
    tittel: s.data.tittel,
    tekst: s.data.ingress,
    url: `/inspirasjon/${s.id}/`,
    type: typenavn[s.data.type].en,
    ord: [...s.data.materialer, s.data.mal ?? ''].join(' '),
  }));
  return Response.json([...sider, ...produkter, ...inspirasjon]);
};
