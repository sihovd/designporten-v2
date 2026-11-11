import { hovedfarger, otsu, tilHex, type Piksler } from './vektoriser';

type Rgba = [number, number, number, number];

/** A test image drawn pixel by pixel. */
function bilde(b: number, h: number, farge: (x: number, y: number) => Rgba): Piksler {
  const data = new Uint8ClampedArray(b * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) data.set(farge(x + 0.5, y + 0.5), (y * b + x) * 4);
  return { width: b, height: h, data };
}

const HVIT: Rgba = [255, 255, 255, 255];
const SVART: Rgba = [20, 20, 20, 255];
const ROD: Rgba = [220, 30, 40, 255];

describe('vektoriser', () => {
  it('finds the threshold between two tones', () => {
    const ring = bilde(200, 200, (x, y) => (Math.hypot(x - 100, y - 100) <= 60 ? SVART : HVIT));
    const t = otsu(ring);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(255);
  });

  it('finds the main colours of an image', () => {
    const tre = bilde(60, 60, (x) => (x < 20 ? SVART : x < 40 ? ROD : HVIT));
    const pal = hovedfarger(tre, 3);
    expect(pal).toHaveLength(3);
    expect(pal.map(tilHex).sort()).toEqual(['#141414', '#dc1e28', '#ffffff']);
  });

  it('writes a colour as a hex code', () => {
    expect(tilHex({ r: 136, g: 61, b: 255 })).toBe('#883dff');
  });
});
