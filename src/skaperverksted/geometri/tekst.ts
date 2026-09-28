/**
 * Text → outline rings in mm (Y up) using opentype.js. Fonts are the
 * curated Open Font License set in public/skaperverksted/fonter/ and are
 * loaded on demand. Layout is ours (not opentype's) so letter spacing,
 * line height and alignment follow the document exactly.
 *
 * The text block is centred on the origin by its layout box (advance
 * widths and line metrics), not its ink, so typing does not make the text
 * jump around.
 */
import { parse, type Font, type PathCommand } from 'opentype.js';
import type { TekstKilde } from '../core/dokument';
import type { Ring } from './polygon';
import { flatKubisk, flatKvadratisk } from './stidata';

export interface FontInfo {
  id: string;
  navn: string;
  fil: string;
  /** Short description of the character, for the picker. */
  preg: string;
}

/** Curated sign fonts (all SIL Open Font License 1.1; licence texts alongside). */
export const fonter: FontInfo[] = [
  { id: 'archivo-800', navn: 'Archivo Extra Bold', fil: 'archivo-800.woff', preg: 'Kraftig grotesk' },
  { id: 'poppins-700', navn: 'Poppins Bold', fil: 'poppins-700.woff', preg: 'Geometrisk, vennlig' },
  { id: 'bebas-neue-400', navn: 'Bebas Neue', fil: 'bebas-neue-400.woff', preg: 'Smal, bare versaler' },
  { id: 'lilita-one-400', navn: 'Lilita One', fil: 'lilita-one-400.woff', preg: 'Rund og tykk' },
  { id: 'titan-one-400', navn: 'Titan One', fil: 'titan-one-400.woff', preg: 'Leken og tung' },
  { id: 'fredoka-600', navn: 'Fredoka Semi Bold', fil: 'fredoka-600.woff', preg: 'Myk og avrundet' },
  { id: 'roboto-slab-700', navn: 'Roboto Slab Bold', fil: 'roboto-slab-700.woff', preg: 'Seriffer, robust' },
  {
    id: 'playfair-display-700',
    navn: 'Playfair Display Bold',
    fil: 'playfair-display-700.woff',
    preg: 'Klassisk, høy kontrast',
  },
  { id: 'pacifico-400', navn: 'Pacifico', fil: 'pacifico-400.woff', preg: 'Løkkeskrift' },
  { id: 'caveat-700', navn: 'Caveat Bold', fil: 'caveat-700.woff', preg: 'Håndskrift' },
];

export const standardFont = 'archivo-800';

export function finnFont(id: string): FontInfo {
  return fonter.find((f) => f.id === id) ?? fonter[0]!;
}

export type FontHenter = (fil: string) => Promise<ArrayBuffer>;

const nettHenter: FontHenter = async (fil) => {
  const svar = await fetch(`/skaperverksted/fonter/${fil}`);
  if (!svar.ok) throw new Error(`Fonten ${fil} kunne ikke lastes.`);
  return svar.arrayBuffer();
};

let henter: FontHenter = nettHenter;
const lastede = new Map<string, Promise<Font>>();

/** Replace the loader (tests, workers). Clears the cache. */
export function settFontHenter(h: FontHenter): void {
  henter = h;
  lastede.clear();
}

export function lastFont(id: string): Promise<Font> {
  const info = finnFont(id);
  let p = lastede.get(info.id);
  if (!p) {
    p = henter(info.fil).then((b) => parse(b));
    p.catch(() => lastede.delete(info.id));
    lastede.set(info.id, p);
  }
  return p;
}

export interface Tekstresultat {
  ringer: Ring[];
  /** Layout box (mm), centred on the origin. */
  bredde: number;
  hoyde: number;
  /** Characters the font does not contain. */
  mangler: string[];
}

function kommandoerTilRinger(cmds: PathCommand[], ringer: Ring[], toleranse: number): void {
  let ring: Ring | null = null;
  let p = { x: 0, y: 0 };
  const lukk = () => {
    if (ring && ring.length >= 3) ringer.push(ring);
    ring = null;
  };
  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        lukk();
        p = { x: c.x!, y: c.y! };
        ring = [p];
        break;
      case 'L':
        p = { x: c.x!, y: c.y! };
        ring?.push(p);
        break;
      case 'C': {
        const e = { x: c.x!, y: c.y! };
        if (ring) flatKubisk(ring, p, { x: c.x1!, y: c.y1! }, { x: c.x2!, y: c.y2! }, e, toleranse);
        p = e;
        break;
      }
      case 'Q': {
        const e = { x: c.x!, y: c.y! };
        if (ring) flatKvadratisk(ring, p, { x: c.x1!, y: c.y1! }, e, toleranse);
        p = e;
        break;
      }
      case 'Z':
        lukk();
        break;
    }
  }
  lukk();
}

/**
 * Lay out and outline text. Rings are raw glyph contours (mixed winding);
 * normalise with regionFraRinger(ringer, 'nonzero').
 */
export function tekstTilRinger(font: Font, k: TekstKilde, toleranse = 0.02): Tekstresultat {
  const str = Math.max(0.5, k.storrelse);
  const skala = str / font.unitsPerEm;
  const linjer = k.tekst.split('\n');
  const linjeHoyde = str * Math.max(0.5, k.linjeavstand);
  const mangler = new Set<string>();

  const oppsett = linjer.map((linje) => {
    // per-character mapping: opentype's shaping throws on some GSUB tables,
    // and signs need predictable glyphs rather than contextual forms
    const tegn = Array.from(linje);
    const glyfer = tegn.map((c) => font.charToGlyph(c));
    const x: number[] = [];
    let penn = 0;
    glyfer.forEach((g, i) => {
      if (g.index === 0 && tegn[i] && tegn[i]!.trim()) mangler.add(tegn[i]!);
      x.push(penn);
      penn += (g.advanceWidth ?? 0) * skala + k.sperring * str;
      const neste = glyfer[i + 1];
      if (neste) penn += font.getKerningValue(g, neste) * skala;
    });
    const bredde = glyfer.length ? penn - k.sperring * str : 0;
    return { glyfer, x, bredde };
  });

  const maksBredde = Math.max(0, ...oppsett.map((l) => l.bredde));
  const asc = font.ascender * skala;
  const desc = -font.descender * skala;
  const blokkHoyde = asc + desc + linjeHoyde * (linjer.length - 1);
  const ringer: Ring[] = [];

  oppsett.forEach((l, li) => {
    const dx =
      k.justering === 'venstre'
        ? -maksBredde / 2
        : k.justering === 'hoyre'
          ? maksBredde / 2 - l.bredde
          : -l.bredde / 2;
    // baseline of this line in Y-up space, block centred vertically
    const grunnlinje = blokkHoyde / 2 - asc - li * linjeHoyde;
    l.glyfer.forEach((g, gi) => {
      // opentype paths are Y-down; draw at origin and flip ourselves
      const sti = g.getPath(0, 0, str);
      const lokale: Ring[] = [];
      kommandoerTilRinger(sti.commands, lokale, toleranse);
      for (const r of lokale) {
        ringer.push(r.map((p) => ({ x: p.x + dx + l.x[gi]!, y: -p.y + grunnlinje })));
      }
    });
  });

  return { ringer, bredde: maksBredde, hoyde: blokkHoyde, mangler: [...mangler] };
}
