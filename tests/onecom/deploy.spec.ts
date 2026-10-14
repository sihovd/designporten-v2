import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const base = '/designporten-test';
const felt = {
  skjema: 'kontakt',
  navn: 'Lokal Test',
  epost: 'local@example.invalid',
  beskrivelse: 'Kun lokal test',
};
const api = `${base}/api/foresporsel/`;
const ordre = {
  navn: 'Lokal Test',
  epost: 'local@example.invalid',
  linjer: [{ produktId: 'spiralvase', antall: 1, valg: { farge: 'hvit', materiale: 'PLA' } }],
};

test('all routes, local links and assets stay inside the subdirectory', async ({ page, request }) => {
  const feil: string[] = [];
  page.on('pageerror', (e) => feil.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) feil.push(`${r.status()} ${r.url()}`);
  });
  const sider = [
    '/',
    '/produkter/',
    '/produkter/spiralvase/',
    '/kontakt/',
    '/spesialdesign/',
    '/skaperverksted/',
    '/skaperverksted/signgen/',
    '/skaperverksted/lampe/',
    '/skaperverksted/drage/',
    '/handlekurv/',
    '/sok/?q=petg',
  ];
  for (const sti of sider) {
    expect((await page.goto(base + sti))?.status(), sti).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    if (sti.startsWith('/skaperverksted/') && sti !== '/skaperverksted/') {
      await expect(page.locator('.verksted-laster')).toHaveCount(0);
    }
    const adresser = await page
      .locator('[href], [src], [action]')
      .evaluateAll((els) =>
        els.flatMap((el) =>
          ['href', 'src', 'action']
            .map((a) => el.getAttribute(a))
            .filter((v): v is string => Boolean(v?.startsWith('/'))),
        ),
      );
    expect(
      adresser.filter((a) => !a.startsWith(base + '/')),
      sti,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), sti).toBe(true);
  }
  for (const sti of [
    '/favicon.ico',
    '/favicon.svg',
    '/brand/designporten-merke.svg',
    '/site.webmanifest',
    '/sok.json',
  ]) {
    expect((await request.get(base + sti)).status()).toBe(200);
  }
  const manifest = await (await request.get(base + '/site.webmanifest')).json();
  expect(manifest.start_url).toBe(base + '/');
  expect(manifest.icons.every((i: { src: string }) => i.src.startsWith(base + '/'))).toBe(true);
  expect(feil).toEqual([]);
});

test('contact, idea upload and order reach local PHP capture; honeypots do not', async ({ request }) => {
  for (const skjema of ['kontakt', 'ide']) {
    const svar = await request.post(api, {
      headers: { Accept: 'application/json' },
      multipart: {
        ...felt,
        skjema,
        'filer[]': {
          name: 'test.stl',
          mimeType: 'model/stl',
          buffer: Buffer.from('solid test\nendsolid test\n'),
        },
      },
    });
    expect(svar.status()).toBe(200);
    const data = await svar.json();
    expect(data.ok).toBe(true);
    const lagret = JSON.parse(await readFile(`var/php-mail/${data.referanse}.json`, 'utf8'));
    expect(lagret.tekst).toContain('Kun lokal test');
    expect(Buffer.from(lagret.vedlegg[0].innhold, 'base64').toString()).toContain('solid test');
  }
  const katalog = await (await request.get(`${base}/api/katalog.json`)).json();
  const p = katalog.produkter[0];
  const svar = await request.post(`${base}/api/bestilling/`, {
    data: {
      ...ordre,
      linjer: [
        {
          produktId: p.id,
          antall: 1,
          valg: { farge: p.farger[0].id, materiale: p.materialer[0] },
          enhetspris: 1,
        },
      ],
    },
  });
  expect(svar.status()).toBe(200);
  const data = await svar.json();
  expect(JSON.parse(await readFile(`var/php-mail/${data.referanse}.json`, 'utf8')).tekst).toContain(p.navn);
  const bot = await (
    await request.post(api, {
      headers: { Accept: 'application/json' },
      multipart: { ...felt, nettside: 'spam' },
    })
  ).json();
  expect(bot.ok).toBe(true);
  expect(bot.referanse).toBe('');
  const botOrdre = await (
    await request.post(`${base}/api/bestilling/`, { data: { nettside: 'spam' } })
  ).json();
  await expect(readFile(`var/php-mail/${botOrdre.referanse}.json`)).rejects.toThrow();
});

test('PHP validation, failed delivery, missing settings and protected files fail safely', async ({
  request,
}) => {
  expect((await request.get(api)).status()).toBe(405);
  expect(
    (
      await request.post(api, {
        headers: { Accept: 'application/json' },
        multipart: { ...felt, epost: 'bad' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(api, {
        headers: { Accept: 'application/json' },
        multipart: {
          ...felt,
          'filer[]': { name: 'bad.exe', mimeType: 'text/plain', buffer: Buffer.from('bad') },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(api, {
        headers: { Accept: 'application/json' },
        multipart: {
          ...felt,
          'filer[]': { name: 'large.stl', mimeType: 'model/stl', buffer: Buffer.alloc(19 * 1024 * 1024) },
        },
      })
    ).status(),
  ).toBe(400);
  for (const mode of ['unconfigured', 'fail']) {
    const r = await request.post(api, {
      headers: { Accept: 'application/json', 'X-DP-Test-Delivery': mode },
      multipart: felt,
    });
    expect(r.status()).toBe(503);
    expect((await r.json()).ok).toBe(false);
  }
  expect(
    (
      await request.post(`${base}/api/bestilling/`, { data: { navn: 'A', epost: 'bad', linjer: [] } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`${base}/api/bestilling/`, {
        data: 'broken',
        headers: { 'Content-Type': 'application/json' },
      })
    ).status(),
  ).toBe(400);
  for (const sti of [
    '/api/oppsett.php',
    '/api/_felles.php',
    '/api/bygg.php',
    '/api/.user.ini',
    '/.htaccess',
  ]) {
    expect((await request.get(base + sti)).status()).toBe(403);
  }
});

test('no-JavaScript submissions redirect within test path, including errors', async ({
  browser,
  request,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  for (const [sti, label, knapp, type] of [
    ['/kontakt/', 'Hva gjelder det', 'Send meldingen', 'meldingen'],
    ['/foresporsel/', 'Hva ser du for deg', 'Send forespørselen', 'ideen'],
  ]) {
    await page.goto(`http://127.0.0.1:4322${base}${sti}`);
    await page.getByLabel(new RegExp(label!)).fill('Lokal test uten JavaScript');
    await page.getByLabel(/^Navn/).fill('Lokal Test');
    await page.getByLabel(/^E-post/).fill('local@example.invalid');
    await page.getByRole('button', { name: knapp }).click();
    expect(new URL(page.url()).pathname).toMatch(/^\/designporten-test\/skjema\/kvittering\//);
    await expect(page.getByRole('heading', { name: `Takk, vi har fått ${type} din.` })).toBeVisible();
  }
  await ctx.close();
  const feil = await request.post(api, { form: { ...felt, navn: '' }, maxRedirects: 0 });
  expect(feil.status()).toBe(303);
  expect(feil.headers().location).toMatch(/^\/designporten-test\/skjema\/ikke-sendt\//);
});

test('enhanced forms preserve input on failure and show successful receipts', async ({ page }) => {
  for (const [sti, label, knapp] of [
    ['/kontakt/', 'Hva gjelder det', 'Send meldingen'],
    ['/foresporsel/', 'Hva ser du for deg', 'Send forespørselen'],
  ]) {
    await page.goto(base + sti);
    await page.getByRole('button', { name: knapp }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('Noe mangler');
    await page.getByLabel(new RegExp(label!)).fill('Lokal nettlesertest');
    await page.getByLabel(/^Navn/).fill('Lokal Test');
    await page.getByLabel(/^E-post/).fill('local@example.invalid');
    await page.context().setExtraHTTPHeaders({ 'X-DP-Test-Delivery': 'unconfigured' });
    await page.getByRole('button', { name: knapp }).click();
    await expect(page.locator('form').getByRole('status')).toContainText('ikke koblet');
    await expect(page.getByLabel(/^Navn/)).toHaveValue('Lokal Test');
    await page.context().setExtraHTTPHeaders({});
    await page.getByRole('button', { name: knapp }).click();
    await expect(page.locator('[data-ref]')).toHaveText(/^DP-/);
  }
});

test('cart submits to PHP and does not touch production cart storage', async ({ page }) => {
  await page.goto(base + '/produkter/');
  await page.evaluate(() => localStorage.setItem('dp-kurv-v1', 'production-sentinel'));
  await page
    .locator('[data-produkt-id="kabelholder"]')
    .getByRole('button', { name: 'Legg Kabelholder med fire spor i handlekurven' })
    .click();
  await page.goto(base + '/handlekurv/');
  await page.getByLabel('Navn').fill('Lokal Test');
  await page.getByLabel('E-post').fill('local@example.invalid');
  await page.getByRole('button', { name: 'Send bestillingsforespørsel' }).click();
  await expect(page.getByRole('heading', { name: 'Takk, forespørselen er sendt.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('dp-kurv-v1'))).toBe('production-sentinel');
});

test('404 stays inside the test site and keyboard navigation works', async ({ page }) => {
  expect((await page.goto(base + '/finnes-ikke/'))?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Til forsiden', exact: true })).toHaveAttribute(
    'href',
    base + '/',
  );
  await page.goto(base + '/kontakt/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Hopp til innholdet' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#innhold')).toBeFocused();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test('Signgen downloads a real STL below the test path', async ({ page }) => {
  await page.goto(base + '/skaperverksted/signgen/');
  await page.getByRole('button', { name: /Tomt dokument/ }).click();
  await page.getByRole('button', { name: 'Start skiltet' }).click();
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await expect(page.locator('.statuslinje')).toContainText('deler');
  await page.getByRole('button', { name: /Eksporter/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('summary', { hasText: 'Last ned' }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('menuitem', { name: 'Last ned STL', exact: true }).click();
  const fil = await download;
  expect(fil.suggestedFilename()).toMatch(/\.stl$/);
  expect((await readFile((await fil.path())!)).length).toBeGreaterThan(84);
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`homepage and contact at ${width}px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.setViewportSize({ width, height: 900 });
    for (const sti of ['/', '/kontakt/']) {
      await page.goto(base + sti);
      await page.evaluate(() => document.fonts.ready);
      const bredde = await page.evaluate(() => ({
        bredde: document.documentElement.scrollWidth,
        skjerm: innerWidth,
        utenfor: [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed';
          })
          .slice(0, 8)
          .map((el) => `${el.tagName}.${el.className}`),
      }));
      expect(bredde.bredde, JSON.stringify({ sti, ...bredde })).toBeLessThanOrEqual(bredde.skjerm);
      await page.screenshot({
        path: `var/screenshots/${sti === '/' ? 'home' : 'contact'}-${width}.png`,
        fullPage: true,
      });
    }
  });
}
