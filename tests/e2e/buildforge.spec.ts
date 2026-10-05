import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function apneDeler(page: Page) {
  // below 1024 px the parts panel is a sheet
  const knapp = page.locator('.arkvelger').getByRole('button', { name: 'Deler' });
  if ((await knapp.isVisible()) && (await knapp.getAttribute('aria-pressed')) !== 'true') await knapp.click();
}

/** Properties open on demand: the sheet below 1024 px, the floating panel from the top bar above. */
async function apneEgenskaper(page: Page) {
  const ark = page.locator('.arkvelger').getByRole('button', { name: 'Egenskaper' });
  const linje = page.locator('.verkstedlinje').getByRole('button', { name: 'Egenskaper' });
  const knapp = (await ark.isVisible()) ? ark : linje;
  if ((await knapp.getAttribute('aria-pressed')) !== 'true') await knapp.click();
}

/** The left panel's tabs (modular builder). */
async function fane(page: Page, navn: 'Bibliotek' | 'Modell') {
  await apneDeler(page);
  const f = page.getByRole('tab', { name: navn });
  if ((await f.getAttribute('aria-selected')) !== 'true') await f.click();
}

async function apneNy(page: Page) {
  await page.goto('/skaperverksted/buildforge/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

/** A new document opens «La oss bygge en …» over the canvas; choose a start in it. */
async function velgStart(page: Page, navn: RegExp) {
  const velger = page.getByRole('region', { name: 'La oss bygge en …' });
  await expect(velger).toBeVisible({ timeout: 20_000 });
  await velger.getByRole('button', { name: navn }).click();
  await expect(velger).toHaveCount(0);
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
    if (!isMobile) await apneEgenskaper(page);
    const r = await new AxeBuilder({ page })
      .include(isMobile ? '.bunnbrett' : '.flytpanel')
      .include('.bunnbrett')
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});

test.describe('BuildForge-modulbygger', () => {
  test.beforeEach(async ({ page }) => {
    await apneNy(page);
  });

  test('startvelgeren ligger over lerretet og har ingen tilgjengelighetsfeil', async ({ page }) => {
    const velger = page.getByRole('region', { name: 'La oss bygge en …' });
    await expect(velger).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const r = await new AxeBuilder({ page }).include('.bf-startvelger').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(velger).toHaveCount(0);
  });

  test('bygger et menneske uten å dra, bytter ut en del og går inn i den', async ({ page }) => {
    await velgStart(page, /^Menneske/);
    await fane(page, 'Modell');
    const tre = page.getByRole('region', { name: 'Modellen' });
    await expect(tre.getByRole('button', { name: /Smal kropp/ })).toBeVisible();

    // choose a part card, then a connector from the list
    await fane(page, 'Bibliotek');
    await page.getByRole('button', { name: 'Rundt hode', exact: true }).click();
    await page
      .getByRole('group', { name: 'Plasser rundt hode' })
      .getByRole('button', { name: 'Smal kropp · hals' })
      .click();
    await expect(page.locator('#bf-kontroll')).toContainText('Grønn', { timeout: 30_000 });
    await fane(page, 'Modell');
    await expect(tre.getByRole('button', { name: /Rundt hode/ })).toBeVisible();

    await fane(page, 'Bibliotek');
    await page.getByRole('button', { name: 'Tynn arm', exact: true }).click();
    await page
      .getByRole('group', { name: 'Plasser tynn arm' })
      .getByRole('button', { name: 'Smal kropp · høyre skulder' })
      .click();
    await expect(page.locator('#bf-kontroll')).toContainText('Grønn', { timeout: 30_000 });
    await expect(page.locator('.statuslinje')).toContainText('3 deler', { ignoreCase: true });

    // replace the head: select it, «Bytt ut» in the properties, choose the new one
    await fane(page, 'Modell');
    await tre.getByRole('button', { name: /Rundt hode/ }).click();
    await apneEgenskaper(page);
    await page.getByRole('button', { name: 'Bytt ut', exact: true }).click();
    await fane(page, 'Bibliotek');
    await page.getByRole('button', { name: 'Dragehode', exact: true }).click();
    await fane(page, 'Modell');
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
    // its connectors are listed on their own tab
    await page.getByRole('tab', { name: /Koblinger/ }).click();
    await expect(page.getByRole('list', { name: 'Koblinger på dragehode' })).toContainText('Hunn');
    await page.locator('body').press('Escape');
    await page.locator('body').press('Escape');
    await expect(page.getByRole('navigation', { name: 'Hvor du er', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: /Eksporter/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Se over før eksport' });
    await expect(dialog.getByText('Leddene er ikke fysisk testet')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: 'STL: Dragehode' })).toBeVisible();
  });

  test('gjør et ledd om til kuleledd og bøyer det innenfor grensen', async ({ page }) => {
    await velgStart(page, /^Menneske/);
    await fane(page, 'Bibliotek');
    await page.getByRole('button', { name: 'Tynn arm', exact: true }).click();
    await page
      .getByRole('group', { name: 'Plasser tynn arm' })
      .getByRole('button', { name: 'Smal kropp · venstre skulder' })
      .click();
    await expect(page.locator('#bf-kontroll')).toContainText('Grønn', { timeout: 30_000 });
    // the new arm is selected; its joint is in the properties
    await apneEgenskaper(page);
    const ledd = page.getByRole('region', { name: 'Ledd' });
    await ledd.getByRole('radio', { name: 'Kuleledd' }).click();
    await expect(ledd.getByRole('radio', { name: 'Kuleledd' })).toHaveAttribute('aria-checked', 'true');
    await ledd.getByRole('slider', { name: /^Bøy\b/ }).fill('20');
    await expect(page.locator('#bf-kontroll')).toContainText(/Grønn|Gul/, { timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Kuleleddprofil' })).toContainText('Prøveprofil');

    await page.getByRole('button', { name: /Eksporter/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Se over før eksport' });
    await expect(dialog.getByText('Leddene er ikke fysisk testet')).toBeVisible({ timeout: 20_000 });
  });

  test('høyreklikk åpner en ringmeny som kan brukes med tastatur', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Høyreklikk med mus; på berøring er det et langt trykk');
    await velgStart(page, /^Menneske/);
    const lerret = page.locator('.visning3d canvas').first();
    const l = (await lerret.boundingBox())!;
    // on empty plate: the model menu
    await page.mouse.click(l.x + l.width - 120, l.y + l.height - 160, { button: 'right' });
    const meny = page.getByRole('menu', { name: 'Valg for Modellen' });
    await expect(meny.getByRole('menuitem', { name: 'Legg til del' })).toBeVisible();
    await expect(meny.getByRole('menuitem', { name: 'Legg til del' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(meny.getByRole('menuitem', { name: 'Vis modelltreet' })).toBeFocused();
    const r = await new AxeBuilder({ page }).include('.bf-radial').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(meny).toHaveCount(0);

    // on a selected part, from the keyboard: the part's menu
    await fane(page, 'Modell');
    await page
      .getByRole('region', { name: 'Modellen' })
      .getByRole('button', { name: /Smal kropp/ })
      .click();
    await page.keyboard.press('Shift+F10');
    const delmeny = page.getByRole('menu', { name: 'Valg for Smal kropp' });
    await expect(delmeny.getByRole('menuitem', { name: 'Slett' })).toBeDisabled();
    await delmeny.getByRole('menuitem', { name: 'Rediger' }).click();
    await expect(page.getByRole('navigation', { name: 'Hvor du er', exact: true })).toContainText(
      'Smal kropp',
    );
  });

  test('drar en kroppsdel ut på platen som en løs del', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Dra med mus; på berøring holdes kortet før det dras');
    await velgStart(page, /^Skapning/);
    await fane(page, 'Bibliotek');
    const knapp = page.getByRole('button', { name: 'Vinge', exact: true });
    await knapp.scrollIntoViewIfNeeded();
    const lerret = page.locator('.visning3d canvas').first();
    const b = (await knapp.boundingBox())!;
    const l = (await lerret.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(l.x + l.width * 0.85, l.y + l.height * 0.75, { steps: 12 });
    await expect(page.locator('.bf-drahint')).toBeVisible();
    await page.mouse.up();
    await fane(page, 'Modell');
    const tre = page.getByRole('region', { name: 'Modellen' });
    await expect(tre.getByRole('heading', { name: 'Løse deler' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#bf-kontroll')).toContainText(/Gul|Rød/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Angre' }).first().click();
    await expect(tre.getByRole('heading', { name: 'Løse deler' })).toHaveCount(0);
  });

  test('modulbyggeren har ingen tilgjengelighetsfeil', async ({ page, isMobile }) => {
    await velgStart(page, /^Drage/);
    await fane(page, 'Bibliotek');
    await page.getByRole('button', { name: 'Vinge', exact: true }).click();
    const r = await new AxeBuilder({ page })
      .include(isMobile ? '.ark' : '.flytpanel')
      .include('.bf-statusbrikke')
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
