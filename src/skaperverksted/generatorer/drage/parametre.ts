/**
 * Dragon generator parameters: the part system (spec: skaperverksted.md,
 * "Articulated dragon generator"). Stored in `Dokument.parametre` as plain
 * JSON. `lesParametre` is the only way in: it fills defaults, drops unknown
 * variants and enforces the size limits, so old or hand-edited projects
 * always build.
 */
import { materialer } from '../../core/materialer';

export type Kroppsvariant = 'lubben' | 'slank' | 'lang';
export type Hodevariant = 'rund' | 'lang' | 'bred';
export type Hornvariant = 'ingen' | 'sma' | 'lange' | 'buede';
export type Piggvariant = 'ingen' | 'runde' | 'spisse' | 'plater';
export type Halevariant = 'spiss' | 'spade' | 'kolle';
export type Vingevariant = 'ingen' | 'sma' | 'store' | 'flaggermus';
export type Monster = 'rygg' | 'ensfarget' | 'striper';
export type Oyevariant = 'runde' | 'store' | 'sovende';

/** Colour zones the customer chooses materials for. */
export type Fargesone = 'kropp' | 'aksent' | 'vinger' | 'oyne';

export interface DrageParametre {
  kropp: Kroppsvariant;
  hode: Hodevariant;
  horn: Hornvariant;
  pigger: Piggvariant;
  hale: Halevariant;
  vinger: Vingevariant;
  monster: Monster;
  /** Overall length nose to tail tip, mm. */
  lengde: number;
  farger: Record<Fargesone, string>;
  detaljer: {
    oyne: Oyevariant;
    bein: boolean;
    klor: boolean;
    vingeribber: boolean;
  };
}

export const LENGDE_MIN = 100;
export const LENGDE_MAKS = 240;

export interface Variant<T extends string> {
  id: T;
  navn: string;
  beskrivelse: string;
}

function v<T extends string>(id: T, navn: string, beskrivelse: string): Variant<T> {
  return { id, navn, beskrivelse };
}

/** The part catalogue shown in the pickers, in display order. */
export const katalog = {
  kropp: [
    v<Kroppsvariant>('lubben', 'Lubben', 'Kort og god, med stort hode.'),
    v<Kroppsvariant>('slank', 'Slank', 'Smalere kropp og lengre hale.'),
    v<Kroppsvariant>('lang', 'Lang', 'Flest ledd. Slynger seg mest.'),
  ],
  hode: [
    v<Hodevariant>('rund', 'Rundt', 'Rundt hode med kort snute.'),
    v<Hodevariant>('lang', 'Langt', 'Lang snute, mer klassisk drage.'),
    v<Hodevariant>('bred', 'Bredt', 'Bredt og flatt, som en frosk med vinger.'),
  ],
  horn: [
    v<Hornvariant>('ingen', 'Ingen', 'Glatt hode.'),
    v<Hornvariant>('sma', 'Små', 'To korte horn.'),
    v<Hornvariant>('lange', 'Lange', 'To lange horn som peker bakover.'),
    v<Hornvariant>('buede', 'Buede', 'Horn som bøyer seg bakover.'),
  ],
  pigger: [
    v<Piggvariant>('ingen', 'Ingen', 'Glatt rygg.'),
    v<Piggvariant>('runde', 'Runde', 'Myke knotter langs ryggen.'),
    v<Piggvariant>('spisse', 'Spisse', 'Små spisse pigger.'),
    v<Piggvariant>('plater', 'Plater', 'Tynne ryggplater.'),
  ],
  hale: [
    v<Halevariant>('spade', 'Spade', 'Flat pilspiss ytterst på halen.'),
    v<Halevariant>('spiss', 'Spiss', 'Halen smalner av til en spiss.'),
    v<Halevariant>('kolle', 'Kølle', 'Rund kølle med pigger.'),
  ],
  vinger: [
    v<Vingevariant>('ingen', 'Ingen', 'En drage uten vinger.'),
    v<Vingevariant>('sma', 'Små', 'Små, runde vinger.'),
    v<Vingevariant>('store', 'Store', 'Store vinger med tre spisser.'),
    v<Vingevariant>('flaggermus', 'Flaggermus', 'Vinger med fingre og buet kant.'),
  ],
  monster: [
    v<Monster>('rygg', 'Rygg', 'Pigger, horn og haletupp i aksentfargen.'),
    v<Monster>('ensfarget', 'Ensfarget', 'Hele kroppen i én farge.'),
    v<Monster>('striper', 'Striper', 'Annethvert ledd i aksentfargen.'),
  ],
  oyne: [
    v<Oyevariant>('runde', 'Runde', 'Runde øyne.'),
    v<Oyevariant>('store', 'Store', 'Store, søte øyne.'),
    v<Oyevariant>('sovende', 'Søvnige', 'Halvlukkede øyne.'),
  ],
} as const;

export const soner: { id: Fargesone; navn: string }[] = [
  { id: 'kropp', navn: 'Kropp' },
  { id: 'aksent', navn: 'Aksent' },
  { id: 'vinger', navn: 'Vinger' },
  { id: 'oyne', navn: 'Øyne' },
];

/** The mascot direction: purple, dark blue and beige (spec). */
export const standardParametre: DrageParametre = {
  kropp: 'lubben',
  hode: 'rund',
  horn: 'sma',
  pigger: 'spisse',
  hale: 'spade',
  vinger: 'sma',
  monster: 'rygg',
  lengde: 160,
  farger: { kropp: 'pla-lilla', aksent: 'matt-marine', vinger: 'matt-sand', oyne: 'pla-svart' },
  detaljer: { oyne: 'store', bein: true, klor: true, vingeribber: true },
};

export interface Forhandsvalg {
  id: string;
  navn: string;
  parametre: DrageParametre;
}

export const forhandsvalg: Forhandsvalg[] = [
  { id: 'maskot', navn: 'Maskoten', parametre: standardParametre },
  {
    id: 'natt',
    navn: 'Nattdrage',
    parametre: {
      ...standardParametre,
      kropp: 'slank',
      hode: 'lang',
      horn: 'buede',
      pigger: 'plater',
      vinger: 'flaggermus',
      hale: 'spiss',
      farger: { kropp: 'matt-marine', aksent: 'pla-cyan', vinger: 'pla-grafitt', oyne: 'pla-signal' },
      detaljer: { ...standardParametre.detaljer, oyne: 'runde' },
    },
  },
  {
    id: 'sand',
    navn: 'Ørkendrage',
    parametre: {
      ...standardParametre,
      kropp: 'lang',
      hode: 'bred',
      horn: 'lange',
      pigger: 'runde',
      vinger: 'ingen',
      hale: 'kolle',
      monster: 'striper',
      farger: { kropp: 'matt-sand', aksent: 'pla-rust', vinger: 'matt-sand', oyne: 'pla-grafitt' },
      detaljer: { ...standardParametre.detaljer, oyne: 'sovende' },
    },
  },
];

function velg<T extends string>(liste: readonly Variant<T>[], verdi: unknown, standard: T): T {
  return liste.some((x) => x.id === verdi) ? (verdi as T) : standard;
}

function materialId(verdi: unknown, standard: string): string {
  return typeof verdi === 'string' && materialer.some((m) => m.id === verdi) ? verdi : standard;
}

export function begrensLengde(lengde: number): number {
  if (!Number.isFinite(lengde)) return standardParametre.lengde;
  return Math.min(LENGDE_MAKS, Math.max(LENGDE_MIN, lengde));
}

/** Read parameters from a document, with defaults and limits applied. */
export function lesParametre(raa: Record<string, unknown> | undefined): DrageParametre {
  const r = (raa ?? {}) as Partial<Record<keyof DrageParametre, unknown>>;
  const s = standardParametre;
  const f = (r.farger ?? {}) as Partial<Record<Fargesone, unknown>>;
  const d = (r.detaljer ?? {}) as Partial<Record<keyof DrageParametre['detaljer'], unknown>>;
  const bool = (x: unknown, std: boolean) => (typeof x === 'boolean' ? x : std);
  return {
    kropp: velg(katalog.kropp, r.kropp, s.kropp),
    hode: velg(katalog.hode, r.hode, s.hode),
    horn: velg(katalog.horn, r.horn, s.horn),
    pigger: velg(katalog.pigger, r.pigger, s.pigger),
    hale: velg(katalog.hale, r.hale, s.hale),
    vinger: velg(katalog.vinger, r.vinger, s.vinger),
    monster: velg(katalog.monster, r.monster, s.monster),
    lengde: begrensLengde(typeof r.lengde === 'number' ? r.lengde : s.lengde),
    farger: {
      kropp: materialId(f.kropp, s.farger.kropp),
      aksent: materialId(f.aksent, s.farger.aksent),
      vinger: materialId(f.vinger, s.farger.vinger),
      oyne: materialId(f.oyne, s.farger.oyne),
    },
    detaljer: {
      oyne: velg(katalog.oyne, d.oyne, s.detaljer.oyne),
      bein: bool(d.bein, s.detaljer.bein),
      klor: bool(d.klor, s.detaljer.klor),
      vingeribber: bool(d.vingeribber, s.detaljer.vingeribber),
    },
  };
}
