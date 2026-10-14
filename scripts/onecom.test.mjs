import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byggoppsett, testmappe } from './onecom-oppsett.mjs';
import { oppsett, sjekkMal } from './publiser-onecom.mjs';

test('test paths reject root, traversal, shell injection and production names', () => {
  for (const sti of [
    '',
    '/',
    '.',
    './',
    '..',
    'a/..',
    '/designporten-test',
    'live',
    'public_html',
    'a//designporten-test',
    'a\\designporten-test',
    "test'; rm -rf /",
    'a\ndesignporten-test',
  ]) {
    assert.throws(() => testmappe(sti));
  }
  assert.equal(testmappe('public-html/designporten-test'), 'public-html/designporten-test');
  assert.deepEqual(byggoppsett({}), { base: '/', test: false });
  assert.deepEqual(byggoppsett({ DP_TEST: 'true' }), { base: '/designporten-test/', test: true });
  for (const base of ['/', '//', '/a/../designporten-test/', '/live/']) {
    assert.throws(() => byggoppsett({ DP_TEST: 'true', DP_BASE: base }));
  }
});

test('missing deployment secrets fail clearly without values', () => {
  assert.throws(() => oppsett({}), /ONECOM_SFTP_HOST/);
});

const attrs = (type) => ({
  isDirectory: () => type === 'dir',
  isFile: () => type === 'file',
  isSymbolicLink: () => type === 'link',
});
function server(entries, marker = { eier: 'designporten-v2-test-v1', mappe: 'designporten-test' }) {
  return {
    lstat: (sti, cb) => (entries[sti] ? cb(null, attrs(entries[sti].type)) : cb({ code: 2 })),
    readdir: (sti, cb) =>
      cb(
        null,
        Object.entries(entries)
          .filter(([p]) => p.startsWith(sti + '/') && !p.slice(sti.length + 1).includes('/'))
          .map(([p, v]) => ({ filename: p.slice(sti.length + 1), attrs: attrs(v.type) })),
      ),
    readFile: (_, cb) => cb(null, Buffer.from(JSON.stringify(marker))),
  };
}
test('remote guard accepts only a new/empty or correctly marked test folder', async () => {
  assert.equal(await sjekkMal(server({}), 'designporten-test'), false);
  assert.equal(await sjekkMal(server({ 'designporten-test': { type: 'dir' } }), 'designporten-test'), true);
  const owned = {
    'designporten-test': { type: 'dir' },
    'designporten-test/.designporten-test.json': { type: 'file' },
  };
  assert.equal(await sjekkMal(server(owned), 'designporten-test'), true);
  await assert.rejects(sjekkMal(server(owned, { eier: 'other' }), 'designporten-test'), /marker/);
  for (const file of ['index.html', 'wp-config.php', 'wp-admin', 'wp-content']) {
    await assert.rejects(
      sjekkMal(
        server({ 'designporten-test': { type: 'dir' }, [`designporten-test/${file}`]: { type: 'file' } }),
        'designporten-test',
      ),
    );
  }
  await assert.rejects(
    sjekkMal(server({ ...owned, 'designporten-test/_astro': { type: 'link' } }), 'designporten-test'),
    /symlink/,
  );
  await assert.rejects(
    sjekkMal(server({ parent: { type: 'link' } }), 'parent/designporten-test'),
    /ancestor/,
  );
  await assert.rejects(sjekkMal({ lstat: (_, cb) => cb({ code: 3 }) }, 'designporten-test'));
});
