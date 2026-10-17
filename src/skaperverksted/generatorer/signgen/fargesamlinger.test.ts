import {
  SAMLINGER,
  SAMLINGSGRUPPER,
  erHex,
  fargenavn,
  filamenterForSamling,
  kontrast,
} from './fargesamlinger';
import { alleMaterialer, finnMateriale } from '../../core/materialer';

describe('The colour collections', () => {
  it('are about a hundred, each with a name, a group and valid colours, with no duplicates', () => {
    expect(SAMLINGER.length).toBeGreaterThanOrEqual(100);
    expect(new Set(SAMLINGER.map((s) => s.id)).size).toBe(SAMLINGER.length);
    expect(new Set(SAMLINGER.map((s) => s.navn)).size).toBe(SAMLINGER.length);
    expect(new Set(SAMLINGER.map((s) => s.farger.join()))).toHaveProperty('size', SAMLINGER.length);
    for (const s of SAMLINGER) {
      expect(SAMLINGSGRUPPER).toContain(s.gruppe);
      expect(s.farger.length).toBeGreaterThanOrEqual(4);
      expect(s.farger.length).toBeLessThanOrEqual(5);
      expect(s.farger.every(erHex)).toBe(true);
      expect(new Set(s.farger).size).toBe(s.farger.length);
    }
    for (const g of SAMLINGSGRUPPER)
      expect(SAMLINGER.filter((s) => s.gruppe === g).length).toBeGreaterThanOrEqual(10);
  });

  it('have a readable text and base pair, so the first sign made from them can be read', () => {
    const darlige = SAMLINGER.filter((s) => kontrast(s.farger[0]!, s.farger[1]!) < 4.5).map((s) => s.navn);
    expect(darlige).toEqual([]);
  });

  it('give a filament per colour, reuse the one a colour already has, and name colours in plain words', () => {
    const s = SAMLINGER.find((x) => x.navn === 'Fjordtåke')!;
    const ider = filamenterForSamling(s.farger);
    expect(ider).toHaveLength(s.farger.length);
    expect(ider.map((id) => finnMateriale(id).hex.toLowerCase())).toEqual(s.farger);
    // asking again gives the same filaments and no new ones
    const antall = alleMaterialer().length;
    expect(filamenterForSamling(s.farger)).toEqual(ider);
    expect(alleMaterialer()).toHaveLength(antall);
    // a catalogue colour is used as it is
    expect(filamenterForSamling(['#f1efe9'])).toEqual(['pla-kritthvit']);
    expect(fargenavn('#0f2d52')).toBe('Mørk blå');
    expect(fargenavn('#ffffff')).toBe('Hvit');
    expect(fargenavn('#8b8d8f')).toBe('Grå');
  });
});
