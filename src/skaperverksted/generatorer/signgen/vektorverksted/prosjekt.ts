/**
 * Saving Vectorium projects (Sivert approved «prosjektlagring med
 * autolagring», 2026-11-11): the image, the mask, the protection, the
 * settings and the vector are kept together, so work can be picked up again.
 *
 * Autosave goes to the browser's IndexedDB (one project, overwritten as you
 * work); «Lagre prosjekt» downloads the same as a .vectorium file that
 * «Åpne prosjekt» reads. Nothing leaves the browser.
 */

export interface Prosjekt {
  versjon: 1;
  navn: string;
  /** When it was saved, ms since 1970. */
  lagret: number;
  bilde: Blob;
  maske: Blob | null;
  beskytt: Blob | null;
  /** The component's own state (settings, modes, layers, the vector); checked when it is read back. */
  tilstand: unknown;
}

export const FILENDELSE = '.vectorium';
const DB = 'vectorim';
const LAGER = 'prosjekter';
const NOKKEL = 'autolagring';

function apneDb(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      if (typeof indexedDB === 'undefined') return ok(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(LAGER);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

async function iLager<T>(
  modus: IDBTransactionMode,
  gjor: (s: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await apneDb();
  if (!db) return null;
  return new Promise((ok) => {
    try {
      const t = db.transaction(LAGER, modus);
      const r = gjor(t.objectStore(LAGER));
      t.oncomplete = () => {
        db.close();
        ok((r.result as T) ?? null);
      };
      t.onerror = t.onabort = () => {
        db.close();
        ok(null);
      };
    } catch {
      db.close();
      ok(null);
    }
  });
}

/** Keeps the project in the browser; false when the browser does not allow it (private mode, full disk). */
export async function lagreAutomatisk(p: Prosjekt): Promise<boolean> {
  return (await iLager('readwrite', (s) => s.put(p, NOKKEL))) !== null;
}

export async function hentAutomatisk(): Promise<Prosjekt | null> {
  const p = await iLager<Prosjekt>('readonly', (s) => s.get(NOKKEL));
  return p && p.versjon === 1 && p.bilde instanceof Blob ? p : null;
}

export async function slettAutomatisk(): Promise<void> {
  await iLager('readwrite', (s) => s.delete(NOKKEL));
}

async function tilDataUrl(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${b.type || 'image/png'};base64,${btoa(bin)}`;
}

function fraDataUrl(u: unknown): Blob | null {
  if (typeof u !== 'string') return null;
  const m = /^data:(image\/(?:png|jpeg|webp|gif|bmp));base64,([A-Za-z0-9+/=]+)$/.exec(u);
  if (!m) return null;
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/** The project as a file to download. */
export async function prosjektTilFil(p: Prosjekt): Promise<Blob> {
  const innhold = {
    format: 'vectorium',
    versjon: 1,
    navn: p.navn,
    lagret: p.lagret,
    bilde: await tilDataUrl(p.bilde),
    maske: p.maske ? await tilDataUrl(p.maske) : null,
    beskytt: p.beskytt ? await tilDataUrl(p.beskytt) : null,
    tilstand: p.tilstand,
  };
  return new Blob([JSON.stringify(innhold)], { type: 'application/json' });
}

/** Files saved before the name became Vectorium (.vectorim) still open. */
const GAMLE_FILENDELSER = ['.vectorim'];
const GAMMELT_FORMAT = 'vectorim';

export const erProsjektfil = (f: File) => {
  const n = f.name.toLowerCase();
  return n.endsWith(FILENDELSE) || GAMLE_FILENDELSER.some((e) => n.endsWith(e));
};

/** Reads a .vectorium file (or an older .vectorim). Throws with a message for the user when it is not one. */
export async function prosjektFraFil(f: File): Promise<Prosjekt> {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(await f.text()) as Record<string, unknown>;
  } catch {
    throw new Error('Filen er ikke et Vectorium-prosjekt.');
  }
  const bilde = fraDataUrl(d.bilde);
  if ((d.format !== 'vectorium' && d.format !== GAMMELT_FORMAT) || d.versjon !== 1 || !bilde)
    throw new Error('Filen er ikke et Vectorium-prosjekt, eller den er laget av en nyere versjon.');
  return {
    versjon: 1,
    navn: typeof d.navn === 'string' ? d.navn : f.name.replace(/\.vectorium$|\.vectorim$/i, ''),
    lagret: typeof d.lagret === 'number' ? d.lagret : Date.now(),
    bilde,
    maske: fraDataUrl(d.maske),
    beskytt: fraDataUrl(d.beskytt),
    tilstand: d.tilstand,
  };
}
