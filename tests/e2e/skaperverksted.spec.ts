import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** A sheet with three shapes in three colours; the third has a hole. */
const ARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="20mm" viewBox="0 0 60 20">
<rect x="0" y="0" width="16" height="16" fill="#cc2222"/>
<circle cx="30" cy="8" r="8" fill="#2222cc"/>
<path fill="#22aa22" fill-rule="evenodd" d="M44 0h16v16h-16zM48 4v8h8v-8z"/>
</svg>`;

test.describe('Skaperverksted', () => {
  test('huben viser generatorene', async ({ page }) => {
    await page.goto('/skaperverksted/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign Forge/ }).first()).toBeVisible();
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});

test.describe('Signgen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/skaperverksted/signgen/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // a new sign opens with the start window: pick the colours
    const start = page.getByRole('dialog', { name: 'Velg fargene til skiltet' });
    await start.getByRole('button', { name: 'Start skiltet' }).click();
    await expect(start).toBeHidden();
    await expect(page.locator('.statuslinje')).toContainText('mm');
  });

  test('startvinduet lar deg velge og lagre en fargeprofil', async ({ page, isMobile }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const start = page.getByRole('dialog', { name: 'Velg fargene til skiltet' });
    await expect(start.getByText('Fargene i profilen (4)')).toBeVisible();
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await start.getByText('Natur', { exact: true }).click();
    await start.getByLabel('Legg til farge').selectOption({ label: 'Gull (PLA Silk)' });
    await expect(start.getByText('Fargene i profilen (5)')).toBeVisible();
    await start.getByLabel('Lagre som min profil').fill('Verkstedet');
    await start.getByRole('button', { name: 'Lagre profil' }).click();
    await expect(start.getByText('Mine profiler')).toBeVisible();
    await start.getByRole('button', { name: 'Start skiltet' }).click();
    await expect(page.locator('.statuslinje')).toContainText('mm');
    if (!isMobile) await expect(page.locator('.lagrad').first()).toContainText('Lys tre');
  });

  test('legger et nytt lag rundt teksten', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Lagpanelet testes på desktop');
    await page.getByRole('button', { name: '+ Nytt lag' }).click();
    await page.getByRole('button', { name: /Rundt teksten/ }).click();
    await expect(page.locator('.lagrad')).toHaveCount(2);
    await expect(page.locator('.lagrad').last()).toContainText('Rundt teksten');
    await expect(page.locator('.statuslinje')).toContainText('3 deler');
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

  test('legger et omriss rundt teksten og viser byggeplaten ved eksport', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Lagpanelet testes på desktop');
    const tekstlag = page.locator('.lagrad', { hasText: 'Tekst' }).first();
    await tekstlag.getByRole('button', { name: '+ Omriss' }).click();
    await expect(tekstlag.locator('.omrissrad')).toHaveCount(2);
    await expect(page.locator('.statuslinje')).toContainText('3 deler');
    await page.getByRole('button', { name: /Eksporter/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Se over før eksport' });
    await expect(dialog.getByRole('img', { name: /Byggeplaten sett ovenfra/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.locator('.filamentliste li')).toHaveCount(3);
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

  test('ny tekst går i det valgte tekstlaget og blir gruppert, «Tekstlag» gir et eget lag', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Lagpanelet og tegning med mus testes på desktop');
    const lagNavn = page.locator('.lagrad-hode .lag-navn', { hasText: 'Tekst' }).first();
    await lagNavn.click();
    const lerret = page.locator('canvas').first();
    const b = (await lerret.boundingBox())!;
    await page.keyboard.press('t');
    await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.8);
    await expect(page.locator('.lagrad').first()).toContainText('Gruppe');
    await expect(page.locator('.lagrad')).toHaveCount(1);
    // a new, empty text layer is a layer of its own
    await page.getByRole('button', { name: '+ Nytt lag' }).click();
    await page.getByRole('button', { name: /^Tekstlag/ }).click();
    await expect(page.locator('.lagrad')).toHaveCount(2);
  });

  test('bare det valgte omrisset vises i egenskapene', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Lagpanelet testes på desktop');
    const tekstlag = page.locator('.lagrad', { hasText: 'Tekst' }).first();
    await tekstlag.getByRole('button', { name: '+ Omriss' }).click();
    await tekstlag.locator('.omrissrad .lag-navn').first().click();
    await expect(page.locator('.omrissblokk')).toHaveCount(1);
    await page.getByRole('button', { name: 'Vis alle omrissene' }).click();
    await expect(page.locator('.omrissblokk')).toHaveCount(2);
  });

  test('legger et dekor fra galleriet i tekstlaget og drar det ut i et eget lag', async ({
    page,
    isMobile,
  }) => {
    await page.getByRole('button', { name: 'Dekor' }).click();
    const galleri = page.getByRole('dialog', { name: 'Dekor' });
    await expect(galleri.getByRole('button', { name: 'Enhjørning' })).toBeVisible();
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await galleri.getByRole('button', { name: 'Enhjørning' }).click();
    await expect(galleri).toBeHidden();
    if (isMobile) return;
    await expect(page.locator('.lagrad').first()).toContainText('Gruppe');
    const rad = page.locator('.objektliste li', { hasText: 'Enhjørning' });
    const bb = (await rad.boundingBox())!;
    await page.mouse.move(bb.x + 20, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + 30, bb.y + bb.height / 2 + 10, { steps: 4 });
    const ut = page.locator('.lag-ut');
    await expect(ut).toBeVisible();
    const ub = (await ut.boundingBox())!;
    await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.lagrad')).toHaveCount(2);
    await expect(page.locator('.lagrad').first()).toContainText('Pynt');
  });

  test('«Eksporter via CSV» åpner CSV-vinduet og viser byggeplaten med skiltene', async ({ page }) => {
    await page.getByRole('button', { name: /Eksporter/ }).click();
    const eksport = page.getByRole('dialog', { name: 'Se over før eksport' });
    await eksport.getByRole('button', { name: 'Eksporter via CSV' }).click();
    const dialog = page.getByRole('dialog', { name: 'Lag skilt fra CSV' });
    await dialog.getByRole('button', { name: 'Gjør til felt' }).click();
    await dialog.getByLabel('Eller lim inn').fill('navn\nOla\nKari');
    await dialog.getByRole('button', { name: 'Bruk teksten' }).click();
    await expect(dialog.getByText('2 skilt, ingen problemer')).toBeVisible();
    await expect(dialog.getByRole('img', { name: /Byggeplaten sett ovenfra/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('velger deler av en SVG, gir dem farger og legger dem på skiltet', async ({ page, isMobile }) => {
    const [valg] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'SVG', exact: true }).click(),
    ]);
    await valg.setFiles({ name: 'ark.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(ARK_SVG) });
    const dialog = page.getByRole('dialog', { name: 'Velg deler av SVG-en' });
    await expect(dialog.locator('.svgdeler-liste li')).toHaveCount(3);
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // click the circle in the drawing: it becomes the chosen part
    await dialog.locator('[data-del="1"]').click();
    await expect(dialog.getByRole('checkbox', { name: /Del 2/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'Behold bare de valgte' }).click();
    await expect(dialog.getByText('1 av 3 deler er med, i én farge.')).toBeVisible();
    // bring the square back in another colour than the circle
    await dialog.getByLabel('Farge på Del 2', { exact: true }).selectOption({ label: 'Cyan' });
    await dialog.getByLabel('Farge på Del 1', { exact: true }).selectOption({ label: 'Lilla' });
    await expect(dialog.getByText('2 av 3 deler er med, i 2 farger.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Legg på skiltet' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.statuslinje')).toContainText('4 deler');
    if (!isMobile) {
      await expect(page.locator('.lagrad')).toHaveCount(3);
      await expect(page.locator('.lagrad', { hasText: 'ark · Lilla' })).toHaveCount(1);
      await expect(page.locator('.lagrad', { hasText: 'ark · Cyan' })).toHaveCount(1);
      // the layers lie on the same level, which the layer's settings show
      await page.locator('.lagrad-hode .lag-navn', { hasText: 'ark · Cyan' }).click();
      await expect(page.getByLabel('Samme nivå som laget under')).toBeChecked();
    }
  });

  test('lagrer deler av en SVG i galleriet og beholder fargene', async ({ page, isMobile }) => {
    await page.getByRole('button', { name: 'Dekor' }).click();
    const galleri = page.getByRole('dialog', { name: 'Dekor' });
    const [valg] = await Promise.all([
      page.waitForEvent('filechooser'),
      galleri.getByRole('button', { name: 'Legg til egen vektor (SVG)' }).click(),
    ]);
    await valg.setFiles({ name: 'ark.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(ARK_SVG) });
    // the gallery steps aside for the part picker and comes back when it closes
    const velger = page.getByRole('dialog', { name: 'Velg deler av SVG-en' });
    await expect(velger).toBeVisible();
    await velger.getByLabel('Navn', { exact: true }).fill('Mine former');
    await velger.getByRole('button', { name: 'Lagre i galleriet' }).click();
    await expect(velger.getByText('«Mine former» er lagret i galleriet')).toBeVisible();
    await velger.getByRole('button', { name: 'Lukk' }).click();
    const tilbake = page.getByRole('dialog', { name: 'Dekor' });
    const egen = tilbake.getByRole('button', { name: 'Mine former', exact: true });
    await expect(egen).toBeVisible();
    await egen.click();
    await expect(tilbake).toBeHidden();
    await expect(page.locator('.statuslinje')).toContainText('5 deler');
    if (!isMobile) await expect(page.locator('.lagrad')).toHaveCount(4);
  });

  /** Draw a closed shape with the pen at points relative to the canvas centre. */
  async function tegnMedPenn(
    page: import('@playwright/test').Page,
    punkter: [number, number][],
    lukk = true,
  ) {
    const bb = (await page.locator('canvas').first().boundingBox())!;
    const sx = bb.x + bb.width / 2,
      sy = bb.y + bb.height * 0.7;
    await page.getByRole('button', { name: 'Penn', exact: true }).click();
    for (const [x, y] of punkter) await page.mouse.click(sx + x, sy + y);
    if (lukk) await page.mouse.click(sx + punkter[0]![0], sy + punkter[0]![1]);
    else await page.keyboard.press('Enter');
    return { sx, sy };
  }

  test('tegner en form med pennverktøyet, redigerer punktene og angrer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Tegning med penn og dra punkter krever mus');
    await page.getByRole('button', { name: 'Snap', exact: true }).click();
    const { sx, sy } = await tegnMedPenn(page, [
      [-120, -60],
      [120, -60],
      [120, 60],
      [-120, 60],
    ]);
    await expect(page.locator('.lagrad', { hasText: 'Tegning' })).toHaveCount(1);
    await page.keyboard.press('Escape');
    // double-click on the shape: its points and curves can be edited
    await page.mouse.dblclick(sx, sy);
    const panel = page.getByRole('region', { name: 'Rediger kurver' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('1 bane, 4 punkter');
    const a = await new AxeBuilder({ page }).include('section[aria-label="Rediger kurver"]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const maal = () => page.locator('.statuslinje').innerText();
    const for_ = await maal();
    // drag a corner out, then take it back
    await page.mouse.move(sx - 120, sy - 60);
    await page.mouse.down();
    await page.mouse.move(sx - 140, sy - 80, { steps: 3 });
    await page.mouse.move(sx - 200, sy - 140, { steps: 6 });
    await page.mouse.up();
    await expect(panel).toContainText('1 punkt valgt');
    await expect.poll(maal).not.toBe(for_);
    await page.getByRole('button', { name: 'Angre', exact: true }).click();
    await expect.poll(maal).toBe(for_);
    // add a point on an edge (double-click) and take it away with Delete
    await page.mouse.dblclick(sx, sy - 60);
    await expect(panel).toContainText('5 punkter');
    await page.keyboard.press('Delete');
    await expect(panel).toContainText('4 punkter');
    // Esc clears the selection, then leaves the editing
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('en åpen bane kan repareres, og en form kan få sin egen farge', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Tegning med penn krever mus');
    await page.getByRole('button', { name: 'Snap', exact: true }).click();
    const { sx, sy } = await tegnMedPenn(
      page,
      [
        [-120, -60],
        [120, -60],
        [120, 60],
        [-120, 60],
        [-115, -20],
      ],
      false,
    );
    // a second, separate shape in the same drawing
    for (const [x, y] of [
      [160, -40],
      [220, -40],
      [220, 20],
      [160, 20],
    ] as const)
      await page.mouse.click(sx + x, sy + y);
    await page.mouse.click(sx + 160, sy - 40);
    await page.keyboard.press('Escape');
    await page.mouse.dblclick(sx, sy);
    const panel = page.getByRole('region', { name: 'Rediger kurver' });
    await expect(panel).toContainText('2 baner');
    await expect(panel).toContainText('1 bane er ikke sluttet');
    await panel.getByLabel('Vis hva som blir koblet (grønt)').check();
    const avstand = panel.getByLabel('Største avstand som kobles');
    await avstand.fill('50');
    await avstand.press('Enter');
    await expect(panel).toContainText('1 lukkes');
    await panel.getByRole('button', { name: 'Reparer', exact: true }).click();
    await expect(panel).toContainText('Alle banene er lukket');
    // the second shape gets another colour, in a layer of its own
    await page.mouse.click(sx + 190, sy - 10);
    await expect(panel).toContainText('1 bane valgt');
    await panel.getByRole('button', { name: 'Farg formen cyan' }).click();
    await expect(page.locator('.lagrad', { hasText: 'Tegning · Cyan' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Angre', exact: true }).click();
    await expect(page.locator('.lagrad', { hasText: 'Tegning · Cyan' })).toHaveCount(0);
  });

  test('har ingen tilgjengelighetsfeil i verkstedet', async ({ page }) => {
    const r = await new AxeBuilder({ page }).exclude('canvas').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
