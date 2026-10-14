import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** A sheet with three shapes in three colours; the third has a hole. */
const ARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="20mm" viewBox="0 0 60 20">
<rect x="0" y="0" width="16" height="16" fill="#cc2222"/>
<circle cx="30" cy="8" r="8" fill="#2222cc"/>
<path fill="#22aa22" fill-rule="evenodd" d="M44 0h16v16h-16zM48 4v8h8v-8z"/>
</svg>`;

/** After a reload the sign may still be on the start page (the autosave had not run yet): get past it if so. */
async function startPaaNytt(page: import('@playwright/test').Page): Promise<void> {
  const tomt = page.getByRole('button', { name: /Tomt dokument/ });
  const start = page.getByRole('button', { name: 'Start skiltet' });
  await expect(tomt.or(start).or(page.locator('.statuslinje')).first()).toBeVisible();
  // Allow the hydrated editor's start effects to settle before deciding whether
  // an unsaved project needs its colour profile. Status exists behind the dialog.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  if (await tomt.isVisible()) {
    await tomt.click();
    await expect(start).toBeVisible();
  }
  if (await start.isVisible()) await start.click();
  await expect(page.getByRole('dialog', { name: 'Velg fargene til skiltet' })).toBeHidden();
  await expect(page.locator('.statuslinje')).toContainText('mm');
}

/** The 3D model is built when 3D opens: open 3D, wait for it, and come back to 2D. */
async function bygg3d(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await expect(page.locator('.visning3d-bygger')).toBeHidden();
  await expect(page.locator('.statuslinje')).toContainText('deler');
  await page.getByRole('radio', { name: '2D', exact: true }).click();
}

type Side = import('@playwright/test').Page;

/** Paste a CSV in the import step of «Fra CSV» and read it in. */
async function limInnCsv(page: Side, csv: string): Promise<void> {
  const vindu = page.getByRole('dialog', { name: 'Fra CSV: Importer CSV' });
  await vindu.getByLabel('Eller lim inn').fill(csv);
  await vindu.getByRole('button', { name: 'Les inn teksten' }).click();
}

/** From the import step through connecting the columns to the master step. */
async function tilMasterSteget(page: Side, csv: string): Promise<void> {
  await limInnCsv(page, csv);
  const vindu = page.getByRole('dialog', { name: 'Fra CSV: Importer CSV' });
  await vindu.getByRole('button', { name: /Koble kolonnene/ }).click();
  const koble = page.getByRole('dialog', { name: 'Fra CSV: Koble kolonner' });
  await koble.getByRole('button', { name: /Lag masteren fra rad 1/ }).click();
  await expect(page.getByRole('region', { name: 'Fra CSV: design masteren' })).toBeVisible();
}

/** From the master step to the plates: every row is chosen from the start, «Generer» makes the signs. */
async function genererAlt(page: Side): Promise<void> {
  const brett = page.getByRole('region', { name: 'Fra CSV: design masteren' });
  await brett
    .getByRole('button', { name: /^Generer/ })
    .first()
    .click();
  const generer = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
  await generer.getByRole('button', { name: /^Generer \d+ skilt/ }).click();
  // the plates come after pressing «Generer», in the same tab
  await expect(generer.getByRole('list', { name: 'Produksjonsplater' })).toBeVisible();
}

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
    // a new sign opens on the start page: an empty document, then the colours
    await page
      .getByRole('dialog', { name: 'Hva vil du lage?' })
      .getByRole('button', { name: /Tomt dokument/ })
      .click();
    const start = page.getByRole('dialog', { name: 'Velg fargene til skiltet' });
    await start.getByRole('button', { name: 'Start skiltet' }).click();
    await expect(start).toBeHidden();
    await expect(page.locator('.statuslinje')).toContainText('mm');
  });

  test('startvinduet lar deg velge og lagre en fargeprofil', async ({ page, isMobile }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: /Tomt dokument/ }).click();
    const start = page.getByRole('dialog', { name: 'Velg fargene til skiltet' });
    await expect(start.getByText('Fargene i profilen (4)')).toBeVisible();
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await start.getByText('Natur', { exact: true }).click();
    await start.getByLabel('Legg til farge').selectOption({ label: '#C9A444 (PLA Silk)' });
    await expect(start.getByText('Fargene i profilen (5)')).toBeVisible();
    await start.getByLabel('Lagre som min profil').fill('Verkstedet');
    await start.getByRole('button', { name: 'Lagre profil' }).click();
    await expect(start.getByText('Mine profiler')).toBeVisible();
    await start.getByRole('button', { name: 'Start skiltet' }).click();
    await expect(page.locator('.statuslinje')).toContainText('mm');
    if (!isMobile) await expect(page.locator('.lagrad').first()).toContainText('#C49A6C');
  });

  test('startsiden har tre innganger, og Fra mal åpner malbiblioteket', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const side = page.getByRole('dialog', { name: 'Hva vil du lage?' });
    await expect(side.getByRole('button')).toHaveCount(4); // three entries and «Lukk»
    for (const navn of [/Tomt dokument/, /Fra mal/, /Fra CSV/])
      await expect(side.getByRole('button', { name: navn })).toBeVisible();
    await expect(side).toContainText('slettes hvis du ikke åpner det på 30 dager');
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await side.getByRole('button', { name: /Fra mal/ }).click();
    const bibliotek = page.getByRole('dialog', { name: 'Fra mal' });
    await expect(bibliotek).toContainText('Navneskilt');
    await expect(bibliotek).toContainText('Ingen ennå');
    await bibliotek.getByRole('button', { name: /Bruk malen Navneskilt/ }).click();
    await expect(page.locator('.statuslinje')).toContainText('mm');
    await expect(page.getByLabel('Prosjektnavn')).toHaveValue('Navneskilt');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('gjestelagring: et skilt som ikke er åpnet på over en måned slettes, et aktivt beholdes', async ({
    page,
  }) => {
    await page.waitForTimeout(900); // autosave
    const dag = 24 * 60 * 60 * 1000;
    await page.evaluate(
      (t) => localStorage.setItem('dp-verksted:signgen:sist-brukt', String(t)),
      Date.now() - 10 * dag,
    );
    await page.reload();
    // 10 days away: kept, straight into the editor
    await expect(page.locator('.statuslinje')).toContainText('mm');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForTimeout(900);
    await page.evaluate(
      (t) => localStorage.setItem('dp-verksted:signgen:sist-brukt', String(t)),
      Date.now() - 31 * dag,
    );
    await page.reload();
    // 31 days away: deleted, the start page returns and the reason is given
    await expect(page.getByRole('dialog', { name: 'Hva vil du lage?' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'er slettet' })).toContainText(
      'mer enn 30 dager',
    );
  });

  test('et prosjekt som frøs siden legges til side, og ?nullstill gir et tomt verksted', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Fil-menyen testes på brede skjermer');
    await page.waitForTimeout(900); // autosave
    // the last opening never finished: the page froze while loading the project, so its mark is still there
    await page.addInitScript(() => localStorage.setItem('dp-verksted:signgen:apner', '1'));
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Hva vil du lage?' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'ikke ferdig åpnet' })).toBeVisible();
    await page
      .getByRole('dialog', { name: 'Hva vil du lage?' })
      .getByRole('button', { name: /Tomt dokument/ })
      .click();
    await page.getByRole('button', { name: 'Start skiltet' }).click();
    await page.locator('summary', { hasText: 'Fil' }).click();
    const nedlasting = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Last ned forrige prosjekt' }).click();
    expect((await nedlasting).suggestedFilename()).toBe('forrige-signgen.skaperverksted.json');

    await page.goto('/skaperverksted/signgen/?nullstill=1');
    await expect(page.getByRole('dialog', { name: 'Hva vil du lage?' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'er nullstilt' })).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    expect(await page.evaluate(() => localStorage.getItem('dp-verksted:signgen:reserve'))).toBeNull();
  });

  test('Fra CSV starter et skilt og åpner CSV-vinduet', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: /Fra CSV/ }).click();
    await page.getByRole('button', { name: 'Start skiltet' }).click();
    await expect(page.getByRole('dialog', { name: 'Fra CSV: Importer CSV' })).toBeVisible();
  });

  test('et skilt kan lagres som mal med eierskap, og brukes uten at malen endres', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Fil-menyen testes på brede skjermer');
    await page.locator('summary', { hasText: 'Fil' }).click();
    await page.getByRole('menuitem', { name: 'Lagre som mal …' }).click();
    const vindu = page.getByRole('dialog', { name: 'Lagre som mal' });
    await vindu.getByLabel('Navn', { exact: true }).fill('Min mal');
    await vindu.getByLabel('Skaper').fill('Sivert');
    await vindu.getByRole('radio', { name: /Kommersiell/ }).check();
    await vindu.getByLabel('Pris (NOK)').fill('99');
    await vindu.getByLabel('Kreditering').fill('Design: Sivert');
    await vindu.getByRole('button', { name: 'Lagre som mal', exact: true }).click();
    await expect(vindu.getByRole('status')).toContainText('«Min mal» er lagret som mal');
    await vindu.getByRole('button', { name: 'Lukk', exact: true }).first().click();

    // the sign is changed afterwards; the template must not follow
    await page.getByLabel('Prosjektnavn').fill('Noe annet');
    await page.locator('summary', { hasText: 'Fil' }).click();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('menuitem', { name: 'Nytt prosjekt fra mal …' }).click();
    const bibliotek = page.getByRole('dialog', { name: 'Fra mal' });
    await expect(bibliotek.getByRole('list', { name: 'Mine maler' })).toContainText('Min mal');
    await expect(bibliotek.getByRole('list', { name: 'Mine maler' })).toContainText('Kommersiell · Sivert');
    await bibliotek.getByRole('button', { name: /Bruk malen Min mal/ }).click();
    await expect(page.getByLabel('Prosjektnavn')).toHaveValue('Min mal');
    const lagret = await page.evaluate(() => JSON.parse(localStorage.getItem('designporten:signgen:maler')!));
    expect(lagret).toHaveLength(1);
    expect(lagret[0]).toMatchObject({
      navn: 'Min mal',
      synlighet: 'kommersiell',
      skaper: 'Sivert',
      eier: 'Sivert',
      pris: { belop: 99, valuta: 'NOK' },
      kreditering: 'Design: Sivert',
    });
    // renamed after saving: the template still has the name the sign had then
    expect(lagret[0].dokument.navn).toBe('Mitt skilt');
  });

  test('legger et nytt lag rundt teksten', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Lagpanelet testes på desktop');
    await page.locator('.lagrad .lag-navn').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Nytt lag rundt teksten' }).click();
    await expect(page.locator('.lagrad')).toHaveCount(2);
    await expect(page.locator('.lagrad').last()).toContainText('Rundt teksten');
    await bygg3d(page);
    await expect(page.locator('.statuslinje')).toContainText('3 deler');
  });

  test('2D-redigering bygger ikke 3D-modellen, den bygges med fremdriftslinje når 3D åpnes', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Tegning med mus testes på desktop');
    const status = page.locator('.statuslinje');
    await expect(status).toContainText('beregnes når du åpner 3D');
    await expect(status).not.toContainText('Bygger modell');
    const bb = (await page.locator('canvas').first().boundingBox())!;
    await page.locator('canvas').first().focus();
    await page.keyboard.press('r');
    await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height * 0.4, { steps: 4 });
    await page.mouse.up();
    // still no model while 2D is showing
    await expect(status).toContainText('beregnes når du åpner 3D');
    await page.waitForTimeout(1500);
    await expect(status).not.toContainText('Bygger modell');
    await expect(status).not.toContainText('deler');
    await page.getByRole('radio', { name: '3D', exact: true }).click();
    await expect(page.locator('.visning3d-bygger')).toBeHidden();
    await expect(status).toContainText('deler');
    const a = await new AxeBuilder({ page }).exclude('canvas').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
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

  test('menyer lukkes ved klikk på lerretet, markering velger ved berøring, og lagnavnet velger alle', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Tegning og menyer med mus testes på desktop');
    // the pan tool has no button: Space and the middle button pan
    await expect(page.getByRole('button', { name: 'Panorer', exact: true })).toHaveCount(0);
    const lerret = page.locator('canvas').first();
    const b = (await lerret.boundingBox())!;
    const tegn = async (x0: number, y0: number, x1: number, y1: number) => {
      await page.keyboard.press('r');
      await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 5 });
      await page.mouse.up();
    };
    await tegn(0.6, 0.4, 0.7, 0.5);
    await tegn(0.3, 0.4, 0.4, 0.5);
    await page.keyboard.press('v');
    // a marquee that only touches the first rectangle picks it up
    await page.mouse.click(b.x + b.width * 0.1, b.y + b.height * 0.1);
    await expect(page.getByLabel('Posisjon X')).toHaveCount(0);
    await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.45, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByLabel('Posisjon X')).toBeVisible();
    // the layer name selects every object in the layer
    await page.mouse.click(b.x + b.width * 0.1, b.y + b.height * 0.1);
    await page.locator('.lagrad .lag-navn').first().click();
    await expect(page.getByText(/\d+ objekter valgt/)).toBeVisible();
    // the menus close on a click on the canvas
    const paneler = page.locator('details.panelmeny-linje');
    await page.locator('summary', { hasText: 'Paneler' }).click();
    await expect(paneler).toHaveAttribute('open', '');
    await page.mouse.click(b.x + b.width * 0.1, b.y + b.height * 0.8);
    await expect(paneler).not.toHaveAttribute('open', '');
    const fil = page.locator('details.filmeny').first();
    await fil.locator('summary').click();
    await expect(fil).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(fil).not.toHaveAttribute('open', '');
  });

  test('legger et omriss rundt teksten og viser byggeplaten ved eksport', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Lagpanelet testes på desktop');
    const tekstlag = page.locator('.lagrad', { hasText: 'Tekst' }).first();
    await tekstlag.getByRole('button', { name: '+ Omriss' }).click();
    await expect(tekstlag.locator('.omrissrad')).toHaveCount(2);
    await bygg3d(page);
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
    // the three buttons sit under the plate image: Last ned (3MF, STL), Eksporter via CSV, Legg i handlekurven
    const knapper = dialog.getByRole('group', { name: 'Eksporter eller bestill' });
    await expect(knapper.locator(':scope > details > summary, :scope > button')).toHaveText([
      /Last ned/,
      /Eksporter via CSV/,
      /Legg i handlekurven/,
    ]);
    await knapper.locator('summary', { hasText: 'Last ned' }).click();
    await expect(dialog.getByRole('menuitem', { name: 'Last ned 3MF' })).toHaveAttribute(
      'title',
      'Geometri med fargeinformasjon',
    );
    await expect(dialog.getByRole('menuitem', { name: 'Last ned STL' })).toHaveAttribute(
      'title',
      'Geometri uten fargeinformasjon',
    );
    const [tremf] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('menuitem', { name: 'Last ned 3MF' }).click(),
    ]);
    expect(tremf.suggestedFilename()).toMatch(/\.3mf$/);
    await knapper.locator('summary', { hasText: 'Last ned' }).click();
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('menuitem', { name: 'Last ned STL' }).click(),
    ]);
    expect(stl.suggestedFilename()).toMatch(/\.stl$/);
  });

  test('Fra CSV er en arbeidsflyt: importer, koble, master og generer med plater etterpå', async ({
    page,
  }) => {
    await page.locator('summary', { hasText: 'Fil' }).click();
    await page.getByRole('menuitem', { name: /Lag skilt fra CSV/ }).click();
    const importer = page.getByRole('dialog', { name: 'Fra CSV: Importer CSV' });
    await expect(importer.getByRole('navigation', { name: 'Fra CSV, stegene' })).toBeVisible();
    await importer.getByLabel('Eller lim inn').fill('navn;Tekst\nOla;Lilla\nKari;Cyan\nPer;Neonoransje');
    await importer.getByRole('button', { name: 'Les inn teksten' }).click();
    await expect(importer.getByText('3 rader og 2 kolonner er lest')).toBeVisible();
    const a1 = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a1.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await importer.getByRole('button', { name: /Koble kolonnene/ }).click();

    // nothing is generated yet: the columns are connected first
    const koble = page.getByRole('dialog', { name: 'Fra CSV: Koble kolonner' });
    await expect(koble.locator('#csv-kol-0')).toHaveValue('felt:navn');
    await expect(koble.locator('#csv-kol-1')).toHaveValue(/^farge:/);
    const a2 = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a2.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await koble.getByRole('button', { name: /Lag masteren fra rad 1/ }).click();

    // the master is designed on the canvas, with the steps and the resources in a slim tray
    const brett = page.getByRole('region', { name: 'Fra CSV: design masteren' });
    await expect(brett).toBeVisible();
    await expect(page.getByRole('group', { name: 'Ressurser for CSV-skiltene' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await brett
      .getByRole('button', { name: /^Generer/ })
      .first()
      .click();

    // the status is short: rows, designs and what is missing. The plates come only after «Generer»
    const generer = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    await expect(generer.getByRole('list', { name: 'Status før generering' })).toContainText('3 rader valgt');
    await expect(generer.getByRole('list', { name: 'Produksjonsplater' })).toHaveCount(0);
    // a row with a colour that does not exist blocks «Generer» until it is taken out
    await expect(generer.getByText('1 av radene har problemer')).toBeVisible();
    await expect(generer.getByRole('button', { name: /^Generer 3 skilt/ })).toBeDisabled();
    const a3 = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a3.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await generer.getByRole('button', { name: /Fjern alle 1 fra utvalget/ }).click();
    await expect(generer.getByRole('button', { name: /^Generer 2 skilt/ })).toBeEnabled();
    await generer.getByRole('button', { name: /^Generer 2 skilt/ }).click();

    const plater = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    // Lilla and Cyan are different filaments, so the two signs go on two plates
    await expect(plater.getByText('2 skilt på 2 plater')).toBeVisible();
    await expect(plater.getByRole('application', { name: /Byggeplaten sett ovenfra/ })).toBeVisible({
      timeout: 20_000,
    });
    const a4 = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a4.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const [zip] = await Promise.all([
      page.waitForEvent('download'),
      plater.getByRole('button', { name: 'Last ned 2 skilt' }).click(),
    ]);
    expect(zip.suggestedFilename()).toMatch(/batch\.zip$/);
  });

  test('radene velges med avkrysning, skift-område, søk, filter og snu utvalget', async ({ page }) => {
    await page.getByRole('button', { name: /Eksporter/ }).click();
    await page
      .getByRole('dialog', { name: 'Se over før eksport' })
      .getByRole('button', { name: 'Eksporter via CSV' })
      .click();
    await tilMasterSteget(page, 'navn;rolle\nOla;Designer\nKari;Leder\nPer;Deltaker\nÅse;Leder\nUlf;Leder');
    const brett = page.getByRole('region', { name: 'Fra CSV: design masteren' });
    const fane = brett.getByRole('button', { name: /^Importer/ }).first();
    if (await fane.isVisible()) await fane.click();
    else {
      // on a phone the tray has previous and next: Koble first, then the Importer tab
      await brett.getByRole('button', { name: /Koble/ }).click();
      await page
        .getByRole('dialog', { name: 'Fra CSV: Koble kolonner' })
        .getByRole('button', { name: /^Importer/ })
        .first()
        .click();
    }
    const rader = page.getByRole('dialog', { name: 'Fra CSV: Importer CSV' });
    await expect(rader.getByText('5 av 5 rader valgt')).toBeVisible();
    await rader.getByRole('button', { name: 'Velg ingen' }).click();
    await expect(rader.getByText('0 av 5 rader valgt')).toBeVisible();
    // shift-click selects the range between two rows
    await rader.getByLabel('Velg rad 2: Kari').check();
    await rader.getByLabel('Velg rad 4: Åse').click({ modifiers: ['Shift'] });
    await expect(rader.getByText('3 av 5 rader valgt')).toBeVisible();
    // search narrows what is shown, and «Velg ingen» only touches what is shown
    await rader.getByLabel('Søk i radene').fill('leder');
    await expect(rader.getByText('viser 3')).toBeVisible();
    await rader.getByRole('button', { name: 'Snu utvalget' }).click();
    // Kari and Åse go out, Ulf comes in; Per was chosen before and is not shown, so he stays
    await expect(rader.getByText('2 av 5 rader valgt')).toBeVisible();
    await rader.getByLabel('Søk i radene').fill('');
    await rader.getByRole('radio', { name: 'Valgte', exact: true }).click();
    await expect(rader.getByText('viser 2')).toBeVisible();
    await expect(rader.getByLabel('Velg rad 1: Ola')).toHaveCount(0);
    await rader.getByRole('radio', { name: 'Alle', exact: true }).click();
    await rader.getByRole('button', { name: 'Velg alle' }).click();
    await expect(rader.getByText('5 av 5 rader valgt')).toBeVisible();
  });

  test('Importer tar bare med valgte kolonner og rader, og egne kolonner gir dekor og fargeprofil per rad', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /Eksporter/ }).click();
    await page
      .getByRole('dialog', { name: 'Se over før eksport' })
      .getByRole('button', { name: 'Eksporter via CSV' })
      .click();
    await limInnCsv(page, 'navn;rolle\nOla;Leder\nKari;Designer\nPer;Deltaker');
    const importer = page.getByRole('dialog', { name: 'Fra CSV: Importer CSV' });
    // the three tabs, and no separate master button
    const faner = importer.getByRole('navigation', { name: 'Fra CSV, stegene' });
    await expect(faner.getByRole('button')).toHaveCount(3);
    await expect(faner.getByRole('button', { name: /Master/ })).toHaveCount(0);
    await importer.getByLabel('Ta med kolonnen rolle').uncheck();
    await expect(importer.getByText('1 av 2 kolonner med')).toBeVisible();
    await importer.getByLabel('Velg rad 3: Per').uncheck();
    await expect(importer.getByText('2 av 3 rader valgt')).toBeVisible();
    // a cell can be corrected right in the table
    await importer.getByRole('button', { name: /^Rett navn, rad 2/ }).click();
    await importer.getByLabel('navn, rad 2').fill('Kristine');
    await importer.getByLabel('navn, rad 2').press('Enter');
    await expect(importer.getByRole('button', { name: /^Rett navn, rad 2: Kristine/ })).toBeVisible();
    const a1 = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a1.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await importer.getByRole('button', { name: /Koble kolonnene/ }).click();

    const koble = page.getByRole('dialog', { name: 'Fra CSV: Koble kolonner' });
    // only the chosen column is connected
    await expect(koble.locator('#csv-kol-0')).toHaveValue('felt:navn');
    await expect(koble.locator('#csv-kol-1')).toHaveCount(0);
    // own columns: a decoration and a colour profile per row
    await koble.getByRole('button', { name: '+ Legg til egendefinert kolonne' }).click();
    const ny = koble.getByRole('form', { name: 'Ny egendefinert kolonne' });
    await ny.getByRole('button', { name: 'Legg til kolonnen' }).click();
    await koble.getByRole('button', { name: '+ Legg til egendefinert kolonne' }).click();
    await koble.getByRole('radio', { name: 'Fargeprofil', exact: true }).click();
    await koble.getByRole('button', { name: 'Legg til kolonnen' }).click();
    const verdier = koble.getByRole('region', { name: 'Dekor og fargeprofil per rad' });
    await verdier.getByLabel('Dekor for rad 1').selectOption('Hjerte');
    await verdier.getByLabel('Dekor for rad 2').selectOption('Stjerne');
    await verdier.getByLabel('Fargeprofil for rad 1').selectOption('Natur');
    await verdier.getByLabel('Fargeprofil for rad 2').selectOption('Signal');
    // the rows are never connected one by one: row 3 was left out and is not there
    await expect(verdier.getByLabel('Dekor for rad 3')).toHaveCount(0);
    const a2 = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a2.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await koble.getByRole('button', { name: /Lag masteren fra rad 1/ }).click();
    await expect(page.getByRole('region', { name: 'Fra CSV: design masteren' })).toBeVisible();
    await page
      .getByRole('region', { name: 'Fra CSV: design masteren' })
      .getByRole('button', { name: /^Generer/ })
      .first()
      .click();

    const generer = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    const status = generer.getByRole('list', { name: 'Status før generering' });
    await expect(status).toContainText('2 rader valgt');
    await expect(status).toContainText('2 design');
    await expect(generer.getByRole('list', { name: 'Produksjonsplater' })).toHaveCount(0);
    await generer.getByRole('button', { name: /^Generer 2 skilt/ }).click();

    // the plates show after «Generer», with name, decoration and colour profile for each sign
    await expect(generer.getByText('2 skilt på 2 plater')).toBeVisible();
    const tabell = generer.getByRole('region', { name: /^Skiltene på plate/ }).first();
    await expect(tabell).toContainText(/Hjerte|Stjerne/);
    await expect(tabell).toContainText(/Natur|Signal/);
    // one sign gets another colour profile: nothing is regenerated and the other sign is not touched
    await generer.getByRole('button', { name: /^Plate 1/ }).click();
    const profil = generer.getByLabel('Fargeprofil for dette skiltet');
    const naa = await profil.inputValue();
    await profil.selectOption(naa === 'Natur' ? 'Signal' : 'Natur');
    await expect(generer.getByText('2 skilt på 1 plate')).toBeVisible();
  });

  test('en fargeprofilkolonne gir egne plater etter filamentene skiltene trenger', async ({ page }) => {
    await page.getByRole('button', { name: /Eksporter/ }).click();
    await page
      .getByRole('dialog', { name: 'Se over før eksport' })
      .getByRole('button', { name: 'Eksporter via CSV' })
      .click();
    await limInnCsv(page, 'navn;Fargeprofil\nA;Natur\nB;Signal\nC;Natur\nD;Natur');
    const vindu = page.getByRole('dialog', { name: 'Fra CSV: Importer CSV' });
    await vindu.getByRole('button', { name: /Koble kolonnene/ }).click();
    const koble = page.getByRole('dialog', { name: 'Fra CSV: Koble kolonner' });
    await expect(koble.locator('#csv-kol-1')).toHaveValue('profil');
    await koble.getByRole('button', { name: /Lag masteren fra rad 1/ }).click();
    await genererAlt(page);
    const plater = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    await expect(plater.getByText('4 skilt på 2 plater')).toBeVisible();
    const kort = plater.getByRole('list', { name: 'Produksjonsplater' }).getByRole('listitem');
    await expect(kort).toHaveCount(2);
    // the profile that most signs use comes first
    await expect(kort.first()).toContainText('3 skilt');
    await expect(kort.nth(1)).toContainText('1 skilt');
  });

  test('et generert skilt kan redigeres: endringen blir en egen verdi som kan tilbakestilles til master', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Flytting på lerretet testes på desktop');
    await page.getByRole('button', { name: /Eksporter/ }).click();
    await page
      .getByRole('dialog', { name: 'Se over før eksport' })
      .getByRole('button', { name: 'Eksporter via CSV' })
      .click();
    await tilMasterSteget(page, 'navn\nOla\nKari');
    await genererAlt(page);
    const plater = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    await expect(plater.getByText('Ingen egne verdier')).toBeVisible();
    await plater.getByRole('button', { name: 'Rediger dette skiltet' }).click();

    // the sign is open on the canvas, with a banner instead of the tray
    const felt = page.getByRole('region', { name: 'Du redigerer et generert skilt' });
    await expect(felt).toContainText('Du redigerer skilt 1');
    await expect(page.getByLabel('Prosjektnavn')).toBeVisible();
    await page.locator('.objektliste li .objekt-navn').first().click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    await expect(felt).toContainText(/\d egne verdier/);
    await felt.getByRole('button', { name: 'Ferdig' }).click();

    const igjen = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    await expect(igjen.getByText('Egen verdi').first()).toBeVisible();
    await expect(igjen.getByText(/Master: .* · Her:/).first()).toBeVisible();
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await igjen
      .getByRole('button', { name: /^Tilbakestill til master/ })
      .first()
      .click();
    await igjen.getByRole('button', { name: 'Tilbakestill hele skiltet til master' }).click();
    await expect(igjen.getByText('Ingen egne verdier')).toBeVisible();
  });

  test('et hull har en referanse til navnet og følger det i CSV-serien', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Plassering av hull krever mus');
    const bb = (await page.locator('canvas').first().boundingBox())!;
    await page.getByRole('button', { name: 'Hull', exact: true }).click();
    await page.mouse.click(bb.x + bb.width * 0.62, bb.y + bb.height * 0.3);
    await expect(page.getByText(/Referanse: .* mm .* bokstavene/)).toBeVisible();
    const a1 = await new AxeBuilder({ page })
      .include('section[aria-label="SVG"], section[aria-label="Form"]')
      .analyze();
    expect(a1.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('summary', { hasText: 'Fil' }).click();
    await page.getByRole('menuitem', { name: /Lag skilt fra CSV/ }).click();
    await tilMasterSteget(page, 'navn\nEd\nEt veldig langt navn');
    await page
      .getByRole('region', { name: 'Fra CSV: design masteren' })
      .getByRole('button', { name: /^Generer/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    await expect(dialog.getByLabel('Hold hull og øyne like langt fra navnet på alle skilt')).toBeChecked();
    await expect(dialog.getByText('Klar til å generere')).toBeVisible();
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('hånden er lukket så lenge Space holdes nede, og hullet kan få egen høyde', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Space og museplassering krever tastatur og mus');
    const lerret = page.locator('canvas').first();
    const markor = () => lerret.evaluate((el) => (el as HTMLCanvasElement).style.cursor);
    await lerret.focus();
    expect(await markor()).not.toBe('grabbing');
    await page.keyboard.down('Space');
    await expect.poll(markor).toBe('grabbing');
    await page.keyboard.up('Space');
    await expect.poll(markor).not.toBe('grabbing');

    const bb = (await lerret.boundingBox())!;
    await page.getByRole('button', { name: 'Hull', exact: true }).click();
    await page.mouse.click(bb.x + bb.width * 0.62, bb.y + bb.height * 0.3);
    // the click lands beside the sign, so the hole is an eye
    const gruppe = page.getByRole('radiogroup', { name: /Høyde på øyet|Hvor langt hullet går/ });
    await expect(gruppe).toBeVisible();
    await expect(page.getByText(/Øyet er like høyt som laget|Hullet går gjennom alle lag/)).toBeVisible();
    await gruppe.getByRole('radio', { name: 'Egen' }).click();
    await expect(page.getByLabel(/Øyets høyde|Hullet går opp til/)).toBeVisible();
    await expect(page.getByText(/Resten av skiltet endres ikke|Lagene over blir som de er/)).toBeVisible();
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
    await page.locator('.lagrad .lag-navn').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Nytt tekstlag' }).click();
    await expect(page.locator('.lagrad')).toHaveCount(2);
  });

  test('Innstillinger: mørk modus og bakgrunn gjelder editoren og huskes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Menylinjen testes på desktop');
    const rot = page.locator('.verksted');
    await expect(rot).toHaveClass(/\blys\b/);
    await page.locator('summary', { hasText: 'Innstillinger' }).click();
    await page.getByRole('radio', { name: 'Mørk', exact: true }).click();
    await expect(rot).not.toHaveClass(/\blys\b/);
    await page.getByRole('radio', { name: 'Midnatt' }).click();
    await expect(rot).toHaveClass(/egen-bakgrunn/);
    expect(
      await page
        .locator('.lerret')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--horisont-topp')),
    ).toBe('#05060d');
    // a light background gives dark ink on the canvas
    await page.getByRole('radio', { name: 'Hvit' }).click();
    await expect(rot).toHaveClass(/lerret-lys/);
    // a colour of your own
    await page.locator('.egenfarge input[type="color"]').fill('#336699');
    await expect(page.getByRole('radio', { name: 'Egen farge' })).toHaveAttribute('aria-checked', 'true');
    await expect(rot).not.toHaveClass(/lerret-lys/);
    // clicking the canvas closes the menu
    await page.locator('.lerret canvas').click({ position: { x: 300, y: 650 } });
    await expect(page.locator('.innstillinger')).not.toHaveAttribute('open', '');
    // it is remembered
    await page.reload();
    await startPaaNytt(page);
    await expect(page.locator('.verksted')).not.toHaveClass(/\blys\b/);
    await expect(page.locator('.verksted')).toHaveClass(/egen-bakgrunn/);
  });

  test('Prosjektinnstillinger: byggeplate, farger og printlaghøyde er flyttet ut av Egenskaper', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Lagpanelet testes på desktop');
    await page.locator('.lerret canvas').click({ position: { x: 5, y: 5 } });
    const egenskaper = page.getByRole('region', { name: 'Egenskaper', exact: true });
    await expect(egenskaper).not.toContainText('Byggeplate');
    await expect(egenskaper).not.toContainText('Printlaghøyde');
    await page.getByRole('button', { name: 'Prosjektinnstillinger' }).click();
    const vindu = page.getByRole('dialog', { name: 'Prosjektinnstillinger' });
    await expect(vindu).toContainText('Printlaghøyde');
    await vindu.getByLabel('Størrelse').selectOption({ label: '300 × 300 mm' });
    await expect(vindu.getByRole('textbox', { name: 'Bredde' })).toHaveValue('300');
    await page.keyboard.press('Escape');
    await expect(page.locator('.statuslinje')).toBeVisible();
    // the project went back to a plate of its own size: undo returns the old plate
    await page.getByRole('button', { name: /Angre/ }).first().click();
    await page.getByRole('button', { name: 'Prosjektinnstillinger' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Prosjektinnstillinger' }).getByRole('textbox', { name: 'Bredde' }),
    ).toHaveValue('256');
  });

  test('lagpanelet: ett klikk gir et tomt lag, rader flyttes i hierarkiet, og hvert objekt kan slettes og farges', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Lagpanelet testes på desktop');
    const tittel = page.locator('.lagliste > .lagrad > .lagrad-hode .lag-tittel');
    const for_ = await page.locator('.lagrad').count();
    // the small plus makes one empty layer at once, with no menu in between
    await page.getByRole('button', { name: 'Nytt lag', exact: true }).click();
    await expect(page.locator('.lagrad')).toHaveCount(for_ + 1);
    await page.getByRole('button', { name: 'Nytt lag', exact: true }).click();
    await expect(page.locator('.lagrad')).toHaveCount(for_ + 2);
    await expect(page.locator('.nytt-lag-meny')).toHaveCount(0);
    const navn = (await tittel.allTextContents()).map((t) => t.trim());
    // drag the top layer to just below the bottom one with its grip
    const rader = page.locator('.lagliste > .lagrad');
    const sist = rader.last().locator('.lagrad-hode');
    await rader
      .first()
      .locator('.drahandtak')
      .first()
      .dragTo(sist, { targetPosition: { x: 60, y: 30 } });
    const etter = (await tittel.allTextContents()).map((t) => t.trim());
    expect(etter[etter.length - 1]).toBe(navn[0]);
    // the delete button on a layer removes it, and one step back brings it back
    const antall = await page.locator('.lagrad').count();
    await page
      .getByRole('button', { name: /^Slett Lag \d/ })
      .first()
      .click();
    await expect(page.locator('.lagrad')).toHaveCount(antall - 1);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.lagrad')).toHaveCount(antall);
    // a text has its colour in the panel too
    const tekstFarge = page.locator('.objektliste li', { hasText: 'Tekst' }).getByRole('button', {
      name: /^Farge på/,
    });
    await tekstFarge.first().click();
    await page
      .getByRole('menu', { name: /filamentene i fargeprofilen/ })
      .getByRole('menuitemradio')
      .nth(2)
      .click();
    await expect(page.locator('.objektliste li .fargevelger').first()).toBeVisible();
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
    await galleri.getByRole('button', { name: 'Dyr', exact: true }).click();
    await expect(galleri.getByRole('button', { name: 'Sett inn Enhjørning' })).toBeAttached();
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await galleri.locator('.dekor-celle', { hasText: 'Enhjørning' }).hover();
    await galleri.getByRole('button', { name: 'Sett inn Enhjørning' }).click();
    await expect(galleri).toBeHidden();
    if (isMobile) return;
    await expect(page.locator('.lagrad').first()).toContainText('Gruppe');
    const rad = page.locator('.objektliste li', { hasText: 'Enhjørning' });
    // only the grip on the left of the row is dragged
    const bb = (await rad.locator('.drahandtak').boundingBox())!;
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 10, bb.y + bb.height / 2 + 10, { steps: 4 });
    const ut = page.locator('.lag-ut');
    await expect(ut).toBeVisible();
    const ub = (await ut.boundingBox())!;
    await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.lagrad')).toHaveCount(2);
    await expect(page.locator('.lagrad').first()).toContainText('Pynt');
  });

  test('dekorgalleriet har temaer og søk, og Velg deler åpner delvelgeren', async ({ page }) => {
    await page.getByRole('button', { name: 'Dekor' }).click();
    const galleri = page.getByRole('dialog', { name: 'Dekor' });
    await galleri.getByRole('button', { name: 'Natur', exact: true }).click();
    await expect(galleri.getByRole('button', { name: 'Sett inn Sol' })).toBeAttached();
    await expect(galleri.getByRole('button', { name: 'Sett inn Hund' })).toHaveCount(0);
    await galleri.getByLabel('Søk i dekor').fill('katt');
    await expect(galleri.locator('.dekor-celle')).toHaveCount(1);
    await galleri.getByLabel('Søk i dekor').fill('');
    await galleri.getByRole('button', { name: 'Natur', exact: true }).click();
    // holding the pointer over an element shows the two choices
    const sol = galleri.locator('.dekor-celle', { hasText: 'Sol' });
    await sol.hover();
    await expect(sol.getByRole('button', { name: 'Velg deler av Sol' })).toBeVisible();
    await sol.getByRole('button', { name: 'Velg deler av Sol' }).click();
    await expect(page.getByRole('dialog', { name: 'Velg deler av SVG-en' })).toBeVisible();
  });

  test('Lagre dekorelement: markerte vektorer blir ett dekor under Dine egne', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Markering av flere objekter testes på brede skjermer');
    for (const navn of ['Hjerte', 'Stjerne']) {
      await page.getByRole('button', { name: 'Dekor', exact: true }).click();
      const g = page.getByRole('dialog', { name: 'Dekor' });
      await g.getByRole('button', { name: 'Symboler', exact: true }).click();
      await g.locator('.dekor-celle', { hasText: navn }).hover();
      await g.getByRole('button', { name: `Sett inn ${navn}` }).click();
      await expect(g).toBeHidden();
    }
    const rader = page.locator('.objektliste li .objekt-navn');
    await rader.filter({ hasText: 'Hjerte' }).click();
    await rader.filter({ hasText: 'Stjerne' }).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Lagre dekorelement' }).click();
    const vindu = page.getByRole('dialog', { name: 'Lagre dekorelement' });
    await vindu.getByLabel('Navn på dekoret').fill('Hjerte og stjerne');
    await vindu.getByRole('button', { name: 'Lagre dekor' }).click();
    await expect(vindu).toBeHidden();
    await page.getByRole('button', { name: 'Dekor', exact: true }).click();
    const g = page.getByRole('dialog', { name: 'Dekor' });
    await g.getByRole('button', { name: /^Dine egne/ }).click();
    await expect(g.locator('.dekor-celle', { hasText: 'Hjerte og stjerne' })).toHaveCount(1);
  });

  test('«Eksporter via CSV» åpner CSV-arbeidsflyten og viser byggeplaten med skiltene til slutt', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /Eksporter/ }).click();
    const eksport = page.getByRole('dialog', { name: 'Se over før eksport' });
    await eksport.getByRole('button', { name: 'Eksporter via CSV' }).click();
    await expect(page.getByRole('dialog', { name: 'Fra CSV: Importer CSV' })).toBeVisible();
    await tilMasterSteget(page, 'navn\nOla\nKari');
    await genererAlt(page);
    const dialog = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    await expect(dialog.getByText('2 skilt på 1 plate')).toBeVisible();
    await expect(dialog.getByRole('application', { name: /Byggeplaten sett ovenfra/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('Edge Snap: skilt flyttes på plata og holder minsteavstanden til konturen ved siden av', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Flytting med musa testes på brede skjermer');
    await page.getByRole('button', { name: /Eksporter/ }).click();
    await page
      .getByRole('dialog', { name: 'Se over før eksport' })
      .getByRole('button', { name: 'Eksporter via CSV' })
      .click();
    await tilMasterSteget(page, 'navn\nOla\nKari\nPer');
    await genererAlt(page);
    const dialog = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    const plate = dialog.getByRole('application', { name: /Byggeplaten sett ovenfra/ });
    await expect(plate).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('3 skilt på 1 plate, ingen problemer.')).toBeVisible();
    const magnet = dialog.getByRole('button', { name: /Edge Snap/ });
    await expect(magnet).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByLabel('Minsteavstand')).toHaveValue('5');
    await expect(dialog.getByLabel('Snapavstand')).toHaveValue('3');

    // the third sign: found by its dark pixels, the signs lie in a row at the top of the plate
    const midtPaaSkilt3 = async () => {
      await page.waitForTimeout(500);
      const boks = (await plate.boundingBox())!;
      const grupper = await plate.evaluate((el: HTMLCanvasElement) => {
        const { width: w, height: h } = el;
        const d = el.getContext('2d')!.getImageData(0, 0, w, h).data;
        const ut: [number, number][] = [];
        let start = -1;
        for (let x = 0; x <= w; x++) {
          let mork = 0;
          if (x < w) {
            for (let y = 0; y < h; y++) {
              const k = (y * w + x) * 4;
              if (d[k]! < 80 && d[k + 1]! < 80 && d[k + 2]! < 80 && d[k + 3]! > 200) mork++;
            }
          }
          if (mork > 3 && start < 0) start = x;
          if (mork <= 3 && start >= 0) {
            if (x - start > 8) ut.push([start, x]);
            start = -1;
          }
        }
        return { ut, dpr: window.devicePixelRatio };
      });
      const siste = grupper.ut[grupper.ut.length - 1]!;
      const s = Math.min((boks.width - 24) / 256, (boks.height - 24) / 256);
      return {
        x: boks.x + (siste[0] + siste[1]) / 2 / grupper.dpr,
        y: boks.y + boks.height / 2 - 128 * s + 20,
      };
    };

    // with Alt down the sign is not held: it is moved onto the next one, which is marked as a problem
    const fra = await midtPaaSkilt3();
    await page.keyboard.down('Alt');
    await page.mouse.move(fra.x, fra.y);
    await page.mouse.down();
    await page.mouse.move(fra.x - 20, fra.y, { steps: 4 });
    await page.mouse.move(fra.x - 45, fra.y + 3, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(dialog.getByText(/Skilt .* overlapper hverandre/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Tilbakestill plata' }).click();
    await expect(dialog.getByText(/overlapper hverandre/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Tilbakestill plata' })).toBeDisabled();

    // without Alt it lies against the contour of the next sign, at the minimum distance
    const fra2 = await midtPaaSkilt3();
    await page.mouse.move(fra2.x, fra2.y);
    await page.mouse.down();
    await page.mouse.move(fra2.x - 20, fra2.y + 2, { steps: 4 });
    await page.mouse.move(fra2.x - 40, fra2.y + 40, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByText('Skilt 3 er flyttet og holder 5 mm avstand til skilt 2.')).toBeVisible();
    await expect(dialog.getByText(/overlapper hverandre/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Tilbakestill plata' })).toBeEnabled();

    // the keyboard moves the chosen sign too, and keeps the distance
    await plate.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByText(/Skilt 3 er flyttet til/)).toBeVisible();

    // the magnet can be switched off and on
    await magnet.click();
    await expect(magnet).toHaveAttribute('aria-pressed', 'false');
    await expect(magnet).toContainText('Edge Snap av');
    await expect(dialog.getByLabel('Minsteavstand')).toBeEnabled();
    await magnet.click();
    await expect(magnet).toHaveAttribute('aria-pressed', 'true');
    // the distance is the one setting of the plates: a new value packs the plate again and the moves go
    await dialog.getByLabel('Minsteavstand').fill('3');
    await dialog.getByLabel('Minsteavstand').press('Enter');
    await expect(dialog.getByLabel('Minsteavstand')).toHaveValue('3');
    await expect(dialog.getByRole('button', { name: 'Tilbakestill plata' })).toBeDisabled();
    const a = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('snap-punkter ligger på masteren og følger geometrien til hvert skilt, også på byggeplata', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Panelsystemet og dra på plata brukes på brede skjermer');
    // a snap point on the whole sign, in the middle: it is saved in the master
    await page.locator('summary', { hasText: 'Paneler' }).click();
    await page.getByRole('button', { name: 'Snap og avstand', exact: true }).click();
    await page.locator('summary', { hasText: 'Paneler' }).click();
    const panel = page.getByRole('region', { name: 'Snap-punkter' });
    await expect(panel.getByText('Ingen snap-punkter ennå')).toBeVisible();
    await panel.getByRole('radio', { name: 'Midten', exact: true }).click();
    await panel.getByRole('button', { name: 'Legg til snap-punkt' }).click();
    await expect(panel.getByText(/Punkt 1: Hele skiltet, midten/)).toBeVisible();
    const a = await new AxeBuilder({ page }).exclude('canvas').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

    // the CSV signs get the point, on their own geometry
    await page.getByRole('button', { name: /Eksporter/ }).click();
    await page
      .getByRole('dialog', { name: 'Se over før eksport' })
      .getByRole('button', { name: 'Eksporter via CSV' })
      .click();
    await tilMasterSteget(page, 'navn\nOla\nMargrethe-Kristine\nPer');
    await genererAlt(page);
    const dialog = page.getByRole('dialog', { name: 'Fra CSV: Generer skilt' });
    const plate = dialog.getByRole('application', { name: /Byggeplaten sett ovenfra/ });
    await expect(plate).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    const boks = (await plate.boundingBox())!;
    const s = Math.min((boks.width - 24) / 256, (boks.height - 24) / 256);
    const grupper = await plate.evaluate((el: HTMLCanvasElement) => {
      const { width: w, height: h } = el;
      const d = el.getContext('2d')!.getImageData(0, 0, w, h).data;
      const ut: [number, number][] = [];
      let start = -1;
      for (let x = 0; x <= w; x++) {
        let mork = 0;
        if (x < w) {
          for (let y = 0; y < h; y++) {
            const k = (y * w + x) * 4;
            if (d[k]! < 80 && d[k + 1]! < 80 && d[k + 2]! < 80 && d[k + 3]! > 200) mork++;
          }
        }
        if (mork > 3 && start < 0) start = x;
        if (mork <= 3 && start >= 0) {
          if (x - start > 8) ut.push([start, x]);
          start = -1;
        }
      }
      return { ut, dpr: window.devicePixelRatio };
    });
    // the signs lie in a row at the top: find the middle of the long name and of the last sign
    expect(grupper.ut.length).toBeGreaterThanOrEqual(3);
    const midt = (g: [number, number]) => boks.x + (g[0] + g[1]) / 2 / grupper.dpr;
    // the long name may break into several dark stretches: everything between the first and the last sign is it
    const lang = boks.x + (grupper.ut[1]![0] + grupper.ut[grupper.ut.length - 2]![1]) / 2 / grupper.dpr;
    const siste = midt(grupper.ut[grupper.ut.length - 1]!);
    const y = boks.y + boks.height / 2 - 128 * s + 20;
    // drag the last sign so that its middle comes near the middle of the long name: the points meet
    await page.mouse.move(siste, y);
    await page.mouse.down();
    await page.mouse.move(siste - 20, y + 2, { steps: 4 });
    await page.mouse.move(lang + 4, y + 3, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByText(/Skilt 3 er flyttet og sitter på snap-punktet til skilt 2\./)).toBeVisible();
  });

  test('Snap-motoren holder objekter i editoren på avstand fra konturen til de andre', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Tegning og snap med musa testes på brede skjermer');
    await page.locator('summary', { hasText: 'Paneler' }).click();
    await page.getByRole('button', { name: 'Transform', exact: true }).click();
    await page.getByRole('button', { name: 'Snap og avstand', exact: true }).click();
    await page.locator('summary', { hasText: 'Paneler' }).click();
    const lerret = page.locator('canvas').first();
    const b = (await lerret.boundingBox())!;
    const transform = page.getByRole('region', { name: 'Transform' });
    const x = transform.getByLabel('Midtpunkt X');
    const bredde = transform.getByLabel('Total bredde');
    const tallet = async (f: import('@playwright/test').Locator) => {
      await expect(f).toHaveValue(/\d/);
      return Number((await f.inputValue()).replace(',', '.').replace(/\s/g, '').replace('−', '-'));
    };
    // two rectangles of the same size, the second well to the right of the first
    const tegn = async (x0: number, y0: number, x1: number, y1: number) => {
      await page.keyboard.press('r');
      await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 5 });
      await page.mouse.up();
    };
    await tegn(0.2, 0.3, 0.3, 0.45);
    const aBredde = await tallet(bredde);
    const aX = await tallet(x);
    const aHoyre = aX + aBredde / 2;
    await tegn(0.6, 0.3, 0.7, 0.45);
    const bBredde = await tallet(bredde);
    const mal = { x: b.x + b.width * 0.65, y: b.y + b.height * 0.375 };
    const dra = async (fraX: number, px: number) => {
      await page.mouse.move(fraX, mal.y);
      await page.mouse.down();
      await page.mouse.move(fraX - px / 2, mal.y, { steps: 3 });
      await page.mouse.move(fraX - px, mal.y, { steps: 3 });
      await page.mouse.up();
    };
    const gapNa = async () => (await tallet(x)) - bBredde / 2 - aHoyre;

    // how far one pixel moves it, measured with the contour target off
    await page.getByRole('button', { name: 'Snap', exact: true }).click({ button: 'right' });
    const meny = page.getByRole('menu', { name: 'Snap til' });
    await expect(meny.getByRole('menuitemcheckbox', { name: /Konturer/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    const gap0 = await gapNa();
    await dra(mal.x, 60);
    const gap1 = await gapNa();
    expect(gap0 - gap1).toBeGreaterThan(3);
    const pxPerMm = 60 / (gap0 - gap1);
    expect(gap1).toBeGreaterThan(8);

    // contours on: a drag aimed at a gap of 5.5 mm ends at the distance of the master (5 mm)
    await page.getByRole('button', { name: 'Snap', exact: true }).click({ button: 'right' });
    await meny.getByRole('menuitemcheckbox', { name: /Konturer/ }).click();
    await page.keyboard.press('Escape');
    await dra(mal.x - 60, (gap1 - 5.5) * pxPerMm);
    const gap = await gapNa();
    expect(gap).toBeGreaterThan(4.6);
    expect(gap).toBeLessThan(5.4);
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
    await dialog.getByLabel('Farge på Del 2', { exact: true }).selectOption({ label: '#00C4D6' });
    await dialog.getByLabel('Farge på Del 1', { exact: true }).selectOption({ label: '#883DFF' });
    await expect(dialog.getByText('2 av 3 deler er med, i 2 farger.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Legg på skiltet' }).click();
    await expect(dialog).toBeHidden();
    await bygg3d(page);
    await expect(page.locator('.statuslinje')).toContainText('4 deler');
    if (!isMobile) {
      // the picture joins the text layer, so both colours share the text's outlines and no layer is added
      await expect(page.locator('.lagrad')).toHaveCount(1);
      await expect(page.locator('.lagrad', { hasText: 'Tekst' })).toHaveCount(1);
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
    // the gallery comes back on «Dine egne», where the new element is
    const egen = tilbake.getByRole('button', { name: 'Sett inn Mine former' });
    await tilbake.locator('.dekor-celle', { hasText: 'Mine former' }).hover();
    await expect(egen).toBeVisible();
    await egen.click();
    await expect(tilbake).toBeHidden();
    await bygg3d(page);
    await expect(page.locator('.statuslinje')).toContainText('5 deler');
    if (!isMobile) await expect(page.locator('.lagrad')).toHaveCount(1);
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
    const bb0 = (await page.locator('canvas').first().boundingBox())!;
    const for_ = await maal();
    // drag a corner out, then take it back
    await page.mouse.move(sx - 120, sy - 60);
    await page.mouse.down();
    await page.mouse.move(sx - 140, sy - 80, { steps: 3 });
    // far out, past the sign's edge, so that the size in the status bar changes
    await page.mouse.move(bb0.x + 20, bb0.y + 20, { steps: 8 });
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
    // the second shape gets another colour, as an object in the same layer (same outline and height)
    const lagFor = await page.locator('.lagrad').count();
    await page.mouse.click(sx + 190, sy - 10);
    await expect(panel).toContainText('1 bane valgt');
    await panel.getByRole('button', { name: 'Farg formen #00C4D6' }).click();
    await expect(page.locator('.lagrad')).toHaveCount(lagFor);
    await expect(page.locator('.objekt-navn', { hasText: 'ny farge' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Angre', exact: true }).click();
    await expect(page.locator('.objekt-navn', { hasText: 'ny farge' })).toHaveCount(0);
  });

  test('panelene kan flyttes, slås sammen til faner, minimeres, lukkes og huskes', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Panelsystemet brukes på brede skjermer');
    const lag = page.getByRole('region', { name: 'Lag', exact: true });
    const egenskaper = page.getByRole('region', { name: 'Egenskaper', exact: true });
    await expect(lag).toBeVisible();
    await expect(egenskaper).toBeVisible();
    // Lag starts docked on the left; drag it onto Egenskaper in the right dock: they become tabs
    const fra = (await lag.locator('.panelhode').boundingBox())!;
    const til = (await egenskaper.boundingBox())!;
    await page.mouse.move(fra.x + 40, fra.y + 15);
    await page.mouse.down();
    await page.mouse.move(til.x + til.width / 2, til.y + til.height / 2, { steps: 8 });
    await page.mouse.up();
    const faner = page.getByRole('tablist', { name: 'Paneler i gruppen' });
    await expect(faner.getByRole('tab')).toHaveCount(2);
    await expect(page.locator('.dokkolonne.venstre')).toHaveCount(0);
    // the layout is remembered (the project may ask for its start colours again if the autosave had not run yet)
    await page.reload();
    await startPaaNytt(page);
    await expect(page.getByRole('tablist', { name: 'Paneler i gruppen' }).getByRole('tab')).toHaveCount(2);
    // minimise, close and reopen from the menu
    await page.getByRole('button', { name: /^Minimer / }).click();
    await expect(page.locator('.panelinnhold')).toHaveCount(0);
    await page.getByRole('button', { name: /^Gjenopprett / }).click();
    await page.getByRole('button', { name: /^Meny for / }).click();
    await page.getByRole('menuitem', { name: /^Lukk «/ }).click();
    await page.locator('summary', { hasText: 'Paneler' }).click();
    await page
      .getByRole('group', { name: 'Paneler og arbeidsrom' })
      .getByRole('button', { name: 'Hjelpelinjer', exact: true })
      .click();
    await expect(page.getByRole('region', { name: 'Hjelpelinjer' }).first()).toBeVisible();
    // choosing a workspace puts everything back
    await page.getByRole('button', { name: 'Enkel', exact: true }).click();
    await expect(page.locator('.dokkolonne.venstre')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Hjelpelinjer' })).toHaveCount(0);
  });

  test('et panel kan gjøres flytende fra menyen, og et eget arbeidsrom kan lagres', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Panelsystemet brukes på brede skjermer');
    await page.getByRole('button', { name: 'Meny for Lag' }).click();
    await page.getByRole('menuitem', { name: 'Gjør flytende' }).click();
    await expect(page.locator('.panelgruppe.flytende')).toHaveCount(1);
    await page.locator('summary', { hasText: 'Paneler' }).click();
    await page.getByLabel('Lagre dette oppsettet som eget arbeidsrom').fill('Mitt rom');
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mitt rom', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(page.locator('.panelgruppe.flytende')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mitt rom', exact: true }).click();
    await expect(page.locator('.panelgruppe.flytende')).toHaveCount(1);
    const a = await new AxeBuilder({ page }).exclude('canvas').analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('historikken er en tidslinje nederst som kan gå tilbake til et trinn, og Historikk og Produksjon er ikke paneler lenger', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Tegning med mus brukes på brede skjermer');
    await page.locator('summary', { hasText: 'Paneler' }).click();
    await expect(page.getByRole('button', { name: 'Historikk', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Produksjon', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const tid = page.getByRole('region', { name: 'Historikk' });
    await expect(tid).toContainText('Ingen endringer ennå');
    await page.getByRole('button', { name: 'Rutenett', exact: true }).click(); // not a document change
    const lerret = page.locator('canvas').first();
    const b = (await lerret.boundingBox())!;
    await page.keyboard.press('r');
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.35, { steps: 5 });
    await page.mouse.up();
    await expect(tid.getByRole('button', { name: 'Utgangspunkt' })).toBeEnabled();
    await expect(tid.locator('.tidstrinn[aria-current="step"]')).toContainText('Legg til');
    const antall = await page.locator('.objektliste li').count();
    await tid.getByRole('button', { name: 'Utgangspunkt' }).click();
    await expect(page.locator('.objektliste li')).toHaveCount(antall - 1);
    // the undone step stays on the strip and can be done again
    await tid.locator('.tidstrinn.gjort-om').click();
    await expect(page.locator('.objektliste li')).toHaveCount(antall);
  });

  test('fargeprøver åpner en meny med filamentene, og egne filamenter legges til i Fargeprofil-panelet', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Panelsystemet brukes på brede skjermer');
    // the layer's colour is a swatch that opens the profile's filaments
    const farge = page.getByRole('button', { name: /^Farge: Kritthvit/ });
    await farge.click();
    const meny = page.getByRole('menu', { name: /filamentene i fargeprofilen/ });
    await expect(meny.getByRole('menuitemradio')).toHaveCount(4);
    await expect(meny.getByRole('menuitemradio', { name: /Kritthvit/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await meny.getByRole('menuitemradio', { name: /Lilla/ }).click();
    await expect(page.getByRole('button', { name: /^Farge: Lilla/ })).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('button', { name: /^Farge: Kritthvit/ })).toBeVisible();

    // «Flere filamenter» opens the Fargeprofil panel
    await page.getByRole('button', { name: /^Farge: Kritthvit/ }).click();
    await page.getByRole('menuitem', { name: 'Flere filamenter …' }).click();
    const panel = page.locator('.fargepanel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Fargene i prosjektet (4)')).toBeVisible();

    // a new filament of your own, with a manufacturer, joins the profile
    await panel.getByText('Avansert', { exact: true }).click();
    await panel.getByRole('button', { name: '+ Nytt filament' }).click();
    await panel.getByLabel('Produsent').fill('Polymaker');
    await panel.getByLabel('Produktserie').fill('PolyTerra');
    await panel.getByLabel('Fargenavn').fill('Havblå');
    await panel.getByLabel('AMS-plass').fill('2');
    await panel.getByRole('button', { name: 'Lagre filament' }).click();
    await expect(panel.getByText('Fargene i prosjektet (5)')).toBeVisible();
    const prover = panel.getByRole('list', { name: /Fargene i prosjektet/ }).getByRole('button');
    await expect(prover).toHaveCount(5);
    await expect(prover.last()).toHaveAttribute('title', /Polymaker PolyTerra/);
    await expect(prover.last()).toHaveAttribute('title', /AMS 2/);

    // the registry (under Avansert, which closes when the form has been saved) can be browsed by manufacturer and searched
    await panel.getByText('Avansert', { exact: true }).click();
    await panel.locator('.registerfilter select').first().selectOption('Polymaker');
    await expect(panel.getByRole('list', { name: 'Filamentregister' }).locator('li')).toHaveCount(1);
    await panel.locator('.registerfilter select').first().selectOption('');
    await panel.getByLabel('Søk').fill('sølv');
    await expect(panel.getByRole('list', { name: 'Filamentregister' }).locator('li')).toHaveCount(1);

    // the new filament is now one of the swatch menu's choices, and the project keeps it after a reload
    await page.getByRole('tab', { name: 'Egenskaper' }).click();
    await page.getByRole('button', { name: /^Farge: Kritthvit/ }).click();
    await expect(page.getByRole('menuitemradio')).toHaveCount(5);
    await page.getByRole('menuitemradio', { name: /Havblå/ }).click();
    await expect(page.getByRole('button', { name: /^Farge: Havblå/ })).toBeVisible();
    await page.waitForTimeout(800); // autosave
    await page.reload();
    await expect(page.getByRole('button', { name: /^Farge: Havblå/ })).toBeVisible();
  });

  test('Google Fonts: søk, legg til en font og bruk den på teksten', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Fontvinduet testes på brede skjermer');
    const fil = await (await page.request.get('/skaperverksted/fonter/caveat-700.woff')).body();
    await page.route('https://api.fontsource.org/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/v1/fonts/lobster'))
        return route.fulfill({
          json: {
            variants: { '400': { normal: { latin: { url: { woff: 'https://cdn.test/lobster.woff' } } } } },
          },
          headers: { 'access-control-allow-origin': '*' },
        });
      return route.fulfill({
        json: [
          {
            id: 'lobster',
            family: 'Lobster',
            subsets: ['latin'],
            weights: [400],
            category: 'display',
            type: 'google',
          },
        ],
        headers: { 'access-control-allow-origin': '*' },
      });
    });
    await page.route('https://cdn.test/**', (route) =>
      route.fulfill({ body: fil, headers: { 'access-control-allow-origin': '*' } }),
    );
    await page.locator('.objektliste li .objekt-navn').first().click();
    await page.getByRole('button', { name: 'Flere fonter fra Google Fonts …' }).click();
    const vindu = page.getByRole('dialog', { name: 'Flere fonter fra Google Fonts' });
    await vindu.getByLabel('Søk etter font').fill('lobs');
    await expect(vindu.getByText('1 fonter.')).toBeVisible();
    await vindu.getByRole('button', { name: /Legg til og bruk Lobster 400|Legg til Lobster 400/ }).click();
    await expect(vindu.getByText(/Lobster 400. er lagt til/)).toBeVisible();
    await expect(vindu.getByRole('list', { name: /Mine fonter/ })).toContainText('Lobster 400');
    await page.keyboard.press('Escape');
    await expect(page.locator('#signgen-font')).toHaveValue('gf-lobster-400');
    await expect(page.locator('.statuslinje')).not.toContainText('font');
  });

  test('fontvinduet viser fonten, har søk øverst og blar 20 om gangen med Neste', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Fontvinduet testes på brede skjermer');
    await page.route('https://api.fontsource.org/**', (route) =>
      route.fulfill({
        json: Array.from({ length: 45 }, (_, i) => ({
          id: `font-${String(i).padStart(2, '0')}`,
          family: `Font ${String(i).padStart(2, '0')}`,
          subsets: ['latin'],
          weights: [400],
          category: 'display',
          type: 'google',
        })),
        headers: { 'access-control-allow-origin': '*' },
      }),
    );
    await page.locator('.objektliste li .objekt-navn').first().click();
    await page.getByRole('button', { name: 'Flere fonter fra Google Fonts …' }).click();
    const vindu = page.getByRole('dialog', { name: 'Flere fonter fra Google Fonts' });
    await expect(vindu.getByText('Viser 1–20 av 45 fonter.')).toBeVisible();
    await expect(vindu.getByRole('list', { name: 'Søkeresultat' }).getByRole('listitem')).toHaveCount(20);
    await vindu.getByRole('button', { name: 'Neste' }).click();
    await expect(vindu.getByText('Viser 21–40 av 45 fonter.')).toBeVisible();
    await vindu.getByRole('button', { name: 'Neste' }).click();
    await expect(vindu.getByRole('list', { name: 'Søkeresultat' }).getByRole('listitem')).toHaveCount(5);
    await expect(vindu.getByRole('button', { name: 'Neste' })).toBeDisabled();
    await vindu.getByLabel('Søk etter font').fill('font 07');
    await expect(vindu.getByText('1 fonter.')).toBeVisible();
    await expect(vindu.getByRole('button', { name: 'Neste' })).toHaveCount(0);
  });

  test('tekstjustering er tre ikonknapper og profilen velges med små kurver', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Panelsystemet brukes på brede skjermer');
    await page.locator('.objektliste li .objekt-navn').first().click();
    const just = page.getByRole('radiogroup', { name: 'Justering' });
    await expect(just.getByRole('radio', { name: 'Midtstilt' })).toBeChecked();
    await just.getByRole('radio', { name: 'Venstrejustert' }).click();
    await expect(just.getByRole('radio', { name: 'Venstrejustert' })).toBeChecked();
    await page.locator('.lagrad .lag-navn').first().click();
    await page.getByRole('button', { name: 'Åpne Profil-panelet' }).click();
    const veggen = page.getByRole('radiogroup', { name: 'Veggen' });
    await expect(veggen.getByRole('radio')).toHaveCount(8);
    await expect(veggen.getByRole('radio', { name: 'Rett' })).toBeChecked();
    await veggen.getByRole('radio', { name: 'Trapp' }).click();
    await expect(veggen.getByRole('radio', { name: 'Trapp' })).toBeChecked();
  });

  test('hjelpelinjer dras ut fra linjalen, kan flyttes med piltaster, skjules og slettes', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Linjaldrag brukes på brede skjermer');
    await page.locator('summary', { hasText: 'Paneler' }).click();
    await page
      .getByRole('group', { name: 'Paneler og arbeidsrom' })
      .getByRole('button', { name: 'Hjelpelinjer', exact: true })
      .click();
    await page.locator('summary', { hasText: 'Paneler' }).click(); // close the menu
    const liste = page.locator('.guideliste li');
    await expect(liste).toHaveCount(0);
    const b = (await page.locator('canvas').first().boundingBox())!;
    // down from the left ruler: a vertical guide that follows the pointer
    await page.mouse.move(b.x + 10, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await expect(liste).toHaveCount(1);
    const bar = page.getByRole('toolbar', { name: 'Valgt hjelpelinje' });
    await expect(bar).toBeVisible();
    const felt = bar.getByLabel('Hjelpelinje, vannrett posisjon');
    const for_ = Number((await felt.inputValue()).replace(',', '.'));
    await felt.fill('20');
    await felt.press('Enter');
    await expect(felt).toHaveValue('20');
    expect(for_).not.toBe(20);
    // locked guides cannot be deleted
    await bar.getByRole('button', { name: 'Lås', exact: true }).click();
    await expect(bar.getByRole('button', { name: 'Slett' })).toBeDisabled();
    await bar.getByRole('button', { name: 'Lås opp' }).click();
    // hide all: the guides are still in the project, but not drawn or snapped to
    const vis = page.getByRole('button', { name: 'Hjelpelinjer', exact: true }).first();
    await vis.click();
    await expect(bar).toBeHidden();
    await vis.click();
    await expect(liste).toHaveCount(1);
    // Delete removes the selected guide, and undo brings it back
    await page.locator('canvas').first().focus();
    await page.keyboard.press('Delete');
    await expect(liste).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(liste).toHaveCount(1);
  });

  test('Snap-menyen har valgbare mål som huskes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Menyen testes på brede skjermer');
    await page.getByRole('button', { name: 'Snap', exact: true }).click({ button: 'right' });
    const meny = page.getByRole('menu', { name: 'Snap til' });
    const kanter = meny.getByRole('menuitemcheckbox', { name: /Kanter og hjørner/ });
    const for_ = await kanter.getAttribute('aria-checked');
    await kanter.click();
    await expect(kanter).toHaveAttribute('aria-checked', for_ === 'true' ? 'false' : 'true');
    await page.reload();
    await startPaaNytt(page);
    await page.getByRole('button', { name: 'Snap', exact: true }).click({ button: 'right' });
    await expect(
      page
        .getByRole('menu', { name: 'Snap til' })
        .getByRole('menuitemcheckbox', { name: /Kanter og hjørner/ }),
    ).toHaveAttribute('aria-checked', for_ === 'true' ? 'false' : 'true');
  });

  test('Transform setter størrelsen på utvalget, og ikonene i kontekstlinjen legger kantene mot hverandre', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Panelsystemet brukes på brede skjermer');
    await page.locator('summary', { hasText: 'Paneler' }).click();
    await page.getByRole('button', { name: 'Transform', exact: true }).click();
    // the old Justér panel is gone from the menu: it is icons in the context bar now
    await expect(page.getByRole('button', { name: 'Justér', exact: true })).toHaveCount(0);
    await page.locator('summary', { hasText: 'Paneler' }).click(); // close the menu
    const lerret = page.locator('canvas').first();
    const b = (await lerret.boundingBox())!;
    // two rectangles
    for (const [x0, y0, x1, y1] of [
      [0.2, 0.2, 0.3, 0.3],
      [0.6, 0.5, 0.75, 0.7],
    ] as const) {
      await page.keyboard.press('r');
      await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 5 });
      await page.mouse.up();
    }
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    const transform = page.getByRole('region', { name: 'Transform' });
    const bredde = transform.getByLabel('Total bredde');
    await bredde.fill('33');
    await bredde.press('Enter');
    await expect(bredde).toHaveValue('33');
    // both are selected: align the left edges
    const linje = page.getByRole('toolbar', { name: 'Valg for verktøyet' });
    await linje.getByRole('button', { name: 'Venstre kant', exact: true }).click();
    await expect(page.locator('.statuslinje')).toContainText('mm');
  });

  test('kontekstlinjen følger verktøyet: hullform, Paint-valg og sider på mangekant', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Verktøy og lerret brukes på brede skjermer');
    const linje = page.getByRole('toolbar', { name: 'Valg for verktøyet' });
    await expect(linje).toContainText('Velg noe');
    await page.getByRole('button', { name: 'Hull', exact: true }).click();
    await linje.getByRole('radio', { name: 'Firkant' }).click();
    await expect(linje.getByRole('radio', { name: 'Firkant' })).toHaveAttribute('aria-checked', 'true');
    const b = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5);
    // the new hole is square, and the shape can be changed on the object
    await expect(page.getByRole('radio', { name: 'Firkant', exact: true }).last()).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('radio', { name: 'Sekskant', exact: true }).last().click();
    await expect(page.getByRole('radio', { name: 'Sekskant', exact: true }).last()).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('f');
    await expect(linje.getByLabel('Bredde på strøket')).toBeVisible();
    await page.keyboard.press('p');
    await expect(linje.getByLabel('Antall sider')).toBeVisible();
  });

  test('hjelpesøket finner korte svar, og Logg inn er en merket plassholder', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Menylinjen testes på desktop');
    await page.getByPlaceholder('Søk i hjelp').fill('hull');
    await expect(page.locator('.hjelpesok-treff')).toContainText('Lage hull til oppheng');
    await page.getByPlaceholder('Søk i hjelp').fill('blablabla');
    await expect(page.locator('.hjelpesok-treff')).toContainText('Ingen treff');
    await page.locator('summary', { hasText: 'Logg inn' }).click();
    await expect(page.locator('.brukerfelt')).toContainText('Innlogging er ikke laget ennå');
    // the editor still works without logging in
    await expect(page.locator('.statuslinje')).toContainText('mm');
  });

  test('trekant fra Former-menyen, og musehjulet gir flere sider mens man drar', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Musehjul brukes på brede skjermer');
    const former = page.getByRole('button', { name: 'Former', exact: true });
    await former.click();
    await former.click();
    await page.getByRole('menuitemradio', { name: /Trekant/ }).click();
    const b = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.35, b.y + b.height * 0.35, { steps: 4 });
    await page.mouse.wheel(0, -100); // one notch up: one side more
    await page.mouse.wheel(0, -100);
    await page.mouse.up();
    const sider = page.getByLabel('Antall sider');
    await expect(sider).toHaveValue('5');
    // without the wheel the triangle tool makes a triangle
    await former.click();
    await former.click();
    await page.getByRole('menuitemradio', { name: /Trekant/ }).click();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.35, { steps: 4 });
    await page.mouse.up();
    await expect(sider).toHaveValue('3');
    await expect(page.locator('.objektliste li').filter({ hasText: 'Trekant' })).toHaveCount(1);
  });

  test('et objekt kan ha egen farge i samme lag, og farger vises bare som swatch og kode', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Tegning med mus og panelene brukes på brede skjermer');
    const former = page.getByRole('button', { name: 'Former', exact: true });
    await former.click();
    await former.click();
    await page.getByRole('menuitemradio', { name: /Trekant/ }).click();
    const b = (await page.locator('canvas').first().boundingBox())!;
    for (const [x0, x1] of [
      [0.2, 0.35],
      [0.5, 0.65],
    ] as const) {
      await page.mouse.move(b.x + b.width * x0, b.y + b.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * x1, b.y + b.height * 0.35, { steps: 4 });
      await page.mouse.up();
      if (x0 === 0.2) {
        await former.click();
        await former.click();
        await page.getByRole('menuitemradio', { name: /Trekant/ }).click();
      }
    }
    const lagFor = await page.locator('.lagrad').count();
    // the shape's inspector has a colour of its own; the menu shows codes, not names
    const objektfarge = page.getByRole('button', { name: /^Farge på objektet:/ });
    await objektfarge.click();
    const meny = page.getByRole('menu', { name: /filamentene i fargeprofilen/ });
    await expect(meny.getByRole('menuitemradio')).toHaveCount(4);
    await expect(meny.locator('.fargebeskrivelse')).toContainText(/#[0-9A-F]{6}/);
    // no colour name is visible until the pointer is over a swatch
    for (const navn of ['Kritthvit', 'Lilla', 'Cyan', 'Grafitt'])
      await expect(meny.getByText(navn, { exact: true })).toHaveCount(0);
    await meny.getByRole('menuitemradio', { name: /Grafitt/ }).hover();
    await expect(meny.locator('.fargebeskrivelse')).toContainText('Grafitt');
    await meny.getByRole('menuitemradio', { name: /Cyan/ }).click();
    await expect(page.getByText('følger laget')).toHaveCount(0);
    // still the same layers: the object is coloured, not moved
    await expect(page.locator('.lagrad')).toHaveCount(lagFor);
    await expect(page.locator('.objektliste .fargevelger.egenfarge')).toHaveCount(1);
    await page.getByRole('button', { name: 'Følg laget' }).click();
    await expect(page.locator('.objektliste .fargevelger.egenfarge')).toHaveCount(0);
    await expect(page.getByText('følger laget')).toBeVisible();
    // no colour name as visible text in the colour profile panel either
    await page.getByRole('button', { name: /^Farge på objektet:/ }).click();
    await page.getByRole('menuitem', { name: 'Flere filamenter …' }).click();
    const panel = page.locator('.fargepanel');
    await expect(panel).toBeVisible();
    const rutene = panel.locator('.fp-ruter').getByRole('button');
    await expect(rutene).toHaveCount(4);
    for (const r of await rutene.all()) await expect(r).toHaveAttribute('aria-label', /#[0-9A-F]{6}/);
    await expect(panel.locator('.fp-ruter').getByText('Kritthvit', { exact: true })).toHaveCount(0);
    const a = await new AxeBuilder({ page }).analyze();
    expect(a.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('Lag profil: plussen viser fargeprøver som flervelges, navn og Lag profil bruker profilen', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Panelsystemet brukes på brede skjermer');
    await page.getByRole('button', { name: /^Farge: Kritthvit/ }).click();
    await page.getByRole('menuitem', { name: 'Flere filamenter …' }).click();
    const panel = page.locator('.fargepanel');
    await panel.getByRole('button', { name: 'Ny profil' }).click();
    const skjema = panel.getByRole('form', { name: 'Lag profil' });
    // the project's colours start selected, so «save the colours I have» still works
    await expect(skjema.getByRole('button', { pressed: true })).toHaveCount(4);
    await skjema.getByRole('button', { pressed: true }).nth(3).click();
    await expect(skjema.getByRole('button', { pressed: true })).toHaveCount(3);
    await expect(skjema.getByRole('button', { name: 'Lag profil' })).toBeDisabled();
    await skjema.getByLabel('Navn på profilen').fill('Trio');
    await skjema.getByRole('button', { name: 'Lag profil' }).click();
    await expect(skjema).toHaveCount(0);
    await expect(panel.getByText('Fargene i prosjektet (3)')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Trio', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await panel.getByRole('button', { name: 'Slett profilen Trio' }).click();
    await expect(panel.getByRole('button', { name: 'Trio', exact: true })).toHaveCount(0);
  });

  test('senterlinjen til et Paint-strøk kan redigeres som punkter, og bredden bevares', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Frihåndstegning testes på brede skjermer');
    await page.getByRole('button', { name: 'Paint', exact: true }).click();
    await page.getByRole('radio', { name: 'Penselstrøk' }).click();
    const b = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.25);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++)
      await page.mouse.move(b.x + b.width * (0.2 + i * 0.02), b.y + b.height * 0.25);
    await page.mouse.up();
    // the points show with the Select tool, like the width controls
    await page.keyboard.press('v');
    const insp = page.getByRole('region', { name: 'Strek' });
    await expect(insp).toContainText('Senterlinjen har 2 punkter');
    await page.getByRole('button', { name: 'Legg til punkt på senterlinjen' }).click();
    await expect(insp).toContainText('Senterlinjen har 3 punkter');
    const bredder = await page.getByRole('list', { name: 'Breddepunkter' }).locator('li').count();
    // the new point sits in the middle of the line: drag it down, and the stroke bends
    const hoyde = () => page.locator('.statuslinje').innerText();
    const for_ = await hoyde();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.45, { steps: 6 });
    await page.mouse.up();
    await expect.poll(hoyde).not.toBe(for_);
    await expect(page.getByRole('list', { name: 'Breddepunkter' }).locator('li')).toHaveCount(bredder);
    await expect(insp.getByRole('radio', { name: 'Penselstrøk' })).toBeChecked();
    // one drag is one undo step
    await page.getByRole('button', { name: 'Angre', exact: true }).click();
    await expect.poll(hoyde).toBe(for_);
    // Delete takes the chosen point away again
    await page.keyboard.press('Delete');
    await expect(insp).toContainText('Senterlinjen har 2 punkter');
  });

  test('Mønster gjentar de valgte vektorene i en retning, med forhåndsvisning og ett angretrinn', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Verktøyet testes på brede skjermer');
    // a decoration to repeat
    await page.getByRole('button', { name: 'Dekor', exact: true }).click();
    const g = page.getByRole('dialog', { name: 'Dekor' });
    await g.locator('.dekor-celle', { hasText: 'Hjerte' }).hover();
    await g.getByRole('button', { name: 'Sett inn Hjerte' }).click();
    const rader = page.locator('.objektliste li');
    const for_ = await rader.count();
    await page.locator('.objektliste li .objekt-navn', { hasText: 'Hjerte' }).click();
    await page.getByRole('button', { name: 'Mønster', exact: true }).click();
    const linje = page.getByRole('toolbar').or(page.locator('.kontekstlinje'));
    await expect(linje.getByRole('radio', { name: 'I en retning' })).toBeChecked();
    await page.getByLabel('Antall kopier').fill('3');
    await page.getByLabel('Antall kopier').press('Enter');
    await page.getByRole('button', { name: 'Lag mønster' }).click();
    await expect(rader).toHaveCount(for_ + 3);
    // back on the Select tool, the copies are selected, and one undo takes them all away
    await page.getByRole('button', { name: 'Angre', exact: true }).click();
    await expect(rader).toHaveCount(for_);
    // the tool can pick a path
    await page.locator('.objektliste li .objekt-navn', { hasText: 'Hjerte' }).click();
    await page.getByRole('button', { name: 'Mønster', exact: true }).click();
    await page.getByRole('radio', { name: 'Langs en bane' }).click();
    await expect(page.getByLabel('Banen kopiene følger')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lag mønster', exact: true })).toBeDisabled();
  });

  test('Paint lager et strøk med breddepunkter som kan endres etterpå', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Frihåndstegning testes på brede skjermer');
    await page.getByRole('button', { name: 'Paint', exact: true }).click();
    await page.getByRole('radio', { name: 'Penselstrøk' }).click();
    const b = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.25);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++)
      await page.mouse.move(b.x + b.width * (0.2 + i * 0.02), b.y + b.height * 0.25);
    await page.mouse.up();
    await expect(page.locator('.objektliste li').filter({ hasText: 'Strek' })).toHaveCount(1);
    const insp = page.getByRole('region', { name: 'Strek' });
    await expect(insp).toBeVisible();
    await expect(insp.getByRole('radio', { name: 'Penselstrøk' })).toBeChecked();
    await expect(page.getByRole('list', { name: 'Breddepunkter' }).locator('li')).toHaveCount(4);
    // a new width point, then a ready-made profile again
    await insp.getByRole('button', { name: '+ Breddepunkt' }).click();
    await expect(page.getByRole('list', { name: 'Breddepunkter' }).locator('li')).toHaveCount(5);
    await expect(insp.getByRole('radio', { name: 'Egen' })).toBeChecked();
    await insp.getByRole('radio', { name: 'Spiss' }).click();
    await expect(page.getByRole('list', { name: 'Breddepunkter' }).locator('li')).toHaveCount(3);
    // the width point can also be dragged across the spline on the canvas
    const lerret = page.locator('canvas').first();
    const boks = (await lerret.boundingBox())!;
    const felt = page.getByLabel('Breddepunkt 2, bredde');
    const for_ = Number((await felt.inputValue()).replace(',', '.'));
    const px = boks.x + boks.width * (0.2 + 0.4 * 0.4);
    const py = boks.y + boks.height * 0.25;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px, py - 40, { steps: 6 });
    await page.mouse.up();
    const etter = Number((await felt.inputValue()).replace(',', '.'));
    expect(etter).toBeGreaterThan(for_);
    // the width can be changed
    const bredde = insp.getByLabel('Bredde på strøket');
    await bredde.fill('6');
    await bredde.press('Enter');
    await expect(bredde).toHaveValue('6');
    // undo goes back one step at a time
    await page.keyboard.press('Control+z');
    await expect(bredde).toHaveValue('3');
    // turned into an ordinary vector: the stroke settings go, curve editing stays
    await insp.getByRole('button', { name: 'Gjør om til vektor' }).click();
    await expect(page.getByRole('region', { name: 'Strek' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rediger kurver' }).first()).toBeVisible();
  });

  test('den boolske linjen slår sammen og trekker fra former', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Linjen testes på brede skjermer');
    const lerret = page.locator('canvas').first();
    const b = (await lerret.boundingBox())!;
    for (const [x0, x1] of [
      [0.2, 0.32],
      [0.28, 0.4],
    ] as const) {
      await page.keyboard.press('r');
      await page.mouse.move(b.x + b.width * x0, b.y + b.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * x1, b.y + b.height * 0.3, { steps: 4 });
      await page.mouse.up();
    }
    const antall = await page.locator('.objektliste li').count();
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a'); // both rectangles are in the same layer
    const linje = page.getByRole('toolbar', { name: 'Kombiner former' });
    await expect(linje).toBeVisible();
    for (const navn of ['Union', 'Subtract', 'Intersect', 'Exclude'])
      await expect(linje.getByRole('button', { name: navn, exact: true })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
    await linje.getByRole('button', { name: 'Union', exact: true }).click();
    await expect(page.locator('.objektliste li').filter({ hasText: 'Union' })).toHaveCount(1);
    expect(await page.locator('.objektliste li').count()).toBeLessThan(antall);
    // one step back restores both rectangles
    await page.keyboard.press('Control+z');
    await expect(page.locator('.objektliste li').filter({ hasText: 'Union' })).toHaveCount(0);
  });

  test('verktøyene har bare ikon, med navn og forklaring etter litt hover, og Former har en meny', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Hover og dra brukes på brede skjermer');
    const penn = page.getByRole('button', { name: 'Penn', exact: true });
    await expect(penn.locator('.verktoy-etikett')).toBeHidden();
    await penn.hover();
    const hint = page.locator('.tipsboble');
    await expect(hint).toContainText('Penn');
    await expect(hint).not.toContainText('klikk for hjørne');
    await expect(hint).toContainText('klikk for hjørne', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(hint).toHaveCount(0);
    // Former: one tool with rectangle, ellipse and polygon
    const former = page.getByRole('button', { name: 'Former', exact: true });
    await former.click();
    await expect(former).toHaveAttribute('aria-pressed', 'true');
    await former.click();
    await page.getByRole('menuitemradio', { name: /Ellipse/ }).click();
    await expect(former).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('v');
    await expect(former).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('p');
    await expect(former).toHaveAttribute('aria-pressed', 'true');
  });

  test('tallfelt kan skrubbes med skalaen under feltet', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Skrubbing med mus brukes på brede skjermer');
    const felt = page.getByLabel('Teksthøyde');
    const for_ = Number((await felt.inputValue()).replace(',', '.'));
    await felt.hover();
    const b = (await felt.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 4);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 32, b.y + b.height - 4, { steps: 4 });
    await page.mouse.up();
    const etter = Number((await felt.inputValue()).replace(',', '.'));
    expect(etter).toBeGreaterThan(for_);
    // the marker stays where the value is on the ruler after the button is released
    const pil = felt.locator('xpath=ancestor::span[contains(@class,"tallfelt")]').locator('.pil');
    const pilX = async () => Number.parseFloat(await pil.evaluate((el) => (el as HTMLElement).style.left));
    const etterX = await pilX();
    expect(etterX).toBeGreaterThan(b.width / 2 - 8);
    await page.mouse.move(b.x + b.width + 80, b.y - 60);
    expect(await pilX()).toBeCloseTo(etterX, 1);
    // typing and the arrow keys still work
    await felt.fill('5');
    await felt.press('Enter');
    await felt.press('ArrowUp');
    await expect(felt).toHaveValue('5,2');
  });

  test('Profil-panelet viser tverrsnittet, flytter ankrene på bunn og topp og viser støtten', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Panelsystemet brukes på brede skjermer');
    // the inspector points to the panel, which is closed in this workspace
    await page.locator('.lagrad .lag-navn').first().click();
    await page.getByRole('button', { name: 'Åpne Profil-panelet' }).click();
    const panel = page.getByRole('region', { name: /^Profil: / });
    await expect(panel).toBeVisible();
    // the layer sits on the build plate
    await expect(panel.locator('.profilgraf')).toContainText('byggeplaten');
    await panel.getByRole('radio', { name: 'Bue ut' }).click();
    const topp = panel.getByLabel('Toppkant, innover');
    await expect(topp).toHaveValue('1,5');
    await topp.fill('2,5');
    await topp.press('Enter');
    await expect(topp).toHaveValue('2,5');
    // dragging the top anchor along the top edge changes it, and one drag is one undo step
    const anker = panel.locator('.profil-anker.kant').last();
    const b = (await anker.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x - 40, b.y + 60, { steps: 6 }); // the pointer leaves the edge: still on the edge
    await page.mouse.up();
    const etter = Number((await topp.inputValue()).replace(',', '.'));
    expect(etter).toBeLessThan(2.5);
    // a point on the wall: added with the button, and moved up and down as well as sideways
    await panel.getByRole('button', { name: 'Legg til punkt' }).click();
    await expect(panel.getByLabel('Valgt punkt')).toHaveValue('1');
    const hoydeFelt = panel.getByLabel('Mellompunkt, høyde');
    const sideFelt = panel.getByLabel('Mellompunkt, innover');
    await expect(hoydeFelt).toBeVisible();
    await hoydeFelt.fill('2');
    await hoydeFelt.press('Enter');
    await expect(hoydeFelt).toHaveValue('2');
    await sideFelt.fill('0,5');
    await sideFelt.press('Enter');
    await expect(sideFelt).toHaveValue('0,5');
    // double-click on the curve adds another
    const graf = panel.locator('.profilgraf');
    const kurve = (await panel.locator('.profil-kurve').boundingBox())!;
    await page.mouse.dblclick(kurve.x + kurve.width * 0.5, kurve.y + kurve.height * 0.15);
    await expect(panel.locator('#profil-punkt option')).toHaveCount(4);
    await expect(graf).toContainText('innover');
    // the wall may go back down: the new point can sit lower than the one before it
    await hoydeFelt.fill('0,2');
    await hoydeFelt.press('Enter');
    await expect(hoydeFelt).toHaveValue('0,2');
    await expect(panel.getByText('Veggen går ned igjen og lager et spor')).toBeVisible();
    await panel.getByRole('button', { name: 'Fjern punkt' }).click();
    await expect(panel.locator('#profil-punkt option')).toHaveCount(3);
    // an older profile type stays selectable
    await panel.getByRole('radio', { name: 'Egendefinert kurve' }).click();
    await expect(panel.getByRole('button', { name: /Gjør (glatt|til hjørne)/ })).toBeVisible();
    const r = await new AxeBuilder({ page }).exclude('canvas').analyze();
    expect(
      r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`),
    ).toEqual([]);
  });

  test('høyreklikk på et lag gir en meny, og laget kan få nytt navn på stedet', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Lagpanelet testes på desktop');
    const navn = page.locator('.lagrad .lag-navn').first();
    await navn.click({ button: 'right' });
    const meny = page.getByRole('menu', { name: 'Lag' });
    await expect(meny).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(meny).toBeHidden();
    await navn.click({ button: 'right' });
    await meny.getByRole('menuitem', { name: 'Gi nytt navn' }).click();
    const felt = page.getByLabel('Nytt navn på laget');
    await felt.fill('Hovedtekst');
    await felt.press('Enter');
    await expect(page.locator('.lagrad .lag-tittel').first()).toContainText('Hovedtekst');
    // Rediger profil opens the Profil panel for that layer
    await page.locator('.lagrad .lag-navn').first().click({ button: 'right' });
    await meny.getByRole('menuitem', { name: /Rediger profil/ }).click();
    await expect(page.getByRole('region', { name: 'Profil: Hovedtekst' })).toBeVisible();
    // visibility and lock are icon buttons with names, and the thumbnail is there
    await expect(page.locator('.lagrad .lag-miniatyr').first()).toBeVisible();
    await page.getByRole('button', { name: 'Synlig Hovedtekst' }).click();
    await expect(page.getByRole('button', { name: 'Synlig Hovedtekst' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('har ingen tilgjengelighetsfeil i verkstedet', async ({ page }) => {
    const r = await new AxeBuilder({ page }).exclude('canvas').analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
