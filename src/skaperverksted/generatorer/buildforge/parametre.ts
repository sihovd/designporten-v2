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

export type Kropp = 'topp' | 'underdel';
export type Formtype = 'kule' | 'boks' | 'sylinder';
export type Operasjon = 'smelt' | 'legg-til' | 'trekk-fra';

export const kroppnavn: Record<Kropp, string> = { topp: 'Topp', underdel: 'Underdel' };
export const formnavn: Record<Formtype, string> = {
  kule: 'Kule',
  boks: 'Avrundet boks',
  sylinder: 'Sylinder',
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
   * Sylinder: diameter in [0], height in [2].
   */
  mal: [number, number, number];
  /** Edge rounding for boks and sylinder (mm). */
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
  profil: { id: string; versjon: string };
  mal: string;
  farger: Record<Kropp, string>;
  /** Evaluation order matters for `trekk-fra`. */
  former: Form[];
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

const formSkjema = z.object({
  id: z.string().min(1).max(64),
  navn: z.string().max(60),
  kropp: z.enum(['topp', 'underdel']),
  type: z.enum(['kule', 'boks', 'sylinder']),
  posisjon: v3(GRENSER.posisjon.min, GRENSER.posisjon.maks),
  rotasjon: v3(-360, 360),
  mal: v3(GRENSER.mal.min, GRENSER.mal.maks),
  avrunding: tall(GRENSER.avrunding.min, GRENSER.avrunding.maks),
  operasjon: z.enum(['smelt', 'legg-til', 'trekk-fra']),
  smelting: tall(GRENSER.smelting.min, GRENSER.smelting.maks),
  speilet: z.boolean(),
  komponent: z.object({ id: z.string().max(40), versjon: z.string().max(20) }).optional(),
});

const parameterSkjema = z.object({
  skjema: z.literal(SKJEMA),
  profil: z.object({ id: z.string().max(60), versjon: z.string().max(20) }),
  mal: z.string().max(40),
  farger: z.object({ topp: z.enum(materialIder), underdel: z.enum(materialIder) }),
  former: z.array(formSkjema).max(GRENSER.maksFormer),
});

export type Tolkning = { ok: true; p: BuildforgeParametre } | { ok: false; feil: string[] };

/**
 * Runtime validation of stored parameters. Invalid numbers, unknown fields
 * values, duplicate ids and too many shapes are rejected, never repaired
 * silently.
 */
export function tolkParametre(raw: unknown): Tolkning {
  const r = parameterSkjema.safeParse(raw);
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
