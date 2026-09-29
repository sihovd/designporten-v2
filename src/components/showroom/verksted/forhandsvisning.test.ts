import { describe, expect, it } from 'vitest';
import { nyttSigngenDokument } from '@/skaperverksted/generatorer/signgen/dokument';
import { SIGNGEN_START, drage, lampe, skilt } from './forhandsvisning';

describe('generator previews', () => {
  it("matches Signgen's real starting document", () => {
    const dok = nyttSigngenDokument();
    expect(dok.lag.map((l) => ({ navn: l.navn, hoyde: l.hoyde, materialId: l.materialId }))).toEqual(
      SIGNGEN_START.lag,
    );
    const objekter = Object.values(dok.objekter);
    const plate = objekter.find((o) => o.kilde.type === 'form')!.kilde;
    const tekst = objekter.find((o) => o.kilde.type === 'tekst')!.kilde;
    expect(plate).toMatchObject({
      bredde: SIGNGEN_START.bredde,
      hoyde: SIGNGEN_START.dybde,
      hjorneradius: SIGNGEN_START.radius,
    });
    expect(tekst).toMatchObject({ tekst: SIGNGEN_START.tekst, storrelse: SIGNGEN_START.tekstStorrelse });
  });

  it('draws the starting sign from the Signgen document', () => {
    const s = skilt();
    expect(s.bredde).toBe(120);
    expect(s.lag.map((l) => l.navn)).toEqual(['Bunnplate', 'Tekst']);
    expect(s.lag[1]!.zBunn).toBeCloseTo(3);
    // One slice per print layer.
    expect(s.lag[0]!.skiver.length).toBe(Math.round(3 / s.lagHoyde));
    expect(s.visning.b).toBeGreaterThan(0);
  });

  it('draws the default lamp at its real height', () => {
    const l = lampe();
    expect(l.hoyde).toBe(180);
    expect(l.kontur).toMatch(/^M/);
    expect(l.ribber.length).toBeGreaterThan(100);
    expect(l.ribberVridd).not.toBe(l.ribber);
  });

  it('draws every part of the default dragon with its joint', () => {
    const d = drage();
    expect(d.lengde).toBe(160);
    expect(d.deler.length).toBeGreaterThan(4);
    expect(d.deler[0]!.ledd).toBeNull();
    expect(d.deler.slice(1).every((p) => p.ledd !== null)).toBe(true);
  });
});
