import type { Mesh } from '../../geometri/mesh';
import { OPPLOSNING, avstandVed, lagSilhuett, lagSilhuettFraRegioner, minsteAvstand } from './silhuett';
import type { Region } from '../../geometri/polygon';
import {
  boksAnkere,
  holdPaPlata,
  plasseringsproblemer,
  snapKanter,
  snapPunkter,
  snapSkilt,
  type PlassertSkilt,
} from './snapmotor';

/** A flat rectangle as two triangles, at z = 0. */
function rekt(x0: number, y0: number, x1: number, y1: number): Mesh {
  return {
    posisjoner: new Float32Array([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0]),
    indekser: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

const boksAv = (x0: number, y0: number, x1: number, y1: number) => ({
  minX: x0,
  minY: y0,
  maksX: x1,
  maksY: y1,
});

function skilt(
  id: number,
  meshes: Mesh[],
  boks: ReturnType<typeof boksAv>,
  dx: number,
  dy: number,
): PlassertSkilt {
  return { id, silhuett: lagSilhuett(meshes), boks, dx, dy };
}

const PLATE = { bredde: 256, dybde: 256 };
const VALG = { paa: true, avstand: 1, radius: 5 };

describe('Outline of a sign (Edge Snap)', () => {
  it('fills the cells of the parts and reads distances in millimetres', () => {
    const s = lagSilhuett([rekt(0, 0, 20, 10)]);
    const fylt = s.fylt.reduce((n, v) => n + v, 0);
    expect(fylt * OPPLOSNING * OPPLOSNING).toBeCloseTo(200, -1);
    expect(avstandVed(s, 10, 5)).toBe(0);
    expect(avstandVed(s, 25, 5)).toBeCloseTo(5, 0);
    expect(avstandVed(s, 10, 14)).toBeCloseTo(4, 0);
  });

  it('fills holes inside the sign, but not a notch that opens to the outside', () => {
    // a frame with a closed hole
    const ramme = lagSilhuett([
      rekt(0, 0, 30, 3),
      rekt(0, 17, 30, 20),
      rekt(0, 0, 3, 20),
      rekt(27, 0, 30, 20),
    ]);
    expect(avstandVed(ramme, 15, 10)).toBe(0);
    // a U with an open notch
    const u = lagSilhuett([rekt(0, 0, 30, 3), rekt(0, 0, 3, 20), rekt(27, 0, 30, 20)]);
    expect(avstandVed(u, 15, 10)).toBeGreaterThan(5);
  });

  it('measures the distance between two outlines, with the contact and the direction', () => {
    const a = lagSilhuett([rekt(0, 0, 20, 10)]);
    const b = lagSilhuett([rekt(0, 0, 20, 10)]);
    const k = minsteAvstand(a, 0, 0, b, 25, 0);
    expect(k.d).toBeCloseTo(5, 0);
    // the second sign lies to the right, so the first one is pushed to the left
    expect(k.retning[0]).toBeLessThan(-0.9);
    expect(minsteAvstand(a, 0, 0, b, 5, 3).d).toBe(0);
  });
});

describe('Edge Snap', () => {
  const nabo = skilt(1, [rekt(0, 0, 40, 20)], boksAv(0, 0, 40, 20), 0, 0);

  it('holds a sign at the minimum distance from the contour of a neighbour', () => {
    const mover = skilt(2, [rekt(0, 0, 30, 20)], boksAv(0, 0, 30, 20), 0, 0);
    // asked for 3 mm from the neighbour's right edge: it is pulled to 1 mm
    const r = snapSkilt(mover, 43, 2, [nabo], PLATE, VALG);
    expect(r.kontakt?.nabo).toBe(1);
    const d = minsteAvstand(mover.silhuett, r.dx, r.dy, nabo.silhuett, 0, 0).d;
    expect(d).toBeGreaterThanOrEqual(1 - 0.01);
    expect(d).toBeLessThan(1.4);
    // it slides along the edge with the pointer
    expect(r.dy).toBeCloseTo(2, 0);
  });

  it('pushes a sign out when it is dragged into a neighbour', () => {
    const mover = skilt(2, [rekt(0, 0, 30, 20)], boksAv(0, 0, 30, 20), 0, 0);
    const r = snapSkilt(mover, 38, 4, [nabo], PLATE, VALG);
    const d = minsteAvstand(mover.silhuett, r.dx, r.dy, nabo.silhuett, 0, 0).d;
    expect(d).toBeGreaterThanOrEqual(1 - 0.01);
    expect(d).toBeLessThan(1.6);
    expect(plasseringsproblemer([nabo, { ...mover, dx: r.dx, dy: r.dy }], PLATE).overlapper).toEqual([]);
  });

  it('follows the real contour, not the box', () => {
    // an L: the neighbour's box covers the notch, the contour does not
    const l = skilt(1, [rekt(0, 0, 40, 10), rekt(0, 0, 10, 40)], boksAv(0, 0, 40, 40), 0, 0);
    const lite = skilt(2, [rekt(0, 0, 10, 10)], boksAv(0, 0, 10, 10), 0, 0);
    // right of the stem and above the foot: inside the box, but free
    const r = snapSkilt(lite, 12, 12, [l], PLATE, VALG);
    expect(r.kontakt).not.toBeNull();
    expect(r.dx).toBeLessThan(13);
    expect(r.dy).toBeLessThan(13);
    // it ends at the wanted distance from the corner of the L, not 1 mm from a box
    const d = minsteAvstand(lite.silhuett, r.dx, r.dy, l.silhuett, 0, 0).d;
    expect(d).toBeGreaterThanOrEqual(1 - 0.01);
    expect(d).toBeLessThan(1.4);
  });

  it('leaves a sign alone when it is far away, or when snapping is off', () => {
    const mover = skilt(2, [rekt(0, 0, 30, 20)], boksAv(0, 0, 30, 20), 0, 0);
    const langt = snapSkilt(mover, 80, 5, [nabo], PLATE, VALG);
    expect(langt).toEqual({ dx: 80, dy: 5, kontakt: null });
    const av = snapSkilt(mover, 38, 4, [nabo], PLATE, { ...VALG, paa: false });
    expect(av).toEqual({ dx: 38, dy: 4, kontakt: null });
  });

  it('uses the distance the user asks for', () => {
    const mover = skilt(2, [rekt(0, 0, 30, 20)], boksAv(0, 0, 30, 20), 0, 0);
    const r = snapSkilt(mover, 44, 0, [nabo], PLATE, { ...VALG, avstand: 3 });
    const d = minsteAvstand(mover.silhuett, r.dx, r.dy, nabo.silhuett, 0, 0).d;
    expect(d).toBeGreaterThanOrEqual(3 - 0.01);
    expect(d).toBeLessThan(3.4);
  });

  it('keeps a sign on the plate', () => {
    expect(holdPaPlata(boksAv(0, 0, 30, 20), 500, 500, PLATE)).toEqual({ dx: 128 - 30, dy: 128 - 20 });
    expect(holdPaPlata(boksAv(0, 0, 30, 20), -500, -500, PLATE)).toEqual({ dx: -128, dy: -128 });
  });

  it('reports signs that overlap or stick out', () => {
    const a = skilt(1, [rekt(0, 0, 30, 20)], boksAv(0, 0, 30, 20), 0, 0);
    const b = skilt(2, [rekt(0, 0, 30, 20)], boksAv(0, 0, 30, 20), 20, 5);
    const c = skilt(3, [rekt(0, 0, 30, 20)], boksAv(0, 0, 30, 20), 120, 0);
    expect(plasseringsproblemer([a, b, c], PLATE)).toEqual({ overlapper: [1, 2], utenfor: [3] });
  });
});

const ring = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('Contours of flat regions (the 2D editor)', () => {
  it('fills a square, leaves a notch that opens outwards and fills a hole inside', () => {
    const kvadrat: Region = [{ ytre: ring(0, 0, 20, 20), hull: [ring(8, 8, 12, 12).reverse()] }];
    const s = lagSilhuettFraRegioner([kvadrat]);
    expect(avstandVed(s, 10, 10)).toBe(0);
    expect(avstandVed(s, 10, 10)).toBe(0);
    // 5 mm outside the edge
    expect(avstandVed(s, 25, 10)).toBeGreaterThan(4.5);
    expect(avstandVed(s, 25, 10)).toBeLessThan(5.5);
  });

  it('measures the same distance as the meshes of the same shape', () => {
    const a = lagSilhuettFraRegioner([[{ ytre: ring(0, 0, 10, 10), hull: [] }]]);
    const b = lagSilhuettFraRegioner([[{ ytre: ring(0, 0, 10, 10), hull: [] }]]);
    const m = lagSilhuett([rekt(0, 0, 10, 10)]);
    const n = lagSilhuett([rekt(0, 0, 10, 10)]);
    const fraRegion = minsteAvstand(a, 0, 0, b, 13, 0).d;
    const fraMesh = minsteAvstand(m, 0, 0, n, 13, 0).d;
    expect(fraRegion).toBeCloseTo(fraMesh, 1);
    expect(fraRegion).toBeCloseTo(3, 0);
  });

  it('reaches as far as the margin it was asked for', () => {
    const s = lagSilhuettFraRegioner([[{ ytre: ring(0, 0, 10, 10), hull: [] }]], 30);
    expect(s.felt).toBe(30);
    expect(avstandVed(s, 35, 5)).toBeGreaterThan(24);
  });
});

describe('One engine for edges, points and contours', () => {
  const mal = { rutenett: true, hjelpelinjer: true, objekter: true, sentre: true };

  it('pulls the edge of a box to the edge of another and to a guide, and to the grid when nothing is near', () => {
    const b = { minX: 10.4, maksX: 20.4, minY: 50, maksY: 60 };
    const andre = [{ minX: 30, maksX: 40, minY: 0, maksY: 10 }];
    const k = snapKanter(b, andre, [], mal, 1, 1);
    // x: nothing within 1 mm, so the grid takes the left edge; y: nothing near either
    expect(k.treff).toHaveLength(0);
    expect(k.dx).toBeCloseTo(-0.4, 6);
    expect(k.dy).toBeCloseTo(0, 6);
    const n = snapKanter({ ...b, minX: 29.6, maksX: 39.6 }, andre, [], mal, 1, 1);
    expect(n.dx).toBeCloseTo(0.4, 6);
    expect(n.treff[0]).toMatchObject({ akse: 'x', verdi: 30 });
    const g = snapKanter(b, [], [{ akse: 'y', verdi: 55.5 }], mal, 1, 1);
    expect(g.dy).toBeCloseTo(0.5, 6);
    // a guide line only counts when guides are a target
    expect(
      snapKanter(b, [], [{ akse: 'y', verdi: 55.5 }], { ...mal, hjelpelinjer: false }, 1, 1).treff,
    ).toHaveLength(0);
  });

  it('puts a point on the nearest target point within reach, and on nothing farther away', () => {
    const f = snapPunkter(
      boksAnkere({ minX: 0, maksX: 10, minY: 0, maksY: 10 }),
      [{ x: 10.5, y: 4, id: 'a' }],
      2,
    );
    expect(f).toMatchObject({ dx: 0.5, dy: -1, malId: 'a' });
    expect(
      snapPunkter(boksAnkere({ minX: 0, maksX: 10, minY: 0, maksY: 10 }), [{ x: 20, y: 20 }], 2),
    ).toBeNull();
  });

  it('puts the snap point of one sign on the snap point of its neighbour before it looks at contours', () => {
    const a = { ...skilt(1, [rekt(0, 0, 20, 10)], boksAv(0, 0, 20, 10), 0, 0), punkter: [{ x: 20, y: 10 }] };
    const b = { ...skilt(2, [rekt(0, 0, 20, 10)], boksAv(0, 0, 20, 10), 0, 0), punkter: [{ x: 0, y: 10 }] };
    const r = snapSkilt(b, 22, 1, [a], PLATE, { ...VALG, punkter: true });
    expect(r.kontakt?.type).toBe('punkt');
    expect(r.dx).toBeCloseTo(20, 6);
    expect(r.dy).toBeCloseTo(0, 6);
    // with points off the same move is held at a distance from the contour instead
    const k = snapSkilt(b, 22, 1, [a], PLATE, { ...VALG, punkter: false });
    expect(k.kontakt?.type).toBe('kontur');
  });

  it('works without a plate, for the editor', () => {
    const a = skilt(1, [rekt(0, 0, 20, 10)], boksAv(0, 0, 20, 10), 0, 0);
    const b = skilt(2, [rekt(0, 0, 10, 10)], boksAv(0, 0, 10, 10), 0, 0);
    const r = snapSkilt(b, 23, 0, [a], null, { paa: true, avstand: 5, radius: 3 });
    expect(r.kontakt?.type).toBe('kontur');
    expect(r.dx).toBeGreaterThan(24.8);
    expect(r.dx).toBeLessThan(25.4);
  });
});
