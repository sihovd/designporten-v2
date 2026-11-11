import { fargeomrade, hexAv, labBilde, naermesteProve, tilLab, toneomrade } from './fargeomrade';

/** 30 × 10 px: red on the left, dark red in the middle, red again on the right, blue in the top-right corner. */
function bilde() {
  const w = 30;
  const h = 10;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = x >= 25 && y < 3 ? [20, 40, 220] : x >= 10 && x < 20 ? [120, 10, 20] : [230, 30, 40];
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  return { d, w, h };
}
const antall = (u: Uint8Array) => u.reduce((s, v) => s + v, 0);
const rod = { x: 2, y: 5, r: 230, g: 30, b: 40 };

describe('fargeområde', () => {
  it('regner sRGB om til Lab', () => {
    const [L, a, b] = tilLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 0);
    expect(Math.abs(a)).toBeLessThan(0.5);
    expect(Math.abs(b)).toBeLessThan(0.5);
    expect(tilLab(0, 0, 0)[0]).toBeCloseTo(0, 1);
  });

  it('velger fargen i hele bildet, eller bare det sammenhengende', () => {
    const { d, w, h } = bilde();
    const lab = labBilde(d, w, h);
    const alle = fargeomrade(
      d,
      w,
      h,
      { prover: [rod], uskarphet: 20, maling: 'oppfattet', sammenhengende: false },
      lab,
    );
    // both red areas, not the dark red or the blue
    expect(antall(alle)).toBe(20 * 10 - 5 * 3);
    const sammen = fargeomrade(
      d,
      w,
      h,
      { prover: [rod], uskarphet: 20, maling: 'oppfattet', sammenhengende: true },
      lab,
    );
    expect(antall(sammen)).toBe(10 * 10);
  });

  it('flere prøver og høyere uskarphet tar med mer', () => {
    const { d, w, h } = bilde();
    const bla = { x: 27, y: 1, r: 20, g: 40, b: 220 };
    const to = fargeomrade(d, w, h, {
      prover: [rod, bla],
      uskarphet: 20,
      maling: 'oppfattet',
      sammenhengende: false,
    });
    expect(antall(to)).toBe(20 * 10);
    const vid = fargeomrade(d, w, h, { prover: [rod], uskarphet: 100, maling: 'rgb', sammenhengende: false });
    expect(antall(vid)).toBe(20 * 10 - 15 + 10 * 10);
    const ingen = fargeomrade(d, w, h, { prover: [], uskarphet: 50, maling: 'rgb', sammenhengende: false });
    expect(antall(ingen)).toBe(0);
  });

  it('velger lyse, mellom og mørke toner', () => {
    const w = 3;
    const d = new Uint8ClampedArray([255, 255, 255, 255, 128, 128, 128, 255, 10, 10, 10, 255]);
    expect([...toneomrade(d, w, 1, 'lyse')]).toEqual([1, 0, 0]);
    expect([...toneomrade(d, w, 1, 'mellom')]).toEqual([0, 1, 0]);
    expect([...toneomrade(d, w, 1, 'morke')]).toEqual([0, 0, 1]);
  });

  it('finner nærmeste prøve og skriver hex', () => {
    const bla = { x: 0, y: 0, r: 20, g: 40, b: 220 };
    expect(naermesteProve([rod, bla], 30, 50, 200)).toBe(1);
    expect(hexAv(rod)).toBe('#e61e28');
  });
});
