import { skiltMedPlate } from './testskilt';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { sjekkManifold, volum } from '../../geometri/mesh';
import { areal } from '../../geometri/polygon';
import { forhandsvalg } from '../../core/profil';
import { finnLag } from '../../core/dokument';
import {
  dupliserObjekter,
  flyttLag,
  leggTilLag,
  leggTilObjekt,
  nyForm,
  nyttLag,
  nyttObjekt,
  oppdaterLag,
  slettLag,
  slettObjekter,
} from './dokument';
import { byggSigngen, lagRegion, lastFonter } from './modell';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

describe('Signgen document', () => {
  it('starts with a base plate and a text layer stacked in Z', () => {
    const d = skiltMedPlate();
    expect(d.lag.map((l) => [l.navn, l.zBunn, l.hoyde])).toEqual([
      ['Bunnplate', 0, 3],
      ['Tekst', 3, 1.5],
    ]);
  });

  it('restacks Z when heights and order change', () => {
    let d = skiltMedPlate();
    const [bunn, tekst] = d.lag;
    d = oppdaterLag(d, bunn!.id, { hoyde: 4 });
    expect(finnLag(d, tekst!.id)!.zBunn).toBe(4);
    d = flyttLag(d, tekst!.id, -1);
    expect(d.lag[0]!.id).toBe(tekst!.id);
    expect(finnLag(d, bunn!.id)!.zBunn).toBe(1.5);
  });

  it('adds, duplicates and deletes objects and layers', () => {
    let d = skiltMedPlate();
    const lag = nyttLag('Ramme', 'pla-lilla', 1);
    d = leggTilLag(d, lag);
    const o = nyttObjekt(lag.id, nyForm('ellipse', 10, 10));
    d = leggTilObjekt(d, o);
    const { dok, nye } = dupliserObjekter(d, [o.id]);
    expect(dok.rekkefolge[lag.id]).toHaveLength(2);
    d = slettObjekter(dok, nye);
    expect(d.rekkefolge[lag.id]).toEqual([o.id]);
    d = slettLag(d, lag.id);
    expect(d.lag).toHaveLength(2);
    expect(d.objekter[o.id]).toBeUndefined();
  });
});

describe('Signgen model', () => {
  it('builds one closed part per layer with the right materials and heights', async () => {
    const d = skiltMedPlate();
    const r = await byggSigngen(d);
    expect(r.deler.map((p) => p.materialId)).toEqual(['pla-grafitt', 'pla-kritthvit']);
    for (const p of r.deler) expect(sjekkManifold(p.mesh).lukket).toBe(true);
    const bunnVolum = volum(r.deler[0]!.mesh);
    expect(bunnVolum).toBeCloseTo(areal(lagRegion(d, d.lag[0]!.id)!) * 3, 1);
    expect(r.advarsler.filter((a) => a.niva !== 'info')).toEqual([]);
  });

  it('cuts hanging holes through every layer', async () => {
    let d = skiltMedPlate();
    const a0 = areal(lagRegion(d, d.lag[0]!.id)!);
    d = leggTilObjekt(d, nyttObjekt(d.lag[1]!.id, nyForm('hull', 5, 5), { x: -50 }));
    await lastFonter(d);
    expect(areal(lagRegion(d, d.lag[0]!.id)!)).toBeCloseTo(a0 - Math.PI * 6.25, 0);
  });

  it('applies Kontur and layer influences', async () => {
    let d = skiltMedPlate();
    await lastFonter(d);
    const [bunn, tekst] = d.lag;
    const tekstAreal = areal(lagRegion(d, tekst!.id)!);
    d = oppdaterLag(d, tekst!.id, { kontur: { avstand: 1, hjorne: 'rund', kunRing: false, ringBredde: 1 } });
    expect(areal(lagRegion(d, tekst!.id)!)).toBeGreaterThan(tekstAreal);
    const bunnAreal = areal(lagRegion(d, bunn!.id)!);
    d = oppdaterLag(d, bunn!.id, {
      pavirkninger: [{ kildeLagId: tekst!.id, handling: 'kutt', avstand: 0.5 }],
    });
    expect(areal(lagRegion(d, bunn!.id)!)).toBeLessThan(bunnAreal);
  });

  it('builds profiled layers closed and warns about floating layers and thin details', async () => {
    let d = skiltMedPlate();
    const [bunn, tekst] = d.lag;
    d = oppdaterLag(d, bunn!.id, { profil: forhandsvalg('avrundet', 1.5) });
    let r = await byggSigngen(d);
    expect(sjekkManifold(r.deler[0]!.mesh).lukket).toBe(true);
    // move the text off the plate: it floats
    d = {
      ...d,
      objekter: Object.fromEntries(
        Object.entries(d.objekter).map(([k, o]) => [
          k,
          o.lagId === tekst!.id ? { ...o, transform: { ...o.transform, x: 200 } } : o,
        ]),
      ),
    };
    r = await byggSigngen(d);
    expect(r.advarsler.some((a) => a.tekst.includes('henger i lufta'))).toBe(true);
    expect(r.advarsler.some((a) => a.tekst.includes('utenfor byggeplaten'))).toBe(true);
  });

  it('flags details thinner than the material minimum', async () => {
    let d = skiltMedPlate();
    d = leggTilObjekt(d, nyttObjekt(d.lag[1]!.id, nyForm('rektangel', 20, 0.4), { y: -15 }));
    const r = await byggSigngen(d);
    expect(r.advarsler.some((a) => a.tekst.includes('tynnere enn'))).toBe(true);
  });
});
