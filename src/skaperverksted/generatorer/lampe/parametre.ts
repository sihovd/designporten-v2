/**
 * Lamp generator parameters (spec: skaperverksted.md, "Lamp generator").
 *
 * A lamp is a shade of revolution: a silhouette (radius over height) with a
 * wall pattern on top, a wall thickness and a base/fitting. All lengths are
 * millimetres, angles degrees. Parameters live in `dok.parametre` as plain
 * JSON; `normaliser` turns anything read from storage into a valid set.
 */
import type { ProfilPunkt } from '../../core/profil';
import { finnMateriale, materialer } from '../../core/materialer';
import {
  TILPASNING_GRENSER,
  maskinvare,
  standardTilpasning,
  type Festemetode,
  type SokkelId,
  type Tilpasning,
} from './maskinvare';

export type Monstertype = 'glatt' | 'ribber' | 'bolger' | 'fasetter' | 'diamant';

export interface Monster {
  type: Monstertype;
  /** Ribs/facets around the lamp, or waves up the height. */
  antall: number;
  /** Radial depth of the pattern (mm). Facets derive their depth from `antall`. */
  dybde: number;
}

export type { SokkelId } from './maskinvare';

export interface LampeParametre {
  hoyde: number;
  diameterBunn: number;
  diameterTopp: number;
  /**
   * Silhouette as a Bézier chain (the ProfilPunkt type from core/profil.ts):
   *   t ∈ [0, 1] height fraction,
   *   u = radial offset in mm from the straight line between the bottom and
   *       top radius (+ = outward belly, − = waist).
   * The first anchor is at t = 0 and the last at t = 1, both with u = 0, so the
   * diameters are exact. Handles are absolute (u, t) like in core profiles.
   */
  silhuett: ProfilPunkt[];
  monster: Monster;
  /** Twist of the pattern from bottom to top (degrees). */
  vridning: number;
  veggtykkelse: number;
  /** Light source / fitting (hardware profile id, see maskinvare.ts). */
  sokkel: SokkelId;
  /** Bottom plate thickness when the base is a plate (holders, closed bottom) (mm). */
  bunnTykkelse: number;
  /** Fit settings for the selected hardware. */
  tilpasning: Tilpasning;
  materialId: string;
}

/** Limits used by normalisation and the UI controls. */
export const GRENSER = {
  hoyde: { min: 40, maks: 400, steg: 1 },
  diameter: { min: 40, maks: 300, steg: 1 },
  bule: { min: -120, maks: 120, steg: 0.5 },
  antall: { min: 3, maks: 72, steg: 1 },
  antallBolger: { min: 1, maks: 24, steg: 1 },
  dybde: { min: 0, maks: 15, steg: 0.1 },
  vridning: { min: -720, maks: 720, steg: 1 },
  veggtykkelse: { min: 0.4, maks: 6, steg: 0.1 },
  bunnTykkelse: { min: 1, maks: 6, steg: 0.2 },
} as const;

/** Smallest radius the shade may have anywhere (mm). */
export const MIN_RADIUS = 8;

export const monsternavn: Record<Monstertype, string> = {
  glatt: 'Glatt',
  ribber: 'Ribber',
  bolger: 'Bølger',
  fasetter: 'Fasetter',
  diamant: 'Diamant',
};

/** Silhouette presets: straight, belly, waist, tulip, bell. */
export type Silhuettvalg = 'rett' | 'bue' | 'midje' | 'tulipan' | 'klokke';

export const silhuettnavn: Record<Silhuettvalg, string> = {
  rett: 'Rett',
  bue: 'Bue',
  midje: 'Midje',
  tulipan: 'Tulipan',
  klokke: 'Klokke',
};

export function silhuettForhandsvalg(valg: Silhuettvalg, bule = 25): ProfilPunkt[] {
  switch (valg) {
    case 'rett':
      return [
        { u: 0, t: 0 },
        { u: 0, t: 1 },
      ];
    case 'bue':
      return [
        { u: 0, t: 0, ut: { u: bule * 0.55, t: 0.12 } },
        { u: bule, t: 0.5, inn: { u: bule, t: 0.28 }, ut: { u: bule, t: 0.72 } },
        { u: 0, t: 1, inn: { u: bule * 0.55, t: 0.88 } },
      ];
    case 'midje':
      return [
        { u: 0, t: 0, ut: { u: -bule * 0.55, t: 0.12 } },
        { u: -bule, t: 0.5, inn: { u: -bule, t: 0.28 }, ut: { u: -bule, t: 0.72 } },
        { u: 0, t: 1, inn: { u: -bule * 0.55, t: 0.88 } },
      ];
    case 'tulipan':
      return [
        { u: 0, t: 0, ut: { u: bule, t: 0.1 } },
        { u: bule * 0.9, t: 0.45, inn: { u: bule * 1.1, t: 0.3 }, ut: { u: bule * 0.7, t: 0.6 } },
        { u: 0, t: 1, inn: { u: -bule * 0.2, t: 0.85 } },
      ];
    case 'klokke':
      return [
        { u: 0, t: 0, ut: { u: -bule * 0.1, t: 0.25 } },
        { u: -bule * 0.6, t: 0.7, inn: { u: -bule * 0.6, t: 0.5 }, ut: { u: -bule * 0.6, t: 0.85 } },
        { u: 0, t: 1, inn: { u: -bule * 0.3, t: 1 } },
      ];
  }
}

export function standardParametre(): LampeParametre {
  return {
    hoyde: 180,
    diameterBunn: 110,
    diameterTopp: 140,
    silhuett: silhuettForhandsvalg('bue', 18),
    monster: { type: 'ribber', antall: 24, dybde: 3 },
    vridning: 60,
    veggtykkelse: 0.8,
    sokkel: 'bambu-001',
    bunnTykkelse: 2,
    tilpasning: standardTilpasning(),
    materialId: 'pla-kritthvit',
  };
}

function tall(v: unknown, standard: number, min: number, maks: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : standard;
  return Math.min(maks, Math.max(min, n));
}

function punkt(v: unknown): { u: number; t: number } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as { u?: unknown; t?: unknown };
  if (typeof p.u !== 'number' || typeof p.t !== 'number' || !Number.isFinite(p.u) || !Number.isFinite(p.t)) {
    return undefined;
  }
  return {
    u: Math.min(GRENSER.bule.maks, Math.max(GRENSER.bule.min, p.u)),
    t: Math.min(1, Math.max(0, p.t)),
  };
}

/** Make a silhouette valid: anchors ascending in t, ends pinned to (0,0) and (0,1). */
export function normaliserSilhuett(v: unknown): ProfilPunkt[] {
  const liste = Array.isArray(v) ? v : [];
  const pk: ProfilPunkt[] = [];
  for (const r of liste) {
    const a = punkt(r);
    if (!a) continue;
    const ut = punkt((r as ProfilPunkt).ut);
    const inn = punkt((r as ProfilPunkt).inn);
    pk.push({ ...a, ...(ut ? { ut } : {}), ...(inn ? { inn } : {}) });
  }
  pk.sort((a, b) => a.t - b.t);
  if (pk.length < 2) return silhuettForhandsvalg('rett');
  pk[0] = { ...pk[0]!, u: 0, t: 0 };
  const siste = pk.length - 1;
  pk[siste] = { ...pk[siste]!, u: 0, t: 1 };
  return pk;
}

function valgfri(v: unknown, min: number, maks: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(maks, Math.max(min, v)) : null;
}

/** Make fit settings valid: clamp, fill in defaults for anything missing. */
export function normaliserTilpasning(v: unknown): Tilpasning {
  const s = standardTilpasning();
  const t = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof Tilpasning, unknown>>;
  const G = TILPASNING_GRENSER;
  const feste: Festemetode = t.feste === 'klemkant' ? 'klemkant' : 'tape';
  return {
    toleranse: tall(t.toleranse, s.toleranse, G.toleranse.min, G.toleranse.maks),
    fordypning: tall(t.fordypning, s.fordypning, G.fordypning.min, G.fordypning.maks),
    feste,
    klemkant: tall(t.klemkant, s.klemkant, G.klemkant.min, G.klemkant.maks),
    kabelHull: tall(t.kabelHull, s.kabelHull, G.kabelHull.min, G.kabelHull.maks),
    kabelBredde: tall(t.kabelBredde, s.kabelBredde, G.kabelBredde.min, G.kabelBredde.maks),
    kabelHoyde: tall(t.kabelHoyde, s.kabelHoyde, G.kabelHoyde.min, G.kabelHoyde.maks),
    gulv: tall(t.gulv, s.gulv, G.gulv.min, G.gulv.maks),
    holderHull: valgfri(t.holderHull, G.holderHull.min, G.holderHull.maks),
    modulDiameter: valgfri(t.modulDiameter, G.modulDiameter.min, G.modulDiameter.maks),
    modulHoyde: valgfri(t.modulHoyde, G.modulHoyde.min, G.modulHoyde.maks),
    provebit: t.provebit === true,
  };
}

const monstertyper: Monstertype[] = ['glatt', 'ribber', 'bolger', 'fasetter', 'diamant'];

/** Turn stored/untrusted parameters into a valid, clamped set. */
export function normaliser(v: unknown): LampeParametre {
  const s = standardParametre();
  const p = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof LampeParametre, unknown>>;
  const m = (p.monster && typeof p.monster === 'object' ? p.monster : {}) as Partial<Record<string, unknown>>;
  const type = monstertyper.includes(m.type as Monstertype) ? (m.type as Monstertype) : s.monster.type;
  const antallGrense = type === 'bolger' ? GRENSER.antallBolger : GRENSER.antall;
  const sokkel =
    typeof p.sokkel === 'string' && Object.hasOwn(maskinvare, p.sokkel) ? (p.sokkel as SokkelId) : s.sokkel;
  const materialId =
    typeof p.materialId === 'string' && materialer.some((x) => x.id === p.materialId)
      ? p.materialId
      : finnMateriale(s.materialId).id;
  return {
    hoyde: tall(p.hoyde, s.hoyde, GRENSER.hoyde.min, GRENSER.hoyde.maks),
    diameterBunn: tall(p.diameterBunn, s.diameterBunn, GRENSER.diameter.min, GRENSER.diameter.maks),
    diameterTopp: tall(p.diameterTopp, s.diameterTopp, GRENSER.diameter.min, GRENSER.diameter.maks),
    silhuett: p.silhuett === undefined ? s.silhuett : normaliserSilhuett(p.silhuett),
    monster: {
      type,
      antall: Math.round(tall(m.antall, s.monster.antall, antallGrense.min, antallGrense.maks)),
      dybde: tall(m.dybde, s.monster.dybde, GRENSER.dybde.min, GRENSER.dybde.maks),
    },
    vridning: tall(p.vridning, s.vridning, GRENSER.vridning.min, GRENSER.vridning.maks),
    veggtykkelse: tall(p.veggtykkelse, s.veggtykkelse, GRENSER.veggtykkelse.min, GRENSER.veggtykkelse.maks),
    sokkel,
    bunnTykkelse: tall(p.bunnTykkelse, s.bunnTykkelse, GRENSER.bunnTykkelse.min, GRENSER.bunnTykkelse.maks),
    tilpasning: normaliserTilpasning(p.tilpasning),
    materialId,
  };
}
