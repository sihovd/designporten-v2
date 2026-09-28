/** Inspiration collection. Owned by the showroom workstream; replace the schema freely. */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const inspirasjon = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/inspirasjon/data' }),
  schema: z.object({
    tittel: z.string(),
    status: z.enum(['bekreftet', 'plassholder']),
  }),
});
