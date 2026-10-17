/** The secret scan that guards the packages (scripts/hemmeligheter.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORBUDTE_FILNAVN, finnHemmeligheter } from './hemmeligheter.mjs';

// the strings are put together here so this file does not trip the scan itself
const skann = (tekst) => finnHemmeligheter('fil', Buffer.from(tekst)).map((f) => f.type);
const lik = (...deler) => deler.join('');

test('kjente nøkkelformater blir funnet', () => {
  assert.deepEqual(skann(lik('-----BEGIN RSA ', 'PRIVATE KEY-----')), ['privat nøkkel']);
  assert.deepEqual(skann(lik('const k = "sk_', 'live_', 'a1B2c3D4e5F6g7H8i9J0k1L2";')), ['Stripe-nøkkel']);
  assert.deepEqual(skann(lik('gh', 'p_', 'A'.repeat(36))), ['GitHub-token']);
  assert.deepEqual(skann(lik('mysql://bruker:', 'Hemmelig99', '@db.example.no/x')), ['nøkkel i URL']);
});

test('et passord skrevet rett i innstillinger blir funnet', () => {
  assert.deepEqual(skann(lik("'pass", "ord' => '", 'Sv4rt-og-hvitt-99', "',")), ['verdi for «passord»']);
  assert.deepEqual(skann(lik("'oppsett", "kode' => '", 'q8Zt2LmP0wXv', "'")), ['verdi for «oppsettkode»']);
  assert.deepEqual(skann(lik('SMTP_PASS', 'WORD=', '"', 'r3elt-passord!', '"')), [
    'verdi for «SMTP_PASSWORD»',
  ]);
  assert.deepEqual(skann(lik('export DP_CMS_PASS', 'ORD=', 'r3elt-passord!')), [
    'verdi for «DP_CMS_PASSORD»',
  ]);
});

test('tomme felt, test- og eksempelverdier og binærfiler er ikke funn', () => {
  assert.deepEqual(skann("'passord' => '',"), []);
  assert.deepEqual(skann("passord: 'et-langt-passord'"), []);
  assert.deepEqual(skann('DP_CMS_PASSORD=lokal-test-passord'), []);
  assert.deepEqual(skann("autocomplete: 'current-password'"), []);
  assert.deepEqual(finnHemmeligheter('bilde.png', Buffer.from([0x89, 0, 1, 2])), []);
});

test('filnavn som aldri skal pakkes', () => {
  for (const f of [
    'api/konto/konfig.php',
    'x/.env',
    'node_modules/a.js',
    'nokler/id_ed25519',
    'a/server.pem',
  ]) {
    assert.ok(FORBUDTE_FILNAVN.test(f), f);
  }
  for (const f of ['.env.example', 'php/api/konto/konfig.eksempel.php', 'src/lib/konto/api.ts']) {
    assert.ok(!FORBUDTE_FILNAVN.test(f), f);
  }
});
