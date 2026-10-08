import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { sjekkManifold } from '../../geometri/mesh';
import { areal, regionBoks } from '../../geometri/polygon';
import { finnLag, type Dokument, type FormKilde, type TekstKilde } from '../../core/dokument';
import {
  leggTilFarge,
  leggTilObjekt,
  nesteFarge,
  nyForm,
  nyttObjekt,
  nyttSigngenDokument,
  oppdaterObjekter,
  palett,
  settPalett,
  startErValgt,
} from './dokument';
import { byggSigngen, erOye, lagRegion, lastFonter, omrissRegioner } from './modell';
import { foreslaKobling, hullanker, lagVarianter, navneboks, tolkCsv } from './batch';
import { FERDIGE_PROFILER, narmesteFarge, STANDARD_PROFIL } from './fargeprofiler';
import { skiltMedPlate } from './testskilt';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

describe('The start sign', () => {
  it('has no base plate: the text layer has a filled outline as its base', () => {
    const d = nyttSigngenDokument();
    expect(d.lag).toHaveLength(1);
    const lag = d.lag[0]!;
    expect(lag).toMatchObject({ tekstlag: true, materialId: STANDARD_PROFIL.farger[0] });
    expect(lag.omriss).toHaveLength(1);
    expect(lag.omriss![0]).toMatchObject({
      navn: 'Underlag',
      type: 'fyll',
      materialId: STANDARD_PROFIL.farger[1],
    });
    expect(Object.values(d.objekter).every((o) => o.kilde.type === 'tekst')).toBe(true);
    expect(startErValgt(d)).toBe(false);
    expect(startErValgt(skiltMedPlate())).toBe(true);
  });

  it('builds without notices', async () => {
    const d = nyttSigngenDokument();
    await lastFonter(d);
    expect((await byggSigngen(d)).advarsler).toEqual([]);
  });

  it('starts from a chosen profile', () => {
    const natur = FERDIGE_PROFILER.find((p) => p.id === 'natur')!;
    const d = nyttSigngenDokument(natur.farger);
    expect(palett(d)).toEqual(natur.farger);
    expect(d.lag[0]!.materialId).toBe(natur.farger[0]);
  });
});

describe('Colour profiles', () => {
  it('has four colours by default and offers unused ones first', () => {
    const d = nyttSigngenDokument();
    expect(palett(d)).toHaveLength(4);
    expect(nesteFarge(d)).toBe(STANDARD_PROFIL.farger[2]);
    expect(palett(leggTilFarge(d, 'silk-gull'))).toHaveLength(5);
  });

  it('swaps colours a new profile drops for the closest one in it', () => {
    const d = settPalett(nyttSigngenDokument(), ['pla-svart', 'pla-signal']);
    // white text becomes the yellow, graphite base becomes black
    expect(d.lag[0]!.materialId).toBe('pla-signal');
    expect(d.lag[0]!.omriss![0]!.materialId).toBe('pla-svart');
    expect(startErValgt(d)).toBe(true);
    expect(narmesteFarge('pla-grafitt', ['pla-kritthvit', 'pla-svart'])).toBe('pla-svart');
  });

  it('gives older projects the colours they already use', () => {
    const d = skiltMedPlate();
    expect(palett(d)).toEqual(['pla-grafitt', 'pla-kritthvit']);
  });
});

describe('Hanging holes and eyes', () => {
  const tekstlag = (d: Dokument) => d.lag.find((l) => l.tekstlag)!;

  it('cuts a hole over the model and makes an eye off it', async () => {
    let d = nyttSigngenDokument();
    await lastFonter(d);
    const lag = tekstlag(d);
    const underlag = lag.omriss![0]!.id;
    const for_ = areal(omrissRegioner(d, lag.id)!.get(underlag)!);
    const kant = regionBoks(omrissRegioner(d, lag.id)!.get(underlag)!);
    // over the base: a hole through it
    const hull = nyttObjekt(lag.id, nyForm('hull', 5, 5), { x: kant.minX + 3, y: 0 });
    d = leggTilObjekt(d, hull);
    expect(erOye(d, hull.id)).toBe(false);
    expect(areal(omrissRegioner(d, lag.id)!.get(underlag)!)).toBeLessThan(for_ - 5);
    // dragged off the edge, touching it: an eye joined to the base, its hole open
    const oye = oppdaterObjekter(d, [hull.id], (o) => ({
      ...o,
      transform: { ...o.transform, x: kant.minX - 4 },
    }));
    expect(erOye(oye, hull.id)).toBe(true);
    const medOye = omrissRegioner(oye, lag.id)!.get(underlag)!;
    expect(areal(medOye)).toBeGreaterThan(for_ + 20);
    expect(regionBoks(medOye).minX).toBeLessThan(kant.minX - 8);
    const m = await byggSigngen(oye);
    expect(sjekkManifold(m.deler.find((x) => x.id === underlag)!.mesh).lukket).toBe(true);
    expect(m.advarsler.some((a) => /Øyet/.test(a.tekst))).toBe(false);
    // far away it floats, and the editor says so
    const los = oppdaterObjekter(d, [hull.id], (o) => ({
      ...o,
      transform: { ...o.transform, x: kant.minX - 40 },
    }));
    expect((await byggSigngen(los)).advarsler.some((a) => /Øyet .* henger ikke fast/.test(a.tekst))).toBe(
      true,
    );
  });

  it('joins the eye to the lowest layer when it has no outlines', async () => {
    let d = skiltMedPlate();
    await lastFonter(d);
    const bunn = d.lag[0]!;
    const for_ = areal(lagRegion(d, bunn.id)!);
    d = leggTilObjekt(d, nyttObjekt(bunn.id, nyForm('hull', 5, 5), { x: -63.5, y: 0 }));
    expect(areal(lagRegion(d, bunn.id)!)).toBeGreaterThan(for_ + 20);
    expect(finnLag(d, tekstlag(d).id)).toBeDefined();
  });
});

describe('Own height on a hanging hole', () => {
  const medHoyde = (d: Dokument, id: string, hullHoyde?: number) =>
    oppdaterObjekter(d, [id], (o) => ({ ...o, kilde: { ...(o.kilde as FormKilde), hullHoyde } }));

  it('cuts only the layers it reaches and leaves the rest of the model alone', async () => {
    let d = skiltMedPlate();
    const bunn = d.lag[0]!;
    const tekst = d.lag[1]!;
    await lastFonter(d);
    const utenHull = { bunn: areal(lagRegion(d, bunn.id)!), tekst: areal(lagRegion(d, tekst.id)!) };
    const hull = nyttObjekt(bunn.id, nyForm('hull', 6, 6), { x: 0, y: 0 });
    d = leggTilObjekt(d, hull);
    // through everything: both layers lose area
    expect(areal(lagRegion(d, bunn.id)!)).toBeLessThan(utenHull.bunn - 20);
    expect(areal(lagRegion(d, tekst.id)!)).toBeLessThan(utenHull.tekst);
    // reaching 2 mm: only the plate (0–3 mm) is cut, the text (from 3 mm) is as it was
    const kort = medHoyde(d, hull.id, 2);
    expect(areal(lagRegion(kort, bunn.id)!)).toBeLessThan(utenHull.bunn - 20);
    expect(areal(lagRegion(kort, tekst.id)!)).toBeCloseTo(utenHull.tekst, 3);
    expect(kort.lag.map((l) => [l.zBunn, l.hoyde])).toEqual(d.lag.map((l) => [l.zBunn, l.hoyde]));
    // reaching above the text: both are cut again
    const hoy = medHoyde(d, hull.id, 8);
    expect(areal(lagRegion(hoy, tekst.id)!)).toBeLessThan(utenHull.tekst);
  });

  it('prints an eye with an own height as a ring of its own, closed and as tall as asked', async () => {
    let d = skiltMedPlate();
    const bunn = d.lag[0]!;
    await lastFonter(d);
    const kant = regionBoks(lagRegion(d, bunn.id)!);
    const hull = nyttObjekt(bunn.id, nyForm('hull', 5, 5), { x: kant.minX - 4, y: 0 });
    d = leggTilObjekt(d, hull);
    expect(erOye(d, hull.id)).toBe(true);
    const festet = await byggSigngen(d);
    expect(festet.deler.some((x) => x.id === hull.id)).toBe(false);
    const egen = medHoyde(d, hull.id, 1.2);
    const m = await byggSigngen(egen);
    const ring = m.deler.find((x) => x.id === hull.id)!;
    expect(ring).toBeDefined();
    expect(sjekkManifold(ring.mesh).lukket).toBe(true);
    const z = [...ring.mesh.posisjoner].filter((_, i) => i % 3 === 2);
    expect(Math.max(...z)).toBeCloseTo(bunn.zBunn + 1.2, 3);
    // the plate itself is as tall and as wide as before the eye got its own height
    expect(areal(lagRegion(egen, bunn.id)!)).toBeLessThanOrEqual(areal(lagRegion(d, bunn.id)!) + 1e-6);
  });
});

describe('CSV fields on a sign without a plate', () => {
  it('lets the text and its outlines grow instead of calling the name too long', async () => {
    const start = nyttSigngenDokument();
    const tekst = Object.values(start.objekter)[0]!;
    const m = oppdaterObjekter(start, [tekst.id], (o) => ({
      ...o,
      kilde: { ...(o.kilde as TekstKilde), felt: 'navn' },
    }));
    await lastFonter(m);
    const csv = tolkCsv('navn\nEt veldig langt navn som er lengre enn startskiltet');
    const v = lagVarianter(m, csv, foreslaKobling(csv, m));
    expect(v[0]!.problemer).toEqual([]);
  });
});

describe('Holes keep their distance from the name in a batch', () => {
  async function mal(x: number) {
    const start = nyttSigngenDokument();
    const tekst = Object.values(start.objekter)[0]!;
    let d = oppdaterObjekter(start, [tekst.id], (o) => ({
      ...o,
      kilde: { ...(o.kilde as TekstKilde), felt: 'navn' },
    }));
    const hull = nyttObjekt(d.lag[0]!.id, nyForm('hull', 5, 5), { x, y: 0 });
    d = leggTilObjekt(d, hull);
    await lastFonter(d);
    return { d, hull };
  }
  const boksAv = (d: Dokument, id: string) => {
    const o = d.objekter[id]!;
    return { x: o.transform.x, nb: navneboks(d)! };
  };

  it('measures the side, the gap and the place across from the name', async () => {
    const { d, hull } = await mal(-80);
    const a = hullanker(d, d.objekter[hull.id]!)!;
    expect(a.side).toBe('venstre');
    expect(a.gap).toBeGreaterThan(0);
    expect(Math.abs(a.tvers)).toBeLessThan(10);
  });

  it('moves the hole with the name, so it is the same distance from the letters on every sign', async () => {
    const { d, hull } = await mal(-80);
    const csv = tolkCsv('navn\nEd\nEt veldig langt navn');
    const v = lagVarianter(d, csv, foreslaKobling(csv, d));
    const gap = (dok: Dokument) => {
      const a = hullanker(dok, dok.objekter[hull.id]!)!;
      return a.gap;
    };
    const maal = gap(d);
    for (const x of v) expect(gap(x.dok)).toBeCloseTo(maal, 4);
    // the long name pushes the hole further out than the short one
    expect(boksAv(v[1]!.dok, hull.id).x).toBeLessThan(boksAv(v[0]!.dok, hull.id).x);
    // the footprint counts the hole's eye
    expect(v[1]!.boks.minX).toBeLessThan(v[0]!.boks.minX);
  });

  it('keeps the hole where it is when asked, and on a fixed plate', async () => {
    const { d, hull } = await mal(-80);
    const fast = oppdaterObjekter(d, [hull.id], (o) => ({
      ...o,
      kilde: { ...(o.kilde as FormKilde), plass: 'fast' },
    }));
    const csv = tolkCsv('navn\nEt veldig langt navn');
    expect(lagVarianter(fast, csv, foreslaKobling(csv, fast))[0]!.dok.objekter[hull.id]!.transform.x).toBe(
      -80,
    );
    const av = lagVarianter(d, csv, foreslaKobling(csv, d), { hullavstand: false });
    expect(av[0]!.dok.objekter[hull.id]!.transform.x).toBe(-80);
    // a sign with a plate does not grow with the name
    const plate = skiltMedPlate();
    const p = Object.values(plate.objekter).find((o) => o.kilde.type === 'tekst')!;
    const mp = oppdaterObjekter(plate, [p.id], (o) => ({
      ...o,
      kilde: { ...(o.kilde as TekstKilde), felt: 'navn' },
    }));
    const ph = nyttObjekt(mp.lag[0]!.id, nyForm('hull', 5, 5), { x: -60, y: 0 });
    const medHull = leggTilObjekt(mp, ph);
    await lastFonter(medHull);
    const pv = lagVarianter(medHull, csv, foreslaKobling(csv, medHull))[0]!;
    expect(pv.dok.objekter[ph.id]!.transform.x).toBe(-60);
  });
});
