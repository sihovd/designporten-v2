/**
 * The shared Skaperverksted document model.
 *
 * Coordinates: millimetres. X to the right, Y up (away from the viewer on the
 * build plate), Z up from the plate. Origin at the centre of the plate.
 * Generators that are parametric (lamp, dragon) keep their state in
 * `parametre`; object-based generators (Signgen) use layers and objects.
 * Documents are plain JSON (no class instances) so they serialise, diff,
 * go to workers and into undo history cheaply.
 */
import type { Transform2D } from './geometri2d';
import type { Strek } from '../geometri/strek';
import type { Profil } from './profil';

export const DOKUMENT_VERSJON = 1;

export type ObjektId = string;
export type LagId = string;

export interface TekstKilde {
  type: 'tekst';
  tekst: string;
  fontId: string;
  /** Cap height is not used; this is the font size in mm (em size). */
  storrelse: number;
  /** Extra space between letters, in em (0 = normal). */
  sperring: number;
  linjeavstand: number;
  justering: 'venstre' | 'midt' | 'hoyre';
  /** Marks the text as a batch field (CSV column name). */
  felt?: string;
}

export interface SvgKilde {
  type: 'svg';
  /** Normalised path data in mm, Y up, centred on the origin. */
  stier: string[];
  filnavn: string;
  /** How the source's fill rule should be applied. */
  fyllregel: 'nonzero' | 'evenodd';
  /** Holes in the vector: kept as holes (default) or filled so only the silhouette is left. */
  hull?: 'behold' | 'fyll';
  /** The gallery element it came from; a CSV column can swap it for another one. */
  dekorId?: string;
  /** Marks the vector as a batch variable (CSV column name): the cell names the gallery element. */
  felt?: string;
  /**
   * A Paint stroke: the centre line and width profile `stier` was drawn from, so the width can be
   * changed afterwards. Editing the outline's points turns it into an ordinary vector (this is dropped).
   */
  strek?: Strek;
}

export interface FormKilde {
  type: 'form';
  form: 'rektangel' | 'ellipse' | 'polygon' | 'hull';
  bredde: number;
  hoyde: number;
  /** Corner radius for rectangles (mm). */
  hjorneradius: number;
  /** Number of sides for polygons. */
  sider: number;
  /** Hanging holes outside the model become an eye: the ring's width around the hole (mm). */
  ringBredde?: number;
  /**
   * Hanging holes in a CSV batch: keep the distance to the printed letters
   * («navn»), keep the place on the sign («fast») or decide from the sign
   * («auto»: follow the name unless the hole lies on a fixed plate).
   */
  plass?: 'auto' | 'navn' | 'fast';
}

export type ObjektKilde = TekstKilde | SvgKilde | FormKilde;

export interface Objekt {
  id: ObjektId;
  navn: string;
  lagId: LagId;
  kilde: ObjektKilde;
  transform: Transform2D;
  synlig: boolean;
  last: boolean;
  /** Boolean role within its layer: add material or cut a hole. */
  operasjon: 'legg-til' | 'trekk-fra';
  /**
   * Sign Forge: a colour of its own. Without it the object prints in the layer's colour. The
   * layer's outline, height and profile are the same either way (Sivert, 2026-10-07).
   */
  materialId?: string;
}

/** An outline from one layer applied to another (Signgen Phase 5). */
export interface LagPavirkning {
  kildeLagId: LagId;
  handling: 'legg-til' | 'kutt';
  /** Offset of the source outline before it is applied (mm, + = outward). */
  avstand: number;
}

export interface Kontur {
  /** Offset of this layer's own outline (mm). 0 = none. */
  avstand: number;
  hjorne: 'rund' | 'skarp' | 'faset';
  /** Keep only the ring (outline) instead of the filled offset shape. */
  kunRing: boolean;
  ringBredde: number;
}

/**
 * Sign Forge: an outline around the text of a text layer (Sivert,
 * 2026-10-05). It never covers the text, has its own height and colour,
 * and starts at the text layer's Z. Outlines are listed inside out.
 */
export interface Omriss {
  id: string;
  navn: string;
  /** «omriss»: a ring that follows the edge. «fyll»: filled out to the edge, closing holes. */
  type: 'omriss' | 'fyll';
  /** Gap between what is inside (the text or the previous outline) and this outline (mm). */
  avstand: number;
  /** Width of the outline (mm). For «fyll» the filled distance beyond the gap. */
  bredde: number;
  /** Own height (mm), independent of the text's height. */
  hoyde: number;
  materialId: string;
  hjorne: 'rund' | 'skarp' | 'faset';
  synlig: boolean;
  last: boolean;
}

export interface Lag {
  id: LagId;
  navn: string;
  /** Bottom of the layer above the plate (mm). */
  zBunn: number;
  /** Physical thickness (mm). */
  hoyde: number;
  materialId: string;
  profil: Profil;
  kontur: Kontur;
  pavirkninger: LagPavirkning[];
  synlig: boolean;
  last: boolean;
  /**
   * Sign Forge: a text layer holds text only. Several texts in one text
   * layer are a group and share its outlines.
   */
  tekstlag?: boolean;
  /** Sign Forge: the text layer's outlines, inside out. */
  omriss?: Omriss[];
  /** Sign Forge: the text stands up («normal») or is cut out of the outlines («kutt»). */
  tekstvisning?: 'normal' | 'kutt';
  /**
   * Sign Forge: the layer starts at the same Z as the layer under it instead of on top of it, so
   * parts of different colours can lie side by side (a horse with a mane in another colour).
   */
  sammeNivaa?: boolean;
}

export interface Plate {
  bredde: number;
  dybde: number;
  /** Build height limit (mm). */
  hoyde: number;
  printerProfilId: string;
}

/**
 * A guide line on the 2D canvas (Sign Forge): vertical (`akse` «x», at x = verdi) or horizontal
 * («y»). Saved with the project; never part of the model, so it is not in the 3D view or the export.
 */
export interface Hjelpelinje {
  id: string;
  akse: 'x' | 'y';
  /** Position on the axis (mm, plate centre = 0). */
  verdi: number;
  last?: boolean;
}

export interface Dokument {
  versjon: number;
  id: string;
  generator: string;
  navn: string;
  plate: Plate;
  /** Bottom to top = physical order. */
  lag: Lag[];
  objekter: Record<ObjektId, Objekt>;
  /** Object order inside each layer (back to front). */
  rekkefolge: Record<LagId, ObjektId[]>;
  /** Parametric generator state. */
  parametre: Record<string, unknown>;
  /** Sign Forge: guide lines (older projects have none). */
  hjelpelinjer?: Hjelpelinje[];
  meta: { opprettet: string; endret: string };
}

let teller = 0;
export function nyId(prefiks = 'o'): string {
  teller = (teller + 1) % 1_000_000;
  const tilfeldig = Math.random().toString(36).slice(2, 8);
  return `${prefiks}_${Date.now().toString(36)}${teller.toString(36)}${tilfeldig}`;
}

export function tomtDokument(generator: string, navn: string, plate: Plate): Dokument {
  const na = new Date().toISOString();
  return {
    versjon: DOKUMENT_VERSJON,
    id: nyId('d'),
    generator,
    navn,
    plate,
    lag: [],
    objekter: {},
    rekkefolge: {},
    parametre: {},
    meta: { opprettet: na, endret: na },
  };
}

/** Objects of a layer in stacking order. */
export function objekterILag(dok: Dokument, lagId: LagId): Objekt[] {
  return (dok.rekkefolge[lagId] ?? []).map((id) => dok.objekter[id]).filter((o): o is Objekt => !!o);
}

export function finnLag(dok: Dokument, lagId: LagId): Lag | undefined {
  return dok.lag.find((l) => l.id === lagId);
}

/** Total height of the model (top of the highest visible layer). */
export function modellHoyde(dok: Dokument): number {
  return dok.lag.reduce((h, l) => (l.synlig ? Math.max(h, l.zBunn + l.hoyde) : h), 0);
}

/** Serialise for storage/export. */
export function tilJson(dok: Dokument): string {
  return JSON.stringify(dok);
}

export class DokumentFeil extends Error {}

/** Parse and migrate a stored document. Throws DokumentFeil on invalid input. */
export function fraJson(tekst: string): Dokument {
  let data: unknown;
  try {
    data = JSON.parse(tekst);
  } catch {
    throw new DokumentFeil('Filen er ikke gyldig JSON.');
  }
  if (!data || typeof data !== 'object') throw new DokumentFeil('Filen inneholder ikke et prosjekt.');
  const d = data as Partial<Dokument>;
  if (typeof d.versjon !== 'number' || typeof d.generator !== 'string' || !Array.isArray(d.lag)) {
    throw new DokumentFeil('Filen er ikke et Skaperverksted-prosjekt.');
  }
  if (d.versjon > DOKUMENT_VERSJON) {
    throw new DokumentFeil('Prosjektet er laget med en nyere versjon av Skaperverksted.');
  }
  // Migrations go here when DOKUMENT_VERSJON increases.
  return d as Dokument;
}
