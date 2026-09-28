import { describe, expect, it } from 'vitest';
import { avgrensning, sjekkManifold, volum } from '../../geometri/mesh';
import { lagForm, samplerSilhuett } from './form';
import { byggLampe } from './geometri';
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
