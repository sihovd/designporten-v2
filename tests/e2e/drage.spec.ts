import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Artikulert drage', () => {
  test('bytter deler og kan angres', async ({ page }) => {
    await page.goto('/skaperverksted/drage/');
    await expect(page.getByText('Foreløpige dragedeler')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Lubben/ })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('tab', { name: 'Vinger' }).click();
    await page.getByRole('radio', { name: /Store/ }).click();
    await expect(page.getByRole('radio', { name: /Store/ })).toHaveAttribute('aria-checked', 'true');

    // Keyboard: arrow keys move between variants and select them.
    await page.getByRole('radio', { name: /Store/ }).press('ArrowRight');
    await expect(page.getByRole('radio', { name: /Flaggermus/ })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Angre' }).first().click();
    await expect(page.getByRole('radio', { name: /Store/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('har ingen tilgjengelighetsfeil', async ({ page }) => {
    await page.goto('/skaperverksted/drage/');
    await expect(page.getByRole('tab', { name: 'Kropp' })).toBeVisible();
    const r = await new AxeBuilder({ page }).include('.bunnbrett').include('.inspektor').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('bygger med brikker: kobler fra, kobler til igjen og angrer', async ({ page }) => {
    await page.goto('/skaperverksted/drage/');
    await expect(page.getByRole('tab', { name: 'Kropp' })).toBeVisible();
    const egenskaper = page.getByRole('button', { name: 'Egenskaper', exact: true });
    if (await egenskaper.isVisible()) await egenskaper.click();
    await page.getByRole('button', { name: 'Bygg med brikker' }).click();
    await expect(page.getByRole('button', { name: /Kroppsledd, avrundet 3/ })).toBeVisible();

    await page.getByRole('button', { name: /^Hale med spade/ }).click();
    await page.getByRole('button', { name: 'Koble fra' }).click();
    await expect(page.getByText(/Løs gruppe 1/)).toBeVisible();

    // connect it again through the point list and the preview
    await page.getByRole('button', { name: 'Koble til …' }).click();
    await page.getByRole('button', { name: 'Kroppsledd, avrundet 3, sokkel bak', exact: true }).click();
    await page.locator('.panel').getByRole('button', { name: 'Koble', exact: true }).click();
    await expect(page.getByText(/Løs gruppe 1/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Angre' }).first().click();
    await expect(page.getByText(/Løs gruppe 1/)).toBeVisible();
  });

  test('brikkebyggeren har ingen tilgjengelighetsfeil', async ({ page }) => {
    await page.goto('/skaperverksted/drage/');
    await expect(page.getByRole('tab', { name: 'Kropp' })).toBeVisible();
    const egenskaper = page.getByRole('button', { name: 'Egenskaper', exact: true });
    if (await egenskaper.isVisible()) await egenskaper.click();
    await page.getByRole('button', { name: 'Bygg med brikker' }).click();
    await page.getByRole('button', { name: /Kroppsledd, avrundet 2/ }).click();
    await expect(page.getByRole('tab', { name: 'Hoder' })).toBeVisible();
    const r = await new AxeBuilder({ page }).include('.bunnbrett').include('.inspektor').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
