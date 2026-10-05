/**
 * Shop settings edited in the CMS (/admin → Butikk). Card payment is only
 * offered when Sivert has switched it on here AND the Stripe keys exist on the
 * server. Shipping options are his to set; none are invented (CLAUDE.md §3).
 */
import { z } from 'zod';
import raa from '@/content/butikk/innstillinger.json';

export const fraktSkjema = z.object({
  /** Shown in Stripe Checkout, e.g. «Posten, levert i postkassen». */
  navn: z.string().trim().min(2).max(80),
  /** Price in øre including VAT. 0 = free (for example pickup). */
  prisOre: z.number().int().min(0),
  /** Delivery estimate in working days, shown in Checkout when both are set. */
  dagerMin: z.number().int().min(1).max(60).nullable().default(null),
  dagerMaks: z.number().int().min(1).max(60).nullable().default(null),
});

export const butikkSkjema = z.object({
  /** Main switch for card payment through Stripe Checkout. */
  betaling: z.boolean(),
  frakt: z.array(fraktSkjema).max(5),
});

export type Frakt = z.infer<typeof fraktSkjema>;
export type Butikkinnstillinger = z.infer<typeof butikkSkjema>;

export const butikk: Butikkinnstillinger = butikkSkjema.parse(raa);
