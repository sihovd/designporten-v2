/**
 * Local persistence: autosave of the open project and stored designs that
 * cart lines reference (KurvLinje.designId). Browser storage only; server
 * saving comes with accounts (spec). Every access tolerates storage being
 * unavailable (private mode, quota).
 */
import { fraJson, tilJson, type Dokument } from './dokument';

const AUTOLAGRING = (generator: string) => `dp-verksted:${generator}`;
const DESIGN = (id: string) => `dp-design:${id}`;
const SIST_BRUKT = (generator: string) => `dp-verksted:${generator}:sist-brukt`;

const DAG = 24 * 60 * 60 * 1000;

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
    merkBrukt(dok.generator);
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
    lager()?.removeItem(SIST_BRUKT(generator));
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

// ---------- guest storage: one project per tool, deleted after a month unused ----------

/** Mark the saved project as in use now. Opening and every autosave do this. */
export function merkBrukt(generator: string, naa = Date.now()): void {
  try {
    lager()?.setItem(SIST_BRUKT(generator), String(naa));
  } catch {
    /* storage unavailable */
  }
}

export interface Gjestestatus {
  /** What happened to the saved project at start. */
  utfall: 'ingen' | 'beholdt' | 'slettet';
  /** Days since it was last used (0 for a new one). */
  dagerUbrukt: number;
}

/**
 * Called once when a tool opens, before the saved project is read. A saved
 * project that has not been opened for more than `maksDager` days is deleted.
 * Deliberately careful: a project is only deleted when its last-used time is
 * a valid time in the past and older than the limit. A missing, unreadable
 * or future time counts as «used now», so a project is never deleted because
 * of a clock or storage oddity. Every opening and every autosave renews the
 * time, so someone who works in it cannot lose it.
 */
export function ryddGjestelagring(generator: string, maksDager: number, naa = Date.now()): Gjestestatus {
  try {
    if (!lager()?.getItem(AUTOLAGRING(generator))) return { utfall: 'ingen', dagerUbrukt: 0 };
    const rå = Number(lager()?.getItem(SIST_BRUKT(generator)));
    const sist = Number.isFinite(rå) && rå > 0 && rå <= naa ? rå : naa;
    const dager = Math.floor((naa - sist) / DAG);
    if (naa - sist > maksDager * DAG) {
      slettAutolagret(generator);
      return { utfall: 'slettet', dagerUbrukt: dager };
    }
    merkBrukt(generator, naa);
    return { utfall: 'beholdt', dagerUbrukt: dager };
  } catch {
    return { utfall: 'ingen', dagerUbrukt: 0 };
  }
}
