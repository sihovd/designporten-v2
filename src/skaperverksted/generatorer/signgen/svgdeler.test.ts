import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { areal, regionFraRinger, type Region, type Ring } from '../../geometri/polygon';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, objekterILag } from '../../core/dokument';
import { sjekkManifold } from '../../geometri/mesh';
import plugin from './index';
import { lagreEgetFlerfarget, hentEgneDekor, dekorValg } from './dekor';
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
  it('gets a layer per colour at the same height, side by side, and prints', async () => {
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
    expect(dok.lag.length).toBe(antallFor + 2);
    const nye = dok.lag.slice(-2);
    expect(nye[0]!.sammeNivaa).toBeFalsy();
    expect(nye[1]!.sammeNivaa).toBe(true);
    expect(nye[1]!.zBunn).toBe(nye[0]!.zBunn);
    expect(nye[1]!.materialId).not.toBe(nye[0]!.materialId);
    expect(benk.tilstand.utvalg.objekter.length).toBe(2);
    // the layer above the pair starts above both
    const full = oppdaterLag(dok, nye[1]!.id, { hoyde: 2 });
    const toppen = Math.max(...full.lag.slice(-2).map((l) => l.zBunn + l.hoyde));
    expect(toppen).toBeCloseTo(nye[0]!.zBunn + 2, 6);
    // a layer after the pair stacks on the tallest of them
    expect(finnLag(full, nye[0]!.id)).toBeTruthy();
    const modell = await byggSigngen(dok);
    expect(modell.deler.length).toBeGreaterThanOrEqual(2);
    for (const del of modell.deler) expect(sjekkManifold(del.mesh).lukket).toBe(true);
    for (const o of objekterILag(dok, nye[0]!.id)) expect(o.kilde.type).toBe('svg');
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
