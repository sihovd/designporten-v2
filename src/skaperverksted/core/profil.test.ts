import { describe, expect, it } from 'vitest';
import {
  ankere,
  byggProfil,
  flyttAnker,
  forhandsvalg,
  mellomPunkter,
  profilOverheng,
  samplerProfil,
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
