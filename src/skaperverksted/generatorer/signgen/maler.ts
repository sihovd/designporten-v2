/**
 * Templates (Sivert, 2026-10-06, §22). A template is a copy of a sign plus
 * the fields a shared or sold template will need: who made it, who owns it,
 * the licence, a price, how to credit it and what the user may do with it.
 * Only private templates in this browser exist for now. There is no
 * marketplace, no payment and no sharing; the fields are there so those can
 * be added without changing how templates are stored.
 *
 * Using a template copies it into a new project and leaves the original
 * untouched. The new project remembers where it came from
 * (`parametre.malopphav`) so credit and licence follow the copy.
 */
import { fraJson, tilJson, tomtDokument, type Dokument } from '../../core/dokument';
import { nyttSigngenDokument, parametre } from './dokument';

export type Malsynlighet = 'privat' | 'gratis' | 'kommersiell';

export const SYNLIGHETER: { id: Malsynlighet; navn: string; hjelp: string }[] = [
  { id: 'privat', navn: 'Privat', hjelp: 'Bare du ser og bruker malen.' },
  {
    id: 'gratis',
    navn: 'Gratis',
    hjelp: 'Forberedt for at andre kan bruke malen gratis. Deling er ikke åpnet ennå.',
  },
  {
    id: 'kommersiell',
    navn: 'Kommersiell',
    hjelp: 'Forberedt for salg av malen. Salg og betaling er ikke åpnet ennå.',
  },
];

export interface Malpris {
  belop: number;
  valuta: 'NOK';
}

/** Where a project comes from, kept in the project so credit and licence follow the copy. */
export interface Malopphav {
  malId: string;
  navn: string;
  skaper: string;
  eier: string;
  lisens: string;
  kreditering: string;
}

export interface Mal {
  versjon: 1;
  id: string;
  navn: string;
  beskrivelse: string;
  synlighet: Malsynlighet;
  /** Who made the design. */
  skaper: string;
  /** Who owns the rights to the template. */
  eier: string;
  /** The licence in words, for example «Kun til eget bruk». */
  lisens: string;
  /** Only for commercial templates; null otherwise. Nothing charges it yet. */
  pris: Malpris | null;
  /** How to credit the creator when the design is used. */
  kreditering: string;
  /** What the user may do: sell prints, change it, share it. */
  bruksrettigheter: string;
  opprettet: string;
  endret: string;
  /** Made by Designporten and shipped with the tool, not stored in the browser. */
  innebygd?: boolean;
  /** The project's design, as a stored document. */
  dokument: Dokument;
}

export const STANDARD_LISENS = 'Kun til eget bruk';

const NOKKEL = 'designporten:signgen:maler';
export const MAKS_MALER = 30;
/** One template, as JSON, may not be larger than this (characters). */
export const MAKS_MALSTORRELSE = 1_000_000;

/** What the user fills in when saving a template. */
export type Malutkast = Partial<
  Omit<Mal, 'versjon' | 'id' | 'opprettet' | 'endret' | 'dokument' | 'innebygd'>
> & {
  navn: string;
};

function tekst(v: unknown, maks: number, standard = ''): string {
  return typeof v === 'string' ? v.trim().slice(0, maks) : standard;
}

/** A template from stored data, or null when it is not usable. */
export function rensMal(raw: unknown): Mal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = tekst(r.id, 60);
  const navn = tekst(r.navn, 80);
  if (!id || !navn || !r.dokument) return null;
  let dokument: Dokument;
  try {
    dokument = fraJson(JSON.stringify(r.dokument));
  } catch {
    return null;
  }
  if (dokument.generator !== 'signgen') return null;
  const synlighet: Malsynlighet =
    r.synlighet === 'gratis' || r.synlighet === 'kommersiell' ? r.synlighet : 'privat';
  const p = r.pris as { belop?: unknown } | null | undefined;
  const belop = typeof p?.belop === 'number' && Number.isFinite(p.belop) && p.belop >= 0 ? p.belop : null;
  const na = new Date().toISOString();
  return {
    versjon: 1,
    id,
    navn,
    beskrivelse: tekst(r.beskrivelse, 400),
    synlighet,
    skaper: tekst(r.skaper, 80),
    eier: tekst(r.eier, 80),
    lisens: tekst(r.lisens, 200, STANDARD_LISENS) || STANDARD_LISENS,
    pris: synlighet === 'kommersiell' && belop !== null ? { belop, valuta: 'NOK' } : null,
    kreditering: tekst(r.kreditering, 200),
    bruksrettigheter: tekst(r.bruksrettigheter, 400),
    opprettet: tekst(r.opprettet, 40, na),
    endret: tekst(r.endret, 40, na),
    dokument,
  };
}

/** A deep copy of a design, so nothing a project does can reach the template it came from. */
function kopier(dok: Dokument): Dokument {
  return fraJson(tilJson(dok));
}

/** Make a template of the open sign. The sign itself is not changed. */
export function nyMalFraDokument(
  dok: Dokument,
  utkast: Malutkast,
  id = `mal-${Date.now().toString(36)}`,
): Mal {
  const na = new Date().toISOString();
  const synlighet = utkast.synlighet ?? 'privat';
  const kopi = kopier(dok);
  // a template is a starting point: it always opens without the start window
  kopi.parametre = { ...kopi.parametre, startvalgt: true };
  delete kopi.parametre.malopphav;
  // the CSV rows are the maker's own data and do not go into a template
  delete kopi.parametre.csvarbeid;
  delete kopi.parametre.csvinstans;
  return {
    versjon: 1,
    id,
    navn: utkast.navn.trim().slice(0, 80) || 'Uten navn',
    beskrivelse: (utkast.beskrivelse ?? '').trim().slice(0, 400),
    synlighet,
    skaper: (utkast.skaper ?? '').trim().slice(0, 80),
    eier: (utkast.eier ?? utkast.skaper ?? '').trim().slice(0, 80),
    lisens: (utkast.lisens ?? '').trim().slice(0, 200) || STANDARD_LISENS,
    pris:
      synlighet === 'kommersiell' && utkast.pris && utkast.pris.belop >= 0
        ? { belop: utkast.pris.belop, valuta: 'NOK' }
        : null,
    kreditering: (utkast.kreditering ?? '').trim().slice(0, 200),
    bruksrettigheter: (utkast.bruksrettigheter ?? '').trim().slice(0, 400),
    opprettet: na,
    endret: na,
    dokument: kopi,
  };
}

/**
 * A new project from a template: a deep copy with a new identity, named
 * after the template. The template is not touched.
 */
export function brukMal(mal: Mal): Dokument {
  const kopi = kopier(mal.dokument);
  const na = new Date().toISOString();
  const ny = tomtDokument('signgen', mal.navn, kopi.plate);
  const opphav: Malopphav = {
    malId: mal.id,
    navn: mal.navn,
    skaper: mal.skaper,
    eier: mal.eier,
    lisens: mal.lisens,
    kreditering: mal.kreditering,
  };
  return {
    ...kopi,
    id: ny.id,
    navn: mal.navn,
    parametre: { ...kopi.parametre, startvalgt: true, malopphav: opphav },
    meta: { opprettet: na, endret: na },
  };
}

/** The template a project was made from, if any. */
export function malopphavAv(dok: Dokument): Malopphav | null {
  const o = (parametre(dok) as { malopphav?: Malopphav }).malopphav;
  return o && typeof o.malId === 'string' ? o : null;
}

// ---------- shipped with the tool ----------

/** Templates made by Designporten. Plain starting points, not artwork. */
export function innebygdeMaler(): Mal[] {
  const dok = nyttSigngenDokument();
  return [
    {
      versjon: 1,
      id: 'innebygd-navneskilt',
      navn: 'Navneskilt',
      beskrivelse: 'Én linje tekst på et fylt underlag, i fire farger. Bytt teksten og fargene.',
      synlighet: 'gratis',
      skaper: 'Designporten',
      eier: 'Designporten',
      lisens: 'Ikke avklart ennå',
      pris: null,
      kreditering: '',
      bruksrettigheter: '',
      opprettet: '2026-10-07T00:00:00.000Z',
      endret: '2026-10-07T00:00:00.000Z',
      innebygd: true,
      dokument: { ...dok, parametre: { ...dok.parametre, startvalgt: true } },
    },
  ];
}

// ---------- the user's own templates (this browser) ----------

export function hentEgneMaler(): Mal[] {
  try {
    const r: unknown = JSON.parse(localStorage.getItem(NOKKEL) ?? '[]');
    return Array.isArray(r) ? r.map(rensMal).filter((m): m is Mal => !!m) : [];
  } catch {
    return [];
  }
}

export type Malfeil = 'full' | 'for-stor' | 'lagring';

/** Save a template (a new one, or replace the one with the same id). */
export function lagreMal(mal: Mal): { ok: true } | { ok: false; feil: Malfeil } {
  if (JSON.stringify(mal).length > MAKS_MALSTORRELSE) return { ok: false, feil: 'for-stor' };
  const andre = hentEgneMaler().filter((m) => m.id !== mal.id);
  if (andre.length >= MAKS_MALER) return { ok: false, feil: 'full' };
  try {
    localStorage.setItem(NOKKEL, JSON.stringify([...andre, { ...mal, endret: new Date().toISOString() }]));
    return { ok: true };
  } catch {
    return { ok: false, feil: 'lagring' };
  }
}

export function slettMal(id: string): void {
  try {
    localStorage.setItem(NOKKEL, JSON.stringify(hentEgneMaler().filter((m) => m.id !== id)));
  } catch {
    /* storage unavailable: nothing to delete */
  }
}
