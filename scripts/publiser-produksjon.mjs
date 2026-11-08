/**
 * «Publiser Designporten» (Sivert, 2026-11-08: «Ok sett det opp og vis en
 * veileder»). Run from Sivert's own PC, by the desktop shortcut, never by
 * GitHub: fetch main, test, build for the domain root and upload to
 * designporten.no over SFTP. See docs/publisering-lokalt.md.
 *
 * Safety:
 * - the one.com login lives only in `.env.publisering` on the PC (ignored by git);
 * - the server's SSH key must match the saved fingerprint (asked once, on first run);
 * - the target folder must already hold a designporten-v2 `deployment.json`,
 *   so the upload can never land in the wrong folder;
 * - nothing on the server is deleted, and settings files are never sent;
 * - nothing is uploaded before the user types JA.
 */
import { Client } from 'ssh2';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

/** Progress to the terminal window (stderr, as the project's lint rule wants). */
const vis = (...tekst) => console.warn(...tekst);

export class PubliseringsFeil extends Error {}

export const INNSTILLINGSFIL = '.env.publisering';

/** Files the server keeps for itself; a build never carries them, and this script never sends them. */
const SERVERFILER = /(^|\/)(konfig\.php|oppsett\.php)$|^api\/cms\/data\//;
const WP = /^(wp-(config\.php|admin|content|includes|load\.php)|wordpress)$/i;

/** KEY=value lines; # comments and blank lines skipped, quotes around a value removed. */
export function lesInnstillinger(tekst) {
  const ut = {};
  for (const r of tekst.split(/\r?\n/)) {
    const linje = r.trim();
    if (!linje || linje.startsWith('#')) continue;
    const i = linje.indexOf('=');
    if (i < 1) continue;
    let v = linje.slice(i + 1).trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    ut[linje.slice(0, i).trim()] = v;
  }
  return ut;
}

export function sjekkInnstillinger(inn) {
  for (const navn of ['ONECOM_SFTP_HOST', 'ONECOM_SFTP_BRUKER', 'ONECOM_SFTP_PASSORD']) {
    if (!inn[navn]) throw new PubliseringsFeil(`${navn} mangler i ${INNSTILLINGSFIL}.`);
  }
  const port = Number(inn.ONECOM_SFTP_PORT || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new PubliseringsFeil('ONECOM_SFTP_PORT må være et tall, vanligvis 22.');
  const mappe = (inn.ONECOM_ROTMAPPE || '.').replace(/\/+$/, '') || '.';
  if (mappe !== '.' && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/.test(mappe))
    throw new PubliseringsFeil('ONECOM_ROTMAPPE må være en enkel mappesti, for eksempel . eller www.');
  const fingeravtrykk = inn.ONECOM_SFTP_FINGERAVTRYKK || '';
  if (fingeravtrykk && !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingeravtrykk))
    throw new PubliseringsFeil(
      'ONECOM_SFTP_FINGERAVTRYKK ser feil ut. Tøm linjen, så spør skriptet på nytt.',
    );
  return {
    host: inn.ONECOM_SFTP_HOST,
    bruker: inn.ONECOM_SFTP_BRUKER,
    passord: inn.ONECOM_SFTP_PASSORD,
    port,
    mappe,
    fingeravtrykk,
  };
}

/** The build must be the production build of a clean commit. */
export function sjekkBygg(bygg) {
  if (bygg?.prosjekt !== 'designporten-v2') throw new PubliseringsFeil('dist/ er ikke et Designporten-bygg.');
  if (bygg.test !== false || bygg.base !== '/')
    throw new PubliseringsFeil('dist/ er et testbygg, ikke produksjon.');
  if (bygg.endret)
    throw new PubliseringsFeil('Bygget er laget av endret kode. Publiser bare det som ligger på main.');
  return bygg;
}

/** Upload order: assets first, then PHP and the rest, HTML pages and .htaccess last. */
export function opplastingsrekkefolge(filer) {
  const vekt = (f) =>
    /(^|\/)\.htaccess$/.test(f) ? 3 : f.endsWith('.html') ? 2 : f.endsWith('.php') ? 1 : 0;
  return [...filer].sort((a, b) => vekt(a) - vekt(b) || a.localeCompare(b));
}

export function fingeravtrykkAv(nokkel) {
  return `SHA256:${createHash('sha256').update(nokkel).digest('base64').replace(/=+$/, '')}`;
}

// ---------- local steps ----------

function kjor(tittel, kommando, args) {
  vis(`\n▶ ${tittel}`);
  const r = spawnSync(kommando, args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) throw new PubliseringsFeil(`«${tittel}» feilet. Ingenting er lastet opp.`);
}

function git(...args) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new PubliseringsFeil(`git ${args[0]} feilet: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

function hentMain() {
  vis('\n▶ Henter siste versjon fra GitHub');
  if (git('status', '--porcelain', '--untracked-files=no'))
    throw new PubliseringsFeil('Mappen har lokale endringer. Be Claude rydde, eller kjør «git stash».');
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') git('checkout', 'main');
  git('fetch', 'origin', 'main');
  git('merge', '--ff-only', 'origin/main');
  return git('log', '-1', '--format=%h %s');
}

/** npm ci only when package-lock.json changed since the last run. */
function avhengigheter() {
  const hash = createHash('sha256').update(readFileSync('package-lock.json')).digest('hex');
  const merke = 'var/publisering/pakker.sha256';
  if (existsSync('node_modules') && existsSync(merke) && readFileSync(merke, 'utf8') === hash) return;
  kjor('Installerer pakker (bare når de er endret)', 'npm', ['ci', '--no-audit', '--no-fund']);
  mkdirSync('var/publisering', { recursive: true });
  writeFileSync(merke, hash);
}

async function lokaleFiler(rot, relativ = '') {
  const funnet = [];
  for (const navn of await readdir(resolve(rot, relativ))) {
    const sti = relativ ? `${relativ}/${navn}` : navn;
    const info = await lstat(resolve(rot, sti));
    if (info.isSymbolicLink()) throw new PubliseringsFeil('Bygget inneholder en snarvei (symlink).');
    if (info.isDirectory()) funnet.push(...(await lokaleFiler(rot, sti)));
    else if (info.isFile()) funnet.push(sti);
  }
  return funnet;
}

// ---------- SFTP ----------

const kall = (sftp, metode, ...args) =>
  new Promise((ok, feil) => sftp[metode](...args, (e, v) => (e ? feil(e) : ok(v))));

async function stat(sftp, sti) {
  try {
    return await kall(sftp, 'lstat', sti);
  } catch (e) {
    if (e.code === 2) return null;
    throw e;
  }
}

function kobleTil(inn, godtaNokkel) {
  const ssh = new Client();
  let sett = '';
  return new Promise((ok, feil) => {
    ssh
      .once('ready', () => ok({ ssh, sett }))
      .once('error', (e) =>
        feil(
          sett && inn.fingeravtrykk && sett !== inn.fingeravtrykk
            ? new PubliseringsFeil(
                `Serverens nøkkel (${sett}) stemmer ikke med den lagrede. Stopper av sikkerhetsgrunner.`,
              )
            : /authentication/i.test(e.message || '')
              ? new PubliseringsFeil(
                  'Innloggingen ble avvist. Sjekk brukernavn og passord i .env.publisering.',
                )
              : new PubliseringsFeil('Fikk ikke kontakt med one.com. Sjekk vert, port og nettverk.'),
        ),
      )
      .connect({
        host: inn.host,
        port: inn.port,
        username: inn.bruker,
        password: inn.passord,
        readyTimeout: 30_000,
        hostVerifier: (nokkel) => {
          sett = fingeravtrykkAv(nokkel);
          return inn.fingeravtrykk ? sett === inn.fingeravtrykk : godtaNokkel;
        },
      });
  });
}

/** The live deployment.json, or null. Refuses a folder that holds WordPress. */
async function liveVersjon(sftp, mappe) {
  const poster = await kall(sftp, 'readdir', mappe);
  if (poster.some((p) => WP.test(p.filename)))
    throw new PubliseringsFeil('Målmappen inneholder WordPress. Stopper.');
  if (!poster.some((p) => p.filename === 'deployment.json')) return null;
  try {
    return JSON.parse((await kall(sftp, 'readFile', `${mappe}/deployment.json`)).toString());
  } catch {
    return null;
  }
}

async function lastOpp(sftp, mappe, filer) {
  const mapper = new Set([mappe]);
  let n = 0;
  for (const fil of filer) {
    let sti = mappe;
    for (const del of fil.split('/').slice(0, -1)) {
      sti += `/${del}`;
      if (!mapper.has(sti)) {
        const info = await stat(sftp, sti);
        if (!info) await kall(sftp, 'mkdir', sti);
        else if (!info.isDirectory() || info.isSymbolicLink())
          throw new PubliseringsFeil(`Uventet fil der en mappe skulle vært: ${sti}`);
        mapper.add(sti);
      }
    }
    const mal = `${mappe}/${fil}`;
    const info = await stat(sftp, mal);
    if (info && (!info.isFile() || info.isSymbolicLink()))
      throw new PubliseringsFeil(`Uventet filtype på serveren: ${fil}`);
    await kall(sftp, 'fastPut', resolve('dist', fil), mal);
    n++;
    if (n % 25 === 0 || n === filer.length) process.stdout.write(`\r  ${n} av ${filer.length} filer`);
  }
  process.stdout.write('\n');
}

// ---------- main ----------

async function hoved() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const spor = async (t) => (await rl.question(t)).trim();
  try {
    vis('=== Publiser Designporten ===');
    if (!existsSync(INNSTILLINGSFIL))
      throw new PubliseringsFeil(
        `Fant ikke ${INNSTILLINGSFIL}. Kjør «Oppsett» først (se docs/publisering-lokalt.md).`,
      );
    const ra = lesInnstillinger(readFileSync(INNSTILLINGSFIL, 'utf8'));
    const inn = sjekkInnstillinger(ra);
    const forsteGang = process.argv.includes('--forste-gang');

    const commit = hentMain();
    vis(`  Versjon: ${commit}`);
    avhengigheter();
    kjor('Tester', 'npm', ['test']);
    kjor('Bygger nettsiden', 'npm', ['run', 'build:onecom']);
    const bygg = sjekkBygg(JSON.parse(await readFile('dist/deployment.json', 'utf8')));
    const filer = opplastingsrekkefolge((await lokaleFiler('dist')).filter((f) => !SERVERFILER.test(f)));
    for (const krav of ['index.html', '.htaccess', 'deployment.json', 'skaperverksted/signgen/index.html'])
      if (!filer.includes(krav)) throw new PubliseringsFeil(`Bygget mangler ${krav}.`);

    vis('\n▶ Kobler til one.com');
    const { ssh } = await kobleTil(inn, false).catch(async (e) => {
      if (inn.fingeravtrykk) throw e;
      // first run: show the server's key and ask before trusting it
      const forsok = await kobleTil(inn, true);
      forsok.ssh.end();
      vis(`\n  Første tilkobling. Serverens fingeravtrykk er:\n  ${forsok.sett}`);
      if ((await spor('  Stoler du på denne serveren (one.com)? Skriv JA: ')) !== 'JA')
        throw new PubliseringsFeil('Avbrutt. Ingenting er lastet opp.');
      writeFileSync(
        INNSTILLINGSFIL,
        readFileSync(INNSTILLINGSFIL, 'utf8')
          .replace(/^ONECOM_SFTP_FINGERAVTRYKK=.*$/m, '')
          .trimEnd() + `\nONECOM_SFTP_FINGERAVTRYKK=${forsok.sett}\n`,
      );
      inn.fingeravtrykk = forsok.sett;
      return kobleTil(inn, false);
    });
    try {
      const sftp = await new Promise((ok, feil) => ssh.sftp((e, v) => (e ? feil(e) : ok(v))));
      const live = await liveVersjon(sftp, inn.mappe);
      if (live && live.prosjekt !== 'designporten-v2')
        throw new PubliseringsFeil('Målmappen har et annet nettsted. Stopper.');
      if (!live && !forsteGang)
        throw new PubliseringsFeil(
          `Fant ikke Designporten i «${inn.mappe}» på serveren. Sjekk ONECOM_ROTMAPPE i ${INNSTILLINGSFIL}.`,
        );
      vis(`\n  Live nå:    ${live ? String(live.commit).slice(0, 7) : '(ingenting)'}`);
      vis(`  Ny versjon: ${String(bygg.commit).slice(0, 7)}  (${filer.length} filer)`);
      if (live?.commit === bygg.commit)
        vis('  Denne versjonen er allerede live. Du kan likevel laste opp på nytt.');
      if ((await spor('\n  Laste opp til designporten.no? Skriv JA: ')) !== 'JA')
        throw new PubliseringsFeil('Avbrutt. Ingenting er lastet opp.');
      vis('\n▶ Laster opp');
      await lastOpp(sftp, inn.mappe, filer);
    } finally {
      ssh.end();
    }
    mkdirSync('var/publisering', { recursive: true });
    appendFileSync('var/publisering/logg.txt', `${new Date().toISOString()} ${bygg.commit}\n`);
    vis(`\n✔ Ferdig. designporten.no kjører nå ${String(bygg.commit).slice(0, 7)}.`);
    vis('  Ingen filer på serveren er slettet. Ta en hard oppdatering (Ctrl+F5) for å se endringene.');
  } finally {
    rl.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  hoved().catch((e) => {
    // never print library errors: they may contain the password or server paths
    console.error(
      `\n✖ ${e instanceof PubliseringsFeil ? e.message : 'Noe gikk galt. Ingenting mer ble lastet opp.'}`,
    );
    if (process.env.DP_FEILSOK && !(e instanceof PubliseringsFeil)) console.error(e);
    process.exitCode = 1;
  });
}
