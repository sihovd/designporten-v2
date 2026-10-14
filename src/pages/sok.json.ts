import { nettsti } from '@/lib/nettsti';
/** Build-time search index for /sok/: pages, products, inspiration and tools. */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import type { Sokepost } from '@/components/showroom/sok/sok';
import { erOffentlig, typenavn } from '@/components/showroom/inspirasjon/typer';
import { verktoy } from '@/components/showroom/verksted/verktoy';

export const prerender = true;

const sider: Sokepost[] = [
  {
    tittel: 'Vårt utvalg',
    tekst: 'Ferdige produkter fra verkstedet.',
    url: nettsti('/produkter/'),
    type: 'Side',
    ord: 'kjøp butikk finn noe personlige gaver interiør figurer tilbehør bedrift spesialbestillinger',
  },
  {
    tittel: 'Skaperverksted',
    tekst: 'Design skilt, navn og former selv, i nettleseren, i millimeter.',
    url: nettsti('/skaperverksted/'),
    type: 'Verktøy',
    kategori: 'verktoy',
    ord: 'lag noe forge signgen skilt navneskilt lampe form drage generator 3d stl 3mf',
  },
  {
    tittel: 'Spesialdesign',
    tekst: 'Har du tegningen, bildet eller bare ideen? Vi hjelper deg å gjøre den fysisk.',
    url: nettsti('/spesialdesign/'),
    type: 'Side',
    ord: 'idé skisse bilde 3d-modell ødelagt del reservedel forespørsel skjema mål',
  },
  {
    tittel: 'For bedrifter',
    tekst: 'Prototyper, småserier, produktutvikling, grafisk design og profilering.',
    url: nettsti('/bedrift/'),
    type: 'Side',
    ord: 'bedrift firma logo profil skilt',
  },
  {
    tittel: 'Inspirasjon',
    tekst: 'Prosjekter, historier, guider, tips og nyheter.',
    url: nettsti('/inspirasjon/'),
    type: 'Side',
    kategori: 'inspirasjon',
  },
  {
    tittel: 'Om Designporten',
    tekst: 'Skaperglede, og personen bak verkstedet.',
    url: nettsti('/om/'),
    type: 'Side',
  },
  {
    tittel: 'Kontakt',
    tekst: 'Skriv hva det gjelder, så svarer vi på e-post.',
    url: nettsti('/kontakt/'),
    type: 'Side',
    ord: 'e-post melding spørsmål',
  },
  {
    tittel: 'Personvern',
    tekst: 'Hvordan vi bruker det du sender oss.',
    url: nettsti('/personvern/'),
    type: 'Side',
  },
  { tittel: 'Vilkår', tekst: 'Kjøpsvilkår.', url: nettsti('/vilkar/'), type: 'Side' },
  {
    tittel: 'Frakt og levering',
    tekst: 'Frakt og levering.',
    url: nettsti('/frakt-og-levering/'),
    type: 'Side',
  },
];

export const GET: APIRoute = async () => {
  const produkter = (await getCollection('produkter')).map<Sokepost>((p) => {
    const data = p.data as { navn: string; beskrivelse?: string };
    return {
      tittel: data.navn,
      tekst: data.beskrivelse ?? '',
      url: nettsti(`/produkter/${p.id}/`),
      type: 'Produkt',
      kategori: 'produkter',
    };
  });
  // The four Forge tools; a planned tool points to the Skaperverksted hub.
  const verktoyposter = verktoy.map<Sokepost>((v) => ({
    tittel: v.navn,
    tekst: v.beskrivelse,
    url: v.href ?? nettsti('/skaperverksted/'),
    type: v.status === 'planlagt' ? 'Planlagt verktøy' : 'Verktøy',
    kategori: 'verktoy',
    ord: `${v.undertittel} ${v.id}`,
  }));
  const inspirasjon = (await getCollection('inspirasjon', (s) => erOffentlig(s.data))).map<Sokepost>((s) => ({
    tittel: s.data.tittel,
    tekst: s.data.ingress,
    url: nettsti(`/inspirasjon/${s.id}/`),
    type: typenavn[s.data.type].en,
    kategori: 'inspirasjon',
    ord: [...s.data.materialer, s.data.mal ?? ''].join(' '),
  }));
  return Response.json([...sider, ...produkter, ...verktoyposter, ...inspirasjon]);
};
