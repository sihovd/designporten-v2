import { describe, expect, it } from 'vitest';
import { areal } from '../../geometri/polygon';
import { nyttStrek } from '../../geometri/strek';
import type { SvgKilde } from '../../core/dokument';
import { bakerstTilFremst, boolskHinder, kombiner } from './boolsk';
import { leggTilObjekt, nyForm, nyTekst, nyttObjekt, nyttSigngenDokument, oppdaterKilde } from './dokument';
import { verdensRegion } from './modell';

function dokMedTo() {
  let dok = nyttSigngenDokument();
  const lagId = dok.lag[0]!.id;
  const a = nyttObjekt(lagId, nyForm('rektangel', 20, 20), { x: 0, y: 0 });
  const b = nyttObjekt(lagId, nyForm('rektangel', 20, 20), { x: 10, y: 0 });
  dok = leggTilObjekt(leggTilObjekt(dok, a), b);
  return { dok, a, b };
}

describe('boolske operasjoner', () => {
  it('Union, Subtract, Intersect og Exclude gir riktig areal for to overlappende firkanter', () => {
    const { a, b } = dokMedTo();
    const ra = verdensRegion(a)!;
    const rb = verdensRegion(b)!;
    expect(areal(kombiner('union', [ra, rb]))).toBeCloseTo(600, 3); // 20 × 30
    expect(areal(kombiner('subtract', [ra, rb]))).toBeCloseTo(200, 3); // 10 × 20 left
    expect(areal(kombiner('intersect', [ra, rb]))).toBeCloseTo(200, 3);
    expect(areal(kombiner('exclude', [ra, rb]))).toBeCloseTo(400, 3); // two bars of 10 × 20
  });

  it('Subtract tar bort alt foran fra den bakerste', () => {
    const { dok, a, b } = dokMedTo();
    const sortert = bakerstTilFremst(dok, [b, a]);
    expect(sortert.map((o) => o.id)).toEqual([a.id, b.id]);
  });

  it('forklarer hvorfor valget ikke kan kombineres', () => {
    const { dok, a, b } = dokMedTo();
    expect(boolskHinder(dok, [a])).toMatch(/to eller flere/);
    expect(boolskHinder(dok, [a, b])).toBeNull();
    const tekst = nyttObjekt(a.lagId, nyTekst('Hei'), {});
    expect(boolskHinder(dok, [a, tekst])).toMatch(/Tekst/);
    const hull = nyttObjekt(a.lagId, nyForm('hull', 5, 5), {});
    expect(boolskHinder(dok, [a, hull])).toMatch(/Hull/);
    expect(boolskHinder(dok, [a, { ...b, last: true }])).toMatch(/låst/);
  });
});

describe('Paint-strek i dokumentet', () => {
  it('endres punktene på omrisset, slutter det å være et strek', () => {
    let dok = nyttSigngenDokument();
    const lagId = dok.lag[0]!.id;
    const strek = nyttStrek(
      [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
      3,
    );
    const kilde: SvgKilde = { type: 'svg', stier: ['M0 0'], filnavn: 'Strek', fyllregel: 'nonzero', strek };
    const o = nyttObjekt(lagId, kilde, {});
    dok = leggTilObjekt(dok, o);
    const med = oppdaterKilde(dok, o.id, { strek: { ...strek, bredde: 5 }, stier: ['M1 1'] });
    expect((med.objekter[o.id]!.kilde as SvgKilde).strek?.bredde).toBe(5);
    const uten = oppdaterKilde(dok, o.id, { stier: ['M2 2'] });
    expect((uten.objekter[o.id]!.kilde as SvgKilde).strek).toBeUndefined();
  });
});
