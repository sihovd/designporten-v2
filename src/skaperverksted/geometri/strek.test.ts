import { describe, expect, it } from 'vitest';
import { areal, regionBoks } from './polygon';
import {
  PROFILER,
  breddefaktor,
  breddeVed,
  forenklePunkter,
  nyttStrek,
  strekLengde,
  strekRegion,
  strekTilSti,
} from './strek';

const linje = (n = 10) => Array.from({ length: n + 1 }, (_, i) => ({ x: i * 10, y: 0 }));

describe('strek', () => {
  it('en jevn strek er en avrundet stang med riktig bredde og lengde', () => {
    const s = nyttStrek(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      4,
    );
    const b = regionBoks(strekRegion(s));
    expect(b.maksY - b.minY).toBeCloseTo(4, 1);
    // round caps: 2 mm beyond each end
    expect(b.maksX - b.minX).toBeCloseTo(104, 1);
    expect(areal(strekRegion(s))).toBeCloseTo(100 * 4 + Math.PI * 4, 0);
    expect(strekLengde(s)).toBeCloseTo(100, 1);
  });

  it('breddepunktene gir 100 % → 160 % → 70 % → 0 % uten å gå forbi punktene', () => {
    const p = PROFILER.penselstrok;
    expect(breddefaktor(p, 0)).toBeCloseTo(1, 6);
    expect(breddefaktor(p, 0.35)).toBeCloseTo(1.6, 6);
    expect(breddefaktor(p, 0.7)).toBeCloseTo(0.7, 6);
    expect(breddefaktor(p, 1)).toBeCloseTo(0, 6);
    for (let t = 0; t <= 1; t += 0.01) {
      const v = breddefaktor(p, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.6 + 1e-9);
    }
  });

  it('en strek med penselprofil er tykkest rundt 35 % og ender i en spiss', () => {
    const s = nyttStrek(linje(), 5, 'penselstrok');
    expect(breddeVed(s, 0.35)).toBeCloseTo(8, 3);
    expect(breddeVed(s, 1)).toBeCloseTo(0, 6);
    const b = regionBoks(strekRegion(s));
    expect(b.maksY - b.minY).toBeCloseTo(8, 0);
    // a point at the end: no cap beyond x = 100
    expect(b.maksX).toBeLessThan(100.5);
  });

  it('tupp gir en spiss i den enden og ingen ting i den andre', () => {
    const s = { ...nyttStrek(linje(), 4), tuppSlutt: 0.3 };
    expect(breddeVed(s, 1)).toBeCloseTo(0, 6);
    expect(breddeVed(s, 0.5)).toBeCloseTo(4, 6);
    expect(breddeVed(s, 0)).toBeCloseTo(4, 6);
  });

  it('en tett sving gir en lukket flate uten selvkryssing', () => {
    const s = nyttStrek(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 6 },
        { x: 0, y: 6 },
      ],
      4,
    );
    const r = strekRegion(s);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(areal(r)).toBeGreaterThan(0);
    expect(strekTilSti(s)).toMatch(/^M/);
  });

  it('forenkling beholder endene og tynner ut en rett linje', () => {
    const p = forenklePunkter(linje(50), 0.1);
    expect(p).toHaveLength(2);
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(p[1]).toEqual({ x: 500, y: 0 });
  });

  it('jevnere strek (glatt) gir en rolig kurve uten å flytte endene', () => {
    const rask = nyttStrek(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: -5 },
        { x: 30, y: 5 },
        { x: 40, y: 0 },
      ],
      2,
      'jevn',
      0,
    );
    const rolig = { ...rask, glatt: 1 };
    const hoyde = (s: typeof rask) => {
      const b = regionBoks(strekRegion(s));
      return b.maksY - b.minY;
    };
    expect(hoyde(rolig)).toBeLessThan(hoyde(rask));
    const b = regionBoks(strekRegion(rolig));
    expect(b.minX).toBeCloseTo(-1, 0);
    expect(b.maksX).toBeCloseTo(41, 0);
  });
});
