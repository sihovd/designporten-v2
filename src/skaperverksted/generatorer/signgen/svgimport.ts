/**
 * SVG import (browser). Paths and basic shapes become one SvgKilde whose
 * path data is normalised to millimetres, Y up and centred on the origin.
 * Text in an SVG cannot be converted reliably without its font, so it is
 * rejected with a message asking the user to convert text to paths.
 */
import type { SvgKilde } from '../../core/dokument';
import { multipliser, anvend, type Matrise } from '../../core/geometri2d';
import { stiTilRinger, StiFeil } from '../../geometri/stidata';
import { regionFraRinger, regionBoks } from '../../geometri/polygon';

export class SvgFeil extends Error {}

const ENHETER: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96,
  '': 25.4 / 96,
};

/** Length attribute → mm (null for percentages or unknown units). */
export function lengdeIMm(v: string | null): number | null {
  if (!v) return null;
  const m = v.trim().match(/^([-+]?[\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i);
  if (!m) return null;
  return Number(m[1]) * ENHETER[(m[2] ?? '').toLowerCase()]!;
}

/** Parse an SVG transform list into a matrix (SVG a b c d e f order). */
export function tolkTransform(t: string | null): Matrise {
  let m: Matrise = [1, 0, 0, 1, 0, 0];
  if (!t) return m;
  for (const [, navn, arg] of t.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = arg!
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    let n: Matrise;
    switch (navn) {
      case 'matrix':
        n = [a[0] ?? 1, a[1] ?? 0, a[2] ?? 0, a[3] ?? 1, a[4] ?? 0, a[5] ?? 0];
        break;
      case 'translate':
        n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(r),
          s = Math.sin(r);
        const cx = a[1] ?? 0,
          cy = a[2] ?? 0;
        n = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multipliser(m, n);
  }
  return m;
}

function tallAttr(el: Element, navn: string): number {
  return Number(el.getAttribute(navn) ?? 0) || 0;
}

/** Basic shapes as path data (SVG coordinates). */
function formSomSti(el: Element): string | null {
  switch (el.localName) {
    case 'path':
      return el.getAttribute('d');
    case 'rect': {
      const x = tallAttr(el, 'x'),
        y = tallAttr(el, 'y'),
        w = tallAttr(el, 'width'),
        h = tallAttr(el, 'height');
      let rx = el.hasAttribute('rx') ? tallAttr(el, 'rx') : tallAttr(el, 'ry');
      let ry = el.hasAttribute('ry') ? tallAttr(el, 'ry') : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (w <= 0 || h <= 0) return null;
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = tallAttr(el, 'cx'),
        cy = tallAttr(el, 'cy');
      const rx = el.localName === 'circle' ? tallAttr(el, 'r') : tallAttr(el, 'rx');
      const ry = el.localName === 'circle' ? rx : tallAttr(el, 'ry');
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'polygon':
    case 'polyline': {
      const p = (el.getAttribute('points') ?? '').trim();
      return p ? `M${p}Z` : null;
    }
    default:
      return null;
  }
}

/** Apply a matrix to every point of flattened path data; returns rings. */
function transformerteRinger(d: string, m: Matrise) {
  return stiTilRinger(d, 0.05).map((r) => r.map((p) => anvend(m, p)));
}

export interface SvgResultat {
  kilde: SvgKilde;
  bredde: number;
  hoyde: number;
  hoppetOver: string[];
}

/** Parse an SVG file's text into a normalised SvgKilde. Throws SvgFeil. */
export function importerSvg(tekst: string, filnavn: string): SvgResultat {
  const doc = new DOMParser().parseFromString(tekst, 'image/svg+xml');
  const rot = doc.documentElement;
  if (!rot || rot.localName !== 'svg' || doc.querySelector('parsererror')) {
    throw new SvgFeil('Filen er ikke en gyldig SVG.');
  }
  if (rot.querySelector('text, textPath')) {
    throw new SvgFeil(
      'SVG-en inneholder tekst. Gjør teksten om til konturer (stier) i tegneprogrammet og prøv igjen.',
    );
  }

  // user units → mm from width/height and viewBox
  const vb = (rot.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const bMm = lengdeIMm(rot.getAttribute('width'));
  const hMm = lengdeIMm(rot.getAttribute('height'));
  let skala = 25.4 / 96;
  if (vb.length === 4 && vb[2]! > 0) {
    if (bMm) skala = bMm / vb[2]!;
    else if (hMm && vb[3]! > 0) skala = hMm / vb[3]!;
  }

  const hoppetOver = new Set<string>();
  const ringer: ReturnType<typeof transformerteRinger> = [];
  let fyllregel: 'nonzero' | 'evenodd' = 'nonzero';
  const besok = (el: Element, m: Matrise) => {
    const mm_ = multipliser(m, tolkTransform(el.getAttribute('transform')));
    const navn = el.localName;
    if (
      [
        'defs',
        'clipPath',
        'mask',
        'symbol',
        'marker',
        'pattern',
        'style',
        'title',
        'desc',
        'metadata',
      ].includes(navn)
    )
      return;
    if (el.getAttribute('display') === 'none') return;
    if (navn === 'svg' || navn === 'g' || navn === 'a') {
      for (const b of el.children) besok(b, mm_);
      return;
    }
    if (navn === 'line') {
      hoppetOver.add('linjer uten flate');
      return;
    }
    if (navn === 'image' || navn === 'use') {
      hoppetOver.add(navn === 'image' ? 'bilder' : 'gjenbrukte elementer (use)');
      return;
    }
    const d = formSomSti(el);
    if (!d) return;
    if (el.getAttribute('fill') === 'none' || /fill\s*:\s*none/.test(el.getAttribute('style') ?? '')) {
      hoppetOver.add('former uten fyll (bare strek)');
      return;
    }
    if (
      (el.getAttribute('fill-rule') ?? '').trim() === 'evenodd' ||
      /fill-rule\s*:\s*evenodd/.test(el.getAttribute('style') ?? '')
    ) {
      fyllregel = 'evenodd';
    }
    try {
      ringer.push(...transformerteRinger(d, mm_));
    } catch (e) {
      if (e instanceof StiFeil) hoppetOver.add('ugyldige stier');
      else throw e;
    }
  };
  const start: Matrise = [skala, 0, 0, -skala, 0, 0]; // SVG y down → y up, user units → mm
  const vbX = vb.length === 4 ? vb[0]! : 0;
  const vbY = vb.length === 4 ? vb[1]! : 0;
  besok(rot, multipliser(start, [1, 0, 0, 1, -vbX, -vbY]));
  if (!ringer.length) throw new SvgFeil('Fant ingen fylte former i SVG-en.');

  const region = regionFraRinger(ringer, fyllregel);
  if (!region.length) throw new SvgFeil('Formene i SVG-en har ingen flate.');
  const b = regionBoks(region);
  const cx = (b.minX + b.maksX) / 2,
    cy = (b.minY + b.maksY) / 2;
  // store the normalised outline (already flattened) as compact path data
  const stier = region.map((f) =>
    [f.ytre, ...f.hull]
      .map((r) => `M${r.map((p) => `${rund3(p.x - cx)} ${rund3(p.y - cy)}`).join('L')}Z`)
      .join(''),
  );
  return {
    kilde: { type: 'svg', stier, filnavn, fyllregel: 'nonzero' },
    bredde: b.maksX - b.minX,
    hoyde: b.maksY - b.minY,
    hoppetOver: [...hoppetOver],
  };
}

const rund3 = (v: number) => Math.round(v * 1000) / 1000;
