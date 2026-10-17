/**
 * The CSV workflow (Sivert, 2026-10-06, §24 to §35): its data and its rules,
 * without any screen. «Fra CSV» is a workflow, not a window: import the file,
 * read the columns, pick the master row, connect the columns to what they
 * control, design the master, choose the rows, validate, generate, and look
 * at the production plates. Nothing is generated until the user presses
 * «Generer».
 *
 * The work is kept in the project (`parametre.csvarbeid`): the table, the
 * connections, the chosen rows, the rows that have been generated, and the
 * local overrides per generated sign. The signs themselves are never stored;
 * they are always built from master, row and overrides, so a change to the
 * master reaches every sign (Sivert §31).
 */
import { type Dokument, type Objekt, type SvgKilde, type TekstKilde } from '../../core/dokument';
import type { Plateflytt } from './plateflytt';
import { feltNavn, feltObjekter, leggTilObjekt, nyTekst, nyttObjekt, oppdaterObjekter } from './dokument';
import { dekorValg, finnDekorFraTekst, type DekorValg } from './dekor';
import {
  alleProfiler,
  amsRekkefolge,
  erProfilkolonne,
  filamentkombinasjon,
  fordelPaPlater,
  finnProfil,
  foreslaKobling,
  lagVarianter,
  organiser,
  type Byggeplate,
  type Csv,
  type Kolonnemal,
  type Sortering,
  type Variant,
  type Varianttilvalg,
} from './batch';
import { finnOverstyringer, type Avvik, type Overstyringer } from './overstyring';
import { lastFonter, verdensBoks } from './modell';
import type { Fargeprofil } from './fargeprofiler';

/** More rows than this are not read (the project keeps the table). */
export const MAKS_RADER = 1000;

/**
 * Where the workflow is. There are three tabs (Sivert, 2026-10-08, §11): Importer, Koble and Generer.
 * `master` is the canvas between Koble and Generer, with no tab of its own. `rader` and `plater`
 * are the old names of what now lives in Importer and Generer; projects saved with them still open.
 */
export type Csvsteg = 'importer' | 'koble' | 'master' | 'rader' | 'generer' | 'plater';

/** The tabs, in order. */
export type Csvfane = 'importer' | 'koble' | 'generer';

export const CSVFANER: { id: Csvfane; navn: string; kort: string }[] = [
  { id: 'importer', navn: 'Importer CSV', kort: 'Importer' },
  { id: 'koble', navn: 'Koble kolonner', kort: 'Koble' },
  { id: 'generer', navn: 'Generer skilt', kort: 'Generer' },
];

/** The tab a step belongs to, or null on the canvas (the master has no tab). */
export function faneFor(steg: Csvsteg): Csvfane | null {
  if (steg === 'rader') return 'importer';
  if (steg === 'plater') return 'generer';
  return steg === 'master' ? null : steg;
}

/** A step as it is called in the window title. */
export const STEGNAVN: Record<Csvsteg, string> = {
  importer: 'Importer CSV',
  koble: 'Koble kolonner',
  master: 'Design masteren',
  rader: 'Importer CSV',
  generer: 'Generer skilt',
  plater: 'Generer skilt',
};

/** What an own column holds: a decoration or a colour profile per row. */
export type Egenkolonne = 'dekor' | 'profil';

/** How the signs are built and laid out; saved with the work. */
export interface Csvvalg {
  /** Keep the master's gaps inside text groups. */
  holdAvstand: boolean;
  /** Keep holes, decorations and other free objects at their distance from the name. */
  holdHull: boolean;
  /** Let a plate round the name grow and shrink with it, and keep the holes' distance to its edge. */
  tilpassSkilt: boolean;
  sortering: Sortering;
  /** The column the alphabetical order follows. */
  sorterKolonne: number;
}

export const STANDARDVALG: Csvvalg = {
  holdAvstand: true,
  holdHull: true,
  tilpassSkilt: true,
  sortering: 'csv',
  sorterKolonne: 0,
};

export interface Csvarbeid {
  versjon: 1;
  /** The furthest step reached; the work resumes there. */
  steg: Csvsteg;
  valg: Csvvalg;
  /** File name, or «innlimt tekst». */
  kilde: string;
  kolonner: string[];
  rader: string[][];
  /** What each column controls. */
  kobling: Kolonnemal[];
  /** The columns taken forward (column indexes); the others are left out of the connecting and the signs. */
  valgteKolonner: number[];
  /** Columns the user added in Koble (index to kind): a decoration or colour profile per row. */
  egne: Record<number, Egenkolonne>;
  /** The row the master is designed from (the first by default, §25). */
  masterRad: number;
  /** The rows chosen for generation (row indexes, ascending). */
  valgte: number[];
  /** The rows generated so far (row indexes, ascending). */
  generert: number[];
  /** Local overrides per generated sign, by row index. */
  overstyringer: Record<number, Overstyringer>;
  /** Signs the user has moved on the build plate: offset (mm) from where the automatic packing puts them, by row. */
  plateflytt: Plateflytt;
}

export interface CsvInstans {
  rad: number;
  /** The master (with the CSV work) the user returns to. */
  master: Dokument;
}

// ---------- in the project ----------

/** The CSV work of a project, if there is one that holds up. */
export function lesArbeid(dok: Dokument): Csvarbeid | null {
  const a = (dok.parametre as { csvarbeid?: Csvarbeid }).csvarbeid;
  if (!a || a.versjon !== 1 || !Array.isArray(a.kolonner) || !Array.isArray(a.rader)) return null;
  return {
    ...a,
    steg: a.steg ?? 'koble',
    // keep the saved objects when they are complete, so a screen that compares them can tell nothing changed
    valg:
      a.valg && Object.keys(STANDARDVALG).every((k) => k in a.valg)
        ? a.valg
        : { ...STANDARDVALG, ...(a.valg ?? {}) },
    kobling:
      a.kobling?.length === a.kolonner.length && a.kobling.every(Boolean)
        ? a.kobling
        : a.kolonner.map((_, i) => a.kobling?.[i] ?? { type: 'ingen' }),
    valgteKolonner: a.valgteKolonner ?? a.kolonner.map((_, i) => i),
    egne: a.egne ?? {},
    valgte: a.valgte ?? [],
    generert: a.generert ?? [],
    overstyringer: a.overstyringer ?? {},
    plateflytt: a.plateflytt ?? {},
    masterRad: Math.min(Math.max(0, a.masterRad ?? 0), Math.max(0, a.rader.length - 1)),
  };
}

export function settArbeid(dok: Dokument, a: Csvarbeid | null): Dokument {
  const { csvarbeid: _bort, ...rest } = dok.parametre as Record<string, unknown>;
  void _bort;
  return { ...dok, parametre: a ? { ...rest, csvarbeid: a } : rest };
}

export function lesInstans(dok: Dokument): CsvInstans | null {
  const i = (dok.parametre as { csvinstans?: CsvInstans }).csvinstans;
  return i && typeof i.rad === 'number' && i.master ? i : null;
}

/** The master as signs are built from it: without the CSV work riding along on every sign. */
export function rentDokument(dok: Dokument): Dokument {
  const { csvarbeid: _a, csvinstans: _i, ...rest } = dok.parametre as Record<string, unknown>;
  void _a;
  void _i;
  return rest === dok.parametre ? dok : { ...dok, parametre: rest };
}

export const tilCsv = (a: Csvarbeid): Csv => ({ kolonner: a.kolonner, rader: a.rader });

// ---------- reading the columns ----------

/** The name of the master field a new text gets for a column. */
export function feltnavnFraKolonne(kolonne: string): string {
  return kolonne.trim().toLowerCase();
}

/** Columns that name a vector: they need a decoration field made on the master first. */
const DEKORKOLONNE = /^(logo|logoer|symbol|ikon|icon|dekor|pynt|svg|motiv)$/i;

export const erDekorkolonne = (kolonne: string) => DEKORKOLONNE.test(kolonne.trim());

/**
 * First guess at what each column controls: a field the master already has,
 * a layer or outline colour, the colour profile, or else a new text field
 * for the column (the text of the master row is put in it). Empty columns
 * and columns that name a vector are left out.
 */
export function foreslaFlytkobling(csv: Csv, dok: Dokument): Kolonnemal[] {
  const forslag = foreslaKobling(csv, dok);
  return forslag.map((k, i) => {
    if (k.type !== 'ingen') return k;
    const navn = csv.kolonner[i] ?? '';
    if (erProfilkolonne(navn) || erDekorkolonne(navn)) return k;
    if (!csv.rader.some((r) => (r[i] ?? '').trim())) return k;
    return { type: 'felt', felt: feltnavnFraKolonne(navn) };
  });
}

/** A fresh piece of CSV work from a parsed file. */
export function nyttArbeid(csv: Csv, kilde: string, dok: Dokument): Csvarbeid {
  return {
    versjon: 1,
    steg: 'koble',
    valg: STANDARDVALG,
    kilde,
    kolonner: csv.kolonner,
    rader: csv.rader,
    kobling: foreslaFlytkobling(csv, dok),
    valgteKolonner: csv.kolonner.map((_, i) => i),
    egne: {},
    masterRad: 0,
    valgte: csv.rader.map((_, i) => i),
    generert: [],
    overstyringer: {},
    plateflytt: {},
  };
}

// ---------- choosing and adding columns ----------

/** What a column controls when it is taken forward: the first guess, or what an own column is made for. */
function standardKobling(a: Csvarbeid, dok: Dokument, i: number): Kolonnemal {
  const egen = a.egne[i];
  if (egen === 'profil') return { type: 'profil' };
  if (egen === 'dekor') return { type: 'felt', felt: feltnavnFraKolonne(a.kolonner[i] ?? '') };
  return foreslaFlytkobling(tilCsv(a), dok)[i] ?? { type: 'ingen' };
}

/** Take columns forward, or leave them out. A column left out controls nothing. */
export function velgKolonner(
  a: Csvarbeid,
  dok: Dokument,
  kolonner: readonly number[],
  paa: boolean,
): Csvarbeid {
  const valgt = new Set(a.valgteKolonner);
  const kobling = [...a.kobling];
  for (const i of kolonner) {
    if (paa) {
      if (valgt.has(i)) continue;
      valgt.add(i);
      kobling[i] = standardKobling(a, dok, i);
    } else {
      valgt.delete(i);
      kobling[i] = { type: 'ingen' };
    }
  }
  return { ...a, valgteKolonner: [...valgt].sort((x, y) => x - y), kobling };
}

/** A name that no other column has, with a number after it when it is taken. */
function ledigKolonnenavn(a: Pick<Csvarbeid, 'kolonner'>, onsket: string): string {
  const grunn = onsket.trim() || 'Kolonne';
  const har = new Set(a.kolonner.map((k) => k.trim().toLowerCase()));
  if (!har.has(grunn.toLowerCase())) return grunn;
  let n = 2;
  while (har.has(`${grunn} ${n}`.toLowerCase())) n++;
  return `${grunn} ${n}`;
}

/**
 * Add a column of our own to the table (§11): a decoration or a colour profile per row. The cells start
 * empty and are chosen in Koble. A decoration column fills a decoration field on the master.
 */
export function leggTilEgenKolonne(a: Csvarbeid, onsket: string, type: Egenkolonne): Csvarbeid {
  const navn = ledigKolonnenavn(a, onsket);
  const i = a.kolonner.length;
  const brukteFelt = new Set(a.kobling.flatMap((k) => (k.type === 'felt' ? [k.felt] : [])));
  let felt = feltnavnFraKolonne(navn);
  for (let n = 2; brukteFelt.has(felt); n++) felt = `${feltnavnFraKolonne(navn)}${n}`;
  const kobling: Kolonnemal = type === 'profil' ? { type: 'profil' } : { type: 'felt', felt };
  return {
    ...a,
    kolonner: [...a.kolonner, navn],
    rader: a.rader.map((r) => [...r, '']),
    kobling: [...a.kobling, kobling],
    valgteKolonner: [...a.valgteKolonner, i],
    egne: { ...a.egne, [i]: type },
  };
}

/** Take away a column the user added. Columns from the file are left out instead (`velgKolonner`). */
export function fjernEgenKolonne(a: Csvarbeid, i: number): Csvarbeid {
  if (!a.egne[i]) return a;
  const om = (n: number) => (n > i ? n - 1 : n);
  return {
    ...a,
    kolonner: a.kolonner.filter((_, j) => j !== i),
    rader: a.rader.map((r) => r.filter((_, j) => j !== i)),
    kobling: a.kobling.filter((_, j) => j !== i),
    valgteKolonner: a.valgteKolonner.filter((j) => j !== i).map(om),
    egne: Object.fromEntries(
      Object.entries(a.egne)
        .filter(([j]) => Number(j) !== i)
        .map(([j, t]) => [om(Number(j)), t]),
    ),
    valg: {
      ...a.valg,
      sorterKolonne: a.valg.sorterKolonne === i ? 0 : om(a.valg.sorterKolonne),
    },
  };
}

/** Change one cell of the table (a decoration or a colour profile for one row). */
export function settCelle(a: Csvarbeid, rad: number, kolonne: number, verdi: string): Csvarbeid {
  return {
    ...a,
    rader: a.rader.map((r, i) => {
      if (i !== rad) return r;
      const ny = [...r];
      while (ny.length < a.kolonner.length) ny.push('');
      ny[kolonne] = verdi;
      return ny;
    }),
  };
}

/** Give every chosen row the same value in one column (for a start before the exceptions). */
export function settKolonne(
  a: Csvarbeid,
  kolonne: number,
  verdi: string,
  rader: readonly number[],
): Csvarbeid {
  return rader.reduce((x, r) => settCelle(x, r, kolonne, verdi), a);
}

/** The decoration a column names first: on the master row, else on the first row that names one. */
export function dekorForKolonne(a: Csvarbeid, kolonne: number): DekorValg | undefined {
  for (const r of [a.masterRad, ...a.rader.keys()]) {
    const v = finnDekorFraTekst(a.rader[r]?.[kolonne] ?? '');
    if (v) return v;
  }
  return undefined;
}

/**
 * Give one row another colour profile without touching the master or the other rows: the cell of the
 * profile column changes. When the table has no profile column yet, one is added.
 */
export function settProfilForRad(a: Csvarbeid, rad: number, profilnavn: string): Csvarbeid {
  let x = a;
  let kol = x.kobling.findIndex((k, i) => k.type === 'profil' && x.valgteKolonner.includes(i));
  if (kol < 0) {
    x = leggTilEgenKolonne(x, 'Fargeprofil', 'profil');
    kol = x.kolonner.length - 1;
  }
  return settCelle(x, rad, kol, profilnavn);
}

/** The colour profile column the table has, if it has one. */
export function profilkolonne(a: Csvarbeid): number {
  return a.kobling.findIndex((k, i) => k.type === 'profil' && a.valgteKolonner.includes(i));
}

/** What a row's sign shows in the plate view: its name, its decorations and its colour profile. */
export function skiltinfo(
  a: Csvarbeid,
  dok: Dokument,
  rad: number,
): { navn: string; dekor: string[]; profil: string } {
  const r = a.rader[rad] ?? [];
  const navn: string[] = [];
  const dekor: string[] = [];
  let profil = '';
  for (const i of a.valgteKolonner) {
    const v = (r[i] ?? '').trim();
    if (!v) continue;
    const type = kolonnetype(a, dok, i);
    if (type === 'tekst') navn.push(v);
    else if (type === 'dekor') dekor.push(v);
    else if (type === 'profil' && !profil) profil = v;
  }
  return { navn: navn[0] ?? `Rad ${rad + 1}`, dekor, profil };
}

/** The names a decoration column's cells can have: the gallery. */
export const dekornavn = (): string[] => dekorValg().map((d) => d.navn);

/** Which kind a connected column is: a plain text, a decoration, a colour, or a colour profile. */
export function kolonnetype(
  a: Csvarbeid,
  dok: Dokument,
  i: number,
): 'tekst' | 'dekor' | 'farge' | 'profil' | 'ingen' {
  const k = a.kobling[i];
  if (!k || k.type === 'ingen') return 'ingen';
  if (k.type === 'farge' || k.type === 'profil') return k.type;
  const dekor =
    a.egne[i] === 'dekor' ||
    (feltObjekter(dok).some((o) => feltNavn(o) === k.felt && o.kilde.type === 'svg') &&
      !feltObjekter(dok).some((o) => feltNavn(o) === k.felt && o.kilde.type === 'tekst'));
  return dekor ? 'dekor' : 'tekst';
}

// ---------- the master ----------

/** Text fields the connections need that the master does not have yet. */
export function nyeFelt(dok: Dokument, kobling: readonly Kolonnemal[]): string[] {
  const har = new Set(feltObjekter(dok).map((o) => feltNavn(o)));
  return [...new Set(kobling.flatMap((k) => (k.type === 'felt' && !har.has(k.felt) ? [k.felt] : [])))];
}

/**
 * The fields the master lacks and can be given now: texts always, decorations only once a row names one
 * (the master needs a decoration to stand in for the others).
 */
export function nyeFeltFor(dok: Dokument, a: Csvarbeid): string[] {
  return nyeFelt(dok, a.kobling).filter((f) => {
    const i = a.kobling.findIndex((k) => k.type === 'felt' && k.felt === f);
    return a.egne[i] !== 'dekor' || !!dekorForKolonne(a, i);
  });
}

/** Does the master still hold only the starting text, with no field? Then the first new field takes its place. */
function bareStartteksten(dok: Dokument): Objekt | null {
  const tekster = Object.values(dok.objekter).filter((o) => o.kilde.type === 'tekst');
  return tekster.length === 1 && !feltNavn(tekster[0]!) ? tekster[0]! : null;
}

/**
 * Get the master ready: every text field a column points at exists, and the
 * texts, colours and profile of the master row are put in it, so the master
 * shows the example the user designs from (§25). New fields are stacked
 * under the text that is there; the user places them. Text layers and
 * outlines are the master's own.
 */
export async function klargjorMaster(dok: Dokument, a: Csvarbeid): Promise<Dokument> {
  let d = dok;
  const rad = a.rader[a.masterRad] ?? [];
  await lastFonter(d);
  const mangler = nyeFeltFor(d, a);
  const verdiFor = (felt: string) => {
    const i = a.kobling.findIndex((k) => k.type === 'felt' && k.felt === felt);
    return (i >= 0 ? rad[i] : '') ?? '';
  };
  for (const felt of mangler) {
    const kol = a.kobling.findIndex((k) => k.type === 'felt' && k.felt === felt);
    if (a.egne[kol] === 'dekor') {
      // a decoration column: the master gets one decoration to stand in for the others, beside what is there
      const valg = dekorForKolonne(a, kol);
      if (!valg) continue;
      const ny = valg.lag();
      const skala = 16 / Math.max(ny.bredde, ny.hoyde, 1);
      const alle = Object.values(d.objekter).map((o) => verdensBoks(o));
      const hoyre = alle.length ? Math.max(...alle.map((b) => b.maksX)) : 0;
      const midtY = alle.length
        ? (Math.min(...alle.map((b) => b.minY)) + Math.max(...alle.map((b) => b.maksY))) / 2
        : 0;
      const lagId = (d.lag.find((l) => l.tekstlag) ?? d.lag.at(-1)!).id;
      d = leggTilObjekt(
        d,
        nyttObjekt(
          lagId,
          { ...(ny.kilde as SvgKilde), felt },
          { x: hoyre + 8 + (ny.bredde * skala) / 2, y: midtY, skalaX: skala, skalaY: skala },
          `Dekor «${valg.navn}»`,
        ),
      );
      continue;
    }
    const start = bareStartteksten(d);
    if (start) {
      d = oppdaterObjekter(d, [start.id], (o) => ({
        ...o,
        kilde: { ...(o.kilde as TekstKilde), felt, tekst: verdiFor(felt) },
      }));
      continue;
    }
    const tekstlag = d.lag.find((l) => l.tekstlag) ?? d.lag.at(-1)!;
    const tekster = Object.values(d.objekter).filter((o) => o.kilde.type === 'tekst');
    const storrelse = tekster.length
      ? Math.max(6, (tekster.at(-1)!.kilde as TekstKilde).storrelse * 0.7)
      : 14;
    const under = tekster.length ? Math.min(...tekster.map((o) => o.transform.y)) - storrelse * 1.4 : 0;
    const ny = nyttObjekt(tekstlag.id, { ...nyTekst(verdiFor(felt), storrelse), felt }, { y: under });
    d = leggTilObjekt(d, ny);
  }
  // the master row's colours, profile and decorations, but not the spacing rules: the master is the original
  const v = lagVarianter(rentDokument(d), tilCsv(a), a.kobling, {
    rader: [a.masterRad],
    gruppeavstand: false,
    hullavstand: false,
    tilpassSkilt: false,
  })[0];
  if (!v) return d;
  return settArbeid({ ...v.dok, navn: dok.navn, id: dok.id }, a);
}

// ---------- choosing rows ----------

export type Radvisning = 'alle' | 'valgte' | 'ikke-valgte' | 'problemer';

export interface Radfilter {
  sok: string;
  visning: Radvisning;
}

const enkel = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** The rows that show with this search and filter (row indexes). `problemRader` is known once validation has run. */
export function synligeRader(
  a: Pick<Csvarbeid, 'rader'>,
  filter: Radfilter,
  valgte: ReadonlySet<number>,
  problemRader?: ReadonlySet<number>,
): number[] {
  const ord = enkel(filter.sok).split(/\s+/).filter(Boolean);
  const ut: number[] = [];
  a.rader.forEach((r, i) => {
    if (filter.visning === 'valgte' && !valgte.has(i)) return;
    if (filter.visning === 'ikke-valgte' && valgte.has(i)) return;
    if (filter.visning === 'problemer' && !problemRader?.has(i)) return;
    if (ord.length) {
      const hoy = enkel(r.join(' '));
      if (!ord.every((o) => hoy.includes(o))) return;
    }
    ut.push(i);
  });
  return ut;
}

const sortert = (s: ReadonlySet<number>) => [...s].sort((x, y) => x - y);

/** Select (or deselect) every row in `rader`. */
export function sett(valgte: ReadonlySet<number>, rader: readonly number[], paa: boolean): number[] {
  const n = new Set(valgte);
  for (const i of rader) {
    if (paa) n.add(i);
    else n.delete(i);
  }
  return sortert(n);
}

/** Flip the selection of the rows in `rader`. */
export function inverter(valgte: ReadonlySet<number>, rader: readonly number[]): number[] {
  const n = new Set(valgte);
  for (const i of rader) {
    if (n.has(i)) n.delete(i);
    else n.add(i);
  }
  return sortert(n);
}

/** Shift-click: every row between two clicked rows, in the order shown, gets the state of the last click. */
export function velgOmrade(
  valgte: ReadonlySet<number>,
  visning: readonly number[],
  fra: number,
  til: number,
  paa: boolean,
): number[] {
  const a = visning.indexOf(fra);
  const b = visning.indexOf(til);
  if (a < 0 || b < 0) return sortert(valgte);
  return sett(valgte, visning.slice(Math.min(a, b), Math.max(a, b) + 1), paa);
}

// ---------- validating ----------

export interface Kontroll {
  id: string;
  ok: boolean;
  tekst: string;
  /** What to do or which rows, when the check fails. */
  detalj?: string;
}

/** The colour profile names the chosen rows mention that do not exist. */
export function ukjenteProfiler(
  a: Csvarbeid,
  rader: readonly number[],
  profiler: readonly Fargeprofil[] = alleProfiler(),
): string[] {
  const kol = a.kobling.flatMap((k, i) => (k.type === 'profil' ? [i] : []));
  const navn = new Set<string>();
  for (const r of rader) {
    for (const i of kol) {
      const v = (a.rader[r]?.[i] ?? '').trim();
      if (v && !finnProfil(v, profiler)) navn.add(v);
    }
  }
  return [...navn];
}

export interface Validering {
  kontroller: Kontroll[];
  /** Chosen rows with problems (row indexes). */
  problemrader: number[];
  /** Generation may start. */
  klar: boolean;
}

/**
 * The checks before «Generer» (§29): the mapping is right, the master is
 * done, rows are chosen, the colour profiles exist, and no chosen row has a
 * problem. `varianter` are the chosen rows built from the master.
 */
export function valider(
  master: Dokument,
  a: Csvarbeid,
  varianter: readonly Variant[],
  profiler: readonly Fargeprofil[] = alleProfiler(),
): Validering {
  const kontroller: Kontroll[] = [];
  const legg = (id: string, ok: boolean, tekst: string, detalj?: string) =>
    kontroller.push({ id, ok, tekst, ...(detalj ? { detalj } : {}) });

  legg(
    'csv',
    a.rader.length > 0,
    `${a.rader.length} rader er lest fra ${a.kilde}`,
    'Importer en CSV-fil først.',
  );

  const styrer = a.kobling.filter((k) => k.type !== 'ingen');
  legg(
    'kobling',
    styrer.length > 0,
    `${styrer.length} av ${a.kolonner.length} kolonner styrer noe på skiltet`,
    'Koble minst én kolonne til en tekst, et dekor, en farge eller en fargeprofil.',
  );

  const felt = new Set(feltObjekter(master).map((o) => feltNavn(o)));
  const manglende = [
    ...new Set(a.kobling.flatMap((k) => (k.type === 'felt' && !felt.has(k.felt) ? [k.felt] : []))),
  ];
  const dobbelt = [
    ...new Set(
      a.kobling.flatMap((k, i) =>
        k.type === 'felt' && a.kobling.findIndex((x) => x.type === 'felt' && x.felt === k.felt) !== i
          ? [k.felt]
          : [],
      ),
    ),
  ];
  const lagFinnes = a.kobling.every(
    (k) =>
      k.type !== 'farge' ||
      master.lag.some((l) => l.id === k.lagId || l.omriss?.some((o) => o.id === k.lagId)),
  );
  legg(
    'felt',
    !manglende.length && !dobbelt.length && lagFinnes,
    'Kolonnene peker på ting som finnes på masteren',
    manglende.length
      ? `Masteren mangler feltene ${manglende.map((f) => `«${f}»`).join(', ')}. Gå til Koble og legg dem inn på masteren.`
      : dobbelt.length
        ? `Flere kolonner styrer samme felt: ${dobbelt.map((f) => `«${f}»`).join(', ')}.`
        : 'En fargekolonne peker på et lag eller omriss som er slettet.',
  );

  legg(
    'master',
    Object.keys(master.objekter).length > 0,
    'Masteren har innhold',
    'Legg til tekst eller former på masteren.',
  );

  legg(
    'valgte',
    a.valgte.length > 0,
    `${a.valgte.length} rader er valgt`,
    'Velg minst én rad som skal genereres.',
  );

  const ukjent = ukjenteProfiler(a, a.valgte, profiler);
  legg(
    'profiler',
    !ukjent.length,
    'Fargeprofilene i de valgte radene finnes',
    `Ukjent: ${ukjent.map((n) => `«${n}»`).join(', ')}. Lag profilen i Fargeprofil, eller rett cellen.`,
  );

  const problemrader = varianter.filter((v) => v.problemer.length).map((v) => v.indeks);
  legg(
    'rader',
    !problemrader.length,
    problemrader.length
      ? `${problemrader.length} valgte rader har problemer`
      : 'Ingen av de valgte radene har problemer',
    'Rett radene, eller fjern dem fra utvalget.',
  );

  return { kontroller, problemrader, klar: kontroller.every((k) => k.ok) };
}

/** The short picture before «Generer»: how many rows, how many designs, and what is missing. */
export interface Genererstatus {
  rader: number;
  /** Different combinations of decoration and colour profile among the chosen rows (at least one). */
  design: number;
  /** What is missing, in plain words; empty when generating can start. */
  mangler: string[];
}

export function genererstatus(master: Dokument, a: Csvarbeid, v: Validering | null): Genererstatus {
  const kol = a.kobling.flatMap((k, i) =>
    a.valgteKolonner.includes(i) && (k.type === 'profil' || a.egne[i] === 'dekor') ? [i] : [],
  );
  const design = new Set(
    a.valgte.map((r) => kol.map((i) => (a.rader[r]?.[i] ?? '').trim().toLowerCase()).join('|')),
  );
  const mangler: string[] = [];
  if (!a.valgte.length) mangler.push('Ingen rader er valgt. Velg rader under Importer.');
  if (!a.kobling.some((k) => k.type !== 'ingen')) mangler.push('Ingen kolonner er koblet. Gå til Koble.');
  if (v) {
    for (const k of v.kontroller) {
      if (k.ok || k.id === 'valgte' || k.id === 'kobling') continue;
      if (k.id === 'rader') mangler.push(`${v.problemrader.length} av radene har problemer.`);
      else mangler.push(k.detalj ?? k.tekst);
    }
  }
  return { rader: a.valgte.length, design: Math.max(1, design.size), mangler };
}

// ---------- generating and the signs ----------

/** The options every build of the signs shares. */
export function byggvalg(a: Csvarbeid, rader: readonly number[], v: Varianttilvalg = {}): Varianttilvalg {
  return { ...v, rader, overstyringer: a.overstyringer };
}

/** Build the signs of these rows from the master, the row and the overrides. Fonts must be loaded (`lastFonter`). */
export function bygSkilt(
  master: Dokument,
  a: Csvarbeid,
  rader: readonly number[],
  v: Varianttilvalg = {},
): Variant[] {
  return lagVarianter(rentDokument(master), tilCsv(a), a.kobling, {
    gruppeavstand: a.valg.holdAvstand,
    hullavstand: a.valg.holdHull,
    tilpassSkilt: a.valg.tilpassSkilt,
    ...byggvalg(a, rader, v),
  });
}

/** Build one sign from the master and the row only, as the baseline an edit is compared with. */
export function grunnskilt(
  master: Dokument,
  a: Csvarbeid,
  rad: number,
  v: Varianttilvalg = {},
): Variant | undefined {
  return lagVarianter(rentDokument(master), tilCsv(a), a.kobling, {
    gruppeavstand: a.valg.holdAvstand,
    hullavstand: a.valg.holdHull,
    tilpassSkilt: a.valg.tilpassSkilt,
    ...v,
    rader: [rad],
  })[0];
}

/** Press «Generer»: the chosen rows become signs. Rows generated before stay. */
export function generer(a: Csvarbeid, rader: readonly number[]): Csvarbeid {
  // more signs change the packing, so the offsets from the old packing no longer fit
  return { ...a, generert: sortert(new Set([...a.generert, ...rader])), plateflytt: {} };
}

// ---------- overrides ----------

const utenTom = (o: Record<number, Overstyringer>): Record<number, Overstyringer> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => Object.keys(v).length > 0)) as Record<
    number,
    Overstyringer
  >;

export function settOverstyringer(a: Csvarbeid, rad: number, ov: Overstyringer): Csvarbeid {
  return { ...a, overstyringer: utenTom({ ...a.overstyringer, [rad]: ov }) };
}

/** Back to the master for one value of one sign. */
export function tilbakestillOverstyring(a: Csvarbeid, rad: number, nokkel: string): Csvarbeid {
  const { [nokkel]: _bort, ...rest } = a.overstyringer[rad] ?? {};
  void _bort;
  return settOverstyringer(a, rad, rest);
}

/** Back to the master for the whole sign. */
export function tilbakestillSkilt(a: Csvarbeid, rad: number): Csvarbeid {
  return settOverstyringer(a, rad, {});
}

export const antallOverstyringer = (a: Csvarbeid, rad: number) =>
  Object.keys(a.overstyringer[rad] ?? {}).length;

/**
 * Take what the user changed on an opened sign and keep it as overrides on
 * that sign. `redigert` is the sign as left, `grunn` the same sign from
 * master and row only. Returns the new work and what could not be kept.
 */
export function lagreRedigertSkilt(
  a: Csvarbeid,
  rad: number,
  grunn: Dokument,
  redigert: Dokument,
): { arbeid: Csvarbeid; avvik: Avvik } {
  const avvik = finnOverstyringer(rentDokument(grunn), rentDokument(redigert));
  return { arbeid: settOverstyringer(a, rad, avvik.overstyringer), avvik };
}

// ---------- production plates ----------

export interface Produksjonsplate extends Byggeplate {
  /** The actual filaments on this plate (ids, sorted): every sign on it needs exactly these. */
  kombinasjon: string[];
}

/**
 * Sort the signs onto plates by filament combination (§33): signs that need
 * the same filaments share plates, signs that need others do not, whatever
 * the colours look like. The combination with most signs comes first. Throws
 * when a sign is larger than the plate.
 */
export function lagProduksjonsplater(
  varianter: Variant[],
  plate: { bredde: number; dybde: number },
  avstand = 5,
  sortering: Sortering = 'csv',
  sorterKolonne = 0,
): Produksjonsplate[] {
  const grupper = organiser(varianter, sortering, 'farger', sorterKolonne)
    .map((g, i) => ({ g, i }))
    .sort((x, y) => y.g.length - x.g.length || x.i - y.i)
    .map((x) => x.g);
  const ut: Produksjonsplate[] = [];
  for (const g of grupper) {
    for (const p of fordelPaPlater([g], plate, avstand)) {
      ut.push({ ...p, nummer: ut.length + 1, kombinasjon: amsRekkefolge(filamentkombinasjon(g[0]!)) });
    }
  }
  return ut;
}
