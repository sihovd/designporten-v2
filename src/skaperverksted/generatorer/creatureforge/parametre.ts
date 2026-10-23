/**
 * The stored Creature Forge project (`Dokument.parametre`) and its runtime
 * validation. Invalid data is rejected with a reason, never repaired. The
 * joint mechanism's sizes live in the profile (`ledd.ts`), not in the
 * project; the project only names the profile and may override the print
 * clearance and the play.
 */
import { z } from 'zod';
import { grunnformer, type Deltype } from './grunnformer';
import type { V3 } from './vektor';

export const SKJEMA = 'creatureforge/0.1';

export type Mekanisme = 'kjede' | 'knott' | 'stifter';

export interface Del {
  id: string;
  type: Deltype;
  navn: string;
  /** Material id (colour). */
  farge: string;
  lengde: number;
  tykkelse: number;
  /** Root only: where the part sits (mm, figure coordinates). Other parts are placed by their joint. */
  posisjon?: V3;
  /** Root only: rotation, degrees (XYZ). */
  rotasjon?: V3;
}

/**
 * The Boolean dome: a negative volume, a curved shell centred on the joint
 * and cut from both parts. Its thickness is the thickness of the cut itself.
 */
export interface Kuppel {
  /** Diameter of the dome (mm). */
  diameter: number;
  /** Rise of the dome's mid-surface from its rim to its top (mm); 0 = flat. */
  dybde: number;
  /** Tilt of the dome's axis away from the joint axis (degrees). */
  helning: number;
  /** Which way it tilts, round the joint axis from the joint's up direction (degrees). */
  retning: number;
  /** Thickness of the cut at the centre (mm). */
  tykkelseSenter: number;
  /** Thickness of the cut along the rim (mm). */
  tykkelseKant: number;
}

export interface Ende {
  del: string;
  punkt: string;
}

export interface Ledd {
  id: string;
  forelder: Ende;
  barn: Ende;
  mekanisme: Mekanisme;
  /** Between the two snap points along the joint axis (mm). Negative lets the parts sink into each other. */
  avstand: number;
  /** Moves the joint in the parent's frame (mm). */
  forskyvning: V3;
  /** Turns the joint, and with it the child, the mechanism and the dome (degrees, XYZ in the joint's frame). */
  rotasjon: V3;
  kuppel: Kuppel;
}

export interface CfParametre {
  skjema: typeof SKJEMA;
  profil: { id: string; versjon: string };
  /** The user's own print clearance and play (mm); unset = the profile's trial values. */
  toleranser?: { klaring?: number; spillerom?: number };
  deler: Del[];
  ledd: Ledd[];
}

/** Limits for everything the editor lets the user change. */
export const GRENSER = {
  posisjon: { min: -400, maks: 400 },
  rotasjon: { min: -360, maks: 360 },
  avstand: { min: -20, maks: 20 },
  forskyvning: { min: -40, maks: 40 },
  kuppel: {
    diameter: { min: 4, maks: 90 },
    dybde: { min: 0, maks: 45 },
    helning: { min: -60, maks: 60 },
    retning: { min: -360, maks: 360 },
    tykkelseSenter: { min: 0.2, maks: 20 },
    tykkelseKant: { min: 0.2, maks: 20 },
  },
  klaring: { min: 0.1, maks: 1.5 },
  spillerom: { min: 0, maks: 3 },
  maksDeler: 24,
} as const;

const tall = (g: { min: number; maks: number }) => z.number().min(g.min).max(g.maks);
const v3 = (g: { min: number; maks: number }) => z.tuple([tall(g), tall(g), tall(g)]);
const id = z.string().min(1).max(60);
const ende = z.object({ del: id, punkt: z.string().min(1).max(30) });
const kuppelSkjema = z.object({
  diameter: tall(GRENSER.kuppel.diameter),
  dybde: tall(GRENSER.kuppel.dybde),
  helning: tall(GRENSER.kuppel.helning),
  retning: tall(GRENSER.kuppel.retning),
  tykkelseSenter: tall(GRENSER.kuppel.tykkelseSenter),
  tykkelseKant: tall(GRENSER.kuppel.tykkelseKant),
});

const skjema = z.object({
  skjema: z.literal(SKJEMA),
  profil: z.object({ id: z.string().max(60), versjon: z.string().max(20) }),
  toleranser: z
    .object({ klaring: tall(GRENSER.klaring).optional(), spillerom: tall(GRENSER.spillerom).optional() })
    .optional(),
  deler: z
    .array(
      z.object({
        id,
        type: z.enum(['hode', 'overkropp']),
        navn: z.string().max(60),
        farge: z.string().min(1).max(80),
        lengde: z.number(),
        tykkelse: z.number(),
        posisjon: v3(GRENSER.posisjon).optional(),
        rotasjon: v3(GRENSER.rotasjon).optional(),
      }),
    )
    .max(GRENSER.maksDeler),
  ledd: z
    .array(
      z.object({
        id,
        forelder: ende,
        barn: ende,
        mekanisme: z.enum(['kjede', 'knott', 'stifter']),
        avstand: tall(GRENSER.avstand),
        forskyvning: v3(GRENSER.forskyvning),
        rotasjon: v3(GRENSER.rotasjon),
        kuppel: kuppelSkjema,
      }),
    )
    .max(GRENSER.maksDeler),
});

export type Validering = { ok: true; p: CfParametre } | { ok: false; grunner: string[] };

/** Checks the stored data and the structure: one root, a tree, known snap points that fit. */
export function valider(raw: unknown): Validering {
  const r = skjema.safeParse(raw);
  if (!r.success)
    return {
      ok: false,
      grunner: r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'prosjektet'}: ${i.message}`),
    };
  const p = r.data as CfParametre;
  const grunner: string[] = [];
  const deler = new Map(p.deler.map((d) => [d.id, d]));
  if (deler.size !== p.deler.length) grunner.push('To deler har samme id.');
  for (const d of p.deler) {
    const g = grunnformer[d.type];
    if (d.lengde < g.lengde.min || d.lengde > g.lengde.maks)
      grunner.push(`${d.navn}: lengden må være mellom ${g.lengde.min} og ${g.lengde.maks} mm.`);
    if (d.tykkelse < g.tykkelse.min || d.tykkelse > g.tykkelse.maks)
      grunner.push(`${d.navn}: tykkelsen må være mellom ${g.tykkelse.min} og ${g.tykkelse.maks} mm.`);
  }
  if (new Set(p.ledd.map((l) => l.id)).size !== p.ledd.length) grunner.push('To ledd har samme id.');
  const brukt = new Set<string>();
  const barn = new Set<string>();
  for (const l of p.ledd) {
    const f = deler.get(l.forelder.del),
      b = deler.get(l.barn.del);
    if (!f || !b) {
      grunner.push(`Leddet ${l.id} viser til en del som ikke finnes.`);
      continue;
    }
    const fp = grunnformer[f.type].snappunkter(f.lengde, f.tykkelse).find((s) => s.id === l.forelder.punkt);
    const bp = grunnformer[b.type].snappunkter(b.lengde, b.tykkelse).find((s) => s.id === l.barn.punkt);
    if (!fp || !bp) grunner.push(`Leddet ${l.id} viser til et snappunkt som ikke finnes.`);
    else if (fp.side !== 'forelder' || bp.side !== 'barn' || fp.type !== bp.type)
      grunner.push(`Leddet ${l.id} kobler snappunkter som ikke passer sammen.`);
    for (const e of [l.forelder, l.barn]) {
      const k = `${e.del}/${e.punkt}`;
      if (brukt.has(k)) grunner.push(`Snappunktet ${k} har to ledd.`);
      brukt.add(k);
    }
    if (barn.has(l.barn.del)) grunner.push(`${b.navn} henger i to ledd.`);
    barn.add(l.barn.del);
    if (l.barn.del === l.forelder.del) grunner.push(`Leddet ${l.id} kobler en del til seg selv.`);
  }
  const rotter = p.deler.filter((d) => !barn.has(d.id));
  if (p.deler.length && rotter.length !== 1)
    grunner.push('Figuren må ha nøyaktig én del som ikke henger i et ledd.');
  // every part must be reachable from the root (no loops)
  if (rotter.length === 1) {
    const nadd = new Set([rotter[0]!.id]);
    let endret = true;
    while (endret) {
      endret = false;
      for (const l of p.ledd)
        if (nadd.has(l.forelder.del) && !nadd.has(l.barn.del)) {
          nadd.add(l.barn.del);
          endret = true;
        }
    }
    if (nadd.size !== p.deler.length) grunner.push('Leddene danner en løkke.');
  }
  return grunner.length ? { ok: false, grunner } : { ok: true, p };
}

export function tomtProsjekt(profil: { id: string; versjon: string }): CfParametre {
  return { skjema: SKJEMA, profil, deler: [], ledd: [] };
}

/** The dome a new joint between these parts starts with. */
export function standardKuppel(forelder: Del, barn: Del): Kuppel {
  const smalest = Math.min(forelder.tykkelse, barn.tykkelse);
  return {
    diameter: Math.round(smalest * 0.8),
    dybde: 3,
    helning: 0,
    retning: 0,
    tykkelseSenter: 6,
    tykkelseKant: 2,
  };
}

/** The distance a new joint starts with: the child sinks a little into the parent, the dome parts them. */
export const STANDARD_AVSTAND = -4;
