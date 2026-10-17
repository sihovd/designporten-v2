import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import type { Dokument, FormKilde, Objekt, TekstKilde } from '../../core/dokument';
import {
  leggTilLag,
  leggTilObjekt,
  nyForm,
  nyttLag,
  nyttObjekt,
  nyttSigngenDokument,
  oppdaterObjekter,
} from './dokument';
import { blekkBoks, lastFonter, verdensBoks } from './modell';
import { DEKOR, dekorKilde } from './dekor';
import { foreslaKobling, lagVarianter, navneboks, tolkCsv, type Variant } from './batch';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

const NAVN = ['Ed', 'Anna Nordmann', 'Maximilian-Alexander', 'Åse Øye Ærlig', 'Jo Ann', 'Anne-Lise Æ'];
const CSV = tolkCsv(`navn;dekor\n${NAVN.map((n) => `${n};stjerne`).join('\n')}`);

const tekstObjekt = (d: Dokument) => Object.values(d.objekter).find((o) => o.kilde.type === 'tekst')!;

interface Skilt {
  d: Dokument;
  hull: Objekt;
  stjerne: Objekt;
  plate?: Objekt;
}

/** A name sign: the name, a hole to its left, a star in a layer of its own to its right, and optionally a plate. */
async function skilt(plate: 'ingen' | 'rektangel' | 'ellipse' = 'ingen'): Promise<Skilt> {
  let d = nyttSigngenDokument();
  const t = tekstObjekt(d);
  d = oppdaterObjekter(d, [t.id], (o) => ({
    ...o,
    kilde: { ...(o.kilde as TekstKilde), tekst: 'Anna Nordmann', felt: 'navn' },
  }));
  await lastFonter(d);
  let plateObj: Objekt | undefined;
  if (plate !== 'ingen') {
    const lag = nyttLag('Plate', 'pla-grafitt', 2);
    d = { ...d, lag: [lag, ...d.lag], rekkefolge: { ...d.rekkefolge, [lag.id]: [] } };
    plateObj = nyttObjekt(lag.id, nyForm(plate, 190, 40, plate === 'rektangel' ? 6 : 0), {}, 'Plate');
    d = leggTilObjekt(d, plateObj);
    d = { ...d, lag: d.lag.map((l) => (l.tekstlag ? { ...l, omriss: [] } : l)) };
  }
  const n = blekkBoks(tekstObjekt(d));
  const tl = d.lag.find((l) => l.tekstlag)!;
  const hull = nyttObjekt(tl.id, nyForm('hull', 5, 5), { x: n.minX - 6 - 2.5, y: 0 });
  d = leggTilObjekt(d, hull);
  const pynt = nyttLag('Pynt', 'pla-gul', 1);
  d = leggTilLag(d, pynt);
  const k = dekorKilde(DEKOR[0]!);
  const stjerne = nyttObjekt(
    pynt.id,
    { ...k.kilde, felt: 'dekor' },
    { x: n.maksX + 7 + 5, y: 0, skalaX: 10 / k.bredde, skalaY: 10 / k.bredde },
  );
  d = leggTilObjekt(d, stjerne);
  await lastFonter(d);
  return { d, hull, stjerne, plate: plateObj };
}

const bygg = (s: Skilt, tilvalg = {}) => lagVarianter(s.d, CSV, foreslaKobling(CSV, s.d), tilvalg);
const nb = (v: Variant) => blekkBoks(tekstObjekt(v.dok));
const boks = (v: Variant, o: Objekt) => verdensBoks(v.dok.objekter[o.id]!);

describe('CSV layout: holes and decorations hold their distance to the name', () => {
  it('keeps the gap from the name to the hole and to a decoration on every sign', async () => {
    const s = await skilt();
    const n0 = blekkBoks(tekstObjekt(s.d));
    const hullGap = n0.minX - verdensBoks(s.hull).maksX;
    const stjerneGap = verdensBoks(s.stjerne).minX - n0.maksX;
    const v = bygg(s);
    expect(v).toHaveLength(NAVN.length);
    for (const x of v) {
      const n = nb(x);
      expect(n.minX - boks(x, s.hull).maksX).toBeCloseTo(hullGap, 3);
      expect(boks(x, s.stjerne).minX - n.maksX).toBeCloseTo(stjerneGap, 3);
      expect(x.problemer).toEqual([]);
    }
    // the long name pushes both outwards, the short one pulls them in
    expect(boks(v[2]!, s.stjerne).minX).toBeGreaterThan(boks(v[0]!, s.stjerne).minX + 50);
  });

  it('does not change what the template decided: size, holes, colours, text size, layers', async () => {
    const s = await skilt();
    for (const x of bygg(s)) {
      const t = tekstObjekt(x.dok).kilde as TekstKilde;
      expect(t.storrelse).toBe((tekstObjekt(s.d).kilde as TekstKilde).storrelse);
      const h = x.dok.objekter[s.hull.id]!;
      expect(h.kilde).toEqual(s.hull.kilde);
      expect(x.dok.lag.map((l) => l.id)).toEqual(s.d.lag.map((l) => l.id));
      expect(x.dok.lag.map((l) => l.materialId)).toEqual(s.d.lag.map((l) => l.materialId));
      const st = x.dok.objekter[s.stjerne.id]!;
      expect(st.transform.skalaX).toBe(s.stjerne.transform.skalaX);
    }
  });

  it('builds every sign from the unchanged master: repeating, reordering and single rows give the same signs', async () => {
    const s = await skilt();
    const json = JSON.stringify(s.d);
    const a = bygg(s);
    const b = bygg(s);
    expect(JSON.stringify(s.d)).toBe(json);
    expect(a.map((x) => JSON.stringify(x.dok.objekter))).toEqual(
      b.map((x) => JSON.stringify(x.dok.objekter)),
    );
    const rader = [4, 1, 5, 0];
    const del = lagVarianter(s.d, CSV, foreslaKobling(CSV, s.d), { rader });
    for (const x of del) {
      expect(JSON.stringify(x.dok.objekter)).toBe(JSON.stringify(a[x.indeks]!.dok.objekter));
    }
    // the same name twice in a row gives the same sign, with no drift
    const dobbel = tolkCsv(
      'navn;dekor\nMaximilian-Alexander;stjerne\nEd;stjerne\nMaximilian-Alexander;stjerne',
    );
    const d = lagVarianter(s.d, dobbel, foreslaKobling(dobbel, s.d));
    expect(JSON.stringify(d[2]!.dok.objekter)).toBe(JSON.stringify(d[0]!.dok.objekter));
  });

  it('leaves a decoration that is switched off for this sign out of the layout', async () => {
    const s = await skilt();
    const csv = tolkCsv('navn;dekor\nAnna Nordmann;stjerne\nAnna Nordmann;ingen');
    const v = lagVarianter(s.d, csv, foreslaKobling(csv, s.d));
    expect(v[1]!.dok.objekter[s.stjerne.id]!.synlig).toBe(false);
    expect(v[0]!.boks.maksX).toBeGreaterThan(v[1]!.boks.maksX + 5);
  });

  it('keeps a decoration centred over the name centred, and one under the start of the name at the start', async () => {
    const s = await skilt();
    const n0 = blekkBoks(tekstObjekt(s.d));
    const over = oppdaterObjekter(s.d, [s.stjerne.id], (o) => ({
      ...o,
      transform: { ...o.transform, x: (n0.minX + n0.maksX) / 2, y: 20 },
    }));
    const unders = nyttObjekt(s.stjerne.lagId, s.stjerne.kilde, {
      x: n0.minX + 6,
      y: -1,
      skalaX: 0.3,
      skalaY: 0.3,
    });
    const d = leggTilObjekt(over, unders);
    await lastFonter(d);
    const v = lagVarianter(d, CSV, foreslaKobling(CSV, d));
    for (const x of v) {
      const n = nb(x);
      const a = verdensBoks(x.dok.objekter[s.stjerne.id]!);
      expect((a.minX + a.maksX) / 2).toBeCloseTo((n.minX + n.maksX) / 2, 2);
      const b = verdensBoks(x.dok.objekter[unders.id]!);
      expect(b.minX - n.minX).toBeCloseTo(verdensBoks(unders).minX - n0.minX, 2);
    }
  });
});

describe('CSV layout: a plate round the name follows the content', () => {
  it('makes the plate as wide as the content needs and keeps margins, height and corner radius', async () => {
    const s = await skilt('rektangel');
    const p0 = verdensBoks(s.plate!);
    const n0 = blekkBoks(tekstObjekt(s.d));
    const marginV = n0.minX - p0.minX;
    const hullVegg = verdensBoks(s.hull).minX - p0.minX;
    const stjerneVegg = p0.maksX - verdensBoks(s.stjerne).maksX;
    for (const x of bygg(s)) {
      const p = boks(x, s.plate!);
      const n = nb(x);
      const k = x.dok.objekter[s.plate!.id]!.kilde as FormKilde;
      // the margins of the master stay: hole to the left edge, decoration to the right edge
      expect(boks(x, s.hull).minX - p.minX).toBeCloseTo(hullVegg, 3);
      expect(p.maksX - boks(x, s.stjerne).maksX).toBeCloseTo(stjerneVegg, 3);
      expect(n.minX - p.minX).toBeCloseTo(marginV, 3);
      expect(p.maksY - p.minY).toBeCloseTo(p0.maksY - p0.minY, 6);
      expect(k.hjorneradius).toBe((s.plate!.kilde as FormKilde).hjorneradius);
      // the hole keeps its diameter
      const h = x.dok.objekter[s.hull.id]!.kilde as FormKilde;
      expect(h.bredde).toBe(5);
      expect(x.problemer).toEqual([]);
    }
  });

  it('shrinks the plate for a short name and widens it for a long one', async () => {
    const s = await skilt('rektangel');
    const v = bygg(s);
    const bredde = (x: Variant) => boks(x, s.plate!).maksX - boks(x, s.plate!).minX;
    expect(bredde(v[0]!)).toBeLessThan(bredde(v[1]!));
    expect(bredde(v[2]!)).toBeGreaterThan(bredde(v[1]!) + 30);
  });

  it('lets the plate shrink back when the decoration is left out', async () => {
    const s = await skilt('rektangel');
    const csv = tolkCsv('navn;dekor\nAnna Nordmann;stjerne\nAnna Nordmann;ingen');
    const v = lagVarianter(s.d, csv, foreslaKobling(csv, s.d));
    const w = (x: Variant) => boks(x, s.plate!).maksX - boks(x, s.plate!).minX;
    expect(w(v[1]!)).toBeCloseTo(
      w(v[0]!) - (verdensBoks(s.stjerne).maksX - blekkBoks(tekstObjekt(s.d)).maksX),
      1,
    );
  });

  it('makes an ellipse wide enough that the name does not touch its edge more than in the master', async () => {
    const s = await skilt('ellipse');
    const v = bygg(s, { hullavstand: true });
    for (const x of v) {
      const p = boks(x, s.plate!);
      const c = { x: (p.minX + p.maksX) / 2, y: (p.minY + p.maksY) / 2 };
      const a = (p.maksX - p.minX) / 2,
        b = (p.maksY - p.minY) / 2;
      const n = nb(x);
      for (const px of [n.minX, n.maksX]) {
        for (const py of [n.minY, n.maksY])
          expect(((px - c.x) / a) ** 2 + ((py - c.y) / b) ** 2).toBeLessThan(1.5);
      }
      expect(b).toBeCloseTo((verdensBoks(s.plate!).maksY - verdensBoks(s.plate!).minY) / 2, 6);
    }
  });

  it('keeps a plate set to «Fast plass» and reports the name that does not fit', async () => {
    const s = await skilt('rektangel');
    const fast = oppdaterObjekter(s.d, [s.plate!.id], (o) => ({ ...o, plass: 'fast' as const }));
    const lang = tolkCsv('navn;dekor\nMaximilian-Alexander Bartholomeus-Fredrik;stjerne');
    const v = lagVarianter(fast, lang, foreslaKobling(lang, fast));
    expect(boks(v[0]!, s.plate!)).toEqual(verdensBoks(s.plate!));
    expect(v[0]!.problemer.join()).toMatch(/for lang/);
    // and the holes and decorations stay with the plate
    expect(boks(v[0]!, s.hull)).toEqual(verdensBoks(s.hull));
  });

  it('keeps everything in place with «tilpass» off, as before', async () => {
    const s = await skilt('rektangel');
    const v = bygg(s, { tilpassSkilt: false });
    expect(boks(v[2]!, s.plate!)).toEqual(verdensBoks(s.plate!));
    expect(boks(v[2]!, s.hull)).toEqual(verdensBoks(s.hull));
  });

  it('reports a hole with too little material to the edge', async () => {
    const s = await skilt('rektangel');
    const p = verdensBoks(s.plate!);
    const nar = oppdaterObjekter(s.d, [s.hull.id], (o) => ({
      ...o,
      transform: { ...o.transform, x: p.minX + 2.5 + 0.4 },
    }));
    const v = lagVarianter(nar, CSV, foreslaKobling(CSV, nar));
    expect(v[0]!.problemer.join()).toMatch(/materiale til kanten/);
    const bra = bygg(s);
    expect(bra[0]!.problemer.join()).not.toMatch(/materiale/);
  });
});

describe('CSV layout: overlaps', () => {
  it('keeps an overlap of the master (a line under the name) and reports a new one', async () => {
    const s = await skilt();
    const n0 = blekkBoks(tekstObjekt(s.d));
    const linje = nyttObjekt(s.stjerne.lagId, s.stjerne.kilde, {
      x: (n0.minX + n0.maksX) / 2,
      y: n0.minY + 1,
      skalaX: 0.4,
      skalaY: 0.4,
    });
    const d = leggTilObjekt(s.d, linje);
    await lastFonter(d);
    const v = lagVarianter(d, CSV, foreslaKobling(CSV, d));
    for (const x of v) {
      expect(x.problemer.filter((p) => /overlapper/.test(p))).toEqual([]);
      const n = nb(x);
      const b = verdensBoks(x.dok.objekter[linje.id]!);
      expect((b.minX + b.maksX) / 2).toBeCloseTo((n.minX + n.maksX) / 2, 2);
    }
    // a decoration put on the name afterwards is reported
    const feil = oppdaterObjekter(d, [s.stjerne.id], (o) => ({ ...o, plass: 'fast' as const }));
    const w = lagVarianter(feil, CSV, foreslaKobling(CSV, feil));
    expect(navneboks(w[2]!.dok)).not.toBeNull();
  });
});
