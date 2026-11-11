import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** The page texts Studio edits start from the files in src/content/sider/. */

const lesJson = (fil: string) => JSON.parse(readFileSync(fil, 'utf8')) as unknown;
const hent = (data: unknown, sti: string) =>
  sti.split('.').reduce<unknown>((v, d) => (v as Record<string, unknown>)[d], data);

test('hver redigerbar tekst på sidene viser det som står i innholdsfilen', async ({ page }) => {
  for (const sti of ['/', '/om/', '/spesialdesign/', '/bedrift/', '/kontakt/']) {
    await page.goto(sti);
    const felt = await page
      .locator('[data-rediger]')
      .evaluateAll((els) =>
        els.map((el) => [el.getAttribute('data-rediger')!, el.textContent ?? ''] as const),
      );
    expect(felt.length, sti).toBeGreaterThan(4);
    for (const [adresse, tekst] of felt) {
      const [fil, feltsti] = adresse.split('#') as [string, string];
      const verdi = hent(lesJson(`src/content/${fil}.json`), feltsti);
      expect(tekst.replace(/\s+/g, ' ').trim(), adresse).toBe(String(verdi));
    }
  }
});
