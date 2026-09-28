import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sider = [
  '/',
  '/spesialdesign/',
  '/bedrift/',
  '/inspirasjon/',
  '/inspirasjon/velg-materiale/',
  '/om/',
  '/kontakt/',
  '/sok/',
  '/personvern/',
  '/vilkar/',
  '/frakt-og-levering/',
];

function samleFeil(page: Page): string[] {
  const feil: string[] = [];
  page.on('pageerror', (e) => feil.push(e.message));
  // Failed requests are checked by URL below (the browser's own favicon request is not ours).
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) feil.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) feil.push(`${r.status()} ${r.url()}`);
  });
  return feil;
}

test.describe('pages', () => {
  // Reduced motion: axe should measure settled colours, not a reveal mid-fade.
  test.use({ reducedMotion: 'reduce' });

  for (const sti of sider) {
    test(`${sti} renders without errors and passes axe`, async ({ page }) => {
      const feil = samleFeil(page);
      const svar = await page.goto(sti);
      expect(svar?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      const bredde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(bredde).toBeLessThanOrEqual(0);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
      expect(feil).toEqual([]);
    });
  }
});

test('the hero says VI GIR IDEER FORM with both actions usable at once', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/vi gir ideer\s*form/i);
  await expect(page.getByRole('link', { name: 'Start å skape' })).toHaveAttribute('href', '/skaperverksted/');
  await expect(page.getByRole('link', { name: 'Fortell oss ideen din' }).first()).toBeVisible();
});

test('the three doors lead to the three paths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Finn noe/ })).toHaveAttribute('href', '/produkter/');
  await expect(page.getByRole('link', { name: /Lag noe/ })).toHaveAttribute('href', '/skaperverksted/');
  await expect(page.getByRole('link', { name: /Har du en idé\?/ })).toHaveAttribute(
    'href',
    '/spesialdesign/',
  );
});

test('the process slider follows scrolling and its labels jump to a step', async ({ page }) => {
  await page.goto('/');
  const prosess = page.locator('[data-prosess]').first();
  await expect(prosess.locator('[data-nr]')).toHaveText('Steg 01 / 05');
  await prosess.getByRole('button', { name: /Steg 4 av 5/ }).click();
  await expect(prosess.locator('[data-nr]')).toHaveText('Steg 04 / 05');
  await expect(prosess.getByRole('button', { name: /Steg 4 av 5/ })).toHaveAttribute('aria-current', 'step');
  await expect(prosess.locator('[data-tittel]')).toHaveText('3D-print');
});

test('the top slider moves with Neste and can be paused', async ({ page }) => {
  await page.goto('/');
  const slider = page.locator('[data-toppslider]');
  await slider.scrollIntoViewIfNeeded();
  await expect(slider.locator('[data-teller]')).toHaveText('1 / 3');
  await slider.getByRole('button', { name: 'Neste' }).click();
  await expect(slider.locator('[data-teller]')).toHaveText('2 / 3');
  await expect(slider.getByRole('button', { name: 'Spill av' })).toHaveAttribute('aria-pressed', 'true');
});

test('the idea form shows errors, then sends and shows the receipt', async ({ page }) => {
  await page.goto('/spesialdesign/?start=del#skjema');
  const skjema = page.locator('form[data-skjema]');
  await expect(skjema.getByRole('radio', { name: 'Jeg trenger en del' })).toBeChecked();
  await skjema.getByRole('button', { name: 'Send ideen' }).click();
  await expect(skjema.getByRole('alert')).toContainText('Noe mangler');
  await expect(skjema.getByLabel(/Hva vil du lage/)).toHaveAttribute('aria-invalid', 'true');

  await skjema.getByLabel(/Hva vil du lage/).fill('Klipsen på oppvaskkurven har knekt.');
  await skjema.getByLabel(/Navn/).fill('Test Testesen');
  await skjema.getByLabel(/E-post/).fill('test@example.no');
  await skjema.locator('input[type=file]').setInputFiles({
    name: 'klips.stl',
    mimeType: 'model/stl',
    buffer: Buffer.from('solid test\nendsolid test\n'),
  });
  await expect(page.getByText('klips.stl')).toBeVisible();
  await skjema.getByRole('button', { name: 'Send ideen' }).click();
  await expect(page.getByRole('heading', { name: 'Takk, vi har fått ideen din.' })).toBeVisible();
  await expect(page.locator('[data-ref]')).toHaveText(/^DP-\d{8}-[A-Z0-9]+$/);
});

test('the idea form works without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/kontakt/');
  await page.getByLabel(/Hva gjelder det/).fill('Et spørsmål om PETG.');
  await page.getByLabel(/Navn/).fill('Uten Skript');
  await page.getByLabel(/E-post/).fill('uten@example.no');
  await page.getByRole('button', { name: 'Send meldingen' }).click();
  await expect(page).toHaveURL(/\/skjema\/kvittering\//);
  await expect(page.getByRole('heading', { name: 'Takk, vi har fått meldingen din.' })).toBeVisible();
  await ctx.close();
});

test('search finds pages and inspiration', async ({ page }) => {
  await page.goto('/sok/?q=petg');
  await expect(page.getByRole('status')).toContainText('treff');
  const treff = page.locator('[data-soketreff]');
  await expect(treff.getByRole('link', { name: /PLA eller PETG/ })).toBeVisible();
  await page.getByRole('searchbox').fill('ødelagt del');
  await expect(treff.getByRole('link', { name: /Spesialdesign/ })).toBeVisible();
});

test('inspiration placeholders are marked', async ({ page }) => {
  await page.goto('/inspirasjon/eksempel-prosjektside/');
  await expect(page.getByRole('note')).toContainText('Plassholder');
});

test('unknown pages return 404 with a way on', async ({ page }) => {
  const svar = await page.goto('/finnes-ikke/');
  expect(svar?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Til forsiden', exact: true })).toBeVisible();
});

test('reduced motion shows the finished hero at once', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  const tegning = page.locator('.helt .bygg__tegning');
  await expect(tegning).toHaveCSS('opacity', '0');
  await expect(page.locator('.helt .bygg__objekt img')).toBeVisible();
  await ctx.close();
});
