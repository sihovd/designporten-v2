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
import { utklippbilder } from '@/lib/ressurser';
import { materialer, materialtyper } from '@/skaperverksted/core/materialer';

export const REPO = 'sihovd/designporten-v2';

const valg = (liste: { label: string; value: string }[]) => liste;

export function lagOppsett(generatorer: { id: string; navn: string }[]) {
  const bilder = valg(
    Object.entries(utklippbilder).map(([k, b]) => ({ label: `${b.alt} (konseptbilde)`, value: k })),
  );
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
    site_url: 'https://designporten.onrender.com',
    display_url: 'https://designporten.onrender.com',
    logo: { src: '/brand/designporten-merke.svg' },
    media_folder: 'public/opplastet',
    public_folder: '/opplastet',
    slug: { encoding: 'ascii', clean_accents: true },
    collections: [
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
