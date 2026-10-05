import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { sjekkManifold } from '../../geometri/mesh';
import { areal } from '../../geometri/polygon';
import { finnLag, type Dokument } from '../../core/dokument';
import {
  fargeplasser,
  finnTekstlag,
  flyttTilLag,
  leggTilLag,
  leggTilObjekt,
  leggTilUnderlag,
  nyForm,
  nyTekst,
  nyttLag,
  nyttObjekt,
  nyttSigngenDokument,
  nyttUnderlag,
  oppdaterLag,
  ordneTekstlag,
  settFarge,
  slettLag,
  slettUnderlag,
  tekstUtenforTekstlaget,
} from './dokument';
import { byggSigngen, lagRegion, lastFonter, underlagRegioner } from './modell';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

/** The starting sign with a second colour in the text layer holding a second word. */
function toFarger(): { d: Dokument; forste: string; andre: string } {
  let d = nyttSigngenDokument();
  const lag = finnTekstlag(d)!;
  const forste = lag.underlag![0]!.id;
  const u = nyttUnderlag('Farge 2', 'pla-lilla');
  d = leggTilUnderlag(d, lag.id, u);
  d = leggTilObjekt(d, nyttObjekt(lag.id, nyTekst('Ola', 10), { y: -14 }, undefined, u.id));
  return { d, forste, andre: u.id };
}

describe('Sign Forge text layer', () => {
  it('starts with one text layer holding one colour, and the text in it', () => {
    const d = nyttSigngenDokument();
    const lag = finnTekstlag(d)!;
    expect(lag.underlag).toHaveLength(1);
    expect(lag.materialId).toBe(lag.underlag![0]!.materialId);
    const tekst = Object.values(d.objekter).find((o) => o.kilde.type === 'tekst')!;
    expect(tekst.lagId).toBe(lag.id);
    expect(tekst.underlagId).toBe(lag.underlag![0]!.id);
    expect(ordneTekstlag(d)).toBe(d);
  });

  it('builds one part per colour at the layer height, tiling the layer', async () => {
    const { d, forste, andre } = toFarger();
    await lastFonter(d);
    const lag = finnTekstlag(d)!;
    const r = await byggSigngen(d);
    const deler = r.deler.filter((x) => x.lagId === lag.id);
    expect(deler.map((x) => x.materialId).sort()).toEqual(['pla-kritthvit', 'pla-lilla']);
    for (const del of deler) {
      expect(sjekkManifold(del.mesh).lukket).toBe(true);
      const z = del.mesh.posisjoner.filter((_, i) => i % 3 === 2);
      expect(Math.min(...z)).toBeCloseTo(lag.zBunn, 6);
      expect(Math.max(...z)).toBeCloseTo(lag.zBunn + lag.hoyde, 6);
    }
    const grupper = underlagRegioner(d, lag.id)!;
    const sum = areal(grupper.get(forste)!) + areal(grupper.get(andre)!);
    expect(sum).toBeCloseTo(areal(lagRegion(d, lag.id)!), 1);
  });

  it('lets the higher colour win where two colours overlap', async () => {
    const start = toFarger();
    const { forste, andre } = start;
    let d = start.d;
    const lag = finnTekstlag(d)!;
    d = leggTilObjekt(d, nyttObjekt(lag.id, nyForm('rektangel', 20, 20), {}, undefined, forste));
    d = leggTilObjekt(d, nyttObjekt(lag.id, nyForm('rektangel', 20, 20), { x: 10 }, undefined, andre));
    await lastFonter(d);
    const g = underlagRegioner(d, lag.id)!;
    const sum = areal(g.get(forste)!) + areal(g.get(andre)!);
    expect(sum).toBeCloseTo(areal(lagRegion(d, lag.id)!), 1);
    // the overlap (10 × 20 mm) belongs to the upper colour only
    const kunForste = areal(g.get(forste)!);
    d = slettUnderlag(d, lag.id, andre);
    expect(areal(underlagRegioner(d, lag.id)!.get(forste)!)).toBeGreaterThan(kunForste + 150);
  });

  it('keeps influences from other layers working on the whole text layer', async () => {
    let d = nyttSigngenDokument();
    const tekst = finnTekstlag(d)!;
    const kontur = nyttLag('Kontur', 'pla-lilla', 1);
    d = leggTilLag(d, kontur, d.lag[0]!.id);
    d = oppdaterLag(d, kontur.id, {
      pavirkninger: [{ kildeLagId: tekst.id, handling: 'legg-til', avstand: 2 }],
    });
    await lastFonter(d);
    expect(areal(lagRegion(d, kontur.id)!)).toBeGreaterThan(areal(lagRegion(d, tekst.id)!));
  });

  it('keeps text out of plain layers and moves objects between colours', () => {
    const { d, forste } = toFarger();
    const lag = finnTekstlag(d)!;
    const bunn = d.lag[0]!;
    const ola = Object.values(d.objekter).find((o) => o.kilde.type === 'tekst' && o.underlagId !== forste)!;
    expect(flyttTilLag(d, [ola.id], bunn.id)).toBe(d);
    const flyttet = flyttTilLag(d, [ola.id], lag.id, forste);
    expect(flyttet.objekter[ola.id]!.underlagId).toBe(forste);
    const plate = Object.values(d.objekter).find((o) => o.lagId === bunn.id)!;
    const inn = flyttTilLag(d, [plate.id], lag.id, forste);
    expect(inn.objekter[plate.id]).toMatchObject({ lagId: lag.id, underlagId: forste });
    const ut = flyttTilLag(inn, [plate.id], bunn.id);
    expect(ut.objekter[plate.id]!.underlagId).toBeUndefined();
  });

  it('deletes a colour with its objects but never the last colour', () => {
    const { d, forste, andre } = toFarger();
    const lag = finnTekstlag(d)!;
    const uten = slettUnderlag(d, lag.id, andre);
    expect(finnLag(uten, lag.id)!.underlag!.map((u) => u.id)).toEqual([forste]);
    expect(Object.values(uten.objekter).some((o) => o.underlagId === andre)).toBe(false);
    expect(slettUnderlag(uten, lag.id, forste)).toBe(uten);
  });

  it('sets colours by layer or colour id and lists printed colour slots', () => {
    const { d, andre } = toFarger();
    const lag = finnTekstlag(d)!;
    expect(fargeplasser(d).map((p) => p.navn)).toEqual(['Bunnplate', 'Tekst: Farge 1', 'Tekst: Farge 2']);
    const n = settFarge(d, andre, 'pla-cyan');
    expect(finnLag(n, lag.id)!.underlag![1]!.materialId).toBe('pla-cyan');
    const m = settFarge(d, lag.id, 'pla-cyan');
    expect(finnLag(m, lag.id)!.materialId).toBe('pla-cyan');
  });
});

describe('Projects from before the text layer', () => {
  /** Two plain layers that both hold text, as an older project could. */
  function gammelt(): Dokument {
    let d = nyttSigngenDokument();
    // strip the new structure to look like a stored older project
    d = {
      ...d,
      lag: d.lag.map(({ tekstlag: _, underlag: __, ...l }) => l),
      objekter: Object.fromEntries(
        Object.entries(d.objekter).map(([id, { underlagId: _, ...o }]) => [id, o]),
      ),
    };
    const ekstra = nyttLag('Mer tekst', 'pla-lilla', 1);
    d = leggTilLag(d, ekstra);
    d = leggTilObjekt(d, nyttObjekt(ekstra.id, nyTekst('Hei', 8)));
    d = leggTilObjekt(d, nyttObjekt(d.lag[0]!.id, nyTekst('Under', 6)));
    return d;
  }

  it('makes the topmost layer with text the text layer without moving anything', () => {
    const d = gammelt();
    const n = ordneTekstlag(d);
    const lag = finnTekstlag(n)!;
    expect(lag.navn).toBe('Mer tekst');
    expect(lag.underlag).toEqual([expect.objectContaining({ materialId: 'pla-lilla' })]);
    expect(n.lag.filter((l) => l.tekstlag)).toHaveLength(1);
    for (const o of Object.values(n.objekter)) {
      expect(o.lagId).toBe(d.objekter[o.id]!.lagId);
      expect(o.underlagId).toBe(o.lagId === lag.id ? lag.underlag![0]!.id : undefined);
    }
    expect(
      tekstUtenforTekstlaget(n)
        .map((o) => o.lagId)
        .sort(),
    ).toEqual([d.lag[0]!.id, d.lag[1]!.id].sort());
    expect(ordneTekstlag(n)).toBe(n);
  });

  it('builds the same geometry as before and reports text outside the text layer', async () => {
    const d = gammelt();
    const n = ordneTekstlag(d);
    await lastFonter(n);
    for (const l of d.lag) expect(areal(lagRegion(n, l.id)!)).toBeCloseTo(areal(lagRegion(d, l.id)!), 6);
    const r = await byggSigngen(n);
    expect(r.advarsler.filter((a) => /utenfor tekstlaget/.test(a.tekst))).toHaveLength(2);
  });

  it('keeps only one text layer, and picks a new one when it is deleted', () => {
    const d = ordneTekstlag(gammelt());
    const lag = finnTekstlag(d)!;
    const to = { ...d, lag: d.lag.map((l) => (l.id === d.lag[0]!.id ? { ...l, tekstlag: true } : l)) };
    expect(ordneTekstlag(to).lag.filter((l) => l.tekstlag)).toHaveLength(1);
    const uten = slettLag(d, lag.id);
    expect(finnTekstlag(uten)?.navn).toBe('Tekst');
  });
});
