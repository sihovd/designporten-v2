/**
 * Colour profiles (Sivert, 2026-10-05): the colours a sign may use, picked
 * in the start window. They are the filaments you have in the printer or
 * can get. Four colours by default; more can always be added. Ready-made
 * profiles are drawn from the material catalogue, whose stock is not
 * confirmed (`bekreftet: false`); your own profiles are kept in this
 * browser only.
 */
import { finnMateriale, materialer } from '../../core/materialer';

/** How many colours a new profile has by default. */
export const STANDARD_ANTALL_FARGER = 4;

export interface Fargeprofil {
  id: string;
  navn: string;
  /** Material ids, in the order they are offered. */
  farger: string[];
  /** Made by the user and stored in this browser. */
  egen?: boolean;
}

/** Ready-made starting points: combinations from the catalogue, not stock. */
export const FERDIGE_PROFILER: Fargeprofil[] = [
  { id: 'standard', navn: 'Standard', farger: ['pla-kritthvit', 'pla-grafitt', 'pla-lilla', 'pla-cyan'] },
  {
    id: 'kontrast',
    navn: 'Svart og hvitt',
    farger: ['pla-kritthvit', 'pla-svart', 'pla-grafitt', 'resirk-gra'],
  },
  { id: 'natur', navn: 'Natur', farger: ['tre-lys', 'pla-skog', 'matt-sand', 'pla-kritthvit'] },
  { id: 'signal', navn: 'Signal', farger: ['pla-signal', 'pla-svart', 'pla-kritthvit', 'pla-rust'] },
];

export const STANDARD_PROFIL = FERDIGE_PROFILER[0]!;

const NOKKEL = 'designporten:signgen:fargeprofiler';

/** Only colours the catalogue knows, each once. */
export function rensFarger(farger: readonly string[]): string[] {
  return [...new Set(farger)].filter((id) => materialer.some((m) => m.id === id));
}

export function hentEgneProfiler(): Fargeprofil[] {
  try {
    const r: unknown = JSON.parse(localStorage.getItem(NOKKEL) ?? '[]');
    if (!Array.isArray(r)) return [];
    return r
      .filter(
        (p): p is Fargeprofil =>
          !!p && typeof p.id === 'string' && typeof p.navn === 'string' && Array.isArray(p.farger),
      )
      .map((p) => ({ id: p.id, navn: p.navn, farger: rensFarger(p.farger), egen: true }))
      .filter((p) => p.farger.length > 0);
  } catch {
    return [];
  }
}

function skriv(profiler: Fargeprofil[]): boolean {
  try {
    localStorage.setItem(
      NOKKEL,
      JSON.stringify(profiler.map(({ id, navn, farger }) => ({ id, navn, farger }))),
    );
    return true;
  } catch {
    return false;
  }
}

/** Save (or replace, by name) one of your own profiles. False if the browser would not store it. */
export function lagreEgenProfil(navn: string, farger: string[]): Fargeprofil | null {
  const p: Fargeprofil = {
    id: `egen-${Date.now().toString(36)}`,
    navn: navn.trim(),
    farger: rensFarger(farger),
    egen: true,
  };
  const andre = hentEgneProfiler().filter((x) => x.navn.toLowerCase() !== p.navn.toLowerCase());
  return skriv([...andre, p]) ? p : null;
}

export function slettEgenProfil(id: string): void {
  skriv(hentEgneProfiler().filter((p) => p.id !== id));
}

/** The palette colour closest in appearance (for colours a new profile drops). */
export function narmesteFarge(materialId: string, farger: readonly string[]): string {
  if (!farger.length || farger.includes(materialId)) return materialId;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = rgb(finnMateriale(materialId).hex);
  let best = farger[0]!;
  let min = Infinity;
  for (const id of farger) {
    const [r2, g2, b2] = rgb(finnMateriale(id).hex);
    const d = (r! - r2!) ** 2 + (g! - g2!) ** 2 + (b! - b2!) ** 2;
    if (d < min) [min, best] = [d, id];
  }
  return best;
}
