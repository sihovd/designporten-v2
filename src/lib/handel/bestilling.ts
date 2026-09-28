/**
 * The order request: what the cart page sends and the server route accepts.
 * Shared by client and server so both validate the same way.
 */
import { z } from 'zod';

export const bestillingslinjeSkjema = z.object({
  produktId: z.string().min(1).max(100),
  antall: z.number().int().min(1).max(999),
  valg: z.record(z.string().max(40), z.string().max(80)),
});

export const bestillingSkjema = z.object({
  navn: z.string().trim().min(2, 'Skriv navnet ditt.').max(120),
  epost: z.string().trim().pipe(z.email('Skriv en gyldig e-postadresse.')),
  telefon: z.string().trim().max(40).default(''),
  melding: z.string().trim().max(4000).default(''),
  linjer: z.array(bestillingslinjeSkjema).min(1, 'Handlekurven er tom.').max(50),
  /** Honeypot. People never see or fill it. */
  nettside: z.string().max(0).default(''),
});

export type Bestilling = z.infer<typeof bestillingSkjema>;
export type Bestillingslinje = z.infer<typeof bestillingslinjeSkjema>;

export type Bestillingssvar =
  | { ok: true; referanse: string; kanal: 'epost' | 'fil' }
  | { ok: false; grunn: string; felt?: Record<string, string> };

/** First error message per field, for showing next to the inputs. */
export function feltfeil(feil: z.ZodError): Record<string, string> {
  const ut: Record<string, string> = {};
  for (const i of feil.issues) {
    const felt = String(i.path[0] ?? 'skjema');
    if (!ut[felt]) ut[felt] = i.message;
  }
  return ut;
}
