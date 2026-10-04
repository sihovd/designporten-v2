/**
 * The figure family: a figure built from segments (head, body, arms, legs,
 * hands, feet), each with its own layer of shapes, joined by swivel joints.
 *
 * Every joint is a peg on the parent segment that goes into a blind hole in
 * the child, along the joint axis. Each segment's decoration is cut back to
 * its own side of a plane through the joint, so neighbouring parts keep a
 * gap. Because the joint turns about the plane's normal, the two parts it
 * joins stay clear of each other when it turns; other parts (an arm against
 * a leg) are not checked through the motion.
 *
 * As with the clicker, every mechanical number comes from a profile that
 * the project only names. The only joint profile is a trial profile: no
 * figure has been printed, so the peg fit is not confirmed.
 *
 * Joint positions come from the base model chosen for each segment, so a
 * longer body moves the head and arms with everything attached to them.
 * Shapes are stored relative to their segment's joint. Pairs (arms, legs,
 * hands, feet) are edited on the figure's left side (+X) and mirrored.
 */
import { nyId } from '../../core/dokument';
import { MeshBygger, type Mesh } from '../../geometri/mesh';
import type { Maal } from './profil';
import type { FigurKropp, Form, Formtype } from './parametre';
import { prisme, sirkel } from './prisme';
import { sylinder, type Boks, type Felt, type V3 } from './sdf';

export interface Leddprofil {
  id: string;
  versjon: string;
  navn: string;
  fysiskStatus: 'ikke-testet' | 'testet';
  merknad: string;
  maal: {
    pluggDiameter: Maal;
    /** Extra radius of the hole over the peg. Decides whether the joint turns stiffly or loosely. */
    radialKlaring: Maal;
    hullDybde: Maal;
    /** How far the peg reaches back into its own segment. */
    pluggInnfesting: Maal;
    /** Wall around the hole and above its bottom. */
    vegg: Maal;
    /** Gap between neighbouring parts at the joint. */
    mellomrom: Maal;
    /** Space between the end of the peg and the bottom of the hole. */
    endeklaring: Maal;
  };
}

export const FIGURLEDD_PROVE: Leddprofil = {
  id: 'figurledd-prove',
  versjon: '0.1.0',
  navn: 'Pluggledd, prøveprofil',
  fysiskStatus: 'ikke-testet',
  merknad:
    'Prøveprofil. Ingen figur er testprintet, så det er ikke kjent om pluggene sitter for stramt eller for løst. Leddene holdes bare av friksjon.',
  maal: {
    pluggDiameter: { navn: 'Pluggdiameter', verdi: 5, sikkerhet: 'proveverdi' },
    radialKlaring: { navn: 'Klaring rundt pluggen', verdi: 0.2, sikkerhet: 'proveverdi' },
    hullDybde: { navn: 'Hulldybde', verdi: 6, sikkerhet: 'designstandard' },
    pluggInnfesting: { navn: 'Plugg inn i egen del', verdi: 4, sikkerhet: 'designstandard' },
    vegg: { navn: 'Vegg rundt hullet', verdi: 1.6, sikkerhet: 'designstandard' },
    mellomrom: { navn: 'Mellomrom ved leddet', verdi: 0.6, sikkerhet: 'proveverdi' },
    endeklaring: { navn: 'Klaring ved pluggenden', verdi: 0.5, sikkerhet: 'proveverdi' },
  },
};

const leddprofiler = [FIGURLEDD_PROVE];

export function finnLeddprofil(id: string, versjon: string): Leddprofil | undefined {
  return leddprofiler.find((p) => p.id === id && p.versjon === versjon);
}

/** Extra space between decoration and the hole, beyond the hole itself. */
const SPERREMARGIN = 0.5;

export interface Leddmal {
  pluggRadius: number;
  hullRadius: number;
  bossRadius: number;
  /** Where the child's face and the start of its hole are, along the axis. */
  flate: number;
  hullBunn: number;
  bossTopp: number;
  pluggStart: number;
  pluggEnde: number;
  sperreRadius: number;
}

export function leddmal(p: Leddprofil): Leddmal {
  const m = p.maal;
  const pluggRadius = m.pluggDiameter.verdi / 2;
  const hullRadius = pluggRadius + m.radialKlaring.verdi;
  const flate = m.mellomrom.verdi / 2;
  const hullBunn = flate + m.hullDybde.verdi;
  return {
    pluggRadius,
    hullRadius,
    bossRadius: hullRadius + m.vegg.verdi,
    flate,
    hullBunn,
    bossTopp: hullBunn + m.vegg.verdi,
    pluggStart: -m.pluggInnfesting.verdi,
    pluggEnde: hullBunn - m.endeklaring.verdi,
    sperreRadius: hullRadius + SPERREMARGIN,
  };
}

/** Consistency of a joint profile. Empty when it holds together. */
export function sjekkLeddprofil(p: Leddprofil): string[] {
  const k = leddmal(p);
  const feil: string[] = [];
  if (k.sperreRadius >= k.bossRadius) feil.push('Veggen rundt hullet er tynnere enn sperresonen.');
  if (k.pluggEnde <= k.flate) feil.push('Pluggen når ikke inn i hullet.');
  if (p.maal.radialKlaring.verdi <= 0) feil.push('Pluggen har ingen klaring i hullet.');
  if (p.maal.mellomrom.verdi <= 0) feil.push('Delene har ikke mellomrom ved leddet.');
  return feil;
}

// ---------------------------------------------------------------------------
// Joints and base models

export type Leddtype = 'hals' | 'skulder' | 'hofte' | 'handledd' | 'ankel';

export interface Leddinfo {
  id: Leddtype;
  navn: string;
  forelder: FigurKropp;
  barn: FigurKropp;
  /** From parent into child (on the figure's left side for pairs). */
  akse: V3;
  /** The joint exists on both sides. */
  par: boolean;
}

export const leddtyper: Leddinfo[] = [
  { id: 'hals', navn: 'Halsen', forelder: 'kropp', barn: 'hode', akse: [0, 0, 1], par: false },
  { id: 'skulder', navn: 'Skulderen', forelder: 'kropp', barn: 'armer', akse: [1, 0, 0], par: true },
  { id: 'hofte', navn: 'Hoften', forelder: 'kropp', barn: 'bein', akse: [0, 0, -1], par: true },
  { id: 'handledd', navn: 'Håndleddet', forelder: 'armer', barn: 'hender', akse: [0, 0, -1], par: true },
  { id: 'ankel', navn: 'Ankelen', forelder: 'bein', barn: 'fotter', akse: [0, 0, -1], par: true },
];

export const leddFor = (barn: FigurKropp): Leddinfo | undefined => leddtyper.find((l) => l.barn === barn);

type Grunnform = Omit<Form, 'id' | 'kropp' | 'komponent'>;

export interface Grunnmodell {
  id: string;
  navn: string;
  beskrivelse: string;
  former: Grunnform[];
  /** Child joints in this segment's frame (the left side for pairs). */
  ledd?: Partial<Record<Leddtype, V3>>;
  /** Feet: height of the sole below the ankle (negative). */
  saale?: number;
}

function g(navn: string, type: Formtype, posisjon: V3, mal: V3, ekstra: Partial<Grunnform> = {}): Grunnform {
  return {
    navn,
    type,
    posisjon,
    rotasjon: [0, 0, 0],
    mal,
    avrunding: 0,
    operasjon: 'smelt',
    smelting: 3,
    speilet: false,
    ...ekstra,
  };
}

/**
 * Base models per segment. Plain programmatic shapes (D-3), sized so every
 * combination stands apart: hands stay outside the legs, feet stay off the
 * middle line. The tests build every combination.
 */
export const grunnmodeller: Record<FigurKropp, Grunnmodell[]> = {
  kropp: [
    {
      id: 'rund',
      navn: 'Rund',
      beskrivelse: 'En rund mage.',
      former: [g('Kropp', 'kule', [0, 0, 0], [30, 30, 30])],
      ledd: { hals: [0, 0, 13], skulder: [12, 0, 5], hofte: [5.5, 0, -11] },
    },
    {
      id: 'kloss',
      navn: 'Kloss',
      beskrivelse: 'En kraftig kloss med myke kanter.',
      former: [g('Kropp', 'boks', [0, 0, 0], [26, 18, 30], { avrunding: 5 })],
      ledd: { hals: [0, 0, 13], skulder: [12, 0, 8], hofte: [5.5, 0, -13] },
    },
    {
      id: 'paere',
      navn: 'Pære',
      beskrivelse: 'Smal øverst, bred nederst.',
      former: [
        g('Mage', 'kule', [0, 0, -4], [30, 30, 30]),
        g('Bryst', 'kule', [0, 0, 9], [24, 24, 24], { smelting: 6 }),
      ],
      ledd: { hals: [0, 0, 19], skulder: [11.5, 0, 8], hofte: [5.5, 0, -16] },
    },
  ],
  hode: [
    {
      id: 'rund',
      navn: 'Rundt',
      beskrivelse: 'Et rundt hode.',
      former: [g('Hode', 'kule', [0, 0, 12], [26, 26, 26])],
    },
    {
      id: 'kantet',
      navn: 'Kantete',
      beskrivelse: 'Et firkantet hode med myke kanter.',
      former: [g('Hode', 'boks', [0, 0, 11], [24, 22, 22], { avrunding: 5 })],
    },
    {
      id: 'hoy',
      navn: 'Høyt',
      beskrivelse: 'Et høyt, rundt hode.',
      former: [g('Hode', 'sylinder', [0, 0, 13], [22, 22, 28], { avrunding: 9 })],
    },
  ],
  armer: [
    {
      id: 'tynne',
      navn: 'Tynne',
      beskrivelse: 'Smale armer.',
      former: [
        g('Skulder', 'kule', [4, 0, 0], [12, 12, 12]),
        g('Arm', 'sylinder', [5.5, 0, -10], [10, 10, 30], { avrunding: 4 }),
      ],
      ledd: { handledd: [5.5, 0, -25] },
    },
    {
      id: 'kraftige',
      navn: 'Kraftige',
      beskrivelse: 'Brede armer.',
      former: [
        g('Skulder', 'kule', [4.5, 0, 0], [13, 13, 13]),
        g('Arm', 'boks', [6.5, 0, -10], [12, 12, 30], { avrunding: 4 }),
      ],
      ledd: { handledd: [6.5, 0, -25] },
    },
  ],
  hender: [
    {
      id: 'votter',
      navn: 'Votter',
      beskrivelse: 'Runde votter.',
      former: [
        g('Mansjett', 'sylinder', [0, 0, -2.5], [10, 10, 4], { avrunding: 1 }),
        g('Vott', 'kule', [0, 0, -6.3], [12, 12, 12]),
      ],
    },
    {
      id: 'kloer',
      navn: 'Klør',
      beskrivelse: 'En liten pote med to klør.',
      former: [
        g('Mansjett', 'sylinder', [0, 0, -2.5], [10, 10, 4], { avrunding: 1 }),
        g('Pote', 'kule', [0, 0, -6], [10, 10, 10]),
        g('Klo', 'kjegle', [2, -1.5, -11.5], [3.5, 3.5, 5], {
          rotasjon: [180, 0, 0],
          avrunding: 0.4,
          smelting: 1,
          speilet: true,
        }),
      ],
    },
  ],
  bein: [
    {
      id: 'korte',
      navn: 'Korte',
      beskrivelse: 'Korte, runde bein.',
      former: [g('Bein', 'sylinder', [0, 0, -8], [10, 10, 16], { avrunding: 3 })],
      ledd: { ankel: [0, 0, -16] },
    },
    {
      id: 'lange',
      navn: 'Lange',
      beskrivelse: 'Lange bein.',
      former: [g('Bein', 'sylinder', [0, 0, -13], [10, 10, 26], { avrunding: 3 })],
      ledd: { ankel: [0, 0, -26] },
    },
  ],
  fotter: [
    {
      id: 'stovler',
      navn: 'Støvler',
      beskrivelse: 'Brede støvler med tåa fram.',
      former: [g('Støvel', 'boks', [0, -3, -4.8], [10, 18, 9], { avrunding: 3 })],
      saale: -9.3,
    },
    {
      id: 'runde',
      navn: 'Runde',
      beskrivelse: 'Små, runde føtter.',
      former: [g('Fot', 'sylinder', [0, -2, -4.8], [10, 10, 9], { avrunding: 4 })],
      saale: -9.3,
    },
  ],
};

export function finnGrunnmodell(kropp: FigurKropp, id: string | undefined): Grunnmodell | undefined {
  return grunnmodeller[kropp].find((m) => m.id === id);
}

export const grunnKomponent = (kropp: FigurKropp, id: string) => ({
  id: `grunn-${kropp}-${id}`,
  versjon: '1',
});
export const erGrunnform = (f: Form): boolean => !!f.komponent?.id.startsWith('grunn-');

/** The shapes of a base model, ready to put in a project. */
export function grunnformer(kropp: FigurKropp, m: Grunnmodell): Form[] {
  return m.former.map((f) => ({
    ...structuredClone(f),
    id: nyId('f'),
    kropp,
    komponent: grunnKomponent(kropp, m.id),
  }));
}

// ---------------------------------------------------------------------------
// Skeleton: where each segment sits

export interface Instans {
  /** Part id, e.g. `arm-venstre`. */
  id: string;
  navn: string;
  kropp: FigurKropp;
  /** World position of the segment's frame (for a mirrored instance: already mirrored). */
  origo: V3;
  /** The right side: the left side's mesh and fields mirrored across x = 0. */
  speilet: boolean;
}

export interface Ledd {
  type: Leddinfo;
  /** World position and axis of the left (or only) joint. */
  punkt: V3;
}

export interface Skjelett {
  origo: Record<FigurKropp, V3>;
  instanser: Instans[];
  ledd: Ledd[];
  /** Child joints of each segment in its own frame. */
  barneledd: Record<FigurKropp, { type: Leddinfo; punkt: V3 }[]>;
}

const instansnavn: Record<FigurKropp, [string, string]> = {
  hode: ['hode', 'Hode'],
  kropp: ['kropp', 'Kropp'],
  armer: ['arm', 'Arm'],
  bein: ['bein', 'Bein'],
  hender: ['hand', 'Hånd'],
  fotter: ['fot', 'Fot'],
};

export const leggTil = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** The skeleton for the chosen base models, or null if one is unknown. */
export function lagSkjelett(valg: Partial<Record<FigurKropp, string>>): Skjelett | null {
  const m = {} as Record<FigurKropp, Grunnmodell>;
  for (const k of Object.keys(grunnmodeller) as FigurKropp[]) {
    const x = finnGrunnmodell(k, valg[k]);
    if (!x) return null;
    m[k] = x;
  }
  const punkt = (l: Leddtype): V3 => {
    const t = leddtyper.find((x) => x.id === l)!;
    return m[t.forelder].ledd?.[l] ?? [0, 0, 0];
  };
  // the sole stands on z = 0
  const z0 = -(punkt('hofte')[2] + punkt('ankel')[2] + (m.fotter.saale ?? 0));
  const origo = {} as Record<FigurKropp, V3>;
  origo.kropp = [0, 0, z0];
  origo.hode = leggTil(origo.kropp, punkt('hals'));
  origo.armer = leggTil(origo.kropp, punkt('skulder'));
  origo.bein = leggTil(origo.kropp, punkt('hofte'));
  origo.hender = leggTil(origo.armer, punkt('handledd'));
  origo.fotter = leggTil(origo.bein, punkt('ankel'));

  const instanser: Instans[] = [];
  for (const k of ['hode', 'kropp', 'armer', 'hender', 'bein', 'fotter'] as FigurKropp[]) {
    const [id, navn] = instansnavn[k];
    const o = origo[k];
    if (k === 'hode' || k === 'kropp') instanser.push({ id, navn, kropp: k, origo: o, speilet: false });
    else {
      instanser.push({ id: `${id}-venstre`, navn: `${navn} (venstre)`, kropp: k, origo: o, speilet: false });
      instanser.push({
        id: `${id}-hoyre`,
        navn: `${navn} (høyre)`,
        kropp: k,
        origo: [-o[0], o[1], o[2]],
        speilet: true,
      });
    }
  }
  const barneledd = {} as Skjelett['barneledd'];
  for (const k of Object.keys(grunnmodeller) as FigurKropp[]) barneledd[k] = [];
  const ledd: Ledd[] = [];
  for (const t of leddtyper) {
    const p = punkt(t.id);
    barneledd[t.forelder].push({ type: t, punkt: p });
    ledd.push({ type: t, punkt: leggTil(origo[t.forelder], p) });
  }
  return { origo, instanser, ledd, barneledd };
}

// ---------------------------------------------------------------------------
// Joint geometry in a segment's own frame

/** Right-handed basis (u, v, a) for an axis a. */
function basis(a: V3): { u: V3; v: V3 } {
  const h: V3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u: V3 = [h[1] * a[2] - h[2] * a[1], h[2] * a[0] - h[0] * a[2], h[0] * a[1] - h[1] * a[0]];
  const l = Math.hypot(...u);
  u = [u[0] / l, u[1] / l, u[2] / l];
  const v: V3 = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  return { u, v };
}

/** A mesh built along +Z, placed at c with +Z along a. */
function langsAkse(m: Mesh, c: V3, a: V3): Mesh {
  const { u, v } = basis(a);
  const p = new Float32Array(m.posisjoner.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = m.posisjoner[i]!,
      y = m.posisjoner[i + 1]!,
      z = m.posisjoner[i + 2]!;
    for (let k = 0; k < 3; k++) p[i + k] = c[k]! + x * u[k]! + y * v[k]! + z * a[k]!;
  }
  return { posisjoner: p, indekser: m.indekser };
}

/** A cylinder field along a through c, from s0 to s1 (s measured from c along a). */
function sylinderLangs(c: V3, a: V3, r: number, s0: number, s1: number): Felt {
  const { u, v } = basis(a);
  const f = sylinder(r, s1 - s0, 0);
  const sm = (s0 + s1) / 2;
  return (x, y, z) => {
    const dx = x - c[0],
      dy = y - c[1],
      dz = z - c[2];
    return f(
      dx * u[0] + dy * u[1] + dz * u[2],
      dx * v[0] + dy * v[1] + dz * v[2],
      dx * a[0] + dy * a[1] + dz * a[2] - sm,
    );
  };
}

function boksLangs(c: V3, a: V3, r: number, s0: number, s1: number): Boks {
  const ender: V3[] = [s0, s1].map((s) => [c[0] + a[0] * s, c[1] + a[1] * s, c[2] + a[2] * s] as V3);
  const min = [0, 1, 2].map((k) => Math.min(ender[0]![k]!, ender[1]![k]!) - r) as V3;
  const maks = [0, 1, 2].map((k) => Math.max(ender[0]![k]!, ender[1]![k]!) + r) as V3;
  return { min, maks };
}

export interface Leddkjerne {
  navn: string;
  ledd: Leddtype;
  felt: Felt;
  boks: Boks;
  mesh: Mesh;
}

export interface Segmentledd {
  /** Locked joint parts of this segment (its socket, its pegs). */
  kjerner: Leddkjerne[];
  /** Decoration after the joint cuts: own side of every joint plane, out of the hole. */
  kutt: (dekor: Felt) => Felt;
}

/** The joint parts and cuts of one segment, in its own frame. */
export function segmentledd(kropp: FigurKropp, s: Skjelett, profil: Leddprofil): Segmentledd {
  const k = leddmal(profil);
  const kjerner: Leddkjerne[] = [];
  const plan: { c: V3; a: V3; side: 1 | -1 }[] = [];
  const sperrer: Felt[] = [];

  const eget = leddFor(kropp);
  if (eget) {
    const a = eget.akse;
    const c: V3 = [0, 0, 0];
    const boss = sylinderLangs(c, a, k.bossRadius, k.flate, k.bossTopp);
    const hull = sylinderLangs(c, a, k.hullRadius, k.flate - 1, k.hullBunn);
    kjerner.push({
      navn: `Leddhull ved ${eget.navn.toLowerCase()}`,
      ledd: eget.id,
      felt: (x, y, z) => Math.max(boss(x, y, z), -hull(x, y, z)),
      boks: boksLangs(c, a, k.bossRadius, k.flate, k.bossTopp),
      mesh: langsAkse(
        prisme(sirkel(k.bossRadius, 40), k.flate, k.bossTopp, [
          { omriss: sirkel(k.hullRadius, 32), z0: k.flate, z1: k.hullBunn },
        ]),
        c,
        a,
      ),
    });
    plan.push({ c, a, side: 1 });
    sperrer.push(sylinderLangs(c, a, k.sperreRadius, -1000, k.hullBunn + 0.3));
  }

  for (const b of s.barneledd[kropp]) {
    const sider: { c: V3; a: V3 }[] = [{ c: b.punkt, a: b.type.akse }];
    // the body carries both sides of a paired joint; a pair segment only its own
    if (b.type.par && kropp === 'kropp')
      sider.push({
        c: [-b.punkt[0], b.punkt[1], b.punkt[2]],
        a: [-b.type.akse[0], b.type.akse[1], b.type.akse[2]],
      });
    for (const { c, a } of sider) {
      kjerner.push({
        navn: `Plugg ved ${b.type.navn.toLowerCase()}`,
        ledd: b.type.id,
        felt: sylinderLangs(c, a, k.pluggRadius, k.pluggStart, k.pluggEnde),
        boks: boksLangs(c, a, k.pluggRadius, k.pluggStart, k.pluggEnde),
        mesh: langsAkse(prisme(sirkel(k.pluggRadius, 32), k.pluggStart, k.pluggEnde), c, a),
      });
      plan.push({ c, a, side: -1 });
    }
  }

  const kutt = (dekor: Felt): Felt => {
    if (!plan.length) return dekor;
    return (x, y, z) => {
      let d = dekor(x, y, z);
      for (const { c, a, side } of plan) {
        const s0 = (x - c[0]) * a[0] + (y - c[1]) * a[1] + (z - c[2]) * a[2];
        // child keeps s ≥ flate, parent keeps s ≤ −flate
        d = Math.max(d, side === 1 ? k.flate - s0 : s0 + k.flate);
      }
      for (const sp of sperrer) d = Math.max(d, -sp(x, y, z));
      return d;
    };
  };
  return { kjerner, kutt };
}

/** Mirror a mesh across x = 0 (keeps it outward-facing). */
export function speilMesh(m: Mesh): Mesh {
  const p = new Float32Array(m.posisjoner);
  for (let i = 0; i < p.length; i += 3) p[i] = -p[i]!;
  const ind = new Uint32Array(m.indekser.length);
  for (let i = 0; i < ind.length; i += 3) {
    ind[i] = m.indekser[i]!;
    ind[i + 1] = m.indekser[i + 2]!;
    ind[i + 2] = m.indekser[i + 1]!;
  }
  return { posisjoner: p, indekser: ind };
}

export function flyttMesh(m: Mesh, d: V3): Mesh {
  const b = new MeshBygger();
  b.leggTil(m);
  const ut = b.bygg();
  for (let i = 0; i < ut.posisjoner.length; i += 3) {
    ut.posisjoner[i] = ut.posisjoner[i]! + d[0];
    ut.posisjoner[i + 1] = ut.posisjoner[i + 1]! + d[1];
    ut.posisjoner[i + 2] = ut.posisjoner[i + 2]! + d[2];
  }
  return ut;
}
