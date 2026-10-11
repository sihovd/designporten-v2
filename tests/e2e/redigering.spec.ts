import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

/** Inline text editing for someone signed in to /admin (GitHub is faked here). */

const lesJson = (fil: string) => JSON.parse(readFileSync(fil, 'utf8')) as unknown;
const hent = (data: unknown, sti: string) =>
  sti.split('.').reduce<unknown>((v, d) => (v as Record<string, unknown>)[d], data);

async function loggInn(page: Page, push = true) {
  await page.addInitScript(() =>
    localStorage.setItem('sveltia-cms.user', JSON.stringify({ backendName: 'github', token: 'test-token' })),
  );
  const lagret: { fil: string; kropp: { message: string; content: string; sha: string } }[] = [];
  await page.route('https://api.github.com/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/repos/sihovd/designporten-v2') {
      return route.fulfill({ json: { permissions: { push } } });
    }
    const fil = decodeURIComponent(url.pathname.replace('/repos/sihovd/designporten-v2/contents/', ''));
    if (req.method() === 'GET') {
      const innhold = Buffer.from(readFileSync(fil)).toString('base64');
      return route.fulfill({ json: { sha: 'sha-1', content: innhold } });
    }
    lagret.push({ fil, kropp: req.postDataJSON() });
    return route.fulfill({ json: { content: {}, commit: {} } });
  });
  return lagret;
}

test.describe('inline redigering', () => {
  test.use({ reducedMotion: 'reduce' });

  test('besøkende ser ingen verktøylinje', async ({ page }) => {
    let kall = 0;
    await page.route('https://api.github.com/**', (r) => {
      kall++;
      return r.abort();
    });
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Redigering' })).toHaveCount(0);
    expect(kall).toBe(0);
  });

  test('innlogget uten skrivetilgang ser ingen verktøylinje', async ({ page }) => {
    await loggInn(page, false);
    await page.goto('/om/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('region', { name: 'Redigering' })).toHaveCount(0);
  });

  test('redaktør endrer en tittel og en knapp og lagrer til innholdsfilen', async ({ page }) => {
    const lagret = await loggInn(page);
    await page.goto('/');
    const bar = page.getByRole('region', { name: 'Redigering' });
    await bar.getByRole('button', { name: 'Rediger tekst' }).click();
    await expect(bar.getByRole('button', { name: 'Ferdig' })).toHaveAttribute('aria-pressed', 'true');

    const tittel = page.locator('h1');
    await tittel.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' sammen');
    await page.keyboard.press('Enter'); // one-line field: no line break
    await expect(tittel).toHaveText('Vi gir ideer form sammen');

    // A text inside a link is edited, not followed.
    const knapp = page.locator('[data-rediger="sider/forside#helt.knapp1"]');
    await knapp.click();
    await expect(page).toHaveURL(/\/$/);
    await page.keyboard.press('End');
    await page.keyboard.type(' nå');
    await expect(bar).toContainText('2 endringer er ikke lagret.');

    expect((await new AxeBuilder({ page }).include('.dp-red').analyze()).violations).toEqual([]);

    await bar.getByRole('button', { name: 'Lagre' }).click();
    await expect(bar).toContainText('2 tekster lagret.');
    expect(lagret).toHaveLength(1);
    expect(lagret[0]!.fil).toBe('src/content/sider/forside.json');
    expect(lagret[0]!.kropp.message).toBe('Innhold: oppdaterer sidetekst «forside» fra siden');
    const ny = JSON.parse(Buffer.from(lagret[0]!.kropp.content, 'base64').toString('utf8'));
    expect(ny.helt.tittel).toBe('Vi gir ideer form sammen');
    expect(ny.helt.knapp1).toBe('Start å skape nå');
    expect(ny.portal).toEqual((lesJson('src/content/sider/forside.json') as { portal: unknown }).portal);
  });

  test('forkast setter teksten tilbake', async ({ page }) => {
    await loggInn(page);
    await page.goto('/kontakt/');
    const bar = page.getByRole('region', { name: 'Redigering' });
    await bar.getByRole('button', { name: 'Rediger tekst' }).click();
    const h1 = page.locator('h1');
    await h1.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await expect(bar).toContainText('En tekst er tom');
    await expect(bar.getByRole('button', { name: 'Lagre' })).toBeDisabled();
    await bar.getByRole('button', { name: 'Forkast' }).click();
    await expect(h1).toHaveText('Skriv hva det gjelder');
  });

  test('produktbeskrivelse lagres som avsnitt i produktfilen', async ({ page }) => {
    const lagret = await loggInn(page);
    await page.goto('/produkter/bokstotter/');
    await page.getByRole('button', { name: 'Rediger tekst' }).click();
    const beskrivelse = page.locator('.produktside__beskrivelse');
    await beskrivelse.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Ny setning.');
    await page.getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByRole('region', { name: 'Redigering' })).toContainText('1 tekst lagret.');
    const ny = JSON.parse(Buffer.from(lagret[0]!.kropp.content, 'base64').toString('utf8'));
    expect(lagret[0]!.fil).toBe('src/content/produkter/data/bokstotter.json');
    expect(ny.beskrivelse.split('\n\n')).toHaveLength(2);
    expect(ny.beskrivelse.split('\n\n')[0]).toMatch(/forfra\. Ny setning\.$/);
    expect(ny.navn).toBe('Bokstøtter med buet profil');
  });
});

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
