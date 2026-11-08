import { areal, regionFraRinger } from '../../geometri/polygon';
import { stiTilRinger } from '../../geometri/stidata';
import {
  STANDARD_VEKTORVALG,
  VektorFeil,
  bakgrunnIndeks,
  flatUtAlfa,
  otsu,
  sporskala,
  vektoriser,
  type Piksler,
} from './vektoriser';

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

/** A black ring (outer radius 60, inner 30) on white, 200 × 200. */
const ring = bilde(200, 200, (x, y) => {
  const r = Math.hypot(x - 100, y - 100);
  return r <= 60 && r >= 30 ? SVART : HVIT;
});

const flateAv = (d: string) => areal(regionFraRinger(stiTilRinger(d), 'evenodd'));

describe('vektoriser', () => {
  it('traces a one-colour ring as one path with its hole', () => {
    const r = vektoriser(ring, STANDARD_VEKTORVALG);
    expect(r.lag).toHaveLength(1);
    expect(r.lag[0]!.farge).toBe('#000000');
    expect(r.lag[0]!.deler).toBe(1);
    const fasit = Math.PI * (60 ** 2 - 30 ** 2);
    expect(Math.abs(flateAv(r.lag[0]!.d) - fasit) / fasit).toBeLessThan(0.03);
    expect(r.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 200 200">/);
  });

  it('inverts: the white becomes the drawing', () => {
    const r = vektoriser(ring, { ...STANDARD_VEKTORVALG, inverter: true });
    // the white outside and the white disc inside, the ring itself is the hole between them
    expect(r.lag[0]!.deler).toBe(2);
  });

  it('drops specks smaller than the limit', () => {
    const flekkete = bilde(200, 200, (x, y) => {
      if (x > 10 && x < 13 && y > 10 && y < 13) return SVART; // 3 × 3 px
      return Math.hypot(x - 100, y - 100) <= 50 ? SVART : HVIT;
    });
    expect(vektoriser(flekkete, { ...STANDARD_VEKTORVALG, flekker: 0 }).lag[0]!.deler).toBe(2);
    expect(vektoriser(flekkete, { ...STANDARD_VEKTORVALG, flekker: 20 }).lag[0]!.deler).toBe(1);
  });

  it('keeps colours apart and leaves out the background', () => {
    const tofarget = bilde(240, 120, (x, y) => {
      if (y > 20 && y < 100 && x > 20 && x < 100) return SVART;
      if (y > 20 && y < 100 && x > 140 && x < 220) return ROD;
      return HVIT;
    });
    const r = vektoriser(tofarget, { ...STANDARD_VEKTORVALG, farger: 2 });
    expect(r.lag).toHaveLength(2);
    expect(r.svg).not.toMatch(/fill="#f[0-9a-f]f[0-9a-f]f[0-9a-f]"/);
    const rod = r.lag.find((l) => parseInt(l.farge.slice(1, 3), 16) > 150)!;
    expect(rod).toBeDefined();
    expect(Math.abs(flateAv(rod.d) - 80 * 80) / (80 * 80)).toBeLessThan(0.05);
  });

  it('does not turn blended edge pixels into colours of their own', () => {
    // soft edges: each shape fades into the white over 6 px
    const myk = (r: number, kant: number, f: Rgba): Rgba => {
      const t = Math.max(0, Math.min(1, (kant - r) / 6 + 0.5));
      return [255 + (f[0] - 255) * t, 255 + (f[1] - 255) * t, 255 + (f[2] - 255) * t, 255];
    };
    const logo = bilde(300, 150, (x, y) => {
      const a = Math.hypot(x - 75, y - 75);
      if (a < 60) return myk(a, 50, SVART);
      return myk(Math.hypot(x - 225, y - 75), 50, ROD);
    });
    const r = vektoriser(logo, { ...STANDARD_VEKTORVALG, farger: 2 });
    expect(r.lag).toHaveLength(2);
    expect(r.lag.every((l) => l.deler === 1)).toBe(true);
    const [mork, rod] = [...r.lag].sort((a, b) => a.farge.localeCompare(b.farge));
    expect(parseInt(mork!.farge.slice(1, 3), 16)).toBeLessThan(80);
    expect(parseInt(rod!.farge.slice(5, 7), 16)).toBeLessThan(100);
  });

  it('treats transparency as background', () => {
    const utklipp = bilde(100, 100, (x, y) => (Math.hypot(x - 50, y - 50) <= 30 ? SVART : [0, 0, 0, 0]));
    const flat = flatUtAlfa(utklipp);
    expect([...flat.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    const r = vektoriser(utklipp, STANDARD_VEKTORVALG);
    expect(r.lag[0]!.deler).toBe(1);
  });

  it('says so when nothing is left', () => {
    const tom = bilde(50, 50, () => HVIT);
    expect(() => vektoriser(tom, { ...STANDARD_VEKTORVALG, terskel: 10 })).toThrow(VektorFeil);
  });

  it('finds the threshold between two tones and the background along the edge', () => {
    const t = otsu(ring);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(255);
    const pal = [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ];
    expect(bakgrunnIndeks(ring, pal)).toBe(1);
  });

  it('scales small images up and big ones down', () => {
    expect(sporskala(200, 100)).toBe(3);
    expect(sporskala(2400, 800)).toBe(0.5);
    expect(sporskala(800, 800)).toBe(1);
  });
});
