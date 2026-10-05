/** /admin/config.yml for the content editor (src/lib/admin/oppsett.ts). */
import type { APIRoute } from 'astro';
import { lagOppsett } from '@/lib/admin/oppsett';
import { katalog } from '@/skaperverksted/generatorer';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(lagOppsett(katalog.map((g) => ({ id: g.id, navn: g.navn }))), null, 2), {
    headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
  });
