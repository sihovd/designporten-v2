/**
 * Browser client for member accounts and the public sign gallery
 * (php/api/konto/index.php). They run only on the PHP build (one.com) with
 * api/konto/konfig.php in place; elsewhere every call says so with
 * `KontoFeil` status 503, and the pages show that instead of failing.
 * What a member may use is decided by the server (`tilganger`); the page
 * only shows it.
 */
import { nettsti, phpmiljo } from '@/lib/nettsti';
import type { Betaling, Gratisperiode, Plan } from './tjenester';

/** A service or feature the member may or may not use, and why not. */
export interface Tilgang {
  tilgang: boolean;
  grunn: string | null;
}

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
  tilganger: Record<string, Tilgang & { funksjoner: Record<string, Tilgang> }>;
  status: 'aktiv' | 'suspendert';
  /** The package in force: the own plan while paid, otherwise the free account. */
  pakke: Pakke;
  /** When the address was confirmed, or null. */
  epostBekreftet: string | null;
  opprettet: string;
  sistInne: string | null;
}

export interface Pakke {
  id: string | null;
  navn: string;
  prosjekter: number;
  tjenester: string[];
}

/** A project saved on the account (stage C). The owner is always the signed-in member. */
export interface Prosjekt {
  id: string;
  app: string;
  navn: string;
  /** Bytes of JSON. */
  storrelse: number;
  /** Goes up by one on every save; a save names the revision it was based on. */
  revisjon: number;
  opprettet: string;
  endret: string;
}

/** How many projects the account keeps, across every tool. */
export interface Kvote {
  brukt: number;
  maks: number;
  pakke: string | null;
  pakkenavn: string;
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
  tjenester: Record<
    string,
    { navn: string; betaling: Betaling; beskrivelse: string; gratisperiode?: Gratisperiode }
  >;
  leverandorer: Record<string, { navn: string; aktiv: boolean }>;
  /** With the price and quota set in Studio. */
  planer: Record<string, Plan>;
}

export class KontoFeil extends Error {
  constructor(
    melding: string,
    readonly status: number,
    /** Extra fields from the server, such as the current `revisjon` on 409. */
    readonly data: Record<string, unknown> = {},
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
  if (!svar.ok) throw new KontoFeil(data.feil ?? 'Noe gikk galt.', svar.status, data);
  return data;
}

export const konto = {
  status: () => kall<Kontostatus>('status'),
  meg: () => kall<{ medlem: Medlem | null }>('meg'),
  registrer: (navn: string, epost: string, passord: string, vilkar: boolean) =>
    kall<{ medlem: Medlem; bekreftelse: { sendt: boolean; feil: string | null } }>('registrer', {
      kropp: { navn, epost, passord, vilkar },
    }),
  loggInn: (epost: string, passord: string) =>
    kall<{ medlem: Medlem }>('logginn', { kropp: { epost, passord } }),
  loggUt: () => kall<{ ok: true }>('loggut', { kropp: {} }),
  profil: (navn: string) => kall<{ medlem: Medlem }>('profil', { kropp: { navn } }),
  slettKonto: (passord: string) => kall<{ ok: true }>('slett-konto', { kropp: { passord } }),
  sendBekreftelse: () => kall<{ ok: true }>('send-bekreftelse', { kropp: {} }),
  bekreftEpost: (token: string) => kall<{ ok: true; epost: string }>('bekreft-epost', { kropp: { token } }),
  glemtPassord: (epost: string) => kall<{ ok: true; melding: string }>('glemt-passord', { kropp: { epost } }),
  nyttPassord: (token: string, passord: string) =>
    kall<{ ok: true }>('nytt-passord', { kropp: { token, passord } }),
  endrePassord: (passord: string, nytt: string) =>
    kall<{ medlem: Medlem }>('endre-passord', { kropp: { passord, nytt } }),
  endreEpost: (passord: string, epost: string) =>
    kall<{ ok: true }>('endre-epost', { kropp: { passord, epost } }),
  byttEpost: (token: string) => kall<{ ok: true; epost: string }>('bytt-epost', { kropp: { token } }),
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
  /** The member's projects (all tools, or one), newest first, and the quota. */
  prosjekter: (app?: string) =>
    kall<{ prosjekter: Prosjekt[]; kvote: Kvote }>('prosjekter', {
      sok: app ? `&app=${encodeURIComponent(app)}` : '',
    }),
  prosjekt: (id: string) =>
    kall<{ prosjekt: Prosjekt & { dokument: unknown } }>('prosjekt', {
      sok: `&id=${encodeURIComponent(id)}`,
    }),
  /**
   * Saves a project: new without `id`, otherwise an update based on `revisjon`.
   * 409 means it changed elsewhere (`data.revisjon`), 403 that the quota is full.
   */
  lagreProsjekt: (p: { app: string; navn: string; dokument: unknown; id?: string; revisjon?: number }) =>
    kall<{ prosjekt: Prosjekt; kvote: Kvote }>('prosjekt-lagre', { kropp: p }),
  slettProsjekt: (id: string) => kall<{ ok: true; kvote: Kvote }>('prosjekt-slett', { kropp: { id } }),
  /** For CMS administrators; `csrf` is the CMS session's token. */
  admin: {
    medlemmer: () =>
      kall<{
        medlemmer: (Medlem & {
          antallSkilt: number;
          antallProsjekter: number;
          aktiv: boolean;
          unntak: Record<string, 'ja' | 'nei'>;
        })[];
        antall: number;
        gjesteskilt: number;
        tilgangsnokler: string[];
      }>('admin-medlemmer'),
    skilt: () => kall<{ skilt: DeltSkilt[] }>('admin-skilt'),
    skjul: (id: string, skjult: boolean, csrf: string) =>
      kall<{ ok: true }>('admin-skjul', { kropp: { id, skjult }, hoder: { 'X-CSRF-Token': csrf } }),
    status: (id: number, status: Medlem['status'], csrf: string) =>
      kall<{ ok: true }>('admin-status', { kropp: { id, status }, hoder: { 'X-CSRF-Token': csrf } }),
    tilgang: (id: number, nokkel: string, verdi: 'ja' | 'nei' | null, csrf: string) =>
      kall<{ ok: true }>('admin-tilgang', { kropp: { id, nokkel, verdi }, hoder: { 'X-CSRF-Token': csrf } }),
    /** The packages with the numbers in use now. */
    planer: () => kall<{ planer: Record<string, Plan> }>('admin-planer'),
    /** Set a package's quota and, for a paid one, its price in whole kroner incl. VAT. */
    plan: (
      p: { id: string; prosjekter: number; prisManed: number | null; prisAr: number | null },
      csrf: string,
    ) => kall<{ planer: Record<string, Plan> }>('admin-plan', { kropp: p, hoder: { 'X-CSRF-Token': csrf } }),
    /** The captured e-mails; test builds only. */
    testpost: () =>
      kall<{ eposter: { til: string; emne: string; tekst: string; tid: string }[] }>('admin-testpost'),
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
