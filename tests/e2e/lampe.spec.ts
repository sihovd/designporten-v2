import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Lampegeneratoren', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/skaperverksted/lampe/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('.lampe-grep.hoyde')).toBeVisible({ timeout: 15_000 });
  });

  test('bygger lampen og viser mål i statuslinjen', async ({ page }) => {
    await expect(page.locator('.statuslinje')).toContainText('180 mm');
  });

  test('høyden kan endres med tastaturet på håndtaket og angres', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Tastatur testes på desktop');
    const hoyde = page.getByRole('textbox', { name: 'Høyde', exact: true });
    await page.locator('.lampe-grep.hoyde').focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await expect(hoyde).toHaveValue('191');
    await page.keyboard.press('Control+z');
    await expect(hoyde).toHaveValue('180');
  });

  test('dra ringen vrir mønsteret', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Dra testes med mus på desktop');
    const b = (await page.locator('.lampe-grep.vri').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('textbox', { name: 'Vridning', exact: true })).toHaveValue('120');
  });

  // Scoped to the lamp's own UI; the shared workshop bar is covered by the shell's tests.
  test('har ingen alvorlige tilgjengelighetsfeil', async ({ page, isMobile }) => {
    if (isMobile) await page.getByRole('button', { name: 'Egenskaper' }).click();
    const r = await new AxeBuilder({ page })
      .include('.lampe-overlegg')
      .include(isMobile ? '.ark' : '.inspektor')
      .analyze();
    const alvorlige = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(alvorlige.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });
});
