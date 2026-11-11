import { areal, regionFraRinger } from '../../../geometri/polygon';
import { stiTilRinger } from '../../../geometri/stidata';
import type { Piksler } from '../vektoriser';
import { finnKjeder } from './kanter';
import {
  byggModell,
  byttFarge,
  delSti,
  etikettbilde,
  leggTilFelt,
  pennepunkter,
  flyttAnker,
  forenkle,
  gjorRett,
  slaSammenDeler,
  slettDeler,
  tall,
  tilSvg,
  vater,
  bruk,
  delBoks,
  flyttMatrise,
  gang,
  IDENTITET,
  nullstillTransform,
  rundt,
  transformerDeler,
  transformerte,
  type Vektormodell,
} from './modell';
import { lagRegionkart, STANDARD_REGIONVALG, type Regionvalg } from './regioner';
import { antallValgt, bakgrunnsutvalg, kombiner, tryllestav, utvid } from './tryllestav';
import { fargeavstand, fargebruk, flatUt, reduserFarger, slaSammenLikeFarger } from './farger';
import { delerIFarger, flyttLag, lagrekkefolge, tegnOmradePaNytt } from './lag';
import { kontur, tilDxf, tynneDeler } from './ferdig';

type Rgba = [number, number, number, number];
function bilde(b: number, h: number, farge: (x: number, y: number) => Rgba): Piksler {
  const data = new Uint8ClampedArray(b * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) data.set(farge(x + 0.5, y + 0.5), (y * b + x) * 4);
  return { width: b, height: h, data };
}
const HVIT: Rgba = [255, 255, 255, 255];
const SVART: Rgba = [20, 20, 20, 255];
const ROD: Rgba = [220, 30, 40, 255];
const BLA: Rgba = [30, 60, 220, 255];

const flate = (d: string) => areal(regionFraRinger(stiTilRinger(d), 'nonzero'));
const delFlate = (m: Vektormodell, id: number) => flate(delSti(m, m.deler[id]!));

/** Red and blue halves of a square on white: three regions meeting along shared borders. */
const halvdeler = bilde(120, 120, (x, y) => {
  if (x < 20 || x > 100 || y < 20 || y > 100) return HVIT;
  return x < 60 ? ROD : BLA;
});
const toFarger: Regionvalg = { ...STANDARD_REGIONVALG, farger: 2 };

describe('regioner', () => {
  it('finds the two coloured halves and leaves out the background', () => {
    const k = lagRegionkart(halvdeler, null, toFarger);
    expect(k.regioner).toHaveLength(2);
    expect(k.regioner.map((r) => r.areal).sort()).toEqual([3200, 3200]);
  });

  it('merges a speck into its neighbour instead of leaving a hole', () => {
    const flekk = bilde(100, 100, (x, y) =>
      x > 40 && x < 43 && y > 40 && y < 43 ? HVIT : x > 10 && x < 90 && y > 10 && y < 90 ? SVART : HVIT,
    );
    const med = lagRegionkart(flekk, null, { ...STANDARD_REGIONVALG, minHull: 0, minAreal: 0 });
    const uten = lagRegionkart(flekk, null, { ...STANDARD_REGIONVALG, minHull: 20 });
    const m1 = byggModell(med);
    const m2 = byggModell(uten);
    expect(m1.deler[0]!.ringer).toHaveLength(2);
    expect(m2.deler[0]!.ringer).toHaveLength(1);
  });

  it('honours the mask', () => {
    const maske = new Uint8Array(120 * 120);
    for (let y = 0; y < 120; y++) for (let x = 0; x < 60; x++) maske[y * 120 + x] = 1;
    const k = lagRegionkart(halvdeler, maske, toFarger);
    expect(k.regioner).toHaveLength(1);
  });

  it('drops thin lines by thickness', () => {
    const strek = bilde(100, 100, (x, y) =>
      (y > 48 && y < 50 && x > 5 && x < 95) || Math.hypot(x - 30, y - 25) < 15 ? SVART : HVIT,
    );
    const alle = lagRegionkart(strek, null, { ...STANDARD_REGIONVALG, minTykkelse: 0 });
    const tykke = lagRegionkart(strek, null, { ...STANDARD_REGIONVALG, minTykkelse: 4 });
    expect(alle.regioner).toHaveLength(2);
    expect(tykke.regioner).toHaveLength(1);
  });
});

describe('shared borders', () => {
  it('traces each border once, with a region on each side', () => {
    const k = lagRegionkart(halvdeler, null, toFarger);
    const kjeder = finnKjeder(k.etikett, k.bredde, k.hoyde);
    // the middle border, and the two outer borders of the halves
    expect(kjeder).toHaveLength(3);
    const midt = kjeder.find((c) => c.venstre >= 0 && c.hoyre >= 0)!;
    expect(midt).toBeDefined();
  });

  it('neighbours meet exactly: the areas add up with no overlap or gap', () => {
    const k = lagRegionkart(halvdeler, null, toFarger);
    const m = byggModell(k);
    const a = delFlate(m, 0),
      b = delFlate(m, 1);
    expect(a).toBeCloseTo(3200, 0);
    expect(b).toBeCloseTo(3200, 0);
    // the union of both is the whole square
    const begge = flate(delSti(m, m.deler[0]!) + delSti(m, m.deler[1]!));
    expect(begge).toBeCloseTo(6400, 0);
  });

  it('calculate shape: a square becomes four straight sides and four points', () => {
    const k = lagRegionkart(
      bilde(100, 100, (x, y) => (x > 20 && x < 80 && y > 20 && y < 80 ? SVART : HVIT)),
      null,
      STANDARD_REGIONVALG,
    );
    const m = byggModell(k);
    const t = tall(m);
    expect(t.deler).toBe(1);
    expect(t.punkter).toBe(4);
    expect(t.kurvesegmenter).toBe(0);
    expect(t.linjesegmenter).toBe(4);
    expect(delFlate(m, 0)).toBeCloseTo(3600, 0);
  });

  it('a circle becomes a few smooth curves that stay on the border', () => {
    const k = lagRegionkart(
      bilde(200, 200, (x, y) => (Math.hypot(x - 100, y - 100) < 70 ? SVART : HVIT)),
      null,
      STANDARD_REGIONVALG,
    );
    const m = byggModell(k);
    const t = tall(m);
    expect(t.punkter).toBeLessThanOrEqual(12);
    expect(t.linjesegmenter).toBe(0);
    const fasit = Math.PI * 70 * 70;
    expect(Math.abs(delFlate(m, 0) - fasit) / fasit).toBeLessThan(0.01);
  });

  it('moving a shared point moves it for both neighbours', () => {
    const m = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const midt = m.kurver.find((c) => c && c.venstre >= 0 && c.hoyre >= 0)!;
    const ny = flyttAnker(m, midt.id, 0, midt.ankre[0]!.x + 5, midt.ankre[0]!.y);
    const begge = flate(delSti(ny, ny.deler[0]!) + delSti(ny, ny.deler[1]!));
    const sum = delFlate(ny, 0) + delFlate(ny, 1);
    expect(sum).toBeCloseTo(begge, 3);
  });
});

describe('editing', () => {
  it('merges two parts into one and removes the border between them', () => {
    const m = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const ny = slaSammenDeler(m, [0, 1]);
    const t = tall(ny);
    expect(t.deler).toBe(1);
    expect(t.kanter).toBe(1);
    expect(t.punkter).toBe(4);
    const del = ny.deler.find((d) => d)!;
    expect(flate(delSti(ny, del))).toBeCloseTo(6400, 0);
  });

  it('deletes a part', () => {
    const m = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const ny = slettDeler(m, [0]);
    expect(tall(ny).deler).toBe(1);
    expect(tilSvg(ny)).toContain('<path');
  });

  it('simplify uses fewer points, straighten makes lines', () => {
    const blob = bilde(200, 200, (x, y) => {
      const r = 60 + 8 * Math.sin(Math.atan2(y - 100, x - 100) * 5);
      return Math.hypot(x - 100, y - 100) < r ? SVART : HVIT;
    });
    const m = byggModell(lagRegionkart(blob, null, STANDARD_REGIONVALG));
    const ider = m.kurver.filter((k) => k).map((k) => k!.id);
    const f = forenkle(m, ider, 1);
    expect(tall(f).punkter).toBeLessThan(tall(m).punkter);
    const r = gjorRett(m, ider);
    expect(tall(r).kurvesegmenter).toBe(0);
  });
});

describe('levelling', () => {
  it('makes nearly horizontal lines horizontal and keeps neighbours attached', () => {
    const m = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const k = m.kurver.find((c) => c && c.venstre >= 0 && c.hoyre >= 0)!;
    const skjev = flyttAnker(m, k.id, 0, k.ankre[0]!.x + 1.5, k.ankre[0]!.y);
    const rett = vater(skjev, [k.id]);
    const a = rett.kurver[k.id]!.ankre;
    expect(a[0]!.x).toBeCloseTo(a[a.length - 1]!.x, 6);
    const begge = flate(delSti(rett, rett.deler[0]!) + delSti(rett, rett.deler[1]!));
    expect(delFlate(rett, 0) + delFlate(rett, 1)).toBeCloseTo(begge, 3);
  });
});

describe('tryllestav', () => {
  // white background, a black ring with a white inside, 60 × 60
  const ringbilde = bilde(60, 60, (x, y) => {
    const r = Math.hypot(x - 30, y - 30);
    return r < 20 && r > 10 ? SVART : HVIT;
  });

  it('selects only the connected background, not the white inside the ring', () => {
    const u = tryllestav(ringbilde.data, 60, 60, 1, 1, 32, true);
    expect(u[0]).toBe(1);
    expect(u[30 * 60 + 30]).toBe(0); // the centre
    const alle = tryllestav(ringbilde.data, 60, 60, 1, 1, 32, false);
    expect(alle[30 * 60 + 30]).toBe(1);
  });

  it('finds the background from the image edge', () => {
    const u = bakgrunnsutvalg(ringbilde.data, 60, 60, 32);
    expect(u[0]).toBe(1);
    expect(u[30 * 60 + 15]).toBe(0); // the ring
    expect(u[30 * 60 + 30]).toBe(0);
  });

  it('combines, grows and shrinks selections', () => {
    const a = new Uint8Array(25);
    a[12] = 1;
    expect(antallValgt(utvid(a, 5, 5, 1))).toBe(9);
    expect(antallValgt(utvid(utvid(a, 5, 5, 1), 5, 5, -1))).toBe(1);
    const b = new Uint8Array(25);
    b[0] = 1;
    expect(antallValgt(kombiner(a, b, 'legg-til'))).toBe(2);
    expect(antallValgt(kombiner(a, a, 'trekk-fra'))).toBe(0);
  });

  it('keeps a protected white field as a part when the background is removed', () => {
    const uten = lagRegionkart(ringbilde, null, { ...STANDARD_REGIONVALG, minHull: 0 });
    expect(uten.regioner).toHaveLength(1);
    const vern = new Uint8Array(60 * 60);
    vern[30 * 60 + 30] = 1;
    const med = lagRegionkart(ringbilde, null, { ...STANDARD_REGIONVALG, minHull: 0 }, vern);
    expect(med.regioner).toHaveLength(2);
    expect(med.regioner.map((r) => r.farge).sort()).toEqual(['#000000', '#ffffff']);
  });
});

describe('penn', () => {
  it('rebuilds the traced label image from the model', () => {
    const k = lagRegionkart(halvdeler, null, toFarger);
    const m = byggModell(k);
    expect(Array.from(etikettbilde(m))).toEqual(Array.from(k.etikett));
  });

  it('adds a drawn field that shares its borders and keeps untouched curves', () => {
    const m0 = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const flyttet = flyttAnker(m0, 0, 1, m0.kurver[0]!.ankre[1]!.x, m0.kurver[0]!.ankre[1]!.y);
    // a square over the border between red and blue, partly outside both
    const felt = pennepunkter([
      { x: 50, y: 5, inn: null, ut: null, hjorne: true, ri: 0 },
      { x: 70, y: 5, inn: null, ut: null, hjorne: true, ri: 0 },
      { x: 70, y: 40, inn: null, ut: null, hjorne: true, ri: 0 },
      { x: 50, y: 40, inn: null, ut: null, hjorne: true, ri: 0 },
    ]);
    const { modell: m, id } = leggTilFelt(flyttet, felt, '#00ff00');
    expect(id).toBe(m0.deler.length);
    expect(m.deler[id]!.areal).toBe(20 * 35);
    const sum = [0, 1, id].reduce((s, i) => s + delFlate(m, i), 0);
    expect(sum).toBeCloseTo(80 * 80 + 20 * 15, -1);
    expect(delFlate(m, id)).toBeCloseTo(700, -1);
    // merged with the red half, the field is one part
    const sammen = slaSammenDeler(m, [id, 0]);
    expect(sammen.deler.filter(Boolean)).toHaveLength(2);
    // a field outside the image adds nothing
    expect(
      leggTilFelt(
        m0,
        [
          [-10, -10],
          [-5, -10],
          [-5, -5],
        ],
        '#000',
      ).id,
    ).toBe(-1);
  });

  it('keeps the curves the field does not touch exactly as they were', () => {
    const m0 = byggModell(lagRegionkart(halvdeler, null, toFarger));
    const felt = pennepunkter([
      { x: 2, y: 2, inn: null, ut: null, hjorne: true, ri: 0 },
      { x: 10, y: 2, inn: null, ut: null, hjorne: true, ri: 0 },
      { x: 10, y: 10, inn: null, ut: null, hjorne: true, ri: 0 },
    ]);
    const { modell: m } = leggTilFelt(m0, felt, '#00ff00');
    const s0 = m0.kurver
      .filter(Boolean)
      .map((k) => JSON.stringify(k!.ankre))
      .sort();
    const s1 = m.kurver.filter(Boolean).map((k) => JSON.stringify(k!.ankre));
    for (const s of s0) expect(s1).toContain(s);
  });
});

describe('farger', () => {
  const GUL: Rgba = [240, 200, 40, 255];
  const fire = bilde(120, 60, (x) => (x < 30 ? ROD : x < 60 ? GUL : x < 90 ? BLA : SVART));
  /** Four colours, the yellow then made nearly the same red as the first. */
  const modell = () => {
    const m = byggModell(
      lagRegionkart(fire, null, { ...STANDARD_REGIONVALG, farger: 4, fjernBakgrunn: false }),
    );
    const gul = fargebruk(m).find((f) => fargeavstand(f.farge, '#f0c828') < 60)!.farge;
    return byttFarge(m, gul, '#e4242e');
  };

  it('lists the colours with their area, largest first', () => {
    const bruk = fargebruk(
      byggModell(lagRegionkart(fire, null, { ...STANDARD_REGIONVALG, farger: 4, fjernBakgrunn: false })),
    );
    expect(bruk.length).toBe(4);
    for (let i = 1; i < bruk.length; i++) expect(bruk[i - 1]!.areal).toBeGreaterThanOrEqual(bruk[i]!.areal);
  });

  it('merges colours that are nearly the same, and leaves the others', () => {
    const m = slaSammenLikeFarger(modell(), 40);
    expect(fargebruk(m).length).toBe(3);
  });

  it('reduces to a number of colours, and flattens to one', () => {
    expect(fargebruk(reduserFarger(modell(), 2)).length).toBe(2);
    const flat = flatUt(modell(), '#000000');
    expect(fargebruk(flat).map((f) => f.farge)).toEqual(['#000000']);
  });

  it('measures colour distance so near reds are closer than red and blue', () => {
    expect(fargeavstand('#dc1e28', '#e4242e')).toBeLessThan(fargeavstand('#dc1e28', '#1e3cdc'));
    expect(fargeavstand('#123456', '#123456')).toBe(0);
  });
});

describe('lag', () => {
  /** Red and blue halves with a small black speck inside the red. */
  const flekkete = bilde(120, 120, (x, y) => {
    if (x < 20 || x > 100 || y < 20 || y > 100) return HVIT;
    if (x > 32 && x < 40 && y > 52 && y < 60) return SVART;
    return x < 60 ? ROD : BLA;
  });
  const modell = () =>
    byggModell(
      lagRegionkart(flekkete, null, {
        ...STANDARD_REGIONVALG,
        farger: 3,
        minAreal: 0,
        minHull: 0,
        stoyfilter: 0,
      }),
    );

  it('orders layers by the given order, the rest by area', () => {
    const m = modell();
    const alle = lagrekkefolge(m, []);
    expect(alle).toHaveLength(3);
    const minst = alle[2]!;
    expect(lagrekkefolge(m, [minst])[0]).toBe(minst);
  });

  it('moves a layer’s metadata with its colour, and drops it when merged into another', () => {
    const a = flyttLag({ '#111111': { navn: 'Tekst' } }, ['#111111', '#222222'], '#111111', '#333333');
    expect(a.lag['#333333']?.navn).toBe('Tekst');
    expect(a.rekkefolge).toEqual(['#333333', '#222222']);
    const b = flyttLag({ '#111111': { navn: 'Tekst' } }, ['#111111', '#222222'], '#111111', '#222222');
    expect(b.lag['#111111']).toBeUndefined();
    expect(b.rekkefolge).toEqual(['#222222']);
  });

  it('merges small parts inside an area into the neighbour, and leaves locked ones', () => {
    const m = modell();
    const for_ = m.deler.filter(Boolean).length;
    const r = { x0: 0, y0: 0, x1: 120, y1: 120 };
    const laste = delerIFarger(m, new Set(lagrekkefolge(m, []).slice(2)));
    expect(tegnOmradePaNytt(m, r, { tilpasning: {}, minAreal: 100 }, laste).smaaDeler).toBe(0);
    const ny = tegnOmradePaNytt(m, r, { tilpasning: { kurveToleranse: 2 }, minAreal: 100 });
    expect(ny.smaaDeler).toBe(1);
    expect(ny.modell.deler.filter(Boolean).length).toBe(for_ - 1);
    expect(ny.kurver).toBeGreaterThan(0);
  });

  it('redraws only the borders inside the area', () => {
    const m = modell();
    const venstre = { x0: 0, y0: 0, x1: 50, y1: 120 };
    const r = tegnOmradePaNytt(m, venstre, { tilpasning: { kurveToleranse: 3 }, minAreal: 0 });
    const endret = r.modell.kurver.filter(
      (k, i) => k && k.valg.kurveToleranse !== m.kurver[i]!.valg.kurveToleranse,
    );
    expect(endret.length).toBe(r.kurver);
    expect(r.kurver).toBeLessThan(m.kurver.filter(Boolean).length);
  });

  it('writes layers in order, leaves hidden ones out and names the groups', () => {
    const m = modell();
    const [a, b, c] = lagrekkefolge(m, []);
    const svg = tilSvg(m, {
      grupperEtterFarge: true,
      rekkefolge: [c!, a!],
      skjulte: new Set([b!]),
      navn: { [a!]: 'Bakgrunn & ramme' },
    });
    expect(svg.indexOf(`farge-${c!.slice(1)}`)).toBeLessThan(svg.indexOf(`farge-${a!.slice(1)}`));
    expect(svg).not.toContain(`farge-${b!.slice(1)}`);
    expect(svg).toContain('<title>Bakgrunn &#38; ramme</title>');
  });
});

describe('ferdig', () => {
  /** A thick black square and a thin black bar, apart. */
  const tynn = bilde(120, 80, (x, y) => {
    if (x >= 10 && x < 50 && y >= 20 && y < 60) return SVART;
    if (x >= 70 && x < 110 && y >= 38 && y < 41) return SVART;
    return HVIT;
  });
  const modell = () =>
    byggModell(
      lagRegionkart(tynn, null, {
        ...STANDARD_REGIONVALG,
        farger: 1,
        minAreal: 0,
        minHull: 0,
        minTykkelse: 0,
        stoyfilter: 0,
      }),
    );

  it('finds the parts narrower than the limit, not the thick ones', () => {
    const m = modell();
    const tynne = tynneDeler(m, 1, 5);
    expect(tynne).toHaveLength(1);
    const d = m.deler[tynne[0]!.id]!;
    expect(delFlate(m, d.id)).toBeLessThan(200);
    expect(tynneDeler(m, 1, 2)).toHaveLength(0);
  });

  it('grows a contour around everything, holes closed', () => {
    const m = modell();
    const k = kontur(m, 1, 3);
    expect(k).toHaveLength(2);
    // square 40 + 3 round: about 2100 mm², bar 40 × 3 + 3 round: about 400 mm²
    expect(areal(k)).toBeGreaterThan(2350);
    expect(areal(k)).toBeLessThan(2650);
    expect(k.every((f) => f.hull.length === 0)).toBe(true);
    expect(kontur(m, 1, 15)).toHaveLength(1);
  });

  it('writes DXF with one layer per colour and the contour on its own layer', () => {
    const m = modell();
    const dxf = tilDxf(m, 0.5, { navn: { '#000000': 'Tekst æ' }, kontur: kontur(m, 0.5, 2) });
    expect(dxf).toMatch(/^0\nSECTION\n/);
    expect(dxf.trim().endsWith('EOF')).toBe(true);
    expect(dxf).toContain('\n8\nKontur\n');
    expect((dxf.match(/\nPOLYLINE\n/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // every coordinate fits the 60 × 40 mm drawing
    const xs = [...dxf.matchAll(/\n10\n([-\d.]+)/g)].map((t) => Number(t[1]));
    expect(Math.max(...xs)).toBeLessThan(62);
  });
});

describe('flytt, skaler, roter', () => {
  const m0 = () => byggModell(lagRegionkart(halvdeler, null, toFarger));

  it('moves a part in the drawing and the SVG, and back again', () => {
    const m = m0();
    const id = m.deler.find(Boolean)!.id;
    const for_ = delBoks(m, [id])!;
    const flyttet = transformerDeler(m, [id], flyttMatrise(10, -5));
    const etter = delBoks(flyttet, [id])!;
    expect(etter.x0 - for_.x0).toBeCloseTo(10);
    expect(etter.y0 - for_.y0).toBeCloseTo(-5);
    expect(transformerte(flyttet)).toEqual([id]);
    expect(tilSvg(flyttet)).toContain(`id="del-${id}" fill=`);
    expect(tilSvg(flyttet)).toMatch(/transform="matrix\(1 0 0 1 10 -5\)"/);
    // the shared borders are untouched
    expect(flyttet.kurver).toBe(m.kurver);
    expect(transformerte(nullstillTransform(flyttet, [id]))).toEqual([]);
  });

  it('turns and scales around the given point', () => {
    const t = rundt(10, 10, 90, 2);
    const p = bruk(t, 11, 10);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(12);
    expect(bruk(gang(t, IDENTITET), 10, 10)).toEqual({ x: 10, y: 10 });
  });

  it('exports moved parts where they were moved to', () => {
    const m = m0();
    const id = m.deler.find(Boolean)!.id;
    const flyttet = transformerDeler(m, [id], flyttMatrise(1000, 0));
    const xs = [...tilDxf(flyttet, 1).matchAll(/\n10\n([-\d.]+)/g)].map((t) => Number(t[1]));
    expect(Math.max(...xs)).toBeGreaterThan(1000);
  });
});
