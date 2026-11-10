/**
 * Skaper as a Stripe subscription (Sivert, 2026-11-10: «vi må koble
 * medlemsstyring til medlemshåndtering i stripe med alle funksjoner»):
 * Checkout in subscription mode, the customer portal, the webhook keeping the
 * member's package in step, the e-mails, and what happens on a failed
 * renewal, a cancellation and a deleted account. Against PHP's built-in
 * server, SQLite and a fake Stripe (tests/php/stripe-fake.php), never the
 * real API. See docs/konto.md.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  eposter,
  harPhp,
  klient,
  nyttMedlem,
  ryddMysql,
  settUrl,
  sql,
  startServer,
  url,
} from './konto-testhjelp.mjs';

const PORT = 6000 + Math.floor(Math.random() * 300);
const hopp = { skip: !harPhp && 'PHP med pdo_sqlite er ikke installert' };
const PASSORD = 'et-langt-admin-passord';
const DAG = 86400;
const na = () => Math.floor(Date.now() / 1000);

describe('Skaper som Stripe-abonnement', hopp, () => {
  const s = { rot: null, prosess: null };
  const admin = klient();
  const kunde = klient();
  let medlem;
  let okt;

  const fakeFil = () => join(s.rot.sti, 'stripe-fake.json');
  const stripe = () => (existsSync(fakeFil()) ? JSON.parse(readFileSync(fakeFil(), 'utf8')) : {});
  /** Plays something that happens at Stripe: `f` changes the fake's state. */
  const vedStripe = (f) => {
    const t = stripe();
    f(t);
    writeFileSync(fakeFil(), JSON.stringify(t));
  };
  const abonnement = () => Object.values(stripe().abonnementer ?? {})[0];
  /** The subscription as Stripe would have it, with the period on the item (newer API versions). */
  const settAbonnement = (endring) =>
    vedStripe((t) => {
      const id = Object.keys(t.abonnementer)[0];
      const sub = t.abonnementer[id];
      const { start, slutt, intervall, ...resten } = endring;
      Object.assign(sub, resten);
      const item = sub.items.data[0];
      if (start !== undefined) item.current_period_start = start;
      if (slutt !== undefined) item.current_period_end = slutt;
      if (intervall) item.price = { ...item.price, recurring: { interval: intervall } };
    });

  let nr = 0;
  /** Sends a signed event to the webhook, as Stripe does. */
  const hendelse = async (type, objekt, valg = {}) => {
    const kropp = JSON.stringify({
      id: valg.id ?? `evt_test_${Date.now()}_${nr++}`,
      type,
      livemode: valg.livemode ?? false,
      data: { object: objekt },
    });
    const t = na();
    const v1 = createHmac('sha256', valg.hemmelighet ?? 'whsec_lokaltest')
      .update(`${t}.${kropp}`)
      .digest('hex');
    const svar = await fetch(`${url()}/api/stripe/webhook/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${v1}` },
      body: kropp,
    });
    return { status: svar.status, tekst: await svar.text() };
  };
  const posttil = (adresse) => eposter(s.rot).filter((e) => e.til === adresse);
  const meg = async (k = kunde) => (await k.konto('meg')).data.medlem;

  before(async () => {
    settUrl(`http://127.0.0.1:${PORT}`);
    ({ rot: s.rot, server: s.prosess } = await startServer({ port: PORT, arbeidere: 2 }));
    await admin.cms('oppsett', {
      kropp: { kode: 'test-oppsettkode-1234', epost: 'eier@example.no', navn: 'Eier', passord: PASSORD },
    });
  });
  after(() => {
    s.prosess?.kill();
    if (s.rot) for (const d of [s.rot.sti, s.rot.post]) rmSync(d, { recursive: true, force: true });
    ryddMysql();
  });

  test('kan ikke kjøpes før Studio slår salget på', async () => {
    const status = (await klient().konto('status')).data;
    assert.deepEqual(status.kjop, { aktiv: false, grunn: 'Pakken kan ikke kjøpes ennå.' });
    medlem = await nyttMedlem(kunde, s.rot, 'skaper@example.no');
    const nei = await kunde.konto('abonnement-start', { kropp: { plan: 'skaper', periode: 'maned' } });
    assert.equal(nei.status, 409);
    assert.match(nei.data.feil, /kan ikke kjøpes ennå/);
    assert.equal(stripe().kall?.length ?? 0, 0);
  });

  test('Studio slår salget på; en kunde kan ikke gjøre det, og en pakke uten pris kan ikke selges', async () => {
    const plan = (k, kropp) => k.konto('admin-plan', { kropp: { id: 'skaper', prosjekter: 50, ...kropp } });
    assert.equal((await plan(kunde, { prisManed: 59, prisAr: 590, kanKjopes: true })).status, 401);
    assert.equal((await plan(admin, { prisManed: 0, prisAr: 590, kanKjopes: true })).status, 422);
    assert.equal((await plan(admin, { prisManed: 59, prisAr: 590, kanKjopes: 'ja' })).status, 422);
    const ja = await plan(admin, { prisManed: 59, prisAr: 590, kanKjopes: true });
    assert.equal(ja.status, 200, JSON.stringify(ja.data));
    assert.equal(ja.data.planer.skaper.kanKjopes, true);
    assert.deepEqual(ja.data.kjop, { aktiv: true, grunn: null });
    // saving the price again without the switch keeps it on
    assert.equal((await plan(admin, { prisManed: 59, prisAr: 590 })).data.planer.skaper.kanKjopes, true);
    assert.deepEqual((await klient().konto('status')).data.kjop, { aktiv: true, grunn: null });
    // without Stripe settings on the server, nothing can be bought
    const utenStripe = await klient().konto('status', { hoder: { 'X-DP-Test-Stripe': 'av' } });
    assert.deepEqual(utenStripe.data.kjop, { aktiv: false, grunn: 'Betaling er ikke slått på ennå.' });
  });

  test('bare en innlogget kunde med bekreftet e-post kan starte et kjøp', async () => {
    const start = (k) => k.konto('abonnement-start', { kropp: { plan: 'skaper', periode: 'maned' } });
    assert.equal((await start(klient())).status, 401);
    const ubekreftet = klient();
    await nyttMedlem(ubekreftet, s.rot, 'ubekreftet@example.no', { bekreftet: false });
    const nei = await start(ubekreftet);
    assert.equal(nei.status, 403);
    assert.match(nei.data.feil, /Bekreft e-postadressen/);
    const feilPeriode = await kunde.konto('abonnement-start', { kropp: { plan: 'skaper', periode: 'uke' } });
    assert.equal(feilPeriode.status, 422);
    const feilPlan = await kunde.konto('abonnement-start', { kropp: { plan: 'gratis', periode: 'maned' } });
    assert.equal(feilPlan.status, 422);
  });

  test('kjøp: Checkout i abonnementsmodus med prisen fra Studio, egen kunde og medlemmet i metadata', async () => {
    const svar = await kunde.konto('abonnement-start', { kropp: { plan: 'skaper', periode: 'maned' } });
    assert.equal(svar.status, 200, JSON.stringify(svar.data));
    assert.match(svar.data.url, /^https:\/\/checkout\.stripe\.invalid\//);
    const t = stripe();
    okt = Object.values(t.okter)[0];
    assert.equal(okt.mode, 'subscription');
    assert.equal(okt.locale, 'nb');
    assert.equal(okt.metadata.medlem_id, String(medlem.id));
    assert.equal(okt.subscription_data.metadata.plan, 'skaper');
    assert.equal(okt.subscription_data.metadata.periode, 'maned');
    assert.match(okt.success_url, /\/konto\/\?abonnement=ferdig&okt=\{CHECKOUT_SESSION_ID\}$/);
    assert.match(okt.cancel_url, /\/konto\/\?abonnement=avbrutt$/);
    // no card data and no free-form amount: a Stripe price at 59 kr/month incl. VAT
    const pris = t.priser[okt.line_items[0].price];
    assert.equal(pris.unit_amount, 5900);
    assert.equal(pris.currency, 'nok');
    assert.equal(pris.recurring.interval, 'month');
    assert.equal(pris.tax_behavior, 'inclusive');
    assert.equal(pris.lookup_key, 'dp_skaper_maned_5900');
    assert.equal(pris.product, 'dp_plan_skaper');
    const kundeId = okt.customer;
    assert.equal(t.kunder[kundeId].email, 'skaper@example.no');
    assert.equal(t.kunder[kundeId].metadata.medlem_id, String(medlem.id));
    // a second try reuses the customer and the price
    await kunde.konto('abonnement-start', { kropp: { plan: 'skaper', periode: 'maned' } });
    assert.equal(Object.keys(stripe().kunder).length, 1);
    assert.equal(Object.keys(stripe().priser).length, 1);
    // nothing changes before Stripe says it is paid
    const m = await meg();
    assert.equal(m.pakke.id, 'gratis');
    assert.equal(m.abonnement.kanAdministreres, true);
  });

  test('tilbake fra Checkout: abonnementet leses fra Stripe, pakken gjelder med en gang, velkomst sendes én gang', async () => {
    const start = na();
    vedStripe((t) => {
      const sub = {
        id: 'sub_test_skaper1',
        customer: okt.customer,
        status: 'active',
        created: start,
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: okt.subscription_data.metadata,
        items: {
          data: [
            {
              price: { id: okt.line_items[0].price, recurring: { interval: 'month' } },
              current_period_start: start,
              current_period_end: start + 30 * DAG,
            },
          ],
        },
      };
      t.abonnementer[sub.id] = sub;
      t.okter[okt.id] = { ...t.okter[okt.id], status: 'complete', subscription: sub.id };
    });
    // another member cannot use this purchase
    const annen = klient();
    await nyttMedlem(annen, s.rot, 'annen@example.no');
    assert.equal((await annen.konto('abonnement-sjekk', { kropp: { okt: okt.id } })).status, 404);
    assert.equal((await meg(annen)).pakke.id, 'gratis');

    const svar = await kunde.konto('abonnement-sjekk', { kropp: { okt: okt.id } });
    assert.equal(svar.status, 200, JSON.stringify(svar.data));
    const m = svar.data.medlem;
    assert.equal(m.pakke.id, 'skaper');
    assert.equal(m.pakke.prosjekter, 50);
    assert.equal(m.betaling.status, 'aktiv');
    assert.equal(m.abonnement.status, 'active');
    assert.equal(m.abonnement.periode, 'maned');
    assert.equal(m.abonnement.slutter, null);
    assert.equal((await kunde.konto('prosjekter')).data.kvote.maks, 50);
    let post = posttil('skaper@example.no').filter((e) => /Velkommen som Skaper/.test(e.emne));
    assert.equal(post.length, 1);
    assert.match(post[0].tekst, /månedlig betaling/);
    assert.match(post[0].tekst, /50 prosjekter/);

    // then the webhook brings the same news: no second welcome
    const sub = abonnement();
    assert.equal((await hendelse('customer.subscription.created', sub)).status, 200);
    assert.equal(
      (await hendelse('checkout.session.completed', { ...stripe().okter[okt.id], payment_status: 'paid' }))
        .status,
      200,
    );
    post = posttil('skaper@example.no').filter((e) => /Velkommen/.test(e.emne));
    assert.equal(post.length, 1);
    // a subscription's Checkout is never a shop order
    assert.equal(existsSync(join(s.rot.sti, 'stripe-data', `${okt.id}.json`)), false);
  });

  test('samme hendelse to ganger teller én gang; feil signatur og feil modus avvises', async () => {
    const sub = abonnement();
    assert.equal(
      (await hendelse('customer.subscription.updated', sub, { id: 'evt_test_dobbel' })).tekst,
      'ok',
    );
    assert.equal(
      (await hendelse('customer.subscription.updated', sub, { id: 'evt_test_dobbel' })).tekst,
      'ok (allerede behandlet)',
    );
    assert.equal(
      (await hendelse('customer.subscription.updated', sub, { hemmelighet: 'whsec_feil' })).status,
      400,
    );
    assert.equal((await hendelse('customer.subscription.updated', sub, { livemode: true })).status, 400);
  });

  test('et nytt kjøp mens abonnementet løper avvises; kundeportalen åpnes med bytte av periode og oppsigelse', async () => {
    const nei = await kunde.konto('abonnement-start', { kropp: { plan: 'skaper', periode: 'ar' } });
    assert.equal(nei.status, 409);
    assert.match(nei.data.feil, /Administrer abonnement/);
    assert.equal((await klient().konto('abonnement-portal', { kropp: {} })).status, 401);
    const utenKunde = klient();
    await nyttMedlem(utenKunde, s.rot, 'ingen@example.no');
    assert.equal((await utenKunde.konto('abonnement-portal', { kropp: {} })).status, 409);

    const svar = await kunde.konto('abonnement-portal', { kropp: {} });
    assert.equal(svar.status, 200, JSON.stringify(svar.data));
    assert.match(svar.data.url, /^https:\/\/billing\.stripe\.invalid\//);
    const t = stripe();
    const oppsett = Object.values(t.portaler)[0];
    assert.equal(oppsett.features.subscription_cancel.mode, 'at_period_end');
    assert.equal(oppsett.features.payment_method_update.enabled, 'true');
    assert.equal(oppsett.features.invoice_history.enabled, 'true');
    const priser = oppsett.features.subscription_update.products[0].prices.map((id) => t.priser[id]);
    assert.deepEqual(
      priser.map((p) => [p.recurring.interval, p.unit_amount]),
      [
        ['month', 5900],
        ['year', 59000],
      ],
    );
    assert.match(oppsett.default_return_url, /\/konto\/\?abonnement=portal$/);
    // the same settings next time
    await kunde.konto('abonnement-portal', { kropp: {} });
    assert.equal(Object.keys(stripe().portaler).length, 1);
  });

  test('fornyelsen feiler: kunden beholder pakken noen dager, får beskjed, og får den tilbake når kortet virker', async () => {
    const forny = na();
    settAbonnement({ status: 'past_due', start: forny, slutt: forny + 30 * DAG });
    const faktura = {
      id: 'in_test_forny1',
      object: 'invoice',
      billing_reason: 'subscription_cycle',
      amount_due: 5900,
      amount_paid: 0,
      currency: 'nok',
      parent: { subscription_details: { subscription: 'sub_test_skaper1' } },
      lines: { data: [{ period: { end: forny + 30 * DAG } }] },
    };
    assert.equal((await hendelse('invoice.payment_failed', faktura)).status, 200);
    let m = await meg();
    assert.equal(m.betaling.status, 'forfalt');
    assert.equal(m.pakke.id, 'skaper');
    const feilet = posttil('skaper@example.no').filter((e) => /gikk ikke gjennom/.test(e.emne));
    assert.equal(feilet.length, 1);
    assert.match(feilet[0].tekst, /Administrer abonnement/);
    // Stripe tries again: no new e-mail for the same failure
    await hendelse('invoice.payment_failed', faktura);
    assert.equal(posttil('skaper@example.no').filter((e) => /gikk ikke gjennom/.test(e.emne)).length, 1);
    assert.equal(
      sql(s.rot, "SELECT status FROM dp_betalinger WHERE ekstern_ref = 'in_test_forny1'")[0].status,
      'feilet',
    );

    settAbonnement({ status: 'active' });
    assert.equal(
      (
        await hendelse('invoice.paid', {
          ...faktura,
          amount_paid: 5900,
          hosted_invoice_url: 'https://invoice.stripe.invalid/i/1',
        })
      ).status,
      200,
    );
    m = await meg();
    assert.equal(m.betaling.status, 'aktiv');
    assert.equal(
      posttil('skaper@example.no').filter((e) => /Betalingen gikk gjennom/.test(e.emne)).length,
      1,
    );
    const rad = sql(s.rot, "SELECT * FROM dp_betalinger WHERE ekstern_ref = 'in_test_forny1'")[0];
    assert.equal(rad.status, 'betalt');
    assert.equal(rad.belop_ore, 5900);

    // a normal renewal gets a receipt from Designporten
    settAbonnement({ start: forny + 30 * DAG, slutt: forny + 60 * DAG });
    const neste = {
      ...faktura,
      id: 'in_test_forny2',
      amount_paid: 5900,
      lines: { data: [{ period: { end: forny + 60 * DAG } }] },
    };
    await hendelse('invoice.paid', neste);
    await hendelse('invoice.paid', neste);
    const kvittering = posttil('skaper@example.no').filter((e) => /Kvittering/.test(e.emne));
    assert.equal(kvittering.length, 1);
    assert.match(kvittering[0].tekst, /59\skr/);
  });

  test('etter fristen uten betaling faller kontoen til gratis, men prosjektene ligger der', async () => {
    const lenge = na() - 20 * DAG;
    settAbonnement({ status: 'past_due', start: lenge, slutt: lenge + 30 * DAG });
    await hendelse('customer.subscription.updated', abonnement());
    const m = await meg();
    assert.equal(m.betaling.status, 'forfalt');
    assert.equal(m.pakke.id, 'gratis');
    assert.equal((await kunde.konto('prosjekter')).status, 200);
    settAbonnement({ status: 'active', start: na(), slutt: na() + 30 * DAG });
    await hendelse('customer.subscription.updated', abonnement());
    assert.equal((await meg()).pakke.id, 'skaper');
  });

  test('oppsigelse i portalen: pakken gjelder ut perioden, kan trekkes tilbake, og bytte til årlig blir fortalt', async () => {
    const slutt = abonnement().items.data[0].current_period_end;
    settAbonnement({ cancel_at_period_end: true });
    // the return from the portal reads it back at once
    const tilbake = await kunde.konto('abonnement-sjekk', { kropp: {} });
    assert.equal(tilbake.status, 200);
    assert.equal(
      tilbake.data.medlem.abonnement.slutter,
      new Date(slutt * 1000).toISOString().replace('.000', ''),
    );
    assert.equal(tilbake.data.medlem.pakke.id, 'skaper');
    assert.equal(posttil('skaper@example.no').filter((e) => /Oppsigelsen av Skaper/.test(e.emne)).length, 1);
    // the webhook after it changes nothing more
    await hendelse('customer.subscription.updated', abonnement());
    assert.equal(posttil('skaper@example.no').filter((e) => /Oppsigelsen/.test(e.emne)).length, 1);

    settAbonnement({ cancel_at_period_end: false });
    await hendelse('customer.subscription.updated', abonnement());
    assert.equal((await meg()).abonnement.slutter, null);
    assert.equal(posttil('skaper@example.no').filter((e) => /Skaper fortsetter/.test(e.emne)).length, 1);

    settAbonnement({ intervall: 'year' });
    await hendelse('customer.subscription.updated', abonnement());
    assert.equal((await meg()).abonnement.periode, 'ar');
    assert.equal(posttil('skaper@example.no').filter((e) => /årlig/.test(e.emne)).length, 1);
  });

  test('Studio ser abonnementet og kan lese det på nytt fra Stripe', async () => {
    const register = (await admin.konto('admin-medlemmer')).data;
    const rad = register.medlemmer.find((x) => x.id === medlem.id);
    assert.equal(rad.stripe.abonnement, 'sub_test_skaper1');
    assert.match(rad.stripe.kunde, /^cus_/);
    assert.equal(register.stripeLive, false);
    assert.equal((await kunde.konto('admin-abonnement', { kropp: { id: medlem.id } })).status, 401);
    const synk = await admin.konto('admin-abonnement', { kropp: { id: medlem.id } });
    assert.equal(synk.status, 200);
    assert.equal(synk.data.medlem.pakke.id, 'skaper');
  });

  test('ny e-postadresse følger med til Stripe', async () => {
    const kundeId = (await admin.konto('admin-medlemmer')).data.medlemmer.find((x) => x.id === medlem.id)
      .stripe.kunde;
    assert.equal(
      (
        await kunde.konto('endre-epost', {
          kropp: { passord: 'et-langt-passord', epost: 'ny-skaper@example.no' },
        })
      ).status,
      200,
    );
    const lenke = posttil('ny-skaper@example.no').at(-1);
    const token = /#ny-epost=([a-f0-9]{64})/.exec(lenke.tekst)[1];
    assert.equal((await kunde.konto('bytt-epost', { kropp: { token } })).status, 200);
    assert.equal(stripe().kunder[kundeId].email, 'ny-skaper@example.no');
  });

  test('abonnementet avsluttes: gratis konto, beskjed, og kan kjøpes på nytt', async () => {
    settAbonnement({ status: 'canceled', ended_at: na() });
    await hendelse('customer.subscription.deleted', abonnement());
    const m = await meg();
    assert.equal(m.pakke.id, 'gratis');
    assert.equal(m.betaling.status, 'avbrutt');
    assert.equal(m.plan, 'gratis');
    assert.equal(posttil('ny-skaper@example.no').filter((e) => /er avsluttet/.test(e.emne)).length, 1);
    const igjen = await kunde.konto('abonnement-start', { kropp: { plan: 'skaper', periode: 'ar' } });
    assert.equal(igjen.status, 200);
    const nyOkt = Object.values(stripe().okter).at(-1);
    assert.equal(stripe().priser[nyOkt.line_items[0].price].unit_amount, 59000);
  });

  test('sletting av konto avslutter et løpende abonnement først; feiler Stripe, slettes ingenting', async () => {
    const k = klient();
    const m = await nyttMedlem(k, s.rot, 'slett@example.no');
    await k.konto('abonnement-start', { kropp: { plan: 'skaper', periode: 'maned' } });
    const o = Object.values(stripe().okter).at(-1);
    vedStripe((t) => {
      t.abonnementer.sub_test_slett1 = {
        id: 'sub_test_slett1',
        customer: o.customer,
        status: 'active',
        created: na(),
        metadata: o.subscription_data.metadata,
        items: {
          data: [
            {
              price: { recurring: { interval: 'month' } },
              current_period_start: na(),
              current_period_end: na() + 30 * DAG,
            },
          ],
        },
      };
    });
    await hendelse('customer.subscription.created', stripe().abonnementer.sub_test_slett1);
    assert.equal((await meg(k)).pakke.id, 'skaper');

    vedStripe((t) => (t.feil = ['~^DELETE /subscriptions/~']));
    const nei = await k.konto('slett-konto', { kropp: { passord: 'et-langt-passord' } });
    assert.equal(nei.status, 502);
    assert.equal(sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_medlemmer WHERE id = ?', [m.id])[0].n, 1);
    vedStripe((t) => (t.feil = []));
    assert.equal((await k.konto('slett-konto', { kropp: { passord: 'et-langt-passord' } })).status, 200);
    assert.equal(stripe().abonnementer.sub_test_slett1.status, 'canceled');
    assert.equal(sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_medlemmer WHERE id = ?', [m.id])[0].n, 0);
    // the webhook about it finds no member and still answers 200
    assert.equal(
      (await hendelse('customer.subscription.deleted', stripe().abonnementer.sub_test_slett1)).status,
      200,
    );
  });
});
