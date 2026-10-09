import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { SvgKilde } from '../../core/dokument';
import plugin from './index';
import { leggTil } from './handlinger';
import { lastFonter } from './modell';
import {
  banelinje,
  lagMonster,
  langsLinje,
  linjelengde,
  monsterPlasseringer,
  STANDARD_MONSTER,
} from './monster';

beforeAll(async () => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
  await lastFonter(plugin.nyttDokument());
});

const rute = (): SvgKilde => ({
  type: 'svg',
  stier: ['M-2 -2L2 -2L2 2L-2 2Z'],
  filnavn: 'rute',
  fyllregel: 'nonzero',
});

describe('The Pattern tool', () => {
  it('places copies in a direction, with the spacing and an extra turn each', () => {
    const p = monsterPlasseringer(
      { x: 0, y: 0 },
      { ...STANDARD_MONSTER, antall: 3, avstand: 10, vinkel: 90, rotasjon: 15 },
      null,
    );
    expect(p).toHaveLength(3);
    expect(p[0]!.dx).toBeCloseTo(0, 6);
    expect(p[0]!.dy).toBeCloseTo(10, 6);
    expect(p[2]!.dy).toBeCloseTo(30, 6);
    expect(p[2]!.drot).toBe(45);
  });

  it('walks along a polyline and turns with it', () => {
    const linje = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(linjelengde(linje)).toBe(20);
    const a = langsLinje(linje, 15);
    expect(a.p).toEqual({ x: 10, y: 5 });
    expect(a.vinkel).toBe(90);
    // spacing 0 spreads the copies from the start to the end
    const p = monsterPlasseringer(
      { x: 0, y: 0 },
      { ...STANDARD_MONSTER, modus: 'bane', antall: 3, avstand: 0, folgBane: true },
      linje,
    );
    expect(p.map((q) => [q.dx, q.dy])).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(p[0]!.drot).toBe(0);
    expect(p[2]!.drot).toBe(90);
    expect(monsterPlasseringer({ x: 0, y: 0 }, { ...STANDARD_MONSTER, modus: 'bane' }, null)).toEqual([]);
  });

  it('makes ordinary copies in the same layer as one undo step', () => {
    const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
    const o = leggTil(benk, rute(), { x: 0, y: 0 }, 'Rute')!;
    benk.velg({ objekter: [o.id], lag: o.lagId });
    const antall = Object.keys(benk.dok.objekter).length;
    expect(lagMonster(benk, { ...STANDARD_MONSTER, antall: 4, avstand: 10, vinkel: 0 })).toBe(4);
    expect(Object.keys(benk.dok.objekter).length).toBe(antall + 4);
    const kopier = Object.values(benk.dok.objekter).filter((x) => x.navn === 'Rute' && x.id !== o.id);
    expect(kopier.map((k) => k.transform.x).sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
    expect(kopier.every((k) => k.lagId === o.lagId)).toBe(true);
    benk.angre();
    expect(Object.keys(benk.dok.objekter).length).toBe(antall);
    benk.avslutt();
  });

  it('follows another vector as the path, and says so when none is chosen', () => {
    const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
    const o = leggTil(benk, rute(), { x: 0, y: 0 }, 'Rute')!;
    const bane = leggTil(
      benk,
      { type: 'svg', stier: ['M0 20L40 20'], filnavn: 'bane', fyllregel: 'nonzero' },
      { x: 0, y: 0 },
      'Bane',
    )!;
    expect(banelinje(benk.dok.objekter[bane.id]!)).toEqual([
      { x: 0, y: 20 },
      { x: 40, y: 20 },
    ]);
    benk.velg({ objekter: [o.id], lag: o.lagId });
    expect(lagMonster(benk, { ...STANDARD_MONSTER, modus: 'bane', baneId: null })).toBe(0);
    expect(
      lagMonster(benk, { ...STANDARD_MONSTER, modus: 'bane', baneId: bane.id, antall: 3, avstand: 0 }),
    ).toBe(3);
    const ys = Object.values(benk.dok.objekter)
      .filter((x) => x.navn === 'Rute' && x.id !== o.id)
      .map((x) => x.transform.y);
    expect(ys.every((y) => Math.abs(y - 20) < 1e-6)).toBe(true);
    benk.avslutt();
  });
});
