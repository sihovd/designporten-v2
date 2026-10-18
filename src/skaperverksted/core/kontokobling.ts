/**
 * Which local projects are saved on the account (stage C): the browser
 * remembers, per document id, the account project and the revision it was
 * last saved or opened as. Nothing is uploaded on its own; the member saves
 * with «Lagre på kontoen». The project in the browser stays the working copy
 * (autosave as before), so a failed save never loses anything.
 */
import { lagernokkel } from '@/lib/nettsti';
import type { Dokument } from './dokument';

const KOBLINGER = () => lagernokkel('dp-verksted:kontoprosjekter');

export interface Kobling {
  /** The account project's id. */
  id: string;
  app: string;
  revisjon: number;
  /** `meta.endret` of the document when it was saved or opened: unchanged means nothing is unsaved. */
  endret: string;
}

function alle(): Record<string, Kobling> {
  try {
    const r: unknown = JSON.parse(localStorage.getItem(KOBLINGER()) ?? '{}');
    return r && typeof r === 'object' ? (r as Record<string, Kobling>) : {};
  } catch {
    return {};
  }
}

export function hentKobling(dok: Dokument): Kobling | null {
  const k = alle()[dok.id];
  return k && k.app === dok.generator && typeof k.id === 'string' && Number.isInteger(k.revisjon) ? k : null;
}

/** Remember (or forget, with null) the account project this document is saved as. */
export function settKobling(dok: Dokument, k: Omit<Kobling, 'endret'> | null): void {
  try {
    const a = alle();
    if (k) a[dok.id] = { ...k, endret: dok.meta.endret };
    else delete a[dok.id];
    localStorage.setItem(KOBLINGER(), JSON.stringify(a));
  } catch {
    /* storage unavailable: the next save is treated as a new project */
  }
}

/** Forget every link to one account project (it was deleted). */
export function glemKontoprosjekt(id: string): void {
  try {
    const a = alle();
    for (const [dokId, k] of Object.entries(a)) if (k.id === id) delete a[dokId];
    localStorage.setItem(KOBLINGER(), JSON.stringify(a));
  } catch {
    /* storage unavailable */
  }
}

/** True when the document has changes that are not saved on the account (or it is not saved there). */
export function harUlagret(dok: Dokument): boolean {
  const k = hentKobling(dok);
  return !k || k.endret !== dok.meta.endret;
}
