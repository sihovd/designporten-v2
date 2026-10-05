/**
 * Server-only access to Stripe's REST API (no SDK: three calls and a signature
 * check do not need one). Keys come from the environment and are never sent
 * to the browser:
 *   STRIPE_SECRET_KEY      sk_test_… while testing, sk_live_… in production
 *   STRIPE_WEBHOOK_SECRET  whsec_… from the webhook endpoint in the dashboard
 *   NETTSTED_URL           optional public address, e.g. https://www.designporten.no
 *   STRIPE_API_URL         optional, only for tests against a local fake
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function env(navn: string): string | undefined {
  const v = process.env[navn] ?? (import.meta.env as Record<string, string | undefined>)[navn];
  return v && v.length > 0 ? v : undefined;
}

export function harStripe(): boolean {
  return !!env('STRIPE_SECRET_KEY');
}

/** Public base URL for Stripe's return links. */
export function nettstedUrl(request: Request): string {
  const satt = env('NETTSTED_URL') ?? env('RENDER_EXTERNAL_URL');
  return (satt ?? new URL(request.url).origin).replace(/\/+$/, '');
}

export type StripeSvar<T> = { ok: true; data: T } | { ok: false; status: number; melding: string };

export async function stripe<T>(
  metode: 'GET' | 'POST',
  sti: string,
  kropp?: URLSearchParams,
  idempotens?: string,
): Promise<StripeSvar<T>> {
  const nokkel = env('STRIPE_SECRET_KEY');
  if (!nokkel) return { ok: false, status: 0, melding: 'STRIPE_SECRET_KEY mangler' };
  try {
    const api = env('STRIPE_API_URL') ?? 'https://api.stripe.com/v1';
    const svar = await fetch(`${api}${sti}`, {
      method: metode,
      headers: {
        Authorization: `Bearer ${nokkel}`,
        ...(kropp ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotens ? { 'Idempotency-Key': idempotens } : {}),
      },
      body: kropp?.toString(),
    });
    const data = (await svar.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!svar.ok || !data) {
      return { ok: false, status: svar.status, melding: data?.error?.message ?? `HTTP ${svar.status}` };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, status: 0, melding: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Verifies the Stripe-Signature header (t=…,v1=…): HMAC-SHA256 of
 * `${t}.${payload}` with the endpoint secret, within `toleranse` seconds.
 */
export function sjekkSignatur(
  payload: string,
  header: string | null,
  hemmelighet: string,
  naa = Math.floor(Date.now() / 1000),
  toleranse = 300,
): boolean {
  if (!header) return false;
  const deler = header.split(',').map((d) => d.split('=') as [string, string]);
  const t = Number(deler.find(([k]) => k === 't')?.[1]);
  const signaturer = deler.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || signaturer.length === 0 || Math.abs(naa - t) > toleranse) return false;
  const forventet = Buffer.from(createHmac('sha256', hemmelighet).update(`${t}.${payload}`).digest('hex'));
  return signaturer.some((s) => {
    const b = Buffer.from(s);
    return b.length === forventet.length && timingSafeEqual(b, forventet);
  });
}
