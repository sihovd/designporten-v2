/**
 * An SvgKilde from outlines (no DOM, so tests and the gallery can use it).
 * The outlines become a region, so holes (negative paths) are kept as
 * holes; the stored path data is that region centred on the origin.
 */
import type { SvgKilde } from '../../core/dokument';
import {
  areal,
  differanse,
  regionBoks,
  regionFraRinger,
  transformerRegion,
  union,
  type Fyllregel,
  type Region,
} from '../../geometri/polygon';
import type { Ring } from '../../geometri/polygon';
import { banerTilRinger, banerTilSti, flyttBaner, type Bane } from '../../geometri/bane';

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

/**
 * The curves a region was made from, in the region's own coordinates, and
 * the fill rule that turns them into that region. With these, the vector
 * keeps its real curves (editable points and handles) instead of the many
 * short lines the region is made of.
 */
export interface Kurver {
  baner: Bane[];
  regel: Fyllregel;
}

/**
 * Do two regions cover the same shape? Same number of pieces and holes and
 * a small difference in area (the curves are flattened differently).
 */
export function likeRegioner(a: Region, b: Region): boolean {
  if (a.length !== b.length) return false;
  const hull = (r: Region) => r.reduce((s, f) => s + f.hull.length, 0);
  if (hull(a) !== hull(b)) return false;
  const fa = areal(a),
    fb = areal(b);
  const stor = Math.max(fa, fb);
  if (stor < 1e-9) return true;
  const avvik = areal(differanse(a, b)) + areal(differanse(b, a));
  return Math.abs(fa - fb) <= stor * 0.02 && avvik <= stor * 0.03 + 0.05;
}

/**
 * A region as a centred SvgKilde. Null if it encloses no area. Given the
 * curves it came from, the vector keeps them when they give the same
 * shape; otherwise it is stored as the region's outlines (many short lines).
 */
export function kildeFraRegion(
  region: Region,
  filnavn: string,
  ekstra: Partial<SvgKilde> = {},
  kurver: Kurver | null = null,
): SvgFraRegion | null {
  if (!region.length) return null;
  const b = regionBoks(region);
  const cx = (b.minX + b.maksX) / 2,
    cy = (b.minY + b.maksY) / 2;
  let stier = region.map((f) =>
    [f.ytre, ...f.hull]
      .map((r) => `M${r.map((p) => `${rund3(p.x - cx)} ${rund3(p.y - cy)}`).join('L')}Z`)
      .join(''),
  );
  let fyllregel: Fyllregel = 'nonzero';
  if (kurver?.baner.length) {
    const sentrert = flyttBaner(kurver.baner, -cx, -cy);
    const kandidat = banerTilSti(sentrert);
    const fraKurver = regionFraRinger(banerTilRinger(sentrert, 0.02), kurver.regel);
    if (
      likeRegioner(
        fraKurver,
        transformerRegion(region, (p) => ({ x: p.x - cx, y: p.y - cy })),
      )
    ) {
      stier = [kandidat];
      fyllregel = kurver.regel;
    }
  }
  return {
    kilde: { type: 'svg', stier, filnavn, fyllregel, ...ekstra },
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
  kurver: Kurver | null = null,
): SvgFraRinger | null {
  let region: Region = nonzero.length ? regionFraRinger(nonzero, 'nonzero') : [];
  if (evenodd.length) {
    const eo = regionFraRinger(evenodd, 'evenodd');
    region = region.length ? union(region, eo) : eo;
  }
  return kildeFraRegion(region, filnavn, ekstra, kurver);
}
