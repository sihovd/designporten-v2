import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { sjekkManifold } from '../../geometri/mesh';
import { areal, unionAlle } from '../../geometri/polygon';
import {
  fargeplasser,
  leggTilLag,
  leggTilObjekt,
  nyForm,
  nyttLag,
  nyttObjekt,
  oppdaterLag,
  oppdaterObjekter,
  settFarge,
  settPalett,
} from './dokument';
import { fargedeler, byggSigngen, lagRegion, lastFonter, objektFarge } from './modell';
import { brukFargeprofil, finnFarge } from './batch';
import { finnLag } from '../../core/dokument';
import { skiltMedPlate } from './testskilt';

beforeAll(async () => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
  await lastFonter(skiltMedPlate());
});

/** A layer with two squares side by side, a gap of 4 mm between them. */
function toFirkanter() {
  let d = skiltMedPlate();
  const lag = nyttLag('Pynt', 'pla-lilla', 1);
  d = leggTilLag(d, lag);
  const a = nyttObjekt(lag.id, nyForm('rektangel', 10, 10), { x: -10, y: 0 });
  const b = nyttObjekt(lag.id, nyForm('rektangel', 10, 10), { x: 10, y: 0 });
  d = leggTilObjekt(leggTilObjekt(d, a), b);
  return { d, lagId: lag.id, a, b };
}

describe('Objects with a colour of their own in the same layer', () => {
  it('prints in the layer colour until an object gets another', () => {
    const { d, lagId, a } = toFirkanter();
    const lag = finnLag(d, lagId)!;
    expect(objektFarge(lag, a)).toBe('pla-lilla');
    expect(fargedeler(d, lag, lagRegion(d, lagId)!).map((x) => x.materialId)).toEqual(['pla-lilla']);
  });

  it('splits the layer by colour without changing its outline', () => {
    const { d: d0, lagId, b } = toFirkanter();
    // the same outline offset on the whole layer, whatever the colours
    const medKontur = oppdaterLag(d0, lagId, {
      kontur: { avstand: 2, hjorne: 'rund', kunRing: false, ringBredde: 1 },
    });
    const d = oppdaterObjekter(medKontur, [b.id], (o) => ({ ...o, materialId: 'pla-cyan' }));
    const lag = finnLag(d, lagId)!;
    const hele = lagRegion(d, lagId)!;
    // the layer's region is the same with and without the second colour
    expect(areal(hele)).toBeCloseTo(areal(lagRegion(medKontur, lagId)!), 3);
    const deler = fargedeler(d, lag, hele);
    expect(deler.map((x) => x.materialId).sort()).toEqual(['pla-cyan', 'pla-lilla']);
    // together the colour parts cover the same area, with no overlap
    expect(deler.reduce((s, x) => s + areal(x.region), 0)).toBeCloseTo(areal(hele), 2);
    expect(areal(unionAlle(deler.map((x) => x.region)))).toBeCloseTo(areal(hele), 2);
  });

  it('builds one closed part per colour at the layer height, and one colour slot each', async () => {
    const { d: d0, lagId, b } = toFirkanter();
    const d = oppdaterObjekter(d0, [b.id], (o) => ({ ...o, materialId: 'pla-cyan' }));
    const lag = finnLag(d, lagId)!;
    const modell = await byggSigngen(d);
    const deler = modell.deler.filter((x) => x.id === lagId || x.id.startsWith(`${lagId}~`));
    expect(deler.map((x) => x.materialId).sort()).toEqual(['pla-cyan', 'pla-lilla']);
    for (const del of deler) {
      expect(sjekkManifold(del.mesh).lukket).toBe(true);
      const z = [...del.mesh.posisjoner].filter((_, i) => i % 3 === 2);
      expect(Math.max(...z)).toBeCloseTo(lag.zBunn + lag.hoyde, 3);
    }
    // the colours show up as colour slots too
    expect(fargeplasser(d).map((p) => p.materialId)).toEqual(
      expect.arrayContaining(['pla-lilla', 'pla-cyan']),
    );
  });

  it('lets the front object win where two colours overlap', () => {
    let d = skiltMedPlate();
    const lag = nyttLag('Pynt', 'pla-lilla', 1);
    d = leggTilLag(d, lag);
    const bak = nyttObjekt(lag.id, nyForm('rektangel', 20, 20), { x: 0, y: 0 });
    const fram = { ...nyttObjekt(lag.id, nyForm('rektangel', 8, 8), { x: 0, y: 0 }), materialId: 'pla-cyan' };
    d = leggTilObjekt(leggTilObjekt(d, bak), fram);
    const deler = fargedeler(d, finnLag(d, lag.id)!, lagRegion(d, lag.id)!);
    const cyan = deler.find((x) => x.materialId === 'pla-cyan')!;
    const lilla = deler.find((x) => x.materialId === 'pla-lilla')!;
    expect(areal(cyan.region)).toBeCloseTo(64, 1);
    expect(areal(lilla.region)).toBeCloseTo(400 - 64, 1);
  });

  it('follows the colour profile and can be set as a colour slot', () => {
    const { d: d0, lagId, b } = toFirkanter();
    const d1 = settFarge(d0, b.id, 'pla-cyan');
    expect(d1.objekter[b.id]!.materialId).toBe('pla-cyan');
    // a profile without cyan swaps the object's colour for the closest one in it
    const d2 = settPalett(d1, ['pla-lilla', 'pla-svart']);
    expect(d2.objekter[b.id]!.materialId).not.toBe('pla-cyan');
    expect(['pla-lilla', 'pla-svart']).toContain(d2.objekter[b.id]!.materialId);
    // a CSV colour profile maps the master's colours in order, objects included
    const d3 = brukFargeprofil(d1, ['pla-lilla', 'pla-cyan'], {
      id: 'p',
      navn: 'P',
      farger: ['pla-svart', 'pla-rosa'],
    });
    expect(finnLag(d3, lagId)!.materialId).toBe('pla-svart');
    expect(d3.objekter[b.id]!.materialId).toBe('pla-rosa');
  });

  it('reads a colour code in a CSV value', () => {
    expect(finnFarge('#883dff')).toBe('pla-lilla');
    expect(finnFarge('#883DFF')).toBe('pla-lilla');
  });
});
