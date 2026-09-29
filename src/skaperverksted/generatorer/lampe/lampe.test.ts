import { describe, expect, it } from 'vitest';
import { avgrensning, sjekkManifold, volum } from '../../geometri/mesh';
import { lagForm, samplerSilhuett } from './form';
import { byggLampe } from './geometri';
import { ankerRadius, fjernAnker, flyttAnker, flyttHandtak, leggTilAnker, vekslGlatt } from './handlinger';
import { gloedFarger, modulForhandsvisning, paerePosisjon } from './tre';
import {
  PROVEBIT_KANT,
  holderHull,
  maskinvare,
  modulMal,
  modulStorrelse,
  standardTilpasning,
} from './maskinvare';
import { byggLampeModell, lesParametre, medParametre, nyttLampeDokument, vurderUtskrift } from './modell';
import {
  MIN_RADIUS,
  normaliser,
  silhuettForhandsvalg,
  standardParametre,
  type LampeParametre,
  type Monstertype,
  type SokkelId,
} from './parametre';

const p = (endring: Partial<LampeParametre> = {}): LampeParametre =>
  normaliser({ ...standardParametre(), ...endring });

function rett(): Partial<LampeParametre> {
  return {
    silhuett: silhuettForhandsvalg('rett'),
    monster: { type: 'glatt', antall: 3, dybde: 0 },
    vridning: 0,
  };
}

describe('lampe: parametre', () => {
  it('normaliserer søppel til gyldige standardverdier', () => {
    const n = normaliser({ hoyde: 'x', diameterBunn: NaN, monster: { type: 'ukjent' }, sokkel: 'gu10' });
    const s = standardParametre();
    expect(n.hoyde).toBe(s.hoyde);
    expect(n.diameterBunn).toBe(s.diameterBunn);
    expect(n.monster.type).toBe(s.monster.type);
    expect(n.sokkel).toBe(s.sokkel);
    expect(normaliser(null)).toEqual(s);
  });

  it('klemmer verdier til grensene', () => {
    const n = normaliser({
      hoyde: 5000,
      veggtykkelse: 0.01,
      monster: { type: 'ribber', antall: 2.4, dybde: 99 },
    });
    expect(n.hoyde).toBe(400);
    expect(n.veggtykkelse).toBe(0.4);
    expect(n.monster.antall).toBe(3);
    expect(n.monster.dybde).toBe(15);
  });

  it('fester silhuettens endepunkter og sorterer punktene', () => {
    const n = normaliser({
      silhuett: [
        { u: 5, t: 0.9 },
        { u: 12, t: 0.4 },
        { u: 3, t: 0.1 },
        { u: 'x', t: 0.5 },
      ],
    });
    expect(n.silhuett.map((q) => q.t)).toEqual([0, 0.4, 1]);
    expect(n.silhuett[0]!.u).toBe(0);
    expect(n.silhuett.at(-1)!.u).toBe(0);
    expect(normaliser({ silhuett: [] }).silhuett).toHaveLength(2);
  });

  it('medParametre endrer dokumentet uten å mutere det', () => {
    const dok = nyttLampeDokument();
    const ny = medParametre(dok, { hoyde: 222 });
    expect(lesParametre(ny).hoyde).toBe(222);
    expect(lesParametre(dok).hoyde).toBe(standardParametre().hoyde);
  });
});

describe('lampe: silhuett', () => {
  it('beholder fortegn for midje', () => {
    const s = samplerSilhuett(silhuettForhandsvalg('midje', 20));
    expect(Math.min(...s.map((q) => q.u))).toBeCloseTo(-20, 0);
    const form = lagForm(
      p({ silhuett: silhuettForhandsvalg('midje', 20), diameterBunn: 100, diameterTopp: 100 }),
    );
    expect(form.radius(0.5)).toBeCloseTo(30, 0);
    expect(form.radius(0)).toBeCloseTo(50, 5);
    expect(form.radius(1)).toBeCloseTo(50, 5);
  });

  it('interpolerer lineært mellom bunn- og toppdiameter', () => {
    const form = lagForm(p({ ...rett(), diameterBunn: 80, diameterTopp: 160 }));
    expect(form.radius(0.25)).toBeCloseTo(50, 5);
  });

  it('løfter en silhuett som krysser midten til minste radius', () => {
    const form = lagForm(
      p({ silhuett: silhuettForhandsvalg('midje', 120), diameterBunn: 60, diameterTopp: 60 }),
    );
    expect(form.radius(0.5)).toBe(MIN_RADIUS);
    expect(form.klemt).toBe(true);
  });
});

describe('lampe: geometri', () => {
  const monstre: Monstertype[] = ['glatt', 'ribber', 'bolger', 'fasetter', 'diamant'];
  const sokkelIder: SokkelId[] = ['apen', 'lukket', 'e27', 'e14'];

  for (const type of monstre) {
    for (const sokkel of sokkelIder) {
      it(`er vanntett: ${type} med ${sokkel}`, () => {
        const g = byggLampe(p({ monster: { type, antall: 12, dybde: 4 }, vridning: 90, sokkel }));
        const s = sjekkManifold(g.mesh);
        expect(s).toEqual({ lukket: true, aapneKanter: 0, feilKanter: 0 });
        expect(volum(g.mesh)).toBeGreaterThan(0);
      });
    }
  }

  it('er vanntett i ytterpunktene', () => {
    const tilfeller: Partial<LampeParametre>[] = [
      { hoyde: 40, diameterBunn: 40, diameterTopp: 40, veggtykkelse: 0.4, sokkel: 'lukket' },
      {
        hoyde: 400,
        diameterBunn: 300,
        diameterTopp: 40,
        veggtykkelse: 6,
        monster: { type: 'ribber', antall: 72, dybde: 15 },
      },
      { monster: { type: 'fasetter', antall: 3, dybde: 0 }, vridning: 720 },
      { monster: { type: 'bolger', antall: 24, dybde: 15 } },
      { silhuett: silhuettForhandsvalg('midje', 120), diameterBunn: 60, diameterTopp: 60, sokkel: 'apen' },
      {
        silhuett: silhuettForhandsvalg('tulipan', 120),
        vridning: -720,
        monster: { type: 'diamant', antall: 40, dybde: 8 },
      },
    ];
    for (const t of tilfeller) {
      expect(sjekkManifold(byggLampe(p(t)).mesh).lukket).toBe(true);
    }
  }, 30_000);

  it('har riktige mål og veggtykkelse for en rett sylinder', () => {
    const g = byggLampe(
      p({ ...rett(), hoyde: 150, diameterBunn: 100, diameterTopp: 100, veggtykkelse: 2, sokkel: 'apen' }),
    );
    const b = avgrensning(g.mesh);
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.maks[2]).toBeCloseTo(150, 3);
    expect(b.maks[0]).toBeCloseTo(50, 3);
    // Polygonal ring volume ≈ π(R² − r²)H within the tessellation error.
    const forventet = Math.PI * (50 * 50 - 48 * 48) * 150;
    expect(volum(g.mesh)).toBeGreaterThan(forventet * 0.99);
    expect(volum(g.mesh)).toBeLessThan(forventet * 1.001);
  });

  it('holder veggtykkelsen målt langs normalen på skrå vegger', () => {
    const q = p({
      ...rett(),
      diameterBunn: 60,
      diameterTopp: 260,
      hoyde: 100,
      veggtykkelse: 1,
      sokkel: 'apen',
    });
    const pos = byggLampe(q).mesh.posisjoner;
    // Outer radius is 30 + z; slope dr/dz = 1, so the inner wall sits √2 × thickness further in.
    let maksGap = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const [x, y, z] = [pos[i]!, pos[i + 1]!, pos[i + 2]!];
      if (x > 0 && Math.abs(y) < 1e-6 && z > 10 && z < 90) maksGap = Math.max(maksGap, 30 + z - x);
    }
    expect(maksGap).toBeCloseTo(Math.SQRT2, 2);
  });

  it('lager hull med oppgitt diameter for E27', () => {
    const g = byggLampe(p({ sokkel: 'e27', diameterBunn: 120 }));
    expect(g.hullRadius).toBe(21);
    expect(g.hullForStort).toBe(false);
  });

  it('er deterministisk', () => {
    const a = byggLampe(p());
    const b = byggLampe(p());
    expect(a.mesh.posisjoner).toEqual(b.mesh.posisjoner);
    expect(a.mesh.indekser).toEqual(b.mesh.indekser);
  });

  it('holder seg innenfor trekantbudsjettet', () => {
    const g = byggLampe(p({ hoyde: 400, monster: { type: 'diamant', antall: 72, dybde: 3 }, vridning: 720 }));
    expect(g.mesh.indekser.length / 3).toBeLessThan(400_000);
  });
});

describe('lampe: utskrift', () => {
  it('advarer mot for tynn vegg og for stort overheng', () => {
    const q = p({ ...rett(), veggtykkelse: 0.4, diameterBunn: 40, diameterTopp: 300, hoyde: 60 });
    const v = vurderUtskrift(q, byggLampe(q));
    expect(v.maksOverheng).toBeGreaterThan(60);
    expect(v.advarsler.some((a) => a.tekst.includes('Veggen er 0,4 mm'))).toBe(true);
    expect(v.advarsler.some((a) => a.tekst.includes('heller'))).toBe(true);
    expect(v.vasemodus.mulig).toBe(false);
  });

  it('godkjenner vasemodus for en slank, glatt lampe', () => {
    const q = p({ ...rett(), veggtykkelse: 0.8, sokkel: 'lukket' });
    const v = vurderUtskrift(q, byggLampe(q));
    expect(v.vasemodus.mulig).toBe(true);
    expect(v.advarsler.filter((a) => a.niva !== 'info')).toEqual([]);
  });

  it('avviser vasemodus for tykk vegg', () => {
    const q = p({ ...rett(), veggtykkelse: 2 });
    expect(vurderUtskrift(q, byggLampe(q)).vasemodus.mulig).toBe(false);
  });

  it('melder feil når lampen ikke får plass på skriveren', () => {
    const q = p({ hoyde: 300, diameterTopp: 280 });
    const feil = vurderUtskrift(q, byggLampe(q)).advarsler.filter((a) => a.niva === 'feil');
    expect(feil).toHaveLength(2);
  });

  it('melder feil når lampeholderen ikke får plass i bunnen', () => {
    const q = p({ ...rett(), sokkel: 'e27', diameterBunn: 40 });
    const g = byggLampe(q);
    expect(g.hullForStort).toBe(true);
    expect(sjekkManifold(g.mesh).lukket).toBe(true);
    expect(vurderUtskrift(q, g).advarsler.some((a) => a.niva === 'feil' && a.tekst.includes('E27'))).toBe(
      true,
    );
  });

  it('sier at sokkelmålet ikke er bekreftet', () => {
    const q = p({ sokkel: 'e14' });
    expect(
      vurderUtskrift(q, byggLampe(q)).advarsler.some(
        (a) => a.niva === 'info' && a.tekst.includes('ikke bekreftet'),
      ),
    ).toBe(true);
  });
});

describe('lampe: byggModell', () => {
  it('bygger én vanntett del fra et nytt dokument', async () => {
    const r = await byggLampeModell(nyttLampeDokument());
    expect(r.deler).toHaveLength(1);
    expect(r.deler[0]!.materialId).toBe(standardParametre().materialId);
    expect(sjekkManifold(r.deler[0]!.mesh).lukket).toBe(true);
  });

  it('tåler ødelagte parametre i dokumentet', async () => {
    const dok = { ...nyttLampeDokument(), parametre: { hoyde: -1, silhuett: 'nei', monster: 7 } };
    const r = await byggLampeModell(dok);
    expect(r.deler).toHaveLength(1);
    expect(sjekkManifold(r.deler[0]!.mesh).lukket).toBe(true);
  });
});

describe('lampe: redigering', () => {
  it('flytter endepunktene som diametre', () => {
    const q = p({ diameterBunn: 100, diameterTopp: 120 });
    expect(flyttAnker(q, 0, 70, 999)).toEqual({ diameterBunn: 140 });
    expect(flyttAnker(q, q.silhuett.length - 1, 45, 0)).toEqual({ diameterTopp: 90 });
  });

  it('flytter et midtpunkt slik at silhuetten går gjennom pekeren', () => {
    const q = p({
      silhuett: silhuettForhandsvalg('bue', 10),
      hoyde: 200,
      diameterBunn: 100,
      diameterTopp: 100,
    });
    const ny = normaliser({ ...q, ...flyttAnker(q, 1, 80, 120) });
    expect(ankerRadius(ny, 1)).toBeCloseTo(80, 6);
    expect(ny.silhuett[1]!.t * ny.hoyde).toBeCloseTo(120, 6);
    // handles move with the anchor
    expect(ny.silhuett[1]!.ut!.u - ny.silhuett[1]!.u).toBeCloseTo(q.silhuett[1]!.ut!.u - q.silhuett[1]!.u, 6);
    expect(lagForm(ny).radius(0.6)).toBeCloseTo(80, 0);
  });

  it('holder et midtpunkt mellom naboene', () => {
    const q = p({ silhuett: silhuettForhandsvalg('bue', 10), hoyde: 100 });
    const ny = normaliser({ ...q, ...flyttAnker(q, 1, 60, 500) });
    expect(ny.silhuett[1]!.t).toBeLessThan(1);
    expect(ny.silhuett.map((x) => x.t)).toEqual([...ny.silhuett.map((x) => x.t)].sort((a, b) => a - b));
  });

  it('legger til, fjerner og glatter punkter', () => {
    const q = p({ silhuett: silhuettForhandsvalg('rett') });
    const { endring, indeks } = leggTilAnker(q, 0);
    const med = normaliser({ ...q, ...endring });
    expect(med.silhuett).toHaveLength(3);
    expect(indeks).toBe(1);
    const glatt = normaliser({ ...med, ...vekslGlatt(med, 1) });
    expect(glatt.silhuett[1]!.ut).toBeDefined();
    expect(glatt.silhuett[1]!.inn).toBeDefined();
    const hjorne = normaliser({ ...glatt, ...vekslGlatt(glatt, 1) });
    expect(hjorne.silhuett[1]!.ut).toBeUndefined();
    expect(normaliser({ ...med, ...fjernAnker(med, 1) }).silhuett).toHaveLength(2);
    expect(fjernAnker(med, 0)).toEqual({});
  });

  it('flytter håndtak i millimeter', () => {
    const q = p({
      silhuett: silhuettForhandsvalg('bue', 10),
      hoyde: 100,
      diameterBunn: 100,
      diameterTopp: 100,
    });
    const ny = normaliser({ ...q, ...flyttHandtak(q, 1, 'ut', 70, 90) });
    expect(ny.silhuett[1]!.ut).toEqual({ u: 20, t: 0.9 });
  });
});

describe('lampe: lys', () => {
  it('lyser sterkere på tynn vegg enn på tykk', () => {
    // A vertex on the outside facing straight away from the bulb.
    const q = (vegg: number) =>
      p({ veggtykkelse: vegg, diameterBunn: 100, diameterTopp: 100, sokkel: 'apen' });
    const z = paerePosisjon(q(1));
    const tynn = gloedFarger([50, 0, z], [1, 0, 0], q(0.6), [1, 1, 1])[0]!;
    const tykk = gloedFarger([50, 0, z], [1, 0, 0], q(3), [1, 1, 1])[0]!;
    expect(tynn).toBeGreaterThan(tykk);
  });

  it('lyser mer der lyset går rett gjennom enn på skrå', () => {
    const q = p({ diameterBunn: 100, diameterTopp: 100, sokkel: 'apen' });
    const z = paerePosisjon(q);
    const [rett] = gloedFarger([50, 0, z], [1, 0, 0], q, [0.5, 0.5, 0.5]);
    const [skra] = gloedFarger([50, 0, z], [0.5, 0.866, 0], q, [0.5, 0.5, 0.5]);
    expect(rett!).toBeGreaterThan(skra!);
  });

  it('plasserer pæra over lampeholderen', () => {
    expect(paerePosisjon(p({ sokkel: 'e27', hoyde: 300, bunnTykkelse: 2 }))).toBe(62);
    expect(paerePosisjon(p({ sokkel: 'apen', hoyde: 200 }))).toBe(80);
  });
});

describe('lampe: maskinvareprofiler', () => {
  it('har Bambu Lab Lamp Kit 001 med kilder og ærlig sikkerhet', () => {
    const b = maskinvare['bambu-001'];
    expect(b.type).toBe('modul');
    expect(b.modul!.ytreDiameter).toMatchObject({ verdi: 59, sikkerhet: 'produsentoppgitt' });
    expect(b.modul!.kroppHoyde.sikkerhet).toBe('uklar');
    expect(b.modul!.skruehull.verdi).toBeNull();
    expect(b.passformVerifisert).toBe(false);
    expect(b.kilder.length).toBeGreaterThan(0);
    for (const k of b.kilder) expect(k.url).toMatch(/^https:\/\//);
  });

  it('merker E27 og E14 som vanlige mål, ikke bekreftede', () => {
    for (const id of ['e27', 'e14'] as const) {
      expect(maskinvare[id].hullDiameter!.sikkerhet).toBe('vanlig-mal');
      expect(maskinvare[id].passformVerifisert).toBe(false);
    }
  });

  it('normaliserer tilpasningen og avviser ukjente lyskilder', () => {
    expect(normaliser({ sokkel: 'toString' }).sokkel).toBe(standardParametre().sokkel);
    const t = normaliser({
      tilpasning: { toleranse: 9, feste: 'lim', modulHoyde: 'x', holderHull: 40 },
    }).tilpasning;
    expect(t.toleranse).toBe(1.5);
    expect(t.feste).toBe('tape');
    expect(t.modulHoyde).toBeNull();
    expect(t.holderHull).toBe(40);
    expect(normaliser({}).tilpasning).toEqual(standardTilpasning());
  });

  it('bruker egne mål før profilens', () => {
    const t = { ...standardTilpasning(), modulHoyde: 16.4 };
    expect(modulStorrelse('bambu-001', t)).toEqual({ diameter: 59, hoyde: 16.4 });
    expect(modulStorrelse('e27', t)).toBeNull();
    expect(holderHull('e27', { ...t, holderHull: 40 })).toBe(40);
    expect(holderHull('e27', t)).toBe(42);
  });

  it('regner ut fordypningen fra profil og tilpasning', () => {
    const m = modulMal('bambu-001', standardTilpasning())!;
    expect(m.rLomme).toBeCloseTo(29.8, 9);
    expect(m.zGulv).toBeCloseTo(6.6, 9);
    expect(m.zTopp).toBeCloseTo(12.6, 9);
    const k = modulMal('bambu-001', { ...standardTilpasning(), feste: 'klemkant', fordypning: 19.2 })!;
    expect(k.rApning).toBeCloseTo(29.3, 9);
    expect(k.zKlem).toBeCloseTo(k.zTopp - 1.2, 9);
  });
});

describe('lampe: sokkel for lysmodul', () => {
  const monstre: Monstertype[] = ['glatt', 'ribber', 'bolger', 'fasetter', 'diamant'];
  for (const type of monstre) {
    for (const feste of ['tape', 'klemkant'] as const) {
      it(`er vanntett: ${type} med Bambu-modul og ${feste}`, () => {
        const g = byggLampe(
          p({
            sokkel: 'bambu-001',
            monster: { type, antall: 12, dybde: 4 },
            vridning: type === 'fasetter' ? 0 : 90,
            tilpasning: { ...standardTilpasning(), feste, fordypning: feste === 'klemkant' ? 19.2 : 6 },
          }),
        );
        expect(sjekkManifold(g.mesh)).toEqual({ lukket: true, aapneKanter: 0, feilKanter: 0 });
        expect(volum(g.mesh)).toBeGreaterThan(0);
      });
    }
  }

  it('er vanntett når fordypningen må krympes', () => {
    const tilfeller: Partial<LampeParametre>[] = [
      {
        sokkel: 'bambu-001',
        diameterBunn: 40,
        diameterTopp: 40,
        hoyde: 40,
        silhuett: silhuettForhandsvalg('rett'),
      },
      {
        sokkel: 'egendefinert',
        tilpasning: { ...standardTilpasning(), modulDiameter: 150, kabelHull: 40, fordypning: 40 },
      },
    ];
    for (const t of tilfeller) {
      const g = byggLampe(p(t));
      expect(sjekkManifold(g.mesh).lukket).toBe(true);
      expect(g.modul!.apningKlemt || g.modul!.lommeKlemt || g.modul!.dybdeKlemt).toBe(true);
    }
  }, 30_000);

  it('lager fordypning, kabelhull og kabelspor med riktige mål', () => {
    const q = p({ ...rett(), sokkel: 'bambu-001', diameterBunn: 110, diameterTopp: 110, veggtykkelse: 1 });
    const g = byggLampe(q);
    const m = g.modul!.mal;
    expect(m.rLomme).toBeCloseTo(29.8, 9);
    expect(g.zStart).toBeCloseTo(12.6, 9);
    const pos = g.mesh.posisjoner;
    let lommeVegg = false;
    let kanalBunn = false;
    let underKanal = false;
    for (let i = 0; i < pos.length; i += 3) {
      const [x, y, z] = [pos[i]!, pos[i + 1]!, pos[i + 2]!];
      const r = Math.hypot(x, y);
      if (Math.abs(r - 29.8) < 0.01 && z > 6.6 - 1e-3 && z < 12.6 + 1e-3) lommeVegg = true;
      // The channel runs out through the back (+Y) and is open underneath.
      if (Math.abs(Math.abs(x) - 3.5) < 1e-3 && y > 50 && Math.abs(z) < 1e-4) kanalBunn = true;
      if (Math.abs(x) < 3.4 && y > 12 && y < 50 && z < 5 - 1e-3) underKanal = true;
    }
    expect(lommeVegg).toBe(true);
    expect(kanalBunn).toBe(true);
    expect(underKanal).toBe(false);
    const b = avgrensning(g.mesh);
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.maks[2]).toBeCloseTo(q.hoyde, 3);
  });

  it('bygger en vanntett prøvebit med bare fordypning og kabelføring', async () => {
    const dok = medParametre(nyttLampeDokument(), {
      sokkel: 'bambu-001',
      tilpasning: { ...standardTilpasning(), provebit: true },
    });
    const r = await byggLampeModell(dok);
    expect(r.deler).toHaveLength(1);
    expect(r.deler[0]!.id).toBe('provebit');
    expect(sjekkManifold(r.deler[0]!.mesh).lukket).toBe(true);
    const b = avgrensning(r.deler[0]!.mesh);
    expect(b.maks[0]).toBeCloseTo(29.8 + PROVEBIT_KANT, 2);
    expect(b.maks[2]).toBeCloseTo(12.6, 3);
    expect(r.advarsler.some((a) => a.tekst.includes('prøvebiten'))).toBe(true);
  });

  it('viser modulen i riktig størrelse og lyset fra toppen av den', () => {
    const q = p({ sokkel: 'bambu-001' });
    expect(modulForhandsvisning(q)).toEqual({ r: 29.5, h: 18, z: expect.closeTo(6.6, 9) });
    expect(paerePosisjon(q)).toBeCloseTo(24.6, 9);
    expect(modulForhandsvisning(p({ sokkel: 'e27' }))).toBeNull();
  });
});

describe('lampe: passform', () => {
  const tekster = (q: LampeParametre) => vurderUtskrift(q, byggLampe(q)).advarsler;

  it('godtar standardlampen med Bambu-modul uten feil', () => {
    const a = tekster(p({ sokkel: 'bambu-001' }));
    expect(a.filter((x) => x.niva === 'feil')).toEqual([]);
    expect(a.some((x) => x.niva === 'info' && x.tekst.includes('ikke fysisk verifisert'))).toBe(true);
    expect(a.some((x) => x.tekst.includes('Høyden på modulen'))).toBe(true);
    expect(a.some((x) => x.tekst.includes('Kabeltykkelsen er ikke oppgitt'))).toBe(true);
  });

  it('sier fra når lampen er for smal til modulen', () => {
    const a = tekster(p({ ...rett(), sokkel: 'bambu-001', diameterBunn: 60, diameterTopp: 60 }));
    expect(a.some((x) => x.niva === 'feil' && x.tekst.includes('får ikke plass'))).toBe(true);
  });

  it('sier fra når modulen ikke kommer ned gjennom toppen', () => {
    const a = tekster(p({ ...rett(), sokkel: 'bambu-001', diameterBunn: 120, diameterTopp: 50 }));
    expect(a.some((x) => x.niva === 'feil' && x.tekst.includes('kommer ikke ned'))).toBe(true);
  });

  it('sier fra når klemkanten treffer modulen', () => {
    const a = tekster(
      p({ sokkel: 'bambu-001', tilpasning: { ...standardTilpasning(), feste: 'klemkant', fordypning: 6 } }),
    );
    expect(a.some((x) => x.niva === 'feil' && x.tekst.includes('Klemkanten sitter lavere'))).toBe(true);
  });

  it('sier fra når lampeveggen treffer en modul som står opp', () => {
    const a = tekster(
      p({
        sokkel: 'egendefinert',
        silhuett: silhuettForhandsvalg('midje', 19.5),
        monster: { type: 'glatt', antall: 3, dybde: 0 },
        diameterBunn: 100,
        diameterTopp: 100,
        hoyde: 60,
        tilpasning: { ...standardTilpasning(), modulDiameter: 60, modulHoyde: 50 },
      }),
    );
    expect(a.some((x) => x.niva === 'feil' && x.tekst.includes('treffer modulen'))).toBe(true);
  });

  it('sier fra om for tynn bunn og for stort kabelhull', () => {
    const a = tekster(
      p({
        sokkel: 'bambu-001',
        tilpasning: { ...standardTilpasning(), gulv: 0.6, kabelHull: 40, modulDiameter: 40 },
      }),
    );
    expect(a.some((x) => x.niva === 'advarsel' && x.tekst.includes('Bunnen over kabelsporet'))).toBe(true);
    expect(a.some((x) => x.niva === 'feil' && x.tekst.includes('Kabelhullet'))).toBe(true);
  });

  it('slutter å kalle holderhullet ubekreftet når brukeren har målt selv', () => {
    const q = p({ sokkel: 'e27', tilpasning: { ...standardTilpasning(), holderHull: 40 } });
    const g = byggLampe(q);
    expect(g.hullRadius).toBe(20);
    expect(vurderUtskrift(q, g).advarsler.some((x) => x.tekst.includes('ikke bekreftet'))).toBe(false);
  });

  it('avviser vasemodus med massiv sokkel', () => {
    const q = p({ ...rett(), sokkel: 'bambu-001', veggtykkelse: 0.8 });
    expect(vurderUtskrift(q, byggLampe(q)).vasemodus.mulig).toBe(false);
  });
});
