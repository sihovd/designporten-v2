import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const synligeKort = '[data-produktrutenett] > li[data-plass]:not([hidden])';

test.describe('Produkter', () => {
  test('lists the placeholder products and marks them honestly', async ({ page }) => {
    await page.goto('/produkter/');
    await expect(page.getByRole('heading', { level: 1, name: 'Vårt utvalg' })).toBeVisible();
    await expect(page.locator(synligeKort)).toHaveCount(12);
    await expect(page.getByText('Under oppbygging.')).toBeVisible();
    await expect(page.locator('.produktkort__status').first()).toHaveText('Plassholder');
    // No price is shown for products without one.
    await expect(page.locator('.produktkort__pris')).toHaveCount(0);
  });

  test('changes category in place and updates the URL', async ({ page }) => {
    await page.goto('/produkter/');
    await page.locator('[data-kategori="interior"]').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/produkter\/kategori\/interior\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Interiør' })).toBeVisible();
    await expect(page.locator(synligeKort)).toHaveCount(5);
    await expect(page.locator('[data-liste-antall]')).toHaveText('5 produkter');
    await page.goBack();
    await expect(page.locator(synligeKort)).toHaveCount(12);
  });

  test('category pages work on their own', async ({ page }) => {
    await page.goto('/produkter/kategori/tilbehor/');
    await expect(page.getByRole('heading', { level: 1, name: 'Tilbehør' })).toBeVisible();
    await expect(page.locator(synligeKort)).toHaveCount(5);
  });

  test('the card capsule adds and removes, and the header count follows', async ({ page }) => {
    await page.goto('/produkter/');
    const kort = page.locator('[data-produktkort][data-produkt-id="spiralvase"]');
    await kort.getByRole('button', { name: 'Legg Spiralvase i handlekurven' }).click();
    await kort.getByRole('button', { name: 'Legg Spiralvase i handlekurven' }).click();
    await expect(page.locator('[data-kurvantall]')).toHaveText('2');
    await kort.getByRole('button', { name: 'Ta én Spiralvase ut av handlekurven' }).click();
    await expect(page.locator('[data-kurvantall]')).toHaveText('1');
  });

  test('the plus button stays under the pointer while the count grows', async ({ page }) => {
    await page.goto('/produkter/');
    const kort = page.locator('[data-produktkort][data-produkt-id="spiralvase"]');
    const pluss = kort.getByRole('button', { name: 'Legg Spiralvase i handlekurven' });
    await pluss.click();
    const for_ = await pluss.boundingBox();
    await pluss.click();
    await pluss.click();
    const etter = await pluss.boundingBox();
    expect(etter?.x).toBeCloseTo(for_!.x, 0);
    expect(etter?.y).toBeCloseTo(for_!.y, 0);
    await expect(page.locator('[data-kurvantall]')).toHaveText('3');
  });

  test('filters narrow the list and can be reset', async ({ page }) => {
    await page.goto('/produkter/');
    const apne = page.getByRole('button', { name: /^Filter/ });
    if (await apne.isVisible()) await apne.click();
    const filter = page.locator('[data-filter]');
    await filter.getByRole('checkbox', { name: 'Kan få egen tekst' }).check();
    await expect.poll(() => page.locator(synligeKort).count()).toBeLessThan(12);
    expect(await page.locator(synligeKort).count()).toBeGreaterThan(0);
    await filter.getByRole('button', { name: 'Nullstill' }).click();
    await expect(page.locator(synligeKort)).toHaveCount(12);
  });

  test('the desktop filter has no heading and no scroll of its own', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Below 1024 px the filter is a sheet.');
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/produkter/');
    const filter = page.locator('[data-filter]');
    await expect(filter.getByRole('heading')).toHaveCount(0);
    expect(await filter.evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
    // Too tall for this window, so it scrolls with the page instead of sticking.
    await expect(filter).not.toHaveAttribute('data-festet');
    const boks = await filter.boundingBox();
    await page.mouse.move(boks!.x + 40, boks!.y + 40);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  });

  test('the product window opens, adds with choices, closes with Esc and returns focus', async ({ page }) => {
    await page.goto('/produkter/');
    await page.waitForFunction(() => document.documentElement.dataset.produktvindu === 'klar');
    const lenke = page.locator('[data-produkt-id="nokkelring"] [data-produktlenke]');
    await lenke.click();
    const vindu = page.getByRole('dialog', { name: 'Nøkkelring med navn' });
    await expect(vindu).toBeVisible();
    await vindu.getByRole('radio', { name: 'PETG' }).check();
    await vindu.getByLabel('Egen tekst (valgfritt)').fill('Kari');
    await expect(vindu.getByText('4 / 14 tegn')).toBeVisible();
    await vindu.getByRole('button', { name: 'Legg i handlekurven' }).click();
    await expect(vindu.getByRole('status')).toContainText('Lagt i handlekurven');
    await page.keyboard.press('Escape');
    await expect(vindu).toBeHidden();
    await expect(lenke).toBeFocused();
    await expect(page.locator('[data-kurvantall]')).toHaveText('1');
  });

  test('product page shows choices and is kept out of indexes while a placeholder', async ({ page }) => {
    await page.goto('/produkter/nokkelring/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nøkkelring med navn' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.getByRole('button', { name: 'Legg i handlekurven' })).toBeVisible();
    await expect(page.getByText('Mer fra personlige gaver')).toBeVisible();
  });

  test('cart sends an order request and says no payment is taken', async ({ page }) => {
    await page.goto('/produkter/');
    await page
      .locator('[data-produkt-id="kabelholder"]')
      .getByRole('button', { name: 'Legg Kabelholder med fire spor i handlekurven' })
      .click();
    await page.goto('/handlekurv/');
    await expect(page.getByRole('link', { name: 'Kabelholder med fire spor' })).toBeVisible();
    await expect(page.getByText('Ingen betaling tas her.')).toBeVisible();
    await page.getByLabel('Navn').fill('Test Testesen');
    await page.getByLabel('E-post').fill('test@example.com');
    await page.getByRole('button', { name: 'Send bestillingsforespørsel' }).click();
    await expect(page.getByRole('heading', { name: 'Takk, forespørselen er sendt.' })).toBeVisible();
    await expect(page.getByText(/Referanse DP-\d{8}-/)).toBeVisible();
    await expect(page.locator('[data-kurvantall]')).toBeHidden();
  });

  test('a Skaperverksted design in the cart shows «pris avtales» and is sent with the request', async ({
    page,
  }) => {
    await page.goto('/handlekurv/');
    await page.evaluate(() => {
      const designId = 'design_e2etest1';
      const dokument = {
        versjon: 1,
        id: 'd1',
        generator: 'signgen',
        navn: 'Dørskilt',
        plate: { bredde: 256, dybde: 256, hoyde: 256, printerProfilId: 'x' },
        lag: [],
        objekter: {},
        rekkefolge: {},
        parametre: {},
        meta: { opprettet: '2026-09-28', endret: '2026-09-28' },
      };
      localStorage.setItem(
        `dp-design:${designId}`,
        JSON.stringify({
          id: designId,
          generator: 'signgen',
          navn: 'Dørskilt',
          lagret: '2026-09-28T22:00:00Z',
          sammendrag: ['Mål: 160 × 45 × 6 mm'],
          dokument,
        }),
      );
      localStorage.setItem(
        'dp-kurv-v1',
        JSON.stringify([
          {
            nokkel: 'skaperverksted-signgen|Lag=2',
            produktId: 'skaperverksted-signgen',
            navn: 'Skilt fra Sign Forge: Dørskilt',
            antall: 1,
            enhetspris: null,
            valg: { Lag: '2' },
            designId,
          },
        ]),
      );
    });
    await page.reload();
    await expect(page.getByText('Skilt fra Sign Forge: Dørskilt').first()).toBeVisible();
    await expect(page.getByText('Pris avtales', { exact: true })).toBeVisible();
    await expect(page.getByText('Laget i Skaperverksted')).toBeVisible();
    await page.getByLabel('Navn').fill('Test Testesen');
    await page.getByLabel('E-post').fill('test@example.com');
    await page.getByRole('button', { name: 'Send bestillingsforespørsel' }).click();
    await expect(page.getByRole('heading', { name: 'Takk, forespørselen er sendt.' })).toBeVisible();
  });

  test('empty cart offers a way on', async ({ page }) => {
    await page.goto('/handlekurv/');
    await expect(page.getByRole('heading', { name: 'Handlekurven er tom.' })).toBeVisible();
  });

  test('order route rejects invalid requests', async ({ request }) => {
    const svar = await request.post('/api/bestilling/', {
      data: { navn: 'A', epost: 'nei', linjer: [] },
    });
    expect(svar.status()).toBe(400);
    expect((await svar.json()).ok).toBe(false);
  });

  for (const sti of ['/produkter/', '/produkter/spiralvase/', '/handlekurv/']) {
    test(`has no axe violations: ${sti}`, async ({ page }) => {
      await page.goto(sti);
      const resultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(resultat.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }

  test('the open product window has no axe violations', async ({ page }) => {
    await page.goto('/produkter/');
    await page.waitForFunction(() => document.documentElement.dataset.produktvindu === 'klar');
    await page.locator('[data-produktlenke]').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(400);
    const resultat = await new AxeBuilder({ page }).include('[data-produktvindu]').analyze();
    expect(resultat.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
