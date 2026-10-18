/**
 * Shared by the account tests (scripts/konto.test.mjs, scripts/konto-sikkerhet.test.mjs):
 * a PHP server over a copy of php/, a small client with its own cookie jar,
 * the captured e-mail, and MySQL/MariaDB databases when DP_CMS_MYSQL is set.
 * Not a test file itself.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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

export const php = process.env.PHP_BIN || 'php';
const moduler = spawnSync(php, ['-m'], { encoding: 'utf8' });
export const harPhp = moduler.status === 0 && /pdo_sqlite/i.test(moduler.stdout);
export const harGd = harPhp && /^gd$/im.test(moduler.stdout);
/** The test build's own sign-in cookie, so a test never touches a real sign-in. */
export const KAKE = 'dp_konto_test';

let gjeldende = '';
/** The server the clients talk to. */
export const url = () => gjeldende;
export const settUrl = (u) => {
  gjeldende = u;
};

export function png() {
  const r = spawnSync(php, [
    '-r',
    '$b = imagecreatetruecolor(40, 20); imagefilledrectangle($b, 0, 0, 20, 20, imagecolorallocate($b, 136, 61, 255)); ob_start(); imagepng($b); fwrite(STDOUT, base64_encode(ob_get_clean()));',
  ]);
  return `data:image/png;base64,${String(r.stdout)}`;
}

export const mal = (navn) => ({
  versjon: 1,
  id: 'x',
  navn,
  dokument: { generator: 'signgen', navn, lag: [], objekter: {} },
});

/** A tiny client with its own cookie jar, like one browser. */
export function klient() {
  const kaker = new Map();
  let csrf = '';
  async function kall(api, r, { kropp, hoder = {}, sok = '' } = {}) {
    const svar = await fetch(`${gjeldende}/api/${api}/?r=${r}${sok}`, {
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
    return { status: svar.status, data, type, hoder: svar.headers };
  }
  return { konto: (r, v) => kall('konto', r, v), cms: (r, v) => kall('cms', r, v), kaker };
}

export const mysql = process.env.DP_CMS_MYSQL;
const mysqlDatabaser = [];
export function mysqlKjor(sql) {
  const r = spawnSync(
    php,
    [
      '-r',
      '$d = new PDO($argv[1], $argv[2], $argv[3]); $d->exec($argv[4]);',
      `mysql:${mysql}`,
      process.env.DP_CMS_BRUKER ?? '',
      process.env.DP_CMS_PASSORD ?? '',
      sql,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}
/** Drops the MySQL databases the tests made. */
export function ryddMysql() {
  if (mysql) for (const navn of mysqlDatabaser.splice(0)) mysqlKjor(`DROP DATABASE IF EXISTS ${navn}`);
}
/** The database the server in `rot` uses, as a PDO DSN. */
export const dsnFor = (rot) => rot.dsn ?? `sqlite:${join(rot.sti, 'cms.sqlite')}`;

/**
 * Runs SQL on the server's database with PHP's PDO and returns the rows.
 * Only for checking and preparing state the API cannot reach.
 */
export function sql(rot, setning, verdier = []) {
  const r = spawnSync(
    php,
    [
      '-r',
      `$db = new PDO($argv[1], $argv[2] ?: null, $argv[3] ?: null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
       $s = $db->prepare($argv[4]); $s->execute(json_decode($argv[5], true));
       echo json_encode($s->columnCount() ? $s->fetchAll(PDO::FETCH_ASSOC) : []);`,
      dsnFor(rot),
      mysql ? (process.env.DP_CMS_BRUKER ?? '') : '',
      mysql ? (process.env.DP_CMS_PASSORD ?? '') : '',
      setning,
      JSON.stringify(verdier),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

/**
 * A PHP server over a copy of php/ (or of `kilde`, another version of it).
 * The accounts have their own settings (the same database as the CMS here);
 * `utenCms` removes the CMS, `utenKonto` leaves the account settings out,
 * `utenEpost` leaves e-mail out. E-mail is captured in `rot.post`, outside
 * the site. `arbeidere` lets PHP answer several requests at once. `rot` reuses
 * an earlier server's folder and database (an upgrade). `undermappe` puts the
 * app under that base inside a larger site folder (`rot.topp`); `post(topp)`
 * chooses the capture folder.
 */
export async function startServer({
  port,
  utenCms = false,
  utenKonto = false,
  utenEpost = false,
  epostdriver = 'fil',
  postIRot = false,
  kilde = resolve('php'),
  arbeidere = 1,
  rot: forrige = null,
  undermappe = '',
  post: egenPost = null,
}) {
  // undermappe: the app lives under a base inside a larger site (sti = the site, app = sti/undermappe)
  const topp = forrige?.topp ?? mkdtempSync(join(tmpdir(), 'dp-konto-'));
  const sti = forrige?.sti ?? (undermappe ? join(topp, undermappe) : topp);
  mkdirSync(sti, { recursive: true });
  let dsn = forrige?.dsn ?? null;
  if (mysql && !forrige) {
    const navn = `kontotest_${process.pid}_${port}`;
    mysqlKjor(`CREATE DATABASE ${navn} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    mysqlDatabaser.push(navn);
    dsn = `mysql:${mysql};dbname=${navn};charset=utf8mb4`;
  }
  // postIRot: a capture folder inside the site, which the server must refuse
  const post =
    forrige?.post ??
    egenPost?.(topp) ??
    (postIRot ? join(sti, 'post') : mkdtempSync(join(tmpdir(), 'dp-konto-post-')));
  // an upgrade replaces the code and keeps the database (cms.sqlite lies beside api/)
  rmSync(join(sti, 'api'), { recursive: true, force: true });
  cpSync(kilde, sti, { recursive: true });
  writeFileSync(
    join(sti, 'api/bygg.php'),
    `<?php\nreturn ['base' => '/${undermappe ? `${undermappe}/` : ''}', 'test' => true];\n`,
  );
  if (utenCms) rmSync(join(sti, 'api/cms'), { recursive: true, force: true });
  else writeFileSync(join(sti, 'api/cms/nokler.json'), '{}');
  const server = spawn(php, ['-S', `127.0.0.1:${port}`, resolve('tests/php/cms-router.php')], {
    env: {
      ...process.env,
      DP_CMS_ROT: sti,
      ...(dsn ? { DP_CMS_DSN: dsn } : {}),
      ...(utenCms ? { DP_UTEN_CMS: '1' } : {}),
      ...(utenKonto ? { DP_UTEN_KONTO: '1' } : {}),
      ...(utenEpost ? {} : { DP_KONTO_POST: post, DP_KONTO_EPOSTDRIVER: epostdriver }),
      PHP_CLI_SERVER_WORKERS: String(arbeidere),
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/konto/?r=status`);
      return { rot: { sti, topp, dsn, post }, server };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('PHP-serveren startet ikke.');
}

/** Forgets the rate-limit counts, so a test starts fresh (all requests come from 127.0.0.1). */
export const nullstillGrenser = (rot) => sql(rot, 'DELETE FROM dp_konto_forsok');

/** A new member, signed in on `k` (registration is rate limited per IP, so the counts are reset first). */
export async function nyttMedlem(k, rot, epost, { bekreftet = true, passord = 'et-langt-passord' } = {}) {
  nullstillGrenser(rot);
  const svar = await k.konto('registrer', {
    kropp: { navn: epost.split('@')[0], epost, passord, vilkar: true },
  });
  assert.equal(svar.status, 201, JSON.stringify(svar.data));
  if (bekreftet) await bekreft(k, rot, epost);
  return svar.data.medlem;
}

/** Every captured e-mail, oldest first. */
export function eposter(rot) {
  if (!existsSync(rot.post)) return [];
  return readdirSync(rot.post)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(rot.post, f), 'utf8')));
}

/** The newest e-mail to `til`. */
export function sisteEpost(rot, til) {
  const e = eposter(rot).filter((x) => x.til === til);
  assert.ok(e.length, `ingen e-post til ${til}`);
  return e.at(-1);
}

/** The token in a link «…/konto/#handling=token». */
export function tokenFra(epost, handling) {
  const m = new RegExp(`/konto/#${handling}=([a-f0-9]{64})`).exec(epost.tekst);
  assert.ok(m, `ingen ${handling}-lenke i «${epost.emne}»`);
  return m[1];
}

/** Confirms the member's address with the link from the newest confirmation e-mail. */
export async function bekreft(k, rot, epost) {
  const svar = await k.konto('bekreft-epost', {
    kropp: { token: tokenFra(sisteEpost(rot, epost), 'bekreft') },
  });
  assert.equal(svar.status, 200, JSON.stringify(svar.data));
}

/** The command-line survey (scripts/kartlegg-konto.php) on a settings file pointing at `dsn`. */
export function kartlegg(mappe, dsn, ...ekstra) {
  const konfig = join(mappe, 'kartlegg-konfig.php');
  const [bruker, passord] = dsn.startsWith('mysql:')
    ? [process.env.DP_CMS_BRUKER ?? '', process.env.DP_CMS_PASSORD ?? '']
    : ['', ''];
  mkdirSync(mappe, { recursive: true });
  writeFileSync(konfig, `<?php return json_decode('${JSON.stringify({ dsn, bruker, passord })}', true);\n`);
  return spawnSync(php, [resolve('scripts/kartlegg-konto.php'), `--konfig=${konfig}`, ...ekstra], {
    encoding: 'utf8',
  });
}
