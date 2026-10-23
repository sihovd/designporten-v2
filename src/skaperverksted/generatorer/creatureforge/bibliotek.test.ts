import { byggCreature } from './bygg';
import { boksFor, delrekkefolge, feltFor, grunnformer, snappunkterFor, type Deltype } from './grunnformer';
import { antallBiter, tetthet } from './kontroll';
import { KJEDELEDD_PROVE, mekanisme, toleranser } from './ledd';
import { lagRutenett, marsjer } from './marsj';
import { tomtProsjekt, valider, type CfParametre } from './parametre';
import { koble, ledigeFor, leggTilRot, plasser } from './plassering';
import { utvid } from './sdf';
import { partner, partnerLedd, speiletFeste, speilLeddendring } from './symmetri';
import { lengde, prikk } from './vektor';

const profil = { id: KJEDELEDD_PROVE.id, versjon: KJEDELEDD_PROVE.versjon };

/** Head, upper body, hip, two arms and hands, two legs and feet, and a tail of two segments. */
function helFigur(): { p: CfParametre; ids: Record<string, string> } {
  const r = leggTilRot(tomtProsjekt(profil), 'hode');
  if (!r.ok) throw new Error(r.grunn);
  let p = r.p;
  const ids: Record<string, string> = { hode: r.id };
  const fest = (navn: string, type: Deltype, forelder: string, punkt: string, variant?: string) => {
    const k = koble(p, type, { del: ids[forelder]!, punkt }, variant);
    if (!k.ok) throw new Error(k.grunn);
    p = k.p;
    ids[navn] = k.id;
  };
  fest('kropp', 'overkropp', 'hode', 'hals');
  fest('hofte', 'hofte', 'kropp', 'midje');
  fest('armV', 'arm', 'kropp', 'skulder-v');
  fest('armH', 'arm', 'kropp', 'skulder-h');
  fest('handV', 'haand', 'armV', 'handledd');
  fest('handH', 'haand', 'armH', 'handledd');
  fest('benV', 'ben', 'hofte', 'hofte-v');
  fest('benH', 'ben', 'hofte', 'hofte-h');
  fest('fotV', 'fot', 'benV', 'ankel');
  fest('fotH', 'fot', 'benH', 'ankel');
  fest('hale1', 'hale', 'hofte', 'hale');
  fest('hale2', 'hale', 'hale1', 'hale-ende', 'spiss');
  return { p, ids };
}

describe('Creature Forge: kroppsbiblioteket', () => {
  test('hver grunnform og variant er en lukket form med snappunkter på overflaten', () => {
    for (const type of delrekkefolge) {
      const g = grunnformer[type];
      for (const v of g.varianter) {
        const d = { type, variant: v.id, lengde: g.lengde.standard, tykkelse: g.tykkelse.standard };
        const f = feltFor(d);
        const m = marsjer(lagRutenett(utvid(boksFor(d), 1), 0.6, 300_000), f);
        expect(tetthet(m).lukket, `${type}/${v.id}`).toBe(true);
        expect(antallBiter(m), `${type}/${v.id}`).toBe(1);
        for (const s of snappunkterFor(d)) {
          expect(Math.abs(f(...s.posisjon)), `${type}/${v.id}/${s.id}`).toBeLessThan(0.01);
          expect(lengde(s.normal)).toBeCloseTo(1, 9);
          expect(prikk(s.normal, s.opp)).toBeCloseTo(0, 9);
        }
      }
    }
  });

  test('bare haleleddet bærer et nytt haleledd, og en ukjent form avvises', () => {
    const hale = grunnformer.hale;
    const ids = (variant: string) =>
      snappunkterFor({
        type: 'hale',
        variant,
        lengde: hale.lengde.standard,
        tykkelse: hale.tykkelse.standard,
      }).map((s) => s.id);
    expect(ids('ledd')).toEqual(['hale', 'hale-ende']);
    expect(ids('spiss')).toEqual(['hale']);
    const { p, ids: deler } = helFigur();
    const tilSpiss = {
      ...p,
      deler: p.deler.map((d) => (d.id === deler.hale1 ? { ...d, variant: 'spiss' } : d)),
    };
    expect(valider(tilSpiss).ok).toBe(false);
    expect(
      valider({ ...p, deler: p.deler.map((d, i) => (i === 0 ? { ...d, variant: 'firkant' } : d)) }).ok,
    ).toBe(false);
  });

  test('delene får bare punkter som passer', () => {
    const { p, ids } = helFigur();
    const tom = koble(p, 'arm', { del: ids.kropp!, punkt: 'midje' });
    expect(tom.ok).toBe(false);
    const a = leggTilRot(tomtProsjekt(profil), 'hode');
    if (!a.ok) throw new Error();
    const b = koble(a.p, 'overkropp', { del: a.id, punkt: 'hals' });
    if (!b.ok) throw new Error();
    expect(ledigeFor(b.p, 'arm').map((l) => l.forelder.punkt)).toEqual(['skulder-v', 'skulder-h']);
    expect(ledigeFor(b.p, 'ben')).toEqual([]);
    expect(ledigeFor(b.p, 'hofte').map((l) => l.forelder.punkt)).toEqual(['midje']);
  });

  test('sidedeler får sidenavn', () => {
    const { p, ids } = helFigur();
    const navn = (id: string) => p.deler.find((d) => d.id === id)!.navn;
    expect(navn(ids.armV!)).toBe('Venstre arm');
    expect(navn(ids.armH!)).toBe('Høyre arm');
    expect(navn(ids.handH!)).toBe('Høyre hånd');
    expect(navn(ids.hale2!)).toBe('Hale 2');
  });

  test('en liten mekanisme holder fortsatt med prøveprofilen', () => {
    const tol = toleranser(tomtProsjekt(profil), KJEDELEDD_PROVE);
    for (const m of ['kjede', 'knott'] as const)
      expect(mekanisme(m, KJEDELEDD_PROVE, tol, 0.5).fangst).toBeGreaterThanOrEqual(
        KJEDELEDD_PROVE.maal.minFang.verdi + 0.3 - 1e-9,
      );
  });
});

describe('Creature Forge: symmetri', () => {
  test('partneren er delen på samme sted på den andre siden', () => {
    const { p, ids } = helFigur();
    expect(partner(p, ids.armV!)).toBe(ids.armH);
    expect(partner(p, ids.handH!)).toBe(ids.handV);
    expect(partner(p, ids.fotV!)).toBe(ids.fotH);
    expect(partner(p, ids.kropp!)).toBeNull();
    expect(partner(p, ids.hale1!)).toBeNull();
    expect(speiletFeste(p, { del: ids.armV!, punkt: 'handledd' })).toEqual({
      del: ids.armH,
      punkt: 'handledd',
    });
    expect(partnerLedd(p, p.ledd.find((l) => l.barn.del === ids.benV)!.id)?.barn.del).toBe(ids.benH);
  });

  test('speilede leddverdier gir et speilbilde om midtplanet', () => {
    const { p, ids } = helFigur();
    const venstre = p.ledd.find((l) => l.barn.del === ids.armV)!;
    const hoyre = p.ledd.find((l) => l.barn.del === ids.armH)!;
    const endring = {
      forskyvning: [1, 2, -3] as [number, number, number],
      rotasjon: [10, 25, -30] as [number, number, number],
    };
    const q = {
      ...p,
      ledd: p.ledd.map((l) =>
        l.id === venstre.id
          ? { ...l, ...endring }
          : l.id === hoyre.id
            ? { ...l, ...speilLeddendring(endring) }
            : l,
      ),
    };
    const o = plasser(q);
    const par: [string, string][] = [
      [ids.armV!, ids.armH!],
      [ids.handV!, ids.handH!],
    ];
    for (const [v, h] of par) {
      const a = o.deler.get(v)!.t,
        b = o.deler.get(h)!.t;
      expect(b[0]).toBeCloseTo(-a[0], 6);
      expect(b[1]).toBeCloseTo(a[1], 6);
      expect(b[2]).toBeCloseTo(a[2], 6);
    }
  });
});

describe('Creature Forge: hel figur', () => {
  const { p } = helFigur();
  const r = byggCreature(p);

  test('alle 13 delene bygges tette og hele, uten røde funn', () => {
    expect(r.deler).toHaveLength(13);
    for (const d of r.deler) {
      expect(tetthet(d.mesh).lukket, d.navn).toBe(true);
      expect(antallBiter(d.mesh), d.navn).toBe(1);
    }
    expect(r.funn.filter((f) => f.niva === 'feil').map((f) => f.tittel)).toEqual([]);
  }, 120_000);

  test('å flytte hele figuren gir samme kontroll (delene hentes fra lageret)', () => {
    const rot = p.deler[0]!;
    const flyttet = byggCreature({ ...p, deler: [{ ...rot, posisjon: [30, -10, 70] }, ...p.deler.slice(1)] });
    expect(flyttet.funn.map((f) => f.tittel)).toEqual(r.funn.map((f) => f.tittel));
    expect(flyttet.deler.map((d) => d.mesh.indekser.length)).toEqual(
      r.deler.map((d) => d.mesh.indekser.length),
    );
  }, 120_000);
});
