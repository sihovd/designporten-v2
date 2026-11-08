import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PubliseringsFeil,
  SERVERFILER,
  fingeravtrykkAv,
  lesInnstillinger,
  opplastingsrekkefolge,
  sjekkBygg,
  sjekkInnstillinger,
} from './publiser-produksjon.mjs';

test('reads the settings file, Windows line endings and quotes included', () => {
  const inn = lesInnstillinger(
    '# kommentar\r\nONECOM_SFTP_HOST=ssh.example.no\r\n\r\nONECOM_SFTP_PASSORD="a=b c"\r\nONECOM_SFTP_BRUKER=x\r\n',
  );
  assert.deepEqual(inn, {
    ONECOM_SFTP_HOST: 'ssh.example.no',
    ONECOM_SFTP_PASSORD: 'a=b c',
    ONECOM_SFTP_BRUKER: 'x',
  });
});

test('settings: required fields, defaults and refused paths', () => {
  const grunn = { ONECOM_SFTP_HOST: 'h', ONECOM_SFTP_BRUKER: 'b', ONECOM_SFTP_PASSORD: 'p' };
  assert.deepEqual(sjekkInnstillinger(grunn), {
    host: 'h',
    bruker: 'b',
    passord: 'p',
    port: 22,
    mappe: '.',
    fingeravtrykk: '',
  });
  assert.equal(sjekkInnstillinger({ ...grunn, ONECOM_ROTMAPPE: 'www/' }).mappe, 'www');
  assert.throws(() => sjekkInnstillinger({ ...grunn, ONECOM_SFTP_PASSORD: '' }), PubliseringsFeil);
  assert.throws(() => sjekkInnstillinger({ ...grunn, ONECOM_ROTMAPPE: '../annet' }), PubliseringsFeil);
  assert.throws(() => sjekkInnstillinger({ ...grunn, ONECOM_ROTMAPPE: '/var/www' }), PubliseringsFeil);
  assert.throws(() => sjekkInnstillinger({ ...grunn, ONECOM_SFTP_FINGERAVTRYKK: 'abc' }), PubliseringsFeil);
  assert.throws(() => sjekkInnstillinger({ ...grunn, ONECOM_SFTP_PORT: '0' }), PubliseringsFeil);
});

test('only a clean production build may be published', () => {
  const ok = { prosjekt: 'designporten-v2', test: false, base: '/', endret: false, commit: 'abc' };
  assert.equal(sjekkBygg(ok), ok);
  assert.throws(() => sjekkBygg({ ...ok, test: true }), PubliseringsFeil);
  assert.throws(() => sjekkBygg({ ...ok, base: '/designporten-test/' }), PubliseringsFeil);
  assert.throws(() => sjekkBygg({ ...ok, endret: true }), PubliseringsFeil);
  assert.throws(() => sjekkBygg({ ...ok, prosjekt: 'annet' }), PubliseringsFeil);
});

test('assets go up first, pages and .htaccess last', () => {
  assert.deepEqual(
    opplastingsrekkefolge([
      'index.html',
      '.htaccess',
      'api/bygg.php',
      '_astro/a.js',
      'api/.htaccess',
      'om/index.html',
    ]),
    ['_astro/a.js', 'api/bygg.php', 'index.html', 'om/index.html', '.htaccess', 'api/.htaccess'],
  );
});

test('fingerprint in the OpenSSH SHA256 form', () => {
  assert.match(fingeravtrykkAv(Buffer.from('nokkel')), /^SHA256:[A-Za-z0-9+/]{43}$/);
});

test('settings files on the server are never sent, the data folder guard is', () => {
  for (const f of [
    'api/konto/konfig.php',
    'api/cms/konfig.php',
    'api/oppsett.php',
    'api/cms/data/ordre.json',
  ])
    assert.ok(SERVERFILER.test(f), f);
  for (const f of ['api/cms/data/.htaccess', 'api/bygg.php', 'index.html'])
    assert.ok(!SERVERFILER.test(f), f);
});
