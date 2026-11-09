import { areal, regionFraRinger } from '../../../geometri/polygon';
import { stiTilRinger } from '../../../geometri/stidata';
import type { Piksler } from '../vektoriser';
import { finnKjeder } from './kanter';
import {
  byggModell,
  delSti,
  flyttAnker,
  forenkle,
  gjorRett,
  slaSammenDeler,
  slettDeler,
  tall,
  tilSvg,
  vater,
  type Vektormodell,
} from './modell';
import { lagRegionkart, STANDARD_REGIONVALG, type Regionvalg } from './regioner';

type Rgba = [number, number, number, number];
function bilde(b: number, h: number, farge: (x: number, y: number) => Rgba): Piksler {
  const data = new Uint8ClampedArray(b * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) data.set(farge(x + 0.5, y + 0.5), (y * b + x) * 4);
  return { width: b, height: h, data };
}
const HVIT: Rgba = [255, 255, 255, 255];
const SVART: Rgba = [20, 20, 20, 255];
const ROD: Rgba = [220, 30, 40, 255];
const BLA: Rgba = [30, 60, 220, 255];

const flate = (d: string) => areal(regionFraRinger(stiTilRinger(d), 'nonzero'));
const delFlate = (m: Vektormodell, id: number) => flate(delSti(m, m.deler[id]!));

/** Red and blue halves of a square on white: three regions meeting along shared borders. */
const halvdeler = bilde(120, 120, (x, y) => {
  if (x < 20 || x > 100 || y < 20 || y > 100) return HVIT;
  return x < 60 ? ROD : BLA;
});
const toFarger: Regionvalg = { ...STANDARD_REGIONVALG, farger: 2 };

describe('regioner', () => {
  it('finds the two coloured halves and leaves out the background', () => {
    const k = lagRegionkart(halvdeler, null, toFarger);
    expect(k.regioner).toHaveLength(2);
    expect(k.regioner.map((r) => r.areal).sort()).toEqual([3200, 3200]);
  });

  it('merges a speck into its neighbour instead of leaving a hole', () => {
    const flekk = bilde(100, 100, (x, y) =>
      x > 40 && x < 43 && y > 40 && y < 43 ? HVIT : x > 10 && x < 90 && y > 10 && y < 90 ? SVART : HVIT,
    );
    const med = lagRegionkart(flekk, null, { ...STANDARD_REGIONVALG, minHull: 0, minAreal: 0 });
    const uten = lagRegionkart(flekk, null, { ...STANDARD_REGIONVALG, minHull: 20 });
    const m1 = byggModell(med);
    const m2 = byggModell(uten);
    expect(m1.deler[0]!.ringer).toHaveLength(2);
    expect(m2.deler[0]!.ringer).toHaveLength(1);
  });

  it('honours the mask', () => {
    const maske = new Uint8Array(120 * 120);
    for (let y = 0; y < 120; y++) for (let x = 0; x < 60; x++) maske[y * 120 + x] = 1;
    const k = lagRegionkart(halvdeler, maske, toFarger);
    expect(k.regioner).toHaveLength(1);
  });

  it('drops thin lines by thickness', () => {
    const strek = bilde(100, 100, (x, y) =>
      (y > 48 && y < 50 && x > 5 && x < 95) || Math.hypot(x - 30, y - 25) < 15 ? SVART : HVIT,
    );
    const alle = lagRegionkart(strek, null, { ...STANDARD_REGIONVALG, minTykkelse: 0 });
    const tykke = lagRegionkart(strek, null, { ...STANDARD_REGIONVALG, minTykkelse: 4 });
    expect(alle.regioner).toHaveLength(2);
    expect(tykke.regioner).toHaveLength(1);
  });
});

describe('shared borders', () => {
  it('traces each border once, with a region on each side', () => {
    const k = lagRegionkart(halvdeler, null, toFarger);
    const kjeder = finnKjeder(k.etikett, k.bredde, k.hoyde);
    // the middle border, and the two outer borders of the halves
    expect(kjeder).toHaveLength(3);
    const midt = kjeder.find((c) => c.venstre >= 0 && c.hoyre >= 0)!;
    expect(midt).toBeDefined();
  });

  it('neighbours meet exactly: the areas add up with no overlap or gap', () => {
    const k = lagRegionkart(halvdeler, null, toFarger);
    const m = byggModell(k);
    const a = delFlate(m, 0),
      b = delFlate(m, 1);
    expect(a).toBeCloseTo(3200, 0);
    expect(b).toBeCloseTo(3200, 0);
    // the union of both is the whole square
    const begge = flate(delSti(m, m.deler[0]!) + delSti(m, m.deler[1]!));
    expect(begge).toBeCloseTo(6400, 0);
  });

  it('calculate shape: a square becomes four straight sides and four points', () => {
    const k = lagRegionkart(
      bilde(100, 100, (x, y) => (x > 20 && x < 80 && y > 20 && y < 80 ? SVART : HVIT)),
      null,
      STANDARD_REGIONVALG,
    );
    const m = byggModell(k);
    const t = tall(m);
    expect(t.deler).toBe(1);
    expect(t.punkter).toBe(4);
    expect(t.kurvesegmenter).toBe(0);
    expect(t.linjesegmenter).toBe(4);
    expect(delFlate(m, 0)).toBeCloseTo(3600, 0);
  });

  it('a circle becomes a few smooth curves that stay on the border', () => {
    const k = lagRegionkart(
      bilde(200, 200, (x, y) => (Math.hypot(x - 100, y - 100) < 70 ? SVART : HVIT)),
      null,
      STANDARD_REGIONVALG,
    );
    const m = byggModell(k);
    const t = tall(m);
    expect(t.punkter).toBeLessThanOrEqual(12);
    expect(t.linjesegmenter).toBe(0);
    const fasit = Math.PI * 70 * 70;
    expect(Math.abs(delFlate(m, 0) - fasit) / fasit).toBeLessThan(0.01);
  });

  it('moving a shared point moves it for both neighbours', () => {
    const m = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const midt = m.kurver.find((c) => c && c.venstre >= 0 && c.hoyre >= 0)!;
    const ny = flyttAnker(m, midt.id, 0, midt.ankre[0]!.x + 5, midt.ankre[0]!.y);
    const begge = flate(delSti(ny, ny.deler[0]!) + delSti(ny, ny.deler[1]!));
    const sum = delFlate(ny, 0) + delFlate(ny, 1);
    expect(sum).toBeCloseTo(begge, 3);
  });
});

describe('editing', () => {
  it('merges two parts into one and removes the border between them', () => {
    const m = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const ny = slaSammenDeler(m, [0, 1]);
    const t = tall(ny);
    expect(t.deler).toBe(1);
    expect(t.kanter).toBe(1);
    expect(t.punkter).toBe(4);
    const del = ny.deler.find((d) => d)!;
    expect(flate(delSti(ny, del))).toBeCloseTo(6400, 0);
  });

  it('deletes a part', () => {
    const m = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const ny = slettDeler(m, [0]);
    expect(tall(ny).deler).toBe(1);
    expect(tilSvg(ny)).toContain('<path');
  });

  it('simplify uses fewer points, straighten makes lines', () => {
    const blob = bilde(200, 200, (x, y) => {
      const r = 60 + 8 * Math.sin(Math.atan2(y - 100, x - 100) * 5);
      return Math.hypot(x - 100, y - 100) < r ? SVART : HVIT;
    });
    const m = byggModell(lagRegionkart(blob, null, STANDARD_REGIONVALG));
    const ider = m.kurver.filter((k) => k).map((k) => k!.id);
    const f = forenkle(m, ider, 1);
    expect(tall(f).punkter).toBeLessThan(tall(m).punkter);
    const r = gjorRett(m, ider);
    expect(tall(r).kurvesegmenter).toBe(0);
  });
});

describe('levelling', () => {
  it('makes nearly horizontal lines horizontal and keeps neighbours attached', () => {
    const m = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const k = m.kurver.find((c) => c && c.venstre >= 0 && c.hoyre >= 0)!;
    const skjev = flyttAnker(m, k.id, 0, k.ankre[0]!.x + 1.5, k.ankre[0]!.y);
    const rett = vater(skjev, [k.id]);
    const a = rett.kurver[k.id]!.ankre;
    expect(a[0]!.x).toBeCloseTo(a[a.length - 1]!.x, 6);
    const begge = flate(delSti(rett, rett.deler[0]!) + delSti(rett, rett.deler[1]!));
    expect(delFlate(rett, 0) + delFlate(rett, 1)).toBeCloseTo(begge, 3);
  });
});
