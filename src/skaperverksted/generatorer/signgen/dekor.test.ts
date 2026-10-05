import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { areal, regionBoks } from '../../geometri/polygon';
import { sjekkManifold } from '../../geometri/mesh';
import { finnLag, objekterILag, type Dokument, type TekstKilde } from '../../core/dokument';
import {
  flyttLagInnI,
  flyttTilLag,
  leggTilLag,
  leggTilObjekt,
  losUtObjekt,
  nyForm,
  nyTekst,
  nyttObjekt,
  nyttSigngenDokument,
  nyttTekstlag,
  oppdaterKilde,
  oppdaterObjekter,
} from './dokument';
import { byggSigngen, fotavtrykkBoks, lagRegion, lastFonter, lokalGeometri, verdensBoks } from './modell';
import { DEKOR, dekorKilde, dekorValg, erIngenDekor, finnDekorFraTekst } from './dekor';
import { foreslaKobling, gruppeavstander, lagVarianter, tolkCsv } from './batch';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

describe('The decoration gallery', () => {
  it('has about two dozen elements, each a closed shape in millimetres', () => {
    expect(DEKOR.length).toBeGreaterThanOrEqual(20);
    expect(new Set(DEKOR.map((d) => d.id)).size).toBe(DEKOR.length);
    for (const d of DEKOR) {
      const k = dekorKilde(d);
      expect(k.kilde).toMatchObject({ type: 'svg', dekorId: d.id });
      expect(Math.max(k.bredde, k.hoyde)).toBeGreaterThan(15);
      expect(Math.max(k.bredde, k.hoyde)).toBeLessThanOrEqual(24.01);
    }
  });

  it('keeps holes in a vector, and can fill them for a silhouette', () => {
    const ball = dekorKilde(DEKOR.find((d) => d.id === 'fotball')!).kilde;
    const medHull = lokalGeometri(ball)!.region;
    expect(medHull.some((f) => f.hull.length > 0)).toBe(true);
    const fylt = lokalGeometri({ ...ball, hull: 'fyll' })!.region;
    expect(fylt.every((f) => f.hull.length === 0)).toBe(true);
    expect(areal(fylt)).toBeGreaterThan(areal(medHull) + 5);
  });

  it('finds an element from a CSV cell by name, id or spelling', () => {
    expect(finnDekorFraTekst('Enhjørning', [])?.id).toBe('enhjorning');
    expect(finnDekorFraTekst(' ENHJORNING ', [])?.id).toBe('enhjorning');
    expect(finnDekorFraTekst('måne', [])?.id).toBe('mane');
    expect(finnDekorFraTekst('dronning', [])).toBeUndefined();
    expect(erIngenDekor('Ingen')).toBe(true);
    expect(erIngenDekor('')).toBe(true);
    expect(erIngenDekor('hest')).toBe(false);
    expect(dekorValg([]).length).toBe(DEKOR.length);
  });
});

/** The start sign with a star grouped in the text layer. */
async function skiltMedStjerne(): Promise<{ d: Dokument; lagId: string; stjerne: string }> {
  let d = nyttSigngenDokument();
  const lag = d.lag[0]!;
  const stjerne = nyttObjekt(lag.id, dekorKilde(DEKOR[0]!).kilde, { x: 62, y: 0, skalaX: 0.5, skalaY: 0.5 });
  d = leggTilObjekt(d, stjerne);
  await lastFonter(d);
  return { d, lagId: lag.id, stjerne: stjerne.id };
}

describe('Vectors in text layers', () => {
  it('lets a vector join a text layer and share its outlines, but not a plain shape', async () => {
    const { d, lagId, stjerne } = await skiltMedStjerne();
    expect(objekterILag(d, lagId)).toHaveLength(2);
    const utenStjerne = oppdaterObjekter(d, [stjerne], (o) => ({ ...o, synlig: false }));
    // the outline has to reach the star, so the footprint grows with it
    const med = fotavtrykkBoks(d)!;
    const uten = fotavtrykkBoks(utenStjerne)!;
    expect(med.maksX).toBeGreaterThan(uten.maksX + 5);
    const rektangel = nyttObjekt(lagId, nyForm('rektangel', 10, 10));
    expect(flyttTilLag(leggTilObjekt(d, rektangel), [rektangel.id], lagId)).toBeDefined();
    const plain = nyttSigngenDokument();
    const plateLag = leggTilLag(plain, { ...nyttTekstlag('Annet', 'pla-svart'), tekstlag: false }, undefined);
    const form = nyttObjekt(plateLag.lag.at(-1)!.id, nyForm('rektangel', 10, 10));
    const medForm = leggTilObjekt(plateLag, form);
    // a plain shape is refused by a text layer
    expect(flyttTilLag(medForm, [form.id], medForm.lag[0]!.id).objekter[form.id]!.lagId).toBe(form.lagId);
  });

  it('builds a closed model with the vector in the group', async () => {
    const { d, lagId } = await skiltMedStjerne();
    const m = await byggSigngen(d);
    expect(m.advarsler.filter((a) => a.niva === 'feil')).toEqual([]);
    const tekst = m.deler.find((x) => x.id === lagId)!;
    expect(sjekkManifold(tekst.mesh).lukket).toBe(true);
  });

  it('cuts a negative vector out of the text layer', async () => {
    const { d, lagId, stjerne } = await skiltMedStjerne();
    // put the star over the letters and make it a cut
    const over = oppdaterObjekter(d, [stjerne], (o) => ({
      ...o,
      operasjon: 'trekk-fra',
      transform: { ...o.transform, x: 0, y: 0, skalaX: 0.4, skalaY: 0.4 },
    }));
    const for_ = areal(lagRegion(d, lagId)!);
    expect(areal(lagRegion(over, lagId)!)).toBeLessThan(for_ - 5);
  });

  it('takes a vector out of its group into a layer of its own, and back by dragging the layer', async () => {
    const { d, lagId, stjerne } = await skiltMedStjerne();
    const ut = losUtObjekt(d, stjerne);
    expect(ut.lagId).not.toBeNull();
    const eget = finnLag(ut.dok, ut.lagId!)!;
    expect(eget.tekstlag).toBeFalsy();
    expect(objekterILag(ut.dok, eget.id).map((o) => o.id)).toEqual([stjerne]);
    expect(objekterILag(ut.dok, lagId)).toHaveLength(1);
    // dragging the decoration layer into the text layer joins it again and drops the empty layer
    const inn = flyttLagInnI(ut.dok, eget.id, lagId);
    expect(inn.flyttet).toEqual([stjerne]);
    expect(finnLag(inn.dok, eget.id)).toBeUndefined();
    expect(objekterILag(inn.dok, lagId)).toHaveLength(2);
  });

  it('gives a text dragged into a group the group’s effects', async () => {
    let d = nyttSigngenDokument();
    const gruppe = d.lag[0]!;
    const andre = nyttTekstlag('Tekst 2', 'pla-svart', 1);
    d = leggTilLag(d, andre);
    const t2 = nyttObjekt(andre.id, nyTekst('Ekstra', 10));
    d = leggTilObjekt(d, t2);
    const r = flyttLagInnI(d, andre.id, gruppe.id);
    expect(r.flyttet).toEqual([t2.id]);
    expect(r.dok.objekter[t2.id]!.lagId).toBe(gruppe.id);
    expect(finnLag(r.dok, andre.id)).toBeUndefined();
    // the outlines are the group's, so the moved text lies inside the first outline's area
    await lastFonter(r.dok);
    expect(finnLag(r.dok, gruppe.id)!.omriss).toHaveLength(1);
  });
});

describe('Batch: gaps in a group and decoration variables', () => {
  /** First name and last name side by side in one text layer. */
  async function fornavnOgEtternavn(): Promise<Dokument> {
    let d = nyttSigngenDokument();
    const lag = d.lag[0]!;
    const forste = Object.values(d.objekter)[0]!;
    d = oppdaterObjekter(d, [forste.id], (o) => ({
      ...o,
      kilde: { ...(o.kilde as TekstKilde), tekst: 'Anna', felt: 'fornavn' },
      transform: { ...o.transform, x: -40 },
    }));
    const etter = nyttObjekt(
      lag.id,
      { ...(forste.kilde as TekstKilde), tekst: 'Hansen', felt: 'etternavn' },
      { x: 40, y: 0 },
    );
    d = leggTilObjekt(d, etter);
    await lastFonter(d);
    return d;
  }

  it('keeps the gap between first and last name the same on every sign', async () => {
    const master = await fornavnOgEtternavn();
    const regler = gruppeavstander(master);
    expect(regler).toHaveLength(1);
    expect(regler[0]).toMatchObject({ akse: 'x' });
    const csv = tolkCsv('fornavn;etternavn\nAnna;Hansen\nMaximilian;Li\nEd;Johannessen-Bakkestuen');
    const v = lagVarianter(master, csv, foreslaKobling(csv, master));
    await lastFonter(v[2]!.dok);
    const gap = v.map((x) => {
      const t = objekterILag(x.dok, x.dok.lag[0]!.id)
        .filter((o) => o.kilde.type === 'tekst')
        .map(verdensBoks)
        .sort((a, b) => a.minX - b.minX);
      return t[1]!.minX - t[0]!.maksX;
    });
    for (const g of gap) expect(g).toBeCloseTo(gap[0]!, 3);
    // the group keeps its centre
    const sentrum = v.map((x) => {
      const b = objekterILag(x.dok, x.dok.lag[0]!.id).map(verdensBoks);
      return (Math.min(...b.map((m) => m.minX)) + Math.max(...b.map((m) => m.maksX))) / 2;
    });
    for (const s of sentrum) expect(s).toBeCloseTo(sentrum[0]!, 3);
    // without the rule the gap would change
    const fri = lagVarianter(master, csv, foreslaKobling(csv, master), { gruppeavstand: false });
    const g2 = fri.map((x) => {
      const t = objekterILag(x.dok, x.dok.lag[0]!.id)
        .map(verdensBoks)
        .sort((a, b) => a.minX - b.minX);
      return t[1]!.minX - t[0]!.maksX;
    });
    expect(Math.abs(g2[2]! - g2[0]!)).toBeGreaterThan(1);
  });

  it('stacks first and last name with a fixed gap too', async () => {
    let d = await fornavnOgEtternavn();
    const ider = Object.values(d.objekter).map((o) => o.id);
    d = oppdaterObjekter(d, ider, (o) => ({
      ...o,
      transform: { ...o.transform, x: 0, y: o.kilde.type === 'tekst' && o.kilde.felt === 'fornavn' ? 8 : -8 },
    }));
    const r = gruppeavstander(d);
    expect(r[0]).toMatchObject({ akse: 'y' });
  });

  it('swaps a decoration from the CSV and leaves it off when the cell is empty', async () => {
    const start = await skiltMedStjerne();
    const stjerne = start.stjerne;
    const d = oppdaterKilde(start.d, stjerne, { felt: 'dekor' });
    const csv = tolkCsv('dekor\nHest\nIngen\nDrage');
    const v = lagVarianter(d, csv, foreslaKobling(csv, d), { egneDekor: [] });
    expect(foreslaKobling(csv, d)[0]).toEqual({ type: 'felt', felt: 'dekor' });
    const o0 = v[0]!.dok.objekter[stjerne]!;
    expect(o0.synlig).toBe(true);
    expect(o0.kilde).toMatchObject({ type: 'svg', dekorId: 'hest', felt: 'dekor' });
    // the same size on the sign as the star had
    const f = (dok: Dokument) => {
      const b = verdensBoks(dok.objekter[stjerne]!);
      return Math.max(b.maksX - b.minX, b.maksY - b.minY);
    };
    expect(f(v[0]!.dok)).toBeCloseTo(f(d), 1);
    expect(v[1]!.dok.objekter[stjerne]!.synlig).toBe(false);
    expect(v[1]!.problemer).toEqual([]);
    expect(v[2]!.problemer).toEqual(['ukjent dekor «Drage» i «dekor»']);
  });

  it('lays signs out by their real footprint, outlines included', async () => {
    const { d } = await skiltMedStjerne();
    const csv = tolkCsv('x\n1');
    const v = lagVarianter(d, csv, [{ type: 'ingen' }]);
    const b = fotavtrykkBoks(d)!;
    expect(v[0]!.boks.maksX - v[0]!.boks.minX).toBeGreaterThanOrEqual(b.maksX - b.minX - 1e-6);
    // wider than the text and star alone, because of the 4 mm outline
    const objekter = Object.values(d.objekter).map(verdensBoks);
    const rent = Math.max(...objekter.map((m) => m.maksX)) - Math.min(...objekter.map((m) => m.minX));
    expect(v[0]!.boks.maksX - v[0]!.boks.minX).toBeGreaterThan(rent + 4);
    expect(regionBoks).toBeDefined();
  });
});
