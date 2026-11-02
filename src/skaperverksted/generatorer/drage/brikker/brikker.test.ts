import { describe, expect, it } from 'vitest';
import { Arbeidsbenk } from '../../../core/arbeidsbenk';
import { fraJson, tilJson } from '../../../core/dokument';
import { sjekkManifold, volum } from '../../../geometri/mesh';
import type { Skall } from '../bibliotek';
import { endreDrage } from '../handlinger';
import { drageKjerne } from '../kjerne';
import { standardParametre } from '../parametre';
import { minsteAvstand } from '../testgeometri';
import { byggBrikker, instansFraDelId, lokaleSkall, plasserMesh } from './bygg';
import {
  bytt,
  byttKonsekvens,
  dupliser,
  finnInstans,
  flyttGruppe,
  gruppeFor,
  kanKoble,
  koble,
  kobleFra,
  leggTil,
  leggTilOgKoble,
  plasseringer,
  punktIVerden,
  punktramme,
  referansedrage,
  settVerdier,
  slett,
  type Resultat,
} from './graf';
import { brikkerFra, byttModus, endreBrikker, modusFor } from './handlinger';
import {
  definisjoner,
  finnDefinisjon,
  HENGSEL_M,
  lesBrikkeprosjekt,
  tomtBrikkeprosjekt,
  type Brikkeprosjekt,
  type Ende,
} from './modell';

function ok(r: Resultat): Extract<Resultat, { ok: true }> {
  if (!r.ok) throw new Error(r.grunn);
  return r;
}

/** Ids of the reference dragon in chain order: head, three bodies, tail. */
function kjede(p: Brikkeprosjekt): string[] {
  return p.instanser.map((i) => i.id);
}

function sjekkKoblingerMotes(p: Brikkeprosjekt): void {
  const W = plasseringer(p);
  for (const f of p.forbindelser) {
    const a = punktIVerden(p, f.a, W)!;
    const b = punktIVerden(p, f.b, W)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
    // outward directions opposed
    expect(Math.abs(Math.cos(a.v - b.v) + 1)).toBeLessThan(1e-9);
  }
}

describe('brikkegraf', () => {
  it('referansedragen har hode, tre kroppsledd og hale i én gruppe', () => {
    const p = referansedrage();
    expect(p.instanser.map((i) => i.definisjon.id)).toEqual([
      'hode-rundt',
      'kropp-avrundet',
      'kropp-avrundet',
      'kropp-avrundet',
      'hale-spade',
    ]);
    expect(p.forbindelser).toHaveLength(4);
    expect(p.grupper).toHaveLength(1);
    sjekkKoblingerMotes(p);
    // nose towards +X, every next piece further back
    const W = plasseringer(p);
    const x = kjede(p).map((id) => W.get(id)!.x);
    for (let i = 1; i < x.length; i++) expect(x[i]!).toBeLessThan(x[i - 1]!);
  });

  it('DF-01: en ny brikke kobles til et ledig punkt med riktig punkt og retning', () => {
    let p = referansedrage();
    const hale = kjede(p).at(-1)!;
    const forHale = kjede(p).at(-2)!;
    p = ok(slett(p, hale, 'behold')).p;
    const r = ok(leggTilOgKoble(p, 'haleledd', 'foran', { instans: forHale, punkt: 'bak' }));
    sjekkKoblingerMotes(r.p);
    expect(gruppeFor(r.p, r.ny!)!.id).toBe(gruppeFor(r.p, forHale)!.id);
    expect(r.p.grupper).toHaveLength(1);
  });

  it('DF-02: opptatte og inkompatible punkter gir ingen kobling, men en forklaring', () => {
    const p = referansedrage();
    const [hode, k1, k2, , hale] = kjede(p) as [string, string, string, string, string];
    const nytt = ok(leggTil(p, 'kropp-smal'));
    const ny = nytt.ny!;
    const forsok: [Ende, Ende, RegExp][] = [
      [{ instans: ny, punkt: 'foran' }, { instans: hode, punkt: 'bak' }, /allerede koblet/],
      [{ instans: ny, punkt: 'foran' }, { instans: hale, punkt: 'foran' }, /To tapper/],
      [{ instans: ny, punkt: 'bak' }, { instans: k1, punkt: 'bak' }, /To sokler|allerede koblet/],
      [{ instans: ny, punkt: 'foran' }, { instans: ny, punkt: 'bak' }, /seg selv/],
      [{ instans: k2, punkt: 'foran' }, { instans: hode, punkt: 'bak' }, /allerede koblet/],
      [{ instans: ny, punkt: 'midt' }, { instans: hode, punkt: 'bak' }, /finnes ikke/],
    ];
    for (const [a, b, grunn] of forsok) {
      expect(kanKoble(nytt.p, a, b)).toMatch(grunn);
      const r = koble(nytt.p, a, b);
      expect(r.ok).toBe(false);
    }
    // a closed loop inside one group is refused
    const loskoblet = ok(kobleFra(nytt.p, nytt.p.forbindelser.find((f) => f.a.instans === hale)!.id)).p;
    const sloyfe = koble(loskoblet, { instans: hale, punkt: 'foran' }, { instans: k1, punkt: 'bak' });
    expect(sloyfe.ok).toBe(false);
  });

  it('DF-14: koble fra beholder plasseringen, og koble til igjen gir samme drage', () => {
    const p = referansedrage();
    const W = plasseringer(p);
    const f = p.forbindelser[1]!;
    const fra = ok(kobleFra(p, f.id)).p;
    expect(fra.grupper).toHaveLength(2);
    expect(fra.forbindelser).toHaveLength(3);
    const W2 = plasseringer(fra);
    for (const [id, t] of W) {
      const u = W2.get(id)!;
      expect(u.x).toBeCloseTo(t.x, 6);
      expect(u.y).toBeCloseTo(t.y, 6);
    }
    const igjen = ok(koble(fra, f.a, f.b)).p;
    expect(igjen.grupper).toHaveLength(1);
    const W3 = plasseringer(igjen);
    for (const [id, t] of W) expect(W3.get(id)!.x).toBeCloseTo(t.x, 6);
  });

  it('flytter og snur hele gruppen uten at koblingene glir fra hverandre', () => {
    const p = referansedrage();
    const g = p.grupper[0]!;
    const r = ok(flyttGruppe(p, g.id, { x: 12, y: -30, vinkel: 90 })).p;
    sjekkKoblingerMotes(r);
    const W = plasseringer(r);
    expect(W.get(g.rot)!.x).toBeCloseTo(12);
    // turned 90°: the chain now runs along Y
    const ids = kjede(r);
    expect(Math.abs(W.get(ids[1]!)!.x - 12)).toBeLessThan(1e-6);
  });

  it('DF-05: bytte viser tapte koblinger før byttet og flytter aldri barn til tilfeldige punkter', () => {
    const p = referansedrage();
    const [hode, , k2, k3, hale] = kjede(p) as [string, string, string, string, string];
    // a compatible head keeps its connection
    const nyttHode = ok(bytt(p, hode, 'hode-langt')).p;
    expect(nyttHode.forbindelser).toHaveLength(4);
    sjekkKoblingerMotes(nyttHode);

    // a tail end in the middle has no rear socket: that connection is lost, and is shown first
    const k = byttKonsekvens(p, k2, 'hale-spiss');
    expect(k.beholdt).toHaveLength(1);
    expect(k.tapt).toHaveLength(1);
    expect(k.tapt[0]!.grunn).toMatch(/sokkel bak/);
    const W = plasseringer(p);
    const r = ok(bytt(p, k2, 'hale-spiss')).p;
    expect(r.forbindelser).toHaveLength(3);
    expect(r.grupper).toHaveLength(2);
    // what hung behind stays exactly where it lay
    const W2 = plasseringer(r);
    for (const id of [k3, hale]) {
      expect(W2.get(id)!.x).toBeCloseTo(W.get(id)!.x, 6);
      expect(W2.get(id)!.y).toBeCloseTo(W.get(id)!.y, 6);
    }
  });

  it('slett beholder eller sletter grenen bak brikken', () => {
    const p = referansedrage();
    const [, k1] = kjede(p) as [string, string];
    const behold = ok(slett(p, k1, 'behold')).p;
    expect(behold.instanser).toHaveLength(4);
    expect(behold.grupper).toHaveLength(2);
    const gren = ok(slett(p, k1, 'gren')).p;
    expect(gren.instanser).toHaveLength(1);
    expect(gren.forbindelser).toHaveLength(0);
  });

  it('DF-03 og DF-08: lokal bredde endrer bare én brikke og flytter ikke leddet', () => {
    const p = referansedrage();
    const [, , k2] = kjede(p) as [string, string, string];
    const r = ok(settVerdier(p, k2, { bredde: 1.3 })).p;
    for (const i of r.instanser) {
      const for_ = finnInstans(p, i.id)!;
      if (i.id === k2) expect(i.verdier.bredde).toBe(1.3);
      else expect(i.verdier).toEqual(for_.verdier);
    }
    const a = punktramme(finnInstans(p, k2)!, 'foran')!;
    const b = punktramme(finnInstans(r, k2)!, 'foran')!;
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(punktramme(finnInstans(r, k2)!, 'bak')!.x).toBeCloseTo(
      punktramme(finnInstans(p, k2)!, 'bak')!.x,
      9,
    );
    // the joint profile is the same
    expect(HENGSEL_M.mal.klaring).toBeGreaterThan(0.3);
  });

  it('dupliserer som en løs brikke med ny id', () => {
    const p = referansedrage();
    const r = ok(dupliser(p, kjede(p)[1]!));
    expect(r.ny).not.toBe(kjede(p)[1]);
    expect(r.p.grupper).toHaveLength(2);
    expect(new Set(r.p.instanser.map((i) => i.id)).size).toBe(6);
  });
});

describe('innlesing av brikkeprosjekt', () => {
  it('DF-07 / fase 1: et lagret prosjekt leses inn med samme brikker, koblinger og plassering', () => {
    let p = referansedrage();
    p = ok(settVerdier(p, kjede(p)[2]!, { bredde: 1.2, pigger: 'plater' })).p;
    p = ok(kobleFra(p, p.forbindelser[3]!.id)).p;
    p = ok(flyttGruppe(p, p.grupper[1]!.id, { x: 5, y: -40, vinkel: -30 })).p;
    const tilbake = lesBrikkeprosjekt(JSON.parse(JSON.stringify(p)));
    expect(tilbake.problemer).toEqual([]);
    expect(tilbake.prosjekt).toEqual(p);
  });

  it('reparerer ugyldige koblinger i stedet for å godta dem', () => {
    const p = referansedrage();
    const [hode, k1, k2] = kjede(p) as [string, string, string];
    const raa = JSON.parse(JSON.stringify(p)) as Brikkeprosjekt;
    raa.forbindelser.push(
      { ...raa.forbindelser[0]!, id: 'dobbel' },
      { ...raa.forbindelser[0]!, id: 'borte', a: { instans: 'finnes-ikke', punkt: 'foran' } },
      {
        ...raa.forbindelser[0]!,
        id: 'tapper',
        a: { instans: k1, punkt: 'foran' },
        b: { instans: k2, punkt: 'foran' },
      },
    );
    raa.grupper.push({ id: 'ekstra', rot: hode, plassering: { x: 0, y: 0, vinkel: 0 } });
    const r = lesBrikkeprosjekt(raa);
    expect(r.prosjekt.forbindelser.map((f) => f.id)).toEqual(p.forbindelser.map((f) => f.id));
    expect(r.prosjekt.grupper).toHaveLength(1);
    expect(r.problemer.length).toBeGreaterThanOrEqual(2);
  });

  it('beholder en ukjent definisjonsversjon og sier fra i stedet for å bytte den ut', () => {
    const p = referansedrage();
    const raa = JSON.parse(JSON.stringify(p)) as Brikkeprosjekt;
    raa.instanser[4]!.definisjon.versjon = 99;
    const r = lesBrikkeprosjekt(raa);
    expect(r.prosjekt.instanser[4]!.definisjon).toEqual({ id: 'hale-spade', versjon: 99 });
    expect(r.problemer.join(' ')).toMatch(/ukjent/);
    const bygd = byggBrikker(r.prosjekt, standardParametre, r.problemer);
    expect(bygd.deler.some((d) => instansFraDelId(d.id) === r.prosjekt.instanser[4]!.id)).toBe(false);
    expect(bygd.advarsler.some((a) => /ukjent/.test(a.tekst))).toBe(true);
  });

  it('tåler søppel', () => {
    for (const x of [null, 3, 'tekst', { instanser: 'nei' }, { instanser: [{}], forbindelser: [null] }])
      expect(lesBrikkeprosjekt(x).prosjekt.instanser).toEqual([]);
  });
});

describe('brikkegeometri', () => {
  it('hver brikke består av lukkede skall som vender utover og ligger på platen', () => {
    for (const def of definisjoner) {
      for (const v of [
        {},
        { bredde: 1.4, pigger: 'plater' as const, horn: 'lange' as const },
        { bredde: 0.8 },
      ]) {
        for (const s of lokaleSkall(def, v)) {
          expect(sjekkManifold(s.mesh), `${def.id} ${s.type}`).toEqual({
            lukket: true,
            aapneKanter: 0,
            feilKanter: 0,
          });
          expect(volum(s.mesh)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('naboer som kobles har leddets klaring i utskriftsstillingen', () => {
    const par: [string, string, Record<string, unknown>?][] = [
      ['hode-rundt', 'kropp-avrundet'],
      ['hode-langt', 'kropp-smal'],
      ['hode-bredt', 'haleledd'],
      ['kropp-avrundet', 'kropp-avrundet', { bredde: 1.4, pigger: 'plater' }],
      ['kropp-avrundet', 'kropp-smal'],
      ['kropp-smal', 'kropp-avrundet', { bredde: 0.8 }],
      ['kropp-avrundet', 'haleledd'],
      ['haleledd', 'hale-spade'],
      ['kropp-avrundet', 'hale-kolle'],
      ['kropp-smal', 'hale-spiss'],
    ];
    const klaring = HENGSEL_M.mal.klaring;
    for (const [foran, bak, verdier] of par) {
      let p = ok(leggTil(tomtBrikkeprosjekt(), foran, { x: 0, y: 0, vinkel: 0 }, verdier as never)).p;
      const fremre = p.instanser[0]!.id;
      p = ok(leggTilOgKoble(p, bak, 'foran', { instans: fremre, punkt: 'bak' })).p;
      const W = plasseringer(p);
      const skall = p.instanser.map((i) =>
        lokaleSkall(finnDefinisjon(i.definisjon.id)!, i.verdier).map((s): Skall => ({
          ...s,
          mesh: plasserMesh(s.mesh, W.get(i.id)!),
        })),
      );
      const r = minsteAvstand(skall[0]!, skall[1]!, klaring * 2);
      expect(r.inni, `${foran} → ${bak} overlapper`).toBe(false);
      expect(r.avstand, `klaring ${foran} → ${bak}`).toBeGreaterThanOrEqual(klaring * 0.95);
    }
  }, 120_000);

  it('bygger én del per brikke og farge, uten feil for referansedragen', () => {
    const p = referansedrage();
    const r = byggBrikker(p, standardParametre);
    expect(new Set(r.deler.map((d) => instansFraDelId(d.id))).size).toBe(5);
    expect(r.advarsler.filter((a) => a.niva === 'feil')).toEqual([]);
    expect(r.advarsler.some((a) => /prøveprofil/.test(a.tekst))).toBe(true);
    expect(
      JSON.stringify(byggBrikker(p, standardParametre).deler.map((d) => [...d.mesh.posisjoner].slice(0, 30))),
    ).toBe(JSON.stringify(r.deler.map((d) => [...d.mesh.posisjoner].slice(0, 30))));
  });

  it('DF-11: brikker som overlapper uten å være koblet gir et rødt funn', () => {
    let p = ok(leggTil(tomtBrikkeprosjekt(), 'kropp-avrundet', { x: 0, y: 0, vinkel: 0 })).p;
    p = ok(leggTil(p, 'kropp-smal', { x: 3, y: 2, vinkel: 20 })).p;
    const r = byggBrikker(p, standardParametre);
    expect(r.advarsler.some((a) => a.niva === 'feil' && /overlapper/.test(a.tekst))).toBe(true);
    const ok2 = byggBrikker(ok(leggTil(tomtBrikkeprosjekt(), 'kropp-avrundet')).p, standardParametre);
    expect(ok2.advarsler.some((a) => a.niva === 'feil')).toBe(false);
  });
});

describe('brikkemodus i Dragon Forge', () => {
  it('åpner brikkebyggeren, angrer tilbake og beholder begge modusene', async () => {
    const benk = new Arbeidsbenk(
      { ...drageKjerne, ui: { Inspektor: () => null } },
      drageKjerne.nyttDokument(),
    );
    expect(modusFor(benk.dok.parametre)).toBe('klassisk');
    byttModus(benk, 'brikker');
    expect(modusFor(benk.dok.parametre)).toBe('brikker');
    expect(brikkerFra(benk.dok.parametre).prosjekt.instanser).toHaveLength(5);
    const m = await benk.bygg();
    expect(m.deler.every((d) => d.id.startsWith('brikke:'))).toBe(true);

    // a classic colour change keeps the bricks
    endreDrage(benk, 'Farge', (p) => ({ ...p, farger: { ...p.farger, kropp: 'matt-sand' } }));
    expect(brikkerFra(benk.dok.parametre).prosjekt.instanser).toHaveLength(5);

    // one operation is one undo step
    const p = brikkerFra(benk.dok.parametre).prosjekt;
    endreBrikker(benk, (q) => kobleFra(q, q.forbindelser[0]!.id));
    expect(brikkerFra(benk.dok.parametre).prosjekt.grupper).toHaveLength(2);
    benk.angre();
    expect(brikkerFra(benk.dok.parametre).prosjekt).toEqual(p);

    // a refused operation makes no step
    const steg = benk.historikk.trinn.angre.length;
    endreBrikker(benk, (q) => koble(q, q.forbindelser[0]!.a, q.forbindelser[0]!.b));
    expect(benk.historikk.trinn.angre.length).toBe(steg);
    expect(benk.tilstand.melding).toMatch(/allerede koblet/);

    benk.angre();
    benk.angre();
    expect(modusFor(benk.dok.parametre)).toBe('klassisk');
    benk.avslutt();
  });

  it('lagret prosjekt åpnes igjen med samme brikker og plassering', () => {
    const benk = new Arbeidsbenk(
      { ...drageKjerne, ui: { Inspektor: () => null } },
      drageKjerne.nyttDokument(),
    );
    byttModus(benk, 'brikker');
    endreBrikker(benk, (q) => flyttGruppe(q, q.grupper[0]!.id, { x: 4, y: 10, vinkel: 15 }));
    const fil = tilJson(benk.dok);
    const ny = new Arbeidsbenk({ ...drageKjerne, ui: { Inspektor: () => null } }, drageKjerne.nyttDokument());
    ny.lastInn(fraJson(fil));
    expect(brikkerFra(ny.dok.parametre).prosjekt).toEqual(brikkerFra(benk.dok.parametre).prosjekt);
    expect(ny.dok.parametre.modus).toBe('brikker');
    benk.avslutt();
    ny.avslutt();
  });

  it('eksport er sperret ved rødt funn og har én STL per brikke ellers', async () => {
    const dok = drageKjerne.nyttDokument();
    const medBrikker = {
      ...dok,
      parametre: { ...dok.parametre, modus: 'brikker', brikker: referansedrage() },
    };
    const m = await drageKjerne.byggModell(medBrikker);
    const regler = drageKjerne.eksport!(medBrikker, m);
    expect(regler.sperret).toBeUndefined();
    expect(regler.stlPerDel).toBe(true);
    let p = ok(leggTil(tomtBrikkeprosjekt(), 'kropp-avrundet', { x: 0, y: 0, vinkel: 0 })).p;
    p = ok(leggTil(p, 'kropp-avrundet', { x: 1, y: 0, vinkel: 0 })).p;
    const feil = { ...dok, parametre: { ...dok.parametre, modus: 'brikker', brikker: p } };
    expect(drageKjerne.eksport!(feil, await drageKjerne.byggModell(feil)).sperret).toMatch(/overlapper/);
    // classic dragons keep the shared default
    expect(drageKjerne.eksport!(dok, await drageKjerne.byggModell(dok))).toEqual({});
  });
});
