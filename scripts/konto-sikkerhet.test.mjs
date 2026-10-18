/**
 * Stage B of the account work (Sivert's work order, 2026-10-18): confirmed
 * addresses, one-time links, forgotten and changed passwords, changed
 * addresses, suspension, server-side access, e-mail capture and the upgrade
 * from stage A. Against PHP's built-in server and SQLite, or MySQL/MariaDB
 * with DP_CMS_MYSQL (see scripts/konto.test.mjs). See docs/konto.md.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bekreft,
  eposter,
  harPhp,
  KAKE,
  klient,
  mal,
  nullstillGrenser,
  nyttMedlem,
  ryddMysql,
  settUrl,
  sisteEpost,
  sql,
  startServer,
  tokenFra,
  url,
} from './konto-testhjelp.mjs';

const PORT = 5300 + Math.floor(Math.random() * 300);
const hopp = { skip: !harPhp && 'PHP med pdo_sqlite er ikke installert' };
const PASSORD = 'et-langt-passord';
const NYTT = 'et-nytt-passord';

/** One server for a suite; `valg` as startServer takes them. */
function server(port, valg = {}) {
  const s = { rot: null, prosess: null };
  before(async () => {
    settUrl(`http://127.0.0.1:${port}`);
    ({ rot: s.rot, server: s.prosess } = await startServer({ port, arbeidere: 4, ...valg }));
  });
  after(() => {
    s.prosess?.kill();
    if (s.rot) for (const d of [s.rot.sti, s.rot.post]) rmSync(d, { recursive: true, force: true });
    ryddMysql();
  });
  return s;
}

/** The same request from several browsers at once; returns the statuses. */
async function samtidig(antall, kall) {
  return (await Promise.all(Array.from({ length: antall }, () => kall()))).map((s) => s.status);
}

const medlemRad = (rot, epost) => sql(rot, 'SELECT * FROM dp_medlemmer WHERE epost = ?', [epost])[0];

describe('Bekreftelse av e-postadressen', hopp, () => {
  const s = server(PORT);
  const k = klient();

  test('registrering sender en lenke til riktig adresse, bygget fra den konfigurerte adressen, med tokenet etter #', async () => {
    await nyttMedlem(k, s.rot, 'ny@example.no', { bekreftet: false });
    const e = sisteEpost(s.rot, 'ny@example.no');
    assert.match(e.emne, /Bekreft e-postadressen/);
    assert.ok(e.tekst.includes(`${url()}/konto/#bekreft=`));
    // nothing else in the capture: one message, to that address
    assert.deepEqual(
      eposter(s.rot).map((x) => x.til),
      ['ny@example.no'],
    );
    assert.equal(medlemRad(s.rot, 'ny@example.no').epost_bekreftet, null);
    // only the hash is stored
    const token = tokenFra(e, 'bekreft');
    assert.equal(
      sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_konto_tokens WHERE token_hash = ?', [token])[0].n,
      0,
    );
  });

  test('GET endrer ingenting: bare en uttrykkelig POST bekrefter', async () => {
    const token = tokenFra(sisteEpost(s.rot, 'ny@example.no'), 'bekreft');
    const get = await fetch(`${url()}/api/konto/?r=bekreft-epost&token=${token}`);
    assert.equal(get.status, 405);
    assert.equal(medlemRad(s.rot, 'ny@example.no').epost_bekreftet, null);
    assert.equal(sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_konto_tokens WHERE brukt IS NOT NULL')[0].n, 0);
  });

  test('feil, misformet og feilformåls-token avvises uten å bruke opp det riktige', async () => {
    const token = tokenFra(sisteEpost(s.rot, 'ny@example.no'), 'bekreft');
    for (const feil of ['0'.repeat(64), 'abc', null, token.toUpperCase()]) {
      assert.equal((await k.konto('bekreft-epost', { kropp: { token: feil } })).status, 400);
    }
    // a confirmation link cannot set a password or switch the address
    assert.equal((await k.konto('nytt-passord', { kropp: { token, passord: NYTT } })).status, 400);
    assert.equal((await k.konto('bytt-epost', { kropp: { token } })).status, 400);
    nullstillGrenser(s.rot);
    const ok = await klient().konto('bekreft-epost', { kropp: { token } });
    assert.equal(ok.status, 200);
    assert.ok(medlemRad(s.rot, 'ny@example.no').epost_bekreftet);
  });

  test('et brukt token virker ikke igjen', async () => {
    const token = tokenFra(sisteEpost(s.rot, 'ny@example.no'), 'bekreft');
    assert.equal((await k.konto('bekreft-epost', { kropp: { token } })).status, 400);
  });

  test('et utløpt token avvises', async () => {
    const k2 = klient();
    await nyttMedlem(k2, s.rot, 'utlopt@example.no', { bekreftet: false });
    sql(s.rot, 'UPDATE dp_konto_tokens SET utloper = ? WHERE epost = ?', [
      Math.floor(Date.now() / 1000) - 1,
      'utlopt@example.no',
    ]);
    const token = tokenFra(sisteEpost(s.rot, 'utlopt@example.no'), 'bekreft');
    assert.equal((await k2.konto('bekreft-epost', { kropp: { token } })).status, 400);
    assert.equal(medlemRad(s.rot, 'utlopt@example.no').epost_bekreftet, null);
  });

  test('ny utsending: den forrige lenken slutter å virke, og høyst tre i timen', async () => {
    const k3 = klient();
    await nyttMedlem(k3, s.rot, 'mange@example.no', { bekreftet: false });
    const forste = tokenFra(sisteEpost(s.rot, 'mange@example.no'), 'bekreft');
    assert.equal((await k3.konto('send-bekreftelse', { kropp: {} })).status, 200);
    const andre = tokenFra(sisteEpost(s.rot, 'mange@example.no'), 'bekreft');
    assert.notEqual(forste, andre);
    assert.equal((await k3.konto('bekreft-epost', { kropp: { token: forste } })).status, 400);
    assert.equal((await k3.konto('send-bekreftelse', { kropp: {} })).status, 200);
    assert.equal((await k3.konto('send-bekreftelse', { kropp: {} })).status, 200);
    assert.equal((await k3.konto('send-bekreftelse', { kropp: {} })).status, 429);
    // at most one unused link of a kind per member
    const id = medlemRad(s.rot, 'mange@example.no').id;
    assert.equal(
      sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_konto_tokens WHERE medlem_id = ? AND brukt IS NULL', [id])[0]
        .n,
      1,
    );
    // a guest cannot ask for one
    assert.equal((await klient().konto('send-bekreftelse', { kropp: {} })).status, 401);
  });

  test('samtidige forsøk med samme token: høyst én fullføring', async () => {
    const k4 = klient();
    await nyttMedlem(k4, s.rot, 'samtidig@example.no', { bekreftet: false });
    const token = tokenFra(sisteEpost(s.rot, 'samtidig@example.no'), 'bekreft');
    const statuser = await samtidig(6, () => klient().konto('bekreft-epost', { kropp: { token } }));
    assert.equal(statuser.filter((x) => x === 200).length, 1, statuser.join(','));
    assert.ok(statuser.every((x) => x === 200 || x === 400));
  });

  test('en ubekreftet kunde kan logge inn og se kontoen, men ikke publisere', async () => {
    const k5 = klient();
    await nyttMedlem(k5, s.rot, 'venter@example.no', { bekreftet: false });
    const meg = await k5.konto('meg');
    assert.equal(meg.data.medlem.epostBekreftet, null);
    assert.equal(meg.data.medlem.tilganger['sign-forge'].tilgang, true);
    assert.equal(meg.data.medlem.tilganger['sign-forge'].funksjoner.publisering.tilgang, false);
    assert.match(meg.data.medlem.tilganger['sign-forge'].funksjoner.publisering.grunn, /Bekreft/);
    const del = await k5.konto('del', { kropp: { mal: mal('Skilt') } });
    assert.equal(del.status, 403);
  });
});

describe('Glemt passord', hopp, () => {
  const s = server(PORT + 1);
  const a = klient();
  const b = klient();

  test('samme nøytrale svar for kjent og ukjent adresse; bare den kjente får e-post', async () => {
    await nyttMedlem(a, s.rot, 'glemsk@example.no');
    await b.konto('logginn', { kropp: { epost: 'glemsk@example.no', passord: PASSORD } });
    nullstillGrenser(s.rot);
    const for_ = eposter(s.rot).length;
    const kjent = await klient().konto('glemt-passord', { kropp: { epost: 'glemsk@example.no' } });
    const ukjent = await klient().konto('glemt-passord', { kropp: { epost: 'finnes-ikke@example.no' } });
    assert.equal(kjent.status, 200);
    assert.deepEqual(kjent.data, ukjent.data);
    assert.equal(eposter(s.rot).length, for_ + 1);
    assert.equal(eposter(s.rot).at(-1).til, 'glemsk@example.no');
    assert.ok(eposter(s.rot).at(-1).tekst.includes(`${url()}/konto/#nytt-passord=`));
  });

  test('høyst tre lenker i timen til én adresse, men svaret er det samme', async () => {
    nullstillGrenser(s.rot);
    const for_ = eposter(s.rot).length;
    for (let i = 0; i < 4; i++) {
      const svar = await klient().konto('glemt-passord', { kropp: { epost: 'glemsk@example.no' } });
      assert.equal(svar.status, 200);
    }
    assert.equal(eposter(s.rot).length, for_ + 3);
    // and five requests per IP in a quarter
    assert.equal((await klient().konto('glemt-passord', { kropp: { epost: 'x@example.no' } })).status, 200);
    assert.equal((await klient().konto('glemt-passord', { kropp: { epost: 'x@example.no' } })).status, 429);
  });

  test('GET på lenken endrer ingenting', async () => {
    const token = tokenFra(sisteEpost(s.rot, 'glemsk@example.no'), 'nytt-passord');
    const get = await fetch(`${url()}/api/konto/?r=nytt-passord&token=${token}&passord=${NYTT}`);
    assert.equal(get.status, 405);
    assert.notEqual((await a.konto('meg')).data.medlem, null);
  });

  test('for kort passord avvises uten å bruke opp lenken', async () => {
    nullstillGrenser(s.rot);
    const token = tokenFra(sisteEpost(s.rot, 'glemsk@example.no'), 'nytt-passord');
    assert.equal((await klient().konto('nytt-passord', { kropp: { token, passord: 'kort' } })).status, 422);
    assert.equal(
      sql(s.rot, "SELECT COUNT(*) AS n FROM dp_konto_tokens WHERE formal = 'reset' AND brukt IS NOT NULL")[0]
        .n,
      0,
    );
  });

  test('nytt passord virker; gammelt passord, alle innlogginger og eldre lenker avvises', async () => {
    const eposterNa = eposter(s.rot).filter(
      (e) => e.til === 'glemsk@example.no' && /Nytt passord/.test(e.emne),
    );
    const eldre = tokenFra(eposterNa.at(-2), 'nytt-passord');
    const token = tokenFra(eposterNa.at(-1), 'nytt-passord');
    // a newer link replaced the older one
    assert.equal(
      (await klient().konto('nytt-passord', { kropp: { token: eldre, passord: NYTT } })).status,
      400,
    );
    const ok = await klient().konto('nytt-passord', { kropp: { token, passord: NYTT } });
    assert.equal(ok.status, 200);
    assert.equal((await a.konto('meg')).data.medlem, null);
    assert.equal((await b.konto('meg')).data.medlem, null);
    assert.equal(
      (await klient().konto('nytt-passord', { kropp: { token, passord: 'enda-et-passord' } })).status,
      400,
    );
    nullstillGrenser(s.rot);
    const ny = klient();
    assert.equal(
      (await ny.konto('logginn', { kropp: { epost: 'glemsk@example.no', passord: PASSORD } })).status,
      401,
    );
    assert.equal(
      (await ny.konto('logginn', { kropp: { epost: 'glemsk@example.no', passord: NYTT } })).status,
      200,
    );
  });

  test('samtidige forsøk med samme lenke: høyst ett nytt passord', async () => {
    nullstillGrenser(s.rot);
    await klient().konto('glemt-passord', { kropp: { epost: 'glemsk@example.no' } });
    const token = tokenFra(sisteEpost(s.rot, 'glemsk@example.no'), 'nytt-passord');
    const statuser = await samtidig(6, () =>
      klient().konto('nytt-passord', { kropp: { token, passord: `${NYTT}-${Math.random()}` } }),
    );
    assert.equal(statuser.filter((x) => x === 200).length, 1, statuser.join(','));
  });

  test('en lenke bundet til en adresse virker ikke etter at adressen er byttet', async () => {
    const k = klient();
    await nyttMedlem(k, s.rot, 'flytter@example.no');
    nullstillGrenser(s.rot);
    await klient().konto('glemt-passord', { kropp: { epost: 'flytter@example.no' } });
    const token = tokenFra(sisteEpost(s.rot, 'flytter@example.no'), 'nytt-passord');
    sql(s.rot, 'UPDATE dp_medlemmer SET epost = ? WHERE epost = ?', [
      'flyttet@example.no',
      'flytter@example.no',
    ]);
    assert.equal((await klient().konto('nytt-passord', { kropp: { token, passord: NYTT } })).status, 400);
  });
});

describe('Endre passord og e-postadresse', hopp, () => {
  const s = server(PORT + 2);
  const her = klient();
  const der = klient();

  test('nytt passord krever det gjeldende; andre innlogginger slutter, denne fortsetter med en ny', async () => {
    await nyttMedlem(her, s.rot, 'bytter@example.no');
    await der.konto('logginn', { kropp: { epost: 'bytter@example.no', passord: PASSORD } });
    assert.equal(
      (await her.konto('endre-passord', { kropp: { passord: 'feil-passord-her', nytt: NYTT } })).status,
      403,
    );
    const gammelKake = her.kaker.get(KAKE);
    const ok = await her.konto('endre-passord', { kropp: { passord: PASSORD, nytt: NYTT } });
    assert.equal(ok.status, 200);
    assert.notEqual(her.kaker.get(KAKE), gammelKake);
    assert.equal((await her.konto('meg')).data.medlem.epost, 'bytter@example.no');
    assert.equal((await der.konto('meg')).data.medlem, null);
    // the cookie this browser had before the change does not work either
    const gammel = await fetch(`${url()}/api/konto/?r=meg`, { headers: { Cookie: `${KAKE}=${gammelKake}` } });
    assert.equal((await gammel.json()).medlem, null);
  });

  test('ny adresse krever passordet, må være ledig og bekreftes før den gjelder', async () => {
    const annen = klient();
    await nyttMedlem(annen, s.rot, 'opptatt@example.no');
    nullstillGrenser(s.rot);
    assert.equal(
      (await her.konto('endre-epost', { kropp: { passord: PASSORD, epost: 'ny@example.no' } })).status,
      403,
    );
    assert.equal(
      (await her.konto('endre-epost', { kropp: { passord: NYTT, epost: 'opptatt@example.no' } })).status,
      409,
    );
    assert.equal(
      (await her.konto('endre-epost', { kropp: { passord: NYTT, epost: 'bytter@example.no' } })).status,
      422,
    );
    assert.equal(
      (await her.konto('endre-epost', { kropp: { passord: NYTT, epost: 'ny@example.no' } })).status,
      200,
    );
    // the link goes to the new address, a notice to the old one, and the old one still applies
    const lenke = sisteEpost(s.rot, 'ny@example.no');
    assert.ok(lenke.tekst.includes('/konto/#ny-epost='));
    assert.doesNotMatch(sisteEpost(s.rot, 'bytter@example.no').tekst, /#ny-epost=/);
    assert.equal((await her.konto('meg')).data.medlem.epost, 'bytter@example.no');
    const token = tokenFra(lenke, 'ny-epost');
    const ok = await klient().konto('bytt-epost', { kropp: { token } });
    assert.equal(ok.status, 200);
    const meg = (await her.konto('meg')).data.medlem;
    assert.equal(meg.epost, 'ny@example.no');
    assert.ok(meg.epostBekreftet);
    nullstillGrenser(s.rot);
    assert.equal(
      (await klient().konto('logginn', { kropp: { epost: 'bytter@example.no', passord: NYTT } })).status,
      401,
    );
    assert.equal(
      (await klient().konto('logginn', { kropp: { epost: 'ny@example.no', passord: NYTT } })).status,
      200,
    );
    assert.equal((await klient().konto('bytt-epost', { kropp: { token } })).status, 400);
  });

  test('en nyere forespørsel gjør den eldre ugyldig', async () => {
    nullstillGrenser(s.rot);
    await her.konto('endre-epost', { kropp: { passord: NYTT, epost: 'forst@example.no' } });
    await her.konto('endre-epost', { kropp: { passord: NYTT, epost: 'sist@example.no' } });
    assert.equal(
      (
        await klient().konto('bytt-epost', {
          kropp: { token: tokenFra(sisteEpost(s.rot, 'forst@example.no'), 'ny-epost') },
        })
      ).status,
      400,
    );
    const token = tokenFra(sisteEpost(s.rot, 'sist@example.no'), 'ny-epost');
    const statuser = await samtidig(5, () => klient().konto('bytt-epost', { kropp: { token } }));
    assert.equal(statuser.filter((x) => x === 200).length, 1, statuser.join(','));
    assert.equal((await her.konto('meg')).data.medlem.epost, 'sist@example.no');
  });

  test('adressen tatt av en annen før fullføring: konflikt, ingen sammenslåing', async () => {
    nullstillGrenser(s.rot);
    await her.konto('endre-epost', { kropp: { passord: NYTT, epost: 'kapplop@example.no' } });
    const token = tokenFra(sisteEpost(s.rot, 'kapplop@example.no'), 'ny-epost');
    const rask = klient();
    await nyttMedlem(rask, s.rot, 'kapplop@example.no', { bekreftet: false });
    const svar = await klient().konto('bytt-epost', { kropp: { token } });
    assert.equal(svar.status, 409);
    assert.equal((await her.konto('meg')).data.medlem.epost, 'sist@example.no');
    assert.equal(
      sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_medlemmer WHERE epost = ?', ['kapplop@example.no'])[0].n,
      1,
    );
  });

  /** A member with an e-mail change started, and the token of its link. */
  async function medBytteStartet(k, epost, ny) {
    await nyttMedlem(k, s.rot, epost);
    nullstillGrenser(s.rot);
    assert.equal((await k.konto('endre-epost', { kropp: { passord: PASSORD, epost: ny } })).status, 200);
    return tokenFra(sisteEpost(s.rot, ny), 'ny-epost');
  }
  const ubrukte = (epost) =>
    Number(
      sql(
        s.rot,
        'SELECT COUNT(*) AS n FROM dp_konto_tokens t JOIN dp_medlemmer m ON m.id = t.medlem_id WHERE m.epost = ? AND t.brukt IS NULL',
        [epost],
      )[0].n,
    );

  test('glemt passord: en adressebytte-lenke fra før virker ikke etterpå', async () => {
    const k = klient();
    const bytte = await medBytteStartet(k, 'kapret@example.no', 'angriper@example.no');
    await k.konto('send-bekreftelse', { kropp: {} });
    await klient().konto('glemt-passord', { kropp: { epost: 'kapret@example.no' } });
    const reset = tokenFra(sisteEpost(s.rot, 'kapret@example.no'), 'nytt-passord');
    assert.equal(
      (await klient().konto('nytt-passord', { kropp: { token: reset, passord: NYTT } })).status,
      200,
    );
    // every unused link of the account is gone in the same transaction
    assert.equal(ubrukte('kapret@example.no'), 0);
    assert.equal((await klient().konto('bytt-epost', { kropp: { token: bytte } })).status, 400);
    assert.equal(medlemRad(s.rot, 'kapret@example.no').epost, 'kapret@example.no');
    assert.equal(medlemRad(s.rot, 'angriper@example.no'), undefined);
  });

  test('endret passord: en adressebytte-lenke fra før virker ikke etterpå', async () => {
    const k = klient();
    const bytte = await medBytteStartet(k, 'varsom@example.no', 'inntrenger@example.no');
    assert.equal((await k.konto('endre-passord', { kropp: { passord: PASSORD, nytt: NYTT } })).status, 200);
    assert.equal(ubrukte('varsom@example.no'), 0);
    assert.equal((await klient().konto('bytt-epost', { kropp: { token: bytte } })).status, 400);
    assert.equal(medlemRad(s.rot, 'varsom@example.no').epost, 'varsom@example.no');
    // this browser is still signed in and can start a new change
    nullstillGrenser(s.rot);
    assert.equal(
      (await k.konto('endre-epost', { kropp: { passord: NYTT, epost: 'varsom2@example.no' } })).status,
      200,
    );
  });

  test('nytt passord og adressebytte samtidig: aldri begge', async () => {
    for (let runde = 0; runde < 6; runde++) {
      const epost = `samtidig${runde}@example.no`;
      const ny = `samtidig${runde}-ny@example.no`;
      const k = klient();
      const bytte = await medBytteStartet(k, epost, ny);
      await klient().konto('glemt-passord', { kropp: { epost } });
      const reset = tokenFra(sisteEpost(s.rot, epost), 'nytt-passord');
      const [b, r] = await Promise.all([
        klient().konto('bytt-epost', { kropp: { token: bytte } }),
        klient().konto('nytt-passord', { kropp: { token: reset, passord: NYTT } }),
      ]);
      // one of them first; the other finds its link revoked
      assert.equal([b.status, r.status].filter((x) => x === 200).length, 1, `${b.status},${r.status}`);
      assert.ok(
        [b.status, r.status].every((x) => x === 200 || x === 400),
        `${b.status},${r.status}`,
      );
      assert.equal(medlemRad(s.rot, b.status === 200 ? ny : epost)?.epost, b.status === 200 ? ny : epost);
      assert.equal(ubrukte(b.status === 200 ? ny : epost), 0);
    }
  });
});

describe('Suspendering, tilganger og sletting', hopp, () => {
  const s = server(PORT + 3);
  const admin = klient();
  const kunde = klient();
  let id;

  before(async () => {
    await admin.cms('oppsett', {
      kropp: { kode: 'test-oppsettkode-1234', epost: 'eier@example.no', navn: 'Eier', passord: PASSORD },
    });
  });

  test('en kunde kan ikke administrere andre eller gi seg selv rettigheter', async () => {
    id = (await nyttMedlem(kunde, s.rot, 'kunde@example.no')).id;
    for (const [r, kropp] of [
      ['admin-status', { id, status: 'aktiv' }],
      ['admin-tilgang', { id, nokkel: 'csv', verdi: 'ja' }],
    ]) {
      assert.equal((await kunde.konto(r, { kropp })).status, 401);
    }
    assert.equal((await kunde.konto('admin-medlemmer')).status, 401);
    assert.equal((await kunde.konto('admin-testpost')).status, 401);
    // extra fields are ignored; the plan, status and access come from the server only
    await kunde.konto('profil', {
      kropp: { navn: 'Kunde', plan: 'pro', status: 'admin', tilganger: { csv: true } },
    });
    const meg = (await kunde.konto('meg')).data.medlem;
    assert.equal(meg.plan, 'gratis');
    assert.equal(meg.status, 'aktiv');
    // a customer is never a CMS user: the account cookie gives no CMS access
    assert.equal((await kunde.cms('meg')).status, 401);
  });

  test('en administrator kan stenge en funksjon for én kunde; svaret forklarer hvorfor', async () => {
    assert.equal((await kunde.konto('del', { kropp: { mal: mal('Før') } })).status, 201);
    const ukjent = await admin.konto('admin-tilgang', { kropp: { id, nokkel: 'alt', verdi: 'ja' } });
    assert.equal(ukjent.status, 422);
    assert.equal(
      (await admin.konto('admin-tilgang', { kropp: { id, nokkel: 'sign-forge/publisering', verdi: 'nei' } }))
        .status,
      200,
    );
    const nei = await kunde.konto('del', { kropp: { mal: mal('Etter') } });
    assert.equal(nei.status, 403);
    assert.match(nei.data.feil, /Stengt/);
    assert.equal(
      (await kunde.konto('meg')).data.medlem.tilganger['sign-forge'].funksjoner.publisering.tilgang,
      false,
    );
    // the gallery and the member's own list are untouched
    assert.equal((await kunde.konto('mine-skilt')).data.skilt.length, 1);
    assert.equal(
      (await admin.konto('admin-tilgang', { kropp: { id, nokkel: 'sign-forge/publisering', verdi: null } }))
        .status,
      200,
    );
    assert.equal((await kunde.konto('del', { kropp: { mal: mal('Igjen') } })).status, 201);
  });

  test('pakker og priser endres i Studio og gjelder med en gang; en kunde kan ikke endre dem', async () => {
    const plan = (kropp) => admin.konto('admin-plan', { kropp });
    assert.equal((await kunde.konto('admin-plan', { kropp: { id: 'gratis', prosjekter: 999 } })).status, 401);
    assert.equal((await kunde.konto('admin-planer')).status, 401);
    assert.equal((await plan({ id: 'pro', prosjekter: 5 })).status, 404);
    assert.equal((await plan({ id: 'gratis', prosjekter: -1 })).status, 422);
    assert.equal((await plan({ id: 'gratis', prosjekter: '6' })).status, 422);
    assert.equal((await plan({ id: 'skaper', prosjekter: 50, prisManed: 1.5, prisAr: 590 })).status, 422);
    assert.equal((await plan({ id: 'skaper', prosjekter: 50, prisManed: null, prisAr: 590 })).status, 422);

    const ny = await plan({ id: 'skaper', prosjekter: 60, prisManed: 69, prisAr: 690 });
    assert.equal(ny.status, 200);
    assert.deepEqual([ny.data.planer.skaper.prosjekter, ny.data.planer.skaper.pris.maned], [60, 69]);
    assert.equal(ny.data.planer.skaper.endretAv, 'Eier');
    const status = (await klient().konto('status')).data;
    assert.deepEqual(
      [status.planer.skaper.prosjekter, status.planer.skaper.pris.maned, status.planer.skaper.pris.ar],
      [60, 69, 690],
    );
    assert.equal(status.planer.skaper.kanKjopes, false);

    // the free quota counts at once; a free package never gets a price
    assert.equal((await plan({ id: 'gratis', prosjekter: 7, prisManed: 10, prisAr: 100 })).status, 200);
    assert.equal((await kunde.konto('prosjekter')).data.kvote.maks, 7);
    assert.equal((await admin.konto('admin-planer')).data.planer.gratis.pris, undefined);
    assert.equal((await plan({ id: 'gratis', prosjekter: 5 })).status, 200);
    assert.equal((await plan({ id: 'skaper', prosjekter: 50, prisManed: 59, prisAr: 590 })).status, 200);
    assert.equal((await kunde.konto('prosjekter')).data.kvote.maks, 5);
  });

  test('suspendering stopper innlogging og lenker; reaktivering gjenoppliver ikke gamle innlogginger', async () => {
    const kake = kunde.kaker.get(KAKE);
    nullstillGrenser(s.rot);
    await klient().konto('glemt-passord', { kropp: { epost: 'kunde@example.no' } });
    const token = tokenFra(sisteEpost(s.rot, 'kunde@example.no'), 'nytt-passord');
    assert.equal((await admin.konto('admin-status', { kropp: { id, status: 'suspendert' } })).status, 200);
    assert.equal((await kunde.konto('meg')).data.medlem, null);
    assert.equal((await kunde.konto('del', { kropp: { mal: mal('Stengt') } })).status, 401);
    assert.equal((await klient().konto('nytt-passord', { kropp: { token, passord: NYTT } })).status, 400);
    const inn = await klient().konto('logginn', { kropp: { epost: 'kunde@example.no', passord: PASSORD } });
    assert.equal(inn.status, 403);
    assert.match(inn.data.feil, /stengt/);
    // no reset link for a suspended account, same answer
    const for_ = eposter(s.rot).length;
    assert.equal(
      (await klient().konto('glemt-passord', { kropp: { epost: 'kunde@example.no' } })).status,
      200,
    );
    assert.equal(eposter(s.rot).length, for_);
    const rad = (await admin.konto('admin-medlemmer')).data.medlemmer.find((m) => m.id === id);
    assert.equal(rad.status, 'suspendert');
    assert.equal((await admin.konto('admin-status', { kropp: { id, status: 'slettet' } })).status, 422);
    assert.equal((await admin.konto('admin-status', { kropp: { id, status: 'aktiv' } })).status, 200);
    const gammel = await fetch(`${url()}/api/konto/?r=meg`, { headers: { Cookie: `${KAKE}=${kake}` } });
    assert.equal((await gammel.json()).medlem, null);
    nullstillGrenser(s.rot);
    assert.equal(
      (await kunde.konto('logginn', { kropp: { epost: 'kunde@example.no', passord: PASSORD } })).status,
      200,
    );
  });

  test('testbygget viser de fangede e-postene til en administrator', async () => {
    const svar = await admin.konto('admin-testpost');
    assert.equal(svar.status, 200);
    assert.ok(svar.data.eposter.some((e) => e.til === 'kunde@example.no'));
  });

  test('sletting fjerner kontoen, innlogginger, lenker, unntak og skilt; adressen kan brukes på nytt', async () => {
    await admin.konto('admin-tilgang', { kropp: { id, nokkel: 'csv', verdi: 'nei' } });
    nullstillGrenser(s.rot);
    await kunde.konto('send-bekreftelse', { kropp: {} });
    await klient().konto('glemt-passord', { kropp: { epost: 'kunde@example.no' } });
    const token = tokenFra(sisteEpost(s.rot, 'kunde@example.no'), 'nytt-passord');
    assert.equal((await kunde.konto('slett-konto', { kropp: { passord: PASSORD } })).status, 200);
    for (const t of ['dp_konto_okter', 'dp_konto_tokens', 'dp_konto_tilganger', 'dp_skilt']) {
      assert.equal(sql(s.rot, `SELECT COUNT(*) AS n FROM ${t} WHERE medlem_id = ?`, [id])[0].n, 0, t);
    }
    assert.equal((await klient().konto('nytt-passord', { kropp: { token, passord: NYTT } })).status, 400);
    nullstillGrenser(s.rot);
    assert.equal(
      (await klient().konto('logginn', { kropp: { epost: 'kunde@example.no', passord: PASSORD } })).status,
      401,
    );
    const igjen = await nyttMedlem(klient(), s.rot, 'kunde@example.no', { bekreftet: false });
    assert.notEqual(igjen.id, id);
    assert.equal(igjen.epostBekreftet, null);
  });
});

describe('Uten e-postoppsett', hopp, () => {
  const s = server(PORT + 4, { utenEpost: true });
  const k = klient();

  test('kontoen lages, men siden får vite at lenken ikke ble sendt; ingen falsk bekreftelse', async () => {
    const svar = await k.konto('registrer', {
      kropp: { navn: 'Uten', epost: 'uten@example.no', passord: PASSORD, vilkar: true },
    });
    assert.equal(svar.status, 201);
    assert.equal(svar.data.bekreftelse.sendt, false);
    assert.match(svar.data.bekreftelse.feil, /ikke satt opp/);
    assert.equal((await k.konto('send-bekreftelse', { kropp: {} })).status, 503);
    for (const epost of ['uten@example.no', 'ukjent@example.no']) {
      assert.equal((await klient().konto('glemt-passord', { kropp: { epost } })).status, 503);
    }
    assert.equal(
      (await k.konto('endre-epost', { kropp: { passord: PASSORD, epost: 'ny@example.no' } })).status,
      503,
    );
    assert.equal((await k.konto('meg')).data.medlem.epost, 'uten@example.no');
    assert.equal(
      sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_konto_tokens WHERE brukt IS NULL AND formal <> ?', [
        'bekreft',
      ])[0].n,
      0,
    );
    assert.equal(existsSync(s.rot.post) ? readdirSync(s.rot.post).length : 0, 0);
  });
});

describe('E-postfangsten sender ingenting ut', hopp, () => {
  test('driveren «mail» avvises på et testbygg og på testserveren', async () => {
    const port = PORT + 5;
    settUrl(`http://127.0.0.1:${port}`);
    const { rot, server: p } = await startServer({ port, epostdriver: 'mail' });
    try {
      const svar = await klient().konto('registrer', {
        kropp: { navn: 'Mail', epost: 'mail@example.no', passord: PASSORD, vilkar: true },
      });
      assert.equal(svar.data.bekreftelse.sendt, false);
      assert.equal(readdirSync(rot.post).length, 0);
    } finally {
      p.kill();
      for (const d of [rot.sti, rot.post]) rmSync(d, { recursive: true, force: true });
      ryddMysql();
    }
  });

  test('en fangstmappe inne i nettstedet avvises', async () => {
    const port = PORT + 6;
    settUrl(`http://127.0.0.1:${port}`);
    const { rot, server: p } = await startServer({ port, postIRot: true });
    try {
      const svar = await klient().konto('registrer', {
        kropp: { navn: 'Rot', epost: 'rot@example.no', passord: PASSORD, vilkar: true },
      });
      assert.equal(svar.data.bekreftelse.sendt, false);
      assert.equal(existsSync(rot.post), false);
    } finally {
      p.kill();
      rmSync(rot.sti, { recursive: true, force: true });
      ryddMysql();
    }
  });

  /** Registers on a fresh server and says whether the confirmation was captured. */
  async function sendtMed(port, valg, ekstra = []) {
    settUrl(`http://127.0.0.1:${port}`);
    const { rot, server: p } = await startServer({ port, ...valg });
    try {
      const svar = await klient().konto('registrer', {
        kropp: { navn: 'Fangst', epost: 'fangst@example.no', passord: PASSORD, vilkar: true },
      });
      assert.equal(svar.status, 201);
      return { sendt: svar.data.bekreftelse.sendt, finnes: existsSync(rot.post) };
    } finally {
      p.kill();
      for (const d of [rot.topp, rot.post, ...ekstra]) rmSync(d, { recursive: true, force: true });
      ryddMysql();
    }
  }

  test('appen under /designporten-test/: en søstermappe i nettstedets rot avvises', async () => {
    const r = await sendtMed(PORT + 9, {
      undermappe: 'designporten-test',
      post: (topp) => join(topp, 'postfangst'),
    });
    assert.deepEqual(r, { sendt: false, finnes: false });
  });

  test('en mappe under et annet nettsted (index.html, index.php eller .htaccess) avvises', async () => {
    for (const fil of ['index.html', 'index.php', '.htaccess']) {
      const annet = mkdtempSync(join(tmpdir(), 'dp-konto-nettsted-'));
      writeFileSync(join(annet, fil), '');
      const r = await sendtMed(PORT + 10, { post: () => join(annet, 'privat', 'post') }, [annet]);
      assert.deepEqual(r, { sendt: false, finnes: false }, fil);
    }
  });

  test('appen under /designporten-test/: en mappe utenfor nettstedet virker', async () => {
    const r = await sendtMed(PORT + 11, { undermappe: 'designporten-test' });
    assert.deepEqual(r, { sendt: true, finnes: true });
  });
});

// The stage A code comes from git; a shallow clone or an unpacked source zip does not have it.
const A = '27873d681dd918e7ddb1bda9c4f663602c3768bc';
const harA = spawnSync('git', ['cat-file', '-e', `${A}^{tree}`]).status === 0;

describe(
  'Oppgradering fra etappe A',
  { skip: hopp.skip || (!harA && `etappe A (${A.slice(0, 7)}) finnes ikke i git-historikken her`) },
  () => {
    let kilde;
    let rot;
    let p;
    const ola = klient();
    let fra;

    before(async () => {
      // the account code exactly as stage A delivered it, from git
      kilde = mkdtempSync(join(tmpdir(), 'dp-konto-a-'));
      const arkiv = spawnSync('sh', ['-c', `git archive ${A} php | tar -x -C ${kilde}`]);
      assert.equal(arkiv.status, 0, String(arkiv.stderr));
      settUrl(`http://127.0.0.1:${PORT + 7}`);
      ({ rot, server: p } = await startServer({ port: PORT + 7, kilde: join(kilde, 'php') }));
      await ola.konto('registrer', {
        kropp: { navn: 'Ola', epost: 'ola@example.no', passord: PASSORD, vilkar: true },
      });
      await klient().konto('registrer', {
        kropp: { navn: 'Kari', epost: 'kari@example.no', passord: PASSORD, vilkar: true },
      });
      assert.equal((await ola.konto('del', { kropp: { mal: mal('Fra A') } })).status, 201);
      fra = {
        medlemmer: sql(rot, 'SELECT id, epost, navn, opprettet FROM dp_medlemmer ORDER BY id'),
        okter: sql(rot, 'SELECT token_hash, medlem_id FROM dp_konto_okter ORDER BY id'),
        skilt: sql(rot, 'SELECT offentlig_id, medlem_id, tittel, mal FROM dp_skilt ORDER BY id'),
        versjon: sql(rot, 'SELECT MAX(versjon) AS v FROM dp_konto_migrering')[0].v,
      };
      assert.equal(Number(fra.versjon), 2);
      p.kill();
      await new Promise((r) => setTimeout(r, 200));
      settUrl(`http://127.0.0.1:${PORT + 8}`);
      ({ server: p } = await startServer({ port: PORT + 8, rot }));
    });

    after(() => {
      p?.kill();
      for (const d of [kilde, rot?.sti, rot?.post]) if (d) rmSync(d, { recursive: true, force: true });
      ryddMysql();
    });

    test('kunder, innlogginger og galleriskilt er bevart med samme id-er', async () => {
      const meg = (await ola.konto('meg')).data.medlem;
      assert.ok(meg, 'innloggingen fra A virker fortsatt');
      assert.equal(Number(sql(rot, 'SELECT MAX(versjon) AS v FROM dp_konto_migrering')[0].v), 5);
      assert.deepEqual(
        sql(rot, 'SELECT id, epost, navn, opprettet FROM dp_medlemmer ORDER BY id'),
        fra.medlemmer,
      );
      assert.deepEqual(sql(rot, 'SELECT token_hash, medlem_id FROM dp_konto_okter ORDER BY id'), fra.okter);
      assert.deepEqual(
        sql(rot, 'SELECT offentlig_id, medlem_id, tittel, mal FROM dp_skilt ORDER BY id'),
        fra.skilt,
      );
      assert.equal((await klient().konto('skilt')).data.skilt[0].tittel, 'Fra A');
    });

    test('eksisterende kunder er aktive og ubekreftet, og kan bekrefte seg selv', async () => {
      const rader = sql(rot, 'SELECT status, epost_bekreftet FROM dp_medlemmer');
      assert.ok(rader.every((r) => r.status === 'aktiv' && r.epost_bekreftet === null));
      const nekt = await ola.konto('del', { kropp: { mal: mal('Etter B') } });
      assert.equal(nekt.status, 403);
      assert.equal((await ola.konto('send-bekreftelse', { kropp: {} })).status, 200);
      await bekreft(ola, rot, 'ola@example.no');
      const [skilt] = fra.skilt;
      assert.equal(
        (await ola.konto('del', { kropp: { id: skilt.offentlig_id, mal: mal('Oppdatert i B') } })).status,
        200,
      );
    });
  },
);
