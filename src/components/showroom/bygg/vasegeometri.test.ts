import { describe, expect, it } from 'vitest';
import { BUNN_Y, PROFIL, TOPP_Y, kontur, lag, radiusVed, ribber, silhuett, snittliste } from './vasegeometri';

describe('vasegeometri', () => {
  it('passes through every measured profile point', () => {
    for (const [y, r] of PROFIL) expect(radiusVed(y)).toBeCloseTo(r, 6);
  });

  it('clamps outside the vase', () => {
    expect(radiusVed(TOPP_Y - 50)).toBe(PROFIL[0]![1]);
    expect(radiusVed(BUNN_Y + 50)).toBe(PROFIL[PROFIL.length - 1]![1]);
  });

  it('keeps the radius positive and within the widest measured point', () => {
    const maks = Math.max(...PROFIL.map(([, r]) => r));
    for (let y = TOPP_Y; y <= BUNN_Y; y += 3) {
      const r = radiusVed(y);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(maks + 4);
    }
  });

  it('builds paths for contour, sections, ribs and layers', () => {
    const k = kontur(10);
    expect(k.venstre.startsWith('M')).toBe(true);
    expect(k.venstre.split('L')).toHaveLength(11);
    expect(snittliste(5)).toHaveLength(5);
    expect(lag(12)).toHaveLength(12);
    const r = ribber(12, 2.4);
    expect(r.length).toBeGreaterThanOrEqual(6);
    for (const sti of r) expect(sti).toMatch(/^M[\d.-]+ [\d.-]+( L[\d.-]+ [\d.-]+)+$/);
  });

  it('orders layers from the base upwards', () => {
    const [forste, siste] = [lag(3)[0]!, lag(3)[2]!];
    const y = (s: string) => Number(s.split(' ')[1]);
    expect(y(forste)).toBeGreaterThan(y(siste));
  });
});

describe('silhuett', () => {
  it('is a CSS polygon inside the square', () => {
    const s = silhuett();
    expect(s.startsWith('polygon(')).toBe(true);
    const tall = [...s.matchAll(/(-?[\d.]+)%/g)].map((m) => Number(m[1]));
    expect(tall.length).toBeGreaterThan(100);
    for (const t of tall) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(100);
    }
  });
});
