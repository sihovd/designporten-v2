import { volum } from '../../geometri/mesh';
import { byggCreature, type CfResultat } from './bygg';
import { antallBiter, tetthet } from './kontroll';
import { kuppelFelt, kuppelSenter } from './kuppel';
import {
  KJEDELEDD_PROVE,
  KJEDELEDD_PROVE_2,
  mekanisme,
  STANDARDPROFIL,
  STIFTLEDD_PROVE,
  toleranser,
} from './ledd';
import { lagRutenett, marsjer } from './marsj';
import { tomtProsjekt, valider, type CfParametre, type Ledd } from './parametre';
import { finnPunkt, koble, krumning, leddTil, ledigeFor, leggTilRot, plasser, slett } from './plassering';
import { kule } from './sdf';
import { pluss, skaler, type V3 } from './vektor';

const profil = { id: KJEDELEDD_PROVE.id, versjon: KJEDELEDD_PROVE.versjon };

function figur(): CfParametre {
  const a = leggTilRot(tomtProsjekt(profil), 'hode');
  if (!a.ok) throw new Error(a.grunn);
  const b = koble(a.p, 'overkropp', { del: a.id, punkt: 'hals' });
  if (!b.ok) throw new Error(b.grunn);
  return b.p;
}

const medLedd = (p: CfParametre, endring: Partial<Ledd>): CfParametre => ({
  ...p,
  ledd: p.ledd.map((l) => ({ ...l, ...endring, kuppel: { ...l.kuppel, ...(endring.kuppel ?? {}) } })),
});

const regler = (r: CfResultat, niva: 'feil' | 'advarsel' | 'info') =>
  r.funn.filter((f) => f.niva === niva).map((f) => f.regel);

describe('Creature Forge: prosjekt og hierarki', () => {
  test('et tomt prosjekt og en figur er gyldige', () => {
    expect(valider(tomtProsjekt(profil)).ok).toBe(true);
    expect(valider(figur()).ok).toBe(true);
  });

  test('avviser to røtter, ukjente snappunkter og ledd som ikke passer', () => {
    const p = figur();
    const [hode, kropp] = p.deler;
    expect(valider({ ...p, ledd: [] }).ok).toBe(false);
    expect(valider(medLedd(p, { forelder: { del: hode!.id, punkt: 'finnes-ikke' } })).ok).toBe(false);
    // a part cannot hang on itself, and the sides must differ
    expect(valider(medLedd(p, { forelder: { del: kropp!.id, punkt: 'hofte' } })).ok).toBe(false);
    expect(valider({ ...p, deler: [{ ...hode!, lengde: 500 }, kropp!] }).ok).toBe(false);
  });

  test('en del fester seg bare på et ledig snappunkt som passer, med et ledd', () => {
    const a = leggTilRot(tomtProsjekt(profil), 'hode');
    if (!a.ok) throw new Error();
    expect(ledigeFor(a.p, 'overkropp').map((l) => l.forelder.punkt)).toEqual(['hals']);
    expect(ledigeFor(a.p, 'hode')).toEqual([]);
    const b = koble(a.p, 'overkropp', { del: a.id, punkt: 'hals' });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.p.ledd).toHaveLength(1);
    expect(b.p.ledd[0]!.barn).toEqual({ del: b.id, punkt: 'hals' });
    // the neck is taken now
    expect(ledigeFor(b.p, 'overkropp')).toEqual([]);
    expect(koble(b.p, 'overkropp', { del: a.id, punkt: 'hals' }).ok).toBe(false);
    expect(koble(a.p, 'overkropp', { del: a.id, punkt: 'nese' }).ok).toBe(false);
  });

  test('barnet henger under hodet og følger når hodet flyttes eller roteres', () => {
    const p = figur();
    const [hode, kropp] = p.deler;
    const o = plasser(p);
    const ph = o.deler.get(hode!.id)!,
      pk = o.deler.get(kropp!.id)!;
    // head bottom at 61 − 17; the upper body sinks 4 mm into it and is 48 mm long
    expect(pk.t[2]).toBeCloseTo(61 - 17 + 4 - 24, 6);
    expect(ph.t[2] - pk.t[2]).toBeCloseTo(17 + 24 - 4, 6);
    const flyttet = plasser({ ...p, deler: [{ ...hode!, posisjon: [10, -5, 61] }, kropp!] });
    expect(flyttet.deler.get(kropp!.id)!.t).toEqual(
      pluss(pk.t, [10, -5, 0]).map((v) => expect.closeTo(v, 6)),
    );
    const dreid = plasser({ ...p, deler: [{ ...hode!, rotasjon: [0, 90, 0] }, kropp!] });
    const t = dreid.deler.get(kropp!.id)!.t;
    // turned 90° about Y, the upper body hangs out to the side (−X) at the head's height
    expect(t[0]).toBeCloseTo(-(17 + 24 - 4), 6);
    expect(t[2]).toBeCloseTo(61, 6);
  });

  test('sletting tar med det som henger under', () => {
    const p = figur();
    expect(slett(p, p.deler[0]!.id).deler).toEqual([]);
    const uten = slett(p, p.deler[1]!.id);
    expect(uten.deler).toHaveLength(1);
    expect(uten.ledd).toEqual([]);
    expect(leddTil(uten, p.deler[0]!.id)).toBeUndefined();
  });
});

describe('Creature Forge: kuppelen', () => {
  const k = { diameter: 24, dybde: 0, helning: 0, retning: 0, tykkelseSenter: 6, tykkelseKant: 2 };

  test('tykkelsen i sentrum og i kanten styres hver for seg', () => {
    const f = kuppelFelt(k);
    expect(f(2.9, 0, 0)).toBeLessThan(0);
    expect(f(3.1, 0, 0)).toBeGreaterThan(0);
    // near the rim (radius 11.5 of 12) the cut is about 2.2 mm thick
    const halv = (6 + (2 - 6) * (11.5 / 12)) / 2;
    expect(f(halv - 0.1, 11.5, 0)).toBeLessThan(0);
    expect(f(halv + 0.1, 11.5, 0)).toBeGreaterThan(0);
    const tynnKant = kuppelFelt({ ...k, tykkelseKant: 0.5 });
    expect(tynnKant(2.9, 0, 0)).toBeLessThan(0);
    expect(tynnKant(halv - 0.1, 11.5, 0)).toBeGreaterThan(0);
  });

  test('dybden løfter kanten mot foreldredelen, toppen ligger i leddpunktet', () => {
    const f = kuppelFelt({ ...k, dybde: 4, tykkelseSenter: 1, tykkelseKant: 1 });
    expect(f(0, 0, 0)).toBeLessThan(0);
    expect(f(1, 0, 0)).toBeGreaterThan(0);
    // the rim lies 4 mm towards the parent (−t)
    expect(f(-4, 11.9, 0)).toBeLessThan(0);
    expect(f(0, 11.9, 0)).toBeGreaterThan(0);
  });

  test('vinkel og orientering dreier kuppelen', () => {
    const rett = kuppelFelt({ ...k, tykkelseSenter: 1, tykkelseKant: 1 });
    const skra = kuppelFelt({ ...k, tykkelseSenter: 1, tykkelseKant: 1, helning: 30 });
    // tilted 30° towards up (v), a point on the tilted disc is in the cut only for the tilted dome
    const p: V3 = skaler([-Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6)], 8);
    expect(skra(...p)).toBeLessThan(0);
    expect(rett(...p)).toBeGreaterThan(0);
    const mot = kuppelFelt({ ...k, tykkelseSenter: 1, tykkelseKant: 1, helning: 30, retning: 90 });
    expect(mot(...p)).toBeGreaterThan(0);
  });

  test('kuppelen er et lukket volum', () => {
    const m = marsjer(lagRutenett({ min: [-20, -20, -20], maks: [20, 20, 20] }, 0.5, 600_000), kuppelFelt(k));
    expect(tetthet(m).lukket).toBe(true);
    expect(volum(m)).toBeGreaterThan(0);
  });
});

describe('Creature Forge: mekanismene', () => {
  test('hetten og knotten er fanget med prøveprofilen', () => {
    const tol = toleranser(tomtProsjekt(profil), KJEDELEDD_PROVE);
    for (const m of ['kjede', 'knott'] as const)
      expect(mekanisme(m, KJEDELEDD_PROVE, tol).fangst).toBeGreaterThanOrEqual(
        KJEDELEDD_PROVE.maal.minFang.verdi,
      );
  });

  test('en kule gir et lukket mesh med marsjeringen', () => {
    const m = marsjer(lagRutenett({ min: [-5, -5, -5], maks: [5, 5, 5] }, 0.4, 200_000), kule(4));
    expect(tetthet(m).lukket).toBe(true);
    expect(antallBiter(m)).toBe(1);
    expect(Math.abs(volum(m) / ((4 / 3) * Math.PI * 64) - 1)).toBeLessThan(0.03);
  });
});

describe('Creature Forge: bygget figur', () => {
  const p = figur();
  const r = byggCreature(p);

  test('hver del er tett og i ett stykke, og delene holder klaringen', () => {
    expect(r.deler).toHaveLength(2);
    for (const d of r.deler) {
      expect(tetthet(d.mesh).lukket).toBe(true);
      expect(antallBiter(d.mesh)).toBe(1);
    }
    expect(regler(r, 'feil')).toEqual([]);
    expect(regler(r, 'info')).toContain('CF-KLAR-01');
    expect(r.status).not.toBe('rod');
  }, 60_000);

  test('eksporten ligger i printposisjon på platen', () => {
    let minZ = Infinity;
    for (const d of r.deler)
      for (let i = 2; i < d.mesh.posisjoner.length; i += 3) minZ = Math.min(minZ, d.mesh.posisjoner[i]!);
    expect(minZ).toBeCloseTo(0, 5);
    expect(r.utskrift?.R).toEqual([1, 0, 0, 0, 0, 1, 0, -1, 0]);
  });

  test('knottleddet bygges også uten feil', () => {
    const k = byggCreature(medLedd(p, { mekanisme: 'knott' }));
    expect(regler(k, 'feil')).toEqual([]);
  }, 60_000);

  test('en tykkere kuppel skjærer mer av begge delene', () => {
    const tykk = byggCreature(medLedd(p, { kuppel: { ...p.ledd[0]!.kuppel, tykkelseSenter: 9 } }));
    for (let i = 0; i < 2; i++) expect(volum(tykk.deler[i]!.mesh)).toBeLessThan(volum(r.deler[i]!.mesh) - 1);
  }, 60_000);

  test('overlapp og for stor klaring i mekanismen blir røde funn', () => {
    const inni = byggCreature(
      medLedd(p, { avstand: -14, kuppel: { ...p.ledd[0]!.kuppel, tykkelseSenter: 1 } }),
    );
    expect(regler(inni, 'feil')).toContain('CF-KLAR-01');
    const los = byggCreature({ ...p, toleranser: { klaring: 1.2, spillerom: 1.5 } });
    expect(regler(los, 'feil')).toContain('CF-FANG-01');
  }, 60_000);

  test('et ugyldig prosjekt bygges ikke', () => {
    const u = byggCreature({ skjema: 'feil' });
    expect(u.deler).toEqual([]);
    expect(regler(u, 'feil')).toEqual(['CF-PROSJEKT-01']);
  });
});

describe('Creature Forge: dreiepunkt i kuppelen (profil 0.2.0)', () => {
  const profil2 = { id: KJEDELEDD_PROVE_2.id, versjon: KJEDELEDD_PROVE_2.versjon };
  const figur2 = (): CfParametre => {
    const a = leggTilRot(tomtProsjekt(profil2), 'hode');
    if (!a.ok) throw new Error(a.grunn);
    const b = koble(a.p, 'overkropp', { del: a.id, punkt: 'hals' });
    if (!b.ok) throw new Error(b.grunn);
    return b.p;
  };

  test('krumningen måles på formen', () => {
    const p = figur2();
    const hode = p.deler[0]!;
    // an ellipsoid 36 wide and 34 tall curves with radius 18² / 17 at its bottom
    expect(krumning(hode, finnPunkt(hode, 'hals')!)).toBeCloseTo(18 ** 2 / 17, 0);
  });

  test('delene står et gap fra hverandre og kuppelen er et kuleskall rundt hodets krumningssenter', () => {
    const p = figur2();
    const l = p.ledd[0]!;
    expect(l.avstand).toBeCloseTo(1, 6);
    const senter = kuppelSenter(l.kuppel)!;
    // the centre lies 19 mm plus half the gap behind the joint point, inside the head
    expect(-senter[0]).toBeCloseTo(18 ** 2 / 17 + 0.5, 0);
    expect(l.kuppel.tykkelseSenter).toBeLessThan(l.avstand);
  });

  test('grunnoppsettet svinger ±60° uten funn, med begge mekanismene', () => {
    const p = figur2();
    for (const mekanisme of ['kjede', 'knott'] as const) {
      const r = byggCreature(medLedd(p, { mekanisme }));
      expect(r.funn.filter((f) => f.niva !== 'info').map((f) => f.tittel)).toEqual([]);
      expect(r.ledd[0]!.sving).toEqual({ pluss: 60, minus: 60, maal: 60 });
      for (const d of r.deler) {
        expect(tetthet(d.mesh).lukket).toBe(true);
        expect(antallBiter(d.mesh)).toBe(1);
      }
    }
  }, 120_000);

  test('prosjekter med profil 0.1.0 bygges som før', () => {
    const r = byggCreature(figur());
    expect(r.profil?.versjon).toBe('0.1.0');
    expect(r.ledd[0]!.sving.maal).toBe(35);
  }, 60_000);
});

describe('Creature Forge: stiftledd (stiftledd-prove 0.1.0)', () => {
  const figur3 = (): CfParametre => {
    const a = leggTilRot(tomtProsjekt({ id: STANDARDPROFIL.id, versjon: STANDARDPROFIL.versjon }), 'hode');
    if (!a.ok) throw new Error(a.grunn);
    const b = koble(a.p, 'overkropp', { del: a.id, punkt: 'hals' });
    if (!b.ok) throw new Error(b.grunn);
    return b.p;
  };

  test('nye prosjekter får stiftleddet, og kuppelen er et hulrom i begge delene', () => {
    expect(STANDARDPROFIL).toBe(STIFTLEDD_PROVE);
    const l = figur3().ledd[0]!;
    expect(l.mekanisme).toBe('stifter');
    expect(l.avstand).toBeCloseTo(1, 6);
    // thick in the middle for the staples, thin at the rim, and reaching the sides of the upper body
    expect(l.kuppel.tykkelseSenter).toBeGreaterThan(10);
    expect(l.kuppel.tykkelseKant).toBeLessThan(l.kuppel.tykkelseSenter / 4);
    expect(l.kuppel.diameter).toBe(34);
  });

  test('stiftene er hektet i hverandre, én i hver del, med klaring', () => {
    const tol = toleranser(figur3(), STIFTLEDD_PROVE);
    const m = mekanisme('stifter', STIFTLEDD_PROVE, tol, 6);
    const luft = tol.klaring + tol.spillerom;
    // each crossbar lies in the other staple's loop
    expect(m.forelderPluss(0.5, 0, 0)).toBeGreaterThan(0);
    expect(m.barnPluss(-2, 0, 0)).toBeLessThan(0);
    expect(m.forelderPluss(2, 0, 0)).toBeLessThan(0);
    // the two staples never come closer than the clearance and the play
    for (let t = -12; t <= 12; t += 0.25)
      for (let s = -6; s <= 6; s += 0.25)
        for (let v = -6; v <= 6; v += 0.5)
          if (m.barnPluss(t, s, v) <= 0) expect(m.forelderPluss(t, s, v)).toBeGreaterThan(luft - 0.36);
    expect(m.fangst).toBeGreaterThanOrEqual(STIFTLEDD_PROVE.maal.minFang.verdi);
  });

  test('grunnoppsettet svinger fritt uten tynne kanter, og delene er tette', () => {
    const r = byggCreature(figur3());
    expect(regler(r, 'feil')).toEqual([]);
    expect(regler(r, 'advarsel').filter((x) => x !== 'CF-SVING-01')).toEqual([]);
    expect(r.ledd[0]!.sving.pluss).toBeGreaterThanOrEqual(55);
    expect(r.ledd[0]!.sving.minus).toBeGreaterThanOrEqual(55);
    expect(r.ledd[0]!.nikk).toEqual({ pluss: 60, minus: 60, maal: 60 });
    for (const d of r.deler) {
      expect(tetthet(d.mesh).lukket).toBe(true);
      expect(antallBiter(d.mesh)).toBe(1);
    }
  }, 60_000);

  test('et smalt og et lite hode får heller ingen tynne kanter', () => {
    for (const [tykkelse, lengde] of [
      [24, 40],
      [18, 18],
    ] as const) {
      const a = leggTilRot(tomtProsjekt({ id: STANDARDPROFIL.id, versjon: STANDARDPROFIL.versjon }), 'hode');
      if (!a.ok) throw new Error(a.grunn);
      const p0 = { ...a.p, deler: a.p.deler.map((d) => ({ ...d, tykkelse, lengde })) };
      const b = koble(p0, 'overkropp', { del: a.id, punkt: 'hals' });
      if (!b.ok) throw new Error(b.grunn);
      const r = byggCreature(b.p);
      expect(r.funn.filter((f) => f.niva !== 'info').map((f) => f.tittel)).toEqual([]);
    }
  }, 120_000);
});
