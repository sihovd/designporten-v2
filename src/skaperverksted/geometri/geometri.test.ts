import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { areal, differanse, forskyv, regionFraRinger, union, transformerRegion, ringAreal } from './polygon';
import { stiTilRinger, StiFeil } from './stidata';
import { ellipse, formTilRinger, rektangel } from './former';
import { ekstruder, planleggSkiver } from './ekstruder';
import { sjekkManifold, volum, avgrensning } from './mesh';
import { forhandsvalg, rettProfil, type Profil } from '../core/profil';
import { lastFont, settFontHenter, tekstTilRinger, fonter } from './tekst';

const kvadrat = (s: number, x = 0, y = 0) => [
  { x: x - s / 2, y: y - s / 2 },
  { x: x + s / 2, y: y - s / 2 },
  { x: x + s / 2, y: y + s / 2 },
  { x: x - s / 2, y: y + s / 2 },
];

describe('polygon', () => {
  it('normalises winding and unions overlaps', () => {
    const r = regionFraRinger([[...kvadrat(10)].reverse(), [...kvadrat(10, 5)].reverse()]);
    expect(r).toHaveLength(1);
    expect(areal(r)).toBeCloseTo(150, 6);
    expect(ringAreal(r[0]!.ytre)).toBeGreaterThan(0);
  });

  it('keeps holes with evenodd and nonzero-reversed rings', () => {
    const eo = regionFraRinger([kvadrat(10), kvadrat(4)], 'evenodd');
    expect(eo[0]!.hull).toHaveLength(1);
    expect(areal(eo)).toBeCloseTo(84, 6);
    const nz = regionFraRinger([kvadrat(10), [...kvadrat(4)].reverse()], 'nonzero');
    expect(areal(nz)).toBeCloseTo(84, 6);
  });

  it('subtracts and unions regions', () => {
    const a = regionFraRinger([kvadrat(10)]);
    const b = regionFraRinger([kvadrat(10, 5)]);
    expect(areal(differanse(a, b))).toBeCloseTo(50, 6);
    expect(areal(union(a, b))).toBeCloseTo(150, 6);
  });

  it('offsets outwards and inwards, and vanishes when shrunk too far', () => {
    const a = regionFraRinger([kvadrat(10)]);
    expect(areal(forskyv(a, 1, 'skarp'))).toBeCloseTo(144, 3);
    expect(areal(forskyv(a, 1, 'rund'))).toBeCloseTo(100 + 40 + Math.PI, 1);
    expect(areal(forskyv(a, -2))).toBeCloseTo(36, 3);
    expect(forskyv(a, -6)).toHaveLength(0);
  });

  it('keeps orientation under mirroring transforms', () => {
    const a = regionFraRinger([kvadrat(10)]);
    const m = transformerRegion(a, (p) => ({ x: -p.x, y: p.y }));
    expect(ringAreal(m[0]!.ytre)).toBeGreaterThan(0);
  });
});

describe('SVG path data', () => {
  it('parses lines, relative commands and implicit lineto', () => {
    const r = stiTilRinger('M0 0 L10 0 l0 10 H0 Z');
    expect(r).toHaveLength(1);
    expect(Math.abs(ringAreal(r[0]!))).toBeCloseTo(100, 6);
    const r2 = stiTilRinger('m0,0 10,0 0,10 -10,0z');
    expect(Math.abs(ringAreal(r2[0]!))).toBeCloseTo(100, 6);
  });

  it('flattens arcs and curves close to the true shape', () => {
    // circle of radius 10 from two arcs
    const r = stiTilRinger('M-10 0 A10 10 0 1 0 10 0 A10 10 0 1 0 -10 0Z', 0.01);
    expect(Math.abs(ringAreal(r[0]!))).toBeCloseTo(Math.PI * 100, 0);
    const c = stiTilRinger('M0 0 C0 10 10 10 10 0 Z');
    expect(Math.abs(ringAreal(c[0]!))).toBeCloseTo(60, 0);
  });

  it('handles smooth curves, exponents and multiple subpaths', () => {
    const r = stiTilRinger('M0 0 Q5 10 10 0 T20 0 Z M30 0h1e1v10h-10z');
    expect(r).toHaveLength(2);
  });

  it('rejects malformed data', () => {
    expect(() => stiTilRinger('L 10 10')).toThrow(StiFeil);
    expect(() => stiTilRinger('M 0 0 L 10')).toThrow(StiFeil);
  });
});

describe('hull', () => {
  const hull = (hullform?: 'sirkel' | 'firkant' | 'trekant' | 'sekskant') => ({
    type: 'form' as const,
    form: 'hull' as const,
    bredde: 6,
    hoyde: 6,
    hjorneradius: 0,
    sider: 6,
    hullform,
  });

  it('er en sirkel som standard, og kan være firkant, trekant eller sekskant', () => {
    const punkter = (f?: 'sirkel' | 'firkant' | 'trekant' | 'sekskant') => formTilRinger(hull(f))[0]!.length;
    expect(punkter()).toBe(punkter('sirkel'));
    expect(punkter('sirkel')).toBeGreaterThan(12);
    expect(punkter('firkant')).toBe(4);
    expect(punkter('trekant')).toBe(3);
    expect(punkter('sekskant')).toBe(6);
  });

  it('fyller boksen like mye uansett form', () => {
    for (const f of ['sirkel', 'firkant', 'trekant', 'sekskant'] as const) {
      const r = formTilRinger(hull(f))[0]!;
      const xs = r.map((p) => p.x);
      const ys = r.map((p) => p.y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 3);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6, 3);
    }
  });
});

describe('shapes', () => {
  it('builds rectangles, rounded rectangles and ellipses with the right area', () => {
    expect(Math.abs(ringAreal(rektangel(40, 20)))).toBeCloseTo(800, 6);
    expect(Math.abs(ringAreal(rektangel(40, 20, 5)))).toBeCloseTo(800 - (4 - Math.PI) * 25, 0);
    expect(Math.abs(ringAreal(ellipse(20, 10)))).toBeCloseTo(Math.PI * 50, 0);
    const [p] = formTilRinger({
      type: 'form',
      form: 'polygon',
      bredde: 30,
      hoyde: 30,
      hjorneradius: 0,
      sider: 6,
    });
    expect(p).toHaveLength(6);
  });
});

describe('extrusion', () => {
  const plate = regionFraRinger([rektangel(80, 30, 4)]);
  const medHull = differanse(plate, regionFraRinger([ellipse(4, 4)]));

  it('extrudes a straight prism that is closed with the right volume', () => {
    const e = ekstruder(regionFraRinger([kvadrat(10)]), 0, 3, rettProfil());
    expect(sjekkManifold(e.mesh)).toEqual({ lukket: true, aapneKanter: 0, feilKanter: 0 });
    expect(volum(e.mesh)).toBeCloseTo(300, 4);
    const b = avgrensning(e.mesh);
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.maks[2]).toBeCloseTo(3);
  });

  it('extrudes shapes with holes as closed solids', () => {
    const e = ekstruder(medHull, 2, 2, rettProfil());
    expect(sjekkManifold(e.mesh).lukket).toBe(true);
    expect(volum(e.mesh)).toBeCloseTo(areal(medHull) * 2, 2);
  });

  for (const type of ['avrundet', 'konveks', 'konkav', 'trapp', 'fas'] as const) {
    it(`profile «${type}» gives a closed solid smaller than the straight one`, () => {
      const e = ekstruder(medHull, 0, 3, forhandsvalg(type, 1.5, 3), 0.2);
      const m = sjekkManifold(e.mesh);
      expect(m.lukket).toBe(true);
      const v = volum(e.mesh);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(areal(medHull) * 3);
      expect(e.forbrukt).toBe(false);
    });
  }

  it('stops and flags when a profile consumes a thin shape', () => {
    const tynn = regionFraRinger([rektangel(20, 1)]);
    const e = ekstruder(tynn, 0, 3, forhandsvalg('konveks', 2), 0.2);
    expect(e.forbrukt).toBe(true);
    expect(sjekkManifold(e.mesh).lukket).toBe(true);
    expect(e.toppZ).toBeLessThan(3);
  });

  it('merges slabs for straight walls and plans one slab per print layer for curves', () => {
    expect(planleggSkiver(rettProfil(), 3, 0.2)).toHaveLength(1);
    expect(planleggSkiver(forhandsvalg('konveks', 1.5), 3, 0.2).length).toBeGreaterThan(5);
  });

  it('a wall that goes back down makes a groove: closed, ring-shaped slabs, less volume', () => {
    const spor: Profil = {
      type: 'egendefinert',
      bredde: 6,
      trinn: 2,
      punkter: [
        { u: 0, t: 0 },
        { u: 0, t: 1 },
        { u: 2 / 6, t: 1 },
        { u: 3 / 6, t: 0.4 },
        { u: 4 / 6, t: 0.4 },
        { u: 5 / 6, t: 1 },
        { u: 1, t: 1 },
      ],
    };
    const plate = regionFraRinger([kvadrat(30)]);
    const plan = planleggSkiver(spor, 3, 0.2);
    expect(plan.some((p) => p.deler.length === 2)).toBe(true);
    const e = ekstruder(plate, 0, 3, spor, 0.2);
    expect(e.forbrukt).toBe(false);
    expect(sjekkManifold(e.mesh).lukket).toBe(true);
    const v = volum(e.mesh);
    expect(v).toBeLessThan(900 * 3);
    // the groove is about 2 mm wide at the floor and 1.8 mm deep, around the whole sign
    expect(v).toBeGreaterThan(900 * 3 - 4 * 30 * 2 * 1.8 * 1.5);
    expect(avgrensning(e.mesh).maks[2]).toBeCloseTo(3);
  });

  it('returns an empty mesh for an empty region', () => {
    expect(ekstruder([], 0, 3, rettProfil()).mesh.indekser.length).toBe(0);
  });
});

describe('text', () => {
  beforeAll(() => {
    settFontHenter(async (fil) => {
      const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    });
  });

  it('outlines Norwegian text in every curated font and extrudes it closed', async () => {
    for (const f of fonter) {
      const font = await lastFont(f.id);
      const t = tekstTilRinger(font, {
        type: 'tekst',
        tekst: 'Blåbær Ø',
        fontId: f.id,
        storrelse: 20,
        sperring: 0,
        linjeavstand: 1.2,
        justering: 'midt',
      });
      expect(t.mangler, f.id).toEqual([]);
      const r = regionFraRinger(t.ringer, 'nonzero');
      expect(areal(r), f.id).toBeGreaterThan(20);
      const e = ekstruder(r, 0, 2, rettProfil());
      expect(sjekkManifold(e.mesh).lukket, f.id).toBe(true);
    }
  });

  it('centres the layout box and respects letter spacing and lines', async () => {
    const font = await lastFont('archivo-800');
    const base = {
      type: 'tekst' as const,
      tekst: 'HEI',
      fontId: 'archivo-800',
      storrelse: 10,
      sperring: 0,
      linjeavstand: 1.2,
      justering: 'midt' as const,
    };
    const a = tekstTilRinger(font, base);
    const b = tekstTilRinger(font, { ...base, sperring: 0.2 });
    expect(b.bredde).toBeCloseTo(a.bredde + 2 * 0.2 * 10, 6);
    const to = tekstTilRinger(font, { ...base, tekst: 'HEI\nDU' });
    expect(to.hoyde).toBeCloseTo(a.hoyde + 12, 6);
    const xs = a.ringer.flat().map((p) => p.x);
    expect(Math.min(...xs) + Math.max(...xs)).toBeLessThan(1);
  });
});
