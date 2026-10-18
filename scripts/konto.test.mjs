/**
 * Member accounts and the public sign gallery (php/api/konto/) against PHP's
 * built-in server and SQLite. Skipped when PHP with pdo_sqlite is not installed.
 * Against MySQL/MariaDB instead, like scripts/cms.test.mjs:
 *   DP_CMS_MYSQL="host=127.0.0.1;port=3307" DP_CMS_BRUKER=… DP_CMS_PASSORD=… node --test scripts/konto.test.mjs
 * See docs/konto.md.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  bekreft,
  dsnFor,
  harGd,
  harPhp,
  kartlegg,
  KAKE,
  klient,
  mal,
  mysql,
  php,
  png,
  ryddMysql,
  settUrl,
  sql,
  startServer,
  url,
} from './konto-testhjelp.mjs';

const PORT = 4800 + Math.floor(Math.random() * 400);

/** A sign shared as a guest before 2026-10-17, written straight into the database (guests can no longer publish). */
function gammeltGjesteskilt(rot, id, nokkel) {
  sql(
    rot,
    'INSERT INTO dp_skilt (offentlig_id, nokkel_hash, medlem_id, skaper, tittel, mal, opprettet, endret) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)',
    [
      id,
      hashHex(nokkel),
      'Gjest',
      'Hytta',
      JSON.stringify(mal('Hytta')),
      '2026-10-16T10:00:00Z',
      '2026-10-16T10:00:00Z',
    ],
  );
}
const hashHex = (v) => String(spawnSync(php, ['-r', 'echo hash("sha256", $argv[1]);', v]).stdout);

describe(
  'Brukerkontoer og skiltgalleri',
  { skip: !harPhp && 'PHP med pdo_sqlite er ikke installert' },
  () => {
    let rot;
    let server;
    const gjest = klient();
    const ola = klient();

    before(async () => {
      settUrl(`http://127.0.0.1:${PORT}`);
      ({ rot, server } = await startServer({ port: PORT }));
    });

    after(() => {
      server?.kill();
      if (rot) for (const d of [rot.sti, rot.post]) rmSync(d, { recursive: true, force: true });
      ryddMysql();
    });

    test('status: CSV hører til en betalt pakke, men har en gratisperiode; ingen betaling er slått på', async () => {
      const { status, data } = await gjest.konto('status');
      assert.equal(status, 200);
      assert.equal(data.aktiv, true);
      assert.equal(data.oppsett, 'konto');
      assert.equal(data.tjenester.csv.betaling, 'betalt');
      assert.equal(data.tjenester.csv.gratisperiode.apenFor, 'alle');
      assert.equal(data.planer.gratis.prosjekter, 5);
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
      assert.ok(ola.kaker.get(KAKE));
      const meg = await ola.konto('meg');
      assert.equal(meg.data.medlem.navn, 'Ola Nordmann');
      // a confirmation link went out; until it is used, publishing is closed
      assert.equal(ok.data.bekreftelse.sendt, true);
      assert.equal(ok.data.medlem.epostBekreftet, null);
      assert.equal(ok.data.medlem.tilganger['sign-forge'].funksjoner.publisering.tilgang, false);
      const forTidlig = await ola.konto('del', { kropp: { mal: mal('For tidlig') } });
      assert.equal(forTidlig.status, 403);
      assert.match(forTidlig.data.feil, /Bekreft e-postadressen/);
      await bekreft(ola, rot, 'ola@example.no');
      assert.ok((await ola.konto('meg')).data.medlem.epostBekreftet);
      const igjen = await klient().konto('registrer', {
        kropp: { navn: 'X', epost: 'ola@example.no', passord: 'et-langt-passord', vilkar: true },
      });
      assert.equal(igjen.status, 409);
    });

    test('POST uten X-Konto-hodet avvises, så skjemaer på andre nettsteder ikke kan bruke innloggingen', async () => {
      const svar = await fetch(`${url()}/api/konto/?r=loggut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `${KAKE}=${ola.kaker.get(KAKE)}` },
        body: '{}',
      });
      assert.equal(svar.status, 403);
      assert.notEqual((await ola.konto('meg')).data.medlem, null);
      // nor from a page on another site that names itself in Origin
      const fremmed = await ola.konto('loggut', { kropp: {}, hoder: { Origin: 'https://annet.example' } });
      assert.equal(fremmed.status, 403);
      assert.notEqual((await ola.konto('meg')).data.medlem, null);
    });

    test('innloggingen bruker test-kaken, så en testutlogging aldri rører den ekte kaken', async () => {
      assert.ok(ola.kaker.get(KAKE));
      assert.equal(ola.kaker.get('dp_konto'), undefined);
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

    const gjesteskilt = { id: 'a1b2c3d4e5f60718', nokkel: 'gammel-gjestenokkel-fra-nettleseren' };
    test('publisering: en gjest kan ikke publisere, men et skilt delt som gjest før 17.10 blir liggende', async () => {
      const gjestPub = await gjest.konto('del', {
        kropp: { mal: mal('Hytta'), bilde: harGd ? png() : null },
      });
      assert.equal(gjestPub.status, 401);
      gammeltGjesteskilt(rot, gjesteskilt.id, gjesteskilt.nokkel);
      const galleri = await gjest.konto('skilt');
      assert.equal(galleri.data.skilt[0].id, gjesteskilt.id);
      assert.equal(galleri.data.skilt[0].skaper, 'Gjest');
      // nobody else can change or remove it
      const feil = await klient().konto('slett-skilt', { kropp: { id: gjesteskilt.id, nokkel: 'feil' } });
      assert.equal(feil.status, 403);
    });

    test('deling avviser noe som ikke er et Sign Forge-skilt, og bilder som ikke er PNG', async () => {
      const annen = await ola.konto('del', { kropp: { mal: { dokument: { generator: 'lampe' } } } });
      assert.equal(annen.status, 422);
      const svg = await ola.konto('del', {
        kropp: { mal: mal('X'), bilde: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
      });
      assert.equal(svg.status, 422);
    });

    test('mal: «bruk» gir malen tilbake og teller bruken', async () => {
      const svar = await klient().konto('bruk', { kropp: { id: gjesteskilt.id } });
      assert.equal(svar.status, 200);
      assert.equal(svar.data.mal.navn, 'Hytta');
      assert.equal(svar.data.mal.dokument.generator, 'signgen');
      assert.equal((await gjest.konto('skilt')).data.skilt[0].gangerBrukt, 1);
    });

    let olasSkilt;
    test('et medlem som publiserer, står som skaper og ser skiltet under sine skilt', async () => {
      const delt = await ola.konto('del', { kropp: { mal: mal('Navneskilt'), bilde: harGd ? png() : null } });
      assert.equal(delt.status, 201);
      olasSkilt = delt.data.id;
      const forste = (await gjest.konto('skilt')).data.skilt[0];
      assert.equal(forste.skaper, 'Ola Nordmann');
      assert.equal(forste.tittel, 'Navneskilt');
      if (harGd) {
        const bilde = await fetch(`${url()}${forste.bilde}`);
        assert.equal(bilde.headers.get('content-type'), 'image/png');
      }
      const endret = await ola.konto('del', { kropp: { id: olasSkilt, mal: mal('Navneskilt 2') } });
      assert.equal(endret.status, 200);
      assert.equal((await gjest.konto('skilt')).data.skilt[0].tittel, 'Navneskilt 2');
      // another member cannot change it
      const kari = klient();
      await kari.konto('registrer', {
        kropp: { navn: 'Kari', epost: 'kari@example.no', passord: 'et-annet-langt-passord', vilkar: true },
      });
      await bekreft(kari, rot, 'kari@example.no');
      assert.equal((await kari.konto('del', { kropp: { id: olasSkilt, mal: mal('Kapret') } })).status, 403);
      assert.equal((await kari.konto('slett-skilt', { kropp: { id: olasSkilt } })).status, 403);
      assert.equal(
        (await kari.konto('slett-konto', { kropp: { passord: 'et-annet-langt-passord' } })).status,
        200,
      );
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
      assert.equal((await ola.konto('admin-skjul', { kropp: { id: olasSkilt } })).status, 401);
    });

    test('kartleggingen er et kommandolinjeverktøy som bare leser og bare viser antall', async () => {
      // not on the web any more
      assert.equal((await fetch(`${url()}/api/konto/kartlegg.php`)).status, 404);
      const r = kartlegg(rot.sti, dsnFor(rot));
      assert.equal(r.status, 0, r.stderr);
      const tall = JSON.parse(r.stdout);
      assert.equal(tall.database, mysql ? 'mysql' : 'sqlite');
      assert.equal(tall.medlemmer.aktive, 1);
      assert.equal(tall.galleri.utenEier, 1);
      assert.equal(tall.galleri.skjulte, 1);
      assert.equal(tall.migrering.konto, 4);
      // counts only: no addresses or names
      assert.ok(!r.stdout.includes('@') && !r.stdout.includes('Ola'));
    });

    test('kartleggingen starter bare med en innstillingsfil, og migrerer eller lager ingenting', () => {
      const uten = spawnSync(php, [resolve('scripts/kartlegg-konto.php')], { encoding: 'utf8' });
      assert.equal(uten.status, 2);
      assert.match(uten.stderr, /--konfig=/);
      const mappe = mkdtempSync(join(tmpdir(), 'dp-kartlegg-'));
      try {
        // a missing SQLite file is not created
        const mangler = join(mappe, 'finnes-ikke.sqlite');
        assert.notEqual(kartlegg(mappe, `sqlite:${mangler}`).status, 0);
        assert.equal(existsSync(mangler), false);
        // an empty database stays empty: no tables, no migration
        const tom = join(mappe, 'tom.sqlite');
        writeFileSync(tom, '');
        const r = kartlegg(mappe, `sqlite:${tom}`);
        assert.equal(r.status, 0, r.stderr);
        assert.deepEqual(JSON.parse(r.stdout).tabeller, {});
        assert.equal(statSync(tom).size, 0);
      } finally {
        rmSync(mappe, { recursive: true, force: true });
      }
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

describe('Brukerkontoer uten CMS', { skip: !harPhp && 'PHP med pdo_sqlite er ikke installert' }, () => {
  const port = PORT + 500;
  let rot;
  let server;
  const k = klient();

  before(async () => {
    settUrl(`http://127.0.0.1:${port}`);
    ({ rot, server } = await startServer({ port, utenCms: true }));
  });

  after(() => {
    server?.kill();
    if (rot) for (const d of [rot.sti, rot.post]) rmSync(d, { recursive: true, force: true });
    ryddMysql();
  });

  test('kontoene er slått på med egne innstillinger når CMS-et ikke finnes', async () => {
    const { data } = await k.konto('status');
    assert.equal(data.aktiv, true);
    assert.equal(data.oppsett, 'konto');
  });

  test('registrer, logg inn, publiser og hent egne skilt uten CMS', async () => {
    const ny = await k.konto('registrer', {
      kropp: { navn: 'Per', epost: 'per@example.no', passord: 'et-langt-passord', vilkar: true },
    });
    assert.equal(ny.status, 201);
    await bekreft(k, rot, 'per@example.no');
    await k.konto('loggut', { kropp: {} });
    assert.equal(
      (await k.konto('logginn', { kropp: { epost: 'per@example.no', passord: 'et-langt-passord' } })).status,
      200,
    );
    const delt = await k.konto('del', { kropp: { mal: mal('Postkasse') } });
    assert.equal(delt.status, 201);
    assert.equal((await k.konto('mine-skilt')).data.skilt[0].id, delt.data.id);
  });

  test('uten CMS finnes ingen administrator: admin-handlingene er stengt', async () => {
    assert.equal((await k.konto('admin-medlemmer')).status, 503);
  });
});

describe(
  'Brukerkontoer uten kontooppsett',
  { skip: !harPhp && 'PHP med pdo_sqlite er ikke installert' },
  () => {
    const port = PORT + 600;
    let rot;
    let server;
    const k = klient();

    before(async () => {
      settUrl(`http://127.0.0.1:${port}`);
      // the CMS has settings, the accounts do not: the CMS's must not be borrowed
      ({ rot, server } = await startServer({ port, utenKonto: true }));
    });

    after(() => {
      server?.kill();
      if (rot) for (const d of [rot.sti, rot.post]) rmSync(d, { recursive: true, force: true });
      ryddMysql();
    });

    test('status sier at kontoene er av, alle andre kall får 503, og databasen røres ikke', async () => {
      const { status, data } = await k.konto('status');
      assert.equal(status, 200);
      assert.equal(data.aktiv, false);
      assert.equal(data.oppsett, null);
      const kall = [
        [
          'registrer',
          { kropp: { navn: 'Kari', epost: 'kari@example.no', passord: 'et-langt-passord', vilkar: true } },
        ],
        ['logginn', { kropp: { epost: 'kari@example.no', passord: 'et-langt-passord' } }],
        ['meg'],
        ['skilt'],
        ['del', { kropp: { mal: mal('Postkasse') } }],
        ['admin-medlemmer'],
      ];
      for (const [r, v] of kall) {
        const svar = await k.konto(r, v);
        assert.equal(svar.status, 503, r);
        assert.match(svar.data.feil, /ikke slått på/);
      }
      if (mysql) {
        const r = kartlegg(rot.post, rot.dsn);
        assert.equal(r.status, 0, r.stderr);
        assert.deepEqual(JSON.parse(r.stdout).tabeller, {});
      } else {
        // SQLite would have created the file on the first connection
        assert.equal(existsSync(join(rot.sti, 'cms.sqlite')), false);
      }
    });
  },
);

describe('Kontoinnstillinger', { skip: !harPhp && 'PHP er ikke installert' }, () => {
  /** Which settings _db.php picks, given these files (null = the file is missing). */
  function oppsett({ konto = null, cms = null, test = false }) {
    const rot = mkdtempSync(join(tmpdir(), 'dp-kontooppsett-'));
    try {
      mkdirSync(join(rot, 'api/konto'), { recursive: true });
      mkdirSync(join(rot, 'api/cms'), { recursive: true });
      cpSync(resolve('php/api/konto/_db.php'), join(rot, 'api/konto/_db.php'));
      const php_ = (v) => `<?php return ${v};\n`;
      writeFileSync(join(rot, 'api/bygg.php'), php_(`['base' => '/', 'test' => ${test}]`));
      if (konto) writeFileSync(join(rot, 'api/konto/konfig.php'), php_(konto));
      if (cms) writeFileSync(join(rot, 'api/cms/konfig.php'), php_(cms));
      const r = spawnSync(
        php,
        [
          '-r',
          'require $argv[1]; echo json_encode(konto_konfig_med_kilde());',
          join(rot, 'api/konto/_db.php'),
        ],
        { encoding: 'utf8' },
      );
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout);
    } finally {
      rmSync(rot, { recursive: true, force: true });
    }
  }
  const CMS = "['dsn' => 'sqlite:/cms.sqlite', 'oppsettkode' => 'hemmelig-kode-1234']";

  test('uten api/konto/konfig.php er kontoene av, selv om CMS-et har innstillinger', () => {
    assert.deepEqual(oppsett({ cms: CMS }), [null, null]);
  });

  test('egne innstillinger brukes', () => {
    assert.deepEqual(oppsett({ konto: "['dsn' => 'sqlite:/konto.sqlite']", cms: CMS }), [
      { dsn: 'sqlite:/konto.sqlite' },
      'konto',
    ]);
  });

  test('CMS-ets database brukes bare når det er slått på uttrykkelig, og aldri på et testbygg', () => {
    const legacy = "['bruk_cms_database' => true]";
    assert.deepEqual(oppsett({ konto: "['bruk_cms_database' => 'ja']", cms: CMS }), [null, null]);
    // only the connection is taken over, not the CMS's other settings
    assert.deepEqual(oppsett({ konto: legacy, cms: CMS }), [
      { dsn: 'sqlite:/cms.sqlite', bruker: null, passord: null },
      'cms',
    ]);
    assert.deepEqual(oppsett({ konto: legacy, cms: CMS, test: true }), [null, null]);
    assert.deepEqual(oppsett({ konto: legacy }), [null, null]);
  });
});
