/**
 * The BuildForge project (handoff §11): bodies, decorative shapes and the
 * mechanism profile reference, stored in `Dokument.parametre`.
 *
 * Only decoration is user data. The mechanics come from the profile the
 * project names, so the stored project cannot widen a switch seat or move
 * the coupling. Editor state (selection, mode, camera, the click preview)
 * is not stored here.
 */
import { z } from 'zod';
import { materialer } from '../../core/materialer';
import { fraFigur, type FigurProsjekt } from './migrering';

export const SKJEMA = 1;

/**
 * Product families. A project without `familie` is a clicker (projects from
 * BuildForge 0.1 have no such field). `modul` is the modular builder: body
 * parts joined by connectors (handoff 2026-10-04). Projects saved as `figur`
 * (BuildForge 0.2) are converted to `modul` when read (migrering.ts).
 */
export type Familie = 'klikker' | 'modul';
export type KlikkerKropp = 'topp' | 'underdel';
export type Formtype = 'kule' | 'boks' | 'sylinder' | 'kjegle';
export type Operasjon = 'smelt' | 'legg-til' | 'trekk-fra';
export type V3 = [number, number, number];

export const klikkerKropper: KlikkerKropp[] = ['topp', 'underdel'];

export const kroppnavn: Record<KlikkerKropp, string> = { topp: 'Topp', underdel: 'Underdel' };
/** Definite singular, for sentences («Fest øyne på toppen»). */
export const kroppBestemt: Record<KlikkerKropp, string> = { topp: 'toppen', underdel: 'underdelen' };

/** Library categories of body parts (handoff §6). */
export type Kategori =
  'kropper' | 'hoder' | 'halser' | 'armer' | 'hender' | 'bein' | 'fotter' | 'haler' | 'vinger' | 'annet';
export const kategorier: Kategori[] = [
  'kropper',
  'hoder',
  'halser',
  'armer',
  'hender',
  'bein',
  'fotter',
  'haler',
  'vinger',
  'annet',
];
export const kategorinavn: Record<Kategori, string> = {
  kropper: 'Kropper',
  hoder: 'Hoder',
  halser: 'Halser',
  armer: 'Armer',
  hender: 'Hender',
  bein: 'Bein',
  fotter: 'Føtter',
  haler: 'Haler',
  vinger: 'Vinger',
  annet: 'Annet',
};

/** Male (a peg) or female (a hole). A connection joins one of each. */
export type Kjonn = 'hann' | 'hunn';
export const kjonnnavn: Record<Kjonn, string> = { hann: 'Hann (plugg)', hunn: 'Hunn (hull)' };
/**
 * Connector families. Only the swivel peg has a mechanical profile; ball
 * joints, snap fits, print-in-place joints, magnets and screws are planned
 * (handoff §33) and are not offered until they have one.
 */
export type Koblingsfamilie = 'svivel';
/** What a connector is for. Used to keep connections when a part is replaced (handoff §12). */
export type Koblingsrolle =
  'hals' | 'skulder' | 'hofte' | 'handledd' | 'ankel' | 'hale' | 'vinge' | 'generisk';

export interface Kobling {
  id: string;
  navn: string;
  familie: Koblingsfamilie;
  kjonn: Kjonn;
  rolle: Koblingsrolle;
  /** The joint point in the body's frame (mm): where the two parts' axes meet. */
  posisjon: V3;
  /** Outward direction in the body's frame: towards the part it connects to. */
  akse: V3;
}

/** A body part (handoff §5): one printed piece with its shapes and connectors. */
export interface Modulkropp {
  id: string;
  navn: string;
  kategori: Kategori;
  /** Library body this part came from, if any. */
  komponent?: { id: string; versjon: string };
  farge: string;
  /** The whole part is mirrored across its own YZ plane (a right arm from a left arm). */
  speilet: boolean;
  /**
   * Where the part stands when it anchors its group (the Main Body, or the
   * first part of a loose assembly). Connected parts are placed by their
   * connectors and ignore these. Every group stands on the plate (z = 0).
   */
  posisjon: V3;
  rotasjon: V3;
  koblinger: Kobling[];
}

export interface Ende {
  kropp: string;
  kobling: string;
}

/** A connection between two connectors. `vri` turns the part on side b about the joint axis (degrees). */
export interface Forbindelse {
  id: string;
  a: Ende;
  b: Ende;
  vri: number;
}

export const formnavn: Record<Formtype, string> = {
  kule: 'Kule',
  boks: 'Avrundet boks',
  sylinder: 'Sylinder',
  kjegle: 'Kjegle',
};
export const operasjonnavn: Record<Operasjon, string> = {
  smelt: 'Smelt sammen',
  'legg-til': 'Legg til (skarp overgang)',
  'trekk-fra': 'Trekk fra',
};

export interface Form {
  id: string;
  navn: string;
  /** Clicker: `topp` or `underdel`. Modular builder: the id of the body part. */
  kropp: string;
  type: Formtype;
  /** Centre, mm. */
  posisjon: [number, number, number];
  /** Degrees about X, Y, Z (applied in that order). */
  rotasjon: [number, number, number];
  /**
   * Size in mm. Kule: diameter in [0]. Boks: width, depth, height.
   * Sylinder and kjegle: (base) diameter in [0], height in [2].
   */
  mal: [number, number, number];
  /** Edge rounding for boks and sylinder, tip rounding for kjegle (mm). */
  avrunding: number;
  operasjon: Operasjon;
  /** Blend radius for `smelt` (mm). A design value, not a tolerance. */
  smelting: number;
  /** Symmetry relation: the shape is mirrored across the YZ plane (x → −x). */
  speilet: boolean;
  /** Library component this shape came from, if any. */
  komponent?: { id: string; versjon: string };
}

export interface BuildforgeParametre {
  skjema: number;
  /** Missing = klikker. */
  familie?: Familie;
  /** Clicker: the switch profile. Modular builder: the joint profile. */
  profil: { id: string; versjon: string };
  /** The template or start the project came from (`ny`: no start chosen yet). */
  mal: string;
  /** Clicker: material per body. The modular builder keeps the colour on each part. */
  farger: Partial<Record<KlikkerKropp, string>>;
  /** Modular builder: the Main Body (handoff §4). */
  rot?: string;
  kropper?: Modulkropp[];
  forbindelser?: Forbindelse[];
  /**
   * Evaluation order matters for `trekk-fra`. Clicker shapes are in model
   * coordinates; body part shapes are in their part's own frame.
   */
  former: Form[];
}

export function familieFor(p: Pick<BuildforgeParametre, 'familie'>): Familie {
  return p.familie ?? 'klikker';
}

export const GRENSER = {
  mal: { min: 1, maks: 80 },
  posisjon: { min: -90, maks: 120 },
  smelting: { min: 0, maks: 12 },
  avrunding: { min: 0, maks: 20 },
  /** Clicker. */
  maksFormer: 40,
  /** Modular builder: all parts together. */
  maksFormerModul: 160,
  maksKropper: 24,
  maksKoblinger: 12,
  /** Where a part may stand on the plate (mm from the middle). */
  plassering: 300,
};

const materialIder = materialer.map((x) => x.id) as [string, ...string[]];
const tall = (min: number, maks: number) => z.number().min(min).max(maks);
const v3 = (min: number, maks: number) => z.tuple([tall(min, maks), tall(min, maks), tall(min, maks)]);

const formSkjema = (kropp: z.ZodType<string>) =>
  z.object({
    id: z.string().min(1).max(64),
    navn: z.string().max(60),
    kropp,
    type: z.enum(['kule', 'boks', 'sylinder', 'kjegle']),
    posisjon: v3(GRENSER.posisjon.min, GRENSER.posisjon.maks),
    rotasjon: v3(-360, 360),
    mal: v3(GRENSER.mal.min, GRENSER.mal.maks),
    avrunding: tall(GRENSER.avrunding.min, GRENSER.avrunding.maks),
    operasjon: z.enum(['smelt', 'legg-til', 'trekk-fra']),
    smelting: tall(GRENSER.smelting.min, GRENSER.smelting.maks),
    speilet: z.boolean(),
    komponent: z.object({ id: z.string().max(40), versjon: z.string().max(20) }).optional(),
  });

const profilSkjema = z.object({ id: z.string().max(60), versjon: z.string().max(20) });
const materialSkjema = z.enum(materialIder);
const idSkjema = z.string().min(1).max(64);

const klikkerSkjema = z.object({
  skjema: z.literal(SKJEMA),
  familie: z.literal('klikker').optional(),
  profil: profilSkjema,
  mal: z.string().max(40),
  farger: z.object({ topp: materialSkjema, underdel: materialSkjema }),
  former: z.array(formSkjema(z.enum(['topp', 'underdel']))).max(GRENSER.maksFormer),
});

const aksen = v3(-1, 1).refine((a) => Math.abs(Math.hypot(...a) - 1) < 0.01, 'aksen må ha lengde 1');

const koblingSkjema = z.object({
  id: idSkjema,
  navn: z.string().max(40),
  familie: z.literal('svivel'),
  kjonn: z.enum(['hann', 'hunn']),
  rolle: z.enum(['hals', 'skulder', 'hofte', 'handledd', 'ankel', 'hale', 'vinge', 'generisk']),
  posisjon: v3(GRENSER.posisjon.min, GRENSER.posisjon.maks),
  akse: aksen,
});

const kroppSkjema = z.object({
  id: idSkjema,
  navn: z.string().max(60),
  kategori: z.enum(kategorier as [Kategori, ...Kategori[]]),
  komponent: z.object({ id: z.string().max(40), versjon: z.string().max(20) }).optional(),
  farge: materialSkjema,
  speilet: z.boolean(),
  posisjon: v3(-GRENSER.plassering, GRENSER.plassering),
  rotasjon: v3(-360, 360),
  koblinger: z.array(koblingSkjema).max(GRENSER.maksKoblinger),
});

const endeSkjema = z.object({ kropp: idSkjema, kobling: idSkjema });

const modulSkjema = z.object({
  skjema: z.literal(SKJEMA),
  familie: z.literal('modul'),
  profil: profilSkjema,
  mal: z.string().max(40),
  farger: z.object({}),
  rot: idSkjema,
  kropper: z.array(kroppSkjema).min(1).max(GRENSER.maksKropper),
  forbindelser: z
    .array(z.object({ id: idSkjema, a: endeSkjema, b: endeSkjema, vri: tall(-360, 360) }))
    .max(GRENSER.maksKropper),
  former: z.array(formSkjema(idSkjema)).max(GRENSER.maksFormerModul),
});

export type Tolkning = { ok: true; p: BuildforgeParametre } | { ok: false; feil: string[] };

const feil = (tekst: string): Tolkning => ({ ok: false, feil: [tekst] });

/**
 * The graph rules of a modular project (handoff §60): one Main Body, every
 * connection between two existing, compatible connectors that are used at
 * most once, and no loops (each group of connected parts is a tree, so it
 * can always be put together).
 */
function sjekkModul(p: BuildforgeParametre): Tolkning {
  const kropper = new Map<string, Modulkropp>();
  for (const k of p.kropper!) {
    if (kropper.has(k.id)) return feil(`Delen «${k.id}» finnes to ganger.`);
    kropper.set(k.id, k);
    const ider = new Set<string>();
    for (const kb of k.koblinger) {
      if (ider.has(kb.id)) return feil(`Koblingen «${kb.id}» finnes to ganger i «${k.navn}».`);
      ider.add(kb.id);
    }
  }
  if (!kropper.has(p.rot!)) return feil('Hovedkroppen finnes ikke i prosjektet.');
  for (const f of p.former)
    if (!kropper.has(f.kropp)) return feil(`Formen «${f.navn}» hører til en del som ikke finnes.`);
  const brukt = new Set<string>();
  const ider = new Set<string>();
  // union-find over the parts: a connection inside one group would close a loop
  const forelder = new Map<string, string>();
  const finn = (x: string): string => {
    let r = x;
    while (forelder.get(r) && forelder.get(r) !== r) r = forelder.get(r)!;
    forelder.set(x, r);
    return r;
  };
  for (const id of kropper.keys()) forelder.set(id, id);
  for (const fb of p.forbindelser!) {
    if (ider.has(fb.id)) return feil(`Forbindelsen «${fb.id}» finnes to ganger.`);
    ider.add(fb.id);
    const ka = kropper.get(fb.a.kropp),
      kb = kropper.get(fb.b.kropp);
    const a = ka?.koblinger.find((x) => x.id === fb.a.kobling);
    const b = kb?.koblinger.find((x) => x.id === fb.b.kobling);
    if (!a || !b) return feil('En forbindelse peker på en kobling som ikke finnes.');
    if (ka === kb) return feil(`«${ka!.navn}» er koblet til seg selv.`);
    if (a.familie !== b.familie || a.kjonn === b.kjonn)
      return feil(`Koblingene mellom «${ka!.navn}» og «${kb!.navn}» passer ikke sammen.`);
    for (const e of [fb.a, fb.b]) {
      const n = `${e.kropp}/${e.kobling}`;
      if (brukt.has(n)) return feil('En kobling er brukt i to forbindelser.');
      brukt.add(n);
    }
    const ra = finn(fb.a.kropp),
      rb = finn(fb.b.kropp);
    if (ra === rb) return feil('Delene er koblet sammen i en ring. Det kan ikke settes sammen.');
    forelder.set(ra, rb);
  }
  return { ok: true, p };
}

/**
 * Runtime validation of stored parameters. Invalid numbers, unknown fields
 * values, duplicate ids and too many shapes are rejected, never repaired
 * silently. A BuildForge 0.2 figure is converted to the modular builder.
 */
export function tolkParametre(raw: unknown): Tolkning {
  const familie = !!raw && typeof raw === 'object' ? (raw as { familie?: unknown }).familie : undefined;
  if (familie === 'figur') {
    const r = figurSkjema.safeParse(raw);
    if (!r.success) return { ok: false, feil: problemer(r.error) };
    const omgjort = fraFigur(r.data as FigurProsjekt);
    if (!omgjort) return feil('Figuren bruker en grunnmodell denne versjonen av BuildForge ikke kjenner.');
    return tolkParametre(omgjort);
  }
  const r = (familie === 'modul' ? modulSkjema : klikkerSkjema).safeParse(raw);
  if (!r.success) return { ok: false, feil: problemer(r.error) };
  const ider = new Set<string>();
  for (const f of r.data.former) {
    if (ider.has(f.id)) return feil(`Formen «${f.id}» finnes to ganger.`);
    ider.add(f.id);
  }
  const p = r.data as BuildforgeParametre;
  return familie === 'modul' ? sjekkModul(p) : { ok: true, p };
}

function problemer(e: z.ZodError): string[] {
  return e.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'prosjektet'}: ${i.message}`);
}

/** BuildForge 0.2 figures: read only, converted on load. */
const figurSegmenter = ['hode', 'kropp', 'armer', 'bein', 'hender', 'fotter'] as const;
const figurSkjema = z.object({
  skjema: z.literal(SKJEMA),
  familie: z.literal('figur'),
  profil: profilSkjema,
  mal: z.string().max(40),
  farger: z.object(
    Object.fromEntries(figurSegmenter.map((k) => [k, materialSkjema])) as Record<
      (typeof figurSegmenter)[number],
      typeof materialSkjema
    >,
  ),
  grunnmodeller: z.object(
    Object.fromEntries(figurSegmenter.map((k) => [k, z.string().min(1).max(40)])) as Record<
      (typeof figurSegmenter)[number],
      z.ZodString
    >,
  ),
  former: z.array(formSkjema(z.enum(figurSegmenter))).max(GRENSER.maksFormer),
});

/** Stable fingerprint of the canonical project, used as the revision in checks and reports. */
export function revisjon(p: unknown): string {
  return kontrollsum(new TextEncoder().encode(JSON.stringify(p)));
}

/** FNV-1a (32 bit) as 8 hex digits. A change detector, not a security hash. */
export function kontrollsum(data: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
