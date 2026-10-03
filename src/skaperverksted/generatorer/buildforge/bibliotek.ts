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
import type { BuildforgeParametre, Form, Formtype } from './parametre';
import { MX_PROVE } from './profil';

export type FestepunktId =
  | 'topp-midt'
  | 'topp-front'
  | 'topp-venstre'
  | 'topp-hoyre'
  | 'topp-bak'
  | 'underdel-front'
  | 'underdel-venstre'
  | 'underdel-hoyre'
  | 'underdel-bak';

export const festenavn: Record<FestepunktId, string> = {
  'topp-midt': 'Toppen, øverst',
  'topp-front': 'Toppen, foran',
  'topp-venstre': 'Toppen, venstre side',
  'topp-hoyre': 'Toppen, høyre side',
  'topp-bak': 'Toppen, bak',
  'underdel-front': 'Underdelen, foran',
  'underdel-venstre': 'Underdelen, venstre side',
  'underdel-hoyre': 'Underdelen, høyre side',
  'underdel-bak': 'Underdelen, bak',
};

export const alleFestepunkter = Object.keys(festenavn) as FestepunktId[];

/** A shape inside a library part, positioned relative to the attachment point (local frame: +Z = out of the surface). */
interface Delform {
  type: Formtype;
  mal: [number, number, number];
  avrunding?: number;
  /** Offset in the attachment frame: [sideways, up, out]. */
  forskyvning: [number, number, number];
  speilet?: boolean;
  smelting?: number;
}

export interface Bibliotekdel {
  id: string;
  versjon: string;
  navn: string;
  beskrivelse: string;
  former: Delform[];
  passer: FestepunktId[];
}

export const bibliotek: Bibliotekdel[] = [
  {
    id: 'kule',
    versjon: '1',
    navn: 'Kule',
    beskrivelse: 'En rund form som smelter mykt inn.',
    former: [{ type: 'kule', mal: [12, 12, 12], forskyvning: [0, 0, 2.4] }],
    passer: alleFestepunkter,
  },
  {
    id: 'boks',
    versjon: '1',
    navn: 'Avrundet boks',
    beskrivelse: 'En kloss med myke kanter.',
    former: [{ type: 'boks', mal: [12, 12, 8], avrunding: 2, forskyvning: [0, 0, 1.6] }],
    passer: alleFestepunkter,
  },
  {
    id: 'sylinder',
    versjon: '1',
    navn: 'Sylinder',
    beskrivelse: 'En rund søyle eller skive.',
    former: [{ type: 'sylinder', mal: [10, 10, 8], avrunding: 1, forskyvning: [0, 0, 1.6] }],
    passer: alleFestepunkter,
  },
  {
    id: 'oyne',
    versjon: '1',
    navn: 'Øyne',
    beskrivelse: 'To like øyne, speilet. Passer foran på toppen.',
    former: [{ type: 'kule', mal: [5, 5, 5], forskyvning: [4, 1.5, 0.8], speilet: true, smelting: 1 }],
    passer: ['topp-front'],
  },
  {
    id: 'orer',
    versjon: '1',
    navn: 'Ører',
    beskrivelse: 'To runde ører, speilet. Passer øverst på toppen.',
    former: [{ type: 'kule', mal: [8, 8, 8], forskyvning: [7, 0, 1.6], speilet: true, smelting: 2 }],
    passer: ['topp-midt'],
  },
];

export function finnDel(id: string): Bibliotekdel | undefined {
  return bibliotek.find((d) => d.id === id);
}

export function kroppFor(punkt: FestepunktId): 'topp' | 'underdel' {
  return punkt.startsWith('topp') ? 'topp' : 'underdel';
}

export interface Festepunkt {
  id: FestepunktId;
  /** Point on the current surface (mm). */
  punkt: [number, number, number];
  /** Outward direction. */
  normal: [number, number, number];
}

/**
 * Shapes for a library part placed at an attachment point. Pure; the
 * caller applies them as one undoable change.
 */
export function plasserDel(del: Bibliotekdel, feste: Festepunkt): Form[] {
  const n = feste.normal;
  // attachment frame: out = n, up = +Z (or +Y when n is vertical), side = up × out
  const opp: [number, number, number] = Math.abs(n[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const side: [number, number, number] = [
    opp[1] * n[2] - opp[2] * n[1],
    opp[2] * n[0] - opp[0] * n[2],
    opp[0] * n[1] - opp[1] * n[0],
  ];
  const kropp = kroppFor(feste.id);
  return del.former.map((d, i) => {
    const [a, b, c] = d.forskyvning;
    const pos: [number, number, number] = [0, 1, 2].map(
      (k) => feste.punkt[k]! + side[k]! * a + opp[k]! * b + n[k]! * c,
    ) as [number, number, number];
    const speilet = !!d.speilet;
    // a mirrored part sits on the +X side; its copy is on −X
    if (speilet) pos[0] = Math.abs(pos[0]);
    return {
      id: nyId('f'),
      navn: del.former.length > 1 ? `${del.navn} ${i + 1}` : del.navn,
      kropp,
      type: d.type,
      posisjon: pos.map((v) => Math.round(v * 10) / 10) as [number, number, number],
      rotasjon: [0, 0, 0],
      mal: d.mal,
      avrunding: d.avrunding ?? 0,
      operasjon: 'smelt',
      smelting: d.smelting ?? 3,
      speilet,
      komponent: { id: del.id, versjon: del.versjon },
    };
  });
}

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
    navn: 'Liten figur',
    beskrivelse: 'Et rundt hode med øyne og ører.',
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
