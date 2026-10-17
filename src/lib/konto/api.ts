/**
 * Browser client for member accounts and the public sign gallery
 * (php/api/konto/index.php). They run only on the PHP build (one.com) with
 * the CMS database switched on; elsewhere every call says so with
 * `KontoFeil` status 503, and the pages show that instead of failing.
 */
import { nettsti, phpmiljo } from '@/lib/nettsti';
import type { Betaling } from './tjenester';

export interface Medlem {
  id: number;
  navn: string;
  epost: string;
  plan: string;
  betaling: {
    status: 'ingen' | 'aktiv' | 'utlopt' | 'avbrutt';
    leverandor: string | null;
    betaltTil: string | null;
  };
  tilgang: Record<string, boolean>;
  opprettet: string;
  sistInne: string | null;
}

export interface DeltSkilt {
  id: string;
  tittel: string;
  skaper: string;
  bilde: string | null;
  gangerBrukt: number;
  opprettet: string;
  endret: string;
  skjult?: boolean;
  medlem?: number | null;
}

export interface Kontostatus {
  aktiv: boolean;
  merknad: string;
  tjenester: Record<string, { navn: string; betaling: Betaling; beskrivelse: string }>;
  leverandorer: Record<string, { navn: string; aktiv: boolean }>;
}

export class KontoFeil extends Error {
  constructor(
    melding: string,
    readonly status: number,
  ) {
    super(melding);
  }
}

export const IKKE_PA = 'Brukerkontoer og skiltgalleriet er ikke slått på på denne serveren ennå.';

/** Accounts exist only where the PHP API is deployed. */
export const kontoMulig = phpmiljo;

async function kall<T>(
  r: string,
  valg: { kropp?: unknown; sok?: string; hoder?: Record<string, string> } = {},
) {
  if (!kontoMulig) throw new KontoFeil(IKKE_PA, 503);
  let svar: Response;
  try {
    svar = await fetch(nettsti(`/api/konto/?r=${r}${valg.sok ?? ''}`), {
      method: valg.kropp === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers:
        valg.kropp === undefined
          ? valg.hoder
          : { 'Content-Type': 'application/json', 'X-Konto': '1', ...valg.hoder },
      body: valg.kropp === undefined ? undefined : JSON.stringify(valg.kropp),
    });
  } catch {
    throw new KontoFeil('Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.', 0);
  }
  let data: T & { feil?: string };
  try {
    data = (await svar.json()) as T & { feil?: string };
  } catch {
    throw new KontoFeil(IKKE_PA, 503);
  }
  if (!svar.ok) throw new KontoFeil(data.feil ?? 'Noe gikk galt.', svar.status);
  return data;
}

export const konto = {
  status: () => kall<Kontostatus>('status'),
  meg: () => kall<{ medlem: Medlem | null }>('meg'),
  registrer: (navn: string, epost: string, passord: string, vilkar: boolean) =>
    kall<{ medlem: Medlem }>('registrer', { kropp: { navn, epost, passord, vilkar } }),
  loggInn: (epost: string, passord: string) =>
    kall<{ medlem: Medlem }>('logginn', { kropp: { epost, passord } }),
  loggUt: () => kall<{ ok: true }>('loggut', { kropp: {} }),
  profil: (navn: string) => kall<{ medlem: Medlem }>('profil', { kropp: { navn } }),
  slettKonto: (passord: string) => kall<{ ok: true }>('slett-konto', { kropp: { passord } }),
  skilt: (antall = 12, neste?: string | null) =>
    kall<{ skilt: DeltSkilt[]; neste: string | null }>('skilt', {
      sok: `&antall=${antall}${neste ? `&for=${encodeURIComponent(neste)}` : ''}`,
    }),
  mineSkilt: () => kall<{ skilt: DeltSkilt[] }>('mine-skilt'),
  del: (mal: unknown, bilde: string | null, tidligere?: { id: string; nokkel: string }) =>
    kall<{ id: string; nokkel: string | null; ny: boolean }>('del', {
      kropp: { mal, bilde, ...(tidligere ?? {}) },
    }),
  bruk: (id: string) => kall<{ mal: unknown; skaper: string }>('bruk', { kropp: { id } }),
  slettSkilt: (id: string, nokkel?: string) => kall<{ ok: true }>('slett-skilt', { kropp: { id, nokkel } }),
  /** For CMS administrators; `csrf` is the CMS session's token. */
  admin: {
    medlemmer: () =>
      kall<{
        medlemmer: (Medlem & { antallSkilt: number; aktiv: boolean })[];
        antall: number;
        gjesteskilt: number;
      }>('admin-medlemmer'),
    skilt: () => kall<{ skilt: DeltSkilt[] }>('admin-skilt'),
    skjul: (id: string, skjult: boolean, csrf: string) =>
      kall<{ ok: true }>('admin-skjul', { kropp: { id, skjult }, hoder: { 'X-CSRF-Token': csrf } }),
  },
};

// ---------- signs shared from this browser ----------

const DELT = 'designporten:delte-skilt';

export interface DelingIDenneNettleseren {
  id: string;
  nokkel: string;
  tittel: string;
  delt: string;
}

/** Signs shared from this browser, by project id: the key lets the browser update or remove them. */
export function delteSkilt(): Record<string, DelingIDenneNettleseren> {
  try {
    const r: unknown = JSON.parse(localStorage.getItem(DELT) ?? '{}');
    return r && typeof r === 'object' ? (r as Record<string, DelingIDenneNettleseren>) : {};
  } catch {
    return {};
  }
}

export function huskDeling(prosjekt: string, d: DelingIDenneNettleseren | null): void {
  try {
    const alle = delteSkilt();
    if (d) alle[prosjekt] = d;
    else delete alle[prosjekt];
    localStorage.setItem(DELT, JSON.stringify(alle));
  } catch {
    /* storage unavailable: the sign is shared, this browser just cannot change it later */
  }
}
