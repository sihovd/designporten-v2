/**
 * The font library (Sivert, 2026-10-06, §20): fonts added from Google Fonts
 * (or any font file) are kept in this browser and copied into the project
 * that uses them, so the 3D model builds without a network and the project
 * opens with the same fonts on another computer. The curated set that ships
 * with the site is not touched.
 */
import type { Dokument } from '../../core/dokument';
import {
  alleFonter,
  ekstraFontData,
  erKjentFont,
  fjernRegistrertFont,
  registrerFont,
  type FontInfo,
} from '../../geometri/tekst';

const NOKKEL = 'designporten:signgen:fontbibliotek';

/** A font as stored: the file as base64, and where it came from. */
export interface LagretFont {
  id: string;
  navn: string;
  familie: string;
  vekt: number;
  kategori?: string;
  kilde: 'google' | 'fil';
  lisens?: string;
  data: string;
}

export const MAKS_FONTER_I_BIBLIOTEK = 30;
/** A font file over this size (bytes) is refused: it would not fit in the browser's storage. */
export const MAKS_FONTSTORRELSE = 400_000;

export function tilBase64(b: ArrayBuffer): string {
  const bytes = new Uint8Array(b);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fraBase64(t: string): ArrayBuffer {
  const s = atob(t);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b.buffer;
}

function rens(raw: unknown): LagretFont | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.navn !== 'string' ||
    typeof r.familie !== 'string' ||
    typeof r.data !== 'string' ||
    !r.data
  )
    return null;
  return {
    id: r.id.slice(0, 80),
    navn: r.navn.slice(0, 80),
    familie: r.familie.slice(0, 80),
    vekt: typeof r.vekt === 'number' ? r.vekt : 400,
    kategori: typeof r.kategori === 'string' ? r.kategori.slice(0, 30) : undefined,
    kilde: r.kilde === 'fil' ? 'fil' : 'google',
    lisens: typeof r.lisens === 'string' ? r.lisens.slice(0, 40) : undefined,
    data: r.data,
  };
}

export function hentFontbibliotek(): LagretFont[] {
  try {
    const r: unknown = JSON.parse(localStorage.getItem(NOKKEL) ?? '[]');
    return Array.isArray(r) ? r.map(rens).filter((f): f is LagretFont => !!f) : [];
  } catch {
    return [];
  }
}

function skriv(liste: LagretFont[]): boolean {
  try {
    localStorage.setItem(NOKKEL, JSON.stringify(liste));
    return true;
  } catch {
    return false;
  }
}

function tilInfo(f: LagretFont): FontInfo {
  return {
    id: f.id,
    navn: f.navn,
    fil: '',
    preg: f.kilde === 'google' ? `Google Fonts${f.kategori ? `, ${f.kategori}` : ''}` : 'Egen fil',
    ekstra: true,
  };
}

/** Make the library's fonts known to the editor. */
export function lastFontbibliotek(): LagretFont[] {
  const liste = hentFontbibliotek();
  for (const f of liste) if (!erKjentFont(f.id)) registrerFont(tilInfo(f), fraBase64(f.data));
  return liste;
}

/** Add a font to the library (and make it known). Returns null when it does not fit. */
export function leggTilIBibliotek(f: LagretFont): LagretFont | null {
  if (f.data.length > MAKS_FONTSTORRELSE * 1.4) return null;
  registrerFont(tilInfo(f), fraBase64(f.data));
  const andre = hentFontbibliotek().filter((x) => x.id !== f.id);
  if (andre.length >= MAKS_FONTER_I_BIBLIOTEK) return null;
  return skriv([...andre, f]) ? f : null;
}

export function fjernFraBibliotek(id: string): void {
  skriv(hentFontbibliotek().filter((f) => f.id !== id));
  fjernRegistrertFont(id);
}

// ---------- in the project ----------

/** The added fonts that text in the project uses, as the project should carry them. */
export function fonterForProsjekt(dok: Dokument): LagretFont[] {
  const bruk = new Set<string>();
  for (const o of Object.values(dok.objekter)) if (o.kilde.type === 'tekst') bruk.add(o.kilde.fontId);
  const lager = new Map(hentFontbibliotek().map((f) => [f.id, f]));
  const naa = new Map(prosjektfonter(dok).map((f) => [f.id, f]));
  const ut: LagretFont[] = [];
  for (const id of bruk) {
    const f = lager.get(id) ?? naa.get(id);
    if (f) ut.push(f);
    else {
      const info = alleFonter().find((x) => x.id === id && x.ekstra);
      const data = ekstraFontData(id);
      if (info && data)
        ut.push({ id, navn: info.navn, familie: info.navn, vekt: 400, kilde: 'fil', data: tilBase64(data) });
    }
  }
  return ut;
}

export function prosjektfonter(dok: Dokument): LagretFont[] {
  const liste = (dok.parametre as { fonter?: unknown }).fonter;
  return Array.isArray(liste) ? liste.map(rens).filter((f): f is LagretFont => !!f) : [];
}

/** Keep the project's copy of the added fonts in step with the text that uses them. */
export function synkFonter(dok: Dokument): Dokument {
  const bruk = fonterForProsjekt(dok);
  const naa = prosjektfonter(dok);
  if (bruk.length === naa.length && bruk.every((f, i) => f.id === naa[i]?.id)) return dok;
  const { fonter: _bort, ...rest } = dok.parametre as Record<string, unknown>;
  void _bort;
  return { ...dok, parametre: bruk.length ? { ...rest, fonter: bruk } : rest };
}

/** Opening a project: the fonts it carries become known. */
export function registrerProsjektfonter(dok: Dokument): void {
  for (const f of prosjektfonter(dok)) if (!erKjentFont(f.id)) registrerFont(tilInfo(f), fraBase64(f.data));
}
