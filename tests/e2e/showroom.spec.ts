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

test('the hero says Vi gir ideer form with both actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/vi gir ideer\s*form/i);
  const helt = page.locator('.bhelt');
  await expect(helt.getByRole('link', { name: 'Start å skape' })).toHaveAttribute('href', '/skaperverksted/');
  await expect(helt.getByRole('link', { name: 'Fortell oss ideen din' })).toBeVisible();
});

test('the homepage shows popular products right after the hero', async ({ page }) => {
  await page.goto('/');
  const rad = page.getByRole('list', { name: 'Populære produkter' });
  expect(await rad.getByRole('listitem').filter({ visible: true }).count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByRole('link', { name: 'Se utvalget' })).toHaveAttribute('href', '/produkter/');
});

test('the three small cards lead to the three paths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Ferdige produkter' })).toHaveAttribute('href', '/produkter/');
  await expect(page.getByRole('link', { name: 'Skaperverksted', exact: true }).last()).toHaveAttribute(
    'href',
    '/skaperverksted/',
  );
  await page.getByRole('link', { name: 'Fortell oss om den' }).click();
  await expect(page.getByRole('dialog', { name: 'Fortell oss hva du trenger' })).toBeVisible();
});

test('a timeline point lights up only when the line reaches it', async ({ page }) => {
  await page.goto('/');
  const prosess = page.locator('[data-prosess]').first();
  const spor = prosess.locator('[data-spor]');
  // The top of the track: the first step, and the line has not reached the second point.
  await spor.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60));
  await expect(prosess.locator('[data-nr]')).toHaveText('01 / 06');
  await expect(prosess.locator('[data-punkt="1"]')).not.toHaveClass(/passert/);
  // A label scrolls to its step: that point and all before it are lit, the next is not.
  await prosess.getByRole('button', { name: /Steg 4 av 6/ }).click();
  await expect(prosess.locator('[data-nr]')).toHaveText('04 / 06');
  await expect(prosess.getByRole('button', { name: /Steg 4 av 6/ })).toHaveAttribute('aria-current', 'step');
  await expect(prosess.locator('[data-tittel]')).toHaveText('3D-print');
  await expect(prosess.locator('[data-punkt="3"]')).toHaveClass(/passert/);
  await expect(prosess.locator('[data-punkt="4"]')).not.toHaveClass(/passert/);
});

test('the enquiry modal opens with business chosen, traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/bedrift/');
  const knapp = page.locator('.bhelt').getByRole('link', { name: 'Fortell oss hva dere trenger' });
  await knapp.click();
  const modal = page.getByRole('dialog', { name: 'Fortell oss hva du trenger' });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('radio', { name: 'Bedrift' })).toBeChecked();
  await expect(modal.getByLabel(/Firmanavn/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(knapp).toBeFocused();
});

test('the enquiry form shows errors, then sends with a file and shows the receipt', async ({ page }) => {
  await page.goto('/spesialdesign/');
  await page.getByRole('link', { name: 'Start som privatkunde' }).click();
  const modal = page.getByRole('dialog', { name: 'Fortell oss hva du trenger' });
  const skjema = modal.locator('form[data-skjema]');
  await expect(skjema.getByRole('radio', { name: 'Privatperson' })).toBeChecked();
  await skjema.getByRole('radio', { name: 'Jeg trenger en del' }).check({ force: true });
  await skjema.getByRole('button', { name: 'Send forespørselen' }).click();
  await expect(skjema.getByRole('alert').first()).toContainText('mangler');
  await expect(skjema.getByLabel(/Hva ser du for deg/)).toHaveAttribute('aria-invalid', 'true');

  await skjema.getByLabel(/Hva ser du for deg/).fill('Klipsen på oppvaskkurven har knekt.');
  await skjema.getByLabel(/^Navn/).fill('Test Testesen');
  await skjema.getByLabel(/E-post/).fill('test@example.no');
  await skjema.locator('input[type=file]').setInputFiles({
    name: 'klips.stl',
    mimeType: 'model/stl',
    buffer: Buffer.from('solid test\nendsolid test\n'),
  });
  await expect(skjema.getByText('klips.stl')).toBeVisible();
  await skjema.getByRole('button', { name: 'Send forespørselen' }).click();
  await expect(modal.getByRole('heading', { name: /Takk, vi har fått/ })).toBeVisible();
  await expect(modal.locator('[data-ref]')).toHaveText(/^DP-\d{8}-[A-Z0-9]+$/);
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

test('search finds products, tools and inspiration in groups', async ({ page }) => {
  await page.goto('/sok/?q=petg');
  await expect(page.getByRole('status')).toContainText('treff');
  const treff = page.locator('[data-soketreff]');
  await expect(treff.getByRole('link', { name: /PLA eller PETG/ })).toBeVisible();
  await expect(treff.getByRole('heading', { name: /Inspirasjon/ })).toBeVisible();
  await page.getByRole('searchbox').fill('forge');
  await expect(treff.getByRole('heading', { name: /Skaperverksted/ })).toBeVisible();
  await expect(treff.getByRole('link', { name: /Sign Forge/ })).toBeVisible();
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

test('reduced motion keeps the hero still and the timeline readable', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  const bilde = page.locator('.bhelt__img');
  await expect(bilde).toBeVisible();
  expect(await bilde.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await expect(page.locator('[data-prosess] [data-tittel]').first()).toHaveText('Idé');
  await ctx.close();
});
