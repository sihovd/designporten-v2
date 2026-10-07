import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { areal, regionFraRinger, type Region, type Ring } from '../../geometri/polygon';
import { stiTilRinger } from '../../geometri/stidata';
import { tolkBaner } from '../../geometri/bane';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, objekterILag } from '../../core/dokument';
import { sjekkManifold } from '../../geometri/mesh';
import plugin from './index';
import { DEKOR, dekorKilde, lagreEgetFlerfarget, hentEgneDekor, dekorValg } from './dekor';
import { leggTilLag, nyttLag, nyttSigngenDokument, oppdaterLag } from './dokument';
import { leggTilFlerfarget } from './handlinger';
import { byggSigngen, lastFonter } from './modell';
import {
  byggFlerfarget,
  delOppIOyer,
  fordelFarger,
  lagDeler,
  MAKS_DELER,
  svgFil,
  tolkFarge,
  type SvgDeler,
} from './svgdeler';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

const rute = (x: number, y: number, b: number, h = b): Ring => [
  { x, y },
  { x: x + b, y },
  { x: x + b, y: y + h },
  { x, y: y + h },
];
const region = (...ringer: Ring[]): Region => regionFraRinger(ringer, 'evenodd');

describe('Splitting an SVG into parts', () => {
  it('keeps an island in a hole with the shape around it, and splits separate shapes', () => {
    // a frame with a square in the middle (a ring and its centre), and a shape to the side
    const ramme = region(rute(0, 0, 20), rute(5, 5, 10), rute(8, 8, 4), rute(30, 0, 10));
    expect(ramme.length).toBe(3);
    const deler = delOppIOyer(ramme);
    expect(deler.length).toBe(2);
    const stor = deler.find((d) => d.length === 2)!;
    expect(stor).toBeTruthy();
    expect(areal(stor)).toBeCloseTo(20 * 20 - 10 * 10 + 4 * 4, 3);
  });

  it('numbers the parts in the order the shapes are painted', () => {
    const r = lagDeler(
      'ark.svg',
      [
        { region: region(rute(0, 0, 10), rute(20, 0, 10)), fyll: '#ff0000' },
        { region: region(rute(40, 0, 10)), fyll: null },
      ],
      [],
    );
    expect(r.deler.map((d) => [d.id, d.navn, d.rekkefolge])).toEqual([
      [0, 'Del 1', 0],
      [1, 'Del 2', 0],
      [2, 'Del 3', 1],
    ]);
    expect(r.boks).toMatchObject({ minX: 0, maksX: 50, minY: 0, maksY: 10 });
  });

  it('takes each shape whole when there are too many parts to pick one by one', () => {
    const mange = region(...Array.from({ length: MAKS_DELER + 5 }, (_, i) => rute(i * 3, 0, 2)));
    const r = lagDeler('mange.svg', [{ region: mange, fyll: null }], []);
    expect(r.deler.length).toBe(1);
    expect(r.merknad).toMatch(/over 300/);
  });

  it('reads colours', () => {
    expect(tolkFarge('#abc')).toBe('#aabbcc');
    expect(tolkFarge('#FF8800')).toBe('#ff8800');
    expect(tolkFarge('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(tolkFarge('red')).toBe('#ff0000');
    expect(tolkFarge('url(#grad)')).toBeNull();
    expect(tolkFarge('currentColor')).toBeNull();
  });

  it('starts every part in the first colour when the file has one fill, and spreads several fills', () => {
    const palett = [
      { id: 'a', hex: '#ffffff' },
      { id: 'b', hex: '#ff0000' },
      { id: 'c', hex: '#0000ff' },
    ];
    expect(fordelFarger(['#123456', '#123456', null], palett)).toEqual(['a', 'a', 'a']);
    expect(fordelFarger(['#fe0000', '#0000fd', '#fe0000'], palett)).toEqual(['b', 'c', 'b']);
    // two fills close to the same filament still end up on different ones
    const to = fordelFarger(['#ff0000', '#ee0000'], palett);
    expect(to[0]).not.toBe(to[1]);
  });
});

/** A shape from path data, with its curves, as the importer hands it to lagDeler. */
const form = (d: string, fyll: string | null) => ({
  region: regionFraRinger(stiTilRinger(d, 0.01), 'nonzero'),
  fyll,
  baner: tolkBaner(d),
  regel: 'nonzero' as const,
});

describe('Keeping the curves of a vector', () => {
  const sirkel = (x: number, r: number) =>
    `M${x - r} 0A${r} ${r} 0 1 0 ${x + r} 0A${r} ${r} 0 1 0 ${x - r} 0Z`;

  it('keeps curves when the parts are used as they are', () => {
    const d = lagDeler('s.svg', [form(sirkel(10, 10), '#ff0000'), form(sirkel(50, 5), '#ff0000')], []);
    expect(d.deler[0]!.baner).toHaveLength(1);
    const ff = byggFlerfarget('S', d.deler, () => 'a', d.filnavn)!;
    expect(ff.grupper).toHaveLength(1);
    const kilde = ff.grupper[0]!.kilde;
    expect(kilde.stier.join('')).toMatch(/C/);
    expect(kilde.stier.join('')).not.toMatch(/L/);
    // the same shape as the lines it would otherwise be: two circles
    const flate = areal(regionFraRinger(stiTilRinger(kilde.stier.join(''), 0.01), kilde.fyllregel));
    expect(flate).toBeCloseTo(Math.PI * 100 + Math.PI * 25, 0);
  });

  it('falls back to lines for a part another colour is painted over', () => {
    const d = lagDeler('s.svg', [form(sirkel(10, 10), '#ff0000'), form(sirkel(14, 4), '#0000ff')], []);
    const ff = byggFlerfarget('S', d.deler, (id) => (id === 0 ? 'a' : 'b'), d.filnavn)!;
    const [stor, liten] = ff.grupper;
    // the big circle has a hole where the small one lies, so its lines are the region's outline
    expect(stor!.kilde.stier.join('')).not.toMatch(/C/);
    expect(liten!.kilde.stier.join('')).toMatch(/C/);
  });

  it('hands every curve of a shape with a hole to the right part', () => {
    const ring = 'M0 0h30v30h-30zM10 10v10h10v-10z';
    const eks = 'M60 0h10v10h-10z';
    const d = lagDeler('s.svg', [form(ring, null), form(eks, null)], []);
    expect(d.deler).toHaveLength(2);
    expect(d.deler[0]!.baner).toHaveLength(2);
    expect(d.deler[1]!.baner).toHaveLength(1);
  });

  it('keeps the real curves of a gallery icon, and the same shape', () => {
    const hjerte = DEKOR.find((x) => x.id === 'hjerte')!;
    const k = dekorKilde(hjerte);
    expect(k.kilde.stier.join('')).toMatch(/C/);
    const linjer = regionFraRinger(stiTilRinger(hjerte.sti, 0.02), 'nonzero');
    const kurver = regionFraRinger(stiTilRinger(k.kilde.stier.join(''), 0.02), k.kilde.fyllregel);
    // the icon is drawn on 24 units and made 24 mm, so the areas agree
    expect(areal(kurver) / areal(linjer)).toBeGreaterThan(0.99);
    expect(areal(kurver) / areal(linjer)).toBeLessThan(1.01);
    // an icon of straight lines stays lines
    expect(dekorKilde(DEKOR.find((x) => x.id === 'lyn')!).kilde.stier.join('')).not.toMatch(/C/);
  });
});

function ark(): SvgDeler {
  // three parts: a base, a mane painted over it in another colour, and a loose part far away
  return lagDeler(
    'hest.svg',
    [
      { region: region(rute(0, 0, 20, 10)), fyll: '#8b5a2b' },
      { region: region(rute(5, 2, 6, 6)), fyll: '#222222' },
      { region: region(rute(40, 0, 10)), fyll: '#8b5a2b' },
    ],
    [],
  );
}

describe('Colours and masking', () => {
  it('masks parts away and puts the rest in one group per colour', () => {
    const d = ark();
    const bare = byggFlerfarget('Hest', d.deler, (id) => (id === 2 ? 'x' : null), d.filnavn)!;
    expect(bare.grupper.length).toBe(1);
    expect(bare.bredde).toBeCloseTo(10, 3);
    expect(byggFlerfarget('Hest', d.deler, () => null, d.filnavn)).toBeNull();
  });

  it('prints each point in one colour: the part painted later wins where parts overlap', () => {
    const d = ark();
    const ff = byggFlerfarget('Hest', d.deler, (id) => (id === 1 ? 'mane' : 'kropp'), d.filnavn)!;
    expect(ff.grupper.map((g) => g.farge)).toEqual(['kropp', 'mane']);
    const kropp = ff.grupper[0]!;
    const mane = ff.grupper[1]!;
    // base 20x10 plus loose 10x10, minus the 6x6 mane
    expect(areal(kropp.region!)).toBeCloseTo(200 - 36 + 100, 3);
    expect(areal(mane.region!)).toBeCloseTo(36, 3);
    // together they fill what the three parts fill
    expect(areal(kropp.region!) + areal(mane.region!)).toBeCloseTo(300, 3);
  });

  it('places every colour relative to the middle of the whole picture', () => {
    const d = ark();
    const ff = byggFlerfarget('Hest', d.deler, (id) => (id === 1 ? 'mane' : 'kropp'), d.filnavn)!;
    // whole picture: x 0–50, y 0–10, middle (25, 5); the mane's middle is (8, 5)
    const mane = ff.grupper.find((g) => g.farge === 'mane')!;
    expect(mane.dx).toBeCloseTo(8 - 25, 3);
    expect(mane.dy).toBeCloseTo(0, 3);
    expect(ff.bredde).toBeCloseTo(50, 3);
  });

  it('writes the picture as an SVG file with a path per colour', () => {
    const d = ark();
    const ff = byggFlerfarget('Hest', d.deler, (id) => (id === 1 ? 'mane' : 'kropp'), d.filnavn)!;
    const tekst = svgFil(ff, (f) => (f === 'mane' ? '#222222' : '#8b5a2b'));
    expect(tekst).toContain('viewBox="0 0 50 10"');
    expect(tekst.match(/<path /g)?.length).toBe(2);
    expect(tekst).toContain('fill="#222222"');
  });
});

describe('Stacking layers on the same level', () => {
  it('starts a same-level layer where the layer under it starts, and stacks the next on the tallest', () => {
    let dok = nyttSigngenDokument();
    const forste = dok.lag[0]!;
    const a = nyttLag('A', forste.materialId, 3);
    const b = { ...nyttLag('B', forste.materialId, 1), sammeNivaa: true };
    const c = { ...nyttLag('C', forste.materialId, 2), sammeNivaa: true };
    const d = nyttLag('D', forste.materialId, 1);
    for (const l of [a, b, c, d]) dok = leggTilLag(dok, l);
    const z = (id: string) => finnLag(dok, id)!.zBunn;
    expect(z(b.id)).toBe(z(a.id));
    expect(z(c.id)).toBe(z(a.id));
    // D sits on the tallest of A (3), B (1) and C (2)
    expect(z(d.id)).toBeCloseTo(z(a.id) + 3, 6);
    // a layer that is not on the same level stacks again
    dok = oppdaterLag(dok, c.id, { sammeNivaa: false });
    expect(z(c.id)).toBeCloseTo(z(a.id) + 3, 6);
    expect(z(d.id)).toBeCloseTo(z(c.id) + 2, 6);
  });

  it('leaves the lowest layer on the plate whatever its flag says', () => {
    let dok = nyttSigngenDokument();
    const f = dok.lag[0]!;
    dok = oppdaterLag(dok, f.id, { sammeNivaa: true });
    expect(finnLag(dok, f.id)!.zBunn).toBe(0);
  });
});

describe('A picture in several colours on the sign', () => {
  it('gets one layer with an object per colour, one outline, and prints', async () => {
    await lastFonter(plugin.nyttDokument());
    const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
    const antallFor = benk.dok.lag.length;
    const d = ark();
    const ff = byggFlerfarget(
      'Hest',
      d.deler,
      (id) => (id === 1 ? 'pla-svart' : 'pla-kritthvit'),
      d.filnavn,
    )!;
    leggTilFlerfarget(benk, ff, 'pynt', 'eget');
    const dok = benk.dok;
    expect(dok.lag.length).toBe(antallFor + 1);
    const nytt = dok.lag.at(-1)!;
    const objekter = objekterILag(dok, nytt.id);
    expect(objekter.length).toBe(2);
    // the first colour is the layer's, the other is an object colour of its own
    expect(objekter.filter((o) => o.materialId).length).toBe(1);
    expect(objekter.find((o) => o.materialId)!.materialId).not.toBe(nytt.materialId);
    expect(benk.tilstand.utvalg.objekter.length).toBe(2);
    const modell = await byggSigngen(dok);
    const deler = modell.deler.filter((d) => d.id === nytt.id || d.id.startsWith(`${nytt.id}~`));
    expect(new Set(deler.map((d) => d.materialId)).size).toBe(2);
    for (const del of modell.deler) expect(sjekkManifold(del.mesh).lukket).toBe(true);
    for (const o of objekter) expect(o.kilde.type).toBe('svg');
    benk.avslutt();
  });

  it('keeps the colours of a vector saved in the gallery', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const d = ark();
    const ff = byggFlerfarget(
      'Hest',
      d.deler,
      (id) => (id === 1 ? 'pla-svart' : 'pla-kritthvit'),
      d.filnavn,
    )!;
    const lagret = lagreEgetFlerfarget('Hest', ff)!;
    expect(lagret.grupper?.length).toBe(2);
    expect(hentEgneDekor()[0]!.grupper?.map((g) => g.farge)).toEqual(['pla-kritthvit', 'pla-svart']);
    const valg = dekorValg(hentEgneDekor()).find((v) => v.egen)!;
    const igjen = valg.flerfarget!();
    expect(igjen.grupper.length).toBe(2);
    expect(igjen.grupper[1]!.dx).toBeCloseTo(ff.grupper[1]!.dx, 3);
    // a vector in one colour is stored as before
    const en = byggFlerfarget('Rute', d.deler, (id) => (id === 2 ? 'pla-svart' : null), d.filnavn)!;
    expect(lagreEgetFlerfarget('Rute', en)!.grupper).toBeUndefined();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
