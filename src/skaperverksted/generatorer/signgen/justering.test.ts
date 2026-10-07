import { describe, expect, it } from 'vitest';
import { fordelingsforskyvninger, justeringGjelder, justeringsforskyvning } from './justering';

const boks = (minX: number, maksX: number, minY = 0, maksY = 10) => ({ minX, maksX, minY, maksY });

describe('justering', () => {
  it('legger kantene mot utvalgets egen boks', () => {
    const ref = { type: 'boks', boks: boks(0, 100, 0, 50) } as const;
    expect(justeringsforskyvning(boks(10, 30), 'venstre', ref)).toEqual({ dx: -10, dy: 0 });
    expect(justeringsforskyvning(boks(10, 30), 'hoyre', ref)).toEqual({ dx: 70, dy: 0 });
    expect(justeringsforskyvning(boks(10, 30), 'midtX', ref)).toEqual({ dx: 30, dy: 0 });
    expect(justeringsforskyvning(boks(10, 30, 5, 15), 'topp', ref)).toEqual({ dx: 0, dy: 35 });
    expect(justeringsforskyvning(boks(10, 30, 5, 15), 'midtY', ref)).toEqual({ dx: 0, dy: 15 });
  });

  it('en hjelpelinje justerer bare langs sin egen retning', () => {
    const lodd = { type: 'linje', akse: 'x', verdi: 12 } as const;
    expect(justeringGjelder('venstre', lodd)).toBe(true);
    expect(justeringGjelder('topp', lodd)).toBe(false);
    expect(justeringsforskyvning(boks(20, 40), 'venstre', lodd)).toEqual({ dx: -8, dy: 0 });
    expect(justeringsforskyvning(boks(20, 40), 'hoyre', lodd)).toEqual({ dx: -28, dy: 0 });
    expect(justeringsforskyvning(boks(20, 40), 'midtX', lodd)).toEqual({ dx: -18, dy: 0 });
    expect(justeringsforskyvning(boks(20, 40, 5, 9), 'topp', lodd)).toEqual({ dx: 0, dy: 0 });
    const vann = { type: 'linje', akse: 'y', verdi: -3 } as const;
    expect(justeringsforskyvning(boks(0, 1, 5, 9), 'bunn', vann)).toEqual({ dx: 0, dy: -8 });
  });

  it('fordeler med like mellomrom mellom de ytterste', () => {
    const f = fordelingsforskyvninger(
      [
        { id: 'a', boks: boks(0, 10) },
        { id: 'b', boks: boks(12, 22) },
        { id: 'c', boks: boks(60, 70) },
      ],
      'x',
    );
    // 70 wide in total, 30 of objects: gaps of 20
    expect(f.get('a')).toBeCloseTo(0);
    expect(f.get('b')).toBeCloseTo(18);
    expect(f.get('c')).toBeCloseTo(0);
  });

  it('fordeler mellom to grenser, for eksempel to hjelpelinjer', () => {
    const f = fordelingsforskyvninger(
      [
        { id: 'a', boks: boks(0, 10) },
        { id: 'b', boks: boks(20, 30) },
      ],
      'x',
      { start: 100, slutt: 150 },
    );
    // a starts at 100, b ends at 150: a 100–110, b 140–150
    expect(f.get('a')).toBeCloseTo(100);
    expect(f.get('b')).toBeCloseTo(120);
    expect(fordelingsforskyvninger([{ id: 'a', boks: boks(0, 1) }], 'x').size).toBe(0);
  });
});
