import { Client } from 'ssh2';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testmappe } from './onecom-oppsett.mjs';

class DeployFeil extends Error {}

const MERKE = '.designporten-test.json';
const EIER = 'designporten-v2-test-v1';
const wp = /^(wp-(config\.php|admin|content|includes|load\.php)|wordpress)$/i;

export function oppsett(env = process.env) {
  for (const navn of [
    'ONECOM_SFTP_HOST',
    'ONECOM_SFTP_BRUKER',
    'ONECOM_SFTP_PASSORD',
    'ONECOM_SFTP_FINGERAVTRYKK',
    'ONECOM_MAPPE',
  ]) {
    if (!env[navn]) throw new DeployFeil(`Missing required secret: ${navn}`);
  }
  const mappe = testmappe(env.ONECOM_MAPPE);
  const port = Number(env.ONECOM_SFTP_PORT || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DeployFeil('Invalid ONECOM_SFTP_PORT.');
  if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(env.ONECOM_SFTP_FINGERAVTRYKK)) {
    throw new DeployFeil('ONECOM_SFTP_FINGERAVTRYKK must be the verified SHA256 SSH host-key fingerprint.');
  }
  return { mappe, port };
}

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

/** Inspect every ancestor: a symlink must never turn a test path into production. */
export async function sjekkMal(sftp, mappe) {
  testmappe(mappe);
  let sti = '';
  const deler = mappe.split('/');
  for (const [i, del] of deler.entries()) {
    sti = sti ? `${sti}/${del}` : del;
    const info = await stat(sftp, sti);
    if (!info) {
      if (i !== deler.length - 1)
        throw new DeployFeil('Remote parent directory does not exist; confirm the SFTP path.');
      return false;
    }
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new DeployFeil('Remote target or ancestor is not a real directory.');
  }
  const poster = await kall(sftp, 'readdir', mappe);
  if (poster.some((p) => wp.test(p.filename)))
    throw new DeployFeil('Refusing to overwrite a WordPress installation.');
  if (!poster.length) return true;
  const merke = poster.find((p) => p.filename === MERKE);
  if (!merke || !merke.attrs.isFile() || merke.attrs.isSymbolicLink()) {
    throw new DeployFeil('Non-empty remote folder is not owned by this test deployment.');
  }
  const data = JSON.parse((await kall(sftp, 'readFile', `${mappe}/${MERKE}`)).toString());
  if (data.eier !== EIER || data.mappe !== mappe)
    throw new DeployFeil('Test deployment ownership marker does not match.');
  async function sjekk(sti) {
    for (const p of await kall(sftp, 'readdir', sti)) {
      if (p.attrs.isSymbolicLink() || wp.test(p.filename))
        throw new DeployFeil('Unsafe symlink or WordPress file in test target.');
      if (p.attrs.isDirectory()) await sjekk(`${sti}/${p.filename}`);
      else if (!p.attrs.isFile()) throw new DeployFeil('Unexpected remote file type.');
    }
  }
  await sjekk(mappe);
  return true;
}

async function filer(rot, relativ = '') {
  const funnet = [];
  for (const navn of await readdir(resolve(rot, relativ))) {
    const sti = relativ ? `${relativ}/${navn}` : navn;
    const info = await lstat(resolve(rot, sti));
    if (info.isSymbolicLink()) throw new DeployFeil('Local build contains a symlink.');
    if (info.isDirectory()) funnet.push(...(await filer(rot, sti)));
    else if (info.isFile()) funnet.push(sti);
    else throw new DeployFeil('Unexpected local file type.');
  }
  return funnet;
}

export async function publiser(env = process.env) {
  const { mappe, port } = oppsett(env);
  const bygg = JSON.parse(await readFile('dist/deployment.json', 'utf8'));
  if (bygg.prosjekt !== 'designporten-v2' || bygg.test !== true || bygg.base !== env.DP_BASE) {
    throw new DeployFeil('Only the matching test build can be deployed.');
  }
  if (bygg.base.split('/').filter(Boolean).at(-1) !== mappe.split('/').at(-1)) {
    throw new DeployFeil('URL base and remote test folder names must match.');
  }
  const liste = await filer('dist');
  for (const krav of [
    'index.html',
    '404.html',
    '.htaccess',
    'api/.htaccess',
    'api/.user.ini',
    'api/bygg.php',
    'api/foresporsel/index.php',
    'api/bestilling/index.php',
  ]) {
    if (!liste.includes(krav)) throw new DeployFeil(`Build is missing ${krav}.`);
  }
  if (liste.some((p) => /(^|\/)(server|node_modules|\.env|var)(\/|$)/.test(p)))
    throw new DeployFeil('Unexpected deployment content.');
  const ssh = new Client();
  try {
    await new Promise((ok, feil) => {
      ssh
        .once('ready', ok)
        .once('error', feil)
        .connect({
          host: env.ONECOM_SFTP_HOST,
          port,
          username: env.ONECOM_SFTP_BRUKER,
          password: env.ONECOM_SFTP_PASSORD,
          readyTimeout: 20_000,
          hostVerifier: (key) =>
            `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` ===
            env.ONECOM_SFTP_FINGERAVTRYKK,
        });
    });
    const sftp = await new Promise((ok, feil) => ssh.sftp((e, v) => (e ? feil(e) : ok(v))));
    const finnes = await sjekkMal(sftp, mappe);
    if (!finnes) await kall(sftp, 'mkdir', mappe);
    await kall(sftp, 'writeFile', `${mappe}/${MERKE}`, JSON.stringify({ eier: EIER, mappe }));
    const mapper = new Set([mappe]);
    // Immutable chunks first, entry HTML last. No recursive mirror/delete anywhere.
    liste.sort((a, b) => Number(a.endsWith('.html')) - Number(b.endsWith('.html')) || a.localeCompare(b));
    for (const fil of liste) {
      let sti = mappe;
      for (const del of fil.split('/').slice(0, -1)) {
        sti += `/${del}`;
        if (!mapper.has(sti)) {
          const info = await stat(sftp, sti);
          if (!info) await kall(sftp, 'mkdir', sti);
          else if (!info.isDirectory() || info.isSymbolicLink())
            throw new DeployFeil('Unsafe destination directory.');
          mapper.add(sti);
        }
      }
      const dest = `${mappe}/${fil}`;
      const info = await stat(sftp, dest);
      if (info && (!info.isFile() || info.isSymbolicLink())) throw new DeployFeil('Unsafe destination file.');
      await kall(sftp, 'fastPut', resolve('dist', fil), dest);
    }
    console.warn(`Uploaded ${liste.length} build files to the owned test folder. No remote files deleted.`);
  } finally {
    ssh.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--check')) {
      oppsett();
      console.warn('Required deployment settings are present.');
    } else await publiser();
  } catch (e) {
    // Never log library/server errors: they may contain credentials or remote paths.
    if (process.argv.includes('--check') || e instanceof DeployFeil) console.error(e.message);
    else
      console.error(
        'Test deployment refused or failed. Check secrets, host key, build base and target ownership; no root deployment is allowed.',
      );
    process.exitCode = 1;
  }
}
