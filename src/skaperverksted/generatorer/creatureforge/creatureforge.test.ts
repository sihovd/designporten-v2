import { volum } from '../../geometri/mesh';
import { byggCreature, type CfResultat } from './bygg';
import { antallBiter, tetthet } from './kontroll';
import { kuppelFelt } from './kuppel';
import { KJEDELEDD_PROVE, mekanisme, toleranser } from './ledd';
import { lagRutenett, marsjer } from './marsj';
import { tomtProsjekt, valider, type CfParametre, type Ledd } from './parametre';
import { koble, leddTil, ledigeFor, leggTilRot, plasser, slett } from './plassering';
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
