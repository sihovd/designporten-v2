import { describe, expect, it } from 'vitest';
import {
  ankere,
  byggProfil,
  flyttAnker,
  forhandsvalg,
  medBredde,
  mellomPunkter,
  narmestePaaKurve,
  profilOverheng,
  samplerProfil,
  settInnPunkt,
  skiveDeler,
  validerProfil,
  type Profil,
  type ProfilType,
} from './profil';

const TYPER: Exclude<ProfilType, 'egendefinert'>[] = [
  'rett',
  'konveks',
  'konkav',
  's-kurve',
  'trapp',
  'fas',
  'avrundet',
];

describe('profil med anker på bunn og topp', () => {
  it('byggProfil med bunn 0 gir de gamle forhåndsvalgene', () => {
    for (const type of TYPER.filter((t) => t !== 'rett')) {
      expect(byggProfil(type, 0, 1.5, 3)).toEqual(forhandsvalg(type, 1.5, 3));
    }
  });

  it('alle former er gyldige og går fra bunn til topp', () => {
    for (const type of TYPER) {
      for (const [bunn, topp] of [
        [0, 1.5],
        [0.6, 2],
        [1.5, 0],
        [1, 1],
      ] as const) {
        const p = byggProfil(type, bunn, topp, 4);
        expect(validerProfil(p), `${type} ${bunn}→${topp}`).toBeNull();
        const a = ankere(p);
        expect(a.bunn).toBeCloseTo(bunn, 6);
        expect(a.topp).toBeCloseTo(topp, 6);
        const s = samplerProfil(p);
        expect(s[0]!.inset).toBeCloseTo(bunn, 6);
        expect(s.at(-1)!.inset).toBeCloseTo(topp, 6);
        for (let i = 1; i < s.length; i++) expect(s[i]!.t).toBeGreaterThanOrEqual(s[i - 1]!.t);
      }
    }
  });

  it('rett med to ulike ankere er en skrå vegg, med like ankere loddrett', () => {
    const skra = samplerProfil(byggProfil('rett', 0, 2));
    expect(skra).toHaveLength(2);
    expect(skra[1]!.inset).toBeCloseTo(2);
    expect(byggProfil('rett', 0, 0).bredde).toBe(0);
    expect(profilOverheng(byggProfil('rett', 0, 2), 2)).toBe(0);
  });

  it('bunn lenger inne enn topp gir overheng', () => {
    // veggen starter 1,5 mm inne og ender ute ved omrisset: heller utover
    expect(profilOverheng(byggProfil('rett', 1.5, 0), 3)).toBeCloseTo(26.6, 0);
  });

  it('å flytte et anker på en forhåndsvalgt form bygger formen på nytt', () => {
    const p = forhandsvalg('konveks', 1.5);
    const q = flyttAnker(p, 'bunn', 0.5);
    expect(q.type).toBe('konveks');
    expect(ankere(q).bunn).toBeCloseTo(0.5);
    expect(ankere(q).topp).toBeCloseTo(1.5);
    expect(q.punkter).toHaveLength(2);
  });

  it('å flytte et anker på en egendefinert kurve beholder resten i mm', () => {
    const egen: Profil = {
      type: 'egendefinert',
      bredde: 2,
      trinn: 3,
      punkter: [
        { u: 0, t: 0, ut: { u: 0, t: 0.3 } },
        { u: 0.5, t: 0.5 },
        { u: 1, t: 1, inn: { u: 0.8, t: 1 } },
      ],
    };
    const q = flyttAnker(egen, 'topp', 3);
    expect(q.type).toBe('egendefinert');
    expect(q.bredde).toBeCloseTo(3);
    expect(ankere(q).topp).toBeCloseTo(3);
    // the middle point stays at 1 mm
    expect(q.punkter[1]!.u * q.bredde).toBeCloseTo(1);
    expect(mellomPunkter(q)).toBe(1);
    expect(validerProfil(q)).toBeNull();
  });

  it('en rett, loddrett profil uten bredde kan få et topp-anker', () => {
    const q = flyttAnker(byggProfil('rett', 0, 0), 'topp', 1);
    expect(q.bredde).toBeCloseTo(1);
    expect(ankere(q).topp).toBeCloseTo(1);
  });
});

describe('punkter på veggen', () => {
  it('et nytt punkt på en bue endrer ikke formen', () => {
    const bue = byggProfil('konveks', 0, 2);
    const for_ = samplerProfil(bue, 48);
    const q = settInnPunkt(bue, 0, 0.5);
    expect(q.type).toBe('egendefinert');
    expect(q.punkter).toHaveLength(3);
    expect(mellomPunkter(q)).toBe(1);
    const etter = samplerProfil(q, 48);
    // every sample of the new wall lies on the old one (within the sampling error)
    for (const e of etter) {
      const naermeste = Math.min(...for_.map((f) => Math.hypot(f.inset - e.inset, (f.t - e.t) * 2)));
      expect(naermeste).toBeLessThan(0.05);
    }
    expect(validerProfil(q)).toBeNull();
  });

  it('en rett vegg får et punkt midt på, og en loddrett vegg får bredde å dra det inn i', () => {
    const rett = settInnPunkt(byggProfil('rett', 0, 2), 0, 0.5);
    expect(rett.punkter[1]!.u).toBeCloseTo(0.5);
    expect(rett.punkter[1]!.t).toBeCloseTo(0.5);
    const loddrett = settInnPunkt(forhandsvalg('rett'), 0, 0.5);
    expect(loddrett.bredde).toBeGreaterThan(0);
    expect(loddrett.punkter[1]!.t).toBeCloseTo(0.5);
  });

  it('finner punktet på kurven nærmest musen', () => {
    const p = byggProfil('rett', 0, 2);
    const n = narmestePaaKurve(p, 1, 0.5, { x: 40, y: 100 })!;
    expect(n.avstand).toBeLessThan(1);
    expect(n.segment).toBe(0);
    expect(n.s).toBeCloseTo(0.5, 1);
    expect(narmestePaaKurve(p, 2, 0, { x: 40, y: 100 })!.avstand).toBeGreaterThan(50);
  });

  it('en bredere ramme beholder punktene i mm', () => {
    const q = settInnPunkt(byggProfil('rett', 0, 2), 0, 0.5);
    const bredere = medBredde(q, 4);
    expect(bredere.bredde).toBe(4);
    expect(bredere.punkter[1]!.u * bredere.bredde).toBeCloseTo(q.punkter[1]!.u * q.bredde);
    expect(ankere(bredere).topp).toBeCloseTo(2);
  });
});

describe('vegg som går ned igjen', () => {
  const spor: Profil = {
    type: 'egendefinert',
    bredde: 6,
    trinn: 2,
    punkter: [
      { u: 0, t: 0 },
      { u: 0, t: 1 },
      { u: 2 / 6, t: 1 },
      { u: 3 / 6, t: 0.4 },
      { u: 4 / 6, t: 0.4 },
      { u: 5 / 6, t: 1 },
      { u: 1, t: 1 },
    ],
  };

  it('er gyldig og beholder rekkefølgen på punktene', () => {
    expect(validerProfil(spor)).toBeNull();
    const s = samplerProfil(spor);
    expect(s.some((x, i) => i > 0 && x.t < s[i - 1]!.t)).toBe(true);
  });

  it('gir en ring over sporet og full flate under det', () => {
    const s = samplerProfil(spor);
    // below the groove floor (t = 0.4): solid from the outline all the way in
    expect(skiveDeler(s, 0.2)).toEqual([[0, null]]);
    // above it: solid at the rim, air in the groove, solid again further in
    const d = skiveDeler(s, 0.7);
    expect(d).toHaveLength(2);
    expect(d[0]![0]).toBeCloseTo(0);
    expect(d[0]![1]!).toBeGreaterThan(2);
    expect(d[0]![1]!).toBeLessThan(3);
    expect(d[1]![0]).toBeGreaterThan(4);
    expect(d[1]![1]).toBeNull();
  });

  it('er ikke overheng så lenge den går innover, men er det når den går utover', () => {
    expect(profilOverheng(spor, 3)).toBe(0);
    const utover: Profil = {
      ...spor,
      punkter: [
        { u: 0.5, t: 0 },
        { u: 0.5, t: 0.5 },
        { u: 0, t: 0.2 },
        { u: 0, t: 1 },
      ],
    };
    expect(profilOverheng(utover, 3)).toBeGreaterThan(30);
  });
});
