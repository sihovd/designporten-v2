/**
 * Base shapes (handoff: «grunnformer») with their predefined snap points.
 * Phase 1 has the head and the upper body. Each shape is built from its
 * length and thickness; the snap points follow them. Plain programmatic
 * shapes (D-3).
 *
 * A part's own frame: origin in the middle of the shape, Z along its length
 * (up), the front towards −Y.
 */
import { avrundetKjegle, ellipsoide, type Boks, type Felt } from './sdf';
import type { V3 } from './vektor';

export type Deltype = 'hode' | 'overkropp';
export type Snaptype = 'hals' | 'skulder' | 'hofte';

export interface Snappunkt {
  id: string;
  navn: string;
  type: Snaptype;
  /** `forelder`: the next part hangs here. `barn`: this is where the part itself hangs on its parent. */
  side: 'forelder' | 'barn';
  posisjon: V3;
  /** Outward, unit length. */
  normal: V3;
  /** The joint's up direction (perpendicular to the normal): up in the print pose, the figure's front. */
  opp: V3;
}

export interface Grense {
  min: number;
  maks: number;
  standard: number;
}

export interface Grunnform {
  type: Deltype;
  navn: string;
  beskrivelse: string;
  /** Default colour (material id). */
  farge: string;
  lengde: Grense;
  tykkelse: Grense;
  felt(lengde: number, tykkelse: number): Felt;
  boks(lengde: number, tykkelse: number): Boks;
  snappunkter(lengde: number, tykkelse: number): Snappunkt[];
}

const FORAN: V3 = [0, -1, 0];
/** The upper body is flatter front to back than it is wide. */
const DYBDE = 0.8;

export const hode: Grunnform = {
  type: 'hode',
  navn: 'Hode',
  beskrivelse: 'Et rundt hode. Figuren starter her.',
  farge: 'pla-lilla',
  lengde: { min: 18, maks: 70, standard: 34 },
  tykkelse: { min: 18, maks: 70, standard: 36 },
  felt: (l, t) => ellipsoide(t / 2, (t / 2) * 0.92, l / 2),
  boks: (l, t) => ({ min: [-t / 2, -t * 0.46, -l / 2], maks: [t / 2, t * 0.46, l / 2] }),
  snappunkter: (l) => [
    {
      id: 'hals',
      navn: 'Hals',
      type: 'hals',
      side: 'forelder',
      posisjon: [0, 0, -l / 2],
      normal: [0, 0, -1],
      opp: FORAN,
    },
  ],
};

/** Radii of the upper body: wide at the bottom, a little narrower at the shoulders. */
function kroppsmal(l: number, t: number) {
  const r1 = Math.min(t / 2, l / 2 - 1);
  const r2 = Math.min(r1 * 0.8, l / 2 - 1);
  return { r1, r2, z0: -l / 2 + r1, z1: l / 2 - r2 };
}

export const overkropp: Grunnform = {
  type: 'overkropp',
  navn: 'Overkropp',
  beskrivelse: 'En overkropp som henger i hodets hals.',
  farge: 'matt-sand',
  lengde: { min: 24, maks: 90, standard: 48 },
  tykkelse: { min: 18, maks: 70, standard: 34 },
  felt(l, t) {
    const { r1, r2, z0, z1 } = kroppsmal(l, t);
    const kjegle = avrundetKjegle(r1, r2, Math.max(0.5, z1 - z0));
    return (x, y, z) => kjegle(x, y / DYBDE, z - z0) * DYBDE;
  },
  boks: (l, t) => {
    const { r1 } = kroppsmal(l, t);
    return { min: [-r1, -r1 * DYBDE, -l / 2], maks: [r1, r1 * DYBDE, l / 2] };
  },
  snappunkter(l, t) {
    const { r1, r2, z1 } = kroppsmal(l, t);
    const skulderZ = z1 - r2 * 0.2;
    const skulderX = (r2 + r1) / 2;
    return [
      {
        id: 'hals',
        navn: 'Hals',
        type: 'hals',
        side: 'barn',
        posisjon: [0, 0, l / 2],
        normal: [0, 0, 1],
        opp: FORAN,
      },
      // the points below wait for arms and legs (phase 3); nothing can attach to them yet
      {
        id: 'skulder-v',
        navn: 'Venstre skulder',
        type: 'skulder',
        side: 'forelder',
        posisjon: [skulderX, 0, skulderZ],
        normal: [1, 0, 0],
        opp: FORAN,
      },
      {
        id: 'skulder-h',
        navn: 'Høyre skulder',
        type: 'skulder',
        side: 'forelder',
        posisjon: [-skulderX, 0, skulderZ],
        normal: [-1, 0, 0],
        opp: FORAN,
      },
      {
        id: 'hofte',
        navn: 'Hofte',
        type: 'hofte',
        side: 'forelder',
        posisjon: [0, 0, -l / 2],
        normal: [0, 0, -1],
        opp: FORAN,
      },
    ];
  },
};

export const grunnformer: Record<Deltype, Grunnform> = { hode, overkropp };
export const delrekkefolge: Deltype[] = ['hode', 'overkropp'];
