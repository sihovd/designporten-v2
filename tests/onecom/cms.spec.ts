import { test, expect, type Page } from '@playwright/test';
import { rm } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

/**
 * The CMS in a real browser against the PHP build: setup, inline editing as a
 * draft, publishing without a deploy, history and the /cms/ panel. One shared
 * database, so it runs once (desktop) and in order.
 */
const base = '/designporten-test';
const tittel = '[data-rediger="sider/om#topp.tittel"]';
const STANDARD = 'La oss lage noe sammen';
const NY = 'Vi lager ting som betyr noe';

test.describe.configure({ mode: 'serial' });
test.skip(({ isMobile }) => isMobile, 'Én delt database; kjøres én gang.');

async function nullstill() {
  await rm('var/cms-test.sqlite', { force: true });
  await rm('var/cms-test.sqlite-wal', { force: true });
  await rm('var/cms-test.sqlite-shm', { force: true });
  await rm('dist/api/cms/data/publisert.json', { force: true });
  await rm('dist/api/cms/data/medier', { recursive: true, force: true });
  await rm('dist/medier/2026', { recursive: true, force: true });
}

test.beforeAll(nullstill);
test.afterAll(nullstill);

let redaktor: Page;

test('første administrator opprettes med oppsettkoden, og /cms/ viser tekstene', async ({ browser }) => {
  redaktor = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4322' })).newPage();
  await redaktor.goto(`${base}/cms/`);
  await expect(redaktor.getByRole('heading', { name: 'Opprett den første administratoren' })).toBeVisible();
  await redaktor.getByLabel('Oppsettkode').fill('lokal-test-oppsettkode');
  await redaktor.getByLabel('Navn').fill('Eier');
  await redaktor.getByLabel('E-post').fill('eier@example.invalid');
  await redaktor.getByLabel('Passord (minst 12 tegn)').fill('et-langt-passord');
  await redaktor.getByRole('button', { name: 'Opprett og logg inn' }).click();
  await expect(redaktor.getByRole('heading', { name: 'Oversikt', exact: true })).toBeVisible();
  await expect(redaktor.getByText('Kilde: CMS-databasen.', { exact: false })).toBeVisible();
  await redaktor.getByRole('button', { name: 'Sider og innhold', exact: true }).click();
  await expect(redaktor.getByRole('heading', { name: 'Tekster og bilder på sidene' })).toBeVisible();
  await expect(redaktor.getByRole('link', { name: 'Åpne siden' }).first()).toBeVisible();
  const axe = await new AxeBuilder({ page: redaktor }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test('CMS-01: et utkast på siden vises bare for redaktøren', async ({ browser }) => {
  await redaktor.goto(`${base}/om/`);
  const bar = redaktor.getByRole('region', { name: 'Redigering av innhold' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Rediger innhold' }).click();
  const h1 = redaktor.locator(tittel);
  await h1.click();
  await redaktor.keyboard.press('ControlOrMeta+a');
  await redaktor.keyboard.type(NY);
  await bar.getByRole('button', { name: 'Lagre utkast' }).click();
  await expect(bar).toContainText('lagret som utkast');
  await expect(h1).toHaveAttribute('data-utkast', '');
  await expect(h1).toHaveText(NY);

  const besokende = await browser.newPage();
  const kall: string[] = [];
  besokende.on('request', (r) => {
    if (r.url().includes('/api/cms/')) kall.push(r.url());
  });
  await besokende.goto(`${base}/om/`);
  await expect(besokende.locator(tittel)).toHaveText(STANDARD);
  await expect(besokende.getByRole('region', { name: 'Redigering av innhold' })).toHaveCount(0);
  expect(kall).toEqual([]);
  await besokende.close();
});

test('CMS-02: publisering vises for besøkende med en gang, uten nytt bygg', async ({ browser }) => {
  const bar = redaktor.getByRole('region', { name: 'Redigering av innhold' });
  await bar.getByRole('button', { name: 'Ferdig' }).click();
  await bar.getByRole('button', { name: 'Vis som besøkende' }).click();
  await expect(redaktor.locator(tittel)).toHaveText(STANDARD);
  await bar.getByRole('button', { name: 'Vis utkast' }).click();
  await bar.getByRole('button', { name: 'Publiser' }).click();
  await expect(bar).toContainText('Besøkende ser dem nå');
  await expect(redaktor.locator(tittel)).not.toHaveAttribute('data-utkast');

  const besokende = await browser.newPage();
  await besokende.goto(`${base}/om/`);
  await expect(besokende.locator(tittel)).toHaveText(NY);
  const html = await (await besokende.request.get(`${base}/om/`)).text();
  expect(html).toContain(`>${NY}</h1>`);
  await besokende.close();
});

test('CMS-04: standardteksten kan hentes tilbake fra historikken og publiseres', async ({ browser }) => {
  const bar = redaktor.getByRole('region', { name: 'Redigering av innhold' });
  await bar.getByRole('button', { name: 'Rediger innhold' }).click();
  await redaktor.locator(tittel).focus();
  await bar.getByRole('button', { name: 'Historikk' }).click();
  const dialog = redaktor.getByRole('dialog', { name: 'Historikk for teksten' });
  await expect(dialog).toContainText('Publisert');
  await expect(dialog).toContainText('Eier');
  await dialog.getByRole('button', { name: 'Bruk denne' }).first().click();
  await expect(bar).toContainText('gjenopprettet som utkast');
  await expect(redaktor.locator(tittel)).toHaveText(STANDARD);
  await bar.getByRole('button', { name: 'Ferdig' }).click();
  await bar.getByRole('button', { name: 'Publiser' }).click();
  await expect(bar).toContainText('publisert');

  const besokende = await browser.newPage();
  await besokende.goto(`${base}/om/`);
  await expect(besokende.locator(tittel)).toHaveText(STANDARD);
  await besokende.close();
});

test('/cms/-panelet lagrer utkast, viser loggen og legger til en agent', async () => {
  await redaktor.goto(`${base}/cms/`);
  await redaktor.getByRole('button', { name: 'Sider og innhold', exact: true }).click();
  await redaktor.getByRole('searchbox', { name: 'Søk i tekster og bilder' }).fill('La oss lage');
  const rad = redaktor.locator('.cms__rad').filter({ hasText: 'Toppen av siden › Tittel' }).first();
  await rad.getByRole('button', { name: 'Endre' }).click();
  await rad.getByRole('textbox').fill('Fra panelet');
  await rad.getByRole('button', { name: 'Lagre utkast' }).click();
  await redaktor.getByRole('searchbox', { name: 'Søk i tekster og bilder' }).fill('Fra panelet');
  await expect(redaktor.locator('.cms__rad').filter({ hasText: 'Fra panelet' })).toContainText('Utkast');
  await redaktor.getByRole('button', { name: /Forkast utkast/ }).click();

  await redaktor.getByRole('button', { name: 'Aktivitetslogg', exact: true }).click();
  await expect(redaktor.getByRole('table')).toContainText('innhold.publiser');

  await redaktor.getByRole('button', { name: 'Brukere og tilgang', exact: true }).click();
  await redaktor.getByLabel('Rolle').selectOption('agent');
  await redaktor.getByLabel('Navn').fill('Testagent');
  await redaktor.getByRole('button', { name: 'Legg til' }).click();
  await expect(redaktor.getByRole('status').filter({ hasText: 'API-nøkkelen til Testagent' })).toContainText(
    /dpcms_/,
  );
});

test('bilde: forsidebildet byttes på siden, publiseres uten bygg og hentes tilbake fra historikken', async ({
  browser,
}) => {
  const helt = '[data-rediger-bilde="sider/forside#helt.bilde"]';
  await redaktor.goto(`${base}/`);
  const bygget = await redaktor.locator(helt).getAttribute('src');
  const bar = redaktor.getByRole('region', { name: 'Redigering av innhold' });
  await bar.getByRole('button', { name: 'Rediger innhold' }).click();
  await redaktor.getByRole('button', { name: /^Bytt bilde/ }).click();
  const dialog = redaktor.getByRole('dialog', { name: 'Bytt bilde' });
  await expect(dialog).toBeVisible();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles('public/midlertidig/konsept/utklipp/fasettpotte.webp');
  await expect(dialog).toContainText('1 bilde lastet opp');
  const axe = await new AxeBuilder({ page: redaktor })
    .include('.dp-bildevelger')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await expect(dialog.getByRole('button', { name: 'Bruk bildet' })).toBeDisabled();
  await dialog.getByLabel('Hva viser bildet? (alt-tekst)').fill('En fasettert potte på et bord');
  await dialog.getByLabel('Fra venstre').fill('30');
  await dialog.getByLabel('Fra venstre').press('Tab');
  await dialog.getByRole('button', { name: 'Bruk bildet' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(redaktor.locator(helt)).toHaveAttribute('src', /\/medier\//);
  await bar.getByRole('button', { name: 'Lagre utkast' }).click();
  await expect(bar).toContainText('lagret som utkast');
  await expect(redaktor.locator(helt)).toHaveAttribute('data-utkast', '');

  const besokende = await browser.newPage();
  await besokende.goto(`${base}/`);
  await expect(besokende.locator(helt)).toHaveAttribute('src', bygget!);
  await besokende.close();

  await bar.getByRole('button', { name: 'Ferdig' }).click();
  await bar.getByRole('button', { name: 'Publiser' }).click();
  await expect(bar).toContainText('Besøkende ser dem nå');

  const ny = await browser.newPage();
  await ny.goto(`${base}/`);
  const img = ny.locator(helt);
  await expect(img).toHaveAttribute('src', /\/medier\/\d{4}\/[a-f0-9]+-\d+\.webp$/);
  await expect(img).toHaveAttribute('alt', 'En fasettert potte på et bord');
  await expect(img).toHaveAttribute('style', /--fokus: 30% 50%/);
  await expect(img).toHaveJSProperty('complete', true);
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(ny.locator('[data-konseptmerke="sider/forside#helt.bilde"]')).toBeHidden();
  await ny.close();

  await bar.getByRole('button', { name: 'Rediger innhold' }).click();
  await redaktor.getByRole('button', { name: /^Bytt bilde/ }).focus();
  await bar.getByRole('button', { name: 'Historikk' }).click();
  const historikk = redaktor.getByRole('dialog', { name: 'Historikk for bildet' });
  await historikk
    .getByRole('listitem')
    .filter({ hasText: 'Bildet siden ble laget med' })
    .first()
    .getByRole('button', { name: 'Bruk denne' })
    .click();
  await expect(bar).toContainText('gjenopprettet som utkast');
  await expect(redaktor.locator(helt)).toHaveAttribute('src', bygget!);
  await bar.getByRole('button', { name: 'Ferdig' }).click();
  await bar.getByRole('button', { name: 'Publiser' }).click();
  await expect(bar).toContainText('publisert');

  const tilbake = await browser.newPage();
  await tilbake.goto(`${base}/`);
  await expect(tilbake.locator(helt)).toHaveAttribute('src', bygget!);
  await expect(tilbake.locator('[data-konseptmerke="sider/forside#helt.bilde"]')).toBeVisible();
  await tilbake.close();
});

test('/cms/ viser bildebiblioteket og driftsstatus', async () => {
  await redaktor.goto(`${base}/cms/`);
  await redaktor.getByRole('button', { name: 'Mediebibliotek', exact: true }).click();
  await expect(redaktor.getByRole('heading', { name: 'Bilder' })).toBeVisible();
  await expect(redaktor.locator('.cms__bilde')).toHaveCount(1);
  await expect(redaktor.locator('.cms__bilde')).toContainText('fasettpotte.webp');
  await redaktor.getByRole('button', { name: 'Drift og sikkerhet', exact: true }).click();
  await expect(redaktor.getByRole('table')).toContainText('Bildebehandling (GD)');
  const axe = await new AxeBuilder({ page: redaktor }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test('Studio: blogginnlegg lagres, forhåndsvises privat og publiseres uten nytt bygg', async ({
  browser,
}) => {
  await redaktor.goto(`${base}/cms/`);
  await redaktor.getByRole('button', { name: 'Blogg og inspirasjon', exact: true }).click();
  await redaktor.getByRole('button', { name: '＋ Nytt innlegg', exact: true }).click();
  await redaktor.getByLabel('Overskrift', { exact: true }).fill('En historie fra verkstedet');
  await expect(redaktor.getByLabel(/^Nettadresse/)).toHaveValue('en-historie-fra-verkstedet');
  await redaktor
    .getByLabel('Kort introduksjon', { exact: true })
    .fill('En ekte ende-til-ende-test av bloggfunksjonen.');
  await redaktor.getByLabel('Avsnitt 1', { exact: true }).fill('En skisse blir til et fysisk produkt.');
  await redaktor.getByRole('button', { name: 'Lagre utkast', exact: true }).click();
  await expect(
    redaktor.getByRole('status').filter({ hasText: 'Utkastet er lagret på serveren.' }),
  ).toBeVisible();
  const besokende = await browser.newPage();
  const url = `${base}/blogg/en-historie-fra-verkstedet/`;
  expect((await besokende.request.get(url)).status()).toBe(404);
  const preview = await redaktor
    .getByRole('link', { name: 'Vis sist lagret ↗', exact: true })
    .getAttribute('href');
  expect((await besokende.request.get(preview!)).status()).toBe(401);
  const svar = await redaktor.request.get(preview!);
  expect(svar.status()).toBe(200);
  expect(svar.headers()['cache-control']).toContain('no-store');
  expect(await svar.text()).toContain('En skisse blir til et fysisk produkt.');
  const axe = await new AxeBuilder({ page: redaktor }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await redaktor.getByRole('button', { name: 'Publiser innlegg', exact: true }).click();
  await expect(
    redaktor.getByRole('status').filter({ hasText: 'Innlegget er publisert og tilgjengelig i bloggen.' }),
  ).toBeVisible();
  await besokende.goto(url);
  await expect(
    besokende.getByRole('heading', { name: 'En historie fra verkstedet', exact: true }),
  ).toBeVisible();
  await expect(besokende.getByText('En skisse blir til et fysisk produkt.', { exact: true })).toBeVisible();
  expect(await (await besokende.request.get(`${base}/sitemap.xml`)).text()).toContain(
    '/blogg/en-historie-fra-verkstedet/',
  );
  await besokende.close();
});

test('Studio: responsiv oversikt og bloggredaktør ved alle avtalte bredder', async () => {
  await redaktor.goto(`${base}/cms/`);
  for (const bredde of [320, 390, 768, 1024, 1440]) {
    await redaktor.setViewportSize({ width: bredde, height: 1000 });
    await expect(redaktor.getByRole('heading', { name: 'Oversikt', exact: true })).toBeVisible();
    await expect(redaktor.getByText('Kilde: CMS-databasen.', { exact: false })).toBeVisible();
    expect(await redaktor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
      true,
    );
    await redaktor.screenshot({ path: `var/studio-qa/oversikt-${bredde}.png`, fullPage: true });
    if (bredde < 761) await redaktor.getByRole('button', { name: 'Meny', exact: true }).click();
    await redaktor.getByRole('button', { name: 'Blogg og inspirasjon', exact: true }).click();
    await redaktor.getByRole('button', { name: '＋ Nytt innlegg', exact: true }).click();
    await expect(redaktor.getByLabel('Overskrift', { exact: true })).toBeVisible();
    expect(await redaktor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
      true,
    );
    await redaktor.screenshot({ path: `var/studio-qa/redaktor-${bredde}.png`, fullPage: true });
    if (bredde < 761) await redaktor.getByRole('button', { name: 'Meny', exact: true }).click();
    await redaktor.getByRole('button', { name: 'Oversikt', exact: true }).click();
  }
});
