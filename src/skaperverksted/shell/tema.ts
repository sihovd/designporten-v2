/**
 * Colours for canvas/WebGL drawing come from the CSS tokens, so the
 * workshop palette has one source (src/styles/tokens.css).
 */
export function cssFarge(el: Element, navn: string, reserve: string): string {
  const v = getComputedStyle(el).getPropertyValue(navn).trim();
  return v || reserve;
}

export function reduserBevegelse(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The horizon gradient behind the canvas: stops from top to bottom, and where the horizon line lies (0 to 1). */
export interface Horisont {
  topp: string;
  hoy: string;
  linje: string;
  bunn: string;
  pos: number;
}

/** The horizon gradient from the CSS tokens, or null when the workshop has none. */
export function lesHorisont(el: Element): Horisont | null {
  const topp = cssFarge(el, '--horisont-topp', '');
  if (!topp) return null;
  return {
    topp,
    hoy: cssFarge(el, '--horisont-hoy', topp),
    linje: cssFarge(el, '--horisont-linje', topp),
    bunn: cssFarge(el, '--horisont-bunn', topp),
    pos: Number(cssFarge(el, '--horisont-pos', '0.62')) || 0.62,
  };
}

/** Add the horizon's stops to a canvas gradient (2D canvas and the 3D background). */
export function horisontStopp(g: CanvasGradient, h: Horisont): void {
  g.addColorStop(0, h.topp);
  g.addColorStop(Math.max(0.05, h.pos - 0.2), h.hoy);
  g.addColorStop(h.pos, h.linje);
  g.addColorStop(1, h.bunn);
}
