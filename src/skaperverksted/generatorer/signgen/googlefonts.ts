/**
 * Search and fetch fonts from Google Fonts (Sivert, 2026-10-06, §20).
 *
 * Google's own font list needs an API key, so this reads the open Fontsource
 * mirror of Google Fonts (api.fontsource.org for the list and the file
 * addresses, files from the jsDelivr CDN). Only the Latin subset is used
 * (it includes æ, ø and å). The file is stored in the project afterwards:
 * the network is needed to add a font, never to use it.
 *
 * The network calls are injected (`Hent`) so they can be tested; they could
 * not be reached from the build environment, so the live endpoints are
 * untested there.
 */
import { MAKS_FONTSTORRELSE, tilBase64, type LagretFont } from './fontbibliotek';

export type Hent = (url: string) => Promise<Response>;

const LISTE = 'https://api.fontsource.org/v1/fonts';

export interface GoogleFamilie {
  /** Fontsource id, for example «open-sans». */
  id: string;
  familie: string;
  kategori: string;
  vekter: number[];
  subsets: string[];
  lisens?: string;
}

let cache: GoogleFamilie[] | null = null;

/** For tests. */
export function nullstillGoogleFontCache(): void {
  cache = null;
}

const standardHent: Hent = (url) => fetch(url);

function tilFamilie(r: unknown): GoogleFamilie | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.family !== 'string') return null;
  if (o.type !== undefined && o.type !== 'google') return null;
  const subsets = Array.isArray(o.subsets) ? o.subsets.filter((x): x is string => typeof x === 'string') : [];
  if (!subsets.includes('latin')) return null;
  const vekter = Array.isArray(o.weights) ? o.weights.map(Number).filter((n) => Number.isFinite(n)) : [400];
  const lisens =
    typeof o.license === 'string'
      ? o.license
      : o.license && typeof (o.license as { type?: unknown }).type === 'string'
        ? (o.license as { type: string }).type
        : undefined;
  return {
    id: o.id,
    familie: o.family,
    kategori: typeof o.category === 'string' ? o.category : '',
    vekter: vekter.length ? vekter.sort((a, b) => a - b) : [400],
    subsets,
    lisens,
  };
}

/** The list of families, fetched once per page load. */
export async function hentGoogleFamilier(hent: Hent = standardHent): Promise<GoogleFamilie[]> {
  if (cache) return cache;
  const svar = await hent(`${LISTE}?subsets=latin`);
  if (!svar.ok) throw new Error('Google Fonts svarte ikke. Prøv igjen om litt.');
  const rader: unknown = await svar.json();
  if (!Array.isArray(rader)) throw new Error('Google Fonts ga en liste vi ikke forstår.');
  cache = rader.map(tilFamilie).filter((f): f is GoogleFamilie => !!f);
  return cache;
}

/** Families whose name contains every word of the query, name matches that start with it first. */
export function soekFamilier(liste: readonly GoogleFamilie[], sok: string, maks = 40): GoogleFamilie[] {
  const ord = sok.toLowerCase().split(/\s+/).filter(Boolean);
  if (!ord.length) return [];
  const treff = liste.filter((f) => ord.every((o) => f.familie.toLowerCase().includes(o)));
  const start = (f: GoogleFamilie) => (f.familie.toLowerCase().startsWith(ord[0]!) ? 0 : 1);
  return treff.sort((a, b) => start(a) - start(b) || a.familie.localeCompare(b.familie)).slice(0, maks);
}

/** All families matching the query (all of them when it is empty), name matches that start with it first. */
export function filtrerFamilier(liste: readonly GoogleFamilie[], sok: string): GoogleFamilie[] {
  const ord = sok.toLowerCase().split(/\s+/).filter(Boolean);
  const treff = liste.filter((f) => ord.every((o) => f.familie.toLowerCase().includes(o)));
  const start = (f: GoogleFamilie) => (ord.length && f.familie.toLowerCase().startsWith(ord[0]!) ? 0 : 1);
  return treff.sort((a, b) => start(a) - start(b) || a.familie.localeCompare(b.familie));
}

/** The small latin file used to show a family in the font window (the regular weight, or the closest). */
export function forhandsvisningVekt(f: GoogleFamilie): number {
  return f.vekter.includes(400) ? 400 : (f.vekter[0] ?? 400);
}

export function forhandsvisningUrl(f: GoogleFamilie): string {
  return `https://cdn.jsdelivr.net/fontsource/fonts/${encodeURIComponent(f.id)}@latest/latin-${forhandsvisningVekt(f)}-normal.woff2`;
}

export function googleFontId(f: GoogleFamilie, vekt: number): string {
  return `gf-${f.id}-${vekt}`;
}

/** The weight closest to bold that the family has (a sign reads best heavy), else the first one. */
export function standardVekt(f: GoogleFamilie): number {
  return f.vekter.includes(700) ? 700 : (f.vekter.find((v) => v >= 600) ?? f.vekter.at(-1) ?? 400);
}

interface Detalj {
  variants?: Record<string, Record<string, Record<string, { url?: Record<string, string> }>>>;
}

/** Fetch one weight of a family as a font file the editor can read (WOFF or TTF). */
export async function hentGoogleFont(
  f: GoogleFamilie,
  vekt: number,
  hent: Hent = standardHent,
): Promise<LagretFont> {
  const svar = await hent(`${LISTE}/${encodeURIComponent(f.id)}`);
  if (!svar.ok) throw new Error(`Fant ikke ${f.familie} hos Google Fonts.`);
  const d = (await svar.json()) as Detalj;
  const url = d.variants?.[String(vekt)]?.normal?.latin?.url;
  const adresse = url?.woff ?? url?.ttf;
  if (!adresse) throw new Error(`${f.familie} ${vekt} finnes ikke i et filformat verkstedet kan lese.`);
  const fil = await hent(adresse);
  if (!fil.ok) throw new Error(`${f.familie} kunne ikke lastes ned.`);
  const bytes = await fil.arrayBuffer();
  if (bytes.byteLength > MAKS_FONTSTORRELSE)
    throw new Error(
      `${f.familie} er for stor til å lagres i prosjektet (${Math.round(bytes.byteLength / 1000)} kB).`,
    );
  return {
    id: googleFontId(f, vekt),
    navn: `${f.familie} ${vekt}`,
    familie: f.familie,
    vekt,
    kategori: f.kategori || undefined,
    kilde: 'google',
    lisens: f.lisens,
    data: tilBase64(bytes),
  };
}
