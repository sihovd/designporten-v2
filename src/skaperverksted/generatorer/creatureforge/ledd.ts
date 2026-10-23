/**
 * The joint profile and the two candidate mechanisms (F1, under test).
 *
 * Both are built in the joint's own frame: t along the joint axis (from the
 * parent towards the child), v up (up in the print pose, the figure's front)
 * and s = v × t. Every face that prints over air is 45° or steeper there, so
 * the joint prints in place without supports when the figure lies on its
 * back.
 *
 * - **Chain joint (`kjede`, default):** an eye on the parent and a capped
 *   bolt on the child through it, like two links of a chain. The bolt can
 *   shift in the eye by the play and turn about its own axis, so the joint
 *   dangles; the cap is wider than the eye's hole, so it cannot come out.
 * - **Knob joint (`knott`, exploratory):** a knob on a neck from the child,
 *   held in a cavity in the parent whose opening is narrower than the knob.
 *
 * Each mechanism also says which room the partner needs: the partner's
 * parts grown by the clearance and the play, swept through the swing.
 * Nothing here is physically tested.
 */
import {
  bikjegle,
  diamantring,
  diamantstang,
  sveiptStang,
  sylinder,
  TOM,
  union,
  vokse,
  type Boks,
  type Felt,
} from './sdf';
import type { CfParametre, Mekanisme } from './parametre';
import type { V3 } from './vektor';

export type Sikkerhet = 'proveverdi' | 'designvalg' | 'malt';

export const SIKKERHET_NAVN: Record<Sikkerhet, string> = {
  proveverdi: 'Prøveverdi',
  designvalg: 'Designvalg',
  malt: 'Målt',
};

export interface Maal {
  navn: string;
  verdi: number;
  enhet: 'mm' | '°';
  sikkerhet: Sikkerhet;
  forklaring: string;
}

export interface Leddprofil {
  id: string;
  versjon: string;
  navn: string;
  fysiskStatus: 'ikke-testet' | 'testet';
  merknad: string;
  /**
   * Where the mechanism turns: at the joint point (0.1.0), or in the centre of the dome's sphere (0.2.0).
   * With the pivot in the dome's centre the two parts slide along the dome's spherical gap, which stays
   * the same width at any angle, so only shapes outside the dome limit the swing.
   */
  dreiepunkt?: 'ledd' | 'kuppel';
  /** The mechanisms this profile offers; the first is what a new joint gets. */
  mekanismer: Mekanisme[];
  maal: {
    klaring: Maal;
    spillerom: Maal;
    sving: Maal;
    minVegg: Maal;
    minFang: Maal;
    oye: Maal;
    bolt: Maal;
    hette: Maal;
    arm: Maal;
    stang: Maal;
    knott: Maal;
    knotthals: Maal;
    stift: Maal;
  };
}

const mm = (navn: string, verdi: number, sikkerhet: Sikkerhet, forklaring: string): Maal => ({
  navn,
  verdi,
  enhet: 'mm',
  sikkerhet,
  forklaring,
});

export const KJEDELEDD_PROVE: Leddprofil = {
  id: 'kjedeledd-prove',
  versjon: '0.1.0',
  navn: 'Kjedeledd, prøveprofil',
  fysiskStatus: 'ikke-testet',
  mekanismer: ['kjede', 'knott'],
  merknad:
    'Prøveprofil for fase 1. Ingen del er testprintet, så det er ikke kjent om leddene løsner etter print, sitter fast eller tåler bruk.',
  maal: {
    klaring: mm(
      'Utskriftsklaring',
      0.4,
      'proveverdi',
      'Minste luft mellom flater som skal bevege seg mot hverandre.',
    ),
    spillerom: mm('Spillerom', 0.6, 'designvalg', 'Ekstra luft i mekanismen, så leddet dingler løst.'),
    sving: {
      navn: 'Sving',
      verdi: 35,
      enhet: '°',
      sikkerhet: 'designvalg',
      forklaring: 'Hvor langt mekanismen skjæres fri til hver side om sin akse.',
    },
    minVegg: mm('Minste vegg', 1.2, 'proveverdi', 'Tynnere materiale enn dette rundt leddet varsles.'),
    minFang: mm(
      'Minste fangst',
      0.4,
      'designvalg',
      'Hvor mye større hetten eller knotten må være enn åpningen.',
    ),
    oye: mm('Øyets tykkelse', 1.6, 'designvalg', 'Halv diagonal i øyets rutertverrsnitt.'),
    bolt: mm('Boltens radius', 1.6, 'designvalg', 'Bolten går gjennom øyet.'),
    hette: mm('Hettens radius', 3.8, 'designvalg', 'Hetten på bolten holder øyet fanget.'),
    arm: mm('Armens tykkelse', 1.6, 'designvalg', 'Halv diagonal i armen som bærer bolten.'),
    stang: mm('Innfesting', 6, 'designvalg', 'Hvor langt øyet og armen går inn i sin egen del.'),
    knott: mm('Knottens radius', 4.2, 'designvalg', 'Knottleddet: knotten som holdes i hulrommet.'),
    knotthals: mm('Knottens hals', 1.6, 'designvalg', 'Knottleddet: halv diagonal i halsen.'),
    stift: mm(
      'Stiftens tykkelse',
      1.2,
      'designvalg',
      'Stiftleddet: halv diagonal i stiftenes rutertverrsnitt.',
    ),
  },
};

/**
 * 0.2.0 (2026-10-23, Sivert asked for more movement than 25°): the pivot moves to the centre of the
 * dome's sphere, and the mechanism is cut free for ±60°. The child's arm or knob neck reaches from the
 * pivot through the dome into the child. All other values as 0.1.0.
 */
export const KJEDELEDD_PROVE_2: Leddprofil = {
  ...KJEDELEDD_PROVE,
  versjon: '0.2.0',
  merknad:
    'Prøveprofil. Mekanismen dreier om kuppelens sentrum, så delene glir langs kuppelens kulegap. Ingen del er testprintet, så det er ikke kjent om leddene løsner etter print, sitter fast eller tåler bruk.',
  dreiepunkt: 'kuppel',
  maal: {
    ...KJEDELEDD_PROVE.maal,
    sving: { ...KJEDELEDD_PROVE.maal.sving, verdi: 60 },
  },
};

/**
 * The staple joint (Sivert, 2026-10-23: «koblingen skal være som to stifter festet i hver sin del»):
 * two U-shaped staples, one anchored in each part, hooked through each other like two links of a
 * chain, in a cavity the dome cuts in both parts. The joint turns about the point where they cross.
 */
export const STIFTLEDD_PROVE: Leddprofil = {
  ...KJEDELEDD_PROVE,
  id: 'stiftledd-prove',
  versjon: '0.1.0',
  navn: 'Stiftledd, prøveprofil',
  merknad:
    'Prøveprofil. To stifter, én i hver del, er hektet i hverandre i et hulrom kuppelen skjærer ut. Ingen del er testprintet, så det er ikke kjent om stiftene løsner etter print, sitter fast eller tåler bruk.',
  dreiepunkt: 'ledd',
  mekanismer: ['stifter'],
  maal: {
    ...KJEDELEDD_PROVE.maal,
    sving: { ...KJEDELEDD_PROVE.maal.sving, verdi: 60 },
    stang: mm('Innfesting', 5, 'designvalg', 'Hvor langt stiftenes bein går inn i sin egen del.'),
  },
};

/** The profile new projects get. */
export const STANDARDPROFIL = STIFTLEDD_PROVE;

const profiler = [KJEDELEDD_PROVE, KJEDELEDD_PROVE_2, STIFTLEDD_PROVE];

export function finnProfil(id: string, versjon: string): Leddprofil | undefined {
  return profiler.find((p) => p.id === id && p.versjon === versjon);
}

export interface Toleranser {
  klaring: number;
  spillerom: number;
  /** Which values are the user's own. */
  egne: { klaring: boolean; spillerom: boolean };
}

export function toleranser(p: CfParametre, profil: Leddprofil): Toleranser {
  const t = p.toleranser ?? {};
  return {
    klaring: t.klaring ?? profil.maal.klaring.verdi,
    spillerom: t.spillerom ?? profil.maal.spillerom.verdi,
    egne: { klaring: t.klaring !== undefined, spillerom: t.spillerom !== undefined },
  };
}

export interface Mekanismeform {
  /** Added to the parent / the child (joint frame). */
  forelderPluss: Felt;
  barnPluss: Felt;
  /** Cut from the parent / the child: the partner's parts grown and swept. */
  romForelder: Felt;
  romBarn: Felt;
  /** Everything above lies in this box (joint frame). */
  boks: Boks;
  /** The axis the joint swings about (joint frame). */
  svingakse: { punkt: V3; akse: V3 };
  /** The axis the joint nods about (fram og tilbake); without it, the joint's side axis through the swing axis's point. */
  nikkakse?: { punkt: V3; akse: V3 };
  /** How much wider the held part is than the opening it would have to pass (mm). */
  fangst: number;
  /** What holds the parts together, for the findings. */
  fangstTekst: string;
}

export const MEKANISMER: { id: Mekanisme; navn: string; beskrivelse: string }[] = [
  {
    id: 'stifter',
    navn: 'Stifter',
    beskrivelse:
      'To U-formede stifter, én festet i hver del, hektet i hverandre som to ledd i en kjetting. Leddet dingler løst i alle retninger.',
  },
  {
    id: 'kjede',
    navn: 'Kjedeledd',
    beskrivelse: 'Et øye på foreldredelen og en bolt med hette på barnet, som to ledd i en kjetting.',
  },
  {
    id: 'knott',
    navn: 'Knottledd (utforskes)',
    beskrivelse: 'En knott på barnet holdes i et hulrom i foreldredelen. Bare til sammenligning.',
  },
];

const R2 = Math.SQRT2;

/** Moves a local field along the frame axes. */
const flytt =
  (f: Felt, dt: number, ds: number, dv: number): Felt =>
  (t, s, v) =>
    f(t - dt, s - ds, v - dv);
/** Points a field built along +t the other way. */
const snu =
  (f: Felt): Felt =>
  (t, s, v) =>
    f(-t, -s, v);

/**
 * `rekkevidde`: how far (mm, along +t from the pivot) the child's part must reach to get through the
 * dome into the child; 0 when the pivot is the joint point. Only the child's arm or knob neck gets
 * longer; the parent's eye and the held parts keep their size.
 */
export function mekanisme(
  type: Mekanisme,
  profil: Leddprofil,
  tol: Toleranser,
  rekkevidde = 0,
): Mekanismeform {
  const m = profil.maal;
  const luft = tol.klaring + tol.spillerom;
  const sving = m.sving.verdi;
  const stang = m.stang.verdi;

  if (type === 'stifter') return stifter(profil, tol, rekkevidde);

  if (type === 'knott') {
    const rk = m.knott.verdi,
      eh = m.knotthals.verdi;
    // the knob sits on the pivot, or inside the parent clear of a dome of ordinary thickness
    const tk = rekkevidde > 0 ? 0 : -(rk + luft + 4);
    const halsende = Math.max(stang, rekkevidde + stang);
    const knott = flytt(bikjegle(rk), tk, 0, 0);
    const hals = diamantstang(tk, halsende, eh);
    const rom = union(
      vokse(knott, luft),
      vokse(flytt(sveiptStang(0, -tk + halsende, eh, sving), tk, 0, 0), luft),
    );
    const halvbredde = rk + luft + halsende;
    return {
      forelderPluss: TOM,
      barnPluss: union(knott, hals),
      romForelder: rom,
      romBarn: TOM,
      boks: {
        min: [tk - rk - luft - 1, -halvbredde, -rk - luft - 1],
        maks: [halsende + 1, halvbredde, rk + luft + 1],
      },
      svingakse: { punkt: [tk, 0, 0], akse: [0, 0, 1] },
      fangst: rk - (eh + luft * R2),
      fangstTekst: 'Knotten er bredere enn halsens åpning i hulrommet',
    };
  }

  const e = m.oye.verdi,
    rb = m.bolt.verdi,
    rc = m.hette.verdi,
    ea = m.arm.verdi;
  const ri = rb + luft;
  const Re = ri + e;
  const ytre = Re + e + stang;
  // the child's arm reaches through the dome when the pivot sits in the dome's centre
  const armende = Math.max(ytre, rekkevidde + stang);
  // the eye lies in v = 0; the cap above it and the arm below, each a clearance and the play away
  const vHette = e + luft + (rc - rb);
  const vArm = -(e + luft + ea);
  // with the pivot in the dome, the arm lies in the pivot's plane and the eye and cap above it, inside
  // the thick middle of the parent; otherwise the eye lies in the joint's plane
  const dv = rekkevidde > 0 ? -vArm : 0;
  const v = (f: Felt): Felt => (dv ? flytt(f, 0, 0, dv) : f);
  const oye = v(union(diamantring(Re, e), snu(diamantstang(Re, ytre, e))));
  const hette = v(flytt(bikjegle(rc), 0, 0, vHette));
  const bolt = v(sylinder(rb, vArm, vHette));
  const arm = v(diamantstang(0, armende, ea, vArm));
  return {
    forelderPluss: oye,
    barnPluss: union(hette, bolt, arm),
    // the parent keeps out of the bolt and cap (they turn in place) and the arm's swing
    romForelder: union(
      vokse(union(hette, bolt), luft),
      vokse(v(sveiptStang(0, armende, ea, sving, vArm)), luft),
    ),
    // the child keeps out of the ring and the swing of the eye's stem
    romBarn: vokse(v(union(diamantring(Re, e), snu(sveiptStang(Re, ytre, e, sving)))), luft),
    boks: {
      min: [-ytre - luft - 1, -armende - luft - 1, vArm - ea - luft - 1 + dv],
      maks: [armende + luft + 1, armende + luft + 1, vHette + rc + luft + 1 + dv],
    },
    svingakse: { punkt: [0, 0, 0], akse: [0, 0, 1] },
    fangst: rc - ri,
    fangstTekst: 'Hetten på bolten er bredere enn hullet i øyet',
  };
}

/** A bar along s at t = t0, v = v0 (diamond cross-section in t and v), from s0 to s1. */
const tverrS =
  (t0: number, v0: number, s0: number, s1: number, e: number): Felt =>
  (t, s, v) =>
    Math.max((Math.abs(t - t0) + Math.abs(v - v0) - e) * R2_INV, Math.abs(s - (s0 + s1) / 2) - (s1 - s0) / 2);
/** A bar along v at t = t0, s = 0 (diamond cross-section in t and s), from v0 to v1. */
const tverrV =
  (t0: number, v0: number, v1: number, e: number): Felt =>
  (t, s, v) =>
    Math.max((Math.abs(t - t0) + Math.abs(s) - e) * R2_INV, Math.abs(v - (v0 + v1) / 2) - (v1 - v0) / 2);
const R2_INV = Math.SQRT1_2;

/**
 * Two staples hooked through each other. The parent's lies flat in the joint's t–s plane (flat on
 * the plate in the print pose), its two legs anchored in the parent and its crossbar a little past the
 * joint point towards the child. The child's stands in the t–v plane, its legs anchored in the child
 * and its crossbar a little past the joint point towards the parent, upright in the print pose. Each
 * crossbar passes through the other staple's loop. Every bar has a diamond cross-section, so every
 * face that prints over air is at 45°. `rekkevidde` is half the dome's thickness: the legs reach from
 * the cavity that far into their own part, plus the anchoring.
 */
function stifter(profil: Leddprofil, tol: Toleranser, rekkevidde: number): Mekanismeform {
  const m = profil.maal;
  const luft = tol.klaring + tol.spillerom;
  const e = m.stift.verdi;
  // the crossbars sit k either side of the joint point, a clearance and some play apart
  const k = e + luft / 2 + 0.3;
  // inside each loop there is room for the other crossbar with the clearance and the play
  const bredde = 2 * e + luft + 0.6;
  const ende = Math.max(rekkevidde, k + e + luft) + m.stang.verdi;
  const forelder = union(
    flyttS(diamantstang(-ende, k, e), bredde),
    flyttS(diamantstang(-ende, k, e), -bredde),
    tverrS(k, 0, -bredde, bredde, e),
  );
  const barn = union(
    diamantstang(-k, ende, e, bredde),
    diamantstang(-k, ende, e, -bredde),
    tverrV(-k, -bredde, bredde, e),
  );
  const ytre = bredde + e + luft + 1;
  return {
    forelderPluss: forelder,
    barnPluss: barn,
    // each part keeps the other's staple at the clearance and the play, wherever the dome leaves it
    romForelder: vokse(barn, luft),
    romBarn: vokse(forelder, luft),
    boks: { min: [-ende - 1, -ytre, -ytre], maks: [ende + 1, ytre, ytre] },
    // hooked staples turn about each other's crossbars: sideways about the child's, nodding about the parent's
    svingakse: { punkt: [-k, 0, 0], akse: [0, 0, 1] },
    nikkakse: { punkt: [k, 0, 0], akse: [0, 1, 0] },
    // hooked through each other: to come apart, a crossbar would have to pass through the other bar
    fangst: 2 * e,
    fangstTekst: 'Stiftene er hektet i hverandre',
  };
}

/** Moves a field along s. */
const flyttS =
  (f: Felt, ds: number): Felt =>
  (t, s, v) =>
    f(t, s - ds, v);
