/**
 * The drawing editor's document (Dragon Forge built from scratch as a 2D
 * drawing tool, docs/design/dragon-forge.md). Plain JSON in
 * `Dokument.parametre.tegning`; colours stay in the classic keys
 * (`farger`, `monster`) so the colour picker and zones are shared.
 *
 * What the user draws:
 *
 *   - the SPINE (`rygg`), a smooth curve through points on the plate, seen
 *     from above, nose first. The pieces and the joints between them are
 *     laid out along it automatically;
 *   - the WIDTH along the spine (`bredde`), dragged out from the spine in
 *     the top view;
 *   - the HEIGHT along the spine (`hoyde`), dragged in the side view;
 *   - ELEMENTS on the spine (spikes and plates), each on the piece it
 *     lands on.
 *
 * Positions along the spine are fractions 0 (nose) to 1 (tail tip), so
 * width, height and elements follow when the spine is redrawn.
 */
import {
  katalog,
  type Halevariant,
  type Hodevariant,
  type Hornvariant,
  type Oyevariant,
  type Piggvariant,
} from '../parametre';

export const TEGNESKJEMA = 1;

export type V2 = [number, number];

/** A value at a fraction of the spine (0 = nose, 1 = tail tip). */
export interface Profilpunkt {
  t: number;
  verdi: number;
}

export type Elementtype = 'pigg';
export type Elementform = Exclude<Piggvariant, 'ingen'>;

export interface Element {
  id: string;
  type: Elementtype;
  /** Where on the spine; the element sits on the piece this lands on. */
  t: number;
  form: Elementform;
}

export interface Tegning {
  skjema: typeof TEGNESKJEMA;
  /** Spine points on the plate (mm, plate centre at 0, y towards the back of the plate), nose first. */
  rygg: V2[];
  /** Number of pieces including head and tail tip, or null for automatic. */
  antallDeler: number | null;
  /** Full body width (mm) along the spine. */
  bredde: Profilpunkt[];
  /** Body height (mm) along the spine. */
  hoyde: Profilpunkt[];
  hode: { form: Hodevariant; horn: Hornvariant; oyne: Oyevariant };
  hale: Halevariant;
  elementer: Element[];
}

export const BREDDE_MIN = 6;
export const BREDDE_MAKS = 80;
export const HOYDE_MIN = 4;
export const HOYDE_MAKS = 60;
export const DELER_MIN = 3;
export const DELER_MAKS = 24;
/** Spine points stay on a generous area around the plate. */
export const RYGG_GRENSE = 400;
export const RYGG_MAKS_PUNKTER = 40;

export const elementformer: { id: Elementform; navn: string; beskrivelse: string }[] = katalog.pigger
  .filter((v) => v.id !== 'ingen')
  .map((v) => ({ id: v.id as Elementform, navn: v.navn, beskrivelse: v.beskrivelse }));

/** A gentle S-curve that fits the standard plate: something to draw on from the first second. */
export function standardTegning(): Tegning {
  return {
    skjema: TEGNESKJEMA,
    rygg: [
      [80, 6],
      [42, 14],
      [2, 6],
      [-38, -8],
      [-80, -10],
    ],
    antallDeler: null,
    bredde: [
      { t: 0, verdi: 30 },
      { t: 0.3, verdi: 26 },
      { t: 0.5, verdi: 27 },
      { t: 0.8, verdi: 15 },
      { t: 1, verdi: 10 },
    ],
    hoyde: [
      { t: 0, verdi: 21 },
      { t: 0.35, verdi: 17 },
      { t: 0.7, verdi: 12 },
      { t: 1, verdi: 8 },
    ],
    hode: { form: 'rund', horn: 'sma', oyne: 'store' },
    hale: 'spade',
    elementer: [
      { id: 'e1', type: 'pigg', t: 0.3, form: 'spisse' },
      { id: 'e2', type: 'pigg', t: 0.42, form: 'spisse' },
      { id: 'e3', type: 'pigg', t: 0.54, form: 'spisse' },
      { id: 'e4', type: 'pigg', t: 0.66, form: 'spisse' },
    ],
  };
}

export interface Tegningsinnlesing {
  tegning: Tegning;
  /** What was repaired, in plain words (shown as notices). */
  problemer: string[];
}

const tall = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const klemme = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function velg<T extends string>(liste: readonly { id: T }[], verdi: unknown, standard: T): T {
  return liste.some((x) => x.id === verdi) ? (verdi as T) : standard;
}

function lesProfil(raa: unknown, min: number, maks: number, standard: Profilpunkt[]): Profilpunkt[] | null {
  if (!Array.isArray(raa)) return null;
  const ut = raa
    .filter((p): p is Profilpunkt => !!p && tall((p as Profilpunkt).t) && tall((p as Profilpunkt).verdi))
    .map((p) => ({ t: klemme(p.t, 0, 1), verdi: klemme(p.verdi, min, maks) }))
    .sort((a, b) => a.t - b.t);
  return ut.length ? ut : standard;
}

/**
 * Read a stored drawing. Fills defaults, clamps every number to what can be
 * built, and says what it repaired. Never throws.
 */
export function lesTegning(raa: unknown): Tegningsinnlesing {
  const s = standardTegning();
  const problemer: string[] = [];
  if (!raa || typeof raa !== 'object') return { tegning: s, problemer };
  const r = raa as Partial<Record<keyof Tegning, unknown>>;

  let rygg = s.rygg;
  if (Array.isArray(r.rygg)) {
    const punkter = r.rygg
      .filter((p): p is V2 => Array.isArray(p) && tall(p[0]) && tall(p[1]))
      .map((p): V2 => [klemme(p[0], -RYGG_GRENSE, RYGG_GRENSE), klemme(p[1], -RYGG_GRENSE, RYGG_GRENSE)])
      .slice(0, RYGG_MAKS_PUNKTER);
    if (punkter.length >= 2) rygg = punkter;
    else problemer.push('Ryggen manglet punkter og er tegnet på nytt.');
  }

  const bredde = lesProfil(r.bredde, BREDDE_MIN, BREDDE_MAKS, s.bredde) ?? s.bredde;
  const hoyde = lesProfil(r.hoyde, HOYDE_MIN, HOYDE_MAKS, s.hoyde) ?? s.hoyde;
  const h = (r.hode ?? {}) as Partial<Tegning['hode']>;
  const brukte = new Set<string>();
  const elementer = Array.isArray(r.elementer)
    ? r.elementer
        .filter((e): e is Element => !!e && typeof e === 'object' && tall((e as Element).t))
        .map((e, i) => {
          let id = typeof e.id === 'string' && e.id ? e.id : `e${i + 1}`;
          while (brukte.has(id)) id = `${id}x`;
          brukte.add(id);
          return {
            id,
            type: 'pigg' as const,
            t: klemme(e.t, 0, 1),
            form: velg(elementformer, e.form, 'spisse'),
          };
        })
    : s.elementer;

  const antall = r.antallDeler;
  return {
    tegning: {
      skjema: TEGNESKJEMA,
      rygg,
      antallDeler: tall(antall) ? Math.round(klemme(antall, DELER_MIN, DELER_MAKS)) : null,
      bredde,
      hoyde,
      hode: {
        form: velg(katalog.hode, h.form, s.hode.form),
        horn: velg(katalog.horn, h.horn, s.hode.horn),
        oyne: velg(katalog.oyne, h.oyne, s.hode.oyne),
      },
      hale: velg(katalog.hale, r.hale, s.hale),
      elementer,
    },
    problemer,
  };
}

/** Value of a profile at t: linear between points, flat beyond the ends. */
export function profilVerdi(p: Profilpunkt[], t: number): number {
  if (!p.length) return 0;
  if (t <= p[0]!.t) return p[0]!.verdi;
  for (let i = 1; i < p.length; i++) {
    const b = p[i]!;
    if (t <= b.t) {
      const a = p[i - 1]!;
      const u = b.t - a.t < 1e-9 ? 1 : (t - a.t) / (b.t - a.t);
      // smoothstep keeps the outline free of kinks at the points
      const w = u * u * (3 - 2 * u);
      return a.verdi + (b.verdi - a.verdi) * w;
    }
  }
  return p.at(-1)!.verdi;
}

/** A free element id. */
export function nyElementId(t: Tegning): string {
  let n = t.elementer.length + 1;
  while (t.elementer.some((e) => e.id === `e${n}`)) n++;
  return `e${n}`;
}
