/**
 * An SvgKilde from outlines (no DOM, so tests and the gallery can use it).
 * The outlines become a region, so holes (negative paths) are kept as
 * holes; the stored path data is that region centred on the origin.
 */
import type { SvgKilde } from '../../core/dokument';
import { regionBoks, regionFraRinger, union, type Region } from '../../geometri/polygon';
import type { Ring } from '../../geometri/polygon';

const rund3 = (v: number) => Math.round(v * 1000) / 1000;

export interface SvgFraRinger {
  kilde: SvgKilde;
  bredde: number;
  hoyde: number;
}

export interface SvgFraRegion extends SvgFraRinger {
  /** Where the region's centre was before it was moved to the origin (mm). */
  senter: { x: number; y: number };
}

/** A region as a centred SvgKilde. Null if it encloses no area. */
export function kildeFraRegion(
  region: Region,
  filnavn: string,
  ekstra: Partial<SvgKilde> = {},
): SvgFraRegion | null {
  if (!region.length) return null;
  const b = regionBoks(region);
  const cx = (b.minX + b.maksX) / 2,
    cy = (b.minY + b.maksY) / 2;
  const stier = region.map((f) =>
    [f.ytre, ...f.hull]
      .map((r) => `M${r.map((p) => `${rund3(p.x - cx)} ${rund3(p.y - cy)}`).join('L')}Z`)
      .join(''),
  );
  return {
    kilde: { type: 'svg', stier, filnavn, fyllregel: 'nonzero', ...ekstra },
    bredde: b.maksX - b.minX,
    hoyde: b.maksY - b.minY,
    senter: { x: cx, y: cy },
  };
}

/**
 * Rings drawn with the non-zero rule and rings drawn with the even-odd
 * rule are resolved each by their own rule, then joined. Null if they
 * enclose no area.
 */
export function kildeFraRinger(
  nonzero: Ring[],
  evenodd: Ring[],
  filnavn: string,
  ekstra: Partial<SvgKilde> = {},
): SvgFraRinger | null {
  let region: Region = nonzero.length ? regionFraRinger(nonzero, 'nonzero') : [];
  if (evenodd.length) {
    const eo = regionFraRinger(evenodd, 'evenodd');
    region = region.length ? union(region, eo) : eo;
  }
  return kildeFraRegion(region, filnavn, ekstra);
}
