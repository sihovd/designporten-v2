import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mkdir, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';

// Card payment on the PHP build (php/api/kasse/, php/api/stripe/). The local
// router replaces Stripe with a fake and never reaches the real API; the
// priced product and shipping exist only behind the X-DP-Test-Katalog header.
test.skip(({ isMobile }) => isMobile, 'Kjøres én gang.');

const base = '/designporten-test';
const kasse = `${base}/api/kasse/`;
const webhook = `${base}/api/stripe/webhook/`;
const priset = { 'X-DP-Test-Katalog': 'pris', 'X-DP-Test-Stripe': 'test' };
const ordre = {
  navn: 'Lokal Test',
  epost: 'local@example.invalid',
  telefon: '',
  melding: 'Kun lokal test',
  linjer: [{ produktId: 'spiralvase', antall: 2, valg: { farge: 'pla-kritthvit', materiale: 'PLA' } }],
};

/** E-mails to Designporten (the customer's confirmations are named kunde-…). */
async function ordreposter() {
  return (await readdir('var/php-mail').catch(() => [] as string[])).filter((f) => !f.startsWith('kunde-'));
}

function signer(payload: string, hemmelighet = 'whsec_lokaltest', t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', hemmelighet).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

test.beforeAll(async () => {
  await rm('var/stripe-data', { recursive: true, force: true });
  await rm('var/stripe-fake', { recursive: true, force: true });
});

test('card payment stays off until the shop switch, the keys and shipping all exist', async ({ request }) => {
  // the switch as Studio sets it (the repository's own setting may be on)
  expect(await (await request.get(kasse, { headers: { 'X-DP-Test-Kortbetaling': 'av' } })).json()).toEqual({
    aktiv: false,
    grunn: 'Kortbetaling er ikke slått på ennå.',
  });
  // Studio's switch wins over a priced catalogue with the switch on
  const avIStudio = await request.get(kasse, { headers: { ...priset, 'X-DP-Test-Kortbetaling': 'av' } });
  expect((await avIStudio.json()).aktiv).toBe(false);
  const utenNokler = await request.get(kasse, { headers: { 'X-DP-Test-Katalog': 'pris' } });
  expect((await utenNokler.json()).grunn).toBe('Betalingsløsningen er ikke koblet til ennå.');
  // a live key is refused on a test build even with tillat_live
  const live = await request.get(kasse, {
    headers: { 'X-DP-Test-Katalog': 'pris', 'X-DP-Test-Stripe': 'live' },
  });
  expect((await live.json()).aktiv).toBe(false);
  expect(await (await request.get(kasse, { headers: priset })).json()).toEqual({ aktiv: true });
  const av = await request.post(kasse, {
    headers: { 'X-DP-Test-Stripe': 'test', 'X-DP-Test-Kortbetaling': 'av' },
    data: ordre,
  });
  expect(av.status()).toBe(503);
});

test('checkout prices come from the catalogue, never from the browser', async ({ request }) => {
  const svar = await request.post(kasse, {
    headers: priset,
    data: { ...ordre, linjer: [{ ...ordre.linjer[0], prisOre: 1, navn: 'Billig' }] },
  });
  expect(svar.status()).toBe(200);
  const data = await svar.json();
  expect(data.ok).toBe(true);
  expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.invalid\//);
  const filer = await readdir('var/stripe-fake');
  const sendt = JSON.parse(await readFile(`var/stripe-fake/${filer[0]}`, 'utf8'));
  expect(sendt.mode).toBe('payment');
  expect(sendt.currency).toBe('nok');
  expect(sendt.line_items[0].quantity).toBe('2');
  expect(sendt.line_items[0].price_data.unit_amount).toBe('12300');
  expect(sendt.line_items[0].price_data.product_data.name).not.toBe('Billig');
  expect(sendt.shipping_options[0].shipping_rate_data.fixed_amount.amount).toBe('4500');
  expect(sendt.success_url).toContain('/designporten-test/handlekurv/betalt/?okt={CHECKOUT_SESSION_ID}');
  expect(sendt.shipping_address_collection.allowed_countries).toEqual(['NO']);
});

test('unsellable carts, bad fields and a failing Stripe are refused', async ({ request }) => {
  const plassholder = await request.post(kasse, {
    headers: priset,
    data: {
      ...ordre,
      linjer: [{ produktId: 'bokstotter', antall: 1, valg: { farge: 'x', materiale: 'PLA' } }],
    },
  });
  expect(plassholder.status()).toBe(400);
  expect((await plassholder.json()).grunn).toMatch(/ikke klart for salg/);
  const design = await request.post(kasse, {
    headers: priset,
    data: { ...ordre, linjer: [{ produktId: 'skaperverksted-signgen', antall: 1, valg: {} }] },
  });
  expect((await design.json()).grunn).toMatch(/forespørsel/);
  const epost = await request.post(kasse, { headers: priset, data: { ...ordre, epost: 'nei' } });
  expect((await epost.json()).felt).toEqual({ epost: 'Skriv en gyldig e-postadresse.' });
  const nede = await request.post(kasse, {
    headers: { ...priset, 'X-DP-Test-Stripe-Svar': 'feil' },
    data: ordre,
  });
  expect(nede.status()).toBe(502);
});

test('the thank-you check asks Stripe, not the URL', async ({ request }) => {
  const okt = (id: string) =>
    request.get(`${base}/api/kasse/okt/?okt=${id}`, { headers: { 'X-DP-Test-Stripe': 'test' } });
  expect(await (await okt('cs_test_betalt1234567')).json()).toEqual({
    betalt: true,
    referanse: 'DP-TEST-REF',
    sumOre: 16800,
  });
  expect((await (await okt('cs_test_ubetalt1234567')).json()).betalt).toBe(false);
  expect((await okt('cs_test_ukjent12345678')).status()).toBe(404);
  expect((await okt('ikke-en-okt')).status()).toBe(400);
});

test('webhook: only a valid signature delivers a paid order, and only once', async ({ request }) => {
  const hendelse = (id: string, extra: object = {}) =>
    JSON.stringify({
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id,
          payment_status: 'paid',
          amount_total: 29100,
          client_reference_id: 'DP-20261109-TEST1',
          customer_details: { name: 'Lokal Test', email: 'local@example.invalid' },
          collected_information: {
            shipping_details: {
              name: 'Lokal Test',
              address: { line1: 'Testveien 1', postal_code: '0001', city: 'Oslo' },
            },
          },
          shipping_cost: { amount_total: 4500 },
          metadata: { navn: 'Lokal Test', melding: 'Kun lokal test' },
        },
      },
      ...extra,
    });
  const send = (payload: string, signatur: string, ekstra: Record<string, string> = {}) =>
    request.post(webhook, {
      headers: {
        'X-DP-Test-Stripe': 'test',
        'Stripe-Signature': signatur,
        'Content-Type': 'application/json',
        ...ekstra,
      },
      data: payload,
    });

  expect((await request.post(webhook, { data: '{}' })).status()).toBe(503);
  const p = hendelse('cs_test_webhook1234567');
  expect((await send(p, signer(p, 'whsec_feil'))).status()).toBe(400);
  expect((await send(p, signer(p, undefined, Math.floor(Date.now() / 1000) - 3600))).status()).toBe(400);
  const live = hendelse('cs_test_webhook1234567', { livemode: true });
  expect((await send(live, signer(live))).status()).toBe(400);

  // Without the CMS database, e-mail down keeps no claim, so Stripe's retry delivers later.
  const utenCms = { 'X-DP-Test-Cms': 'av' };
  expect((await send(p, signer(p), { ...utenCms, 'X-DP-Test-Delivery': 'fail' })).status()).toBe(500);
  const foer = (await ordreposter()).length;
  expect((await send(p, signer(p), utenCms)).status()).toBe(200);
  expect((await send(p, signer(p), utenCms)).status()).toBe(200);
  const etter = await ordreposter();
  expect(etter.length).toBe(foer + 1);
  const nyeste = (
    await Promise.all(etter.map(async (f) => JSON.parse(await readFile(`var/php-mail/${f}`, 'utf8'))))
  ).find((m) => m.tekst.includes('cs_test_webhook1234567'));
  expect(nyeste.tekst).toContain('Betalt ordre DP-20261109-TEST1 fra Lokal Test');
  expect(nyeste.tekst).toContain('Testveien 1');
  expect(nyeste.tekst).toContain('TESTMODUS');

  // With the CMS, the order is saved for Studio first: e-mail down still answers 200
  // (Studio shows it as not notified), and a retry neither saves nor e-mails it twice.
  const q = hendelse('cs_test_webhook7654321');
  expect((await send(q, signer(q), { 'X-DP-Test-Delivery': 'fail' })).status()).toBe(200);
  expect((await send(q, signer(q))).status()).toBe(200);
  expect((await ordreposter()).length).toBe(foer + 1);

  // an empty claim left by an attempt that died is taken over after two minutes
  const forlatt = hendelse('cs_test_forlatt1234567');
  await mkdir('var/stripe-data', { recursive: true });
  await writeFile('var/stripe-data/cs_test_forlatt1234567.json', '');
  expect((await send(forlatt, signer(forlatt))).status()).toBe(200);
  expect((await ordreposter()).length).toBe(foer + 1); // fresh claim: still in progress
  const gammel = new Date(Date.now() - 10 * 60 * 1000);
  await utimes('var/stripe-data/cs_test_forlatt1234567.json', gammel, gammel);
  expect((await send(forlatt, signer(forlatt))).status()).toBe(200);
  expect((await ordreposter()).length).toBe(foer + 2);
  expect(JSON.parse(await readFile('var/stripe-data/cs_test_forlatt1234567.json', 'utf8')).okt).toBe(
    'cs_test_forlatt1234567',
  );

  // the customer gets one confirmation from Designporten per delivered order
  const kunde = JSON.parse(await readFile('var/php-mail/kunde-DP-20261109-TEST1.json', 'utf8'));
  expect(kunde.tekst).toContain('Til: local@example.invalid');
  expect(kunde.tekst).toContain('Takk for bestillingen – ordre DP-20261109-TEST1');
  expect(kunde.tekst).toContain('Totalt betalt: 291');
  expect(kunde.tekst).toContain('TESTMODUS');

  // other events are acknowledged and ignored
  const annen = JSON.stringify({ type: 'payment_intent.created', data: { object: { id: 'pi_1' } } });
  expect((await send(annen, signer(annen))).status()).toBe(200);
});
