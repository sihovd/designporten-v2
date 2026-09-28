/** Products collection. Owned by the products workstream; replace the schema freely. */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const produkter = defineCollection({
  loader: glob({ pattern: '**/*.{json,md}', base: './src/content/produkter/data' }),
  schema: z.object({
    navn: z.string(),
    status: z.enum(['bekreftet', 'plassholder']),
  }),
});
