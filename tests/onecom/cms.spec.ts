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
  await expect(redaktor.getByRole('heading', { name: 'Tekster på sidene' })).toBeVisible();
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
  await redaktor.getByRole('searchbox', { name: 'Søk i tekstene' }).fill('La oss lage');
  const rad = redaktor.locator('.cms__rad').filter({ hasText: 'Toppen av siden › Tittel' }).first();
  await rad.getByRole('button', { name: 'Endre' }).click();
  await rad.getByRole('textbox').fill('Fra panelet');
  await rad.getByRole('button', { name: 'Lagre utkast' }).click();
  await redaktor.getByRole('searchbox', { name: 'Søk i tekstene' }).fill('Fra panelet');
  await expect(redaktor.locator('.cms__rad').filter({ hasText: 'Fra panelet' })).toContainText('Utkast');
  await redaktor.getByRole('button', { name: /Forkast utkast/ }).click();

  await redaktor.getByRole('button', { name: 'Logg' }).click();
  await expect(redaktor.getByRole('table')).toContainText('innhold.publiser');

  await redaktor.getByRole('button', { name: 'Brukere' }).click();
  await redaktor.getByLabel('Rolle').selectOption('agent');
  await redaktor.getByLabel('Navn').fill('Testagent');
  await redaktor.getByRole('button', { name: 'Legg til' }).click();
  await expect(redaktor.getByRole('status').filter({ hasText: 'API-nøkkelen til Testagent' })).toContainText(
    /dpcms_/,
  );
});
