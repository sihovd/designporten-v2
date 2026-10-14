import { lagernokkel } from '@/lib/nettsti';
/**
 * Client-side cart. It only remembers what the visitor wants; it does not
 * take payment (no custom checkout engine). Checkout is handed to the
 * active CommerceProvider (see ./leverandor.ts).
 *
 * Storage is best-effort: if localStorage is unavailable the cart lives in
 * memory for the page's lifetime.
 */

export interface KurvLinje {
  /** Stable key: product id + chosen options. */
  nokkel: string;
  produktId: string;
  navn: string;
  antall: number;
  /** Unit price in øre when confirmed; null when no price is set. */
  enhetspris: number | null;
  valg: Record<string, string>;
  /** Skaperverksted design attached to the line, if any. */
  designId?: string;
}

const LAGER_NOKKEL = lagernokkel('dp-kurv-v1');
const HENDELSE = 'dp:kurv';

let minne: KurvLinje[] = [];

function les(): KurvLinje[] {
  try {
    const raa = window.localStorage.getItem(LAGER_NOKKEL);
    return raa ? (JSON.parse(raa) as KurvLinje[]) : minne;
  } catch {
    return minne;
  }
}

function skriv(linjer: KurvLinje[]): void {
  minne = linjer;
  try {
    window.localStorage.setItem(LAGER_NOKKEL, JSON.stringify(linjer));
  } catch {
    /* storage unavailable: keep in memory */
  }
  window.dispatchEvent(new CustomEvent(HENDELSE, { detail: linjer }));
}

export function linjeNokkel(produktId: string, valg: Record<string, string>): string {
  const deler = Object.keys(valg)
    .sort()
    .map((k) => `${k}=${valg[k]}`);
  return [produktId, ...deler].join('|');
}

export function hentKurv(): KurvLinje[] {
  return les();
}

export function antallVarer(linjer: KurvLinje[] = les()): number {
  return linjer.reduce((sum, l) => sum + l.antall, 0);
}

export function leggTil(linje: Omit<KurvLinje, 'nokkel'>): void {
  const nokkel = linjeNokkel(linje.produktId, linje.valg);
  const linjer = les();
  const finnes = linjer.find((l) => l.nokkel === nokkel);
  if (finnes) finnes.antall += linje.antall;
  else linjer.push({ ...linje, nokkel });
  skriv(linjer);
}

export function settAntall(nokkel: string, antall: number): void {
  const linjer = les()
    .map((l) => (l.nokkel === nokkel ? { ...l, antall } : l))
    .filter((l) => l.antall > 0);
  skriv(linjer);
}

export function tomKurv(): void {
  skriv([]);
}

/** Sum in øre of lines with a confirmed price; `ukjent` counts lines without. */
export function delsum(linjer: KurvLinje[] = les()): { ore: number; ukjent: number } {
  let ore = 0;
  let ukjent = 0;
  for (const l of linjer) {
    if (l.enhetspris === null) ukjent += l.antall;
    else ore += l.enhetspris * l.antall;
  }
  return { ore, ukjent };
}

export function lyttPaKurv(fn: (linjer: KurvLinje[]) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<KurvLinje[]>).detail);
  const lagring = (e: StorageEvent) => {
    if (e.key === LAGER_NOKKEL) fn(les());
  };
  window.addEventListener(HENDELSE, h);
  window.addEventListener('storage', lagring);
  return () => {
    window.removeEventListener(HENDELSE, h);
    window.removeEventListener('storage', lagring);
  };
}

export function formaterKroner(ore: number): string {
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 0,
  }).format(ore / 100);
}
