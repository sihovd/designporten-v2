/**
 * Lamp hardware profiles: the light sources and fittings a lamp can be built
 * around (Sivert, 2026-09-29, items 58–61).
 *
 * Every dimension carries where it came from and how sure we are of it, so
 * the editor never presents an unconfirmed number as a fact. Geometry reads
 * the numbers from here (or from the user's override in `tilpasning`), so a
 * verified value is a data change, not a generator redesign.
 *
 * Nothing here is an electrical specification or a safety approval. The
 * checks built on these profiles are geometric only.
 */

/**
 * How sure we are of a value:
 * - `fysisk-verifisert`: measured on a real part / proven by a test print at Designporten.
 * - `produsentoppgitt`: published by the manufacturer (or quoted verbatim from its product data).
 * - `uklar`: published, but the manufacturer's sources disagree.
 * - `vanlig-mal`: a common value for this kind of part, not confirmed for any specific product.
 * - `designstandard`: a Designporten design default (for example a fit tolerance), not a product fact.
 * - `ukjent`: not published anywhere we could read.
 */
export type Sikkerhet =
  'fysisk-verifisert' | 'produsentoppgitt' | 'uklar' | 'vanlig-mal' | 'designstandard' | 'ukjent';

export const sikkerhetTekst: Record<Sikkerhet, string> = {
  'fysisk-verifisert': 'Målt og testet',
  produsentoppgitt: 'Oppgitt av produsenten',
  uklar: 'Usikkert, kildene er uenige',
  'vanlig-mal': 'Vanlig mål, ikke bekreftet',
  designstandard: 'Designportens standard',
  ukjent: 'Ikke oppgitt',
};

/** A value with its provenance. `verdi` is null when nothing trustworthy is known. */
export interface Maal<T = number> {
  verdi: T | null;
  sikkerhet: Sikkerhet;
  merknad?: string;
}

export interface Kilde {
  tittel: string;
  url: string;
  /** Date the source was read (ISO). */
  lest: string;
  /** What we took from it, and how far it can be trusted. */
  merknad: string;
}

export type SokkelId = 'bambu-001' | 'e27' | 'e14' | 'egendefinert' | 'apen' | 'lukket';

/**
 * - `modul`: a self-contained light module that sits in a recess in the base
 *   (Bambu Lab LED Lamp Kit 001, a user-defined puck).
 * - `holder`: a lamp holder clamped through a hole in a bottom plate (E27, E14).
 * - `ingen`: no light source; an open rim or a closed plate.
 */
export type Maskinvaretype = 'modul' | 'holder' | 'ingen';

export type Festemetode = 'tape' | 'klemkant';

export const festenavn: Record<Festemetode, string> = {
  tape: 'Dobbeltsidig tape',
  klemkant: 'Klemkant',
};

export type Kabelutgang = 'side' | 'bunn' | 'ukjent';

export interface Modulspesifikasjon {
  ytreDiameter: Maal;
  kroppHoyde: Maal;
  kabel: { utgang: Kabelutgang; diameter: Maal; lengde: Maal; stopsel: Maal<string> };
  /** Screw positions in the module's own frame (mm), when verified. */
  skruehull: Maal<{ x: number; y: number }[]>;
  festemetoder: Festemetode[];
  /** Plain description of the electrical data as published. Not a rating or approval. */
  elektrisk: string;
  /** What the kit contains, as published. */
  innhold?: string;
}

export interface LampeMaskinvare {
  id: SokkelId;
  /** Short name for selectors. */
  navn: string;
  produsent: string | null;
  produktnavn: string;
  type: Maskinvaretype;
  beskrivelse: string;
  /**
   * Plate hole for `holder` (mm), 0 = closed plate, null = no bottom at all.
   * Not used for `modul` (the recess comes from `modul`).
   */
  hullDiameter: Maal | null;
  modul?: Modulspesifikasjon;
  /**
   * The fit (recess, clearances, hole) has been proven by a physical test
   * print at Designporten. Until then the editor says «Ikke fysisk verifisert».
   */
  passformVerifisert: boolean;
  /** Heat note shown with the hardware. Plain, not a safety claim. */
  varme?: string;
  kilder: Kilde[];
}

const LEST = '2026-09-29';

/**
 * Bambu Lab LED Lamp Kit 001.
 *
 * The official store page (us/eu.store.bambulab.com) renders its
 * specification with scripts and could not be read from here on 2026-09-29.
 * The values below are Bambu Lab's product data as quoted verbatim by
 * retailers («Product Size: D59*H18 mm», «DC 5V», «3W», «1.5 m», «Warm
 * White»). Sivert reports that Bambu Lab's own sources disagree on the
 * module height, so the height is marked `uklar` and can be overridden per
 * design (`tilpasning.modulHoyde`).
 */
const bambu001: LampeMaskinvare = {
  id: 'bambu-001',
  navn: 'Bambu Lab Lamp Kit 001',
  produsent: 'Bambu Lab',
  produktnavn: 'Bambu Lab LED Lamp Kit 001',
  type: 'modul',
  beskrivelse:
    'Rund LED-modul som ligger i en fordypning i bunnen. Kabelen går ned gjennom et hull og ut i et spor under lampen.',
  hullDiameter: null,
  modul: {
    ytreDiameter: { verdi: 59, sikkerhet: 'produsentoppgitt' },
    kroppHoyde: {
      verdi: 18,
      sikkerhet: 'uklar',
      merknad:
        'Produktdataene vi fant oppgir 18 mm, men Bambu Labs kilder er ikke samstemte om høyden. Mål modulen og legg inn riktig høyde om den avviker.',
    },
    kabel: {
      utgang: 'ukjent',
      diameter: { verdi: null, sikkerhet: 'ukjent' },
      lengde: { verdi: 1500, sikkerhet: 'produsentoppgitt' },
      stopsel: { verdi: null, sikkerhet: 'ukjent', merknad: 'Støpseltype og mål er ikke oppgitt.' },
    },
    skruehull: {
      verdi: null,
      sikkerhet: 'ukjent',
      merknad: 'Settet har to reserveskruer, men skrueplasseringen er ikke oppgitt.',
    },
    festemetoder: ['tape', 'klemkant'],
    elektrisk: '5 V DC, 3 W, varmhvit LED, 1,5 m kabel.',
    innhold: 'LED-lampe, 2 reserveskruer og dobbeltsidig tape (reserve).',
  },
  passformVerifisert: false,
  kilder: [
    {
      tittel: 'Bambu Lab Store: LED Lamp Kit 001',
      url: 'https://us.store.bambulab.com/products/led-lamp-kit-001',
      lest: LEST,
      merknad:
        'Offisiell produktside. Spesifikasjonen lastes med skript og kunne ikke leses herfra. Bør sjekkes manuelt.',
    },
    {
      tittel: 'MakerWorld: LED Lamp 001 by Bambu Lab',
      url: 'https://makerworld.com/en/models/13717',
      lest: LEST,
      merknad:
        'Bambu Labs egen modell med monterings- og designguide (PDF). PDF-ene kunne ikke leses herfra.',
    },
    {
      tittel: '3DJake: Bambu Lab LED Lamp Kit-001',
      url: 'https://www.3djake.com/bambu-lab/led-lamp-kit-001',
      lest: LEST,
      merknad: 'Forhandler. «59 x 18 mm», «DC 5V», «3W», «1.5 m», varmhvit, 58 g.',
    },
    {
      tittel: '3D Universe: Bambu Lab LED Lamp Kit',
      url: 'https://shop3duniverse.com/products/bambu-lab-led-lamp-kit-001',
      lest: LEST,
      merknad: 'Forhandler. «Product Size: D59 × H18 mm» og innholdet i settet.',
    },
  ],
};

export const maskinvare: Record<SokkelId, LampeMaskinvare> = {
  'bambu-001': bambu001,
  e27: {
    id: 'e27',
    navn: 'E27-holder',
    produsent: null,
    produktnavn: 'E27-lampeholder med skjermring',
    type: 'holder',
    beskrivelse: 'Bunnplate med hull. Lampeholderen stikkes gjennom og skjermringen klemmer platen fast.',
    hullDiameter: {
      verdi: 42,
      sikkerhet: 'vanlig-mal',
      merknad: 'Et vanlig mål for E27-holdere med skjermring. Mål din holder; hullet kan endres.',
    },
    passformVerifisert: false,
    varme: 'Bruk LED-pære. Varme fra glødepærer kan gjøre plasten myk.',
    kilder: [],
  },
  e14: {
    id: 'e14',
    navn: 'E14-holder',
    produsent: null,
    produktnavn: 'E14-lampeholder med skjermring',
    type: 'holder',
    beskrivelse: 'Bunnplate med hull. Lampeholderen stikkes gjennom og skjermringen klemmer platen fast.',
    hullDiameter: {
      verdi: 29,
      sikkerhet: 'vanlig-mal',
      merknad: 'Et vanlig mål for E14-holdere med skjermring. Mål din holder; hullet kan endres.',
    },
    passformVerifisert: false,
    varme: 'Bruk LED-pære. Varme fra glødepærer kan gjøre plasten myk.',
    kilder: [],
  },
  egendefinert: {
    id: 'egendefinert',
    navn: 'Egen rund modul',
    produsent: null,
    produktnavn: 'Egendefinert rund lysmodul',
    type: 'modul',
    beskrivelse: 'For en annen rund LED-modul. Legg inn målene du har målt, så lages fordypningen etter dem.',
    hullDiameter: null,
    modul: {
      ytreDiameter: {
        verdi: 60,
        sikkerhet: 'designstandard',
        merknad: 'Startverdi. Legg inn ditt eget mål.',
      },
      kroppHoyde: { verdi: 20, sikkerhet: 'designstandard', merknad: 'Startverdi. Legg inn ditt eget mål.' },
      kabel: {
        utgang: 'ukjent',
        diameter: { verdi: null, sikkerhet: 'ukjent' },
        lengde: { verdi: null, sikkerhet: 'ukjent' },
        stopsel: { verdi: null, sikkerhet: 'ukjent' },
      },
      skruehull: { verdi: null, sikkerhet: 'ukjent' },
      festemetoder: ['tape', 'klemkant'],
      elektrisk: 'Ukjent. Følg produsentens anvisning for modulen du bruker.',
    },
    passformVerifisert: false,
    kilder: [],
  },
  apen: {
    id: 'apen',
    navn: 'Åpen bunn',
    produsent: null,
    produktnavn: 'Ingen lyskilde (åpen bunn)',
    type: 'ingen',
    beskrivelse: 'Ren skjerm uten bunn, til lampeholder med skjermring.',
    hullDiameter: null,
    passformVerifisert: true,
    kilder: [],
  },
  lukket: {
    id: 'lukket',
    navn: 'Lukket bunn',
    produsent: null,
    produktnavn: 'Ingen lyskilde (lukket bunn)',
    type: 'ingen',
    beskrivelse: 'Hel bunnplate. Kan skrives ut i vasemodus og brukes som lykt eller vase.',
    hullDiameter: { verdi: 0, sikkerhet: 'designstandard' },
    passformVerifisert: true,
    kilder: [],
  },
};

/** Selector order: light sources first, then shades without one. */
export const lyskilder: SokkelId[] = ['bambu-001', 'e27', 'e14', 'egendefinert'];
export const utenLyskilde: SokkelId[] = ['apen', 'lukket'];

export function erModul(id: SokkelId): boolean {
  return maskinvare[id].type === 'modul';
}

/**
 * Fit settings for a lamp built around a module or holder. All lengths mm.
 * The defaults are Designporten design defaults, not product facts, and
 * none of them has been proven by a test print yet.
 */
export interface Tilpasning {
  /** Radial clearance between the module and the recess wall. */
  toleranse: number;
  /** Depth of the recess the module sits in. */
  fordypning: number;
  feste: Festemetode;
  /** How far the retaining lip reaches in over the module (radial). */
  klemkant: number;
  /** Diameter of the cable hole through the floor of the recess. */
  kabelHull: number;
  /** Width and height of the cable channel under the lamp. */
  kabelBredde: number;
  kabelHoyde: number;
  /** Material between the cable channel and the floor of the recess. */
  gulv: number;
  /** Holder hole override (E27/E14); null = the profile's value. */
  holderHull: number | null;
  /** Module size override; null = the profile's value. */
  modulDiameter: number | null;
  modulHoyde: number | null;
  /** Build only a small fit-test piece (recess, lip, cable route) instead of the lamp. */
  provebit: boolean;
}

export const TILPASNING_GRENSER = {
  toleranse: { min: 0, maks: 1.5, steg: 0.05 },
  fordypning: { min: 1, maks: 40, steg: 0.5 },
  klemkant: { min: 0.2, maks: 1.5, steg: 0.1 },
  kabelHull: { min: 4, maks: 40, steg: 0.5 },
  kabelBredde: { min: 3, maks: 20, steg: 0.5 },
  kabelHoyde: { min: 2, maks: 15, steg: 0.5 },
  gulv: { min: 0.6, maks: 6, steg: 0.2 },
  holderHull: { min: 10, maks: 80, steg: 0.5 },
  modulDiameter: { min: 20, maks: 200, steg: 0.5 },
  modulHoyde: { min: 3, maks: 80, steg: 0.5 },
} as const;

export function standardTilpasning(): Tilpasning {
  return {
    toleranse: 0.3,
    fordypning: 6,
    feste: 'tape',
    klemkant: 0.5,
    kabelHull: 20,
    kabelBredde: 7,
    kabelHoyde: 5,
    gulv: 1.6,
    holderHull: null,
    modulDiameter: null,
    modulHoyde: null,
    provebit: false,
  };
}

/** Height of the retaining lip band (mm). Design default. */
export const KLEMKANT_HOYDE = 1.2;
/** Smallest material ring the generator will leave around the recess (mm). */
export const MIN_KANT = 1.2;
/** Material ring around the recess on the fit-test piece (mm). */
export const PROVEBIT_KANT = 4;

/** The module's size in effect for a design: override, else profile. */
export function modulStorrelse(id: SokkelId, t: Tilpasning): { diameter: number; hoyde: number } | null {
  const m = maskinvare[id].modul;
  if (!m) return null;
  return {
    diameter: t.modulDiameter ?? m.ytreDiameter.verdi ?? 60,
    hoyde: t.modulHoyde ?? m.kroppHoyde.verdi ?? 20,
  };
}

/** The holder hole in effect (mm): override, else profile; null/0 as in `hullDiameter`. */
export function holderHull(id: SokkelId, t: Tilpasning): number | null {
  const h = maskinvare[id].hullDiameter;
  if (!h) return null;
  if (maskinvare[id].type === 'holder') return t.holderHull ?? h.verdi;
  return h.verdi;
}

/**
 * Derived recess geometry for a module (mm, z up from the plate).
 *
 *   zTopp ─┬──────┐   ┌──────┬─  top of the base, where the shade wall starts
 *          │ lip  └┐ ┌┘      │   (feste = klemkant: opening narrower than the recess)
 *   zGulv ─┤  recess (module) │
 *          │   ┌─ hole ─┐     │   floor
 *  zKanal ─┤   │        │     │
 *        0 ┴───┘channel└─────┴─  cable channel under the lamp, out to the back (+Y)
 */
export interface Modulmal {
  rModul: number;
  hModul: number;
  /** Recess radius (module + tolerance). */
  rLomme: number;
  /** Opening radius at the top of the base (smaller than rLomme with a lip). */
  rApning: number;
  rHull: number;
  kanalBredde: number;
  zKanal: number;
  zGulv: number;
  /** Where the lip starts (= zTopp without a lip). */
  zKlem: number;
  zTopp: number;
}

export function modulMal(id: SokkelId, t: Tilpasning): Modulmal | null {
  const s = modulStorrelse(id, t);
  if (!s) return null;
  const rModul = s.diameter / 2;
  const rLomme = rModul + t.toleranse;
  const klem = t.feste === 'klemkant';
  const zKanal = t.kabelHoyde;
  const zGulv = zKanal + t.gulv;
  const zTopp = zGulv + t.fordypning;
  return {
    rModul,
    hModul: s.hoyde,
    rLomme,
    rApning: klem ? rLomme - t.klemkant : rLomme,
    rHull: t.kabelHull / 2,
    kanalBredde: t.kabelBredde,
    zKanal,
    zGulv,
    zKlem: klem ? Math.max(zGulv, zTopp - KLEMKANT_HOYDE) : zTopp,
    zTopp,
  };
}
