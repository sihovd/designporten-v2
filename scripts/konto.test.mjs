/**
 * Member accounts and the public sign gallery (php/api/konto/) against PHP's
 * built-in server and SQLite. Skipped when PHP with pdo_sqlite is not installed.
 * See docs/konto.md.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const php = process.env.PHP_BIN || 'php';
const moduler = spawnSync(php, ['-m'], { encoding: 'utf8' });
const harPhp = moduler.status === 0 && /pdo_sqlite/i.test(moduler.stdout);
const harGd = harPhp && /^gd$/im.test(moduler.stdout);
const PORT = 4800 + Math.floor(Math.random() * 400);
const URL_ = `http://127.0.0.1:${PORT}`;

function png() {
  const r = spawnSync(php, [
    '-r',
    '$b = imagecreatetruecolor(40, 20); imagefilledrectangle($b, 0, 0, 20, 20, imagecolorallocate($b, 136, 61, 255)); ob_start(); imagepng($b); fwrite(STDOUT, base64_encode(ob_get_clean()));',
  ]);
  return `data:image/png;base64,${String(r.stdout)}`;
}

const mal = (navn) => ({
  versjon: 1,
  id: 'x',
  navn,
  dokument: { generator: 'signgen', navn, lag: [], objekter: {} },
});

/** A tiny client with its own cookie jar, like one browser. */
function klient() {
  const kaker = new Map();
  let csrf = '';
  async function kall(api, r, { kropp, hoder = {}, sok = '' } = {}) {
    const svar = await fetch(`${URL_}/api/${api}/?r=${r}${sok}`, {
      method: kropp ? 'POST' : 'GET',
      headers: {
        ...(kropp ? { 'Content-Type': 'application/json', 'X-Konto': '1' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        Cookie: [...kaker].map(([k, v]) => `${k}=${v}`).join('; '),
        ...hoder,
      },
      body: kropp ? JSON.stringify(kropp) : undefined,
    });
    for (const k of svar.headers.getSetCookie()) {
      const [par] = k.split(';');
      const [navn, ...v] = par.split('=');
      if (v.join('=') === '' || /expires=Thu, 01 Jan 1970|Max-Age=0/i.test(k)) kaker.delete(navn.trim());
      else kaker.set(navn.trim(), v.join('='));
    }
    const type = svar.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await svar.json() : await svar.arrayBuffer();
    if (data.csrf) csrf = data.csrf;
    return { status: svar.status, data, type };
  }
  return { konto: (r, v) => kall('konto', r, v), cms: (r, v) => kall('cms', r, v), kaker };
}

describe(
  'Brukerkontoer og skiltgalleri',
  { skip: !harPhp && 'PHP med pdo_sqlite er ikke installert' },
  () => {
    let rot;
    let server;
    const gjest = klient();
    const ola = klient();

    before(async () => {
      rot = mkdtempSync(join(tmpdir(), 'dp-konto-'));
      cpSync(resolve('php'), rot, { recursive: true });
      writeFileSync(join(rot, 'api/bygg.php'), "<?php\nreturn ['base' => '/', 'test' => true];\n");
      writeFileSync(join(rot, 'api/cms/nokler.json'), '{}');
      server = spawn(php, ['-S', `127.0.0.1:${PORT}`, resolve('tests/php/cms-router.php')], {
        env: { ...process.env, DP_CMS_ROT: rot },
        stdio: 'ignore',
      });
      for (let i = 0; i < 50; i++) {
        try {
          await fetch(`${URL_}/api/konto/?r=status`);
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

    test('status: alt er gratis nå, CSV blir betalt senere, ingen betaling er slått på', async () => {
      const { status, data } = await gjest.konto('status');
      assert.equal(status, 200);
      assert.equal(data.aktiv, true);
      assert.equal(data.tjenester.csv.betaling, 'gratis-inntil-videre');
      assert.equal(data.leverandorer.stripe.aktiv, false);
      assert.equal(data.leverandorer.vipps.aktiv, false);
    });

    test('registrering: sjekker feltene, logger inn og gir plan «gratis» med tilgang til CSV', async () => {
      const kort = await ola.konto('registrer', {
        kropp: { navn: 'Ola', epost: 'ola@example.no', passord: 'kort', vilkar: true },
      });
      assert.equal(kort.status, 422);
      const utenVilkar = await ola.konto('registrer', {
        kropp: { navn: 'Ola', epost: 'ola@example.no', passord: 'et-langt-passord' },
      });
      assert.equal(utenVilkar.status, 422);
      const ok = await ola.konto('registrer', {
        kropp: { navn: 'Ola Nordmann', epost: 'Ola@Example.no', passord: 'et-langt-passord', vilkar: true },
      });
      assert.equal(ok.status, 201);
      assert.equal(ok.data.medlem.epost, 'ola@example.no');
      assert.equal(ok.data.medlem.plan, 'gratis');
      assert.equal(ok.data.medlem.tilgang.csv, true);
      assert.equal(ok.data.medlem.betaling.status, 'ingen');
      assert.ok(ola.kaker.get('dp_konto'));
      const meg = await ola.konto('meg');
      assert.equal(meg.data.medlem.navn, 'Ola Nordmann');
      const igjen = await klient().konto('registrer', {
        kropp: { navn: 'X', epost: 'ola@example.no', passord: 'et-langt-passord', vilkar: true },
      });
      assert.equal(igjen.status, 409);
    });

    test('POST uten X-Konto-hodet avvises, så skjemaer på andre nettsteder ikke kan bruke innloggingen', async () => {
      const svar = await fetch(`${URL_}/api/konto/?r=loggut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `dp_konto=${ola.kaker.get('dp_konto')}` },
        body: '{}',
      });
      assert.equal(svar.status, 403);
      assert.notEqual((await ola.konto('meg')).data.medlem, null);
    });

    test('innlogging: feil passord gir 401, riktig gir medlemmet, utlogging glemmer økten', async () => {
      const k = klient();
      assert.equal(
        (await k.konto('logginn', { kropp: { epost: 'ola@example.no', passord: 'feil-passord-her' } }))
          .status,
        401,
      );
      const ok = await k.konto('logginn', {
        kropp: { epost: 'OLA@example.no', passord: 'et-langt-passord' },
      });
      assert.equal(ok.status, 200);
      assert.equal(ok.data.medlem.navn, 'Ola Nordmann');
      await k.konto('loggut', { kropp: {} });
      assert.equal((await k.konto('meg')).data.medlem, null);
    });

    let gjesteskilt;
    test('deling: en gjest deler et skilt, det vises øverst i galleriet med bilde, og bare nøkkelen kan endre det', async () => {
      const delt = await gjest.konto('del', { kropp: { mal: mal('Hytta'), bilde: harGd ? png() : null } });
      assert.equal(delt.status, 201);
      assert.match(delt.data.id, /^[a-f0-9]{16}$/);
      gjesteskilt = delt.data;
      const galleri = await gjest.konto('skilt');
      assert.equal(galleri.data.skilt[0].id, delt.data.id);
      assert.equal(galleri.data.skilt[0].skaper, 'Gjest');
      assert.equal(galleri.data.skilt[0].tittel, 'Hytta');
      if (harGd) {
        const bilde = await fetch(`${URL_}${galleri.data.skilt[0].bilde}`);
        assert.equal(bilde.headers.get('content-type'), 'image/png');
      }
      const feil = await klient().konto('del', {
        kropp: { id: delt.data.id, nokkel: 'feil', mal: mal('Kapret') },
      });
      assert.equal(feil.status, 403);
      const endret = await gjest.konto('del', {
        kropp: { id: delt.data.id, nokkel: delt.data.nokkel, mal: mal('Hytta vår') },
      });
      assert.equal(endret.status, 200);
      assert.equal((await gjest.konto('skilt')).data.skilt[0].tittel, 'Hytta vår');
    });

    test('deling avviser noe som ikke er et Sign Forge-skilt, og bilder som ikke er PNG', async () => {
      const annen = await gjest.konto('del', { kropp: { mal: { dokument: { generator: 'lampe' } } } });
      assert.equal(annen.status, 422);
      const svg = await gjest.konto('del', {
        kropp: { mal: mal('X'), bilde: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
      });
      assert.equal(svg.status, 422);
    });

    test('mal: «bruk» gir malen tilbake og teller bruken', async () => {
      const svar = await klient().konto('bruk', { kropp: { id: gjesteskilt.id } });
      assert.equal(svar.status, 200);
      assert.equal(svar.data.mal.navn, 'Hytta vår');
      assert.equal(svar.data.mal.dokument.generator, 'signgen');
      assert.equal((await gjest.konto('skilt')).data.skilt[0].gangerBrukt, 1);
    });

    let olasSkilt;
    test('et medlem som deler, står som skaper og ser skiltet under sine skilt', async () => {
      const delt = await ola.konto('del', { kropp: { mal: mal('Navneskilt') } });
      olasSkilt = delt.data.id;
      const forste = (await gjest.konto('skilt')).data.skilt[0];
      assert.equal(forste.skaper, 'Ola Nordmann');
      const mine = await ola.konto('mine-skilt');
      assert.deepEqual(
        mine.data.skilt.map((s) => s.id),
        [olasSkilt],
      );
      // the member can remove it without the browser key
      const annen = klient();
      await annen.konto('logginn', { kropp: { epost: 'ola@example.no', passord: 'et-langt-passord' } });
      assert.equal((await annen.konto('profil', { kropp: { navn: 'Ola N.' } })).status, 200);
      assert.equal((await gjest.konto('skilt')).data.skilt[0].skaper, 'Ola N.');
    });

    test('galleriet blar med «neste»', async () => {
      const side1 = await gjest.konto('skilt', { sok: '&antall=1' });
      assert.equal(side1.data.skilt.length, 1);
      assert.ok(side1.data.neste);
      const side2 = await gjest.konto('skilt', {
        sok: `&antall=1&for=${encodeURIComponent(side1.data.neste)}`,
      });
      assert.equal(side2.data.skilt.length, 1);
      assert.notEqual(side2.data.skilt[0].id, side1.data.skilt[0].id);
    });

    test('administrator: ser medlemsregisteret og kan skjule et skilt fra galleriet', async () => {
      const admin = klient();
      assert.equal((await admin.konto('admin-medlemmer')).status, 401);
      await admin.cms('oppsett', {
        kropp: {
          kode: 'test-oppsettkode-1234',
          epost: 'eier@example.no',
          navn: 'Eier',
          passord: 'et-langt-passord',
        },
      });
      const register = await admin.konto('admin-medlemmer');
      assert.equal(register.status, 200);
      assert.equal(register.data.antall, 1);
      assert.equal(register.data.medlemmer[0].epost, 'ola@example.no');
      assert.equal(register.data.medlemmer[0].antallSkilt, 1);
      assert.equal(register.data.gjesteskilt, 1);
      assert.equal((await admin.konto('admin-skjul', { kropp: { id: gjesteskilt.id } })).status, 200);
      const galleri = await gjest.konto('skilt');
      assert.ok(!galleri.data.skilt.some((s) => s.id === gjesteskilt.id));
      // a member is not an administrator
      assert.equal((await ola.konto('admin-medlemmer')).status, 401);
    });

    test('sletting: kontoen, skiltene og innloggingene forsvinner', async () => {
      assert.equal((await ola.konto('slett-konto', { kropp: { passord: 'feil-passord-her' } })).status, 403);
      assert.equal((await ola.konto('slett-konto', { kropp: { passord: 'et-langt-passord' } })).status, 200);
      assert.equal((await ola.konto('meg')).data.medlem, null);
      const galleri = await gjest.konto('skilt');
      assert.ok(!galleri.data.skilt.some((s) => s.id === olasSkilt));
      // the guest still removes their own sign with the key
      const slettet = await gjest.konto('slett-skilt', {
        kropp: { id: gjesteskilt.id, nokkel: gjesteskilt.nokkel },
      });
      assert.equal(slettet.status, 200);
    });
  },
);
