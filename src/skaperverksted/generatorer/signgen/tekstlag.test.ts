import { skiltMedPlate } from './testskilt';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { avgrensning, sjekkManifold } from '../../geometri/mesh';
import { areal, regionBoks, snitt } from '../../geometri/polygon';
import { finnLag, type Dokument, type Lag, type Omriss } from '../../core/dokument';
import {
  fargeplasser,
  flyttTilLag,
  grupperTekst,
  leggTilLag,
  leggTilObjekt,
  leggTilOmriss,
  losUtTekst,
  nyForm,
  nyTekst,
  nyttLag,
  nyttObjekt,
  nyttOmriss,
  nyttTekstlag,
  oppdaterLag,
  oppdaterObjekter,
  oppdaterOmriss,
  ordneTekstlag,
  settFarge,
  tekstUtenforTekstlag,
} from './dokument';
import { byggSigngen, lagRegion, lastFonter, omrissRegioner } from './modell';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

const tekstlag = (d: Dokument): Lag => d.lag.find((l) => l.tekstlag)!;

/** The starting sign with one outline around the text. */
async function medOmriss(endring: Partial<Omriss> = {}): Promise<{ d: Dokument; o: Omriss }> {
  let d = skiltMedPlate();
  const o = nyttOmriss('Omriss 1', 'pla-lilla', { bredde: 2, hoyde: 1, ...endring });
  d = leggTilOmriss(d, tekstlag(d).id, o);
  await lastFonter(d);
  return { d, o };
}

describe('Sign Forge text layers', () => {
  it('starts with the text in a text layer without outlines', () => {
    const d = skiltMedPlate();
    const lag = tekstlag(d);
    expect(lag).toMatchObject({ navn: 'Tekst', omriss: [], tekstvisning: 'normal' });
    const tekst = Object.values(d.objekter).find((o) => o.kilde.type === 'tekst')!;
    expect(tekst.lagId).toBe(lag.id);
    expect(ordneTekstlag(d)).toBe(d);
  });

  it('builds an outline around the text that never covers it, with its own height', async () => {
    const { d, o } = await medOmriss();
    const lag = tekstlag(d);
    const r = omrissRegioner(d, lag.id)!.get(o.id)!;
    expect(areal(r)).toBeGreaterThan(100);
    expect(areal(snitt(r, lagRegion(d, lag.id)!))).toBeLessThan(0.01);
    const m = await byggSigngen(d);
    const del = m.deler.find((x) => x.id === o.id)!;
    expect(del).toMatchObject({ lagId: lag.id, materialId: 'pla-lilla' });
    expect(sjekkManifold(del.mesh).lukket).toBe(true);
    expect(avgrensning(del.mesh).min[2]).toBeCloseTo(lag.zBunn, 6);
    expect(avgrensning(del.mesh).maks[2]).toBeCloseTo(lag.zBunn + 1, 6);
    // the text's height does not change the outline's
    const hoyere = oppdaterLag(d, lag.id, { hoyde: 4 });
    const m2 = await byggSigngen(hoyere);
    expect(avgrensning(m2.deler.find((x) => x.id === o.id)!.mesh).maks[2]).toBeCloseTo(lag.zBunn + 1, 6);
    expect(avgrensning(m2.deler.find((x) => x.id === lag.id)!.mesh).maks[2]).toBeCloseTo(lag.zBunn + 4, 6);
  });

  it('closes holes with «fyll» and follows the edge with «omriss»', async () => {
    const { d, o } = await medOmriss({ type: 'fyll', bredde: 0.6 });
    const lag = tekstlag(d);
    const fyll = areal(omrissRegioner(d, lag.id)!.get(o.id)!);
    const ring = oppdaterOmriss(d, lag.id, o.id, { type: 'omriss' });
    expect(areal(omrissRegioner(ring, lag.id)!.get(o.id)!)).toBeLessThan(fyll);
    // a gap keeps the outline away from the text
    const glipe = oppdaterOmriss(ring, lag.id, o.id, { avstand: 1 });
    const r = omrissRegioner(glipe, lag.id)!.get(o.id)!;
    expect(sjekkManifold((await byggSigngen(glipe)).deler.find((x) => x.id === o.id)!.mesh).lukket).toBe(
      true,
    );
    expect(areal(snitt(r, lagRegion(glipe, lag.id)!))).toBe(0);
  });

  it('keeps outlines at least 0.6 mm wide', async () => {
    const { d, o } = await medOmriss({ type: 'omriss', bredde: 0.1 });
    const lag = tekstlag(d);
    const tynn = areal(omrissRegioner(d, lag.id)!.get(o.id)!);
    const minste = oppdaterOmriss(d, lag.id, o.id, { bredde: 0.6 });
    expect(tynn).toBeCloseTo(areal(omrissRegioner(minste, lag.id)!.get(o.id)!), 3);
  });

  it('stacks several outlines inside out and cuts the text out when asked', async () => {
    let { d } = await medOmriss();
    const lag = tekstlag(d);
    const ytre = nyttOmriss('Omriss 2', 'pla-cyan', { bredde: 3, hoyde: 0.6 });
    d = leggTilOmriss(d, lag.id, ytre);
    const g = omrissRegioner(d, lag.id)!;
    const [a, b] = lag.omriss!.length ? [...g.values()] : [];
    expect(areal(snitt(a!, b!))).toBeLessThan(0.01);
    const kutt = oppdaterLag(d, lag.id, { tekstvisning: 'kutt' });
    const m = await byggSigngen(kutt);
    expect(m.deler.some((x) => x.id === lag.id)).toBe(false);
    expect(m.deler.filter((x) => x.lagId === lag.id)).toHaveLength(2);
    expect(fargeplasser(kutt).map((p) => p.navn)).toEqual([
      'Bunnplate',
      'Tekst: Omriss 1',
      'Tekst: Omriss 2',
    ]);
  });

  it('lets influences from a text layer include its outlines', async () => {
    let { d } = await medOmriss({ bredde: 3 });
    const lag = tekstlag(d);
    const flate = nyttLag('Flate', 'pla-grafitt', 1);
    d = leggTilLag(d, flate, d.lag[0]!.id);
    d = oppdaterLag(d, flate.id, {
      pavirkninger: [{ kildeLagId: lag.id, handling: 'legg-til', avstand: 0 }],
    });
    const omriss = [...omrissRegioner(d, lag.id)!.values()][0]!;
    expect(areal(lagRegion(d, flate.id)!)).toBeGreaterThan(areal(lagRegion(d, lag.id)!) + areal(omriss) - 1);
  });

  it('groups texts into one text layer and takes one out again with copied outlines', async () => {
    const start = await medOmriss();
    const o = start.o;
    let d = start.d;
    const a = tekstlag(d);
    const b = nyttTekstlag('Tekst 2', 'pla-kritthvit');
    d = leggTilLag(d, b, a.id);
    const ola = nyttObjekt(b.id, nyTekst('Ola', 10), { y: -14 });
    d = leggTilObjekt(d, ola);
    const forste = d.rekkefolge[a.id]![0]!;
    const g = grupperTekst(d, [forste, ola.id]);
    expect(g.lagId).toBe(a.id);
    expect(finnLag(g.dok, b.id)).toBeUndefined();
    expect(g.dok.rekkefolge[a.id]).toEqual([forste, ola.id]);
    const ut = losUtTekst(g.dok, ola.id);
    const ny = finnLag(ut.dok, ut.lagId!)!;
    expect(ny).toMatchObject({ tekstlag: true, navn: 'Tekst 2' });
    expect(ny.omriss).toHaveLength(1);
    expect(ny.omriss![0]!.id).not.toBe(o.id);
    expect(ut.dok.objekter[ola.id]!.lagId).toBe(ny.id);
  });

  it('keeps text in text layers and everything else out of them', () => {
    const d = skiltMedPlate();
    const lag = tekstlag(d);
    const bunn = d.lag[0]!;
    const tekst = d.rekkefolge[lag.id]![0]!;
    const plate = d.rekkefolge[bunn.id]![0]!;
    expect(flyttTilLag(d, [tekst], bunn.id)).toBe(d);
    expect(flyttTilLag(d, [plate], lag.id)).toBe(d);
  });

  it('sets the colour of a layer or an outline', async () => {
    const { d, o } = await medOmriss();
    const lag = tekstlag(d);
    expect(finnLag(settFarge(d, o.id, 'pla-cyan'), lag.id)!.omriss![0]!.materialId).toBe('pla-cyan');
    expect(finnLag(settFarge(d, lag.id, 'pla-cyan'), lag.id)!.materialId).toBe('pla-cyan');
  });
});

describe('Sign Forge while dragging', () => {
  it('moves finished outlines with the text and cuts holes as they move', async () => {
    const start = await medOmriss({ bredde: 2 });
    const o = start.o;
    let d = start.d;
    const lag = tekstlag(d);
    const tekstId = d.rekkefolge[lag.id]![0]!;
    const hull = nyttObjekt(d.lag[0]!.id, nyForm('hull', 5, 5), { x: -80, y: 0 });
    d = leggTilObjekt(d, hull);
    const for_ = omrissRegioner(d, lag.id)!.get(o.id)!;
    const flyttet = oppdaterObjekter(d, [tekstId], (t) => ({
      ...t,
      transform: { ...t.transform, x: t.transform.x + 5.3, y: t.transform.y - 2.1 },
    }));
    const etter = omrissRegioner(flyttet, lag.id)!.get(o.id)!;
    expect(areal(etter)).toBeCloseTo(areal(for_), 3);
    expect(regionBoks(etter).minX).toBeCloseTo(regionBoks(for_).minX + 5.3, 3);
    expect(regionBoks(etter).maksY).toBeCloseTo(regionBoks(for_).maksY - 2.1, 3);
    // the same document gives the same objects, so later steps can reuse them
    expect(omrissRegioner(flyttet, lag.id)!.get(o.id)).toBe(etter);
    // a hole dragged onto the outline cuts it; dragged away, the outline is whole again
    const rand = regionBoks(for_).minX + 1;
    const paa = oppdaterObjekter(d, [hull.id], (h) => ({ ...h, transform: { ...h.transform, x: rand } }));
    expect(areal(omrissRegioner(paa, lag.id)!.get(o.id)!)).toBeLessThan(areal(for_) - 1);
    expect(areal(lagRegion(paa, d.lag[0]!.id)!)).toBeLessThan(areal(lagRegion(d, d.lag[0]!.id)!) - 1);
    const bort = oppdaterObjekter(paa, [hull.id], (h) => ({ ...h, transform: { ...h.transform, x: -80 } }));
    expect(areal(omrissRegioner(bort, lag.id)!.get(o.id)!)).toBeCloseTo(areal(for_), 6);
    const m = await byggSigngen(paa);
    expect(sjekkManifold(m.deler.find((x) => x.id === o.id)!.mesh).lukket).toBe(true);
  });
});

describe('Projects from before text layers', () => {
  /** A text-only layer and a layer that mixes a shape with text, as older projects could. */
  function gammelt(): Dokument {
    let d = skiltMedPlate();
    d = { ...d, lag: d.lag.map(({ tekstlag: _, omriss: __, tekstvisning: ___, ...l }) => l) };
    d = leggTilObjekt(d, nyttObjekt(d.lag[0]!.id, nyTekst('Under', 6)));
    d = leggTilObjekt(d, nyttObjekt(d.lag[1]!.id, nyTekst('Hei', 8), { y: 12 }));
    return d;
  }

  it('marks layers that hold only text as text layers without moving anything', async () => {
    const d = gammelt();
    const n = ordneTekstlag(d);
    expect(n.lag.map((l) => !!l.tekstlag)).toEqual([false, true]);
    expect(n.objekter).toBe(d.objekter);
    expect(tekstUtenforTekstlag(n).map((o) => o.lagId)).toEqual([d.lag[0]!.id]);
    expect(ordneTekstlag(n)).toBe(n);
    await lastFonter(n);
    for (const l of d.lag) expect(areal(lagRegion(n, l.id)!)).toBeCloseTo(areal(lagRegion(d, l.id)!), 6);
    const m = await byggSigngen(n);
    expect(m.advarsler.some((a) => /fra før tekstlagene/.test(a.tekst))).toBe(true);
  });

  it('does not mark a layer with shapes, and leaves projects with text layers alone', () => {
    const d = skiltMedPlate();
    const plain = nyttLag('Ramme', 'pla-lilla', 1);
    const m = leggTilObjekt(leggTilLag(d, plain), nyttObjekt(plain.id, nyForm('rektangel', 10, 10)));
    expect(ordneTekstlag(m)).toBe(m);
  });
});
