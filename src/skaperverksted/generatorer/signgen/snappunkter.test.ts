import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import type { Dokument, TekstKilde } from '../../core/dokument';
import { lagVarianter, tolkCsv, foreslaKobling } from './batch';
import { oppdaterObjekter } from './dokument';
import { fotavtrykkBoks, lastFonter, verdensBoks } from './modell';
import { STANDARD_SNAP, lesSnap, settSnap } from './snapmotor';
import { leggTilSnappunkt, slettSnappunkt, snappunkterAv, snappunktPosisjon } from './snappunkter';
import { rentDokument } from './csvflyt';
import { skiltMedPlate } from './testskilt';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

/** A master with a name field. */
function master(): { dok: Dokument; tekstId: string } {
  const d = skiltMedPlate();
  const t = Object.values(d.objekter).find((o) => o.kilde.type === 'tekst')!;
  const dok = oppdaterObjekter(d, [t.id], (o) => ({
    ...o,
    kilde: { ...(o.kilde as TekstKilde), felt: 'navn' },
  }));
  return { dok, tekstId: t.id };
}

describe('Snap settings in the master', () => {
  it('start with a default that keeps the old plate spacing, and are clamped', () => {
    const { dok } = master();
    expect(lesSnap(dok)).toEqual(STANDARD_SNAP);
    expect(lesSnap(settSnap(dok, { avstand: 500, fangavstand: -3 }))).toMatchObject({
      avstand: 30,
      fangavstand: 0.5,
    });
  });

  it('take the plate spacing of older CSV work as the distance', () => {
    const { dok } = master();
    const gammel = { ...dok, parametre: { ...dok.parametre, csvarbeid: { valg: { plateavstand: 8 } } } };
    expect(lesSnap(gammel as Dokument).avstand).toBe(8);
    expect(lesSnap(settSnap(gammel as Dokument, { avstand: 2 })).avstand).toBe(2);
  });
});

describe('Snap points follow the geometry of every sign made from the master', () => {
  beforeAll(async () => {
    await lastFonter(master().dok);
  });

  it('sit on a fraction of the box, so a longer text moves the point with it', () => {
    const { dok, tekstId } = master();
    const med = leggTilSnappunkt(leggTilSnappunkt(dok, tekstId, 1, 0.5), 'skilt', 0, 0);
    const [hoyre, skiltHjorne] = lesSnap(med).punktliste;
    const csv = tolkCsv('navn\nOla\nMargrethe-Kristine');
    const v = lagVarianter(med, csv, foreslaKobling(csv, med), {});
    const kort = snappunktPosisjon(v[0]!.dok, hoyre!)!;
    const lang = snappunktPosisjon(v[1]!.dok, hoyre!)!;
    // the point is on the right edge of the text in both signs, and the long name reaches farther
    expect(kort.x).toBeCloseTo(verdensBoks(v[0]!.dok.objekter[tekstId]!).maksX, 6);
    expect(lang.x).toBeCloseTo(verdensBoks(v[1]!.dok.objekter[tekstId]!).maksX, 6);
    expect(lang.x).toBeGreaterThan(kort.x + 5);
    // the point on the whole sign is at the lower left of its own footprint
    const f = fotavtrykkBoks(v[1]!.dok)!;
    expect(snappunktPosisjon(v[1]!.dok, skiltHjorne!)).toEqual({ x: f.minX, y: f.minY });
  });

  it('are inherited by every sign, and a change to one sign leaves the master and the others alone', () => {
    const { dok, tekstId } = master();
    const med = leggTilSnappunkt(dok, tekstId, 1, 0.5);
    const csv = tolkCsv('navn\nOla\nKari');
    const v = lagVarianter(rentDokument(med), csv, foreslaKobling(csv, med), {});
    expect(lesSnap(v[0]!.dok).punktliste).toEqual(lesSnap(med).punktliste);
    expect(lesSnap(v[1]!.dok).punktliste).toEqual(lesSnap(med).punktliste);
    const foer = snappunkterAv(med);
    const andre = snappunkterAv(v[1]!.dok);
    // one sign gets a larger text of its own: its point moves, the master's and the other sign's do not
    const storre = oppdaterObjekter(v[0]!.dok, [tekstId], (o) => ({
      ...o,
      transform: { ...o.transform, skalaX: 2, skalaY: 2 },
    }));
    expect(snappunkterAv(storre)[0]!.x).not.toBeCloseTo(snappunkterAv(v[0]!.dok)[0]!.x, 3);
    expect(snappunkterAv(med)).toEqual(foer);
    expect(snappunkterAv(v[1]!.dok)).toEqual(andre);
  });

  it('are left out when what they sit on is gone, and can be deleted', () => {
    const { dok, tekstId } = master();
    const med = leggTilSnappunkt(dok, tekstId, 0.5, 0.5);
    const id = lesSnap(med).punktliste[0]!.id;
    expect(snappunkterAv(med)).toHaveLength(1);
    const uten = {
      ...med,
      objekter: Object.fromEntries(Object.entries(med.objekter).filter(([k]) => k !== tekstId)),
    };
    expect(snappunkterAv(uten)).toHaveLength(0);
    expect(lesSnap(slettSnappunkt(med, id)).punktliste).toHaveLength(0);
  });
});
