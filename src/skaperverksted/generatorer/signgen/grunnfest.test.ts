import type { Dokument } from '../../core/dokument';
import {
  kanHaOmriss,
  leggTilLag,
  leggTilObjekt,
  medObjektOmriss,
  nyForm,
  nyttLag,
  nyttObjekt,
  nyttOmriss,
  nyttSigngenDokument,
  oppdaterObjekter,
} from './dokument';
import { byggSigngen, grunnfest, omrissRegioner } from './modell';

/** An empty sign with automatic stacking, ready for plain shape layers. */
function tomt(): Dokument {
  const start = nyttSigngenDokument();
  return { ...start, lag: [], objekter: {}, rekkefolge: {}, parametre: { autoZ: true, lagHoyde: 0.2 } };
}

function medRekt(d: Dokument, navn: string, hoyde: number, x: number, y: number, b = 20, h = 10) {
  const lag = nyttLag(navn, 'pla-grafitt', hoyde);
  d = leggTilLag(d, lag);
  const o = nyttObjekt(lag.id, nyForm('rektangel', b, h, 0), { x, y }, navn);
  return { dok: leggTilObjekt(d, o), lag, o };
}

function medOmrissFor(d: Dokument, id: string, hoyde: number) {
  return medObjektOmriss(d, id, nyttOmriss('Omriss 1', 'pla-kritthvit', { hoyde, bredde: 2 }));
}

const z = (d: Dokument, navn: string) => d.lag.find((l) => l.navn === navn)!.zBunn;

describe('layers rest on what is under them', () => {
  it('stacks overlapping layers and puts separate ones on the build plate', () => {
    let d = tomt();
    d = medRekt(d, 'Plate', 3, 0, 0, 60, 30).dok;
    d = medRekt(d, 'Pynt', 1, 10, 0).dok; // on the plate
    d = medRekt(d, 'Ved siden', 2, 200, 0).dok; // nothing under it
    d = medRekt(d, 'Topp', 1, 10, 0, 6, 4).dok; // on the decor
    const n = grunnfest(d);
    expect(z(n, 'Plate')).toBe(0);
    expect(z(n, 'Pynt')).toBe(3);
    expect(z(n, 'Ved siden')).toBe(0);
    expect(z(n, 'Topp')).toBe(4);
  });

  it('lets two layers share a level when they only touch', () => {
    let d = tomt();
    d = medRekt(d, 'A', 2, 0, 0).dok;
    d = medRekt(d, 'B', 2, 20, 0).dok; // edge to edge: no shared ground
    const n = grunnfest(d);
    expect([z(n, 'A'), z(n, 'B')]).toEqual([0, 0]);
  });

  it('drops a layer to the plate when it is moved off what it rested on, and lifts it back', () => {
    let d = tomt();
    const plate = medRekt(d, 'Plate', 3, 0, 0, 60, 30);
    const pynt = medRekt(plate.dok, 'Pynt', 1, 10, 0);
    d = grunnfest(pynt.dok);
    expect(z(d, 'Pynt')).toBe(3);
    d = grunnfest(oppdaterObjekter(d, [pynt.o.id], (o) => ({ ...o, transform: { ...o.transform, x: 100 } })));
    expect(z(d, 'Pynt')).toBe(0);
    d = grunnfest(oppdaterObjekter(d, [pynt.o.id], (o) => ({ ...o, transform: { ...o.transform, x: 5 } })));
    expect(z(d, 'Pynt')).toBe(3);
  });

  it('keeps «samme nivå» on the level of the layer it joins, and stays put on repeat', () => {
    let d = tomt();
    d = medRekt(d, 'Plate', 3, 0, 0, 60, 30).dok;
    d = medRekt(d, 'Pynt', 1, 0, 0, 10, 10).dok;
    d = { ...d, lag: d.lag.map((l) => (l.navn === 'Pynt' ? { ...l, sammeNivaa: false } : l)) };
    d = medRekt(d, 'Ved siden av pynt', 1, 5, 0, 10, 10).dok;
    d = { ...d, lag: d.lag.map((l) => (l.navn === 'Ved siden av pynt' ? { ...l, sammeNivaa: true } : l)) };
    const n = grunnfest(d);
    expect(z(n, 'Pynt')).toBe(3);
    expect(z(n, 'Ved siden av pynt')).toBe(3);
    expect(grunnfest(n)).toBe(n);
  });

  it('rests on the outline of a layer too, and on nothing when automatic stacking is off', () => {
    let d = tomt();
    const a = medRekt(d, 'Form', 1, 0, 0, 10, 10);
    d = medOmrissFor(a.dok, a.o.id, 3).dok;
    d = medRekt(d, 'Over', 1, 8, 0, 4, 4).dok; // reaches only the outline's ring
    expect(z(grunnfest(d), 'Over')).toBe(3);
    const manuell = { ...d, parametre: { ...d.parametre, autoZ: false } };
    expect(grunnfest(manuell)).toBe(manuell);
  });

  it('prints the grounded heights', async () => {
    let d = tomt();
    d = medRekt(d, 'Plate', 3, 0, 0, 60, 30).dok;
    d = medRekt(d, 'Pynt', 1, 0, 0, 10, 10).dok;
    d = medRekt(d, 'Ved siden', 2, 200, 0).dok;
    const r = await byggSigngen(d);
    const sidestilt = r.deler.find((x) => x.navn === 'Ved siden')!;
    expect(
      Math.min(
        ...Array.from(
          { length: sidestilt.mesh.posisjoner.length / 3 },
          (_, i) => sidestilt.mesh.posisjoner[i * 3 + 2]!,
        ),
      ),
    ).toBeCloseTo(0, 5);
    expect(r.advarsler.some((a) => a.tekst.includes('henger i lufta'))).toBe(false);
  });
});

describe('every shape can have an outline of its own', () => {
  it('gives a lone shape an outline in its own layer', () => {
    const a = medRekt(tomt(), 'Form', 2, 0, 0, 20, 10);
    const r = medObjektOmriss(a.dok, a.o.id, nyttOmriss('Omriss 1', 'pla-kritthvit', { bredde: 2 }));
    expect(r.lagId).toBe(a.lag.id);
    const lag = r.dok.lag[0]!;
    expect(lag.omriss).toHaveLength(1);
    expect(kanHaOmriss(r.dok, lag)).toBe(true);
    const ring = omrissRegioner(r.dok, lag.id)!;
    expect(ring.size).toBe(1);
  });

  it('splits a shape out of a shared layer so the outline is its own', () => {
    let d = tomt();
    const lag = nyttLag('Pynt', 'pla-grafitt', 2);
    d = leggTilLag(d, lag);
    const a = nyttObjekt(lag.id, nyForm('rektangel', 20, 10, 0), { x: 0 }, 'A');
    const b = nyttObjekt(lag.id, nyForm('ellipse', 10, 10, 0), { x: 40 }, 'B');
    d = leggTilObjekt(leggTilObjekt(d, a), b);
    const r = medObjektOmriss(d, b.id, nyttOmriss('Omriss 1', 'pla-kritthvit', { bredde: 2 }));
    expect(r.lagId).not.toBe(lag.id);
    const ny = r.dok.lag.find((l) => l.id === r.lagId)!;
    expect(ny.sammeNivaa).toBe(true);
    expect(ny.omriss).toHaveLength(1);
    expect(r.dok.lag.find((l) => l.id === lag.id)!.omriss ?? []).toHaveLength(0);
    expect(r.dok.objekter[b.id]!.lagId).toBe(ny.id);
    // same level as before, so the height of the sign does not change
    expect(grunnfest(r.dok).lag.find((l) => l.id === ny.id)!.zBunn).toBe(0);
  });

  it('refuses holes', () => {
    const a = medRekt(tomt(), 'Hull', 2, 0, 0, 4, 4);
    const hull = { ...a.dok.objekter[a.o.id]!, kilde: nyForm('hull', 4, 4, 0) };
    const d = { ...a.dok, objekter: { ...a.dok.objekter, [a.o.id]: hull } };
    expect(medObjektOmriss(d, a.o.id, nyttOmriss('x', 'pla-grafitt')).lagId).toBeNull();
  });

  it('prints the outline of a plain shape as a part of its own', async () => {
    const a = medRekt(tomt(), 'Form', 2, 0, 0, 20, 10);
    const r = medObjektOmriss(a.dok, a.o.id, nyttOmriss('Ring', 'pla-kritthvit', { bredde: 2, hoyde: 1 }));
    const modell = await byggSigngen(r.dok);
    expect(modell.deler.length).toBeGreaterThanOrEqual(2);
  });
});
