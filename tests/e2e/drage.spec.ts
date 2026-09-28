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
});
