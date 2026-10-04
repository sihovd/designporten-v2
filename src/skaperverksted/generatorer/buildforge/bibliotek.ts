/**
 * BuildForge's small original library (handoff §12): three basic shapes,
 * two composed parts and the starting templates. Every part is built from
 * the same shapes the user edits, so nothing here is a hidden mesh.
 *
 * `passer` lists the attachment points a part may snap to. Compatibility is
 * checked before anything is placed (handoff §4, «Drag-and-drop og
 * festepunkter»).
 */
import { nyId } from '../../core/dokument';
import { kroppBestemt, type BuildforgeParametre, type Form, type Formtype, type Kategori } from './parametre';
import { MX_PROVE } from './profil';

/** Which face of a body an attachment point is on, seen from the front (−Y). `utside` = the outer side of a side part. */
export type Retning = 'midt' | 'front' | 'venstre' | 'hoyre' | 'bak' | 'utside';
/** `${body}-${face}`: the clicker's `topp`/`underdel`, or a part id in the modular builder. */
export type FestepunktId = `${string}-${Retning}`;

export const retningnavn: Record<Retning, string> = {
  midt: 'øverst',
  front: 'foran',
  venstre: 'venstre side',
  hoyre: 'høyre side',
  bak: 'bak',
  utside: 'utsiden',
};

/** The faces each clicker body and each kind of part offers. Faces that meet another part are left out. */
export const festeretninger: Record<'topp' | 'underdel' | Kategori, Retning[]> = {
  topp: ['midt', 'front', 'venstre', 'hoyre', 'bak'],
  underdel: ['front', 'venstre', 'hoyre', 'bak'],
  kropper: ['midt', 'front', 'venstre', 'hoyre', 'bak'],
  hoder: ['midt', 'front', 'venstre', 'hoyre', 'bak'],
  halser: ['front', 'bak', 'venstre', 'hoyre'],
  armer: ['front', 'bak', 'utside'],
  hender: ['front', 'utside'],
  bein: ['front', 'bak', 'utside'],
  fotter: ['front', 'utside'],
  haler: ['midt', 'venstre', 'hoyre'],
  vinger: ['midt'],
  annet: ['midt', 'front', 'venstre', 'hoyre', 'bak'],
};

export function delAv(id: FestepunktId): { kropp: string; retning: Retning } {
  const i = id.lastIndexOf('-');
  return { kropp: id.slice(0, i), retning: id.slice(i + 1) as Retning };
}

/** «Toppen, foran» for the clicker; «Rundt hode, foran» when the part's name is given. */
export function festenavn(id: FestepunktId, kroppsnavn?: string): string {
  const { kropp, retning } = delAv(id);
  const b = kroppsnavn ?? kroppBestemt[kropp as 'topp' | 'underdel'] ?? kropp;
  return `${b.charAt(0).toUpperCase()}${b.slice(1)}, ${retningnavn[retning]}`;
}

/** The clicker's attachment points. */
export const alleFestepunkter: FestepunktId[] = (['topp', 'underdel'] as const).flatMap((k) =>
  festeretninger[k].map((r) => `${k}-${r}` as FestepunktId),
);

/** A shape inside a library part, positioned relative to the attachment point. */
interface Delform {
  type: Formtype;
  mal: [number, number, number];
  avrunding?: number;
  /** Offset in the attachment frame: [sideways, up, out of the surface]. */
  forskyvning: [number, number, number];
  /** Fixed rotation (degrees), or pointing straight out of the surface. */
  rotasjon?: [number, number, number];
  langsNormal?: boolean;
  speilet?: boolean;
  smelting?: number;
}

export interface Bibliotekdel {
  id: string;
  versjon: string;
  navn: string;
  beskrivelse: string;
  gruppe: 'Grunnformer' | 'Detaljer';
  former: Delform[];
  /** Where the part fits: faces, and optionally only some clicker bodies or kinds of part. */
  passer: { retninger: Retning[] | 'alle'; kropper?: ('topp' | 'underdel' | Kategori)[] };
}

const hoder: ('topp' | Kategori)[] = ['topp', 'hoder'];

export const bibliotek: Bibliotekdel[] = [
  {
    id: 'kule',
    versjon: '1',
    navn: 'Kule',
    beskrivelse: 'En rund form som smelter mykt inn.',
    gruppe: 'Grunnformer',
    former: [{ type: 'kule', mal: [12, 12, 12], forskyvning: [0, 0, 2.4] }],
    passer: { retninger: 'alle' },
  },
  {
    id: 'boks',
    versjon: '1',
    navn: 'Avrundet boks',
    beskrivelse: 'En kloss med myke kanter.',
    gruppe: 'Grunnformer',
    former: [{ type: 'boks', mal: [12, 12, 8], avrunding: 2, forskyvning: [0, 0, 1.6] }],
    passer: { retninger: 'alle' },
  },
  {
    id: 'sylinder',
    versjon: '1',
    navn: 'Sylinder',
    beskrivelse: 'En rund søyle eller skive.',
    gruppe: 'Grunnformer',
    former: [{ type: 'sylinder', mal: [10, 10, 8], avrunding: 1, forskyvning: [0, 0, 1.6] }],
    passer: { retninger: 'alle' },
  },
  {
    id: 'kjegle',
    versjon: '1',
    navn: 'Kjegle',
    beskrivelse: 'En spiss form som peker rett ut.',
    gruppe: 'Grunnformer',
    former: [{ type: 'kjegle', mal: [10, 10, 12], avrunding: 1, forskyvning: [0, 0, 4], langsNormal: true }],
    passer: { retninger: 'alle' },
  },
  {
    id: 'oyne',
    versjon: '1',
    navn: 'Øyne',
    beskrivelse: 'To like øyne, speilet. Passer foran på et hode eller på toppen av en klikker.',
    gruppe: 'Detaljer',
    former: [{ type: 'kule', mal: [5, 5, 5], forskyvning: [4, 1.5, 0.8], speilet: true, smelting: 1 }],
    passer: { retninger: ['front'], kropper: hoder },
  },
  {
    id: 'horn',
    versjon: '1',
    navn: 'Horn',
    beskrivelse:
      'To horn som peker litt utover, speilet. Passer øverst på et hode eller på toppen av en klikker.',
    gruppe: 'Detaljer',
    former: [
      {
        type: 'kjegle',
        mal: [6, 6, 12],
        avrunding: 0.8,
        forskyvning: [5, 0, 4.5],
        rotasjon: [0, 20, 0],
        speilet: true,
        smelting: 2,
      },
    ],
    passer: { retninger: ['midt'], kropper: hoder },
  },
  {
    id: 'pigger',
    versjon: '1',
    navn: 'Pigger',
    beskrivelse: 'Tre pigger på rad. Passer øverst eller bak.',
    gruppe: 'Detaljer',
    former: [
      {
        type: 'kjegle',
        mal: [5, 5, 7],
        avrunding: 0.3,
        forskyvning: [0, -5, 2.5],
        langsNormal: true,
        smelting: 1.5,
      },
      {
        type: 'kjegle',
        mal: [5, 5, 7],
        avrunding: 0.3,
        forskyvning: [0, 0, 3],
        langsNormal: true,
        smelting: 1.5,
      },
      {
        type: 'kjegle',
        mal: [5, 5, 7],
        avrunding: 0.3,
        forskyvning: [0, 5, 2.5],
        langsNormal: true,
        smelting: 1.5,
      },
    ],
    passer: { retninger: ['midt', 'bak'] },
  },
  {
    id: 'orer',
    versjon: '1',
    navn: 'Ører',
    beskrivelse: 'To runde ører, speilet. Passer øverst på et hode eller på toppen av en klikker.',
    gruppe: 'Detaljer',
    former: [{ type: 'kule', mal: [8, 8, 8], forskyvning: [7, 0, 1.6], speilet: true, smelting: 2 }],
    passer: { retninger: ['midt'], kropper: hoder },
  },
];

export function finnDel(id: string): Bibliotekdel | undefined {
  return bibliotek.find((d) => d.id === id);
}

/** Whether a library part fits an attachment point. `slag` is the clicker body or the kind of part. */
export function passer(del: Bibliotekdel, punkt: Pick<Festepunkt, 'retning' | 'slag'>): boolean {
  if (del.passer.kropper && !del.passer.kropper.includes(punkt.slag)) return false;
  return del.passer.retninger === 'alle' || del.passer.retninger.includes(punkt.retning);
}

export interface Festepunkt {
  id: FestepunktId;
  /** The clicker body, or the part id. */
  kropp: string;
  retning: Retning;
  /** The clicker body, or the part's kind (decides what fits). */
  slag: 'topp' | 'underdel' | Kategori;
  /** Point on the current surface and outward direction, in model coordinates. */
  punkt: [number, number, number];
  normal: [number, number, number];
  /** The same in the body's own frame, where its shapes are stored. */
  lokalPunkt: [number, number, number];
  lokalNormal: [number, number, number];
  /** Symmetric parts (an eye pair) may be mirrored across the body's middle. */
  symmetrisk: boolean;
}

const grader = (r: number) => Math.round(((r * 180) / Math.PI) * 10) / 10;

/**
 * Shapes for a library part placed at an attachment point, in the body's
 * frame. Pure; the caller applies them as one undoable change.
 */
export function plasserDel(del: Bibliotekdel, feste: Festepunkt): Form[] {
  const n = feste.lokalNormal;
  // attachment frame: out = n, up = +Z (or +Y when n is vertical), side = up × out
  const opp: [number, number, number] = Math.abs(n[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const side: [number, number, number] = [
    opp[1] * n[2] - opp[2] * n[1],
    opp[2] * n[0] - opp[0] * n[2],
    opp[0] * n[1] - opp[1] * n[0],
  ];
  // pointing out of the surface: R = Ry(b)·Rx(a) maps +Z to n
  const ut: [number, number, number] = [
    grader(-Math.asin(Math.max(-1, Math.min(1, n[1])))),
    grader(Math.atan2(n[0], n[2])),
    0,
  ];
  return del.former.map((d, i) => {
    const [a, b, c] = d.forskyvning;
    const pos: [number, number, number] = [0, 1, 2].map(
      (k) => feste.lokalPunkt[k]! + side[k]! * a + opp[k]! * b + n[k]! * c,
    ) as [number, number, number];
    const speilet = feste.symmetrisk && !!d.speilet;
    // a mirrored part sits on the +X side; its copy is on −X
    if (speilet) pos[0] = Math.abs(pos[0]);
    return {
      id: nyId('f'),
      navn: del.former.length > 1 ? `${del.navn} ${i + 1}` : del.navn,
      kropp: feste.kropp,
      type: d.type,
      posisjon: pos.map((v) => Math.round(v * 10) / 10) as [number, number, number],
      rotasjon: d.langsNormal ? ut : (d.rotasjon ?? [0, 0, 0]),
      mal: d.mal,
      avrunding: d.avrunding ?? 0,
      operasjon: 'smelt',
      smelting: d.smelting ?? 3,
      speilet,
      komponent: { id: del.id, versjon: del.versjon },
    };
  });
}

/** Clicker templates. The modular builder starts from «La oss bygge» (kroppsbibliotek.ts). */
export interface Startmal {
  id: string;
  navn: string;
  beskrivelse: string;
  parametre: () => BuildforgeParametre;
}

function form(
  navn: string,
  kropp: 'topp' | 'underdel',
  type: Formtype,
  posisjon: [number, number, number],
  mal: [number, number, number],
  ekstra: Partial<Form> = {},
): Form {
  return {
    id: nyId('f'),
    navn,
    kropp,
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

const profil = { id: MX_PROVE.id, versjon: MX_PROVE.versjon };

export const startmaler: Startmal[] = [
  {
    id: 'knapp',
    navn: 'Enkel knapp',
    beskrivelse: 'En myk kloss på toppen. Godt sted å begynne.',
    parametre: () => ({
      skjema: 1,
      profil,
      mal: 'knapp',
      farger: { topp: 'pla-lilla', underdel: 'pla-grafitt' },
      former: [form('Knappetopp', 'topp', 'boks', [0, 0, 26.5], [20, 20, 8], { avrunding: 3.5 })],
    }),
  },
  {
    id: 'sopp',
    navn: 'Sopp',
    beskrivelse: 'En bred hatt på toppen og en rund fot.',
    parametre: () => ({
      skjema: 1,
      profil,
      mal: 'sopp',
      farger: { topp: 'pla-rust', underdel: 'matt-sand' },
      former: [
        form('Hatt', 'topp', 'sylinder', [0, 0, 27], [30, 30, 9], { avrunding: 4.5 }),
        form('Prikk', 'topp', 'kule', [6, -4, 31.5], [5, 5, 5], { smelting: 1, speilet: true }),
        form('Fot', 'underdel', 'sylinder', [0, 0, 4.5], [28, 28, 9], { avrunding: 3 }),
      ],
    }),
  },
  {
    id: 'figur',
    navn: 'Hode med ører',
    beskrivelse: 'Et rundt hode med øyne og ører på knappen.',
    parametre: () => ({
      skjema: 1,
      profil,
      mal: 'figur',
      farger: { topp: 'pla-cyan', underdel: 'pla-grafitt' },
      former: [
        form('Hode', 'topp', 'kule', [0, 0, 32], [22, 22, 22], { smelting: 4 }),
        form('Øyne', 'topp', 'kule', [4, -9.8, 34], [5, 5, 5], {
          smelting: 1,
          speilet: true,
          komponent: { id: 'oyne', versjon: '1' },
        }),
        form('Ører', 'topp', 'kule', [8, 0, 41.5], [8, 8, 8], {
          smelting: 2,
          speilet: true,
          komponent: { id: 'orer', versjon: '1' },
        }),
      ],
    }),
  },
];

export function finnStartmal(id: string): Startmal {
  return startmaler.find((m) => m.id === id) ?? startmaler[0]!;
}
