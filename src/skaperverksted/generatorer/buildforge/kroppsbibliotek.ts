/**
 * The body part library (handoff 2026-10-04 §5–6): ready-made parts, each
 * one printed piece with its shapes and connectors. Plain programmatic
 * shapes (D-3), built from the same shapes the user edits inside a part.
 *
 * Conventions: front is −Y, up is +Z. A part's connector towards its parent
 * is female (a hole), towards its children male (a peg), so parts snap in
 * the way the figure from BuildForge 0.2 was jointed. Nothing stops a head
 * going on a shoulder or three heads on one body (handoff §5).
 *
 * `side` says which way a part naturally reaches (+1: towards +X, the
 * figure's left). A part attached on the other side is mirrored, so a right
 * arm is a mirror image of a left arm.
 */
import { nyId } from '../../core/dokument';
import { FIGURLEDD_PROVE } from './ledd';
import {
  SKJEMA,
  type BuildforgeParametre,
  type Form,
  type Formtype,
  type Kategori,
  type Kjonn,
  type Kobling,
  type Koblingsrolle,
  type Modulkropp,
  type V3,
} from './parametre';

type Delform = Omit<Form, 'id' | 'kropp' | 'komponent'>;
type Koblingsmal = Omit<Kobling, 'familie'>;

export interface Kroppsmal {
  id: string;
  versjon: string;
  navn: string;
  beskrivelse: string;
  kategori: Kategori;
  farge: string;
  side?: 1;
  former: Delform[];
  koblinger: Koblingsmal[];
}

function g(navn: string, type: Formtype, posisjon: V3, mal: V3, ekstra: Partial<Delform> = {}): Delform {
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

function k(
  id: string,
  navn: string,
  kjonn: Kjonn,
  rolle: Koblingsrolle,
  posisjon: V3,
  akse: V3,
): Koblingsmal {
  return { id, navn, kjonn, rolle, posisjon, akse };
}

/** Male connectors of a figure torso: neck, both shoulders and both hips. */
function torso(hals: number, skulder: [number, number], hofte: [number, number]): Koblingsmal[] {
  return [
    k('hals', 'Hals', 'hann', 'hals', [0, 0, hals], [0, 0, 1]),
    k('skulder-v', 'Venstre skulder', 'hann', 'skulder', [skulder[0], 0, skulder[1]], [1, 0, 0]),
    k('skulder-h', 'Høyre skulder', 'hann', 'skulder', [-skulder[0], 0, skulder[1]], [-1, 0, 0]),
    k('hofte-v', 'Venstre hofte', 'hann', 'hofte', [hofte[0], 0, hofte[1]], [0, 0, -1]),
    k('hofte-h', 'Høyre hofte', 'hann', 'hofte', [-hofte[0], 0, hofte[1]], [0, 0, -1]),
  ];
}

const nedtil = (rolle: Koblingsrolle, navn: string): Koblingsmal =>
  k('feste', navn, 'hunn', rolle, [0, 0, 0], [0, 0, 1]);

export const kroppsbibliotek: Kroppsmal[] = [
  // ---- bodies
  {
    id: 'kropp-rund',
    versjon: '1',
    navn: 'Rund kropp',
    beskrivelse: 'En rund mage med plass til hode, armer og bein.',
    kategori: 'kropper',
    farge: 'pla-cyan',
    former: [g('Kropp', 'kule', [0, 0, 0], [30, 30, 30])],
    koblinger: torso(13, [12, 5], [5.5, -11]),
  },
  {
    id: 'kropp-kloss',
    versjon: '1',
    navn: 'Bred kropp',
    beskrivelse: 'En kraftig kloss med myke kanter.',
    kategori: 'kropper',
    farge: 'pla-lilla',
    former: [g('Kropp', 'boks', [0, 0, 0], [26, 18, 30], { avrunding: 5 })],
    koblinger: torso(13, [12, 8], [5.5, -13]),
  },
  {
    id: 'kropp-paere',
    versjon: '1',
    navn: 'Pærekropp',
    beskrivelse: 'Smal øverst, bred nederst.',
    kategori: 'kropper',
    farge: 'pla-rosa',
    former: [
      g('Mage', 'kule', [0, 0, -4], [30, 30, 30]),
      g('Bryst', 'kule', [0, 0, 9], [24, 24, 24], { smelting: 6 }),
    ],
    koblinger: torso(19, [11.5, 8], [5.5, -16]),
  },
  {
    id: 'kropp-smal',
    versjon: '1',
    navn: 'Smal kropp',
    beskrivelse: 'En slank overkropp.',
    kategori: 'kropper',
    farge: 'matt-sand',
    former: [g('Kropp', 'boks', [0, 0, 0], [22, 14, 32], { avrunding: 6 })],
    koblinger: torso(14.5, [11, 9], [5.5, -14.5]),
  },
  {
    id: 'kropp-drage',
    versjon: '1',
    navn: 'Dragekropp',
    beskrivelse: 'En lang kropp med hals foran, hale bak, fire bein og to vinger.',
    kategori: 'kropper',
    farge: 'pla-skog',
    former: [
      g('Mage', 'boks', [0, 2, 0], [26, 40, 20], { avrunding: 9 }),
      g('Bryst', 'kule', [0, -12, 4], [24, 24, 24], { smelting: 6 }),
    ],
    koblinger: [
      k('hals', 'Hals', 'hann', 'hals', [0, -12, 14.5], [0, 0, 1]),
      k('hale', 'Hale', 'hann', 'hale', [0, 21.5, 0], [0, 1, 0]),
      k('vinge-v', 'Venstre vinge', 'hann', 'vinge', [12.5, 0, 4], [1, 0, 0]),
      k('vinge-h', 'Høyre vinge', 'hann', 'vinge', [-12.5, 0, 4], [-1, 0, 0]),
      k('hofte-vf', 'Venstre forbein', 'hann', 'hofte', [7, -9, -9], [0, 0, -1]),
      k('hofte-hf', 'Høyre forbein', 'hann', 'hofte', [-7, -9, -9], [0, 0, -1]),
      k('hofte-vb', 'Venstre bakbein', 'hann', 'hofte', [7, 11, -9], [0, 0, -1]),
      k('hofte-hb', 'Høyre bakbein', 'hann', 'hofte', [-7, 11, -9], [0, 0, -1]),
    ],
  },
  {
    id: 'kropp-slange',
    versjon: '1',
    navn: 'Slangekropp',
    beskrivelse: 'Et kroppsledd med plass til hode foran og flere ledd bak.',
    kategori: 'kropper',
    farge: 'pla-signal',
    former: [g('Ledd', 'sylinder', [0, 0, 0], [16, 16, 22], { rotasjon: [90, 0, 0], avrunding: 7 })],
    koblinger: [
      k('hode', 'Hode', 'hann', 'hals', [0, -10.5, 0], [0, -1, 0]),
      k('hale', 'Hale', 'hann', 'hale', [0, 10.5, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'kropp-blank',
    versjon: '1',
    navn: 'Blank kule',
    beskrivelse: 'En enkel kule med en kobling i hver retning.',
    kategori: 'kropper',
    farge: 'matt-sand',
    former: [g('Kule', 'kule', [0, 0, 0], [26, 26, 26])],
    koblinger: [
      k('topp', 'Øverst', 'hann', 'hals', [0, 0, 12], [0, 0, 1]),
      k('bunn', 'Nederst', 'hann', 'generisk', [0, 0, -12], [0, 0, -1]),
      k('venstre', 'Venstre side', 'hann', 'skulder', [12, 0, 0], [1, 0, 0]),
      k('hoyre', 'Høyre side', 'hann', 'skulder', [-12, 0, 0], [-1, 0, 0]),
      k('front', 'Foran', 'hann', 'generisk', [0, -12, 0], [0, -1, 0]),
      k('bak', 'Bak', 'hann', 'hale', [0, 12, 0], [0, 1, 0]),
    ],
  },

  // ---- heads
  {
    id: 'hode-rund',
    versjon: '1',
    navn: 'Rundt hode',
    beskrivelse: 'Et rundt hode.',
    kategori: 'hoder',
    farge: 'pla-cyan',
    former: [g('Hode', 'kule', [0, 0, 12], [26, 26, 26])],
    koblinger: [k('hals', 'Hals', 'hunn', 'hals', [0, 0, 0], [0, 0, -1])],
  },
  {
    id: 'hode-kantet',
    versjon: '1',
    navn: 'Kantete hode',
    beskrivelse: 'Et firkantet hode med myke kanter.',
    kategori: 'hoder',
    farge: 'pla-skog',
    former: [g('Hode', 'boks', [0, 0, 11], [24, 22, 22], { avrunding: 5 })],
    koblinger: [k('hals', 'Hals', 'hunn', 'hals', [0, 0, 0], [0, 0, -1])],
  },
  {
    id: 'hode-hoy',
    versjon: '1',
    navn: 'Høyt hode',
    beskrivelse: 'Et høyt, rundt hode.',
    kategori: 'hoder',
    farge: 'pla-lilla',
    former: [g('Hode', 'sylinder', [0, 0, 13], [22, 22, 28], { avrunding: 9 })],
    koblinger: [k('hals', 'Hals', 'hunn', 'hals', [0, 0, 0], [0, 0, -1])],
  },
  {
    id: 'hode-drage',
    versjon: '1',
    navn: 'Dragehode',
    beskrivelse: 'Et hode med lang snute.',
    kategori: 'hoder',
    farge: 'pla-skog',
    former: [
      g('Skalle', 'kule', [0, 0, 10], [22, 22, 22]),
      g('Snute', 'boks', [0, -12, 7], [14, 16, 10], { avrunding: 4, smelting: 4 }),
    ],
    koblinger: [k('hals', 'Hals', 'hunn', 'hals', [0, 0, 0], [0, 0, -1])],
  },
  {
    id: 'hode-slange',
    versjon: '1',
    navn: 'Slangehode',
    beskrivelse: 'Et flatt hode som sitter foran på kroppen, ikke oppå.',
    kategori: 'hoder',
    farge: 'pla-signal',
    former: [
      g('Hode', 'kule', [0, -8, 0], [18, 18, 18]),
      g('Snute', 'boks', [0, -15, -1], [12, 12, 8], { avrunding: 4, smelting: 4 }),
    ],
    koblinger: [k('hals', 'Nakke', 'hunn', 'hals', [0, 0, 0], [0, 1, 0])],
  },

  // ---- necks
  {
    id: 'hals-kort',
    versjon: '1',
    navn: 'Hals',
    beskrivelse: 'Et halsledd mellom kroppen og hodet.',
    kategori: 'halser',
    farge: 'pla-skog',
    former: [g('Hals', 'sylinder', [0, 0, 7], [11, 11, 16], { avrunding: 3 })],
    koblinger: [
      k('bunn', 'Halsrot', 'hunn', 'hals', [0, 0, 0], [0, 0, -1]),
      k('topp', 'Hode', 'hann', 'hals', [0, 0, 14], [0, 0, 1]),
    ],
  },

  // ---- arms
  {
    id: 'arm-tynn',
    versjon: '1',
    navn: 'Tynn arm',
    beskrivelse: 'En smal arm med plass til en hånd.',
    kategori: 'armer',
    farge: 'pla-cyan',
    side: 1,
    former: [
      g('Skulder', 'kule', [4, 0, 0], [12, 12, 12]),
      g('Arm', 'sylinder', [5.5, 0, -10], [10, 10, 30], { avrunding: 4 }),
    ],
    koblinger: [
      k('skulder', 'Skulder', 'hunn', 'skulder', [0, 0, 0], [-1, 0, 0]),
      k('handledd', 'Håndledd', 'hann', 'handledd', [5.5, 0, -25], [0, 0, -1]),
    ],
  },
  {
    id: 'arm-kraftig',
    versjon: '1',
    navn: 'Kraftig arm',
    beskrivelse: 'En bred arm med plass til en hånd.',
    kategori: 'armer',
    farge: 'pla-skog',
    side: 1,
    former: [
      g('Skulder', 'kule', [4.5, 0, 0], [13, 13, 13]),
      g('Arm', 'boks', [6.5, 0, -10], [12, 12, 30], { avrunding: 4 }),
    ],
    koblinger: [
      k('skulder', 'Skulder', 'hunn', 'skulder', [0, 0, 0], [-1, 0, 0]),
      k('handledd', 'Håndledd', 'hann', 'handledd', [6.5, 0, -25], [0, 0, -1]),
    ],
  },

  // ---- hands
  {
    id: 'hand-vott',
    versjon: '1',
    navn: 'Vott',
    beskrivelse: 'En rund vott.',
    kategori: 'hender',
    farge: 'matt-sand',
    former: [
      g('Mansjett', 'sylinder', [0, 0, -2.5], [10, 10, 4], { avrunding: 1 }),
      g('Vott', 'kule', [0, 0, -6.3], [12, 12, 12]),
    ],
    koblinger: [nedtil('handledd', 'Håndledd')],
  },
  {
    id: 'hand-klo',
    versjon: '1',
    navn: 'Klo',
    beskrivelse: 'En liten pote med to klør.',
    kategori: 'hender',
    farge: 'pla-signal',
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
    koblinger: [nedtil('handledd', 'Håndledd')],
  },

  // ---- legs
  {
    id: 'bein-kort',
    versjon: '1',
    navn: 'Kort bein',
    beskrivelse: 'Et kort, rundt bein med plass til en fot.',
    kategori: 'bein',
    farge: 'pla-grafitt',
    side: 1,
    former: [g('Bein', 'sylinder', [0, 0, -8], [10, 10, 16], { avrunding: 3 })],
    koblinger: [nedtil('hofte', 'Hofte'), k('ankel', 'Ankel', 'hann', 'ankel', [0, 0, -16], [0, 0, -1])],
  },
  {
    id: 'bein-langt',
    versjon: '1',
    navn: 'Langt bein',
    beskrivelse: 'Et langt bein med plass til en fot.',
    kategori: 'bein',
    farge: 'pla-grafitt',
    side: 1,
    former: [g('Bein', 'sylinder', [0, 0, -13], [10, 10, 26], { avrunding: 3 })],
    koblinger: [nedtil('hofte', 'Hofte'), k('ankel', 'Ankel', 'hann', 'ankel', [0, 0, -26], [0, 0, -1])],
  },

  // ---- feet
  {
    id: 'fot-stovel',
    versjon: '1',
    navn: 'Støvel',
    beskrivelse: 'En bred støvel med tåa fram.',
    kategori: 'fotter',
    farge: 'pla-rust',
    former: [g('Støvel', 'boks', [0, -3, -4.8], [10, 18, 9], { avrunding: 3 })],
    koblinger: [nedtil('ankel', 'Ankel')],
  },
  {
    id: 'fot-rund',
    versjon: '1',
    navn: 'Rund fot',
    beskrivelse: 'En liten, rund fot.',
    kategori: 'fotter',
    farge: 'pla-signal',
    former: [g('Fot', 'sylinder', [0, -2, -4.8], [10, 10, 9], { avrunding: 4 })],
    koblinger: [nedtil('ankel', 'Ankel')],
  },

  // ---- tails
  {
    id: 'hale-ledd',
    versjon: '1',
    navn: 'Haleledd',
    beskrivelse: 'Et ledd i en hale eller en slange. Flere ledd kan settes etter hverandre.',
    kategori: 'haler',
    farge: 'pla-skog',
    former: [g('Ledd', 'sylinder', [0, 9, 0], [14, 14, 18], { rotasjon: [90, 0, 0], avrunding: 6 })],
    koblinger: [
      k('front', 'Foran', 'hunn', 'hale', [0, 0, 0], [0, -1, 0]),
      k('bak', 'Bak', 'hann', 'hale', [0, 17.5, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'hale-spiss',
    versjon: '1',
    navn: 'Halespiss',
    beskrivelse: 'Enden av en hale.',
    kategori: 'haler',
    farge: 'pla-skog',
    former: [g('Spiss', 'kjegle', [0, 10, 0], [12, 12, 20], { rotasjon: [-90, 0, 0], avrunding: 1 })],
    koblinger: [k('front', 'Foran', 'hunn', 'hale', [0, 0, 0], [0, -1, 0])],
  },

  // ---- wings
  {
    id: 'vinge',
    versjon: '1',
    navn: 'Vinge',
    beskrivelse: 'En flat vinge som peker utover og litt opp.',
    kategori: 'vinger',
    farge: 'pla-skog',
    side: 1,
    former: [
      g('Vingerot', 'kule', [3, 0, 0], [10, 10, 10]),
      g('Vinge', 'boks', [15, 0, 6], [26, 14, 3], { rotasjon: [0, -25, 0], avrunding: 1.4 }),
    ],
    koblinger: [k('rot', 'Vingerot', 'hunn', 'vinge', [0, 0, 0], [-1, 0, 0])],
  },
];

export function finnKroppsmal(id: string | undefined): Kroppsmal | undefined {
  return kroppsbibliotek.find((m) => m.id === id);
}

/** The base shapes of a library part carry this component id; shapes the user adds do not. */
export const grunnKomponent = (malId: string, versjon = '1') => ({ id: `kropp:${malId}`, versjon });
export const erGrunnform = (f: Form): boolean => !!f.komponent?.id.startsWith('kropp:');

/** A new part from the library, ready to put in a project (loose at the origin). */
export function lagKropp(mal: Kroppsmal, farge = mal.farge): { kropp: Modulkropp; former: Form[] } {
  const kropp: Modulkropp = {
    id: nyId('k'),
    navn: mal.navn,
    kategori: mal.kategori,
    komponent: { id: mal.id, versjon: mal.versjon },
    farge,
    speilet: false,
    posisjon: [0, 0, 0],
    rotasjon: [0, 0, 0],
    koblinger: mal.koblinger.map((x) => ({ ...structuredClone(x), familie: 'svivel' })),
  };
  return { kropp, former: grunnformer(mal, kropp.id) };
}

/** The base shapes of a library part for a part with id `kropp`. */
export function grunnformer(mal: Kroppsmal, kropp: string): Form[] {
  return mal.former.map((f) => ({
    ...structuredClone(f),
    id: nyId('f'),
    kropp,
    komponent: grunnKomponent(mal.id, mal.versjon),
  }));
}

/** Starts for «La oss bygge …» (handoff §3): each gives exactly one part, the Main Body. */
export interface Start {
  id: string;
  navn: string;
  beskrivelse: string;
  kropp: string;
}

export const starter: Start[] = [
  {
    id: 'drage',
    navn: 'Drage',
    beskrivelse: 'Lang kropp med plass til hals, hale, bein og vinger.',
    kropp: 'kropp-drage',
  },
  {
    id: 'slange',
    navn: 'Slange',
    beskrivelse: 'Et kroppsledd du bygger ut med hode og haleledd.',
    kropp: 'kropp-slange',
  },
  {
    id: 'helt',
    navn: 'Helt',
    beskrivelse: 'Bred overkropp med plass til hode, armer og bein.',
    kropp: 'kropp-kloss',
  },
  {
    id: 'menneske',
    navn: 'Menneske',
    beskrivelse: 'Slank overkropp med plass til hode, armer og bein.',
    kropp: 'kropp-smal',
  },
  {
    id: 'skapning',
    navn: 'Skapning',
    beskrivelse: 'Rund mage. Gi den så mange hoder og armer du vil.',
    kropp: 'kropp-rund',
  },
  { id: 'blank', navn: 'Blank', beskrivelse: 'En kule med en kobling i hver retning.', kropp: 'kropp-blank' },
];

/** The empty modular project a new BuildForge document starts with: one blank Main Body, no start chosen. */
export function modulprosjekt(startId: string, mal = startId): BuildforgeParametre {
  const start = starter.find((s) => s.id === startId) ?? starter.find((s) => s.id === 'blank')!;
  const ny = lagKropp(finnKroppsmal(start.kropp)!);
  return {
    skjema: SKJEMA,
    familie: 'modul',
    profil: { id: FIGURLEDD_PROVE.id, versjon: FIGURLEDD_PROVE.versjon },
    mal,
    farger: {},
    rot: ny.kropp.id,
    kropper: [ny.kropp],
    forbindelser: [],
    former: ny.former,
  };
}
