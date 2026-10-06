import { describe, expect, it } from 'vitest';
import { tolkLengde, mm, tall } from './enheter';
import { Historikk } from './historikk';
import { rutenettnivaa, snapTil } from './rutenett';
import { forhandsvalg, profilOverheng, samplerProfil, rettProfil, validerProfil } from './profil';
import { anvend, inverter, multipliser, tilMatrise } from './geometri2d';
import { fraJson, tilJson, tomtDokument, DokumentFeil } from './dokument';

describe('enheter', () => {
  it('tolker mm med komma, enheter og regning', () => {
    expect(tolkLengde('12,5')).toBe(12.5);
    expect(tolkLengde('40+2,5')).toBe(42.5);
    expect(tolkLengde('3*12')).toBe(36);
    expect(tolkLengde('10 cm')).toBe(100);
    expect(tolkLengde('(10+2)/4')).toBe(3);
    expect(tolkLengde('-5')).toBe(-5);
  });
  it('avviser ugyldig inndata', () => {
    expect(tolkLengde('')).toBeNull();
    expect(tolkLengde('abc')).toBeNull();
    expect(tolkLengde('1/0')).toBeNull();
    expect(tolkLengde('2+')).toBeNull();
    expect(tolkLengde('alert(1)')).toBeNull();
  });
  it('formaterer norsk', () => {
    expect(mm(12.54)).toBe('12,5 mm');
    expect(tall(3)).toBe('3');
  });
});

describe('historikk', () => {
  it('angrer og gjør om', () => {
    const h = new Historikk({ n: 0 });
    h.utfor({ navn: 'a', anvend: (s) => ({ n: s.n + 1 }) });
    h.utfor({ navn: 'b', anvend: (s) => ({ n: s.n + 1 }) });
    expect(h.naa.n).toBe(2);
    h.angre();
    expect(h.naa.n).toBe(1);
    h.gjorOm();
    expect(h.naa.n).toBe(2);
  });
  it('slår sammen dra-bevegelser til ett steg', () => {
    let tid = 0;
    const h = new Historikk({ n: 0 }, 50, 800, () => tid);
    for (let i = 0; i < 5; i++) {
      tid += 16;
      h.utfor({ navn: 'flytt', slaSammen: 'dra', anvend: (s) => ({ n: s.n + 1 }) });
    }
    expect(h.naa.n).toBe(5);
    h.angre();
    expect(h.naa.n).toBe(0);
  });
  it('ny endring tømmer gjør-om', () => {
    const h = new Historikk({ n: 0 });
    h.utfor({ navn: 'a', anvend: (s) => ({ n: s.n + 1 }) });
    h.angre();
    h.utfor({ navn: 'b', anvend: (s) => ({ n: s.n + 5 }) });
    expect(h.kanGjoreOm).toBe(false);
  });
  it('ignorerer endringer uten effekt', () => {
    const h = new Historikk({ n: 0 });
    h.utfor({ navn: 'ingen', anvend: (s) => s });
    expect(h.kanAngre).toBe(false);
  });
  it('viser trinnene med navn: det som kan angres (eldst først) og gjøres om (neste først)', () => {
    const h = new Historikk({ n: 0 });
    for (const navn of ['a', 'b', 'c']) h.utfor({ navn, anvend: (s) => ({ n: s.n + 1 }) });
    h.angre();
    h.angre();
    expect(h.trinn).toEqual({ angre: ['a'], gjorOm: ['b', 'c'] });
  });
});

describe('rutenett', () => {
  it('viser cm når man zoomer ut og mm når man zoomer inn', () => {
    const ut = rutenettnivaa(0.5);
    expect(ut.enhet).toBe('cm');
    expect(ut.liten * 0.5).toBeGreaterThanOrEqual(8);
    const inn = rutenettnivaa(40);
    expect(inn.liten).toBeLessThanOrEqual(0.5);
    expect(inn.enhet).toBe('mm');
  });
  it('snapper', () => {
    expect(snapTil(12.4, 5)).toBe(10);
    expect(snapTil(12.6, 5)).toBe(15);
  });
});

describe('profil', () => {
  it('forhåndsvalgene heller aldri utover, en utovervendt profil gjør det', () => {
    for (const type of ['rett', 'fas', 'avrundet', 'konveks', 'konkav', 's-kurve', 'trapp'] as const) {
      expect(profilOverheng(forhandsvalg(type, 1.5), 3)).toBe(0);
    }
    const utover = {
      ...rettProfil(),
      type: 'egendefinert' as const,
      bredde: 3,
      punkter: [
        { u: 1, t: 0 },
        { u: 0, t: 1 },
      ],
    };
    // 3 mm out over 2 mm height: atan(3/2) ≈ 56°
    expect(profilOverheng(utover, 2)).toBeCloseTo(56.3, 0);
  });

  it('rett profil gir loddrett vegg', () => {
    expect(samplerProfil(rettProfil())).toEqual([
      { inset: 0, t: 0 },
      { inset: 0, t: 1 },
    ]);
  });
  it('forhåndsvalg går fra bunn til topp og er gyldige', () => {
    for (const t of ['rett', 'avrundet', 'konveks', 'konkav', 'trapp', 'fas'] as const) {
      const p = forhandsvalg(t, 2, 3);
      expect(validerProfil(p)).toBeNull();
      const s = samplerProfil(p);
      expect(s[0]!.t).toBe(0);
      expect(s.at(-1)!.t).toBe(1);
      for (let i = 1; i < s.length; i++) expect(s[i]!.t).toBeGreaterThanOrEqual(s[i - 1]!.t);
      for (const x of s) expect(x.inset).toBeLessThanOrEqual(2 + 1e-9);
    }
  });
  it('konveks ender med full innrykk på toppen', () => {
    const s = samplerProfil(forhandsvalg('konveks', 3));
    expect(s.at(-1)!.inset).toBeCloseTo(3);
  });
});

describe('geometri2d', () => {
  it('invers opphever transform', () => {
    const m = tilMatrise({ x: 10, y: -4, rotasjon: 33, skalaX: 2, skalaY: 0.5 });
    const p = anvend(multipliser(inverter(m), m), { x: 3, y: 7 });
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(7);
  });
});

describe('dokument', () => {
  it('serialiserer og leser tilbake', () => {
    const d = tomtDokument('signgen', 'Test', { bredde: 200, dybde: 200, hoyde: 100, printerProfilId: 'x' });
    expect(fraJson(tilJson(d))).toEqual(d);
  });
  it('avviser ugyldige filer', () => {
    expect(() => fraJson('nei')).toThrow(DokumentFeil);
    expect(() => fraJson('{"a":1}')).toThrow(DokumentFeil);
  });
});
