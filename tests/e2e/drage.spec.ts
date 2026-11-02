import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Turn the open (autosaved) dragon into one made with the part picker, as every project before the drawing editor. */
async function apneSomKlassisk(page: Page) {
  await page.goto('/skaperverksted/drage/');
  await expect(page.getByRole('region', { name: 'Ovenfra' })).toBeVisible();
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => /dp-verksted:drage$/.test(k)));
  await page.evaluate(() => {
    const nokkel = Object.keys(localStorage).find((k) => /dp-verksted:drage$/.test(k))!;
    const dok = JSON.parse(localStorage.getItem(nokkel)!);
    delete dok.parametre.modus;
    delete dok.parametre.tegning;
    localStorage.setItem(nokkel, JSON.stringify(dok));
  });
  await page.reload();
}

test.describe('Tegnet drage', () => {
  test('tegnes ovenfra, vises fra siden og i 3D, og kan angres', async ({ page }) => {
    await page.goto('/skaperverksted/drage/');
    await expect(page.getByRole('region', { name: 'Ovenfra' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Fra siden' })).toBeVisible();
    // small screens share the lower pane between the side view and 3D
    const fane3d = page.getByRole('tab', { name: '3D' });
    if (await fane3d.isVisible()) {
      await fane3d.click();
      await expect(page.getByRole('region', { name: '3D' })).toBeVisible();
      await page.getByRole('tab', { name: 'Fra siden' }).click();
    } else await expect(page.getByRole('region', { name: '3D' })).toBeVisible();
    await expect(page.locator('.dt-status')).toContainText('deler');

    // Keyboard: a spine point moves with the arrow keys, and undo puts it back.
    const punkt = page.getByRole('button', { name: /^Ryggpunkt 2:/ });
    const for_ = await punkt.getAttribute('aria-label');
    await punkt.focus();
    await page.keyboard.press('Shift+ArrowUp');
    await expect(punkt).not.toHaveAttribute('aria-label', for_!);
    await page.getByRole('button', { name: 'Angre' }).first().click();
    await expect(page.getByRole('button', { name: /^Ryggpunkt 2:/ })).toHaveAttribute('aria-label', for_!);

    // Draw a new spine in one stroke.
    await page.getByRole('button', { name: 'Tegn rygg', exact: true }).click();
    const flate = (await page.locator('.dt-ovenfra .dt-maal').boundingBox())!;
    const x = flate.x + flate.width / 2;
    const y = flate.y + flate.height / 2;
    await page.mouse.move(x + 160, y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(x + 160 - i * 16, y + Math.sin(i / 6) * 30);
    await page.mouse.up();
    await expect(page.getByRole('status').filter({ hasText: 'Ryggen er tegnet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Juster', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('har ingen tilgjengelighetsfeil', async ({ page }) => {
    await page.goto('/skaperverksted/drage/');
    await expect(page.getByRole('region', { name: 'Ovenfra' })).toBeVisible();
    const r = await new AxeBuilder({ page }).include('.dt-lerret').include('.inspektor').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});

test.describe('Drage fra delvelgeren', () => {
  test('åpnes som før, bytter deler og kan angres', async ({ page }) => {
    await apneSomKlassisk(page);
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
    await apneSomKlassisk(page);
    await expect(page.getByRole('tab', { name: 'Kropp' })).toBeVisible();
    const r = await new AxeBuilder({ page }).include('.bunnbrett').include('.inspektor').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('kan gjøres om til en tegnet drage', async ({ page }) => {
    await apneSomKlassisk(page);
    // small screens keep the properties in a sheet
    const egenskaper = page.getByRole('button', { name: 'Egenskaper', exact: true });
    await expect(page.getByRole('tab', { name: 'Kropp' })).toBeVisible();
    if (await egenskaper.isVisible()) await egenskaper.click();
    await page.getByRole('button', { name: 'Tegn dragen selv' }).click();
    await expect(page.getByRole('region', { name: 'Ovenfra' })).toBeVisible();
  });
});
