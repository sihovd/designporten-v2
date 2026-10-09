import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { alleFonter, finnFont, settFontHenter } from '../../geometri/tekst';
import { nyttSigngenDokument, lesInnSigngen, oppdaterObjekter, parametre } from './dokument';
import {
  fjernFraBibliotek,
  fraBase64,
  hentFontbibliotek,
  leggTilIBibliotek,
  synkFonter,
  tilBase64,
} from './fontbibliotek';
import {
  googleFontId,
  hentGoogleFamilier,
  hentGoogleFont,
  nullstillGoogleFontCache,
  filtrerFamilier,
  forhandsvisningUrl,
  soekFamilier,
  standardVekt,
  type Hent,
} from './googlefonts';
import { byggSigngen, lastFonter } from './modell';

const RADER = [
  {
    id: 'lobster',
    family: 'Lobster',
    subsets: ['latin'],
    weights: [400],
    category: 'display',
    type: 'google',
  },
  {
    id: 'open-sans',
    family: 'Open Sans',
    subsets: ['latin', 'greek'],
    weights: [300, 400, 700],
    category: 'sans-serif',
    type: 'google',
  },
  { id: 'noto-sans-jp', family: 'Noto Sans JP', subsets: ['japanese'], weights: [400], type: 'google' },
  { id: 'min-egen', family: 'Egen', subsets: ['latin'], weights: [400], type: 'annet' },
];

let filBytes: ArrayBuffer;
const kall: string[] = [];

const hent: Hent = async (url) => {
  kall.push(url);
  if (url.endsWith('/v1/fonts?subsets=latin')) return Response.json(RADER);
  if (url.endsWith('/v1/fonts/lobster'))
    return Response.json({
      variants: {
        '400': { normal: { latin: { url: { woff2: 'https://x/l.woff2', woff: 'https://x/l.woff' } } } },
      },
    });
  if (url.endsWith('/v1/fonts/open-sans'))
    return Response.json({
      variants: { '400': { normal: { latin: { url: { woff2: 'https://x/o.woff2' } } } } },
    });
  if (url === 'https://x/l.woff') return new Response(filBytes.slice(0));
  return new Response('nei', { status: 404 });
};

function lagring(): void {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeAll(async () => {
  const b = await readFile(path.resolve('public/skaperverksted/fonter/caveat-700.woff'));
  filBytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  settFontHenter(async (fil) => {
    const x = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) as ArrayBuffer;
  });
});

beforeEach(() => {
  lagring();
  nullstillGoogleFontCache();
  kall.length = 0;
});
afterEach(() => {
  for (const f of hentFontbibliotek()) fjernFraBibliotek(f.id);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('Google Fonts', () => {
  it('lists the Google families that have Latin and caches the list', async () => {
    const l = await hentGoogleFamilier(hent);
    expect(l.map((f) => f.familie)).toEqual(['Lobster', 'Open Sans']);
    await hentGoogleFamilier(hent);
    expect(kall).toHaveLength(1);
  });

  it('searches by every word, name starts first', async () => {
    const l = await hentGoogleFamilier(hent);
    expect(soekFamilier(l, 'open sans').map((f) => f.familie)).toEqual(['Open Sans']);
    expect(soekFamilier(l, 'o').map((f) => f.familie)).toEqual(['Open Sans', 'Lobster']);
    expect(soekFamilier(l, '   ')).toEqual([]);
    expect(standardVekt(l[1]!)).toBe(700);
    expect(standardVekt(l[0]!)).toBe(400);
  });

  it('lists every family when the query is empty, and builds the preview address', async () => {
    const l = await hentGoogleFamilier(hent);
    expect(filtrerFamilier(l, '').map((f) => f.familie)).toEqual(['Lobster', 'Open Sans']);
    expect(filtrerFamilier(l, 'sans').map((f) => f.familie)).toEqual(['Open Sans']);
    expect(forhandsvisningUrl(l[0]!)).toContain('/lobster@latest/latin-400-normal.woff2');
  });

  it('fetches a WOFF file and says plainly when only WOFF2 exists', async () => {
    const l = await hentGoogleFamilier(hent);
    const f = await hentGoogleFont(l[0]!, 400, hent);
    expect(f).toMatchObject({
      id: googleFontId(l[0]!, 400),
      navn: 'Lobster 400',
      kilde: 'google',
      kategori: 'display',
    });
    expect(fraBase64(f.data).byteLength).toBe(filBytes.byteLength);
    await expect(hentGoogleFont(l[1]!, 400, hent)).rejects.toThrow(/filformat/);
    await expect(hentGoogleFont(l[1]!, 700, hent)).rejects.toThrow(/filformat/);
  });

  it('base64 round-trips', () => {
    expect(new Uint8Array(fraBase64(tilBase64(filBytes)))).toEqual(new Uint8Array(filBytes));
  });
});

describe('Added fonts in the project', () => {
  it('builds with an added font, and the project carries the font file', async () => {
    const l = await hentGoogleFamilier(hent);
    const lagret = leggTilIBibliotek(await hentGoogleFont(l[0]!, 400, hent))!;
    expect(alleFonter().some((f) => f.id === lagret.id)).toBe(true);
    expect(finnFont(lagret.id).ekstra).toBe(true);

    let d = nyttSigngenDokument();
    const id = Object.keys(d.objekter)[0]!;
    d = oppdaterObjekter(d, [id], (o) =>
      o.kilde.type === 'tekst' ? { ...o, kilde: { ...o.kilde, fontId: lagret.id } } : o,
    );
    d = synkFonter(d);
    expect(parametre(d).fonter?.map((f) => f.id)).toEqual([lagret.id]);
    expect(synkFonter(d)).toBe(d);

    await lastFonter(d);
    const r = await byggSigngen(d);
    expect(r.deler.length).toBeGreaterThan(0);
    expect(r.advarsler.filter((a) => /font/i.test(a.tekst))).toEqual([]);

    // another computer: nothing in the library, the project brings the file
    const json = JSON.stringify(d);
    fjernFraBibliotek(lagret.id);
    expect(alleFonter().some((f) => f.id === lagret.id)).toBe(false);
    const apnet = lesInnSigngen(JSON.parse(json));
    expect(alleFonter().some((f) => f.id === lagret.id)).toBe(true);
    await lastFonter(apnet);
    expect((await byggSigngen(apnet)).deler.length).toBeGreaterThan(0);
  });

  it('a font that is no longer used leaves the project', async () => {
    const l = await hentGoogleFamilier(hent);
    const lagret = leggTilIBibliotek(await hentGoogleFont(l[0]!, 400, hent))!;
    let d = nyttSigngenDokument();
    const id = Object.keys(d.objekter)[0]!;
    const sett = (fontId: string) =>
      synkFonter(
        oppdaterObjekter(d, [id], (o) =>
          o.kilde.type === 'tekst' ? { ...o, kilde: { ...o.kilde, fontId } } : o,
        ),
      );
    d = sett(lagret.id);
    expect(parametre(d).fonter).toHaveLength(1);
    d = sett('archivo-800');
    expect(parametre(d).fonter).toBeUndefined();
  });
});
