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
