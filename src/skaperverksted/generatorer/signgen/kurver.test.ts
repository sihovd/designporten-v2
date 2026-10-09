import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, type SvgKilde } from '../../core/dokument';
import { antallAapne, tolkBaner } from '../../geometri/bane';
import { areal } from '../../geometri/polygon';
import plugin from './index';
import { leggTil } from './handlinger';
import {
  dyttValgte,
  fargeValgtForm,
  hentBaner,
  kurveObjekt,
  leggTilPennBane,
  leggTilPunkt,
  lukkValgteBaner,
  reparerAapne,
  settKurve,
  settValgteNodetype,
  skrivBaner,
  slettKurveValg,
  startKurveredigering,
} from './kurver';
import { lastFonter, lokalGeometri } from './modell';
import { signtilstand } from './tilstand';

beforeAll(async () => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
  await lastFonter(plugin.nyttDokument());
});

// a square with a square hole, and a separate round shape
const STI =
  'M-20 -10L-10 -10L-10 0L-20 0ZM-18 -8L-18 -2L-12 -2L-12 -8ZM5 -5C5 -10 15 -10 15 -5C15 0 10 -1 10 -2C10 -3 5 -1 5 -5Z';

function benkMedVektor(sti = STI) {
  const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
  const kilde: SvgKilde = { type: 'svg', stier: [sti], filnavn: 'prove', fyllregel: 'evenodd' };
  const o = leggTil(benk, kilde, { x: 50, y: 30 }, 'Prøve')!;
  expect(startKurveredigering(benk, o.id)).toBe(true);
  return { benk, id: o.id };
}

const arealAv = (benk: Arbeidsbenk, id: string) => areal(lokalGeometri(benk.dok.objekter[id]!.kilde)!.region);

describe('Editing the curves of a vector', () => {
  it('moves a point and undoes it in one step', () => {
    const { benk, id } = benkMedVektor();
    const for_ = arealAv(benk, id);
    settKurve(benk, { noder: [[0, 2]], baner: [], segment: null });
    expect(dyttValgte(benk, 5, 0)).toBe(true);
    expect(arealAv(benk, id)).toBeGreaterThan(for_);
    benk.angre();
    expect(arealAv(benk, id)).toBeCloseTo(for_, 6);
    benk.avslutt();
  });

  it('adds a point on a curve and makes it a corner or smooth', () => {
    const { benk, id } = benkMedVektor();
    const antall = () => hentBaner(benk.dok.objekter[id]!)![2]!.noder.length;
    expect(antall()).toBe(3);
    leggTilPunkt(benk, 2, 0, 0.5);
    expect(antall()).toBe(4);
    expect(kurveObjekt(benk)!.k.noder).toEqual([[2, 1]]);
    settValgteNodetype(benk, false);
    expect(hentBaner(benk.dok.objekter[id]!)![2]!.noder[1]!.glatt).toBe(false);
    settValgteNodetype(benk, true);
    expect(hentBaner(benk.dok.objekter[id]!)![2]!.noder[1]!.glatt).toBe(true);
    benk.avslutt();
  });

  it('deletes a point, a curve piece and a whole shape with its hole', () => {
    const { benk, id } = benkMedVektor();
    const baner = () => hentBaner(benk.dok.objekter[id]!)!;
    // a point
    settKurve(benk, { noder: [[2, 1]], baner: [], segment: null });
    expect(slettKurveValg(benk)).toBe(true);
    expect(baner()[2]!.noder).toHaveLength(2);
    // the shape with the hole in it takes the hole along
    settKurve(benk, { noder: [], baner: [0], segment: null });
    expect(slettKurveValg(benk)).toBe(true);
    expect(baner()).toHaveLength(1);
    // nothing selected: nothing happens
    expect(slettKurveValg(benk)).toBe(false);
    benk.angre();
    benk.angre();
    expect(baner()).toHaveLength(3);
    benk.avslutt();
  });

  it('removes the vector when its last shape is deleted', () => {
    const { benk, id } = benkMedVektor('M0 0L10 0L10 10L0 10Z');
    settKurve(benk, { baner: [0] });
    slettKurveValg(benk);
    expect(benk.dok.objekter[id]).toBeUndefined();
    expect(signtilstand(benk).t.kurve).toBeNull();
    benk.avslutt();
  });

  it('gives a shape a colour of its own as an object in the same layer', () => {
    const { benk, id } = benkMedVektor();
    const lagFor = benk.dok.lag.length;
    const lagId = benk.dok.objekter[id]!.lagId;
    const antallFor = Object.keys(benk.dok.objekter).length;
    settKurve(benk, { baner: [2], noder: [], segment: null });
    expect(fargeValgtForm(benk, 'pla-roed')).toBe(true);
    const d = benk.dok;
    // no new layer: the layer's outline, height and profile are shared by both colours
    expect(d.lag.length).toBe(lagFor);
    expect(Object.keys(d.objekter).length).toBe(antallFor + 1);
    const nytt = Object.values(d.objekter).find((o) => o.materialId === 'pla-roed')!;
    expect(nytt.lagId).toBe(lagId);
    expect(d.objekter[id]!.materialId).toBeUndefined();
    // the rest of the original keeps its two paths
    expect(hentBaner(d.objekter[id]!)).toHaveLength(2);
    // the coloured shape sits right after the vector in the layer, not at the end, and keeps its role
    const rekke = d.rekkefolge[lagId]!;
    expect(rekke[rekke.indexOf(id) + 1]).toBe(nytt.id);
    expect(nytt.operasjon).toBe(d.objekter[id]!.operasjon);
    benk.angre();
    expect(benk.dok.lag.length).toBe(lagFor);
    expect(Object.keys(benk.dok.objekter).length).toBe(antallFor);
    expect(hentBaner(benk.dok.objekter[id]!)).toHaveLength(3);
    benk.avslutt();
  });
});

describe('Colouring a whole vector', () => {
  it('recolours the layer when the vector is alone in it', () => {
    const { benk, id } = benkMedVektor('M0 0L10 0L10 10L0 10Z');
    const lagId = benk.dok.objekter[id]!.lagId;
    const antall = benk.dok.lag.length;
    settKurve(benk, { baner: [0] });
    expect(fargeValgtForm(benk, 'pla-roed')).toBe(true);
    expect(benk.dok.lag.length).toBe(antall);
    expect(finnLag(benk.dok, lagId)!.materialId).toBe('pla-roed');
    benk.avslutt();
  });
});

describe('Paths that are not closed', () => {
  const APEN = 'M0 0L10 0L10 10L0 10L0 0.2';

  it('is told how many paths are open, and closes them', () => {
    const { benk, id } = benkMedVektor(APEN);
    const baner = () => hentBaner(benk.dok.objekter[id]!)!;
    expect(antallAapne(baner())).toBe(1);
    lukkValgteBaner(benk);
    expect(antallAapne(baner())).toBe(0);
    benk.avslutt();
  });

  it('repairs a gap within the tolerance, and leaves a bigger one until forced', () => {
    const { benk, id } = benkMedVektor(APEN);
    const baner = () => hentBaner(benk.dok.objekter[id]!)!;
    settKurve(benk, { repToleranse: 0.05 });
    reparerAapne(benk);
    expect(antallAapne(baner())).toBe(1);
    settKurve(benk, { repToleranse: 0.5 });
    reparerAapne(benk);
    expect(antallAapne(baner())).toBe(0);
    benk.angre();
    expect(antallAapne(baner())).toBe(1);
    benk.avslutt();
  });

  it('closes what is still open with a straight line when asked', () => {
    const { benk, id } = benkMedVektor('M0 0L10 0L10 10L0 10');
    settKurve(benk, { repToleranse: 0.1, repTving: true });
    reparerAapne(benk);
    expect(antallAapne(hentBaner(benk.dok.objekter[id]!)!)).toBe(0);
    benk.avslutt();
  });
});

describe('Drawing with the pen', () => {
  const bane = (...p: [number, number][]) => ({
    noder: p.map(([x, y]) => ({ p: { x, y }, inn: null, ut: null, glatt: false })),
    lukket: true,
  });

  it('makes a vector where it was drawn, and adds the next path to it', () => {
    const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
    const id = leggTilPennBane(benk, bane([10, 10], [30, 10], [30, 30], [10, 30]), null)!;
    const o = benk.dok.objekter[id]!;
    expect(o.kilde.type).toBe('svg');
    const g = lokalGeometri(o.kilde)!;
    expect(areal(g.region)).toBeCloseTo(400, 0);
    expect(benk.tilstand.utvalg.objekter).toEqual([id]);
    // a path inside the first is a hole
    leggTilPennBane(benk, bane([15, 15], [25, 15], [25, 25], [15, 25]), id);
    expect(hentBaner(benk.dok.objekter[id]!)).toHaveLength(2);
    expect(arealAv(benk, id)).toBeCloseTo(300, 0);
    benk.angre();
    expect(arealAv(benk, id)).toBeCloseTo(400, 0);
    benk.avslutt();
  });

  it('keeps a drawing where it is, whatever the vector is moved or scaled to afterwards', () => {
    const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
    const id = leggTilPennBane(benk, bane([10, 10], [30, 10], [30, 30], [10, 30]), null)!;
    benk.endre({
      navn: 'Flytt',
      anvend: (d) => ({
        ...d,
        objekter: {
          ...d.objekter,
          [id]: { ...d.objekter[id]!, transform: { ...d.objekter[id]!.transform, x: 100, skalaX: 2 } },
        },
      }),
    });
    leggTilPennBane(benk, bane([105, 12], [115, 12], [115, 20], [105, 20]), id);
    const nye = hentBaner(benk.dok.objekter[id]!)!;
    expect(nye).toHaveLength(2);
    // local x of the new path: (105 - 100) / 2
    const lokal = tolkBaner(
      benk.dok.objekter[id]!.kilde.type === 'svg'
        ? (benk.dok.objekter[id]!.kilde as SvgKilde).stier.join('')
        : '',
    );
    expect(lokal[1]!.noder[0]!.p.x).toBeCloseTo(2.5, 2);
    benk.avslutt();
  });

  it('writes edited curves back as path data', () => {
    const { benk, id } = benkMedVektor('M0 0L10 0L10 10L0 10Z');
    const baner = hentBaner(benk.dok.objekter[id]!)!;
    skrivBaner(benk, baner, 'Prøve');
    expect((benk.dok.objekter[id]!.kilde as SvgKilde).stier[0]).toMatch(/^M/);
    benk.avslutt();
  });
});
