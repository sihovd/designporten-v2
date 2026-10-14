import { test, expect } from '@playwright/test';

test('sitemap exposes only public canonical routes under the configured base', async ({ request }) => {
  const base = '/designporten-test';
  const response = await request.get(`${base}/sitemap.xml`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/xml');

  const xml = await response.text();
  expect(xml).toContain('<loc>https://www.designporten.no/designporten-test/</loc>');
  expect(xml).toContain('https://www.designporten.no/designporten-test/skaperverksted/signgen/');
  expect(xml).not.toContain('/admin/');
  expect(xml).not.toContain('/handlekurv/');
  expect(xml).not.toContain('/produkter/spiralvase/');
});
