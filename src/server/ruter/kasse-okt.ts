/**
 * GET /api/kasse/okt/?okt=cs_… : the thank-you page asks whether a Checkout
 * Session is paid before it says so and empties the cart.
 */
import type { APIRoute } from 'astro';
import { stripe } from '@/server/stripe';

export const prerender = false;

interface Okt {
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  client_reference_id: string | null;
  amount_total: number | null;
}

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('okt') ?? '';
  const svar = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return svar({ betalt: false }, 400);
  const okt = await stripe<Okt>('GET', `/checkout/sessions/${id}`);
  if (!okt.ok) return svar({ betalt: false }, okt.status === 404 ? 404 : 502);
  return svar({
    betalt: okt.data.payment_status === 'paid',
    referanse: okt.data.client_reference_id,
    sumOre: okt.data.amount_total,
  });
};
