/** The choices of the Pattern tool (kept apart from the geometry so the tool state can use them without a cycle). */
export interface Monstervalg {
  /** In one direction, or along another vector's path. */
  modus: 'retning' | 'bane';
  /** How many copies are made (the originals stay). */
  antall: number;
  /** Distance between copies (mm); along a path, 0 spreads them evenly over the whole path. */
  avstand: number;
  /** The direction (degrees, 0 = to the right, counter-clockwise), for «retning». */
  vinkel: number;
  /** The vector whose path the copies follow, for «bane». */
  baneId: string | null;
  /** Along a path: turn each copy to follow the path. */
  folgBane: boolean;
  /** Extra turn for every copy (degrees). */
  rotasjon: number;
}

export const STANDARD_MONSTER: Monstervalg = {
  modus: 'retning',
  antall: 5,
  avstand: 15,
  vinkel: 0,
  baneId: null,
  folgBane: true,
  rotasjon: 0,
};

export const MAKS_KOPIER = 100;
