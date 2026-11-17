import { festTilKant, forenkleSti, kantsti, lagKantkart } from './magnetlasso';

/** A white image with a dark square from (20,20) to (59,59). */
function firkant(b = 80, h = 80) {
  const d = new Uint8ClampedArray(b * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < b; x++) {
      const i = (y * b + x) * 4;
      const inne = x >= 20 && x < 60 && y >= 20 && y < 60;
      d[i] = d[i + 1] = d[i + 2] = inne ? 30 : 240;
      d[i + 3] = 255;
    }
  return lagKantkart(d, b, h);
}

describe('magnetisk lasso', () => {
  it('finner kantene i bildet', () => {
    const k = firkant();
    expect(k.styrke[40 * 80 + 20]).toBeGreaterThan(0.5); // on the left edge
    expect(k.styrke[40 * 80 + 40]).toBe(0); // inside the square
    expect(k.styrke[5 * 80 + 5]).toBe(0); // in the background
  });

  it('fester pekeren til nærmeste kant innenfor bredden', () => {
    const k = firkant();
    const p = festTilKant(k, { x: 25, y: 40 }, 8);
    expect(Math.abs(p.x - 20)).toBeLessThanOrEqual(1);
    // nothing within reach: the point stays where it is
    expect(festTilKant(k, { x: 5, y: 5 }, 3)).toEqual({ x: 5, y: 5 });
  });

  it('følger kanten i stedet for å gå rett over', () => {
    const k = firkant();
    // from the top edge to the left edge: the straight line cuts the corner,
    // the edge path goes round it
    const sti = kantsti(k, { x: 40, y: 20 }, { x: 20, y: 40 }, 12);
    expect(sti[0]).toEqual({ x: 40, y: 20 });
    expect(sti[sti.length - 1]).toEqual({ x: 20, y: 40 });
    const naerKant = sti.filter((p) => {
      const iX = Math.min(Math.abs(p.x - 20), Math.abs(p.x - 59));
      const iY = Math.min(Math.abs(p.y - 20), Math.abs(p.y - 59));
      return Math.min(iX, iY) <= 1;
    });
    expect(naerKant.length / sti.length).toBeGreaterThan(0.9);
    // it passes close to the corner (20,20)
    expect(sti.some((p) => Math.abs(p.x - 20) <= 1 && Math.abs(p.y - 20) <= 1)).toBe(true);
  });

  it('forenkler rette strekk til endepunktene', () => {
    const rett = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 }));
    expect(forenkleSti(rett)).toEqual([
      { x: 0, y: 0 },
      { x: 9, y: 0 },
    ]);
  });
});
