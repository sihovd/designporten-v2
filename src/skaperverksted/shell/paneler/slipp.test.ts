import { describe, expect, it } from 'vitest';
import { finnMal, malRekt, type GruppeRekt } from './slipp';

const flate = { x: 0, y: 0, b: 1000, h: 600 };
const kolonner = [
  { side: 'venstre' as const, rekt: { x: 0, y: 0, b: 300, h: 600 } },
  { side: 'hoyre' as const, rekt: { x: 700, y: 0, b: 300, h: 600 } },
];
const grupper: GruppeRekt[] = [
  { id: 'lag', rekt: { x: 0, y: 0, b: 300, h: 300 }, dokk: 'venstre', indeks: 0 },
  { id: 'hist', rekt: { x: 0, y: 300, b: 300, h: 100 }, dokk: 'venstre', indeks: 1 },
  { id: 'egen', rekt: { x: 700, y: 0, b: 300, h: 600 }, dokk: 'hoyre', indeks: 0 },
  { id: 'flyt', rekt: { x: 400, y: 100, b: 200, h: 200 }, dokk: null, indeks: 0 },
];

describe('finnMal', () => {
  it('setter inn før og etter en dokket gruppe, og lager fane i midten', () => {
    expect(finnMal({ x: 100, y: 20 }, flate, grupper, kolonner, 'egen')).toEqual({
      type: 'dokk',
      side: 'venstre',
      indeks: 0,
    });
    expect(finnMal({ x: 100, y: 290 }, flate, grupper, kolonner, 'egen')).toEqual({
      type: 'dokk',
      side: 'venstre',
      indeks: 1,
    });
    expect(finnMal({ x: 100, y: 150 }, flate, grupper, kolonner, 'egen')).toEqual({
      type: 'fane',
      gruppeId: 'lag',
    });
  });

  it('lager fane på en flytende gruppe, også langs kanten', () => {
    expect(finnMal({ x: 410, y: 110 }, flate, grupper, kolonner, 'lag')).toEqual({
      type: 'fane',
      gruppeId: 'flyt',
    });
  });

  it('dokker i kanten når bare tomrom er under, og flyter ellers', () => {
    expect(finnMal({ x: 50, y: 500 }, flate, grupper, kolonner, 'egen')).toEqual({
      type: 'dokk',
      side: 'venstre',
      indeks: Infinity,
    });
    expect(finnMal({ x: 990, y: 500 }, flate, [], [], 'x')).toEqual({
      type: 'dokk',
      side: 'hoyre',
      indeks: Infinity,
    });
    expect(finnMal({ x: 500, y: 500 }, flate, grupper, kolonner, 'egen')).toEqual({ type: 'flyt' });
    expect(finnMal({ x: -20, y: 10 }, flate, grupper, kolonner, 'egen')).toEqual({ type: 'flyt' });
  });

  it('gjør ingenting når en dokket gruppe slippes over seg selv', () => {
    expect(finnMal({ x: 100, y: 150 }, flate, grupper, kolonner, 'lag')).toEqual({ type: 'ingen' });
  });

  it('ignorerer gruppen som dras selv når den flyter', () => {
    expect(finnMal({ x: 450, y: 150 }, flate, grupper, kolonner, 'flyt')).toEqual({ type: 'flyt' });
  });
});

describe('malRekt', () => {
  const dokkB = { venstre: 300, hoyre: 300 };
  it('viser en tynn linje der gruppen settes inn', () => {
    expect(malRekt({ type: 'dokk', side: 'venstre', indeks: 1 }, flate, grupper, kolonner, dokkB)).toEqual({
      x: 0,
      y: 298,
      b: 300,
      h: 4,
    });
    expect(
      malRekt({ type: 'dokk', side: 'venstre', indeks: Infinity }, flate, grupper, kolonner, dokkB),
    ).toEqual({ x: 0, y: 398, b: 300, h: 4 });
  });
  it('viser hele kolonnen når dokken er tom', () => {
    expect(malRekt({ type: 'dokk', side: 'hoyre', indeks: Infinity }, flate, [], [], dokkB)).toEqual({
      x: 700,
      y: 0,
      b: 300,
      h: 600,
    });
  });
  it('viser gruppen ved fane og ingenting ellers', () => {
    expect(malRekt({ type: 'fane', gruppeId: 'flyt' }, flate, grupper, kolonner, dokkB)).toEqual(
      grupper[3]!.rekt,
    );
    expect(malRekt({ type: 'flyt' }, flate, grupper, kolonner, dokkB)).toBeNull();
  });
});
