import {
  antallAapne,
  baneVedPunkt,
  banerBoks,
  banerTilRinger,
  banerTilSti,
  flyttNoder,
  formAv,
  lukkBane,
  narmesteSegment,
  reparerBaner,
  reverserBane,
  settHandtak,
  settInnNode,
  settNodeType,
  slettBaner,
  slettNoder,
  slettSegment,
  tolkBaner,
  transformerBaner,
} from './bane';
import { areal, regionFraRinger } from './polygon';

const areaIDeler = (d: string) => areal(regionFraRinger(banerTilRinger(tolkBaner(d), 0.01), 'nonzero'));

describe('Reading and writing curves', () => {
  it('keeps lines and cubic curves as they are', () => {
    const baner = tolkBaner('M0 0L10 0C12 0 12 5 10 5L0 5Z');
    expect(baner).toHaveLength(1);
    expect(baner[0]!.lukket).toBe(true);
    expect(baner[0]!.noder).toHaveLength(4);
    expect(baner[0]!.noder[1]!.ut).toEqual({ x: 2, y: 0 });
    expect(baner[0]!.noder[2]!.inn).toEqual({ x: 2, y: 0 });
    expect(banerTilSti(baner)).toBe('M0 0L10 0C12 0 12 5 10 5L0 5Z');
  });

  it('reads relative commands, H and V, and implicit lines after M', () => {
    const a = tolkBaner('M1 1 l3 0 v2 h-3z');
    const b = tolkBaner('M1 1L4 1L4 3L1 3Z');
    expect(banerTilSti(a)).toBe(banerTilSti(b));
  });

  it('treats a closing line back to the start as the closing segment', () => {
    const b = tolkBaner('M0 0L4 0L4 4L0 4L0 0Z');
    expect(b[0]!.noder).toHaveLength(4);
  });

  it('converts quadratic curves and arcs to cubics without changing the area', () => {
    // a circle of radius 10 from two arcs
    const sirkel = 'M-10 0A10 10 0 1 0 10 0A10 10 0 1 0 -10 0Z';
    const baner = tolkBaner(sirkel);
    expect(baner[0]!.noder.length).toBeGreaterThanOrEqual(4);
    expect(banerTilSti(baner)).toMatch(/C/);
    expect(areaIDeler(banerTilSti(baner))).toBeCloseTo(Math.PI * 100, 0);
    expect(areaIDeler(banerTilSti(baner))).toBeCloseTo(areaIDeler(sirkel), 0);
    const q = 'M0 0Q5 10 10 0Z';
    expect(areaIDeler(banerTilSti(tolkBaner(q)))).toBeCloseTo(areaIDeler(q), 1);
  });

  it('marks nodes with handles in line as smooth, and a path without Z as open', () => {
    const baner = tolkBaner('M0 0C0 5 5 10 10 10C15 10 20 5 20 0');
    expect(baner[0]!.lukket).toBe(false);
    expect(baner[0]!.noder[1]!.glatt).toBe(true); // handles (-5, 0) and (5, 0) are opposite
    expect(baner[0]!.noder[0]!.glatt).toBe(false); // the end of an open path is never smooth
    const lukket = tolkBaner('M0 0C-5 5 -5 10 0 10C5 10 5 5 0 0Z');
    expect(lukket[0]!.lukket).toBe(true);
    expect(lukket[0]!.noder[0]!.glatt).toBe(false);
    expect(antallAapne(baner)).toBe(1);
  });

  it('round-trips the area of a path with a hole', () => {
    const d = 'M0 0L20 0L20 20L0 20ZM5 5L5 15L15 15L15 5Z';
    const igjen = banerTilSti(tolkBaner(d));
    expect(areaIDeler(igjen)).toBeCloseTo(areaIDeler(d), 6);
    expect(areaIDeler(igjen)).toBeCloseTo(400 - 100, 6);
  });
});

describe('Editing nodes', () => {
  const firkant = () => tolkBaner('M0 0L10 0L10 10L0 10Z');

  it('moves an anchor and its handles follow', () => {
    const b = tolkBaner('M0 0C0 5 5 10 10 10L10 0Z');
    const flyttet = flyttNoder(b, [[0, 1]], 2, 3);
    expect(flyttet[0]!.noder[1]!.p).toEqual({ x: 12, y: 13 });
    expect(flyttet[0]!.noder[1]!.inn).toEqual(b[0]!.noder[1]!.inn);
    // the original is untouched
    expect(b[0]!.noder[1]!.p).toEqual({ x: 10, y: 10 });
  });

  it('adds a node on a straight segment and on a curve without changing the shape', () => {
    const rett = settInnNode(firkant(), 0, 1, 0.5);
    expect(rett.node).toBe(2);
    expect(rett.baner[0]!.noder[2]!.p).toEqual({ x: 10, y: 5 });
    expect(areaIDeler(banerTilSti(rett.baner))).toBeCloseTo(100, 6);
    const kurve = tolkBaner('M0 0C0 10 10 10 10 0Z');
    const delt = settInnNode(kurve, 0, 0, 0.4);
    expect(delt.baner[0]!.noder).toHaveLength(3);
    expect(delt.baner[0]!.noder[1]!.glatt).toBe(true);
    expect(areaIDeler(banerTilSti(delt.baner))).toBeCloseTo(areaIDeler(banerTilSti(kurve)), 1);
    // the closing segment too
    const lukkende = settInnNode(firkant(), 0, 3, 0.5);
    expect(lukkende.node).toBe(4);
    expect(lukkende.baner[0]!.noder[4]!.p).toEqual({ x: 0, y: 5 });
  });

  it('turns a corner into a smooth point and back', () => {
    const glatt = settNodeType(firkant(), 0, 1, true);
    const n = glatt[0]!.noder[1]!;
    expect(n.glatt).toBe(true);
    expect(n.inn).toBeTruthy();
    expect(n.ut).toBeTruthy();
    // the handles are opposite each other
    expect(n.inn!.x * n.ut!.y - n.inn!.y * n.ut!.x).toBeCloseTo(0, 6);
    expect(n.inn!.x * n.ut!.x + n.inn!.y * n.ut!.y).toBeLessThan(0);
    const hjorne = settNodeType(glatt, 0, 1, false);
    expect(hjorne[0]!.noder[1]!.glatt).toBe(false);
    expect(hjorne[0]!.noder[1]!.ut).toEqual(n.ut);
  });

  it('keeps the other handle in line when a smooth handle moves, unless Alt breaks it', () => {
    const glatt = settNodeType(firkant(), 0, 1, true);
    const lengdeUt = Math.hypot(glatt[0]!.noder[1]!.ut!.x, glatt[0]!.noder[1]!.ut!.y);
    const dratt = settHandtak(glatt, 0, 1, 'inn', { x: -3, y: -4 });
    const n = dratt[0]!.noder[1]!;
    expect(n.inn).toEqual({ x: -3, y: -4 });
    expect(n.ut!.x / n.ut!.y).toBeCloseTo(3 / 4, 6);
    expect(Math.hypot(n.ut!.x, n.ut!.y)).toBeCloseTo(lengdeUt, 6);
    const brutt = settHandtak(glatt, 0, 1, 'inn', { x: -3, y: -4 }, true);
    expect(brutt[0]!.noder[1]!.glatt).toBe(false);
    expect(brutt[0]!.noder[1]!.ut).toEqual(glatt[0]!.noder[1]!.ut);
  });

  it('deletes nodes and the neighbours join up', () => {
    const uten = slettNoder(firkant(), [[0, 2]]);
    expect(uten[0]!.noder).toHaveLength(3);
    expect(areaIDeler(banerTilSti(uten))).toBeCloseTo(50, 6);
    // down to two straight nodes there is no shape left
    expect(
      slettNoder(firkant(), [
        [0, 1],
        [0, 2],
      ]),
    ).toHaveLength(0);
  });

  it('deletes a segment: a closed path opens there, an open one splits', () => {
    const apen = slettSegment(firkant(), 0, 1);
    expect(apen).toHaveLength(1);
    expect(apen[0]!.lukket).toBe(false);
    expect(apen[0]!.noder.map((n) => n.p)).toEqual([
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const delt = slettSegment(tolkBaner('M0 0L5 0L10 0L15 0'), 0, 1);
    expect(delt).toHaveLength(2);
    expect(delt.map((b) => b.noder.length)).toEqual([2, 2]);
  });

  it('closes an open path, reverses a path and deletes paths', () => {
    const apen = tolkBaner('M0 0L10 0L10 10L0 10');
    const lukket = lukkBane(apen, 0);
    expect(lukket[0]!.lukket).toBe(true);
    expect(banerTilSti(lukket)).toBe('M0 0L10 0L10 10L0 10Z');
    const motsatt = reverserBane(lukket, 0);
    expect(motsatt[0]!.noder.map((n) => n.p)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ]);
    expect(slettBaner(tolkBaner('M0 0L1 0L1 1ZM5 5L6 5L6 6Z'), [0])).toHaveLength(1);
  });

  it('applies a matrix: anchors move, handles only turn and scale', () => {
    const b = tolkBaner('M0 0C0 5 5 10 10 10L10 0Z');
    const t = transformerBaner(b, [2, 0, 0, -1, 100, 50]);
    expect(t[0]!.noder[0]!.p).toEqual({ x: 100, y: 50 });
    expect(t[0]!.noder[0]!.ut).toEqual({ x: 0, y: -5 });
    expect(t[0]!.noder[1]!.inn!.x).toBeCloseTo(-10, 9);
    expect(t[0]!.noder[1]!.inn!.y).toBeCloseTo(0, 9);
    expect(banerBoks(t)!.minX).toBe(100);
  });
});

describe('Finding things and shapes', () => {
  it('finds the nearest point on a curve', () => {
    const b = tolkBaner('M0 0C0 10 10 10 10 0Z');
    const treff = narmesteSegment(b, { x: 5, y: 12 })!;
    expect(treff.bane).toBe(0);
    expect(treff.seg).toBe(0);
    expect(treff.punkt.x).toBeCloseTo(5, 1);
    expect(treff.punkt.y).toBeCloseTo(7.5, 1);
    expect(narmesteSegment(b, { x: 50, y: 50 }, 5)).toBeNull();
  });

  it('groups an outer path with the holes directly inside it', () => {
    const baner = tolkBaner(
      'M0 0L30 0L30 30L0 30ZM5 5L5 25L25 25L25 5ZM10 10L20 10L20 20L10 20ZM40 0L50 0L50 10L40 10Z',
    );
    // 0 = outer, 1 = hole, 2 = island inside the hole, 3 = a separate shape
    expect(formAv(baner, 0)).toEqual([0, 1]);
    expect(formAv(baner, 1)).toEqual([1]);
    expect(formAv(baner, 2)).toEqual([2]);
    expect(formAv(baner, 3)).toEqual([3]);
  });

  it('finds the filled shape under a point, but not the empty space of a hole', () => {
    const baner = tolkBaner(
      'M0 0L30 0L30 30L0 30ZM5 5L5 25L25 25L25 5ZM10 10L20 10L20 20L10 20ZM40 0L50 0L50 10L40 10Z',
    );
    expect(baneVedPunkt(baner, { x: 2, y: 2 })).toBe(0);
    expect(baneVedPunkt(baner, { x: 7, y: 15 })).toBeNull();
    expect(baneVedPunkt(baner, { x: 15, y: 15 })).toBe(2);
    expect(baneVedPunkt(baner, { x: 45, y: 5 })).toBe(3);
    expect(baneVedPunkt(baner, { x: 100, y: 5 })).toBeNull();
  });
});

describe('Repairing paths that are not closed', () => {
  it('closes a path whose ends nearly meet', () => {
    const r = reparerBaner(tolkBaner('M0 0L10 0L10 10L0 10L0 0.3'), 0.5);
    expect(r.lukket).toBe(1);
    expect(r.baner[0]!.lukket).toBe(true);
    expect(r.gap[0]).toMatchObject({ type: 'lukk' });
    expect(antallAapne(r.baner)).toBe(0);
  });

  it('joins pieces end to end into one closed shape', () => {
    // a square drawn as four separate lines with small gaps
    const d = 'M0 0L10 0M10.2 0L10 10M10 10.1L0 10M0 10L0 0.2';
    const baner = tolkBaner(d);
    expect(baner).toHaveLength(4);
    const r = reparerBaner(baner, 0.5);
    expect(r.baner).toHaveLength(1);
    expect(r.baner[0]!.lukket).toBe(true);
    expect(r.koblet).toBe(3);
    expect(r.lukket).toBe(1);
    const flate = areal(regionFraRinger(banerTilRinger(r.baner), 'nonzero'));
    expect(flate).toBeGreaterThan(98);
    expect(flate).toBeLessThan(104);
  });

  it('joins pieces drawn in opposite directions', () => {
    const r = reparerBaner(tolkBaner('M0 0L10 0L10 10M0 10L0 0M0 10L10 10'), 0.01);
    expect(r.baner).toHaveLength(1);
    expect(r.baner[0]!.lukket).toBe(true);
  });

  it('leaves gaps wider than the tolerance, and only closes them by force when asked', () => {
    const apen = tolkBaner('M0 0L10 0L10 10L0 10');
    const rolig = reparerBaner(apen, 1);
    expect(rolig.lukket).toBe(0);
    expect(antallAapne(rolig.baner)).toBe(1);
    const tvunget = reparerBaner(apen, 1, true);
    expect(tvunget.tvunget).toBe(1);
    expect(antallAapne(tvunget.baner)).toBe(0);
    // a lone line has no area and is dropped when forcing
    const linje = reparerBaner(tolkBaner('M0 0L10 0'), 1, true);
    expect(linje.fjernet).toBe(1);
    expect(linje.baner).toHaveLength(0);
  });

  it('does not change the input', () => {
    const baner = tolkBaner('M0 0L10 0L10 10L0 10L0 0.3');
    const f = banerTilSti(baner);
    reparerBaner(baner, 0.5);
    expect(banerTilSti(baner)).toBe(f);
  });
});
