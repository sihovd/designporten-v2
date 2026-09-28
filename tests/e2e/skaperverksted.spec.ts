import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Skaperverksted', () => {
  test('huben viser generatorene', async ({ page }) => {
    await page.goto('/skaperverksted/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Signgen/ }).first()).toBeVisible();
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});

test.describe('Signgen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/skaperverksted/signgen/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('.statuslinje')).toContainText('mm');
  });

  test('legger til et rektangel og angrer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Tegning med mus testes på desktop');
    const lerret = page.locator('canvas').first();
    const b = (await lerret.boundingBox())!;
    const antallFor = await page.locator('.objektliste li').count();
    await page.keyboard.press('r');
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.35, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.objektliste li')).toHaveCount(antallFor + 1);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.objektliste li')).toHaveCount(antallFor);
  });

  test('eksporterer 3MF og STL', async ({ page }) => {
    await page.getByRole('button', { name: /Eksporter/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Se over før eksport' });
    await expect(dialog.getByText('Mål')).toBeVisible({ timeout: 20_000 });
    const [tremf] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Last ned 3MF' }).click(),
    ]);
    expect(tremf.suggestedFilename()).toMatch(/\.3mf$/);
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Last ned STL' }).click(),
    ]);
    expect(stl.suggestedFilename()).toMatch(/\.stl$/);
  });

  test('lager skilt fra CSV', async ({ page, isMobile }) => {
    if (isMobile) await page.getByRole('button', { name: 'Egenskaper' }).click();
    await page.getByRole('button', { name: /Lag skilt fra CSV/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Lag skilt fra CSV' });
    await dialog.getByRole('button', { name: 'Gjør til felt' }).click();
    await dialog.getByLabel('Eller lim inn').fill('navn;Tekst\nOla;Lilla\nKari;Cyan\nPer;Neonoransje');
    await dialog.getByRole('button', { name: 'Bruk teksten' }).click();
    await expect(dialog.getByText('3 skilt, 1 med problemer')).toBeVisible();
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const [zip] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Lag 2 skilt' }).click(),
    ]);
    expect(zip.suggestedFilename()).toMatch(/batch\.zip$/);
  });

  test('har ingen tilgjengelighetsfeil i verkstedet', async ({ page }) => {
    const r = await new AxeBuilder({ page }).exclude('canvas').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
