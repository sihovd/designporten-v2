/**
 * The snap engine of Sign Forge (Sivert, 2026-10-10): one set of rules for where a moved object or sign may
 * go, used by the 2D editor and by the build plate of the CSV workflow. It only decides a placement; the
 * geometry, the colours and the CSV connections of what is moved are never touched.
 *
 * Four kinds of target, all read from real geometry:
 *  - edges and centres of boxes, guide lines and the grid (the 2D editor's old snapping),
 *  - snap points, which sit on the master and follow its geometry (see `snappunkter.ts`),
 *  - contours: the outline of what is moved is held at a minimum distance from the outline of its neighbours,
 *    so a sign slides along a curve or into a notch instead of stopping at a bounding box.
 *
 * Settings live in the master (`parametre.snap`) and so follow every sign the CSV makes from it. The engine is
 * switched on and off with the «Snap» switch of the workbench; Alt switches it off while an object is moved.
 */
import type { Dokument } from '../../core/dokument';
import type { Boks, Vec2 } from '../../core/geometri2d';
import { OPPLOSNING, minsteAvstand, type Silhuett } from './silhuett';

// ---------- settings in the master ----------

/** A snap point on the master. It sits on a place in the geometry of its target and follows it. */
export interface Snappunkt {
  id: string;
  navn: string;
  /** What it sits on: the whole sign (its footprint) or the id of one object. */
  mal: 'skilt' | string;
  /** Where in the box of the target, from the lower left (0, 0) to the upper right (1, 1). */
  u: number;
  v: number;
}

export interface Snapoppsett {
  /** How close (mm) a moved object has to come to a target before it is pulled in. */
  fangavstand: number;
  /** The distance (mm) kept between contours, also the space the automatic packing leaves between signs. */
  avstand: number;
  /** In the 2D editor: hold objects at `avstand` from the contour of the others (off until asked for). */
  konturer: boolean;
  /** Snap to the snap points. */
  punkter: boolean;
  punktliste: Snappunkt[];
}

export const STANDARD_SNAP: Snapoppsett = {
  fangavstand: 3,
  avstand: 5,
  konturer: false,
  punkter: true,
  punktliste: [],
};

/** The limits the fields keep to, so the distance field of a silhouette always reaches far enough. */
export const SNAPGRENSER = {
  fangavstand: { min: 0.5, maks: 10 },
  avstand: { min: 1, maks: 30 },
};

const klem = (v: number, min: number, maks: number) => Math.min(maks, Math.max(min, v));

/** The snap settings of a document, with what is missing filled in. Older work keeps its plate spacing. */
export function lesSnap(dok: Dokument): Snapoppsett {
  const p = dok.parametre as {
    snap?: Partial<Snapoppsett>;
    csvarbeid?: { valg?: { plateavstand?: unknown } };
  };
  const s = p.snap ?? {};
  const gammel = p.csvarbeid?.valg?.plateavstand;
  const tall = (v: unknown, std: number) => (typeof v === 'number' && Number.isFinite(v) ? v : std);
  return {
    fangavstand: klem(
      tall(s.fangavstand, STANDARD_SNAP.fangavstand),
      SNAPGRENSER.fangavstand.min,
      SNAPGRENSER.fangavstand.maks,
    ),
    avstand: klem(
      tall(s.avstand, typeof gammel === 'number' ? gammel : STANDARD_SNAP.avstand),
      SNAPGRENSER.avstand.min,
      SNAPGRENSER.avstand.maks,
    ),
    konturer: typeof s.konturer === 'boolean' ? s.konturer : STANDARD_SNAP.konturer,
    punkter: typeof s.punkter === 'boolean' ? s.punkter : STANDARD_SNAP.punkter,
    punktliste: Array.isArray(s.punktliste) ? s.punktliste : [],
  };
}

export function settSnap(dok: Dokument, endring: Partial<Snapoppsett>): Dokument {
  const naa = lesSnap(dok);
  const ny = { ...naa, ...endring };
  const s: Snapoppsett = {
    ...ny,
    fangavstand: klem(ny.fangavstand, SNAPGRENSER.fangavstand.min, SNAPGRENSER.fangavstand.maks),
    avstand: klem(ny.avstand, SNAPGRENSER.avstand.min, SNAPGRENSER.avstand.maks),
  };
  return { ...dok, parametre: { ...dok.parametre, snap: s } };
}

// ---------- edges, centres, guides and the grid ----------

export interface KantMal {
  rutenett: boolean;
  hjelpelinjer: boolean;
  objekter: boolean;
  sentre: boolean;
}

export interface AkseTreff {
  akse: 'x' | 'y';
  /** The move (mm) that puts the edge on the target. */
  d: number;
  /** Where the target is on the axis. */
  verdi: number;
  /** The box it is the edge or centre of; null for a guide line. */
  mal: Boks | null;
}

/**
 * Where a box lands when its edges and centre are pulled to the edges and centres of the other boxes, to guide
 * lines and, when nothing else is near, to the grid. `terskel` is how near (mm) a target has to be.
 */
export function snapKanter(
  b: Boks,
  andre: readonly Boks[],
  guider: readonly { akse: 'x' | 'y'; verdi: number }[],
  mal: KantMal,
  terskel: number,
  rutenettSteg: number,
): { dx: number; dy: number; treff: AkseTreff[] } {
  const plate: Boks = { minX: 0, maksX: 0, minY: 0, maksY: 0 };
  const mine = {
    x: [b.minX, (b.minX + b.maksX) / 2, b.maksX],
    y: [b.minY, (b.minY + b.maksY) / 2, b.maksY],
  };
  const res = { dx: 0, dy: 0, treff: [] as AkseTreff[] };
  for (const akse of ['x', 'y'] as const) {
    let best: AkseTreff | null = null;
    const prov = (a: number, t: number, m: Boks | null) => {
      const d = t - a;
      if (Math.abs(d) <= terskel && (!best || Math.abs(d) < Math.abs(best.d)))
        best = { akse, d, verdi: t, mal: m };
    };
    // edges and centres of the other boxes (and the plate centre)
    for (const m of mal.objekter || mal.sentre ? [plate, ...andre] : []) {
      const lav = akse === 'x' ? m.minX : m.minY;
      const hoy = akse === 'x' ? m.maksX : m.maksY;
      const deres = [...(mal.objekter ? [lav, hoy] : []), ...(mal.sentre ? [(lav + hoy) / 2] : [])];
      for (const a of mine[akse]) for (const t of deres) prov(a, t, m);
    }
    // guide lines: any edge or the centre of the box
    if (mal.hjelpelinjer)
      for (const g of guider) if (g.akse === akse) for (const a of mine[akse]) prov(a, g.verdi, null);
    const treff = best as AkseTreff | null;
    if (treff) {
      if (akse === 'x') res.dx = treff.d;
      else res.dy = treff.d;
      res.treff.push(treff);
    } else if (mal.rutenett) {
      // grid: put the leading edge on the grid
      const a = mine[akse][0]!;
      const d = Math.round(a / rutenettSteg) * rutenettSteg - a;
      if (akse === 'x') res.dx = d;
      else res.dy = d;
    }
  }
  return res;
}

// ---------- snap points ----------

/** The nine places of a box: corners, middles of the sides and the centre. */
export function boksAnkere(b: Boks): Vec2[] {
  const xs = [b.minX, (b.minX + b.maksX) / 2, b.maksX];
  const ys = [b.minY, (b.minY + b.maksY) / 2, b.maksY];
  return ys.flatMap((y) => xs.map((x) => ({ x, y })));
}

export interface Punktfangst {
  dx: number;
  dy: number;
  /** The moved point and the point it lands on. */
  fra: Vec2;
  til: Vec2;
  /** The id of the target point, when it has one. */
  malId?: string;
}

/** The nearest pair of a moved point and a target point within `terskel` mm: how far to move to put them together. */
export function snapPunkter(
  mine: readonly Vec2[],
  mal: readonly (Vec2 & { id?: string })[],
  terskel: number,
): Punktfangst | null {
  let best: Punktfangst | null = null;
  let bestD = Infinity;
  for (const a of mine) {
    for (const t of mal) {
      const d = Math.hypot(t.x - a.x, t.y - a.y);
      if (d <= terskel && d < bestD) {
        bestD = d;
        best = { dx: t.x - a.x, dy: t.y - a.y, fra: a, til: { x: t.x, y: t.y }, malId: t.id };
      }
    }
  }
  return best;
}

// ---------- contours ----------

/** What is moved, or what it may lie against, as plain data: its contour and where it lies. */
export interface PlassertSkilt {
  /** CSV row (a sign) or any other id. */
  id: number;
  silhuett: Silhuett;
  /** The box in its own coordinates. */
  boks: Boks;
  /** Total offset (mm) to the plate. */
  dx: number;
  dy: number;
  /** Snap points in its own coordinates. */
  punkter?: readonly Vec2[];
}

const boksVed = (s: PlassertSkilt, dx = s.dx, dy = s.dy): Boks => ({
  minX: s.boks.minX + dx,
  maksX: s.boks.maksX + dx,
  minY: s.boks.minY + dy,
  maksY: s.boks.maksY + dy,
});

const boksNaer = (a: Boks, b: Boks, rom: number) =>
  a.minX - rom < b.maksX && a.maksX + rom > b.minX && a.minY - rom < b.maksY && a.maksY + rom > b.minY;

/** Keep the box of a sign on the plate. */
export function holdPaPlata(
  boks: Boks,
  dx: number,
  dy: number,
  plate: { bredde: number; dybde: number },
): { dx: number; dy: number } {
  const w = plate.bredde / 2;
  const d = plate.dybde / 2;
  let x = dx;
  let y = dy;
  if (boks.maksX + x > w) x = w - boks.maksX;
  if (boks.minX + x < -w) x = -w - boks.minX;
  if (boks.maksY + y > d) y = d - boks.maksY;
  if (boks.minY + y < -d) y = -d - boks.minY;
  return { dx: x, dy: y };
}

export interface SnapKontakt {
  /** What it holds on to: a contour at a distance, or a snap point put on a snap point. */
  type: 'kontur' | 'punkt';
  /** The neighbour it holds on to (its id). */
  nabo: number;
  /** Closest point on the moved sign, and on the neighbour (plate mm). */
  a: [number, number];
  b: [number, number];
  /** The distance between the two outlines (mm); 0 for two snap points put together. */
  d: number;
}

export interface Snapresultat {
  dx: number;
  dy: number;
  /** Set while the sign holds on to a neighbour. */
  kontakt: SnapKontakt | null;
}

const MAKS_RUNDER = 40;

export interface Snapvalg {
  paa: boolean;
  /** The distance kept between contours (mm). */
  avstand: number;
  /** How near a target has to be before it pulls (mm). */
  radius: number;
  /** Also snap the snap points of the moved sign to those of the neighbours. */
  punkter?: boolean;
}

/**
 * Where a sign or object ends up when it is dragged to (dx, dy): a snap point is put on a snap point of a
 * neighbour when two are within `radius` mm of each other; otherwise it is pulled to the contour of a neighbour
 * that is within `radius` mm of the wanted distance, pushed out when it would be closer than `avstand` mm, and
 * so slid along the contour as the pointer moves on. With `plate` the sign is kept on the plate. With `paa` off
 * it only stays on the plate.
 */
export function snapSkilt(
  mover: PlassertSkilt,
  dx: number,
  dy: number,
  naboer: readonly PlassertSkilt[],
  plate: { bredde: number; dybde: number } | null,
  valg: Snapvalg,
): Snapresultat {
  const hold = (x: number, y: number) => (plate ? holdPaPlata(mover.boks, x, y, plate) : { dx: x, dy: y });
  let p = hold(dx, dy);
  if (!valg.paa) return { ...p, kontakt: null };

  // snap points first: two points put together say more than a distance
  if (valg.punkter && mover.punkter?.length) {
    let best: { n: PlassertSkilt; a: Vec2; b: Vec2; d: number } | null = null;
    for (const n of naboer) {
      for (const mp of mover.punkter) {
        for (const np of n.punkter ?? []) {
          const ax = mp.x + p.dx;
          const ay = mp.y + p.dy;
          const bx = np.x + n.dx;
          const by = np.y + n.dy;
          const d = Math.hypot(bx - ax, by - ay);
          if (d <= valg.radius && (!best || d < best.d))
            best = { n, a: { x: ax, y: ay }, b: { x: bx, y: by }, d };
        }
      }
    }
    if (best) {
      const q = hold(p.dx + (best.b.x - best.a.x), p.dy + (best.b.y - best.a.y));
      return {
        ...q,
        kontakt: {
          type: 'punkt',
          nabo: best.n.id,
          a: [best.b.x, best.b.y],
          b: [best.b.x, best.b.y],
          d: 0,
        },
      };
    }
  }

  const mal = valg.avstand;
  const rom = mal + valg.radius;
  let kontakt: SnapKontakt | null = null;
  for (let runde = 0; runde < MAKS_RUNDER; runde++) {
    const mine = boksVed(mover, p.dx, p.dy);
    let best: { n: PlassertSkilt; k: ReturnType<typeof minsteAvstand> } | null = null;
    for (const n of naboer) {
      if (!boksNaer(mine, boksVed(n), rom)) continue;
      const k = minsteAvstand(mover.silhuett, p.dx, p.dy, n.silhuett, n.dx, n.dy);
      if (k.d < rom && (!best || k.d < best.k.d)) best = { n, k };
    }
    if (!best) {
      kontakt = null;
      break;
    }
    const { n, k } = best;
    kontakt = { type: 'kontur', nabo: n.id, a: k.a, b: k.b, d: k.d };
    const feil = mal - k.d;
    if (Math.abs(feil) < OPPLOSNING / 2) break;
    let [rx, ry] = k.retning;
    let skritt = feil;
    if (k.overlapper) {
      // overlapping: no outside to read a direction from, so move away from the neighbour's centre in 1 mm steps
      const m = boksVed(mover, p.dx, p.dy);
      const nb = boksVed(n);
      const vx = (m.minX + m.maksX) / 2 - (nb.minX + nb.maksX) / 2;
      const vy = (m.minY + m.maksY) / 2 - (nb.minY + nb.maksY) / 2;
      const l = Math.hypot(vx, vy) || 1;
      rx = vx / l;
      ry = vy / l;
      skritt = 1;
    }
    p = hold(p.dx + rx * skritt, p.dy + ry * skritt);
  }
  return { ...p, kontakt };
}

export interface Plasseringsproblem {
  /** Signs that overlap another sign (ids). */
  overlapper: number[];
  /** Signs that stick out over the edge of the plate (ids). */
  utenfor: number[];
}

/** Signs on a plate that overlap each other or stick out over the edge. */
export function plasseringsproblemer(
  skilt: readonly PlassertSkilt[],
  plate: { bredde: number; dybde: number },
): Plasseringsproblem {
  const overlapper = new Set<number>();
  const utenfor: number[] = [];
  const w = plate.bredde / 2;
  const d = plate.dybde / 2;
  for (const s of skilt) {
    const b = boksVed(s);
    if (b.minX < -w - 0.01 || b.maksX > w + 0.01 || b.minY < -d - 0.01 || b.maksY > d + 0.01)
      utenfor.push(s.id);
  }
  for (let i = 0; i < skilt.length; i++) {
    for (let j = i + 1; j < skilt.length; j++) {
      const a = skilt[i]!;
      const b = skilt[j]!;
      if (!boksNaer(boksVed(a), boksVed(b), 0)) continue;
      if (minsteAvstand(a.silhuett, a.dx, a.dy, b.silhuett, b.dx, b.dy).overlapper) {
        overlapper.add(a.id);
        overlapper.add(b.id);
      }
    }
  }
  return { overlapper: [...overlapper].sort((x, y) => x - y), utenfor };
}
