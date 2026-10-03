import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function apneDeler(page: Page) {
  // below 1024 px the parts panel is a sheet
  const knapp = page.locator('.arkvelger').getByRole('button', { name: 'Deler' });
  if (await knapp.isVisible()) await knapp.click();
}

async function apneEgenskaper(page: Page) {
  const knapp = page.locator('.arkvelger').getByRole('button', { name: 'Egenskaper' });
  if (await knapp.isVisible()) await knapp.click();
}

test.describe('BuildForge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/skaperverksted/buildforge/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#bf-kontroll')).toContainText('Grønn', { timeout: 20_000 });
  });

  test('viser prototypen ærlig og grønn startmodell', async ({ page }) => {
    await expect(page.getByText('Digital prototype: mekanikken er ikke fysisk testet')).toBeVisible();
    await apneEgenskaper(page);
    await expect(page.getByText('Fysisk profil:')).toBeVisible();
    await expect(page.getByText('Ikke testet', { exact: true }).first()).toBeVisible();
  });

  test('fester en del uten å dra, og angrer', async ({ page }) => {
    await apneDeler(page);
    await page.getByRole('button', { name: 'Kule', exact: true }).click();
    await page
      .getByRole('group', { name: 'Fest kule på' })
      .getByRole('button', { name: 'Toppen, foran' })
      .click();
    await expect(page.getByRole('button', { name: /^Kule Kule/ })).toBeVisible();
    await expect(page.locator('#bf-kontroll')).toContainText(/Grønn|Gul/, { timeout: 20_000 });
    // øyne passer bare foran på toppen
    await page.getByRole('button', { name: 'Øyne', exact: true }).click();
    const punkter = page.getByRole('group', { name: 'Fest øyne på' });
    await expect(punkter.getByRole('button', { name: 'Underdelen, foran' })).toBeDisabled();
    await punkter.getByRole('button', { name: 'Avbryt' }).click();
    await page.getByRole('button', { name: 'Angre' }).first().click();
    await expect(page.getByRole('button', { name: /^Kule Kule/ })).toHaveCount(0);
  });

  test('Enkel og Avansert viser samme modell, og en kollisjon blir rød og stopper eksport', async ({
    page,
  }) => {
    await apneDeler(page);
    await page.getByRole('button', { name: /^Knappetopp/ }).click();
    await apneEgenskaper(page);
    await page.getByRole('radio', { name: 'Avansert' }).click();
    const z = page.getByLabel('Posisjon Z');
    await expect(z).toHaveValue('26,5');
    await z.fill('14');
    await z.press('Enter');
    await expect(page.locator('#bf-kontroll')).toContainText('Rød', { timeout: 20_000 });
    await expect(page.locator('.bf-funnliste')).toContainText('Toppen treffer underdelen');
    await page.getByRole('radio', { name: 'Enkel' }).click();
    await expect(page.locator('#bf-kontroll')).toContainText('Rød');

    await page.getByRole('button', { name: /Eksporter/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Se over før eksport' });
    await expect(dialog.getByText('Kontrollen fant feil')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: 'Last ned 3MF' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /kontrollrapport/ })).toBeVisible();
  });

  test('grønn prototype eksporteres som én STL per del med rapport', async ({ page }) => {
    await page.getByRole('button', { name: /Eksporter/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Se over før eksport' });
    await expect(dialog.getByText('Dette er en prototype')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: 'STL: Topp' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'STL: Underdel' })).toBeVisible();
    const nedlasting = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /kontrollrapport/ }).click();
    const fil = await nedlasting;
    expect(fil.suggestedFilename()).toMatch(/\.kontroll\.json$/);
    await expect(dialog.getByRole('button', { name: /Legg i handlekurven/ })).toHaveCount(0);
  });

  test('har ingen tilgjengelighetsfeil', async ({ page, isMobile }) => {
    const r = await new AxeBuilder({ page })
      .include(isMobile ? '.bunnbrett' : '.flytpanel')
      .include('.bunnbrett')
      .include(isMobile ? '.bunnbrett' : '.inspektor')
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
