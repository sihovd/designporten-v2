import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function apneDeler(page: Page) {
  // below 1024 px the parts panel is a sheet
  const knapp = page.locator('.arkvelger').getByRole('button', { name: 'Deler' });
  if ((await knapp.isVisible()) && (await knapp.getAttribute('aria-pressed')) !== 'true') await knapp.click();
}

async function apneEgenskaper(page: Page) {
  const knapp = page.locator('.arkvelger').getByRole('button', { name: 'Egenskaper' });
  if ((await knapp.isVisible()) && (await knapp.getAttribute('aria-pressed')) !== 'true') await knapp.click();
}

async function apneNy(page: Page) {
  await page.goto('/skaperverksted/buildforge/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

/** A new document opens «La oss bygge en …»; choose a start in it. */
async function velgStart(page: Page, navn: RegExp) {
  const dialog = page.getByRole('dialog', { name: 'La oss bygge en …' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('button', { name: navn }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#bf-kontroll')).toContainText('Grønn', { timeout: 30_000 });
}

test.describe('BuildForge-klikker', () => {
  test.beforeEach(async ({ page }) => {
    await apneNy(page);
    await velgStart(page, /^Enkel knapp/);
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

test.describe('BuildForge-modulbygger', () => {
  test.beforeEach(async ({ page }) => {
    await apneNy(page);
  });

  test('startvelgeren har ingen tilgjengelighetsfeil', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'La oss bygge en …' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const r = await new AxeBuilder({ page }).include('.bf-startvelger').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('bygger et menneske uten å dra, bytter ut en del og går inn i den', async ({ page }) => {
    await velgStart(page, /^Menneske/);
    await apneDeler(page);
    const tre = page.getByRole('region', { name: 'Modellen' });
    await expect(tre.getByRole('button', { name: /Smal kropp/ })).toBeVisible();

    // choose a part, then a connector from the list
    await page.getByRole('button', { name: 'Rundt hode', exact: true }).click();
    await page
      .getByRole('group', { name: 'Plasser rundt hode' })
      .getByRole('button', { name: 'Smal kropp · hals' })
      .click();
    await expect(page.locator('#bf-kontroll')).toContainText('Grønn', { timeout: 30_000 });
    await apneDeler(page);
    await expect(tre.getByRole('button', { name: /Rundt hode/ })).toBeVisible();

    await page.getByRole('button', { name: 'Tynn arm', exact: true }).click();
    await page
      .getByRole('group', { name: 'Plasser tynn arm' })
      .getByRole('button', { name: 'Smal kropp · høyre skulder' })
      .click();
    await expect(page.locator('#bf-kontroll')).toContainText('Grønn', { timeout: 30_000 });
    await expect(page.locator('.statuslinje')).toContainText('3 deler', { ignoreCase: true });

    // replace the head: select it, «Bytt ut», choose the new one
    await apneDeler(page);
    await tre.getByRole('button', { name: /Rundt hode/ }).click();
    await apneEgenskaper(page);
    await page.getByRole('button', { name: 'Bytt ut', exact: true }).click();
    await apneDeler(page);
    await page.getByRole('button', { name: 'Dragehode', exact: true }).click();
    await expect(tre.getByRole('button', { name: /Dragehode/ })).toBeVisible();
    await expect(tre.getByRole('button', { name: /Rundt hode/ })).toHaveCount(0);
    await expect(page.locator('#bf-kontroll')).toContainText('Grønn', { timeout: 30_000 });

    // work inside the part, then Esc out
    await tre.getByRole('button', { name: /Dragehode/ }).dblclick();
    await expect(page.getByRole('navigation', { name: 'Hvor du er', exact: true })).toContainText(
      'Dragehode',
    );
    await page.getByRole('button', { name: 'Horn', exact: true }).click();
    await page.getByRole('group', { name: 'Fest horn på' }).getByRole('button').first().click();
    await expect(page.locator('#bf-kontroll')).toContainText(/Grønn|Gul/, { timeout: 30_000 });
    await page.locator('body').press('Escape');
    await page.locator('body').press('Escape');
    await expect(page.getByRole('navigation', { name: 'Hvor du er', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: /Eksporter/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Se over før eksport' });
    await expect(dialog.getByText('Leddene er ikke fysisk testet')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: 'STL: Dragehode' })).toBeVisible();
  });

  test('drar en kroppsdel ut på platen som en løs del', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Dra med mus; på berøring brukes valg og liste');
    await velgStart(page, /^Skapning/);
    const knapp = page.getByRole('button', { name: 'Vinge', exact: true });
    await knapp.scrollIntoViewIfNeeded();
    const lerret = page.locator('.visning3d canvas').first();
    const b = (await knapp.boundingBox())!;
    const l = (await lerret.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(l.x + l.width * 0.85, l.y + l.height * 0.8, { steps: 12 });
    await expect(page.locator('.bf-drahint')).toBeVisible();
    await page.mouse.up();
    const tre = page.getByRole('region', { name: 'Modellen' });
    await expect(tre.getByRole('heading', { name: 'Løse deler' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#bf-kontroll')).toContainText(/Gul|Rød/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Angre' }).first().click();
    await expect(tre.getByRole('heading', { name: 'Løse deler' })).toHaveCount(0);
  });

  test('modulbyggeren har ingen tilgjengelighetsfeil', async ({ page, isMobile }) => {
    await velgStart(page, /^Drage/);
    await apneDeler(page);
    await page.getByRole('button', { name: 'Vinge', exact: true }).click();
    const r = await new AxeBuilder({ page })
      .include(isMobile ? '.ark' : '.flytpanel')
      .include('.bunnbrett')
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
