/**
 * Local persistence: autosave of the open project and stored designs that
 * cart lines reference (KurvLinje.designId). Browser storage only; server
 * saving comes with accounts (spec). Every access tolerates storage being
 * unavailable (private mode, quota).
 */
import { fraJson, tilJson, type Dokument } from './dokument';

const AUTOLAGRING = (generator: string) => `dp-verksted:${generator}`;
const DESIGN = (id: string) => `dp-design:${id}`;

function lager(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function autolagre(dok: Dokument): boolean {
  try {
    lager()?.setItem(AUTOLAGRING(dok.generator), tilJson(dok));
    return true;
  } catch {
    return false;
  }
}

export function hentAutolagret(generator: string): Dokument | null {
  try {
    const t = lager()?.getItem(AUTOLAGRING(generator));
    if (!t) return null;
    const d = fraJson(t);
    return d.generator === generator ? d : null;
  } catch {
    return null;
  }
}

export function slettAutolagret(generator: string): void {
  try {
    lager()?.removeItem(AUTOLAGRING(generator));
  } catch {
    /* storage unavailable: nothing to delete */
  }
}

/** A design attached to a cart line / order request. */
export interface LagretDesign {
  id: string;
  generator: string;
  navn: string;
  lagret: string;
  /** Plain-language summary for the order request (size, layers, colours). */
  sammendrag: string[];
  dokument: Dokument;
}

export function lagreDesign(d: LagretDesign): boolean {
  try {
    lager()?.setItem(DESIGN(d.id), JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** For the cart/order flow: the stored design behind KurvLinje.designId. */
export function hentDesign(id: string): LagretDesign | null {
  try {
    const t = lager()?.getItem(DESIGN(id));
    return t ? (JSON.parse(t) as LagretDesign) : null;
  } catch {
    return null;
  }
}

/** Offer a file download in the browser. */
export function lastNed(data: Uint8Array | string, filnavn: string, type: string): void {
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filnavn;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
