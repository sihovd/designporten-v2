/**
 * The CMS API and page server against PHP's built-in server and SQLite, with
 * the acceptance scenarios from the CMS plan (docs/cms/README.md#akseptansetester).
 * Skipped when PHP with pdo_sqlite is not installed.
 *
 * The same tests run against MySQL/MariaDB, the database on one.com, with
 *   DP_CMS_MYSQL="host=127.0.0.1;port=3307" DP_CMS_BRUKER=… DP_CMS_PASSORD=… node --test scripts/cms.test.mjs
 * (the user needs rights to create and drop databases named cmstest_*).
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BILDE, ELEMENT, lagNokler } from './cms-nokler.mjs';

const php = process.env.PHP_BIN || 'php';
const moduler = spawnSync(php, ['-m'], { encoding: 'utf8' });
const harPhp = moduler.status === 0 && /pdo_sqlite/i.test(moduler.stdout);
const PORT = 4390 + Math.floor(Math.random() * 400);
const URL_ = `http://127.0.0.1:${PORT}`;

const BYGGBILDE = '/midlertidig/helt.webp';
const SIDE = `<!doctype html><html><head><title>Test</title>
<link rel="preload" as="image" href="${BYGGBILDE}" fetchpriority="high" data-rediger-bilde-forhand="sider/forside#helt.bilde">
</head><body>
<span class="konseptbilde"><img src="${BYGGBILDE}" alt="Verksted" width="1600" height="900" loading="eager" sizes="100vw" data-rediger-bilde="sider/forside#helt.bilde" data-konsept="1" class="x"></span>
<span class="bhelt__merke mono" data-konseptmerke="sider/forside#helt.bilde">Konseptbilde</span>
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
  'sider/forside#helt.bilde': {
    type: 'bilde',
    standard: JSON.stringify({ src: BYGGBILDE, alt: 'Verksted', bredde: 1600, hoyde: 900, konsept: true }),
    sider: ['/'],
  },
};

/** Make a picture with PHP's GD (the same library the CMS uses). */
function lagBilde(type, bredde, hoyde) {
  const r = spawnSync(
    php,
    [
      '-r',
      `$b = imagecreatetruecolor(${bredde}, ${hoyde}); imagefilledrectangle($b, 0, 0, ${bredde / 2}, ${hoyde}, imagecolorallocate($b, 200, 40, 40));
       ob_start(); image${type}($b); fwrite(STDOUT, ob_get_clean());`,
    ],
    { maxBuffer: 1 << 26 },
  );
  if (r.status !== 0) throw new Error(String(r.stderr));
  return r.stdout;
}

/**
 * A JPEG with an EXIF block that says «rotate 90°» and carries a GPS
 * position, like a phone photo (MED-07).
 */
function medExif(jpeg) {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4 + 2 + 12 + 4);
  tiff.write('II', 0);
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  let o = 8;
  tiff.writeUInt16LE(2, o);
  o += 2;
  const gpsIfd = 8 + 2 + 2 * 12 + 4;
  for (const [tag, type, antall, verdi] of [
    [0x0112, 3, 1, 6],
    [0x8825, 4, 1, gpsIfd],
  ]) {
    tiff.writeUInt16LE(tag, o);
    tiff.writeUInt16LE(type, o + 2);
    tiff.writeUInt32LE(antall, o + 4);
    if (type === 3) tiff.writeUInt16LE(verdi, o + 8);
    else tiff.writeUInt32LE(verdi, o + 8);
    o += 12;
  }
  tiff.writeUInt32LE(0, o);
  o += 4;
  tiff.writeUInt16LE(1, o);
  o += 2;
  tiff.writeUInt16LE(0x0001, o);
  tiff.writeUInt16LE(2, o + 2);
  tiff.writeUInt32LE(2, o + 4);
  tiff.write('N\0', o + 8, 'latin1');
  o += 12;
  tiff.writeUInt32LE(0, o);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const hode = Buffer.from([0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff]);
  return Buffer.concat([jpeg.subarray(0, 2), hode, app1, jpeg.subarray(2)]);
}

/** Width and height from a WebP, PNG or JPEG file. */
function maal(buf) {
  const r = spawnSync(
    php,
    ['-r', '$i = getimagesizefromstring(stream_get_contents(STDIN)); echo $i[0], "x", $i[1];'],
    {
      input: buf,
    },
  );
  return String(r.stdout);
}

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
  async function lastOpp(innhold, navn, type) {
    const skjema = new FormData();
    skjema.append('fil', new Blob([innhold], { type }), navn);
    const svar = await fetch(`${URL_}/api/cms/?r=last-opp`, {
      method: 'POST',
      headers: {
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        Cookie: [...kaker].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      body: skjema,
    });
    return { status: svar.status, data: await svar.json() };
  }
  return { kall, kaker, lastOpp, settCsrf: (v) => (csrf = v) };
}

const side = async (sti = '/') => (await fetch(`${URL_}${sti}`)).text();

let mysqlNavn = '';
function mysqlKjor(sql) {
  const r = spawnSync(
    php,
    [
      '-r',
      '$d = new PDO($argv[1], $argv[2], $argv[3]); $d->exec($argv[4]);',
      `mysql:${process.env.DP_CMS_MYSQL}`,
      process.env.DP_CMS_BRUKER ?? '',
      process.env.DP_CMS_PASSORD ?? '',
      sql,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

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
    mkdirSync(join(rot, 'blogg'));
    writeFileSync(
      join(rot, 'blogg/index.html'),
      '<!doctype html><html lang="nb"><head><title>Blogg</title><meta name="description" content="Blogg"><link rel="canonical" href="https://designporten.no/blogg/"></head><body><!--CMS-BLOGG-START--><h1>Blogg</h1><!--CMS-BLOGG-SLUTT--></body></html>',
    );
    writeFileSync(
      join(rot, 'sitemap.xml'),
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    );
    const env = { ...process.env, DP_CMS_ROT: rot };
    if (process.env.DP_CMS_MYSQL) {
      mysqlNavn = `cmstest_${process.pid}`;
      mysqlKjor(`CREATE DATABASE ${mysqlNavn} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      env.DP_CMS_DSN = `mysql:${process.env.DP_CMS_MYSQL};dbname=${mysqlNavn};charset=utf8mb4`;
    }
    server = spawn(php, ['-S', `127.0.0.1:${PORT}`, resolve('tests/php/cms-router.php')], {
      env,
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
    if (mysqlNavn) mysqlKjor(`DROP DATABASE IF EXISTS ${mysqlNavn}`);
    if (rot) rmSync(rot, { recursive: true, force: true });
  });

  test('oppsett: første administrator krever oppsettkoden, og bare én gang', async () => {
    assert.deepEqual((await admin.kall('status')).data, { oppsett: true, harBrukere: false, felt: 5 });
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

  // ---------------------------------------------------------------- Pictures

  let bilde;

  test('MED-02: PHP forkledd som bilde, SVG og for mange piksler avvises, og ingenting blir liggende', async () => {
    const php1 = await admin.lastOpp(Buffer.from('<?php echo "hei"; ?>'), 'bilde.jpg', 'image/jpeg');
    assert.equal(php1.status, 415);
    const polyglot = Buffer.concat([Buffer.from('GIF89a'), Buffer.from('<?php system($_GET["c"]); ?>')]);
    assert.equal((await admin.lastOpp(polyglot, 'x.php.png', 'image/png')).status, 415);
    const svg = await admin.lastOpp(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      'logo.svg',
      'image/svg+xml',
    );
    assert.equal(svg.status, 415);
    assert.match(svg.data.feil, /SVG/);
    // A real PNG header that claims 10 000 × 5 000 pixels (50 megapixels).
    const stor = Buffer.from(lagBilde('png', 4, 4));
    stor.writeUInt32BE(10000, 16);
    stor.writeUInt32BE(5000, 20);
    const pikselbombe = await admin.lastOpp(stor, 'stor.png', 'image/png');
    assert.equal(pikselbombe.status, 413);
    assert.match(pikselbombe.data.feil, /piksler/);
    assert.equal((await klient().lastOpp(lagBilde('png', 8, 8), 'a.png', 'image/png')).status, 401);
    assert.equal(
      existsSync(join(rot, 'medier'))
        ? readdirSync(join(rot, 'medier')).filter((f) => f !== '.htaccess').length
        : 0,
      0,
    );
  });

  test('MED-01 og MED-07: et mobilbilde blir snudd riktig, får flere bredder og mister EXIF og GPS', async () => {
    const original = medExif(lagBilde('jpeg', 1700, 900));
    assert.ok(original.includes(Buffer.from('Exif')));
    const r = await redaktor.lastOpp(original, 'Verksted på mobil.jpg', 'image/jpeg');
    assert.equal(r.status, 201, JSON.stringify(r.data));
    bilde = r.data.medium;
    // Orientation 6: stored lying down, shown standing up.
    assert.equal(bilde.originalBredde, 900);
    assert.equal(bilde.originalHoyde, 1700);
    assert.equal(bilde.navn, 'Verksted på mobil.jpg');
    const bredder = bilde.srcset.split(', ').map((d) => Number(d.split(' ')[1].replace('w', '')));
    assert.deepEqual(bredder, [480, 800, 900]);
    const fil = await fetch(`${URL_}${bilde.src}`);
    assert.equal(fil.status, 200);
    const innhold = Buffer.from(await fil.arrayBuffer());
    assert.equal(maal(innhold), '900x1700');
    assert.ok(!innhold.includes(Buffer.from('Exif')), 'den publiserte versjonen har ikke EXIF');
    // The original is kept, unchanged and private.
    const [orig] = readdirSync(join(rot, 'api/cms/data/medier'));
    assert.deepEqual(readFileSync(join(rot, 'api/cms/data/medier', orig)), original);
    assert.ok(!bilde.src.includes('data/'));
    // The same file again is the same picture.
    const igjen = await admin.lastOpp(original, 'kopi.jpg', 'image/jpeg');
    assert.equal(igjen.status, 200);
    assert.equal(igjen.data.gjentatt, true);
    assert.equal(igjen.data.medium.id, bilde.id);
    // PNG with transparency and WebP work too.
    assert.equal((await admin.lastOpp(lagBilde('png', 300, 200), 'a.png', 'image/png')).status, 201);
    assert.equal((await admin.lastOpp(lagBilde('webp', 320, 200), 'b.webp', 'image/webp')).status, 201);
    const liste = (await redaktor.kall('medier')).data;
    assert.equal(liste.medier.length, 3);
    assert.ok(liste.maksOpplasting > 0);
  });

  test('bildefelt: alt-tekst kreves, og et utkast vises ikke for besøkende', async () => {
    const nokkel = 'sider/forside#helt.bilde';
    const felt = (await redaktor.kall('innhold')).data.felt.find((f) => f.nokkel === nokkel);
    assert.equal(felt.type, 'bilde');
    const utenAlt = await redaktor.kall('lagre', {
      metode: 'POST',
      kropp: {
        endringer: [{ nokkel, verdi: JSON.stringify({ medium: bilde.id, alt: ' ' }), versjon: felt.versjon }],
      },
    });
    assert.equal(utenAlt.data.resultater[0].status, 'ugyldig');
    assert.match(utenAlt.data.resultater[0].melding, /alt-tekst/);
    const ukjent = await redaktor.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel, verdi: { medium: 9999, alt: 'X' }, versjon: felt.versjon }] },
    });
    assert.equal(ukjent.data.resultater[0].status, 'ugyldig');
    const r = await redaktor.kall('lagre', {
      metode: 'POST',
      kropp: {
        endringer: [
          {
            nokkel,
            verdi: JSON.stringify({
              medium: bilde.id,
              alt: 'Printer & "deler"',
              fokus: '30% 40%',
              fokusMobil: '60% 50%',
            }),
            versjon: felt.versjon,
          },
        ],
      },
    });
    assert.equal(r.data.resultater[0].status, 'ok');
    assert.equal(r.data.resultater[0].felt.bilder.utkast.medium, bilde.id);
    const html = await side();
    assert.match(html, new RegExp(`src="${BYGGBILDE}"`));
    assert.doesNotMatch(html, /medier\//);
  });

  test('bildefelt: publisering setter inn bildet med srcset, alt og fokus, og fjerner konseptmerket', async () => {
    const nokkel = 'sider/forside#helt.bilde';
    const felt = (await redaktor.kall('innhold')).data.felt.find((f) => f.nokkel === nokkel);
    const p = await redaktor.kall('publiser', {
      metode: 'POST',
      kropp: { nokler: [{ nokkel, versjon: felt.versjon }] },
    });
    assert.equal(p.data.resultater[0].status, 'ok');
    const html = await side();
    const img = html.match(BILDE)[0];
    assert.match(img, new RegExp(`src="${bilde.src}"`));
    assert.match(img, /srcset="[^"]*480w[^"]*900w"/);
    assert.match(img, /alt="Printer &amp; &quot;deler&quot;"/);
    assert.match(img, /width="900" height="1700"/);
    assert.match(img, /style="--fokus: 30% 40%; --fokus-mobil: 60% 50%;"/);
    assert.match(img, /loading="eager"/);
    assert.match(img, /class="x"/);
    assert.match(html, /<link [^>]*href="\/medier\/[^"]+"[^>]*imagesrcset=/);
    assert.match(html, /data-konseptmerke="sider\/forside#helt.bilde" hidden>/);
    // Marking it a concept picture in the library brings the label back.
    await admin.kall('medium', { metode: 'POST', kropp: { id: bilde.id, konsept: true } });
    assert.match(await side(), /data-konseptmerke="sider\/forside#helt.bilde">Konseptbilde/);
    await admin.kall('medium', { metode: 'POST', kropp: { id: bilde.id, konsept: false } });
    const bruk = (await admin.kall('medier')).data.medier.find((m) => m.id === bilde.id).bruktPa;
    assert.deepEqual(bruk, [{ nokkel, publisert: true, utkast: false }]);
  });

  test('MED-04: et arkivert bilde kan ikke velges på nytt, men siden som bruker det virker', async () => {
    const a = await admin.kall('medium', { metode: 'POST', kropp: { id: bilde.id, arkivert: true } });
    assert.equal(a.data.medium.status, 'arkivert');
    assert.match(await side(), new RegExp(`src="${bilde.src}"`));
    assert.equal((await fetch(`${URL_}${bilde.src}`)).status, 200);
    assert.ok(!(await admin.kall('medier')).data.medier.some((m) => m.id === bilde.id));
    assert.ok(
      (await admin.kall('medier', { sok: '&arkiverte=1' })).data.medier.some((m) => m.id === bilde.id),
    );
    const nokkel = 'sider/forside#helt.bilde';
    const felt = (await redaktor.kall('innhold')).data.felt.find((f) => f.nokkel === nokkel);
    const r = await redaktor.kall('lagre', {
      metode: 'POST',
      kropp: { endringer: [{ nokkel, verdi: { medium: bilde.id, alt: 'Ny' }, versjon: felt.versjon }] },
    });
    assert.match(r.data.resultater[0].melding, /arkivert/);
    await admin.kall('medium', { metode: 'POST', kropp: { id: bilde.id, arkivert: false } });
  });

  test('CMS-04 for bilder: bildet siden ble laget med kan hentes tilbake og publiseres', async () => {
    const nokkel = 'sider/forside#helt.bilde';
    const h = (await redaktor.kall('historikk', { sok: `&nokkel=${encodeURIComponent(nokkel)}` })).data;
    assert.equal(h.revisjoner[0].handling, 'publisert');
    assert.equal(h.revisjoner[0].bilde.medium, bilde.id);
    const g = await redaktor.kall('gjenopprett', {
      metode: 'POST',
      kropp: { standard: true, nokkel, versjon: h.felt.versjon },
    });
    assert.equal(g.data.status, 'ok');
    await redaktor.kall('publiser', {
      metode: 'POST',
      kropp: { nokler: [{ nokkel, versjon: g.data.felt.versjon }] },
    });
    const html = await side();
    assert.match(html.match(BILDE)[0], new RegExp(`src="${BYGGBILDE}"`));
    assert.match(html, /data-konseptmerke="sider\/forside#helt.bilde">Konseptbilde/);
    // …and the uploaded one again, from the history.
    const igjen = (await redaktor.kall('historikk', { sok: `&nokkel=${encodeURIComponent(nokkel)}` })).data;
    const forrige = igjen.revisjoner.find((r) => r.bilde?.medium === bilde.id);
    const g2 = await redaktor.kall('gjenopprett', {
      metode: 'POST',
      kropp: { revisjon: forrige.id, versjon: igjen.felt.versjon },
    });
    assert.equal(g2.data.status, 'ok');
  });

  test('drift: administratoren ser hva serveren støtter, uten hemmeligheter; andre får ikke se det', async () => {
    const d = await admin.kall('drift');
    assert.equal(d.status, 200);
    assert.equal(d.data.drift.gd, true);
    assert.equal(d.data.drift.database.ok, true);
    assert.doesNotMatch(JSON.stringify(d.data), /oppsettkode|passord|test-oppsettkode/);
    assert.equal((await redaktor.kall('drift')).status, 403);
  });

  test('STUDIO: real overview counts and blog lifecycle, preview isolation, version conflicts and backup', async () => {
    assert.equal((await klient().kall('oversikt')).status, 401);
    assert.equal((await klient().kall('innlegg')).status, 401);
    const agent = klient();
    assert.equal(
      (await agent.kall('innlegg', { hoder: { Authorization: `Bearer ${agentNokkel}` } })).status,
      403,
    );
    const d = {
      tittel: 'En historie <script>alert(1)</script>',
      slug: 'en-historie',
      ingress: 'Fra verkstedet',
      kategori: 'Guider',
      forfatter: 'Eier',
      emneknagger: ['print'],
      bilde: null,
      alt: '',
      seoTittel: 'Materialer & former',
      seoBeskrivelse: 'Les om håndverket',
      blokker: [{ type: 'avsnitt', tekst: 'Et upublisert avsnitt <img src=x onerror=alert(1)>' }],
    };
    const lagret = await admin.kall('innlegg-lagre', {
      metode: 'POST',
      kropp: { id: 0, versjon: 0, dokument: d },
    });
    assert.equal(lagret.status, 200);
    let p = lagret.data.innlegg;
    assert.equal(p.versjon, 1);
    assert.equal((await fetch(`${URL_}/blogg/en-historie/`)).status, 404);
    const privat = await fetch(`${URL_}/api/cms/blogg.php?forhandsvis=${p.id}`);
    assert.equal(privat.status, 401);
    const preview = await fetch(`${URL_}/api/cms/blogg.php?forhandsvis=${p.id}`, {
      headers: { Cookie: [...admin.kaker].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get('cache-control'), /no-store/);
    assert.match(preview.headers.get('x-robots-tag'), /noindex/);
    assert.match(await preview.text(), /Privat forhåndsvisning/);
    assert.equal(
      (await admin.kall('innlegg-publiser', { metode: 'POST', kropp: { id: p.id, versjon: 0 } })).status,
      409,
    );
    assert.equal(
      (
        await admin.kall('innlegg-lagre', {
          metode: 'POST',
          kropp: { id: 0, versjon: 0, dokument: { ...d, slug: '../hemmelig' } },
        })
      ).status,
      422,
    );
    const publisert = await admin.kall('innlegg-publiser', {
      metode: 'POST',
      kropp: { id: p.id, versjon: p.versjon },
    });
    assert.equal(publisert.status, 200);
    p = publisert.data.innlegg;
    const offentlig = await side('/blogg/en-historie/');
    assert.match(offentlig, /&lt;script&gt;/);
    assert.doesNotMatch(offentlig, /<script>|<img src=x/);
    assert.match(offentlig, /<title>Materialer &amp; former – Designporten<\/title>/);
    assert.match(await side('/blogg/'), /en-historie/);
    assert.match(await side('/sitemap.xml'), /blogg\/en-historie\//);
    const nytt = await admin.kall('innlegg-lagre', {
      metode: 'POST',
      kropp: { id: p.id, versjon: p.versjon, dokument: { ...d, tittel: 'Hemmelig ny tittel' } },
    });
    assert.equal(nytt.status, 200);
    p = nytt.data.innlegg;
    assert.doesNotMatch(await side('/blogg/en-historie/'), /Hemmelig ny tittel/);
    const kopi = (await admin.kall('eksport')).data;
    assert.equal(kopi.tabeller.cms_innlegg.length, 1);
    assert.equal(kopi.tabeller.cms_innlegg_revisjoner.length, 3);
    const duplikat = (
      await admin.kall('innlegg-lagre', { metode: 'POST', kropp: { id: 0, versjon: 0, dokument: d } })
    ).data.innlegg;
    assert.equal(
      (
        await admin.kall('innlegg-publiser', {
          metode: 'POST',
          kropp: { id: duplikat.id, versjon: duplikat.versjon },
        })
      ).status,
      409,
    );
    const revisjoner = (await admin.kall('innlegg-en', { sok: `&id=${p.id}` })).data.revisjoner;
    const tilbake = await admin.kall('innlegg-gjenopprett', {
      metode: 'POST',
      kropp: { id: p.id, versjon: p.versjon, revisjon: revisjoner.at(-1).id },
    });
    assert.equal(tilbake.status, 200);
    p = tilbake.data.innlegg;
    assert.equal(p.utkast.tittel, d.tittel);
    const av = await admin.kall('innlegg-avpubliser', {
      metode: 'POST',
      kropp: { id: p.id, versjon: p.versjon },
    });
    assert.equal(av.status, 200);
    assert.equal((await fetch(`${URL_}/blogg/en-historie/`)).status, 404);
    const restaurert = await admin.kall('import', { metode: 'POST', kropp: kopi });
    assert.equal(restaurert.status, 200);
    assert.match(await side('/blogg/en-historie/'), /En historie/);
    assert.equal((await admin.kall('innlegg')).data.innlegg.length, 1);
    const oversikt = (await admin.kall('oversikt')).data.oversikt;
    assert.equal(oversikt.innlegg.totalt, 1);
    assert.equal(oversikt.innlegg.utkast, 1);
    assert.equal(oversikt.innlegg.publisert, 1);
    assert.equal(oversikt.tilkoblinger.salg, null);
    assert.equal(oversikt.tilkoblinger.besok, null);
    assert.equal((await admin.kall('oversikt', { sok: '&dager=123' })).status, 422);
    assert.equal((await redaktor.kall('oversikt')).data.oversikt.teknisk, null);
    rmSync(join(rot, 'api/cms/data/publisert.json'));
    assert.equal((await admin.kall('oversikt')).data.oversikt.teknisk.publisert, false);
    assert.equal((await redaktor.kall('gjenbygg-visning', { metode: 'POST', kropp: {} })).status, 403);
    assert.equal((await admin.kall('gjenbygg-visning', { metode: 'POST', kropp: {} })).status, 200);
    assert.equal((await admin.kall('oversikt')).data.oversikt.teknisk.publisert, true);
    assert.equal(
      (
        await admin.kall('innlegg-lagre', {
          metode: 'POST',
          kropp: {
            id: 0,
            versjon: 0,
            dokument: { ...d, blokker: [{ type: 'html', tekst: '<script>x</script>' }] },
          },
        })
      ).status,
      422,
    );
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
  // ---------------------------------------------------------------- Butikk og betaling (_handel.php)

  const BYGGET_BILDE = {
    src: '/vase.webp',
    alt: 'Vase',
    bredde: 900,
    hoyde: 900,
    konsept: true,
    midlertidig: true,
  };
  const byggprodukt = (id, navn, rekkefolge, ekstra = {}) => ({
    id,
    navn,
    status: 'plassholder',
    prisOre: null,
    farger: [{ id: 'hvit', navn: 'Hvit' }],
    materialer: ['PLA'],
    egenTekst: null,
    kortBeskrivelse: `En ${navn.toLowerCase()}.`,
    beskrivelse: `En ${navn.toLowerCase()}.`,
    kategori: 'interior',
    kategoriNavn: 'Interiør',
    bilde: `/${id}.webp`,
    bildeData: { ...BYGGET_BILDE, src: `/${id}.webp`, alt: navn },
    bildeAlternativ: null,
    mal: null,
    generator: null,
    rekkefolge,
    lagtTil: '2026-09-28',
    href: `/produkter/${id}/`,
    ...ekstra,
  });
  const KATALOG = {
    dokumentVersjon: 1,
    butikk: { betaling: false, frakt: [] },
    referanse: {
      farger: [
        { id: 'hvit', navn: 'Hvit', hex: '#ffffff' },
        { id: 'svart', navn: 'Svart', hex: '#111111' },
      ],
      materialtyper: [
        { type: 'PLA', beskrivelse: 'Plast av maisstivelse.' },
        { type: 'PETG', beskrivelse: 'Seig plast.' },
      ],
      kategorier: [
        { slug: 'interior', navn: 'Interiør', ingress: '' },
        { slug: 'figurer', navn: 'Figurer', ingress: '' },
      ],
      generatorer: [{ id: 'signgen', navn: 'Sign Forge' }],
    },
    produkter: [
      byggprodukt('vase', 'Vase', 1, {
        egenTekst: { maksTegn: 20, tilleggOre: null },
        beskrivelse: 'En vase.\n\nPlassholder.',
      }),
      byggprodukt('krok', 'Krok', 2),
    ],
  };
  // The product template as the build writes it (api/cms/maler/produkt.html), cut down.
  const PRODUKTMAL = `<!doctype html><html><head><title>§navn§ | Designporten</title>
<meta name="description" content="§kortBeskrivelse§"><meta property="og:title" content="§navn§ | Designporten">
<meta property="og:image" content="https://designporten.no/x.webp"><link rel="canonical" href="https://designporten.no/produkter/mal/">
</head><body data-produktside="§id§"><h1 class="t">§navn§</h1>
<!--hvis:plassholder--><p class="p"><strong>Plassholder.</strong></p><!--/hvis:plassholder-->
<img src="§bilde.src§" srcset="§bilde.srcset§" alt="§bilde.alt§" width="§bilde.bredde§">
<!--hvis:bilde.konsept--><span class="merke">Konseptbilde</span><!--/hvis:bilde.konsept-->
<div class="b"><!--gjenta:avsnitt--><p>§avsnitt§</p><!--/gjenta:avsnitt--></div>
<!--hvis:mal--><p class="mal">§mal§</p><!--/hvis:mal-->
<ul class="m"><!--gjenta:materiale--><li>§m.type§: §m.beskrivelse§</li><!--/gjenta:materiale--></ul>
<!--hvis:relatert--><h2>§relatertTittel§</h2><ul class="g" data-produktrutenett data-utvalg="relatert"><li class="k"><article data-alternativ><h3 class="produktkort__navn">§navn§</h3><!--hvis:pris--><span class="pris">§pris§</span><!--/hvis:pris--><!--hvis:plassholder--><span class="s">Plassholder</span><!--/hvis:plassholder--></article></li></ul><!--/hvis:relatert-->
</body></html>`;
  const FORSIDE_MED_PRODUKTER = `<!doctype html><html><head><title>Butikk</title></head><body>
<ul class="g" data-produktrutenett data-utvalg="populaere"><li>bygget kort</li></ul></body></html>`;
  const kortnavn = (html) => [...html.matchAll(/class="produktkort__navn">([^<]*)</g)].map((m) => m[1]);
  const klientkatalog = (html) =>
    JSON.parse(/<script type="application\/json" id="dp-katalog">(.*?)<\/script>/.exec(html)[1]);
  let produktbilde;

  test('butikk: bare administrator kan se og endre butikken', async () => {
    writeFileSync(join(rot, 'api/katalog.json'), JSON.stringify(KATALOG));
    mkdirSync(join(rot, 'api/cms/maler'), { recursive: true });
    writeFileSync(join(rot, 'api/cms/maler/produkt.html'), PRODUKTMAL);
    mkdirSync(join(rot, 'utvalg'), { recursive: true });
    writeFileSync(join(rot, 'utvalg/index.html'), FORSIDE_MED_PRODUKTER);
    // The PHP build builds every category page; side.php answers 404 for an empty one.
    mkdirSync(join(rot, 'produkter/kategori/figurer'), { recursive: true });
    writeFileSync(join(rot, 'produkter/kategori/figurer/index.html'), FORSIDE_MED_PRODUKTER);
    assert.equal((await redaktor.kall('butikk')).status, 403);
    assert.equal((await klient().kall('butikk')).status, 401);
    const { status, data } = await admin.kall('butikk');
    assert.equal(status, 200);
    assert.deepEqual(
      data.butikk.produkter.map((p) => [p.id, p.versjon, p.studio, p.fraBygget, p.vises]),
      [
        ['vase', 0, false, true, true],
        ['krok', 0, false, true, true],
      ],
    );
    assert.deepEqual(data.butikk.produkter[0].skjema.egenTekst, { maksTegn: 20, tilleggOre: null });
    assert.equal(data.butikk.produkter[0].skjema.bilde, null);
    assert.deepEqual(
      data.butikk.referanse.farger.map((f) => f.id),
      ['hvit', 'svart'],
    );
    assert.equal(data.butikk.kasse.aktiv, false);
    assert.equal(data.butikk.stripe.tilkoblet, false);
    assert.equal(JSON.stringify(data).includes('sk_'), false);
    // The template is never served.
    assert.equal((await fetch(`${URL_}/api/cms/maler/produkt.html`)).status, 403);
  });

  test('butikk: hvert felt kontrolleres, og en lagring gjelder på sidene med en gang', async () => {
    const opplastet = await admin.lastOpp(lagBilde('png', 600, 400), 'krok.png', 'image/png');
    assert.equal(opplastet.status, 201);
    produktbilde = opplastet.data.medium;
    const skjema = (await admin.kall('butikk')).data.butikk.produkter[0].skjema;
    const vase = {
      ...skjema,
      status: 'bekreftet',
      prisOre: 24950,
      navn: 'Spiralvase <3',
      kortBeskrivelse: 'Vase i én spiral.',
      beskrivelse: 'Første avsnitt.\n\nAndre avsnitt.',
      egenTekst: { maksTegn: 20, tilleggOre: 5000 },
      mal: { bredde: 120, dybde: 80, hoyde: 45.5 },
      materialer: ['PLA', 'PETG'],
      farger: ['hvit', 'svart'],
    };
    const lagre = (id, verdi, versjon = 0, ny = false) =>
      admin.kall('butikk-produkt', { metode: 'POST', kropp: { id, versjon, verdi, ...(ny ? { ny } : {}) } });
    const halv = await lagre('vase', vase);
    assert.equal(halv.status, 422);
    assert.match(halv.data.feil, /hele kroner/);
    assert.match(
      (await lagre('vase', { ...vase, prisOre: null, farger: ['lilla'] })).data.feil,
      /Ukjent farge/,
    );
    assert.match((await lagre('vase', { ...vase, prisOre: null, kategori: 'ukjent' })).data.feil, /kategori/);
    assert.match(
      (await lagre('vase', { ...vase, prisOre: null, mal: { bredde: 0, dybde: 1, hoyde: 1 } })).data.feil,
      /Bredden/,
    );
    assert.match(
      (await lagre('vase', { ...vase, prisOre: null, bilde: { medium: produktbilde.id, alt: '' } })).data
        .feil,
      /alt-tekst/,
    );
    assert.equal((await lagre('finnes-ikke', vase)).status, 404);
    const ok = await lagre('vase', { ...vase, prisOre: 24900 });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.butikk.produkter.find((p) => p.id === 'vase').versjon, 1);
    assert.equal((await lagre('vase', { ...vase, prisOre: 100 })).status, 409);

    // The snapshot is never served, and pages go through side.php once it exists.
    assert.ok(existsSync(join(rot, 'api/cms/data/butikk.json')));
    assert.equal((await fetch(`${URL_}/api/cms/data/butikk.json`)).status, 403);
    const html = await side('/produkter/vase/');
    assert.match(html, /<title>Spiralvase &lt;3 \| Designporten<\/title>/);
    assert.match(html, /<meta property="og:title" content="Spiralvase &lt;3 \| Designporten">/);
    assert.match(html, /<meta name="description" content="Vase i én spiral\.">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/designporten.no\/produkter\/vase\/">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/designporten.no\/vase.webp">/);
    assert.doesNotMatch(html, /name="robots"/);
    assert.match(html, /"price":"249\.00"/);
    assert.match(html, /<h1 class="t">Spiralvase &lt;3<\/h1>/);
    assert.doesNotMatch(html, /class="p"/);
    assert.match(html, /<span class="merke">Konseptbilde<\/span>/);
    assert.match(html, /<div class="b"><p>Første avsnitt\.<\/p><p>Andre avsnitt\.<\/p><\/div>/);
    assert.match(html, /<p class="mal">120 × 80 × 45,5 mm<\/p>/);
    assert.match(html, /<li>PETG: Seig plast\.<\/li>/);
    assert.match(html, /<img src="\/vase.webp" alt="Vase" width="900">/);
    assert.doesNotMatch(html, /§/);
    assert.deepEqual(kortnavn(html), ['Krok']);
    assert.match(html, /<h2>Mer fra interiør<\/h2>/);
    const k = klientkatalog(html);
    assert.equal(k.side, 'vase');
    assert.equal(k.produkter.vase.prisOre, 24900);
    assert.deepEqual(k.produkter.vase.egenTekst, { maksTegn: 20, tilleggOre: 5000 });
    assert.deepEqual(
      k.produkter.vase.farger.map((f) => f.hex),
      ['#ffffff', '#111111'],
    );

    // Payment and order requests read the same catalogue (api/_butikk.php).
    const r = spawnSync(
      php,
      [
        '-r',
        'require $argv[1]; echo json_encode(array_column(dp_butikk_katalog()["produkter"], null, "id")["vase"]);',
        join(rot, 'api/_butikk.php'),
      ],
      { encoding: 'utf8' },
    );
    const solgt = JSON.parse(r.stdout);
    assert.equal(solgt.prisOre, 24900);
    assert.equal(solgt.status, 'bekreftet');
    assert.equal(solgt.egenTekst.tilleggOre, 5000);
    assert.deepEqual(solgt.farger, [
      { id: 'hvit', navn: 'Hvit' },
      { id: 'svart', navn: 'Svart' },
    ]);
  });

  test('butikk: et nytt produkt får egen side og bilde fra bildebiblioteket, uten nytt bygg', async () => {
    const nytt = {
      status: 'bekreftet',
      prisOre: 19900,
      navn: 'Gavekort-tre',
      kortBeskrivelse: 'Et lite tre.',
      beskrivelse: 'Et lite tre.',
      kategori: 'figurer',
      bilde: { medium: produktbilde.id, alt: 'Et lite tre i hvit PLA' },
      bildeAlternativ: null,
      mal: null,
      materialer: ['PLA'],
      farger: ['hvit'],
      egenTekst: null,
      generator: 'signgen',
      rekkefolge: 0,
      lagtTil: '2026-11-11',
      skjult: false,
    };
    const lagre = (id, verdi, ny = true) =>
      admin.kall('butikk-produkt', { metode: 'POST', kropp: { id, versjon: 0, verdi, ny } });
    assert.match((await lagre('Gavekort tre', nytt)).data.feil, /små bokstaver/);
    assert.equal((await lagre('mal', nytt)).status, 422);
    assert.equal((await lagre('krok', nytt)).status, 409);
    assert.match((await lagre('tre', { ...nytt, bilde: null })).data.feil, /bildebiblioteket/);
    assert.equal((await lagre('tre', nytt)).status, 200);

    const html = await side('/produkter/tre/');
    assert.match(html, /<h1 class="t">Gavekort-tre<\/h1>/);
    assert.match(
      html,
      new RegExp(`<img src="${produktbilde.src}" srcset="[^"]+" alt="Et lite tre i hvit PLA"`),
    );
    assert.match(html, /<h2>Flere produkter<\/h2>/);
    assert.equal(klientkatalog(html).side, 'tre');
    assert.equal((await fetch(`${URL_}/produkter/kategori/figurer/`)).status, 200);
    // The product grids follow Studio's order: rekkefølge 0 first, confirmed first on the homepage.
    assert.deepEqual(kortnavn(await side('/utvalg/')), ['Gavekort-tre', 'Spiralvase &lt;3']);
    const bruk = (await admin.kall('medier')).data.medier.find((m) => m.id === produktbilde.id).bruktPa;
    assert.ok(
      bruk.some((b) => b.nokkel === 'butikk/tre' && b.publisert),
      JSON.stringify(bruk),
    );
  });

  test('butikk: skjulte og ukjente produkter og tomme kategorier finnes ikke', async () => {
    const tre = (await admin.kall('butikk')).data.butikk.produkter.find((p) => p.id === 'tre');
    const svar = await admin.kall('butikk-produkt', {
      metode: 'POST',
      kropp: { id: 'tre', versjon: tre.versjon, verdi: { ...tre.skjema, skjult: true } },
    });
    assert.equal(svar.status, 200);
    assert.equal(svar.data.butikk.produkter.find((p) => p.id === 'tre').vises, false);
    assert.equal((await fetch(`${URL_}/produkter/tre/`)).status, 404);
    assert.equal((await fetch(`${URL_}/produkter/finnes-ikke/`)).status, 404);
    assert.equal((await fetch(`${URL_}/produkter/kategori/figurer/`)).status, 404);
    assert.deepEqual(kortnavn(await side('/utvalg/')), ['Spiralvase &lt;3']);
    assert.equal(klientkatalog(await side('/utvalg/')).produkter.tre, undefined);
  });

  test('butikk: tilbakestilling gir nettsidebyggets verdier igjen, og et Studio-produkt slettes', async () => {
    const produkter = (await admin.kall('butikk')).data.butikk.produkter;
    const vase = produkter.find((p) => p.id === 'vase');
    const tre = produkter.find((p) => p.id === 'tre');
    const kall = (id, versjon) =>
      admin.kall('butikk-produkt', { metode: 'POST', kropp: { id, versjon, verdi: null } });
    const svar = await kall('vase', vase.versjon);
    assert.equal(svar.status, 200);
    assert.equal(svar.data.butikk.produkter.find((p) => p.id === 'vase').studio, false);
    assert.equal(
      (await kall('tre', tre.versjon)).data.butikk.produkter.some((p) => p.id === 'tre'),
      false,
    );
    const html = await side('/produkter/vase/');
    assert.match(html, /<h1 class="t">Vase<\/h1>/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch(html, /ld\+json/);
    const logg = (await admin.kall('logg')).data.hendelser.map((h) => h.handling);
    assert.ok(logg.includes('butikk.lagre') && logg.includes('butikk.tilbakestill'));
  });

  test('butikk: kortbetaling og frakt lagres med kontroll av hvert felt', async () => {
    const frakt = [
      { navn: 'Hentes', prisOre: 0, dagerMin: 1, dagerMaks: 3 },
      { navn: 'Posten, liten pakke', prisOre: 8900, dagerMin: 3, dagerMaks: 8 },
    ];
    const kall = (verdi, versjon = 0) =>
      admin.kall('butikk-innstillinger', { metode: 'POST', kropp: { versjon, verdi } });
    assert.equal((await kall({ betaling: true, frakt: Array(6).fill(frakt[0]) })).status, 422);
    assert.match(
      (await kall({ betaling: true, frakt: [{ ...frakt[1], dagerMaks: 2 }] })).data.feil,
      /før «fra»/,
    );
    assert.match(
      (await kall({ betaling: true, frakt: [{ ...frakt[1], dagerMaks: null }] })).data.feil,
      /begge/,
    );
    assert.match((await kall({ betaling: 'ja', frakt })).data.feil, /på eller av/);
    const ok = await kall({ betaling: true, frakt });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data.butikk.innstillinger.studio, { betaling: true, frakt });
    // keys are not on this server: card payment stays closed and says why
    assert.deepEqual(ok.data.butikk.kasse, {
      aktiv: false,
      grunn: 'Betalingsløsningen er ikke koblet til ennå.',
    });
    const lagret = JSON.parse(readFileSync(join(rot, 'api/cms/data/butikk.json'), 'utf8'));
    assert.equal(lagret.betaling, true);
    assert.deepEqual(lagret.frakt, frakt);
  });

  test('ordre: webhooken lagrer en betalt ordre én gang, også uten e-postoppsett', async () => {
    const hendelse = JSON.stringify({
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_test_studioordre123',
          payment_status: 'paid',
          payment_intent: 'pi_test_123456',
          client_reference_id: 'DP-ABC12',
          amount_total: 58700,
          currency: 'nok',
          shipping_cost: { amount_total: 8900 },
          customer_details: { email: 'kunde@example.no', name: 'Kari Kunde', phone: '+4799999999' },
          collected_information: {
            shipping_details: {
              name: 'Kari Kunde',
              address: { line1: 'Gate 1', postal_code: '0150', city: 'Oslo' },
            },
          },
          metadata: { navn: 'Kari Kunde', melding: 'Takk' },
        },
      },
    });
    const send = () => {
      const t = Math.floor(Date.now() / 1000);
      const v1 = createHmac('sha256', 'whsec_lokaltest').update(`${t}.${hendelse}`).digest('hex');
      return fetch(`${URL_}/api/stripe/webhook/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${v1}` },
        body: hendelse,
      });
    };
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    assert.equal((await redaktor.kall('ordrer')).status, 403);
    const { data } = await admin.kall('ordrer');
    assert.equal(data.ordrer.length, 1);
    const o = data.ordrer[0];
    assert.equal(o.referanse, 'DP-ABC12');
    assert.equal(o.modus, 'test');
    assert.equal(o.betalingId, 'pi_test_123456');
    assert.equal(o.levering, 'ny');
    assert.equal(o.varslet, false);
    assert.equal(o.totalOre, 58700);
    assert.equal(o.adresse, 'Kari Kunde\nGate 1\n0150 Oslo');
    assert.deepEqual(o.linjer, [{ navn: 'Vase', antall: 2, belopOre: 49800 }]);
    assert.equal((await admin.kall('butikk')).data.butikk.nyeOrdrer, 1);

    const endret = await admin.kall('ordre', {
      metode: 'POST',
      kropp: { id: o.id, levering: 'sendt', notat: 'Sendt med Posten' },
    });
    assert.equal(endret.status, 200);
    assert.equal(endret.data.ordre.levering, 'sendt');
    assert.equal(endret.data.ordre.notat, 'Sendt med Posten');
    assert.equal(
      (await admin.kall('ordre', { metode: 'POST', kropp: { id: o.id, levering: 'betalt' } })).status,
      422,
    );
    // no e-mail settings on this server: the order stays, and resending says why
    const varsle = await admin.kall('ordre-varsle', { metode: 'POST', kropp: { id: o.id } });
    assert.equal(varsle.status, 502);
    assert.match(varsle.data.feil, /E-posten kunne ikke sendes/);
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

  test('bildefelt får bildet siden ble laget med som standard', () => {
    const dist = mkdtempSync(join(tmpdir(), 'dp-cms-dist-'));
    try {
      writeFileSync(
        join(dist, 'index.html'),
        '<img src="/a.webp" alt="Et &quot;bord&quot;" width="1600" height="900" data-rediger-bilde="sider/a#helt.bilde" data-konsept="1">',
      );
      assert.deepEqual(lagNokler(dist, dist), {
        'sider/a#helt.bilde': {
          type: 'bilde',
          standard: JSON.stringify({
            src: '/a.webp',
            alt: 'Et "bord"',
            bredde: 1600,
            hoyde: 900,
            konsept: true,
          }),
          sider: ['/'],
        },
      });
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
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
