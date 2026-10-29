import type { Dokument } from '../../core/dokument';
import {
  kanHaOmriss,
  leggTilLag,
  leggTilObjekt,
  flyttOmrissTilLag,
  medObjektOmriss,
  nyForm,
  nyttLag,
  nyttObjekt,
  nyttOmriss,
  nyttSigngenDokument,
  oppdaterLag,
  oppdaterObjekter,
  settOmrissGjelder,
} from './dokument';
import { regionBoks } from '../../geometri/polygon';
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

describe('what a layer rests on can be chosen (Sivert, 2026-10-29)', () => {
  /** A 60 x 30 plate and a hook that starts over the plate and reaches out into the air. */
  function medKrok(hvile?: 'oppa' | 'bed' | 'lavest', x = 25) {
    let d = medRekt(tomt(), 'Plate', 3, 0, 0, 60, 30).dok;
    const k = medRekt(d, 'Krok', 1, x, 0, 20, 4);
    d = k.dok;
    if (hvile) d = oppdaterLag(d, k.lag.id, { hvile });
    return d;
  }

  it('on top by default, on the plate with «bed», and on the plate with «lavest» when part hangs out', () => {
    expect(z(grunnfest(medKrok()), 'Krok')).toBe(3);
    expect(z(grunnfest(medKrok('bed')), 'Krok')).toBe(0);
    expect(z(grunnfest(medKrok('lavest')), 'Krok')).toBe(0);
  });

  it('«lavest» keeps a layer that lies wholly over the plate on top of it', () => {
    expect(z(grunnfest(medKrok('lavest', 0)), 'Krok')).toBe(3);
  });

  it('«lavest» starts at the lowest top when the shape is wholly over layers of different heights', () => {
    let d = medRekt(tomt(), 'Lav', 2, -10, 0, 20, 10).dok;
    d = medRekt(d, 'Hoy', 5, 10, 0, 20, 10).dok;
    const k = medRekt(d, 'Bro', 1, 0, 0, 10, 4); // spans x -5..5 over Lav and 5 is the edge of Hoy
    d = oppdaterLag(k.dok, k.lag.id, { hvile: 'lavest' });
    expect(z(grunnfest(d), 'Bro')).toBe(2);
  });
});

describe('an outline can wrap only some of the objects in a layer (Sivert, 2026-10-29)', () => {
  function gruppe() {
    let d = tomt();
    const lag = nyttLag('Gruppe', 'pla-grafitt', 2);
    d = leggTilLag(d, lag);
    const a = nyttObjekt(lag.id, nyForm('rektangel', 10, 10, 0), { x: 0 }, 'A');
    const b = nyttObjekt(lag.id, nyForm('rektangel', 10, 10, 0), { x: 60 }, 'B');
    d = leggTilObjekt(leggTilObjekt(d, a), b);
    return { d, lag, a, b };
  }
  const omrissAv = (d: Dokument, lagId: string) => d.lag.find((l) => l.id === lagId)!.omriss!;
  const boks = (d: Dokument, lagId: string, id: string) => regionBoks(omrissRegioner(d, lagId)!.get(id)!);

  it('wraps everything without a scope, and only the chosen objects with one', () => {
    const { d, lag, a, b } = gruppe();
    const dd = leggOmrissDirekte(d, lag.id);
    const o = omrissAv(dd, lag.id)[0]!;
    const alle = boks(dd, lag.id, o.id);
    expect(alle.maksX - alle.minX).toBeGreaterThan(60);
    const kunB = boks(settOmrissGjelder(dd, lag.id, o.id, [b.id]), lag.id, o.id);
    expect(kunB.maksX - kunB.minX).toBeLessThan(20);
    expect(kunB.minX).toBeGreaterThan(40);
    const kunA = boks(settOmrissGjelder(dd, lag.id, o.id, [a.id]), lag.id, o.id);
    expect(kunA.maksX).toBeLessThan(20);
    // clearing the scope wraps everything again
    const igjen = boks(
      settOmrissGjelder(settOmrissGjelder(dd, lag.id, o.id, [a.id]), lag.id, o.id, null),
      lag.id,
      o.id,
    );
    expect(igjen.maksX - igjen.minX).toBeGreaterThan(60);
  });

  it('two outlines can wrap different objects of one layer', () => {
    const { d, lag, a, b } = gruppe();
    let dd = leggOmrissDirekte(leggOmrissDirekte(d, lag.id), lag.id);
    const [o1, o2] = omrissAv(dd, lag.id);
    dd = settOmrissGjelder(dd, lag.id, o1!.id, [a.id]);
    dd = settOmrissGjelder(dd, lag.id, o2!.id, [b.id]);
    expect(boks(dd, lag.id, o1!.id).maksX).toBeLessThan(20);
    expect(boks(dd, lag.id, o2!.id).minX).toBeGreaterThan(40);
  });

  it('an outline for an object that has left the layer prints nothing', () => {
    const { d, lag, a } = gruppe();
    let dd = leggOmrissDirekte(d, lag.id);
    const o = omrissAv(dd, lag.id)[0]!;
    dd = settOmrissGjelder(dd, lag.id, o.id, [a.id]);
    const uten = {
      ...dd,
      rekkefolge: { ...dd.rekkefolge, [lag.id]: dd.rekkefolge[lag.id]!.filter((x) => x !== a.id) },
    };
    expect(omrissRegioner(uten, lag.id)!.has(o.id)).toBe(false);
  });

  it('an outline moves to another layer and then wraps everything there', () => {
    const { d, lag, a } = gruppe();
    const dd = leggOmrissDirekte(d, lag.id);
    const o = omrissAv(dd, lag.id)[0]!;
    const ann = medRekt(dd, 'Annet', 2, 0, 40, 10, 10);
    const scoped = settOmrissGjelder(ann.dok, lag.id, o.id, [a.id]);
    const flyttet = flyttOmrissTilLag(scoped, lag.id, o.id, ann.lag.id);
    expect(flyttet.lag.find((l) => l.id === lag.id)!.omriss ?? []).toHaveLength(0);
    const ny = omrissAv(flyttet, ann.lag.id);
    expect(ny.map((x) => x.id)).toEqual([o.id]);
    expect(ny[0]!.gjelder).toBeUndefined();
  });
});

/** An outline on a whole layer, whatever it holds. */
function leggOmrissDirekte(d: Dokument, lagId: string): Dokument {
  return {
    ...d,
    lag: d.lag.map((l) =>
      l.id === lagId
        ? {
            ...l,
            omriss: [
              ...(l.omriss ?? []),
              nyttOmriss(`Omriss ${(l.omriss?.length ?? 0) + 1}`, 'pla-kritthvit', { bredde: 2, avstand: 1 }),
            ],
          }
        : l,
    ),
  };
}
