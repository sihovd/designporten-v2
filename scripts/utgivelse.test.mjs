/**
 * Stage D (docs/utgivelse.md): separate packages per part. Builds Sign Forge
 * on its own twice (two versions), installs the packages into a pretend web
 * folder the way an upload does (unzip over what is there, delete nothing),
 * and checks ownership, that the parts never touch each other's files, and
 * that rolling Sign Forge back works.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { byggSignforge, APPSTI } from './bygg-signforge.mjs';
import { delOpp, eierAv, lesMappe } from './pakk-deler.mjs';

const tekst = (b) => new TextDecoder().decode(b);
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Upload a package: unzip over the folder, replacing files with the same name, deleting nothing. */
function installer(mappe, zip) {
  for (const [fil, innhold] of Object.entries(unzipSync(zip))) {
    mkdirSync(dirname(join(mappe, fil)), { recursive: true });
    writeFileSync(join(mappe, fil), innhold);
  }
}

const hashAv = (filer) => Object.fromEntries(Object.entries(filer).map(([f, b]) => [f, sha(b)]));

test('every file has one owner, decided by its path', () => {
  assert.equal(eierAv('skaperverksted/signgen/index.html'), 'signforge');
  assert.equal(eierAv('skaperverksted/signgen/_app/abc/main.js'), 'signforge');
  assert.equal(eierAv('skaperverksted/lampe/index.html'), 'nettside');
  assert.equal(eierAv('skaperverksted/fonter/archivo-800.woff'), 'nettside');
  assert.equal(eierAv('api/konto/index.php'), 'konto');
  assert.equal(eierAv('api/cms/index.php'), 'nettside');
  assert.equal(eierAv('api/.htaccess'), 'nettside');
  assert.equal(eierAv('_astro/main.js'), 'nettside');
});

test('the split gives three manifests with versions, dependencies and file hashes, and refuses settings', () => {
  const b = (s) => new TextEncoder().encode(s);
  const filer = {
    'index.html': b('<html></html>'),
    '_astro/a.js': b('x'),
    'api/konto/_grensesnitt.php': b('<?php const KONTO_GRENSESNITT_VERSJON = 2;'),
    'api/konto/_konto.php': b('<?php\n        1 => [\n        2 => [\n        4 => [\n'),
    'skaperverksted/signgen/index.html': b('<html></html>'),
  };
  const bygg = {
    commit: 'f'.repeat(40),
    endret: false,
    test: true,
    base: '/designporten-test/',
    kort: 'fffffff',
    signforge: 'fffffff',
  };
  const d = delOpp(filer, bygg);
  assert.deepEqual(Object.keys(d.signforge.filer), ['skaperverksted/signgen/index.html']);
  assert.deepEqual(Object.keys(d.konto.filer).sort(), ['api/konto/_grensesnitt.php', 'api/konto/_konto.php']);
  assert.deepEqual(Object.keys(d.nettside.filer).sort(), ['_astro/a.js', 'index.html']);
  assert.equal(d.konto.manifest.skjema, 4);
  assert.equal(d.konto.manifest.grensesnitt, 2);
  assert.equal(d.signforge.manifest.krever.konto.skjema, 4);
  assert.equal(d.nettside.manifest.kildecommit, 'f'.repeat(40));
  assert.equal(d.nettside.manifest.filer['index.html'], sha(filer['index.html']));
  assert.throws(() => delOpp({ ...filer, 'api/konto/konfig.php': b('<?php') }, bygg), /konfig\.php/);
});

test('Sign Forge builds on its own, into its own versioned folder, without the website or the other tools', async () => {
  const ut = mkdtempSync(join(tmpdir(), 'dp-signforge-'));
  try {
    const r = await byggSignforge({ test: true, ut, versjon: 'v1' });
    const filer = lesMappe(ut);
    assert.ok(
      Object.keys(filer).every((f) => f.startsWith(APPSTI)),
      'only files under skaperverksted/signgen/',
    );
    const side = tekst(filer[`${APPSTI}index.html`]);
    const app = `${r.base}${APPSTI}_app/v1/`;
    const lenker = [...side.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    const egne = lenker.filter((l) => l.startsWith(`${r.base}${APPSTI}_app/`));
    assert.ok(egne.length >= 3, 'the page loads its own CSS, JS and font');
    assert.ok(
      egne.every((l) => l.startsWith(app)),
      'only from its own version',
    );
    assert.ok(
      !Object.values(filer).some((b) => tekst(b).includes('/_astro/')),
      'nothing from the website build',
    );
    assert.match(side, /noindex/);
    assert.ok(filer[`${APPSTI}_app/v1/fonter/archivo-800.woff`], 'own copy of the fonts');
    assert.ok(filer[`${APPSTI}_app/v1/dekor/NOTICE.txt`], 'own copy of the decor licence');
    assert.ok(!Object.keys(filer).some((f) => /\/(lampe|drage|buildforge)-/.test(f)), 'no other tool');
    assert.ok(filer[`${APPSTI}_app/.htaccess`]);
  } finally {
    rmSync(ut, { recursive: true, force: true });
  }
});

test('a new Sign Forge leaves the website and the account part untouched, and the old version can be put back', async () => {
  const rot = mkdtempSync(join(tmpdir(), 'dp-utgivelse-'));
  try {
    const pakke = async (versjon) => {
      const ut = join(rot, `bygg-${versjon}`);
      await byggSignforge({ test: true, ut, versjon });
      return zipSync(lesMappe(ut));
    };
    const v1 = await pakke('v1');
    const v2 = await pakke('v2');
    const web = join(rot, 'web');
    const b = (s) => new TextEncoder().encode(s);
    // the website and the account part as installed, including the website's own copy of the fonts
    installer(
      web,
      zipSync({
        'index.html': b('<html>forside</html>'),
        '_astro/side.js': b('nettside'),
        'skaperverksted/fonter/archivo-800.woff': b('nettsidens font'),
        'api/konto/index.php': b('<?php // konto'),
      }),
    );
    const forSignforge = hashAv(lesMappe(web));

    installer(web, v1);
    installer(web, v2);
    const etter = lesMappe(web);
    for (const [f, h] of Object.entries(forSignforge)) assert.equal(sha(etter[f]), h, `${f} is unchanged`);
    assert.ok(existsSync(join(web, APPSTI, '_app/v1')) && existsSync(join(web, APPSTI, '_app/v2')));
    assert.match(readFileSync(join(web, APPSTI, 'index.html'), 'utf8'), /_app\/v2\//);

    // rollback: upload the previous package again; its files are all still there
    installer(web, v1);
    const side = readFileSync(join(web, APPSTI, 'index.html'), 'utf8');
    assert.match(side, /_app\/v1\//);
    assert.doesNotMatch(side, /_app\/v2\//);
    for (const l of [...side.matchAll(/(?:href|src)="\/designporten-test\/([^"]+)"/g)].map((m) => m[1]))
      if (l.startsWith(APPSTI)) assert.ok(existsSync(join(web, l)), `${l} exists after rollback`);

    // a new website package never carries Sign Forge's files
    const nyNettside = { 'index.html': b('<html>ny forside</html>') };
    assert.ok(Object.keys(nyNettside).every((f) => eierAv(f) === 'nettside'));
    installer(web, zipSync(nyNettside));
    assert.match(readFileSync(join(web, APPSTI, 'index.html'), 'utf8'), /_app\/v1\//);
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});
