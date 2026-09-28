/**
 * Skeleton: lays the dragon out as a chain of articulated parts on the
 * bed (nose towards +X), sized so the overall length matches the chosen
 * length while every part stays large enough for its joint.
 *
 * Proportions are relative units per body variant; one scale factor is
 * solved for, then minimums from the joint standard are applied. Small
 * dragons drop tail parts rather than shrinking joints below what prints.
 */
import type { Kuppelprofil, Omriss } from './former';
import type { Sokkel } from './ledd-geometri';
import { minsteVegg } from './ledd-geometri';
import { hulromMaks, leddMal, sokkelRadius, type LeddMal } from './ledd';
import type { DrageParametre, Halevariant, Hodevariant, Kroppsvariant } from './parametre';

export type Rolle = 'hode' | 'kropp' | 'hale';

export interface Del {
  indeks: number;
  rolle: Rolle;
  navn: string;
  omriss: Omriss;
  profil: Kuppelprofil;
  /** Socket at the rear (all parts except the last). */
  sokkel?: Sokkel;
  /** Pin at the front (all parts except the head): joint X and arm end X. */
  tapp?: { jx: number; tilX: number };
}

export interface Skjelett {
  deler: Del[];
  mal: LeddMal;
  /** X of the nose tip and of the tail tip. */
  neseX: number;
  haleX: number;
  /** How far the snout reaches in front of the head outline. */
  snute: number;
  /** How far the tail tip reaches behind the last part. */
  haletupp: number;
  /** Part indices that carry wings and legs. */
  vingeDel: number;
  beinDeler: number[];
}

/** [length, width, height] in relative units. */
type Mal = [number, number, number];

interface Kroppsmal {
  hode: Mal;
  kropp: Mal[];
  hale: Mal[];
  /** Index into kropp for the wings (front legs go on kropp 0, rear legs on the last). */
  vinger: number;
}

const kroppsmaler: Record<Kroppsvariant, Kroppsmal> = {
  lubben: {
    hode: [34, 30, 22],
    kropp: [
      [16, 22, 15],
      [18, 27, 17],
      [18, 28, 17],
      [16, 25, 16],
    ],
    hale: [
      [14, 20, 13],
      [13, 17, 11],
      [12, 14, 10],
      [11, 12, 9],
      [10, 11, 8],
      [10, 10, 7],
    ],
    vinger: 1,
  },
  slank: {
    hode: [28, 22, 17],
    kropp: [
      [16, 19, 13],
      [17, 22, 14],
      [17, 22, 14],
      [16, 20, 13],
    ],
    hale: [
      [14, 17, 12],
      [13, 15, 11],
      [12, 13, 10],
      [12, 12, 9],
      [11, 11, 8],
      [10, 10, 7],
      [10, 9, 7],
    ],
    vinger: 1,
  },
  lang: {
    hode: [28, 22, 17],
    kropp: [
      [15, 19, 13],
      [16, 22, 14],
      [16, 23, 14],
      [16, 22, 14],
      [15, 20, 13],
    ],
    hale: [
      [14, 17, 12],
      [13, 15, 11],
      [12, 13, 10],
      [12, 12, 9],
      [11, 11, 8],
      [10, 10, 7],
      [10, 9, 7],
    ],
    vinger: 1,
  },
};

/** Head variant: [length ×, width ×, height ×, snout reach (× head length)]. */
const hodeformer: Record<Hodevariant, [number, number, number, number]> = {
  rund: [1, 1, 1, 0.12],
  lang: [1.1, 0.9, 0.95, 0.3],
  bred: [0.95, 1.2, 0.85, 0.14],
};

/** Tail tip reach behind the last part, × that part's length. */
const halerekkevidde: Record<Halevariant, number> = {
  spade: 1.0,
  spiss: 1.1,
  kolle: 0.55,
};

const N = 2.8;
const N_HODE = 2.3;

interface Maal {
  af: number;
  ab: number;
  b: number;
  h: number;
  /** Joint X relative to the part centre (socket parts). */
  j: number;
}

function delmaal(m: Mal, s: number, mal: LeddMal, harSokkel: boolean, veggHoyde: number, n: number): Maal {
  const R = sokkelRadius(mal);
  let af = (m[0] * s) / 2;
  let ab = (m[0] * s) / 2;
  let b = (m[1] * s) / 2;
  const h = Math.max(m[2] * s, veggHoyde + 2.5);
  // Every part carries a pin/arm at the front, so it needs some body.
  b = Math.max(b, mal.a + 2 * mal.vegg);
  af = Math.max(af, 0.6 * R);
  ab = Math.max(ab, 0.6 * R);
  if (!harSokkel) return { af, ab, b, h, j: 0 };
  ab = Math.max(ab, 1.05 * R);
  af = Math.max(af, 0.6 * R);
  b = Math.max(b, 1.12 * R);
  // Grow until the socket has its full wall all round, and the arm from the
  // front joint can end in solid body in front of this part's own cavity.
  for (let i = 0; i < 40; i++) {
    const j = -ab + Math.min(R, ab);
    af = Math.max(af, j + armEnde(mal) + mal.vegg + 0.5);
    const o: Omriss = { cx: 0, cy: 0, af, ab, b, n };
    if (minsteVegg(o, { jx: j, mal }) >= mal.vegg * 0.98) return { af, ab, b, h, j };
    b *= 1.04;
    af *= 1.02;
    ab *= 1.03;
  }
  return { af, ab, b, h, j: -ab + Math.min(R, ab) };
}

/** Where the arm ends, relative to the part's own socket: inside the wall in front of its cavity. */
function armEnde(mal: LeddMal): number {
  return hulromMaks(mal) + mal.vegg / 2;
}

interface Oppsett {
  roller: Rolle[];
  maler: Mal[];
}

/** Body parts: drop from the middle, keeping the wing and both leg parts. */
function kroppsdeler(k: Kroppsmal, antall: number): Mal[] {
  const ut = [...k.kropp];
  while (ut.length > antall) ut.splice(k.vinger + 1, 1);
  return ut;
}

function oppsett(p: DrageParametre, halestykker: number, kroppstykker: number): Oppsett {
  const k = kroppsmaler[p.kropp];
  const [lx, bx, hx] = hodeformer[p.hode];
  const hode: Mal = [k.hode[0] * lx, k.hode[1] * bx, k.hode[2] * hx];
  const kropp = kroppsdeler(k, kroppstykker);
  const hale = k.hale.slice(0, halestykker);
  return {
    roller: ['hode', ...kropp.map((): Rolle => 'kropp'), ...hale.map((): Rolle => 'hale')],
    maler: [hode, ...kropp, ...hale],
  };
}

function lengdeFor(o: Oppsett, s: number, p: DrageParametre, mal: LeddMal, veggHoyde: number): number {
  const maal = o.maler.map((m, i) =>
    delmaal(m, s, mal, i < o.maler.length - 1, veggHoyde, i === 0 ? N_HODE : N),
  );
  const snute = o.maler[0]![0] * s * hodeformer[p.hode][3];
  const sist = maal.at(-1)!;
  const tupp = (sist.af + sist.ab) * halerekkevidde[p.hale];
  const kropp = maal.reduce((sum, m) => sum + m.af + m.ab, 0);
  return snute + kropp + (maal.length - 1) * mal.mellomrom + tupp;
}

const navn: Record<Rolle, string> = { hode: 'Hode', kropp: 'Kropp', hale: 'Hale' };

export function lagSkjelett(p: DrageParametre): Skjelett {
  const mal = leddMal(p.lengde);
  const veggHoyde = mal.hulromHoyde + mal.tak;
  const k = kroppsmaler[p.kropp];

  let halestykker = k.hale.length;
  let kroppstykker = k.kropp.length;
  let o = oppsett(p, halestykker, kroppstykker);
  while (lengdeFor(o, 1e-3, p, mal, veggHoyde) > p.lengde * 0.97) {
    if (halestykker > 3) halestykker--;
    else if (kroppstykker > 3) kroppstykker--;
    else break;
    o = oppsett(p, halestykker, kroppstykker);
  }

  let lav = 1e-3;
  let hoy = 20;
  for (let i = 0; i < 60; i++) {
    const s = (lav + hoy) / 2;
    if (lengdeFor(o, s, p, mal, veggHoyde) < p.lengde) lav = s;
    else hoy = s;
  }
  const s = (lav + hoy) / 2;

  const maal = o.maler.map((m, i) =>
    delmaal(m, s, mal, i < o.maler.length - 1, veggHoyde, i === 0 ? N_HODE : N),
  );
  const snute = o.maler[0]![0] * s * hodeformer[p.hode][3];
  const sistMaal = maal.at(-1)!;
  const haletupp = (sistMaal.af + sistMaal.ab) * halerekkevidde[p.hale];

  const deler: Del[] = [];
  const teller: Record<Rolle, number> = { hode: 0, kropp: 0, hale: 0 };
  let x = -snute; // front of the current part's outline
  for (let i = 0; i < maal.length; i++) {
    const m = maal[i]!;
    const rolle = o.roller[i]!;
    teller[rolle]++;
    const cx = x - m.af;
    const del: Del = {
      indeks: i,
      rolle,
      navn: rolle === 'hode' ? 'Hode' : `${navn[rolle]} ${teller[rolle]}`,
      omriss: { cx, cy: 0, af: m.af, ab: m.ab, b: m.b, n: i === 0 ? N_HODE : N },
      profil: { vegg: veggHoyde, hoyde: m.h, ringer: 9 },
    };
    if (i < maal.length - 1) del.sokkel = { jx: cx + m.j, mal };
    const forrige = deler[i - 1];
    if (forrige?.sokkel) {
      const tilX = del.sokkel ? Math.max(cx, del.sokkel.jx + armEnde(mal)) : cx;
      del.tapp = { jx: forrige.sokkel.jx, tilX };
    }
    deler.push(del);
    x = cx - m.ab - mal.mellomrom;
  }
  const sist = deler.at(-1)!.omriss;
  const antallKropp = kroppstykker;
  return {
    deler,
    mal,
    neseX: 0,
    haleX: sist.cx - sist.ab - haletupp,
    snute,
    haletupp,
    vingeDel: 1 + k.vinger,
    beinDeler: [1, antallKropp],
  };
}
