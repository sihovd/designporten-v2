/**
 * The CMS API and page server against PHP's built-in server and SQLite, with
 * the acceptance scenarios from the CMS plan (docs/cms/README.md#akseptansetester).
 * Skipped when PHP with pdo_sqlite is not installed.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELEMENT, lagNokler } from './cms-nokler.mjs';

const php = process.env.PHP_BIN || 'php';
const moduler = spawnSync(php, ['-m'], { encoding: 'utf8' });
const harPhp = moduler.status === 0 && /pdo_sqlite/i.test(moduler.stdout);
const PORT = 4390 + Math.floor(Math.random() * 400);
const URL_ = `http://127.0.0.1:${PORT}`;

const SIDE = `<!doctype html><html><head><title>Test</title></head><body>
<h1 class="a" data-rediger="sider/forside#helt.tittel" data-astro-cid-x>Lag noe eget</h1>
<p data-rediger="sider/forside#helt.ingress">Vi printer &amp; tegner.</p>
<div data-rediger="sider/om#tekst" data-rediger-type="avsnitt"><p data-astro-cid-y>En.</p><p data-astro-cid-y>To.</p></div>
<a href="/x/"><span data-rediger="sider/forside#knapp">Se mer</span></a>
</body></html>`;

const NOKLER = {
  'sider/forside#helt.tittel': { type: 'linje', standard: 'Lag noe eget', sider: ['/'] },
  'sider/forside#helt.ingress': { type: 'linje', standard: 'Vi printer & tegner.', sider: ['/'] },
  'sider/om#tekst': { type: 'avsnitt', standard: 'En.\n\nTo.', sider: ['/'] },
  'sider/forside#knapp': { type: 'linje', standard: 'Se mer', sider: ['/'] },
};

/** A tiny client with its own cookie jar, like one browser. */
function klient() {
  const kaker = new Map();
  let csrf = '';
  async function kall(r, { metode = 'GET', kropp, hoder = {}, sok = '' } = {}) {
    const svar = await fetch(`${URL_}/api/cms/?r=${r}${sok}`, {
      method: metode,
      headers: {
        ...(kropp ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        Cookie: [...kaker].map(([k, v]) => `${k}=${v}`).join('; '),
        ...hoder,
      },
      body: kropp ? JSON.stringify(kropp) : undefined,
    });
    for (const k of svar.headers.getSetCookie()) {
      const [par] = k.split(';');
      const [navn, ...v] = par.split('=');
      kaker.set(navn.trim(), v.join('='));
    }
    const data = await svar.json();
    if (data.csrf) csrf = data.csrf;
    return { status: svar.status, data };
  }
  return { kall, kaker, settCsrf: (v) => (csrf = v) };
}

const side = async (sti = '/') => (await fetch(`${URL_}${sti}`)).text();

describe('CMS', { skip: !harPhp && 'PHP med pdo_sqlite er ikke installert' }, () => {
  let rot;
  let server;
  const admin = klient();
  const redaktor = klient();
  let agentNokkel;
  let publiserAgent;

  before(async () => {
    rot = mkdtempSync(join(tmpdir(), 'dp-cms-'));
    cpSync(resolve('php'), rot, { recursive: true });
    writeFileSync(join(rot, 'api/bygg.php'), "<?php\nreturn ['base' => '/', 'test' => true];\n");
    writeFileSync(join(rot, 'api/cms/nokler.json'), JSON.stringify(NOKLER));
    writeFileSync(join(rot, 'index.html'), SIDE);
    writeFileSync(join(rot, '404.html'), 'Fant ikke');
    server = spawn(php, ['-S', `127.0.0.1:${PORT}`, resolve('tests/php/cms-router.php')], {
      env: { ...process.env, DP_CMS_ROT: rot },
      stdio: 'ignore',
    });
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(`${URL_}/api/cms/?r=status`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error('PHP-serveren startet ikke.');
  });

  after(() => {
    server?.kill();
    if (rot) rmSync(rot, { recursive: true, force: true });
  });

  test('oppsett: første administrator krever oppsettkoden, og bare én gang', async () => {
    assert.deepEqual((await admin.kall('status')).data, { oppsett: true, harBrukere: false, felt: 4 });
    const feil = await admin.kall('oppsett', {
      metode: 'POST',
      kropp: { kode: 'feil', epost: 'a@b.no', navn: 'A', passord: 'et-langt-passord' },
    });
    assert.equal(feil.status, 403);
    const ok = await admin.kall('oppsett', {
      metode: 'POST',
      kropp: {
        kode: 'test-oppsettkode-1234',
        epost: 'eier@example.no',
        navn: 'Eier',
        passord: 'et-langt-passord',
      },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.bruker.rolle, 'admin');
    assert.equal(admin.kaker.get('dp_cms'), '1');
    const igjen = await klient().kall('oppsett', {
      metode: 'POST',
      kropp: { kode: 'test-oppsettkode-1234', epost: 'x@example.no', navn: 'X', passord: 'et-langt-passord' },
    });
    assert.equal(igjen.status, 409);
  });

  test('SEC-01: uten innlogging gir admin-API-et ingen utkast, og POST uten CSRF-token avvises', async () => {
    const anonym = klient();
    assert.equal((await anonym.kall('innhold')).status, 401);
    assert.equal((await anonym.kall('lagre', { metode: 'POST', kropp: { endringer: [] } })).status, 401);
    assert.equal((await anonym.kall('eksport')).status, 401);
    const utenToken = klient();
    await utenToken.kall('logginn', {
      metode: 'POST',
      kropp: { epost: 'eier@example.no', passord: 'et-langt-passord' },
    });
    utenToken.settCsrf('');
    const r = await utenToken.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel: 'sider/forside#helt.tittel', verdi: 'x', versjon: 0 }] },
    });
    assert.equal(r.status, 403);
    assert.equal(
      (
        await anonym.kall('logginn', {
          metode: 'POST',
          kropp: { epost: 'eier@example.no', passord: 'feil-passord-123' },
        })
      ).status,
      401,
    );
  });

  test('CMS-01: et utkast vises for redaktøren, mens siden for besøkende er uendret', async () => {
    const r = await admin.kall('lagre', {
      metode: 'POST',
      kropp: {
        endringer: [
          { nokkel: 'sider/forside#helt.tittel', verdi: '  Lag   noe <b>helt</b> eget ', versjon: 0 },
        ],
      },
    });
    assert.equal(r.data.resultater[0].status, 'ok');
    assert.equal(r.data.resultater[0].felt.utkast, 'Lag noe <b>helt</b> eget');
    const innhold = (await admin.kall('innhold')).data.felt.find(
      (f) => f.nokkel === 'sider/forside#helt.tittel',
    );
    assert.equal(innhold.utkast, 'Lag noe <b>helt</b> eget');
    assert.equal(innhold.publisert, null);
    assert.equal(innhold.standard, 'Lag noe eget');
    assert.deepEqual((await klient().kall('publisert')).data, { innhold: {} });
    assert.match(await side(), />Lag noe eget</);
  });

  test('ukjente felt og tomme tekster lagres ikke', async () => {
    const ukjent = await admin.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel: 'sider/x#y', verdi: 'x', versjon: 0 }] },
    });
    assert.equal(ukjent.status, 422);
    const tom = await admin.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel: 'sider/forside#helt.ingress', verdi: '   ', versjon: 0 }] },
    });
    assert.equal(tom.data.resultater[0].status, 'ugyldig');
  });

  test('CMS-02: publisering vises på siden med en gang, uten bygg, og teksten er escapet', async () => {
    const r = await admin.kall('publiser', {
      metode: 'POST',
      kropp: { nokler: [{ nokkel: 'sider/forside#helt.tittel', versjon: 1 }] },
    });
    assert.equal(r.data.resultater[0].status, 'ok');
    assert.equal(r.data.resultater[0].felt.publisert, 'Lag noe <b>helt</b> eget');
    assert.equal(r.data.resultater[0].felt.utkast, null);
    const html = await side();
    assert.match(
      html,
      /<h1 class="a" data-rediger="sider\/forside#helt.tittel" data-astro-cid-x>Lag noe &lt;b&gt;helt&lt;\/b&gt; eget<\/h1>/,
    );
    assert.match(html, />Vi printer &amp; tegner.</, 'upubliserte felt står som bygget');
    assert.deepEqual((await klient().kall('publisert')).data.innhold, {
      'sider/forside#helt.tittel': 'Lag noe <b>helt</b> eget',
    });
  });

  test('avsnitt settes inn som <p> med de samme attributtene', async () => {
    await admin.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel: 'sider/om#tekst', verdi: 'Første.\n\n\nAndre.', versjon: 0 }] },
    });
    await admin.kall('publiser', {
      metode: 'POST',
      kropp: { nokler: [{ nokkel: 'sider/om#tekst', versjon: 1 }] },
    });
    assert.match(
      await side(),
      /data-rediger-type="avsnitt"><p data-astro-cid-y>Første.<\/p><p data-astro-cid-y>Andre.<\/p><\/div>/,
    );
  });

  test('CMS-05: to redaktører på samme felt gir konflikt, ingen stille overskriving', async () => {
    const ny = await admin.kall('bruker', {
      metode: 'POST',
      kropp: { navn: 'Redaktør', rolle: 'redaktor', epost: 'red@example.no', passord: 'redaktor-passord' },
    });
    assert.equal(ny.status, 200);
    await redaktor.kall('logginn', {
      metode: 'POST',
      kropp: { epost: 'red@example.no', passord: 'redaktor-passord' },
    });
    const felt = (await redaktor.kall('innhold')).data.felt.find(
      (f) => f.nokkel === 'sider/forside#helt.ingress',
    );
    const forste = await admin.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel: felt.nokkel, verdi: 'Fra admin', versjon: felt.versjon }] },
    });
    assert.equal(forste.data.resultater[0].status, 'ok');
    const andre = await redaktor.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel: felt.nokkel, verdi: 'Fra redaktør', versjon: felt.versjon }] },
    });
    assert.equal(andre.data.resultater[0].status, 'konflikt');
    assert.equal(andre.data.resultater[0].felt.utkast, 'Fra admin');
    const ingenTilgang = await redaktor.kall('brukere');
    assert.equal(ingenTilgang.status, 403);
  });

  test('CMS-04: en tidligere versjon kan gjenopprettes, og historikken viser hvem og når', async () => {
    const nokkel = 'sider/forside#helt.tittel';
    let felt = (await admin.kall('innhold')).data.felt.find((f) => f.nokkel === nokkel);
    await admin.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel, verdi: 'Ny tittel', versjon: felt.versjon }] },
    });
    felt = (await admin.kall('innhold')).data.felt.find((f) => f.nokkel === nokkel);
    await admin.kall('publiser', { metode: 'POST', kropp: { nokler: [{ nokkel, versjon: felt.versjon }] } });
    assert.match(await side(), />Ny tittel</);
    const historikk = (await admin.kall('historikk', { sok: `&nokkel=${encodeURIComponent(nokkel)}` })).data;
    const gammel = historikk.revisjoner.find(
      (r) => r.handling === 'publisert' && r.verdi === 'Lag noe <b>helt</b> eget',
    );
    assert.ok(gammel);
    assert.equal(gammel.av, 'Eier');
    const g = await admin.kall('gjenopprett', {
      metode: 'POST',
      kropp: { revisjon: gammel.id, versjon: historikk.felt.versjon },
    });
    assert.equal(g.status, 200);
    await admin.kall('publiser', {
      metode: 'POST',
      kropp: { nokler: [{ nokkel, versjon: g.data.felt.versjon }] },
    });
    assert.match(await side(), />Lag noe &lt;b&gt;helt&lt;\/b&gt; eget</);
    const standard = await admin.kall('gjenopprett', {
      metode: 'POST',
      kropp: { standard: true, nokkel, versjon: g.data.felt.versjon + 1 },
    });
    assert.equal(standard.data.felt.utkast, 'Lag noe eget');
    const etter = (await admin.kall('historikk', { sok: `&nokkel=${encodeURIComponent(nokkel)}` })).data
      .revisjoner;
    assert.ok(etter.filter((r) => r.handling === 'gjenopprettet').length >= 2);
  });

  test('AGT-01 og AGT-03: en agent foreslår tekst med aktør, kilde og begrunnelse, uten duplikater', async () => {
    const a = await admin.kall('bruker', {
      metode: 'POST',
      kropp: { navn: 'Tekstagent', rolle: 'agent', rettigheter: ['forslag'] },
    });
    agentNokkel = a.data.nokkel;
    assert.match(agentNokkel, /^dpcms_[0-9a-f]{48}$/);
    assert.deepEqual(a.data.bruker.rettigheter, ['forslag']);
    const agent = klient();
    const hoder = { Authorization: `Bearer ${agentNokkel}`, 'Idempotency-Key': 'jobb-1' };
    const kropp = { nokkel: 'sider/forside#knapp', verdi: 'Se alt', begrunnelse: 'Kortere', kilde: 'test' };
    const f1 = await agent.kall('forslag', { metode: 'POST', kropp, hoder });
    assert.equal(f1.status, 201);
    const f2 = await agent.kall('forslag', { metode: 'POST', kropp, hoder });
    assert.equal(f2.data.gjentatt, true);
    assert.equal(f2.data.forslag.id, f1.data.forslag.id);
    const liste = (await admin.kall('forslag')).data.forslag;
    assert.equal(liste.filter((f) => f.nokkel === 'sider/forside#knapp').length, 1);
    assert.equal(liste[0].av, 'Tekstagent');
    const logg = (await admin.kall('logg')).data.hendelser.find((h) => h.handling === 'forslag.ny');
    assert.equal(logg.aktor, 'Tekstagent (agent)');
    assert.equal(logg.for, 'Se mer');
    assert.equal(logg.etter, 'Se alt');
  });

  test('AGT-02: en agent uten rett til å publisere blir avvist og loggført, og siden er uendret', async () => {
    const agent = klient();
    const hoder = { Authorization: `Bearer ${agentNokkel}` };
    const r = await agent.kall('publiser', {
      metode: 'POST',
      kropp: { nokler: [{ nokkel: 'sider/forside#knapp', versjon: 0 }] },
      hoder,
    });
    assert.equal(r.status, 403);
    const lagre = await agent.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel: 'sider/forside#knapp', verdi: 'x', versjon: 0 }] },
      hoder,
    });
    assert.equal(lagre.status, 403);
    assert.equal((await agent.kall('brukere', { hoder })).status, 403);
    assert.equal(
      (await agent.kall('innhold', { hoder: { Authorization: 'Bearer dpcms_feil' } })).status,
      401,
    );
    assert.match(await side(), />Se mer</);
    const nektet = (await admin.kall('logg')).data.hendelser.filter(
      (h) => h.resultat === 'avvist' && h.aktor === 'Tekstagent (agent)',
    );
    assert.ok(nektet.some((h) => h.handling === 'nektet.publiser'));
  });

  test('et godkjent forslag blir utkast, og kan publiseres i samme steg', async () => {
    const forslag = (await redaktor.kall('forslag')).data.forslag.find((f) => f.status === 'venter');
    const r = await redaktor.kall('behandle', {
      metode: 'POST',
      kropp: { id: forslag.id, beslutning: 'godkjenn', publiser: true },
    });
    assert.equal(r.data.status, 'godkjent');
    assert.match(await side(), />Se alt</);
    const igjen = await redaktor.kall('behandle', {
      metode: 'POST',
      kropp: { id: forslag.id, beslutning: 'avvis' },
    });
    assert.equal(igjen.status, 409);
  });

  test('en agent med publiseringsrett kan publisere, og nøkkelen kan byttes', async () => {
    const a = await admin.kall('bruker', {
      metode: 'POST',
      kropp: { navn: 'Regel', rolle: 'agent', rettigheter: ['utkast', 'publiser'] },
    });
    publiserAgent = a.data;
    const agent = klient();
    const hoder = { Authorization: `Bearer ${publiserAgent.nokkel}` };
    const felt = (await agent.kall('innhold', { hoder })).data.felt.find(
      (f) => f.nokkel === 'sider/forside#helt.ingress',
    );
    const lagret = await agent.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel: felt.nokkel, verdi: 'Fra regel', versjon: felt.versjon }] },
      hoder,
    });
    assert.equal(lagret.data.resultater[0].status, 'ok');
    const ny = await admin.kall('ny-nokkel', { metode: 'POST', kropp: { id: publiserAgent.bruker.id } });
    assert.notEqual(ny.data.nokkel, publiserAgent.nokkel);
    assert.equal((await agent.kall('innhold', { hoder })).status, 401);
    await admin.kall('bruker', { metode: 'POST', kropp: { id: publiserAgent.bruker.id, aktiv: false } });
    assert.equal(
      (await agent.kall('innhold', { hoder: { Authorization: `Bearer ${ny.data.nokkel}` } })).status,
      401,
    );
  });

  test('OPS-01: sikkerhetskopi kan lastes ned og gjenopprettes, og siden følger med', async () => {
    const kopi = (await admin.kall('eksport')).data;
    assert.equal(kopi.format, 'designporten-cms');
    const nokkel = 'sider/forside#knapp';
    const felt = (await admin.kall('innhold')).data.felt.find((f) => f.nokkel === nokkel);
    await admin.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel, verdi: 'Midlertidig', versjon: felt.versjon }] },
    });
    await admin.kall('publiser', {
      metode: 'POST',
      kropp: { nokler: [{ nokkel, versjon: felt.versjon + 1 }] },
    });
    assert.match(await side(), />Midlertidig</);
    const r = await admin.kall('import', { metode: 'POST', kropp: kopi });
    assert.equal(r.status, 200);
    assert.match(await side(), />Se alt</);
    assert.equal((await redaktor.kall('import', { metode: 'POST', kropp: kopi })).status, 403);
    assert.equal((await admin.kall('import', { metode: 'POST', kropp: { format: 'annet' } })).status, 422);
  });

  test('innloggingen begrenses etter for mange feil', async () => {
    const k = klient();
    let siste;
    for (let i = 0; i < 11; i++) {
      siste = await k.kall('logginn', {
        metode: 'POST',
        kropp: { epost: 'red@example.no', passord: `feil-${i}-passord` },
      });
    }
    assert.equal(siste.status, 429);
  });
});

describe('CMS-feltlisten', () => {
  test('mønsteret finner tekst og avsnitt, men ikke elementer med annet innhold', () => {
    const html =
      '<h1 data-rediger="sider/a#b">Tekst</h1><div data-rediger="sider/a#c" data-rediger-type="avsnitt"><p x>1</p><p x>2</p></div><p data-rediger="sider/a#d">A <em>b</em></p>';
    assert.deepEqual(
      [...html.matchAll(ELEMENT)].map((m) => m[3]),
      ['sider/a#b', 'sider/a#c'],
    );
  });

  test('bygget feiler hvis et merket felt ikke kan settes inn', () => {
    const dist = mkdtempSync(join(tmpdir(), 'dp-cms-dist-'));
    const innhold = mkdtempSync(join(tmpdir(), 'dp-cms-innhold-'));
    try {
      writeFileSync(join(innhold, 'a.json'), JSON.stringify({ b: 'Tekst', d: 'A b' }));
      writeFileSync(join(dist, 'index.html'), '<h1 data-rediger="sider/a#b">Tekst</h1>');
      assert.deepEqual(lagNokler(dist, innhold), {
        'sider/a#b': { type: 'linje', standard: 'Tekst', sider: ['/'] },
      });
      writeFileSync(join(dist, 'index.html'), '<p data-rediger="sider/a#d">A <em>b</em></p>');
      assert.throws(() => lagNokler(dist, innhold), /ikke ren tekst/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
      rmSync(innhold, { recursive: true, force: true });
    }
  });
});
