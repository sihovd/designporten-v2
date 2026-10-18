import { test, expect, type Page } from '@playwright/test';
import { readdir, readFile, rm } from 'node:fs/promises';
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
  for (const del of ['', '-wal', '-shm']) await rm(`var/konto-test.sqlite${del}`, { force: true });
  await rm('var/konto-post', { recursive: true, force: true });
  await rm('dist/api/cms/data/publisert.json', { force: true });
  await rm('dist/api/cms/data/medier', { recursive: true, force: true });
  await rm('dist/medier/2026', { recursive: true, force: true });
}

// only the project that runs the tests may reset the shared database, or a parallel worker wipes it mid-run
// eslint-disable-next-line no-empty-pattern -- Playwright needs the fixture object first
test.beforeAll(async ({}, info) => {
  if (info.project.name === 'desktop') await nullstill();
});
// eslint-disable-next-line no-empty-pattern -- as above
test.afterAll(async ({}, info) => {
  if (info.project.name === 'desktop') await nullstill();
});

let redaktor: Page;

/** The newest captured e-mail to `til` (tests/php/router.php captures in var/konto-post, outside dist/). */
async function sisteEpost(til: string) {
  const filer = (await readdir('var/konto-post')).filter((f) => f.endsWith('.json')).sort();
  for (const f of filer.reverse()) {
    const e = JSON.parse(await readFile(`var/konto-post/${f}`, 'utf8')) as { til: string; tekst: string };
    if (e.til === til) return e;
  }
  throw new Error(`Ingen e-post til ${til}`);
}

/** The link in an e-mail, made from the configured address and the test base. */
async function lenkeTil(til: string, handling: string) {
  const m = new RegExp(`http://127\\.0\\.0\\.1:4322${base}/konto/#${handling}=[a-f0-9]{64}`).exec(
    (await sisteEpost(til)).tekst,
  );
  if (!m) throw new Error(`Ingen ${handling}-lenke til ${til}`);
  return m[0];
}

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

// Member accounts and the sign gallery live in the same database (docs/konto.md).
test('konto: nedlasting deler ingenting; et medlem publiserer selv, skiltet vises i «Nylig laget» og åpnes som mal', async ({
  browser,
}) => {
  const medlem = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4322' })).newPage();
  await medlem.goto(`${base}/konto/`);
  await medlem.getByRole('button', { name: 'Lag konto' }).first().click();
  await medlem.getByRole('textbox', { name: /^Navn/ }).fill('Kari Test');
  await medlem.getByRole('textbox', { name: /^E-post/ }).fill('kari@example.invalid');
  await medlem.getByLabel(/^Passord/).fill('et-langt-passord');
  await medlem.getByRole('checkbox').check();
  await medlem.locator('form').getByRole('button', { name: 'Lag konto' }).click();
  await expect(medlem.getByRole('heading', { name: 'Hei, Kari Test' })).toBeVisible();
  await expect(medlem.getByRole('status').first()).toContainText(
    'Vi har sendt en lenke til kari@example.invalid',
  );
  // publishing waits for a confirmed address (stage B): the link from the e-mail, then an explicit click
  await medlem.goto(await lenkeTil('kari@example.invalid', 'bekreft'));
  await expect(medlem.getByRole('heading', { name: 'Bekreft e-postadressen' })).toBeFocused();
  expect(new URL(medlem.url()).hash).toBe('');
  await medlem.getByRole('button', { name: 'Bekreft', exact: true }).click();
  await expect(medlem.getByText('E-postadressen kari@example.invalid er bekreftet.')).toBeVisible();
  await expect(medlem.locator('#profil').getByText('Bekreftet', { exact: true })).toBeVisible();
  await expect(medlem.getByText('Gratis inntil videre', { exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page: medlem }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await medlem.goto(`${base}/skaperverksted/signgen/`);
  await medlem.getByRole('button', { name: /Tomt dokument/ }).click();
  await medlem.getByRole('button', { name: 'Start skiltet' }).click();
  await expect(medlem.locator('.statuslinje')).toContainText('mm');
  await medlem.getByRole('button', { name: /Eksporter/ }).click();
  const dialog = medlem.getByRole('dialog', { name: 'Se over før eksport' });
  await dialog.locator('summary', { hasText: 'Last ned' }).click({ timeout: 20_000 });
  await Promise.all([
    medlem.waitForEvent('download'),
    dialog.getByRole('menuitem', { name: 'Last ned 3MF' }).click(),
  ]);
  await expect(medlem.getByText('3MF-filen er lastet ned.')).toBeVisible();
  // private by default (Sivert, 2026-10-17): a download shares nothing
  const forPublisering = await medlem.request.get(`${base}/api/konto/?r=skilt&antall=48`);
  expect((await forPublisering.json()).skilt.map((s: { skaper: string }) => s.skaper)).not.toContain(
    'Kari Test',
  );
  await medlem.keyboard.press('Escape');

  await medlem.locator('summary', { hasText: 'Fil' }).click();
  await medlem.getByRole('menuitem', { name: 'Publiser i galleriet …' }).click();
  const pub = medlem.getByRole('dialog', { name: 'Publiser i galleriet' });
  await expect(pub.getByText('Publiseres som')).toContainText('Kari Test');
  await expect(pub.getByRole('img', { name: /Forhåndsbilde av skiltet/ })).toBeVisible();
  const axePub = await new AxeBuilder({ page: medlem })
    .include('.publiseringsdialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(axePub.violations.map((v) => v.id)).toEqual([]);
  await pub.getByRole('button', { name: 'Publiser', exact: true }).click();
  await expect(pub.getByRole('status')).toHaveText('Skiltet er publisert i «Nylig laget».');
  await expect(pub.getByRole('button', { name: 'Fjern fra galleriet' })).toBeVisible();
  await pub.locator('.knapperad').getByRole('button', { name: 'Lukk' }).click();

  const besokende = await browser.newPage({ baseURL: 'http://127.0.0.1:4322' });
  await besokende.goto(`${base}/`);
  // the slider loads when it scrolls into view; other tests may share signs too
  await besokende.locator('.nylig').scrollIntoViewIfNeeded();
  const kort = besokende.locator('.nylig .nylige__kort', { hasText: 'Kari Test' });
  await expect(kort).toContainText('Mitt skilt');
  await expect(kort).toContainText('Kari Test');
  await expect(kort.getByRole('img', { name: /Mitt skilt/ })).toBeVisible();
  besokende.on('dialog', (d) => void d.accept());
  await kort.getByRole('link', { name: /Bruk som mal/ }).click();
  await expect(besokende.getByText('Nytt prosjekt fra malen «Mitt skilt»', { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await besokende.close();
  await medlem.close();
});

test('konto: administratoren ser medlemsregisteret og kan skjule et skilt fra galleriet', async () => {
  await redaktor.setViewportSize({ width: 1440, height: 1000 });
  await redaktor.goto(`${base}/cms/`);
  await redaktor.getByRole('button', { name: 'Medlemmer og skilt', exact: true }).click();
  await expect(redaktor.locator('[aria-labelledby="cms-medlemmer"]')).toContainText('kari@example.invalid');
  const rad = redaktor.locator('.cms__rad', { hasText: 'Kari Test' }).filter({ hasText: 'Mitt skilt' });
  await rad.getByRole('button', { name: /Skjul fra galleriet/ }).click();
  await expect(rad.getByRole('button', { name: /Vis i galleriet/ })).toBeVisible();
  const svar = await redaktor.request.get(`${base}/api/konto/?r=skilt`);
  expect((await svar.json()).skilt.map((s: { skaper: string }) => s.skaper)).not.toContain('Kari Test');
});

// Stage B (2026-10-18): the account flows in a real browser, by keyboard where it matters.
test('konto B: glemt passord, bytt passord og bytt e-post med lenker fra e-post, og tastaturet når fram', async ({
  browser,
}) => {
  const side = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4322' })).newPage();
  await side.goto(`${base}/konto/`);
  await side.getByRole('button', { name: 'Lag konto' }).first().click();
  await side.getByRole('textbox', { name: /^Navn/ }).fill('Ola Test');
  await side.getByRole('textbox', { name: /^E-post/ }).fill('ola@example.invalid');
  await side.getByLabel(/^Passord/).fill('et-langt-passord');
  await side.getByRole('checkbox').check();
  await side.getByLabel(/^Passord/).press('Enter');
  await expect(side.getByRole('heading', { name: 'Hei, Ola Test' })).toBeVisible();

  // unconfirmed: the account works, publishing says why it is closed
  await expect(side.locator('#profil').getByText('Ikke bekreftet', { exact: true })).toBeVisible();
  await expect(side.locator('#mine-tjenester')).toContainText(
    'Publisere skilt i galleriet «Nylig laget»: nei.',
  );
  await expect(
    side.locator('#mine-tjenester').getByRole('link', { name: 'Åpne Sign Forge' }),
  ).toHaveAttribute('href', `${base}/skaperverksted/signgen/`);
  await expect(side.locator('#mine-prosjekter')).toContainText('0 av 5 prosjekter');
  const axe = await new AxeBuilder({ page: side }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // change the password by keyboard only
  const bytt = side.locator('summary', { hasText: 'Bytt passord' });
  await bytt.focus();
  await side.keyboard.press('Enter');
  await side.getByLabel('Nåværende passord').fill('et-langt-passord');
  await side.keyboard.press('Tab');
  await side.keyboard.type('et-nytt-passord');
  await side.keyboard.press('Enter');
  await expect(side.getByText('Passordet er byttet. Du er logget ut på alle andre enheter.')).toBeVisible();

  // sign out, forget it, reset it with the link
  await side.locator('.konto__topp').getByRole('button', { name: 'Logg ut' }).click();
  await side.getByRole('button', { name: 'Glemt passordet?' }).click();
  await side.getByRole('textbox', { name: /^E-post/ }).fill('ola@example.invalid');
  await side.getByRole('button', { name: 'Send lenke' }).click();
  await expect(side.getByRole('status')).toContainText('Hvis det finnes en konto med denne adressen');
  await side.goto(await lenkeTil('ola@example.invalid', 'nytt-passord'));
  await expect(side.getByRole('heading', { name: 'Velg et nytt passord' })).toBeFocused();
  expect(new URL(side.url()).hash).toBe('');
  await side.locator('input[name="lenke-passord"]').fill('et-tredje-passord');
  await side.getByLabel('Skriv det en gang til').fill('et-tredje-passord');
  await side.getByRole('button', { name: 'Lagre passordet' }).click();
  await expect(side.getByText('Passordet er endret, og du er logget ut overalt.')).toBeVisible();
  await side.getByRole('textbox', { name: /^E-post/ }).fill('ola@example.invalid');
  await side.getByLabel(/^Passord/).fill('et-nytt-passord');
  await side.locator('form').getByRole('button', { name: 'Logg inn' }).click();
  await expect(side.getByRole('alert')).toContainText('Feil e-postadresse eller passord');
  await side.getByLabel(/^Passord/).fill('et-tredje-passord');
  await side.locator('form').getByRole('button', { name: 'Logg inn' }).click();
  await expect(side.getByRole('heading', { name: 'Hei, Ola Test' })).toBeVisible();
  // the reset link reached the inbox, so the address counts as confirmed
  await expect(side.locator('#profil').getByText('Bekreftet', { exact: true })).toBeVisible();

  // switch address: the old one holds until the new one is confirmed
  await side.locator('summary', { hasText: 'Bytt e-postadresse' }).click();
  await side.getByLabel('Ny e-postadresse').fill('ola.ny@example.invalid');
  await side.getByLabel('Passordet ditt').fill('et-tredje-passord');
  await side.getByRole('button', { name: 'Send lenke til ny adresse' }).click();
  await expect(side.getByText('Vi har sendt en lenke til ola.ny@example.invalid')).toBeVisible();
  await expect(side.locator('.konto__topp')).toContainText('ola@example.invalid');
  await side.goto(await lenkeTil('ola.ny@example.invalid', 'ny-epost'));
  await side.getByRole('button', { name: 'Bytt adresse' }).click();
  await expect(side.getByText('Kontoen bruker nå ola.ny@example.invalid.')).toBeVisible();
  await expect(side.locator('.konto__topp')).toContainText('ola.ny@example.invalid');
  // a used link is refused with a clear message
  await side.goto(`${base}/`);
  await side.goto(await lenkeTil('ola.ny@example.invalid', 'ny-epost'));
  await side.getByRole('button', { name: 'Bytt adresse' }).click();
  await expect(side.getByRole('alert')).toContainText('ugyldig, utløpt eller allerede brukt');
  await side.close();
});

test('konto B: Min konto ved alle avtalte bredder, uten sideveis scroll', async ({ browser }) => {
  const side = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4322' })).newPage();
  await side.goto(`${base}/konto/`);
  await side.getByRole('textbox', { name: /^E-post/ }).fill('ola.ny@example.invalid');
  await side.getByLabel(/^Passord/).fill('et-tredje-passord');
  await side.locator('form').getByRole('button', { name: 'Logg inn' }).click();
  await expect(side.getByRole('heading', { name: 'Hei, Ola Test' })).toBeVisible();
  await side.locator('summary', { hasText: 'Bytt passord' }).click();
  for (const bredde of [320, 390, 768, 1024, 1440]) {
    await side.setViewportSize({ width: bredde, height: 900 });
    const bred = await side.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(bred, `${bredde} px`).toBeLessThanOrEqual(0);
    if (process.env.DP_SKJERMBILDER) {
      await side.screenshot({
        path: `${process.env.DP_SKJERMBILDER}/min-konto-${bredde}.png`,
        fullPage: true,
      });
    }
  }
  await side.close();
});

test('konto B: Studio suspenderer og aktiverer et medlem, og viser fanget e-post på testbygget', async ({
  browser,
}) => {
  const ola = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4322' })).newPage();
  await ola.goto(`${base}/konto/`);
  await ola.getByRole('textbox', { name: /^E-post/ }).fill('ola.ny@example.invalid');
  await ola.getByLabel(/^Passord/).fill('et-tredje-passord');
  await ola.locator('form').getByRole('button', { name: 'Logg inn' }).click();
  await expect(ola.getByRole('heading', { name: 'Hei, Ola Test' })).toBeVisible();

  await redaktor.setViewportSize({ width: 1440, height: 1000 });
  await redaktor.goto(`${base}/cms/`);
  await redaktor.getByRole('button', { name: 'Medlemmer og skilt', exact: true }).click();
  await expect(redaktor.getByRole('heading', { name: 'Fanget e-post (testbygg)' })).toBeVisible();
  await expect(redaktor.locator('.cms__epost').first()).toBeVisible();
  const rad = redaktor.locator('[aria-labelledby="cms-medlemmer"] .cms__rad', {
    hasText: 'ola.ny@example.invalid',
  });
  await rad.locator('summary').click();
  await rad.getByRole('button', { name: /Suspender/ }).click();
  await expect(redaktor.getByText('Ola Test er suspendert og logget ut overalt.')).toBeVisible();

  await ola.reload();
  await expect(ola.getByRole('heading', { name: 'Logg inn' })).toBeVisible();
  await ola.getByRole('textbox', { name: /^E-post/ }).fill('ola.ny@example.invalid');
  await ola.getByLabel(/^Passord/).fill('et-tredje-passord');
  await ola.locator('form').getByRole('button', { name: 'Logg inn' }).click();
  await expect(ola.getByRole('alert')).toContainText('Kontoen er stengt');

  await rad.locator('summary').click({ trial: true });
  await rad.getByRole('button', { name: /Aktiver igjen/ }).click();
  await expect(redaktor.getByText('Ola Test er aktiv igjen og må logge inn på nytt.')).toBeVisible();
  await ola.locator('form').getByRole('button', { name: 'Logg inn' }).click();
  await expect(ola.getByRole('heading', { name: 'Hei, Ola Test' })).toBeVisible();
  await ola.close();
});

/** Signs in on Min konto in a new browser context and returns the page. */
async function loggInn(
  browser: import('@playwright/test').Browser,
  epost: string,
  passord: string,
  navn: string,
) {
  const side = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4322' })).newPage();
  await side.goto(`${base}/konto/`);
  await side.getByRole('textbox', { name: /^E-post/ }).fill(epost);
  await side.getByLabel(/^Passord/).fill(passord);
  await side.locator('form').getByRole('button', { name: 'Logg inn' }).click();
  await expect(side.getByRole('heading', { name: `Hei, ${navn}` })).toBeVisible();
  return side;
}

async function filvalg(side: Page, navn: string) {
  await side.locator('summary', { hasText: 'Fil' }).click();
  await side.getByRole('menuitem', { name: navn }).click();
}

async function gjNavn(side: Page, navn: string) {
  const felt = side.getByRole('textbox', { name: 'Prosjektnavn' });
  await felt.fill(navn);
  await felt.press('Tab');
}

// Stage C (docs/konto.md): projects on the account, saved only when the member chooses to.
test('konto C: gjest lagrer ingenting på serveren; et medlem lagrer, åpner, får konflikt og laster ned', async ({
  browser,
}) => {
  // a visitor without an account: the project stays in the browser
  const gjest = await browser.newPage({ baseURL: 'http://127.0.0.1:4322' });
  await gjest.goto(`${base}/skaperverksted/signgen/`);
  await gjest.getByRole('button', { name: /Tomt dokument/ }).click();
  await gjest.getByRole('button', { name: 'Start skiltet' }).click();
  await filvalg(gjest, 'Lagre på kontoen');
  const ute = gjest.getByRole('dialog', { name: 'Logg inn for å lagre' });
  await expect(ute).toContainText('Prosjektet ligger fortsatt i denne nettleseren');
  await expect(ute.getByRole('link', { name: /Logg inn eller lag konto/ })).toBeVisible();
  await gjest.close();

  const a = await loggInn(browser, 'kari@example.invalid', 'et-langt-passord', 'Kari Test');
  await expect(a.locator('#mine-prosjekter')).toContainText('0 av 5 prosjekter');
  await expect(a.locator('#mine-tjenester')).toContainText('Gratis for alle til betalingsløsningen er klar.');
  await a.goto(`${base}/skaperverksted/signgen/`);
  await a.getByRole('button', { name: /Tomt dokument/ }).click();
  await a.getByRole('button', { name: 'Start skiltet' }).click();
  await gjNavn(a, 'Dørskilt');
  await filvalg(a, 'Lagre på kontoen');
  await expect(a.getByText('«Dørskilt» er lagret på kontoen. Du har 1 av 5 prosjekter.')).toBeVisible();
  // CSV stays open in the free period
  await a.locator('summary', { hasText: 'Fil' }).click();
  await expect(a.getByRole('menuitem', { name: 'Lag skilt fra CSV …' })).toBeVisible();
  await a.keyboard.press('Escape');

  // the same project in a second browser: open from Min konto, change and save
  const b = await loggInn(browser, 'kari@example.invalid', 'et-langt-passord', 'Kari Test');
  const rad = b.locator('#mine-prosjekter li', { hasText: 'Dørskilt' });
  await expect(rad).toContainText('Sign Forge');
  await expect(b.locator('#mine-prosjekter')).toContainText('1 av 5 prosjekter');
  const axe = await new AxeBuilder({ page: b }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await rad.getByRole('link', { name: 'Åpne Dørskilt' }).click();
  await expect(b.getByText('Åpnet «Dørskilt» fra kontoen.', { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  expect(new URL(b.url()).search).toBe('');
  await gjNavn(b, 'Dørskilt, ny');
  await filvalg(b, 'Lagre på kontoen');
  await expect(b.getByText('«Dørskilt, ny» er lagret på kontoen.', { exact: false })).toBeVisible();

  // the first browser is now behind: nothing is overwritten, and it chooses a copy
  await gjNavn(a, 'Dørskilt, gammel');
  await filvalg(a, 'Lagre på kontoen');
  const konflikt = a.getByRole('dialog', { name: 'Endret et annet sted' });
  await expect(konflikt).toContainText('Ingenting er overskrevet.');
  const axeK = await new AxeBuilder({ page: a })
    .include('.kontoprosjekt')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(axeK.violations.map((v) => v.id)).toEqual([]);
  await konflikt.getByRole('button', { name: 'Lagre som kopi' }).click();
  await expect(
    a.getByText('«Dørskilt, gammel» er lagret på kontoen som en kopi. Du har 2 av 5 prosjekter.'),
  ).toBeVisible();

  // Mine prosjekter in the tool: open the other one; unsaved work is put aside, not lost
  await gjNavn(a, 'Dørskilt, lokalt');
  await filvalg(a, 'Mine prosjekter på kontoen …');
  const liste = a.getByRole('dialog', { name: 'Mine prosjekter på kontoen' });
  await expect(liste).toContainText('2 av 5 prosjekter brukt');
  for (const bredde of [320, 390, 768, 1024, 1440]) {
    await a.setViewportSize({ width: bredde, height: 900 });
    // the editor's bar scrolls sideways on its own; the dialog must fit the screen
    const boks = await liste.boundingBox();
    expect(boks!.x, `${bredde} px`).toBeGreaterThanOrEqual(0);
    expect(boks!.x + boks!.width, `${bredde} px`).toBeLessThanOrEqual(bredde);
    const innhold = await liste.evaluate((d) => d.scrollWidth - d.clientWidth);
    expect(innhold, `${bredde} px`).toBeLessThanOrEqual(0);
    if (process.env.DP_SKJERMBILDER) {
      await a.screenshot({ path: `${process.env.DP_SKJERMBILDER}/mine-prosjekter-${bredde}.png` });
    }
  }
  await a.setViewportSize({ width: 1440, height: 900 });
  await liste.getByRole('button', { name: 'Åpne Dørskilt, ny' }).click();
  await expect(a.getByText('Det du hadde åpent, er lagt til side', { exact: false })).toBeVisible();
  await expect(a.getByRole('textbox', { name: 'Prosjektnavn' })).toHaveValue('Dørskilt, ny');
  await a.locator('summary', { hasText: 'Fil' }).click();
  const [forrige] = await Promise.all([
    a.waitForEvent('download'),
    a.getByRole('menuitem', { name: 'Last ned forrige prosjekt' }).click(),
  ]);
  expect(JSON.parse(await readFile(await forrige.path(), 'utf8')).navn).toBe('Dørskilt, lokalt');

  // Min konto: download and delete; deleting frees a place
  await b.goto(`${base}/konto/`);
  const ny = b.locator('#mine-prosjekter li', { hasText: 'Dørskilt, ny' });
  const [fil] = await Promise.all([
    b.waitForEvent('download'),
    ny.getByRole('button', { name: 'Last ned Dørskilt, ny' }).click(),
  ]);
  expect(fil.suggestedFilename()).toBe('dorskilt-ny.skaperverksted.json');
  expect(JSON.parse(await readFile(await fil.path(), 'utf8')).generator).toBe('signgen');
  b.once('dialog', (d) => void d.accept());
  await ny.getByRole('button', { name: 'Slett Dørskilt, ny' }).click();
  await expect(b.getByText('«Dørskilt, ny» er slettet fra kontoen.')).toBeVisible();
  await expect(b.locator('#mine-prosjekter')).toContainText('1 av 5 prosjekter');
  await a.close();
  await b.close();
});

// 2026-10-18 (Sivert: «Legg inn skaper til 59/mnd, enkelt å endre i cms»)
test('pakker: Studio endrer prisen på Skaper, og Min konto viser den med en gang', async ({ browser }) => {
  await redaktor.goto(`${base}/cms/`);
  await redaktor.getByRole('button', { name: 'Medlemmer og skilt', exact: true }).click();
  const skaper = redaktor.getByRole('form', { name: 'Pakken Skaper' });
  await expect(skaper.getByLabel('Pris per måned')).toHaveValue('59');
  await expect(skaper.getByLabel('Pris per år')).toHaveValue('590');
  await expect(skaper.getByLabel('Prosjekter på kontoen')).toHaveValue('50');
  await expect(skaper).toContainText('Kan ikke kjøpes ennå');
  await skaper.getByLabel('Pris per måned').fill('69');
  await skaper.getByRole('button', { name: 'Lagre Skaper' }).click();
  await expect(redaktor.getByText('Skaper er lagret og gjelder nå.')).toBeVisible();
  for (const bredde of [320, 390, 768, 1024, 1440]) {
    await redaktor.setViewportSize({ width: bredde, height: 900 });
    const bred = await redaktor.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(bred, `${bredde} px`).toBeLessThanOrEqual(0);
    if (process.env.DP_SKJERMBILDER) {
      await redaktor
        .locator('[aria-labelledby="cms-pakker"]')
        .screenshot({ path: `${process.env.DP_SKJERMBILDER}/studio-pakker-${bredde}.png` });
    }
  }

  const gjest = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4322' })).newPage();
  await gjest.goto(`${base}/konto/`);
  const pakker = gjest.getByRole('list', { name: 'Pakker' });
  await expect(pakker).toContainText('69 kr/mnd eller 590 kr/år');
  await expect(pakker).toContainText('Kan ikke kjøpes ennå');
  await expect(pakker).toContainText('Plass til 5 prosjekter');
  if (process.env.DP_SKJERMBILDER) {
    await gjest.setViewportSize({ width: 390, height: 900 });
    await pakker.screenshot({ path: `${process.env.DP_SKJERMBILDER}/konto-pakker-390.png` });
  }
  await gjest.close();

  // back to the approved price
  await redaktor.setViewportSize({ width: 1440, height: 1000 });
  await skaper.getByLabel('Pris per måned').fill('59');
  await skaper.getByRole('button', { name: 'Lagre Skaper' }).click();
  await expect(redaktor.getByText('Skaper er lagret og gjelder nå.')).toBeVisible();
});
