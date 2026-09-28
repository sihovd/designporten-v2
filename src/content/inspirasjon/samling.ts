/**
 * Inspiration collection (information-architecture.md#inspirasjon).
 * Owned by the showroom workstream.
 *
 * Every entry carries `status`: only `bekreftet` entries are real projects
 * and stories confirmed by Designporten. `plassholder` entries show the
 * structure and are visibly marked as placeholders wherever they appear.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const inspirasjonstyper = ['prosjekt', 'historie', 'prosess', 'guide'] as const;

export const inspirasjon = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/inspirasjon/data' }),
  schema: z.object({
    tittel: z.string(),
    ingress: z.string(),
    type: z.enum(inspirasjonstyper),
    status: z.enum(['bekreftet', 'plassholder']),
    dato: z.coerce.date(),
    /** Key in the asset registry (src/lib/ressurser.ts): `bakgrunner.x` or `utklippbilder.x`. */
    bilde: z.string().optional(),
    /** Case template: the problem and what the customer started with. */
    problem: z.string().optional(),
    utgangspunkt: z.string().optional(),
    /** The process in stages. */
    stadier: z
      .array(z.object({ tittel: z.string(), tekst: z.string(), bilde: z.string().optional() }))
      .default([]),
    resultat: z.string().optional(),
    materialer: z.array(z.string()).default([]),
    /** Dimensions in mm, as documented. */
    mal: z.string().optional(),
    /** The matching path: a product, a generator or the idea form. */
    lenke: z.object({ tekst: z.string(), href: z.string() }).optional(),
  }),
});
