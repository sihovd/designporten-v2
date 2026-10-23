/**
 * Base shapes (handoff: «grunnformer») with their shape variants and their
 * predefined snap points. Each shape is built from its length and
 * thickness; the snap points follow them. Plain programmatic shapes (D-3).
 *
 * A part's own frame: origin in the middle of the shape, Z along its length,
 * the front towards −Y. A part hangs on its parent at its top (+Z) and
 * carries the next part at its bottom or its sides, so a figure grows
 * downwards and outwards from the head. Snap points lie on the shape's
 * surface: each is found by going out from inside the shape along its normal.
 */
import { avrundetBoks, avrundetKjegle, ellipsoide, type Boks, type Felt } from './sdf';
import type { V3 } from './vektor';

export type Deltype = 'hode' | 'overkropp' | 'hofte' | 'arm' | 'haand' | 'ben' | 'fot' | 'hale';
export type Snaptype = 'hals' | 'skulder' | 'midje' | 'hofte' | 'handledd' | 'ankel' | 'hale';

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

export interface Variant {
  id: string;
  navn: string;
  felt(lengde: number, tykkelse: number): Felt;
  boks(lengde: number, tykkelse: number): Boks;
}

interface Punktspek {
  id: string;
  navn: string;
  type: Snaptype;
  side: 'forelder' | 'barn';
  /** A point inside the shape the search starts from. */
  fra: (l: number, t: number) => V3;
  normal: V3;
  /** Only for these variants (default: all). */
  varianter?: string[];
}

export interface Grunnform {
  type: Deltype;
  navn: string;
  beskrivelse: string;
  /** Default colour (material id). */
  farge: string;
  lengde: Grense;
  tykkelse: Grense;
  /** The first is the default. */
  varianter: Variant[];
  punkter: Punktspek[];
}

const FORAN: V3 = [0, -1, 0];
const OPP: V3 = [0, 0, 1];
const NED: V3 = [0, 0, -1];
const sentrum = (): V3 => [0, 0, 0];

/** A capsule along Z, length l (tip to tip), radius r. */
const kapsel = (l: number, r: number): Felt => {
  const rr = Math.min(r, l / 2 - 0.01);
  const k = avrundetKjegle(rr, rr, Math.max(0.02, l - 2 * rr));
  return (x, y, z) => k(x, y, z + l / 2 - rr);
};

/** A round cone along Z from radius `nede` at the bottom to `oppe` at the top, length l. */
const kjegle = (l: number, nede: number, oppe: number): Felt => {
  const r1 = Math.min(nede, l / 2 - 0.5),
    r2 = Math.min(oppe, l / 2 - 0.5);
  const h = Math.max(Math.abs(r1 - r2) + 0.1, l - r1 - r2);
  const k = avrundetKjegle(r1, r2, h);
  return (x, y, z) => k(x, y, z + l / 2 - r1);
};

/** Squeezes a field front to back (the shape is `f` times as deep as it is wide). */
const flat =
  (g: Felt, f: number): Felt =>
  (x, y, z) =>
    g(x, y / f, z) * Math.min(1, f);

const flytt =
  (g: Felt, dy: number): Felt =>
  (x, y, z) =>
    g(x, y - dy, z);

const boks = (hx: number, hy: number, hz: number, dy = 0): Boks => ({
  min: [-hx, -hy + dy, -hz],
  maks: [hx, hy + dy, hz],
});

const rund = (navn = 'Rund', dybde = 0.92): Variant => ({
  id: 'rund',
  navn,
  felt: (l, t) => ellipsoide(t / 2, (t / 2) * dybde, l / 2),
  boks: (l, t) => boks(t / 2, (t / 2) * dybde, l / 2),
});

const kloss = (navn = 'Kloss', dybde = 0.85): Variant => ({
  id: 'kloss',
  navn,
  felt: (l, t) => avrundetBoks(t / 2, (t / 2) * dybde, l / 2, Math.min(t, l) * 0.22),
  boks: (l, t) => boks(t / 2, (t / 2) * dybde, l / 2),
});

const lem = (smalNede: boolean): Variant[] => [
  {
    id: 'rett',
    navn: 'Rett',
    felt: (l, t) => kapsel(l, t / 2),
    boks: (l, t) => boks(t / 2, t / 2, l / 2),
  },
  {
    id: 'kraftig',
    navn: 'Kraftig',
    felt: (l, t) => (smalNede ? kjegle(l, t * 0.36, t / 2) : kjegle(l, t / 2, t * 0.36)),
    boks: (l, t) => boks(t / 2, t / 2, l / 2),
  },
];

const topp = (id: string, navn: string, type: Snaptype): Punktspek => ({
  id,
  navn,
  type,
  side: 'barn',
  fra: sentrum,
  normal: OPP,
});
const bunn = (id: string, navn: string, type: Snaptype, varianter?: string[]): Punktspek => ({
  id,
  navn,
  type,
  side: 'forelder',
  fra: sentrum,
  normal: NED,
  varianter,
});

const TORSO_DYBDE = 0.8;

export const grunnformer: Record<Deltype, Grunnform> = {
  hode: {
    type: 'hode',
    navn: 'Hode',
    beskrivelse: 'Figuren starter her.',
    farge: 'pla-lilla',
    lengde: { min: 18, maks: 70, standard: 34 },
    tykkelse: { min: 18, maks: 70, standard: 36 },
    varianter: [rund(), kloss('Kantet')],
    punkter: [bunn('hals', 'Hals', 'hals')],
  },
  overkropp: {
    type: 'overkropp',
    navn: 'Overkropp',
    beskrivelse: 'Henger i hodets hals og bærer armer og hofte.',
    farge: 'matt-sand',
    lengde: { min: 24, maks: 90, standard: 48 },
    tykkelse: { min: 18, maks: 70, standard: 34 },
    varianter: [
      {
        id: 'paere',
        navn: 'Pære',
        felt: (l, t) => flat(kjegle(l, t / 2, t * 0.4), TORSO_DYBDE),
        boks: (l, t) => boks(t / 2, (t / 2) * TORSO_DYBDE, l / 2),
      },
      {
        id: 'tonne',
        navn: 'Tønne',
        felt: (l, t) => ellipsoide(t / 2, (t / 2) * TORSO_DYBDE, l / 2),
        boks: (l, t) => boks(t / 2, (t / 2) * TORSO_DYBDE, l / 2),
      },
      kloss('Kloss', TORSO_DYBDE),
    ],
    punkter: [
      topp('hals', 'Hals', 'hals'),
      {
        id: 'skulder-v',
        navn: 'Venstre skulder',
        type: 'skulder',
        side: 'forelder',
        fra: (l) => [0, 0, l * 0.26],
        normal: [1, 0, 0],
      },
      {
        id: 'skulder-h',
        navn: 'Høyre skulder',
        type: 'skulder',
        side: 'forelder',
        fra: (l) => [0, 0, l * 0.26],
        normal: [-1, 0, 0],
      },
      bunn('midje', 'Midje', 'midje'),
    ],
  },
  hofte: {
    type: 'hofte',
    navn: 'Hofte',
    beskrivelse: 'Henger under overkroppen og bærer bein og hale.',
    farge: 'matt-marine',
    lengde: { min: 10, maks: 50, standard: 20 },
    tykkelse: { min: 18, maks: 70, standard: 32 },
    varianter: [rund('Rund', 0.75), kloss('Kloss', 0.7)],
    punkter: [
      topp('midje', 'Midje', 'midje'),
      {
        id: 'hofte-v',
        navn: 'Venstre hofte',
        type: 'hofte',
        side: 'forelder',
        fra: (_l, t) => [t * 0.32, 0, 0],
        normal: NED,
      },
      {
        id: 'hofte-h',
        navn: 'Høyre hofte',
        type: 'hofte',
        side: 'forelder',
        fra: (_l, t) => [-t * 0.32, 0, 0],
        normal: NED,
      },
      // behind the legs, pointing down so the tail lies on the plate when the figure prints on its back
      {
        id: 'hale',
        navn: 'Hale',
        type: 'hale',
        side: 'forelder',
        fra: (_l, t) => [0, t * 0.24, 0],
        normal: NED,
      },
    ],
  },
  arm: {
    type: 'arm',
    navn: 'Arm',
    beskrivelse: 'Henger i en skulder og bærer en hånd.',
    farge: 'pla-lilla',
    lengde: { min: 12, maks: 70, standard: 28 },
    tykkelse: { min: 8, maks: 30, standard: 12 },
    varianter: lem(false),
    punkter: [topp('skulder', 'Skulder', 'skulder'), bunn('handledd', 'Håndledd', 'handledd')],
  },
  haand: {
    type: 'haand',
    navn: 'Hånd',
    beskrivelse: 'Henger i håndleddet på en arm.',
    farge: 'matt-sand',
    lengde: { min: 6, maks: 30, standard: 12 },
    tykkelse: { min: 6, maks: 30, standard: 12 },
    varianter: [
      {
        id: 'vott',
        navn: 'Vott',
        felt: (l, t) => ellipsoide(t / 2, (t / 2) * 0.7, l / 2),
        boks: (l, t) => boks(t / 2, (t / 2) * 0.7, l / 2),
      },
      rund('Rund', 0.95),
    ],
    punkter: [topp('handledd', 'Håndledd', 'handledd')],
  },
  ben: {
    type: 'ben',
    navn: 'Ben',
    beskrivelse: 'Henger i en hofte og bærer en fot.',
    farge: 'pla-lilla',
    lengde: { min: 12, maks: 70, standard: 28 },
    tykkelse: { min: 8, maks: 30, standard: 13 },
    varianter: lem(true),
    punkter: [topp('hofte', 'Hofte', 'hofte'), bunn('ankel', 'Ankel', 'ankel')],
  },
  fot: {
    type: 'fot',
    navn: 'Fot',
    beskrivelse: 'Henger i ankelen og peker framover.',
    farge: 'matt-marine',
    lengde: { min: 6, maks: 30, standard: 11 },
    tykkelse: { min: 8, maks: 30, standard: 13 },
    varianter: [
      {
        id: 'stovel',
        navn: 'Støvel',
        felt: (l, t) => flytt(avrundetBoks(t / 2, t * 0.75, l / 2, Math.min(t, l) * 0.35), -t * 0.3),
        boks: (l, t) => boks(t / 2, t * 0.75, l / 2, -t * 0.3),
      },
      {
        id: 'rund',
        navn: 'Rund',
        felt: (l, t) => flytt(ellipsoide(t / 2, t * 0.7, l / 2), -t * 0.25),
        boks: (l, t) => boks(t / 2, t * 0.7, l / 2, -t * 0.25),
      },
    ],
    punkter: [topp('ankel', 'Ankel', 'ankel')],
  },
  hale: {
    type: 'hale',
    navn: 'Hale',
    beskrivelse: 'Et haleledd. Flere ledd etter hverandre blir en løs kjede.',
    farge: 'pla-lilla',
    lengde: { min: 8, maks: 60, standard: 20 },
    tykkelse: { min: 5, maks: 30, standard: 9 },
    varianter: [
      {
        id: 'ledd',
        navn: 'Ledd',
        felt: (l, t) => kapsel(l, t / 2),
        boks: (l, t) => boks(t / 2, t / 2, l / 2),
      },
      {
        id: 'spiss',
        navn: 'Spiss',
        felt: (l, t) => kjegle(l, t * 0.12, t / 2),
        boks: (l, t) => boks(t / 2, t / 2, l / 2),
      },
    ],
    // only a joint segment carries the next one; the tip ends the tail
    punkter: [topp('hale', 'Hale', 'hale'), bunn('hale-ende', 'Haleende', 'hale', ['ledd'])],
  },
};

export const delrekkefolge: Deltype[] = ['hode', 'overkropp', 'hofte', 'arm', 'haand', 'ben', 'fot', 'hale'];

export interface Formdata {
  type: Deltype;
  variant?: string;
  lengde: number;
  tykkelse: number;
}

export function variantAv(d: Formdata): Variant {
  const g = grunnformer[d.type];
  return g.varianter.find((v) => v.id === d.variant) ?? g.varianter[0]!;
}

export const feltFor = (d: Formdata): Felt => variantAv(d).felt(d.lengde, d.tykkelse);
export const boksFor = (d: Formdata): Boks => variantAv(d).boks(d.lengde, d.tykkelse);

/** Where a ray from inside the shape along `n` leaves it (bisection to 1e-9 mm). */
function paOverflate(f: Felt, fra: V3, n: V3): V3 {
  const p = (s: number): V3 => [fra[0] + n[0] * s, fra[1] + n[1] * s, fra[2] + n[2] * s];
  if (f(...fra) >= 0) return fra;
  let inne = 0,
    ute = 0.5;
  while (f(...p(ute)) < 0 && ute < 400) {
    inne = ute;
    ute *= 2;
  }
  for (let i = 0; i < 60 && ute - inne > 1e-9; i++) {
    const m = (inne + ute) / 2;
    if (f(...p(m)) < 0) inne = m;
    else ute = m;
  }
  return p((inne + ute) / 2);
}

const rundAv = (v: V3): V3 => v.map((x) => Math.round(x * 1e6) / 1e6 + 0) as V3;

/** The snap points of a part as it is now (length, thickness, variant). */
export function snappunkterFor(d: Formdata): Snappunkt[] {
  const g = grunnformer[d.type];
  const v = variantAv(d);
  const f = v.felt(d.lengde, d.tykkelse);
  return g.punkter
    .filter((s) => !s.varianter || s.varianter.includes(v.id))
    .map((s) => ({
      id: s.id,
      navn: s.navn,
      type: s.type,
      side: s.side,
      posisjon: rundAv(paOverflate(f, s.fra(d.lengde, d.tykkelse), s.normal)),
      normal: s.normal,
      opp: FORAN,
    }));
}
