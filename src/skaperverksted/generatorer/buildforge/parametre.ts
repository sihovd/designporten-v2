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

export const SKJEMA = 1;

/**
 * Product families. A project without `familie` is a clicker (projects from
 * BuildForge 0.1 have no such field).
 */
export type Familie = 'klikker' | 'figur';
export type KlikkerKropp = 'topp' | 'underdel';
/** Figure segments: the parts between the joints. Arms, legs, hands and feet are pairs. */
export type FigurKropp = 'hode' | 'kropp' | 'armer' | 'bein' | 'hender' | 'fotter';
export type Kropp = KlikkerKropp | FigurKropp;
export type Formtype = 'kule' | 'boks' | 'sylinder' | 'kjegle';
export type Operasjon = 'smelt' | 'legg-til' | 'trekk-fra';

export const klikkerKropper: KlikkerKropp[] = ['topp', 'underdel'];
export const figurKropper: FigurKropp[] = ['hode', 'kropp', 'armer', 'bein', 'hender', 'fotter'];
export const kropperFor: Record<Familie, Kropp[]> = { klikker: klikkerKropper, figur: figurKropper };

export const kroppnavn: Record<Kropp, string> = {
  topp: 'Topp',
  underdel: 'Underdel',
  hode: 'Hode',
  kropp: 'Kropp',
  armer: 'Armer',
  bein: 'Bein',
  hender: 'Hender',
  fotter: 'Føtter',
};
/** Definite singular, for sentences («Fest øyne på hodet»). */
export const kroppBestemt: Record<Kropp, string> = {
  topp: 'toppen',
  underdel: 'underdelen',
  hode: 'hodet',
  kropp: 'kroppen',
  armer: 'armen',
  bein: 'beinet',
  hender: 'hånden',
  fotter: 'foten',
};
/** Bodies that exist twice, mirrored across the figure's middle. */
export const erPar = (k: Kropp): boolean => k === 'armer' || k === 'bein' || k === 'hender' || k === 'fotter';

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
  kropp: Kropp;
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
  /** Clicker: the switch profile. Figure: the joint profile. */
  profil: { id: string; versjon: string };
  mal: string;
  /** Material per body of the family (every body has one). */
  farger: Partial<Record<Kropp, string>>;
  /** Figure only: the chosen base model per segment. Joint positions come from these. */
  grunnmodeller?: Partial<Record<FigurKropp, string>>;
  /**
   * Evaluation order matters for `trekk-fra`. Clicker shapes are in model
   * coordinates; figure shapes are relative to their segment's joint (the
   * left side of a pair is a mirror of the right).
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
  maksFormer: 40,
};

const materialIder = materialer.map((x) => x.id) as [string, ...string[]];
const tall = (min: number, maks: number) => z.number().min(min).max(maks);
const v3 = (min: number, maks: number) => z.tuple([tall(min, maks), tall(min, maks), tall(min, maks)]);

const formSkjema = (kropper: [string, ...string[]]) =>
  z.object({
    id: z.string().min(1).max(64),
    navn: z.string().max(60),
    kropp: z.enum(kropper),
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

const klikkerSkjema = z.object({
  skjema: z.literal(SKJEMA),
  familie: z.literal('klikker').optional(),
  profil: profilSkjema,
  mal: z.string().max(40),
  farger: z.object({ topp: materialSkjema, underdel: materialSkjema }),
  former: z.array(formSkjema(['topp', 'underdel'])).max(GRENSER.maksFormer),
});

const figurSkjema = z.object({
  skjema: z.literal(SKJEMA),
  familie: z.literal('figur'),
  profil: profilSkjema,
  mal: z.string().max(40),
  farger: z.object(
    Object.fromEntries(figurKropper.map((k) => [k, materialSkjema])) as Record<
      FigurKropp,
      typeof materialSkjema
    >,
  ),
  grunnmodeller: z.object(
    Object.fromEntries(figurKropper.map((k) => [k, z.string().min(1).max(40)])) as Record<
      FigurKropp,
      z.ZodString
    >,
  ),
  former: z.array(formSkjema(figurKropper as [string, ...string[]])).max(GRENSER.maksFormer),
});

export type Tolkning = { ok: true; p: BuildforgeParametre } | { ok: false; feil: string[] };

/**
 * Runtime validation of stored parameters. Invalid numbers, unknown fields
 * values, duplicate ids and too many shapes are rejected, never repaired
 * silently.
 */
export function tolkParametre(raw: unknown): Tolkning {
  const erFigur = !!raw && typeof raw === 'object' && (raw as { familie?: unknown }).familie === 'figur';
  const r = (erFigur ? figurSkjema : klikkerSkjema).safeParse(raw);
  if (!r.success) {
    return {
      ok: false,
      feil: r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'prosjektet'}: ${i.message}`),
    };
  }
  const ider = new Set<string>();
  for (const f of r.data.former) {
    if (ider.has(f.id)) return { ok: false, feil: [`Formen «${f.id}» finnes to ganger.`] };
    ider.add(f.id);
  }
  return { ok: true, p: r.data as BuildforgeParametre };
}

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
