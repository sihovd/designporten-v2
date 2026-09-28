/**
 * Design tokens for code that cannot read CSS custom properties
 * (canvas, WebGL, workers). Keep in sync with src/styles/tokens.css.
 */
export const farger = {
  lilla: '#883dff',
  lillaLys: '#b797ff',
  cyan: '#00c4d6',
  papir: '#f6f3ee',
  flate: '#fffdf9',
  kalk: '#ece7df',
  blekk: '#18171c',
  verksted: '#141317',
  grafitt: '#1c1b1f',
  grafitt2: '#2a282e',
  linjeMork: '#3a3740',
  tekstMork: '#f1eee8',
  dempetMork: '#a7a3a0',
} as const;

export const skrift = {
  mono: '"IBM Plex Mono", ui-monospace, monospace',
  tekst: '"Archivo Variable", Archivo, Arial, sans-serif',
} as const;

export const bevegelse = {
  easeUt: [0.2, 0.7, 0.2, 1] as const,
  rask: 150,
  trinn: 320,
  inngang: 500,
} as const;

export function reduserBevegelse(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
