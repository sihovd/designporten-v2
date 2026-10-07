/**
 * The filament registry (Sivert, 2026-10-06, §16 to §19): a colour in a
 * project is a real filament, not a random RGB value. The starting
 * catalogue (`core/materialer.ts`) and the filaments the user adds are both
 * filaments, so every layer, outline and object points at a filament id.
 *
 * Your own filaments live in this browser (no accounts yet). A project also
 * carries a copy of the own filaments it uses, so it opens with the same
 * colours on another computer and an exported file never depends on this
 * browser.
 *
 * There is no authorised product catalogue for Bambu Lab, Polymaker,
 * Prusament or others here. The registry is built so one can be read in
 * later (it is a list of `Materiale`); until then the manufacturer, series,
 * article number and the rest are entered by the user.
 */
import {
  alleMaterialer,
  erKjentMateriale,
  fjernRegistrertMateriale,
  materialer,
  materialtyper,
  registrerMateriale,
  visningsnavn,
  type Materiale,
  type Materialtype,
} from '../../core/materialer';
import type { Dokument } from '../../core/dokument';

const NOKKEL_FILAMENTER = 'designporten:signgen:filamenter';
const NOKKEL_GRUPPER = 'designporten:signgen:fargegrupper';

/** Suggestions for the manufacturer field. These are names, not product data. */
export const KJENTE_PRODUSENTER = ['Bambu Lab', 'Polymaker', 'Prusament', 'eSun', 'Sunlu', 'Egen blanding'];

/** The heading a filament without a manufacturer is listed under. */
export const GENERISK_PRODUSENT = 'Uten produsent (startkatalogen)';

export const MAKS_EGNE_FILAMENTER = 400;
export const MAKS_AMS_PLASS = 16;

const HEX = /^#[0-9a-f]{6}$/i;

function tekst(v: unknown, maks: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, maks);
  return t || undefined;
}

/** A filament from stored or entered data, or null when it is not usable. */
export function rensFilament(raw: unknown): Materiale | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = tekst(r.id, 60);
  const navn = tekst(r.navn, 60);
  const hex = typeof r.hex === 'string' && HEX.test(r.hex) ? r.hex.toLowerCase() : null;
  const type =
    typeof r.type === 'string' && r.type in materialtyper
      ? (r.type as Materialtype)
      : ('PLA' as Materialtype);
  if (!id || !navn || !hex) return null;
  const ams = typeof r.amsPlass === 'number' ? Math.round(r.amsPlass) : undefined;
  let metadata: Record<string, string> | undefined;
  if (r.metadata && typeof r.metadata === 'object') {
    const par = Object.entries(r.metadata as Record<string, unknown>)
      .map(([k, v]) => [tekst(k, 40), tekst(v, 200)] as const)
      .filter((p): p is readonly [string, string] => !!p[0] && !!p[1])
      .slice(0, 20);
    if (par.length) metadata = Object.fromEntries(par);
  }
  const f: Materiale = { id, navn, type, hex, bekreftet: true, egen: true };
  const produsent = tekst(r.produsent, 60);
  const serie = tekst(r.serie, 60);
  const sku = tekst(r.sku, 40);
  const egetNavn = tekst(r.egetNavn, 60);
  const spole = tekst(r.spole, 60);
  if (produsent) f.produsent = produsent;
  if (serie) f.serie = serie;
  if (sku) f.sku = sku;
  if (egetNavn) f.egetNavn = egetNavn;
  if (spole) f.spole = spole;
  if (ams && ams >= 1 && ams <= MAKS_AMS_PLASS) f.amsPlass = ams;
  if (metadata) f.metadata = metadata;
  return f;
}

function lesListe(nokkel: string): unknown[] {
  try {
    const r: unknown = JSON.parse(localStorage.getItem(nokkel) ?? '[]');
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

function skrivListe(nokkel: string, liste: unknown[]): boolean {
  try {
    localStorage.setItem(nokkel, JSON.stringify(liste));
    return true;
  } catch {
    return false;
  }
}

/** The user's own filaments, as stored in this browser. */
export function hentEgneFilamenter(): Materiale[] {
  return lesListe(NOKKEL_FILAMENTER)
    .map(rensFilament)
    .filter((f): f is Materiale => !!f && !materialer.some((m) => m.id === f.id));
}

/** Make the stored filaments known to the editor. Safe to call again. */
export function lastEgneFilamenter(): Materiale[] {
  const liste = hentEgneFilamenter();
  for (const f of liste) registrerMateriale(f);
  return liste;
}

/** The fields the user fills in for a new filament. */
export type FilamentUtkast = Omit<Materiale, 'id' | 'bekreftet' | 'egen'> & { id?: string };

function nyFilamentId(): string {
  return `fil-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Save an own filament (a new one, or the one with the same id). Returns it
 * as saved, or null when the data is unusable or the browser would not
 * store it; it is registered either way when usable, so it works in this
 * session.
 */
export function lagreEgetFilament(utkast: FilamentUtkast): Materiale | null {
  const f = rensFilament({ ...utkast, id: utkast.id ?? nyFilamentId() });
  if (!f) return null;
  registrerMateriale(f);
  const andre = hentEgneFilamenter().filter((x) => x.id !== f.id);
  if (andre.length >= MAKS_EGNE_FILAMENTER) return null;
  return skrivListe(NOKKEL_FILAMENTER, [...andre, f]) ? f : null;
}

export function slettEgetFilament(id: string): void {
  fjernRegistrertMateriale(id);
  skrivListe(
    NOKKEL_FILAMENTER,
    hentEgneFilamenter().filter((f) => f.id !== id),
  );
}

// ---------- filters ----------

export interface Filamentfilter {
  tekst?: string;
  produsent?: string;
  type?: Materialtype | '';
}

/** The manufacturer a filament is listed under. */
export function produsentAv(m: Materiale): string {
  return m.produsent?.trim() || GENERISK_PRODUSENT;
}

/** Every manufacturer in the registry, the starting catalogue's heading first. */
export function produsenter(liste: readonly Materiale[] = alleMaterialer()): string[] {
  const alle = [...new Set(liste.map(produsentAv))];
  return alle.sort((a, b) =>
    a === GENERISK_PRODUSENT ? -1 : b === GENERISK_PRODUSENT ? 1 : a.localeCompare(b, 'nb'),
  );
}

function normaliser(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** Search the registry over name, manufacturer, series, type, article number and notes. */
export function finnFilamenter(
  filter: Filamentfilter,
  liste: readonly Materiale[] = alleMaterialer(),
): Materiale[] {
  const ord = normaliser(filter.tekst ?? '')
    .split(/\s+/)
    .filter(Boolean);
  return liste.filter((m) => {
    if (filter.produsent && produsentAv(m) !== filter.produsent) return false;
    if (filter.type && m.type !== filter.type) return false;
    if (!ord.length) return true;
    const hoy = normaliser(
      [m.navn, m.egetNavn, m.produsent, m.serie, m.type, m.sku, m.spole, ...Object.values(m.metadata ?? {})]
        .filter(Boolean)
        .join(' '),
    );
    return ord.every((o) => hoy.includes(o));
  });
}

/** One line for lists and screen readers: «Lilla, PLA · Bambu Lab PLA Basic · AMS 2». */
export function filamentLinje(m: Materiale): string {
  const del = [`${visningsnavn(m)}, ${m.type}`];
  const kilde = [m.produsent, m.serie].filter(Boolean).join(' ');
  if (kilde) del.push(kilde);
  if (m.amsPlass) del.push(`AMS ${m.amsPlass}`);
  if (m.spole) del.push(m.spole);
  return del.join(' · ');
}

// ---------- colour groups ----------

export interface Fargegruppe {
  id: string;
  navn: string;
  /** Filament ids. */
  farger: string[];
}

export const MAKS_GRUPPER = 40;

export function hentGrupper(): Fargegruppe[] {
  return lesListe(NOKKEL_GRUPPER)
    .filter(
      (g): g is Fargegruppe =>
        !!g &&
        typeof (g as Fargegruppe).id === 'string' &&
        typeof (g as Fargegruppe).navn === 'string' &&
        Array.isArray((g as Fargegruppe).farger),
    )
    .map((g) => ({
      id: g.id,
      navn: g.navn.slice(0, 40),
      farger: [...new Set(g.farger.filter((x): x is string => typeof x === 'string'))],
    }));
}

/** Save a group (replacing one with the same name). */
export function lagreGruppe(navn: string, farger: readonly string[]): Fargegruppe | null {
  const n = navn.trim().slice(0, 40);
  if (!n || !farger.length) return null;
  const g: Fargegruppe = { id: `gr-${Date.now().toString(36)}`, navn: n, farger: [...new Set(farger)] };
  const andre = hentGrupper().filter((x) => x.navn.toLowerCase() !== n.toLowerCase());
  if (andre.length >= MAKS_GRUPPER) return null;
  return skrivListe(NOKKEL_GRUPPER, [...andre, g]) ? g : null;
}

export function slettGruppe(id: string): void {
  skrivListe(
    NOKKEL_GRUPPER,
    hentGrupper().filter((g) => g.id !== id),
  );
}

// ---------- in the project ----------

/** The own filaments among these ids, as the project should carry them. */
export function filamenterForProsjekt(ids: Iterable<string>): Materiale[] {
  const sett = new Set(ids);
  return alleMaterialer().filter((m) => m.egen && sett.has(m.id));
}

/** Make the filaments a project carries known (called when a project is opened). */
export function registrerProsjektfilamenter(dok: Dokument): void {
  const liste = (dok.parametre as { filamenter?: unknown }).filamenter;
  if (!Array.isArray(liste)) return;
  for (const raw of liste) {
    const f = rensFilament(raw);
    // the browser's own copy wins when both exist, so editing a filament here is seen in every project
    if (f && !erKjentMateriale(f.id)) registrerMateriale(f);
  }
}
