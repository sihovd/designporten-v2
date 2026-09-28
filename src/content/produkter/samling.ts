/**
 * Products collection. Owned by the products workstream.
 *
 * Honesty rules (CLAUDE.md, DESIGNPORTEN_MASTER.md §2):
 *  - `status: 'plassholder'` products are visibly marked everywhere they appear.
 *  - `prisOre: null` means no price is set; the UI then shows no price at all.
 *  - `mal: null` means dimensions are not fixed yet; the UI says so.
 *  - Colours and material types refer to the shared catalogue in
 *    src/skaperverksted/core/materialer.ts, so showroom and editor never drift.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { kategoriSlugger } from '@/lib/handel/kategorier';
import { utklippbilder } from '@/lib/ressurser';
import { materialer, materialtyper } from '@/skaperverksted/core/materialer';

const bildeNokler = Object.keys(utklippbilder) as [
  keyof typeof utklippbilder,
  ...(keyof typeof utklippbilder)[],
];
const materialtypeNavn = Object.keys(materialtyper);
const fargeIder = new Set(materialer.map((m) => m.id));

export const produktSkjema = z.object({
  navn: z.string().min(2),
  status: z.enum(['bekreftet', 'plassholder']),
  kategori: z.enum(kategoriSlugger),
  /** One sentence for cards, the window and meta descriptions. */
  kortBeskrivelse: z.string().max(160),
  /** Longer text for the product page. Plain paragraphs separated by blank lines. */
  beskrivelse: z.string(),
  /** Key in `utklippbilder` (src/lib/ressurser.ts). */
  bilde: z.enum(bildeNokler),
  /** Second angle shown on hover, when one exists. */
  bildeAlternativ: z.enum(bildeNokler).optional(),
  /** Outer dimensions in millimetres, or null while not fixed. */
  mal: z
    .object({ bredde: z.number().positive(), dybde: z.number().positive(), hoyde: z.number().positive() })
    .nullable(),
  /** Price in øre including VAT, or null while no price is set. */
  prisOre: z.number().int().positive().nullable(),
  /** Material types the product can be printed in (first = default). */
  materialer: z.array(z.string().refine((t) => materialtypeNavn.includes(t), 'Ukjent materialtype')).min(1),
  /** Colour ids from the material catalogue (first = default). */
  farger: z.array(z.string().refine((id) => fargeIder.has(id), 'Ukjent farge-id')).min(1),
  /** Optional custom text the customer may add. */
  egenTekst: z
    .object({
      maksTegn: z.number().int().min(1).max(60),
      /** Extra price in øre for the text, or null when not set. */
      tilleggOre: z.number().int().positive().nullable(),
    })
    .nullable(),
  /** Id of a Skaperverksted generator that can customise this product. */
  generator: z.string().nullable(),
  /** Order in «Utvalgt» sorting (lower first). */
  rekkefolge: z.number().int(),
  /** Date the product was added, for «Nyeste» sorting. */
  lagtTil: z.coerce.date(),
});

export type ProduktData = z.infer<typeof produktSkjema>;

export const produkter = defineCollection({
  loader: glob({ pattern: '**/*.{json,md}', base: './src/content/produkter/data' }),
  schema: produktSkjema,
});
