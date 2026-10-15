import { nettsti } from '@/lib/nettsti';
/**
 * Configuration for the content editor at /admin (Sveltia CMS, git-based).
 * Built from the same lists the site validates against (categories, materials,
 * colours, images, generators), so the editor can never offer a value the
 * build would reject. Served as /admin/config.yml (JSON is valid YAML).
 *
 * Publishing in the editor commits to `main` on GitHub; the host rebuilds the
 * site from there (Render auto-deploy).
 */
import { kategorier } from '@/lib/handel/kategorier';
import { bakgrunner, utklippbilder } from '@/lib/ressurser';
import { materialer, materialtyper } from '@/skaperverksted/core/materialer';
import { sidetekstSamling } from '@/lib/sidetekster/admin';
import { inspirasjonstyper, tilgangsnivaer } from '@/content/inspirasjon/verdier';

export const REPO = 'sihovd/designporten-v2';

const valg = (liste: { label: string; value: string }[]) => liste;

export function lagOppsett(generatorer: { id: string; navn: string }[]) {
  const bilder = valg(
    Object.entries(utklippbilder).map(([k, b]) => ({ label: `${b.alt} (konseptbilde)`, value: k })),
  );
  const inspirasjonsbilder = valg([
    ...Object.entries(bakgrunner).map(([k, b]) => ({
      label: `${b.alt}${b.konsept ? ' (konseptbilde)' : ''}`,
      value: `bakgrunner.${k}`,
    })),
    ...Object.entries(utklippbilder).map(([k, b]) => ({
      label: `${b.alt}${b.konsept ? ' (konseptbilde)' : ''}`,
      value: `utklippbilder.${k}`,
    })),
  ]);
  const bildevalg = (navn: string, label = 'Bilde fra bildebiblioteket') => ({
    name: navn,
    label,
    widget: 'select',
    required: false,
    options: inspirasjonsbilder,
  });
  return {
    backend: {
      name: 'github',
      repo: REPO,
      branch: 'main',
      commit_messages: {
        create: 'Innhold: ny {{collection}} «{{slug}}»',
        update: 'Innhold: oppdaterer {{collection}} «{{slug}}»',
        delete: 'Innhold: sletter {{collection}} «{{slug}}»',
        uploadMedia: 'Innhold: laster opp «{{path}}»',
        deleteMedia: 'Innhold: sletter «{{path}}»',
      },
    },
    site_url: 'https://designporten.no',
    display_url: 'https://designporten.no',
    logo: { src: nettsti('/brand/designporten-merke.svg') },
    media_folder: 'public/opplastet',
    public_folder: '/opplastet',
    slug: { encoding: 'ascii', clean_accents: true },
    collections: [
      sidetekstSamling(),
      {
        name: 'nettsidebilder',
        label: 'Nettsidebilder',
        description:
          'Bytt hovedbildene på forsiden, Spesialdesign, For bedrifter og Om. Nye bilder lastes opp i bildebiblioteket.',
        files: [
          {
            name: 'bilder',
            label: 'Sidebilder',
            file: 'src/content/sider/bilder.json',
            preview_path: '/',
            fields: [
              {
                name: 'forside',
                label: 'Forsiden',
                widget: 'object',
                fields: [
                  {
                    name: 'fil',
                    label: 'Last opp eller velg bilde',
                    widget: 'image',
                    required: false,
                    hint: 'Tomt felt bruker det merkede konseptbildet.',
                  },
                  { name: 'alt', label: 'Hva viser bildet?', widget: 'string' },
                  {
                    name: 'fokus',
                    label: 'Fokuspunkt',
                    widget: 'string',
                    hint: 'Prosent fra venstre og topp, for eksempel 72% 45%.',
                  },
                ],
              },
              {
                name: 'spesialdesign',
                label: 'Spesialdesign',
                widget: 'object',
                fields: [
                  {
                    name: 'fil',
                    label: 'Last opp eller velg bilde',
                    widget: 'image',
                    required: false,
                    hint: 'Tomt felt bruker det merkede konseptbildet.',
                  },
                  { name: 'alt', label: 'Hva viser bildet?', widget: 'string' },
                  {
                    name: 'fokus',
                    label: 'Fokuspunkt',
                    widget: 'string',
                    hint: 'Prosent fra venstre og topp, for eksempel 68% 50%.',
                  },
                ],
              },
              {
                name: 'bedrift',
                label: 'For bedrifter',
                widget: 'object',
                fields: [
                  {
                    name: 'fil',
                    label: 'Last opp eller velg bilde',
                    widget: 'image',
                    required: false,
                    hint: 'Tomt felt bruker det merkede konseptbildet.',
                  },
                  { name: 'alt', label: 'Hva viser bildet?', widget: 'string' },
                  {
                    name: 'fokus',
                    label: 'Fokuspunkt',
                    widget: 'string',
                    hint: 'Prosent fra venstre og topp, for eksempel 62% 45%.',
                  },
                ],
              },
              {
                name: 'omHistorie',
                label: 'Om – historiebilde',
                widget: 'object',
                fields: [
                  {
                    name: 'fil',
                    label: 'Last opp eller velg bilde',
                    widget: 'image',
                    required: false,
                    hint: 'Tomt felt bruker det merkede konseptbildet.',
                  },
                  { name: 'alt', label: 'Hva viser bildet?', widget: 'string' },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'produkter',
        label: 'Produkter',
        label_singular: 'Produkt',
        description: 'Produktene i nettbutikken. Pris i øre inkludert mva: 24900 er 249 kr.',
        folder: 'src/content/produkter/data',
        extension: 'json',
        format: 'json',
        create: true,
        delete: true,
        identifier_field: 'navn',
        slug: '{{slug}}',
        media_folder: '/src/content/produkter/bilder',
        public_folder: '../bilder',
        summary: '{{navn}} · {{status}}',
        sortable_fields: ['rekkefolge', 'navn', 'lagtTil'],
        fields: [
          { name: 'navn', label: 'Navn', widget: 'string' },
          {
            name: 'status',
            label: 'Status',
            widget: 'select',
            default: 'plassholder',
            hint: 'Bare «Klar for salg» kan betales med kort. Plassholdere merkes tydelig på siden.',
            options: [
              { label: 'Klar for salg', value: 'bekreftet' },
              { label: 'Plassholder', value: 'plassholder' },
            ],
          },
          {
            name: 'kategori',
            label: 'Kategori',
            widget: 'select',
            options: kategorier.map((k) => ({ label: k.navn, value: k.slug })),
          },
          {
            name: 'kortBeskrivelse',
            label: 'Kort beskrivelse',
            widget: 'string',
            hint: 'Én setning, maks 160 tegn.',
            pattern: ['^.{0,160}$', 'Maks 160 tegn.'],
          },
          {
            name: 'beskrivelse',
            label: 'Beskrivelse',
            widget: 'text',
            hint: 'Avsnitt skilles med en tom linje.',
          },
          {
            name: 'foto',
            label: 'Produktfoto',
            widget: 'object',
            required: false,
            hint: 'Et ekte foto. Brukes i stedet for konseptbildet når det er lastet opp.',
            fields: [
              { name: 'fil', label: 'Bilde', widget: 'image' },
              {
                name: 'alt',
                label: 'Bildetekst for skjermlesere',
                widget: 'string',
                hint: 'Hva viser bildet? For eksempel «Spiralvase i kremhvit PLA».',
              },
            ],
          },
          {
            name: 'bilde',
            label: 'Konseptbilde',
            widget: 'select',
            required: false,
            options: bilder,
            hint: 'Brukes når det ikke er lastet opp et foto. Merkes «Konseptbilde» på siden.',
          },
          {
            name: 'bildeAlternativ',
            label: 'Konseptbilde ved hover',
            widget: 'select',
            required: false,
            options: bilder,
          },
          {
            name: 'prisOre',
            label: 'Pris i øre inkl. mva',
            widget: 'number',
            value_type: 'int',
            min: 1,
            required: false,
            hint: 'Tom = ingen pris vises. 24900 = 249 kr.',
          },
          {
            name: 'mal',
            label: 'Mål i millimeter',
            widget: 'object',
            required: false,
            fields: [
              { name: 'bredde', label: 'Bredde', widget: 'number', value_type: 'float', min: 0.1 },
              { name: 'dybde', label: 'Dybde', widget: 'number', value_type: 'float', min: 0.1 },
              { name: 'hoyde', label: 'Høyde', widget: 'number', value_type: 'float', min: 0.1 },
            ],
          },
          {
            name: 'materialer',
            label: 'Materialer',
            widget: 'select',
            multiple: true,
            min: 1,
            hint: 'Det første er standardvalget.',
            options: Object.keys(materialtyper),
          },
          {
            name: 'farger',
            label: 'Farger',
            widget: 'select',
            multiple: true,
            min: 1,
            hint: 'Den første er standardvalget.',
            options: materialer.map((m) => ({ label: `${m.navn} (${m.type})`, value: m.id })),
          },
          {
            name: 'egenTekst',
            label: 'Egen tekst',
            widget: 'object',
            required: false,
            hint: 'Slå på hvis kunden kan legge til egen tekst.',
            fields: [
              {
                name: 'maksTegn',
                label: 'Maks antall tegn',
                widget: 'number',
                value_type: 'int',
                min: 1,
                max: 60,
              },
              {
                name: 'tilleggOre',
                label: 'Tillegg i øre',
                widget: 'number',
                value_type: 'int',
                min: 1,
                required: false,
                hint: 'Tom = ingen pris for teksten er satt.',
              },
            ],
          },
          {
            name: 'generator',
            label: 'Kan lages i Skaperverksted',
            widget: 'select',
            required: false,
            options: generatorer.map((g) => ({ label: g.navn, value: g.id })),
          },
          {
            name: 'rekkefolge',
            label: 'Rekkefølge i «Utvalgt»',
            widget: 'number',
            value_type: 'int',
            default: 100,
            hint: 'Lavere tall kommer først.',
          },
          {
            name: 'lagtTil',
            label: 'Lagt til',
            widget: 'datetime',
            time_format: false,
            date_format: 'YYYY-MM-DD',
            format: 'YYYY-MM-DD',
            default: '{{now}}',
          },
        ],
      },
      {
        name: 'inspirasjon',
        label: 'Inspirasjon',
        label_singular: 'Artikkel',
        description: 'Artikler, veiledninger og bekreftede kundeprosjekter.',
        folder: 'src/content/inspirasjon/data',
        extension: 'md',
        format: 'frontmatter',
        create: true,
        delete: true,
        slug: '{{slug}}',
        summary: '{{tittel}} · {{status}}',
        sortable_fields: ['dato', 'tittel', 'status', 'type'],
        fields: [
          { name: 'tittel', label: 'Tittel', widget: 'string' },
          { name: 'ingress', label: 'Ingress', widget: 'text' },
          {
            name: 'type',
            label: 'Innholdstype',
            widget: 'select',
            options: inspirasjonstyper.map((value) => ({ label: value, value })),
          },
          {
            name: 'status',
            label: 'Status',
            widget: 'select',
            default: 'plassholder',
            hint: 'Bruk «Bekreftet» bare for innhold Designporten har godkjent.',
            options: [
              { label: 'Plassholder', value: 'plassholder' },
              { label: 'Bekreftet', value: 'bekreftet' },
            ],
          },
          {
            name: 'dato',
            label: 'Dato',
            widget: 'datetime',
            time_format: false,
            date_format: 'YYYY-MM-DD',
            format: 'YYYY-MM-DD',
          },
          {
            name: 'tilgang',
            label: 'Synlighet',
            widget: 'select',
            default: 'offentlig',
            options: tilgangsnivaer.map((value) => ({ label: value, value })),
          },
          {
            name: 'offentligFra',
            label: 'Offentlig fra',
            widget: 'datetime',
            time_format: false,
            date_format: 'YYYY-MM-DD',
            format: 'YYYY-MM-DD',
            required: false,
          },
          bildevalg('bilde', 'Hovedbilde'),
          { name: 'problem', label: 'Utfordring', widget: 'text', required: false },
          { name: 'utgangspunkt', label: 'Hva kunden startet med', widget: 'text', required: false },
          {
            name: 'stadier',
            label: 'Stegene i prosessen',
            label_singular: 'Steg',
            widget: 'list',
            collapsed: true,
            summary: '{{tittel}}',
            fields: [
              { name: 'tittel', label: 'Stegtittel', widget: 'string' },
              { name: 'tekst', label: 'Beskrivelse', widget: 'text' },
              bildevalg('bilde'),
            ],
          },
          { name: 'resultat', label: 'Resultat', widget: 'text', required: false },
          {
            name: 'materialer',
            label: 'Materialer',
            label_singular: 'Materiale',
            widget: 'list',
            field: { name: 'materiale', label: 'Materiale', widget: 'string' },
            required: false,
          },
          { name: 'mal', label: 'Mål', widget: 'string', required: false },
          {
            name: 'lenke',
            label: 'Neste steg',
            widget: 'object',
            required: false,
            fields: [
              { name: 'tekst', label: 'Lenketekst', widget: 'string' },
              { name: 'href', label: 'Adresse', widget: 'string' },
            ],
          },
          { name: 'body', label: 'Artikkelinnhold', widget: 'markdown' },
        ],
      },
      {
        name: 'butikk',
        label: 'Butikk',
        files: [
          {
            name: 'innstillinger',
            label: 'Betaling og frakt',
            file: 'src/content/butikk/innstillinger.json',
            format: 'json',
            fields: [
              {
                name: 'betaling',
                label: 'Kortbetaling med Stripe',
                widget: 'boolean',
                default: false,
                hint: 'Virker bare når Stripe-nøklene er lagt inn hos Render og minst én fraktmåte finnes. Ellers sendes handlekurven som forespørsel.',
              },
              {
                name: 'frakt',
                label: 'Fraktmåter',
                label_singular: 'Fraktmåte',
                widget: 'list',
                max: 5,
                summary: '{{navn}}',
                fields: [
                  {
                    name: 'navn',
                    label: 'Navn',
                    widget: 'string',
                    hint: 'For eksempel «Hentes i verkstedet».',
                  },
                  {
                    name: 'prisOre',
                    label: 'Pris i øre inkl. mva',
                    widget: 'number',
                    value_type: 'int',
                    min: 0,
                    hint: '0 = gratis.',
                  },
                  {
                    name: 'dagerMin',
                    label: 'Leveringstid fra (virkedager)',
                    widget: 'number',
                    value_type: 'int',
                    min: 1,
                    max: 60,
                    required: false,
                  },
                  {
                    name: 'dagerMaks',
                    label: 'Leveringstid til (virkedager)',
                    widget: 'number',
                    value_type: 'int',
                    min: 1,
                    max: 60,
                    required: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
