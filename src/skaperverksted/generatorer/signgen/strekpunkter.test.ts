import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import { nyttStrek, PROFILER } from '../../geometri/strek';
import plugin from './index';
import { lastFonter } from './modell';
import { leggTilStrek } from './paint';
import { fjernStrekpunkt, flyttStrekpunkt, leggTilStrekpunkt, MIN_STREKPUNKTER } from './strekpunkter';

beforeAll(async () => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
  await lastFonter(plugin.nyttDokument());
});

function benkMedStrek() {
  const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
  const strek = nyttStrek(
    [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ],
    3,
    'penselstrok',
  );
  const id = leggTilStrek(benk, strek)!;
  const hent = () => {
    const k = benk.dok.objekter[id]!.kilde;
    if (k.type !== 'svg' || !k.strek) throw new Error('ikke en strek');
    return k;
  };
  return { benk, id, hent };
}

describe('The centre line of a Paint stroke', () => {
  it('moves a point, keeps the width profile, and undoes the drag in one step', () => {
    const { benk, id, hent } = benkMedStrek();
    const bredderFor = JSON.stringify(hent().strek!.breddepunkter);
    const stiFor = hent().stier[0];
    const o = benk.dok.objekter[id]!;
    // drag the middle point upwards in several moves: one undo step
    for (const dy of [1, 2, 4]) flyttStrekpunkt(benk, id, 1, { x: o.transform.x + 0, y: o.transform.y + dy });
    benk.historikk.avsluttSammenslaing();
    expect(hent().stier[0]).not.toBe(stiFor);
    expect(JSON.stringify(hent().strek!.breddepunkter)).toBe(bredderFor);
    expect(hent().strek!.bredde).toBe(3);
    benk.angre();
    expect(hent().stier[0]).toBe(stiFor);
    benk.avslutt();
  });

  it('adds a point on the nearest segment and removes one, but keeps two', () => {
    const { benk, id, hent } = benkMedStrek();
    const o = benk.dok.objekter[id]!;
    // near the first segment's middle
    const ny = leggTilStrekpunkt(benk, id, { x: o.transform.x - 5, y: o.transform.y + 0.5 });
    expect(ny).toBe(1);
    expect(hent().strek!.punkter).toHaveLength(4);
    expect(fjernStrekpunkt(benk, id, 1)).toBe(true);
    expect(hent().strek!.punkter).toHaveLength(3);
    // with no position the longest segment gets the point
    expect(leggTilStrekpunkt(benk, id, null)).not.toBeNull();
    expect(hent().strek!.punkter).toHaveLength(4);
    while (hent().strek!.punkter.length > MIN_STREKPUNKTER) fjernStrekpunkt(benk, id, 1);
    expect(fjernStrekpunkt(benk, id, 0)).toBe(false);
    expect(hent().strek!.punkter).toHaveLength(MIN_STREKPUNKTER);
    expect(hent().strek!.breddepunkter).toEqual(PROFILER.penselstrok);
    benk.avslutt();
  });
});
