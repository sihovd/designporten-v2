import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { avgrensning, sjekkManifold, volum } from '../../geometri/mesh';
import type { Dokument } from '../../core/dokument';
import {
  leggTilLag,
  leggTilObjekt,
  leggTilOmriss,
  nyForm,
  nyttLag,
  nyttObjekt,
  nyttOmriss,
  nyttSigngenDokument,
  oppdaterLag,
} from './dokument';
import { byggSigngen, lastFonter } from './modell';
import { fargeskiftForDeler, tellFargeskift } from './fargeskift';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

/** Like Sivert's «Kjærleik»: text with three outlines, all standing on the plate. */
async function kjaerleik(): Promise<Dokument> {
  let d = nyttSigngenDokument();
  const lag = d.lag.find((l) => l.tekstlag)!;
  d = oppdaterLag(d, lag.id, { materialId: 'pla-lilla', hoyde: 4, omriss: [] });
  d = leggTilOmriss(d, lag.id, nyttOmriss('Hvit', 'pla-kritthvit', { bredde: 2, hoyde: 3.2 }));
  d = leggTilOmriss(d, lag.id, nyttOmriss('Mørk', 'pla-svart', { bredde: 2.5, hoyde: 2.4 }));
  d = leggTilOmriss(d, lag.id, nyttOmriss('Kant', 'pla-cyan', { bredde: 2.5, hoyde: 1.6 }));
  await lastFonter(d);
  return d;
}

const somTegnet = (d: Dokument): Dokument => ({
  ...d,
  parametre: { ...d.parametre, fargeskift: 'som_tegnet' },
});
const sumVolum = (m: { deler: { mesh: Parameters<typeof volum>[0] }[] }) =>
  m.deler.reduce((v, x) => v + volum(x.mesh), 0);

describe('Færre fargeskift', () => {
  it('counts changes the way a slicer orders colours', () => {
    expect(tellFargeskift([['a'], ['a'], ['b']])).toBe(1);
    expect(
      tellFargeskift([
        ['a', 'b'],
        ['a', 'b'],
      ]),
    ).toBe(2);
    expect(tellFargeskift([['a', 'b', 'c'], ['a', 'b', 'c'], ['c']])).toBe(4);
  });

  it('cuts the colour changes of a text with stacked outlines and keeps the volume', async () => {
    const d = await kjaerleik();
    const for_ = await byggSigngen(somTegnet(d));
    const etter = await byggSigngen(d);
    const lagHoyde = 0.2;
    const skiftFor = fargeskiftForDeler(for_.deler, lagHoyde);
    const skiftEtter = fargeskiftForDeler(etter.deler, lagHoyde);
    // counted when written: see the PR; what is left are walls and tops that really show
    expect(skiftEtter).toBeLessThan(skiftFor / 3);
    // the same material is printed, only its colour moved
    expect(sumVolum(etter)).toBeCloseTo(sumVolum(for_), 0);
    for (const del of etter.deler) expect(sjekkManifold(del.mesh).lukket, del.navn).toBe(true);
    // the top of every colour stays where it was
    for (const del of for_.deler) {
      const topp = avgrensning(del.mesh).maks[2];
      const egne = etter.deler.filter((x) => x.materialId === del.materialId);
      expect(Math.max(...egne.map((x) => avgrensning(x.mesh).maks[2]))).toBeGreaterThanOrEqual(topp - 1e-6);
    }
    // the text part keeps its id, so clicking it in 3D still selects the layer
    const lag = d.lag.find((l) => l.tekstlag)!;
    expect(etter.deler.some((x) => x.id === lag.id && x.materialId === 'pla-lilla')).toBe(true);
    expect(etter.deler.every((x) => (x.lagId ?? x.id) === lag.id)).toBe(true);
  });

  it('leaves a sign alone when every colour already has its own height', async () => {
    let d = nyttSigngenDokument();
    const tekst = d.lag.find((l) => l.tekstlag)!;
    d = oppdaterLag(d, tekst.id, { omriss: [] });
    const bunn = nyttLag('Plate', 'pla-grafitt', 2);
    d = leggTilLag(d, bunn);
    d = leggTilObjekt(d, nyttObjekt(bunn.id, nyForm('rektangel', 120, 42, 6), {}, 'Plate'));
    await lastFonter(d);
    const for_ = await byggSigngen(somTegnet(d));
    const etter = await byggSigngen(d);
    expect(fargeskiftForDeler(etter.deler, 0.2)).toBe(fargeskiftForDeler(for_.deler, 0.2));
    expect(etter.deler.map((x) => x.id)).toEqual(for_.deler.map((x) => x.id));
    expect(
      etter.deler.find((x) => x.id === tekst.id)!.mesh === for_.deler.find((x) => x.id === tekst.id)!.mesh,
    ).toBe(true);
  });
});
