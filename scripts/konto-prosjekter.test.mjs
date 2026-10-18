/**
 * Stage C (Sivert, 2026-10-18): projects on the account. Guests store
 * nothing on the server, a free account keeps five projects in total across
 * apps, a paid package sets its own quota and services, CSV is free for
 * everyone in an explicit free period, and saved projects can always be
 * opened and downloaded. Against PHP's built-in server and SQLite, or
 * MySQL/MariaDB with DP_CMS_MYSQL (see scripts/konto.test.mjs). See
 * docs/konto.md.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  harPhp,
  klient,
  nullstillGrenser,
  nyttMedlem,
  ryddMysql,
  settUrl,
  sql,
  startServer,
} from './konto-testhjelp.mjs';

const PORT = 5600 + Math.floor(Math.random() * 300);
const hopp = { skip: !harPhp && 'PHP med pdo_sqlite er ikke installert' };

/** A small Skaperverksted document of `app`. */
const dok = (navn, app = 'signgen', ekstra = {}) => ({
  versjon: 1,
  id: `d_${navn}`,
  generator: app,
  navn,
  plate: { bredde: 256, dybde: 256 },
  lag: [],
  objekter: {},
  rekkefolge: {},
  parametre: {},
  meta: { opprettet: '2026-10-18T00:00:00Z', endret: '2026-10-18T00:00:00Z' },
  ...ekstra,
});
const lagre = (k, navn, valg = {}) =>
  k.konto('prosjekt-lagre', {
    kropp: { app: valg.app ?? 'signgen', navn, dokument: dok(navn, valg.app), ...valg.felt },
  });

describe('Prosjekter på kontoen', hopp, () => {
  const s = { rot: null, prosess: null };
  let tjenesterFil;
  let tjenester;
  /** Changes tjenester.json on the test server (the server reads it on every request). */
  const medTjenester = (f) => writeFileSync(tjenesterFil, JSON.stringify(f(structuredClone(tjenester))));

  before(async () => {
    settUrl(`http://127.0.0.1:${PORT}`);
    ({ rot: s.rot, server: s.prosess } = await startServer({ port: PORT, arbeidere: 4 }));
    tjenesterFil = join(s.rot.sti, 'api/konto/tjenester.json');
    tjenester = JSON.parse(readFileSync(tjenesterFil, 'utf8'));
  });
  after(() => {
    s.prosess?.kill();
    if (s.rot) for (const d of [s.rot.sti, s.rot.post]) rmSync(d, { recursive: true, force: true });
    ryddMysql();
  });

  test('en gjest lagrer ingenting på serveren', async () => {
    const gjest = klient();
    assert.equal((await gjest.konto('prosjekter')).status, 401);
    assert.equal((await lagre(gjest, 'Gjest')).status, 401);
    assert.equal(sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_prosjekter')[0].n, 0);
  });

  test('lagre, liste, åpne og oppdatere; en eldre revisjon gir 409 med den nyeste', async () => {
    const k = klient();
    await nyttMedlem(k, s.rot, 'lagrer@example.no', { bekreftet: false });
    const ny = await lagre(k, 'Dørskilt');
    assert.equal(ny.status, 201, JSON.stringify(ny.data));
    assert.equal(ny.data.prosjekt.revisjon, 1);
    assert.deepEqual(ny.data.kvote, { brukt: 1, maks: 5, pakke: 'gratis', pakkenavn: 'Gratis konto' });
    const { id } = ny.data.prosjekt;
    assert.match(id, /^[a-f0-9]{16}$/);

    const liste = await k.konto('prosjekter');
    assert.equal(liste.data.prosjekter.length, 1);
    assert.equal(liste.data.prosjekter[0].navn, 'Dørskilt');
    assert.equal(liste.data.prosjekter[0].dokument, undefined);

    const apnet = await k.konto('prosjekt', { sok: `&id=${id}` });
    assert.equal(apnet.status, 200);
    assert.equal(apnet.data.prosjekt.dokument.generator, 'signgen');
    assert.equal(apnet.data.prosjekt.dokument.navn, 'Dørskilt');

    const oppdatert = await lagre(k, 'Dørskilt 2', { felt: { id, revisjon: 1 } });
    assert.equal(oppdatert.status, 200);
    assert.equal(oppdatert.data.prosjekt.revisjon, 2);
    assert.equal(oppdatert.data.kvote.brukt, 1);

    // another tab still on revision 1
    const gammel = await lagre(k, 'Fra en annen fane', { felt: { id, revisjon: 1 } });
    assert.equal(gammel.status, 409);
    assert.equal(gammel.data.revisjon, 2);
    assert.ok(gammel.data.endret);
    assert.equal((await k.konto('prosjekt', { sok: `&id=${id}` })).data.prosjekt.navn, 'Dørskilt 2');
    // «Lagre som kopi»: a new project
    const kopi = await lagre(k, 'Fra en annen fane');
    assert.equal(kopi.status, 201);
    assert.notEqual(kopi.data.prosjekt.id, id);
  });

  test('samtidige lagringer av samme revisjon: én lykkes, de andre får 409', async () => {
    const k = klient();
    await nyttMedlem(k, s.rot, 'faner@example.no');
    const { id } = (await lagre(k, 'Mange faner')).data.prosjekt;
    const svar = await Promise.all(
      Array.from({ length: 5 }, (_, i) => lagre(k, `Fane ${i}`, { felt: { id, revisjon: 1 } })),
    );
    const statuser = svar.map((x) => x.status);
    assert.equal(statuser.filter((x) => x === 200).length, 1, statuser.join(','));
    assert.equal(statuser.filter((x) => x === 409).length, 4, statuser.join(','));
    assert.equal((await k.konto('prosjekt', { sok: `&id=${id}` })).data.prosjekt.revisjon, 2);
  });

  test('fem prosjekter totalt på tvers av appene; det sjette avvises, eksisterende kan fortsatt endres', async () => {
    medTjenester((t) => ({ ...t, prosjektapper: { ...t.prosjektapper, lampe: 'Form Forge' } }));
    try {
      const k = klient();
      await nyttMedlem(k, s.rot, 'kvote@example.no');
      for (let i = 0; i < 3; i++) assert.equal((await lagre(k, `Skilt ${i}`)).status, 201);
      for (let i = 0; i < 2; i++) assert.equal((await lagre(k, `Lampe ${i}`, { app: 'lampe' })).status, 201);
      const sjette = await lagre(k, 'Ett til', { app: 'lampe' });
      assert.equal(sjette.status, 403);
      assert.match(sjette.data.feil, /5 av 5 prosjekter/);
      assert.match(sjette.data.feil, /lagret i denne nettleseren/);
      const liste = (await k.konto('prosjekter')).data;
      assert.equal(liste.kvote.brukt, 5);
      assert.equal((await k.konto('prosjekter', { sok: '&app=lampe' })).data.prosjekter.length, 2);
      // updating one that exists is not a new project
      const forste = liste.prosjekter.at(-1);
      assert.equal(
        (await lagre(k, 'Endret', { app: forste.app, felt: { id: forste.id, revisjon: forste.revisjon } }))
          .status,
        200,
      );
      // deleting makes room
      assert.equal((await k.konto('prosjekt-slett', { kropp: { id: forste.id } })).status, 200);
      assert.equal((await lagre(k, 'Nå er det plass')).status, 201);
    } finally {
      medTjenester((t) => t);
    }
  });

  test('to lagringer samtidig ved fire av fem: bare én får plass', async () => {
    const k = klient();
    await nyttMedlem(k, s.rot, 'kappes@example.no');
    for (let i = 0; i < 4; i++) assert.equal((await lagre(k, `Skilt ${i}`)).status, 201);
    const statuser = (await Promise.all(Array.from({ length: 6 }, (_, i) => lagre(k, `Samtidig ${i}`)))).map(
      (x) => x.status,
    );
    assert.equal(statuser.filter((x) => x === 201).length, 1, statuser.join(','));
    assert.equal(statuser.filter((x) => x === 403).length, 5, statuser.join(','));
    assert.equal((await k.konto('prosjekter')).data.kvote.brukt, 5);
  });

  test('en annen kundes prosjekt kan verken åpnes, endres eller slettes', async () => {
    const eier = klient();
    const annen = klient();
    await nyttMedlem(eier, s.rot, 'eier-p@example.no');
    await nyttMedlem(annen, s.rot, 'annen-p@example.no');
    const { id } = (await lagre(eier, 'Privat')).data.prosjekt;
    assert.equal((await annen.konto('prosjekt', { sok: `&id=${id}` })).status, 404);
    assert.equal((await lagre(annen, 'Kapret', { felt: { id, revisjon: 1 } })).status, 404);
    assert.equal((await annen.konto('prosjekt-slett', { kropp: { id } })).status, 404);
    assert.equal((await annen.konto('prosjekter')).data.prosjekter.length, 0);
    assert.equal((await eier.konto('prosjekt', { sok: `&id=${id}` })).data.prosjekt.navn, 'Privat');
    // an owner sent by the browser is ignored: the owner is always the session
    const forsok = await annen.konto('prosjekt-lagre', {
      kropp: { app: 'signgen', navn: 'X', dokument: dok('X'), medlem_id: 1, medlemId: 1 },
    });
    assert.equal(forsok.status, 201);
    const eierId = sql(s.rot, 'SELECT medlem_id FROM dp_prosjekter WHERE offentlig_id = ?', [
      forsok.data.prosjekt.id,
    ])[0].medlem_id;
    assert.equal(
      Number(eierId),
      Number(sql(s.rot, "SELECT id FROM dp_medlemmer WHERE epost = 'annen-p@example.no'")[0].id),
    );
  });

  test('ugyldige prosjekter avvises: feil verktøy, feil format, for stort', async () => {
    const k = klient();
    await nyttMedlem(k, s.rot, 'ugyldig@example.no');
    const kall = (kropp) => k.konto('prosjekt-lagre', { kropp });
    assert.equal((await kall({ app: 'ukjent', navn: 'X', dokument: dok('X', 'ukjent') })).status, 422);
    assert.equal((await kall({ app: 'signgen', navn: 'X', dokument: dok('X', 'lampe') })).status, 422);
    assert.equal((await kall({ app: 'signgen', navn: 'X', dokument: { hei: 1 } })).status, 422);
    assert.equal((await kall({ app: 'signgen', navn: 'X', dokument: 'tekst' })).status, 422);
    const stor = dok('Stor', 'signgen', { parametre: { fyll: 'x'.repeat(2_100_000) } });
    const svar = await kall({ app: 'signgen', navn: 'Stor', dokument: stor });
    assert.ok([400, 413].includes(svar.status), String(svar.status));
    assert.equal((await k.konto('prosjekter')).data.prosjekter.length, 0);
    assert.equal((await k.konto('prosjekt', { sok: '&id=../../etc' })).status, 404);
  });

  test('pakkestyring: en betalt pakke gir egen kvote og CSV; når den utløper, kan alt fortsatt åpnes og lastes ned', async () => {
    medTjenester((t) => ({
      ...t,
      planer: { ...t.planer, testpakke: { navn: 'Testpakke', prosjekter: 8, tjenester: ['csv'] } },
    }));
    try {
      const k = klient();
      const m = await nyttMedlem(k, s.rot, 'betaler@example.no');
      sql(
        s.rot,
        "UPDATE dp_medlemmer SET plan = 'testpakke', betaling_status = 'aktiv', betalt_til = '2999-01-01T00:00:00Z' WHERE id = ?",
        [m.id],
      );
      assert.equal((await k.konto('prosjekter')).data.kvote.maks, 8);
      for (let i = 0; i < 7; i++) assert.equal((await lagre(k, `Pakke ${i}`)).status, 201);

      // the package ends: back to the free quota, nothing deleted or locked away
      sql(s.rot, "UPDATE dp_medlemmer SET betalt_til = '2000-01-01T00:00:00Z' WHERE id = ?", [m.id]);
      const liste = (await k.konto('prosjekter')).data;
      assert.deepEqual([liste.kvote.brukt, liste.kvote.maks, liste.kvote.pakke], [7, 5, 'gratis']);
      assert.equal(liste.prosjekter.length, 7);
      for (const p of liste.prosjekter) {
        const apnet = await k.konto('prosjekt', { sok: `&id=${p.id}` });
        assert.equal(apnet.status, 200);
        assert.equal(apnet.data.prosjekt.dokument.navn, p.navn);
      }
      const forste = liste.prosjekter[0];
      assert.equal((await lagre(k, 'Fortsatt mitt', { felt: { id: forste.id, revisjon: 1 } })).status, 200);
      assert.equal((await lagre(k, 'Nytt over kvoten')).status, 403);
    } finally {
      medTjenester((t) => t);
    }
  });

  test('CSV: gratisperioden åpner for alle; uten den krever CSV en pakke som har CSV', async () => {
    medTjenester((t) => ({
      ...t,
      planer: { ...t.planer, testpakke: { navn: 'Testpakke', prosjekter: 8, tjenester: ['csv'] } },
    }));
    try {
      const gratis = klient();
      await nyttMedlem(gratis, s.rot, 'gratis-csv@example.no');
      const betaler = klient();
      const m = await nyttMedlem(betaler, s.rot, 'betaler-csv@example.no');
      sql(
        s.rot,
        "UPDATE dp_medlemmer SET plan = 'testpakke', betaling_status = 'aktiv', betalt_til = '2999-01-01T00:00:00Z' WHERE id = ?",
        [m.id],
      );
      const csv = async (k) => (await k.konto('meg')).data.medlem.tilganger.csv;
      assert.equal((await csv(gratis)).tilgang, true);
      assert.equal((await csv(betaler)).tilgang, true);

      // the free period removed: what the shop will do once payment is ready
      medTjenester((t) => {
        delete t.tjenester.csv.gratisperiode;
        return {
          ...t,
          planer: { ...t.planer, testpakke: { navn: 'Testpakke', prosjekter: 8, tjenester: ['csv'] } },
        };
      });
      const stengt = await csv(gratis);
      assert.equal(stengt.tilgang, false);
      assert.match(stengt.grunn, /betalt pakke/);
      assert.equal((await csv(betaler)).tilgang, true);
    } finally {
      medTjenester((t) => t);
    }
  });

  test('suspendert konto når ikke prosjektene; sletting fjerner dem', async () => {
    const k = klient();
    const m = await nyttMedlem(k, s.rot, 'borte@example.no');
    await lagre(k, 'Forsvinner');
    sql(s.rot, "UPDATE dp_medlemmer SET status = 'suspendert', aktiv = 0 WHERE id = ?", [m.id]);
    assert.equal((await k.konto('prosjekter')).status, 401);
    sql(s.rot, "UPDATE dp_medlemmer SET status = 'aktiv', aktiv = 1 WHERE id = ?", [m.id]);
    nullstillGrenser(s.rot);
    assert.equal((await k.konto('slett-konto', { kropp: { passord: 'et-langt-passord' } })).status, 200);
    assert.equal(sql(s.rot, 'SELECT COUNT(*) AS n FROM dp_prosjekter WHERE medlem_id = ?', [m.id])[0].n, 0);
  });
});
