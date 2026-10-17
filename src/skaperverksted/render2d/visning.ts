/**
 * 2D view transform: model millimetres (Y up) ↔ CSS pixels (Y down).
 * Pure, so tools and tests can use it without a canvas.
 */
import { PX_PER_MM } from '../core/enheter';
import type { Utsnitt } from '../core/arbeidsbenk';
import type { Boks, Vec2 } from '../core/geometri2d';

/** Width of the rulers along the top and left edge (CSS px). */
export const LINJAL = 22;

export interface Visning {
  bredde: number;
  hoyde: number;
  pxPerMm: number;
  utsnitt: Utsnitt;
  tilSkjerm(p: Vec2): Vec2;
  tilModell(s: Vec2): Vec2;
}

export function lagVisning(u: Utsnitt, bredde: number, hoyde: number): Visning {
  const pxPerMm = u.zoom * PX_PER_MM;
  // the visible drawing area excludes the rulers; centre within it
  const cx = LINJAL + (bredde - LINJAL) / 2;
  const cy = LINJAL + (hoyde - LINJAL) / 2;
  return {
    bredde,
    hoyde,
    pxPerMm,
    utsnitt: u,
    tilSkjerm: (p) => ({ x: cx + (p.x - u.senterX) * pxPerMm, y: cy - (p.y - u.senterY) * pxPerMm }),
    tilModell: (s) => ({ x: u.senterX + (s.x - cx) / pxPerMm, y: u.senterY - (s.y - cy) / pxPerMm }),
  };
}

/** Zoom by `faktor` keeping the model point under screen point `s` fixed. */
export function zoomRundt(u: Utsnitt, bredde: number, hoyde: number, s: Vec2, faktor: number): Utsnitt {
  const zoom = Math.min(40, Math.max(0.05, u.zoom * faktor));
  const for_ = lagVisning(u, bredde, hoyde).tilModell(s);
  const etter = lagVisning({ ...u, zoom }, bredde, hoyde).tilModell(s);
  return { zoom, senterX: u.senterX + (for_.x - etter.x), senterY: u.senterY + (for_.y - etter.y) };
}

/** Viewport that fits `boks` (mm) into the drawing area with a margin. */
export function tilpass(boks: Boks, bredde: number, hoyde: number, marg = 48, dekketVenstre = 0): Utsnitt {
  const b = Math.max(1, boks.maksX - boks.minX);
  const h = Math.max(1, boks.maksY - boks.minY);
  // a floating panel over the left edge hides part of the canvas
  const venstre = dekketVenstre > bredde * 0.5 ? 0 : dekketVenstre;
  const tilgjengeligB = Math.max(40, bredde - LINJAL - venstre - marg * 2);
  const tilgjengeligH = Math.max(40, hoyde - LINJAL - marg * 2);
  const pxPerMm = Math.min(tilgjengeligB / b, tilgjengeligH / h);
  const zoom = Math.min(40, Math.max(0.05, pxPerMm / PX_PER_MM));
  const forskyvning = venstre / 2 / (zoom * PX_PER_MM);
  return {
    zoom,
    senterX: (boks.minX + boks.maksX) / 2 - forskyvning,
    senterY: (boks.minY + boks.maksY) / 2,
  };
}

/** How far past the edge of the allowed area the view centre may go, as a share of half the view. */
const KANTSLUK = 0.8;
/** Zooming out stops when the allowed area fills this share of the view. */
const MIN_FYLL = 0.3;

/**
 * Keep the view near the work: the view centre may go past the edge of
 * `omraade` (the plate and the content) by at most 80 % of half the
 * visible width or height, so some of the plate always stays in sight, and
 * zooming out stops while the area still fills about a third of the view.
 * The workspace cannot be panned or zoomed away into nothing. `forrige` is
 * the view before the change: at the zoom-out limit it is kept as it is, so
 * the view does not creep while the wheel keeps turning.
 */
export function begrensUtsnitt(
  u: Utsnitt,
  bredde: number,
  hoyde: number,
  omraade: Boks,
  forrige?: Utsnitt,
): Utsnitt {
  const synligB = Math.max(1, bredde - LINJAL);
  const synligH = Math.max(1, hoyde - LINJAL);
  const minZoom =
    (Math.min(
      synligB / Math.max(1, omraade.maksX - omraade.minX),
      synligH / Math.max(1, omraade.maksY - omraade.minY),
    ) *
      MIN_FYLL) /
    PX_PER_MM;
  if (u.zoom < minZoom) {
    if (forrige && forrige.zoom <= minZoom * 1.001) return forrige;
    u = { ...u, zoom: minZoom };
  }
  const px = u.zoom * PX_PER_MM;
  const halvB = (synligB / 2 / px) * KANTSLUK;
  const halvH = (synligH / 2 / px) * KANTSLUK;
  const klamp = (v: number, min: number, maks: number) => Math.min(maks, Math.max(min, v));
  return {
    ...u,
    senterX: klamp(u.senterX, omraade.minX - halvB, omraade.maksX + halvB),
    senterY: klamp(u.senterY, omraade.minY - halvH, omraade.maksY + halvH),
  };
}

export interface Hjuldata {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  /** Non-standard, but set by Chromium and Safari: ±120 per notch for a mouse wheel. */
  wheelDeltaY?: number;
}

/**
 * Whether a wheel event without Ctrl comes from two fingers on a trackpad
 * (pan) rather than from a mouse wheel (zoom). Browsers do not say so
 * directly; these are the signs that hold in Chromium, Safari and Firefox.
 */
export function erStyreflate(e: Hjuldata): boolean {
  if (e.deltaMode !== 0) return false;
  if (e.deltaX !== 0) return true;
  const w = e.wheelDeltaY;
  if (typeof w === 'number' && w !== 0) {
    // a trackpad reports wheelDelta as -3 × delta; a wheel in steps of 120
    if (Math.abs(w) === Math.abs(e.deltaY) * 3) return true;
    if (w % 120 === 0) return false;
  }
  if (!Number.isInteger(e.deltaY)) return true;
  return Math.abs(e.deltaY) < 50;
}
