import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The check chip has a result for the current project. */
async function ferdig(page: Page) {
  await expect(page.locator('.cf-status')).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.cf-status')).not.toContainText('Kontrollerer', { timeout: 40_000 });
}

/** Properties: the sheet below 1024 px, the fixed panel above. */
async function apneEgenskaper(page: Page) {
  const ark = page.locator('.arkvelger').getByRole('button', { name: 'Egenskaper' });
  if ((await ark.isVisible()) && (await ark.getAttribute('aria-pressed')) !== 'true') await ark.click();
}

async function lukkEgenskaper(page: Page) {
  const ark = page.locator('.arkvelger').getByRole('button', { name: 'Egenskaper' });
  if ((await ark.isVisible()) && (await ark.getAttribute('aria-pressed')) === 'true') await ark.click();
}

async function hodeOgKropp(page: Page) {
  await page.getByRole('button', { name: 'Hode', exact: true }).click();
  await ferdig(page);
  await lukkEgenskaper(page);
  await page.getByRole('button', { name: 'Overkropp', exact: true }).click();
  await page
    .getByRole('group', { name: 'Fest overkropp på' })
    .getByRole('button', { name: 'Hals på Hode' })
    .click();
  await ferdig(page);
}

test.describe('Creature Forge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/skaperverksted/creatureforge/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Start med et hode' })).toBeVisible({ timeout: 20_000 });
  });

  test('starter med et hode og fester overkroppen på halsen med et ledd', async ({ page }) => {
    await expect(page.getByText('Prototype: leddene er ikke testprintet')).toBeVisible();
    // the upper body has nowhere to go before there is a head
    await expect(page.getByRole('button', { name: 'Overkropp', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await hodeOgKropp(page);
    await expect(page.getByRole('button', { name: 'Ledd mellom Hode og Overkropp' })).toBeVisible();
    await expect(page.locator('.cf-status')).toContainText('Ikke fysisk testet');
    // the neck is taken: no free point fits another upper body
    await expect(page.getByRole('button', { name: 'Overkropp', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.getByRole('button', { name: 'Angre' }).click();
    await expect(page.getByRole('button', { name: 'Ledd mellom Hode og Overkropp' })).toHaveCount(0);
  });

  test('dra overkroppen til halsen', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Dra med mus; på berøring brukes listen');
    await page.getByRole('button', { name: 'Hode', exact: true }).click();
    await ferdig(page);
    const knapp = (await page.getByRole('button', { name: 'Overkropp', exact: true }).boundingBox())!;
    await page.mouse.move(knapp.x + knapp.width / 2, knapp.y + knapp.height / 2);
    await page.mouse.down();
    await page.mouse.move(knapp.x + 40, knapp.y - 60, { steps: 5 });
    const snap = (await page.locator('.cf-snap').first().boundingBox())!;
    await page.mouse.move(snap.x + snap.width / 2 + 8, snap.y + snap.height / 2 + 8, { steps: 6 });
    await expect(page.locator('.cf-snap.aktiv')).toHaveCount(1);
    await expect(page.locator('.cf-drahjelp')).toContainText('Slipp for å feste overkropp på hals på hode');
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Ledd mellom Hode og Overkropp' })).toBeVisible();
  });

  test('når hodet flyttes, følger overkroppen og leddet med', async ({ page }) => {
    await hodeOgKropp(page);
    const for_ = (await page.locator('.cf-leddmerke').boundingBox())!;
    await page.locator('.cf-status').click();
    await apneEgenskaper(page);
    await page.locator('.cf-liste button').first().click();
    const x = page.getByRole('textbox', { name: 'Posisjon X' });
    await x.fill('40');
    await x.press('Enter');
    await ferdig(page);
    await lukkEgenskaper(page);
    await expect
      .poll(async () => (await page.locator('.cf-leddmerke').boundingBox())!.x)
      .toBeGreaterThan(for_.x + 20);
  });

  test('leddet og kuppelen justeres hver for seg', async ({ page }) => {
    await hodeOgKropp(page);
    await page.getByRole('button', { name: 'Ledd mellom Hode og Overkropp' }).click();
    await apneEgenskaper(page);
    for (const navn of [
      'Diameter',
      'Dybde',
      'Vinkel',
      'Orientering',
      'Tykkelse i sentrum',
      'Tykkelse i kanten',
    ])
      await expect(page.getByRole('textbox', { name: navn, exact: true })).toBeVisible();
    const senter = page.getByRole('textbox', { name: 'Tykkelse i sentrum', exact: true });
    await senter.fill('8');
    await senter.press('Enter');
    await expect(senter).toHaveValue('8');
    await expect(page.getByRole('textbox', { name: 'Tykkelse i kanten', exact: true })).toHaveValue('2');
    const avstand = page.getByRole('textbox', { name: 'Avstand', exact: true });
    await avstand.fill('-2');
    await avstand.press('Enter');
    await ferdig(page);
    await expect(page.getByText(/Sving om leddets akse/)).toBeVisible();
    await page.getByRole('radio', { name: 'Knottledd (utforskes)' }).click();
    await expect(page.getByRole('radio', { name: 'Knottledd (utforskes)' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('bare én undermeny er åpen, og Tilbehør er planlagt', async ({ page }) => {
    await page.getByRole('tab', { name: /Tilbehør/ }).click();
    await expect(page.getByText('Tilbehør kommer i en senere fase.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hode', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Kropp' }).click();
    await expect(page.getByText('Tilbehør kommer i en senere fase.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Hode', exact: true }).click();
    await ferdig(page);
    await lukkEgenskaper(page);
    await page.getByRole('button', { name: 'Overkropp', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Fest overkropp på' })).toBeVisible();
    await page.getByRole('tab', { name: /Tekstur/ }).click();
    await expect(page.getByRole('group', { name: 'Fest overkropp på' })).toHaveCount(0);
  });

  test('eksporten er én STL per del med kontrollrapport', async ({ page }) => {
    await hodeOgKropp(page);
    await page.getByRole('button', { name: /Eksporter/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Se over før eksport' });
    await expect(dialog.getByText(/Filene er i printposisjon/)).toBeVisible({ timeout: 20_000 });
    await dialog.locator('summary', { hasText: 'Last ned' }).click();
    await expect(dialog.getByRole('menuitem', { name: 'Last ned STL: Hode' })).toBeVisible();
    await expect(dialog.getByRole('menuitem', { name: 'Last ned STL: Overkropp' })).toBeVisible();
    const nedlasting = page.waitForEvent('download');
    await dialog.getByRole('menuitem', { name: /kontrollrapport/i }).click();
    expect((await nedlasting).suggestedFilename()).toMatch(/kontrollrapport\.json$/);
  });

  test('har ingen tilgjengelighetsfeil', async ({ page, isMobile }) => {
    await hodeOgKropp(page);
    await page.getByRole('button', { name: 'Ledd mellom Hode og Overkropp' }).click();
    await apneEgenskaper(page);
    const r = await new AxeBuilder({ page })
      .include('.cf-overlegg')
      .include(isMobile ? '.ark' : '.inspektor')
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
