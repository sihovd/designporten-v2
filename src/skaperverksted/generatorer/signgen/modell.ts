/**
 * Signgen geometry: objects → layer regions → printable parts.
 *
 * SVG + TEXT + SHAPES → LAYERS → HEIGHTS → PROFILES → COLOURS → 3D MODEL
 *
 * Object outlines are computed in local coordinates (centred on the
 * origin) and cached by source; the object transform places them. A layer
 * is the union of its «legg-til» objects minus its «trekk-fra» objects,
 * then its own outline offset (Kontur), then influences from other layers.
 * Hanging holes cut through every layer.
 */
import type { Font } from 'opentype.js';
import type { Dokument, Lag, Objekt, ObjektKilde } from '../../core/dokument';
import { finnLag, objekterILag } from '../../core/dokument';
import type { Advarsel, Modellresultat } from '../../core/generator';
import {
  tilMatrise,
  anvend,
  erTom,
  slaSammen,
  tomBoks,
  utvidBoks,
  type Boks,
  type Vec2,
} from '../../core/geometri2d';
import { finnMateriale, materialtyper } from '../../core/materialer';
import { mm } from '../../core/enheter';
import { profilOverheng } from '../../core/profil';
import {
  areal,
  differanse,
  flyttRegion,
  forskyv,
  regionBoks,
  regionFraRinger,
  snitt,
  transformerRegion,
  unionAlle,
  union,
  SKALA,
  type Region,
} from '../../geometri/polygon';
import { stiTilRinger } from '../../geometri/stidata';
import { formTilRinger } from '../../geometri/former';
import { lastFont, tekstTilRinger } from '../../geometri/tekst';
import { ekstruder } from '../../geometri/ekstruder';
import type { ModellDel } from '../../geometri/mesh';
import { bareHull, parametre, tekstUtenforTekstlag } from './dokument';
import { rettProfil } from '../../core/profil';

// ---------- fonts ----------

const klareFonter = new Map<string, Font>();
const lytterePaFont = new Set<() => void>();

/** Called when a font finishes loading (the canvas redraws). */
export function nårFontLastes(fn: () => void): () => void {
  lytterePaFont.add(fn);
  return () => lytterePaFont.delete(fn);
}

export function fontKlar(id: string): Font | null {
  const f = klareFonter.get(id);
  if (f) return f;
  void lastFont(id)
    .then((font) => {
      if (!klareFonter.has(id)) {
        klareFonter.set(id, font);
        for (const fn of lytterePaFont) fn();
      }
    })
    .catch(() => {
      /* reported through byggModell */
    });
  return null;
}

export async function lastFonter(dok: Dokument): Promise<string[]> {
  const ider = new Set<string>();
  for (const o of Object.values(dok.objekter)) if (o.kilde.type === 'tekst') ider.add(o.kilde.fontId);
  const feil: string[] = [];
  await Promise.all(
    [...ider].map(async (id) => {
      try {
        klareFonter.set(id, await lastFont(id));
      } catch {
        feil.push(id);
      }
    }),
  );
  return feil;
}

// ---------- local object geometry ----------

export interface LokalGeometri {
  region: Region;
  /** Layout/ink box in local mm (for handles and sizes). */
  boks: Boks;
  mangler: string[];
}

const TOM: LokalGeometri = { region: [], boks: { minX: -5, minY: -5, maksX: 5, maksY: 5 }, mangler: [] };
const lokalBuffer = new Map<string, LokalGeometri>();
const lokalEtterKilde = new WeakMap<ObjektKilde, LokalGeometri>();

function nokkel(k: ObjektKilde): string {
  // the batch field and the gallery id do not change the shape
  return JSON.stringify(
    k.type === 'tekst'
      ? { ...k, felt: undefined }
      : k.type === 'svg'
        ? { ...k, felt: undefined, dekorId: undefined }
        : k,
  );
}

/** Local outline of a source, or null while its font is loading. */
export function lokalGeometri(k: ObjektKilde): LokalGeometri | null {
  // by object first: the key below stringifies the source, which for an
  // imported SVG is its whole path data
  const direkte = lokalEtterKilde.get(k);
  if (direkte) return direkte;
  const n = nokkel(k);
  const b = lokalBuffer.get(n);
  if (b) {
    lokalEtterKilde.set(k, b);
    return b;
  }
  let g: LokalGeometri;
  if (k.type === 'tekst') {
    const font = fontKlar(k.fontId);
    if (!font) return null;
    if (!k.tekst.trim()) {
      g = {
        ...TOM,
        boks: {
          minX: -k.storrelse / 2,
          minY: -k.storrelse / 2,
          maksX: k.storrelse / 2,
          maksY: k.storrelse / 2,
        },
      };
    } else {
      const t = tekstTilRinger(font, k);
      const region = regionFraRinger(t.ringer, 'nonzero');
      g = {
        region,
        boks: { minX: -t.bredde / 2, maksX: t.bredde / 2, minY: -t.hoyde / 2, maksY: t.hoyde / 2 },
        mangler: t.mangler,
      };
    }
  } else if (k.type === 'svg') {
    const ringer = k.stier.flatMap((d) => {
      try {
        return stiTilRinger(d, 0.02);
      } catch {
        return [];
      }
    });
    const alle = regionFraRinger(ringer, k.fyllregel);
    // «fyll»: close the holes in the vector, leaving its silhouette
    const region = k.hull === 'fyll' ? utenHull(alle) : alle;
    g = { region, boks: region.length ? regionBoks(region) : TOM.boks, mangler: [] };
  } else {
    const region = regionFraRinger(formTilRinger(k));
    g = {
      region,
      boks: { minX: -k.bredde / 2, maksX: k.bredde / 2, minY: -k.hoyde / 2, maksY: k.hoyde / 2 },
      mangler: [],
    };
  }
  if (lokalBuffer.size > 400) lokalBuffer.delete(lokalBuffer.keys().next().value!);
  lokalBuffer.set(n, g);
  lokalEtterKilde.set(k, g);
  return g;
}

// ---------- world geometry ----------

export function verdensRegion(o: Objekt): Region | null {
  const g = lokalGeometri(o.kilde);
  if (!g) return null;
  const m = tilMatrise(o.transform);
  return transformerRegion(g.region, (p) => anvend(m, p));
}

/** Corners of the object's box in world space (for handles). */
export function hjorner(o: Objekt): [Vec2, Vec2, Vec2, Vec2] {
  const g = lokalGeometri(o.kilde) ?? TOM;
  const m = tilMatrise(o.transform);
  const b = g.boks;
  return [
    anvend(m, { x: b.minX, y: b.minY }),
    anvend(m, { x: b.maksX, y: b.minY }),
    anvend(m, { x: b.maksX, y: b.maksY }),
    anvend(m, { x: b.minX, y: b.maksY }),
  ];
}

export function verdensBoks(o: Objekt): Boks {
  return hjorner(o).reduce(utvidBoks, tomBoks());
}

const blekkLokal = new WeakMap<object, Boks>();

/**
 * The box round what is actually printed. For a text, `verdensBoks` is the
 * layout box (full advance width, ascender to descender), which is wider than
 * the letters by their side bearings and taller than the line's glyphs. Gaps
 * the eye reads between two texts are measured on this box instead.
 */
export function blekkBoks(o: Objekt): Boks {
  const g = lokalGeometri(o.kilde);
  if (!g || !g.region.length) return verdensBoks(o);
  let lokal = blekkLokal.get(g);
  if (!lokal) {
    lokal = regionBoks(g.region);
    blekkLokal.set(g, lokal);
  }
  const m = tilMatrise(o.transform);
  return [
    { x: lokal.minX, y: lokal.minY },
    { x: lokal.maksX, y: lokal.minY },
    { x: lokal.maksX, y: lokal.maksY },
    { x: lokal.minX, y: lokal.maksY },
  ]
    .map((p) => anvend(m, p))
    .reduce(utvidBoks, tomBoks());
}

export function objektStorrelse(o: Objekt): { bredde: number; hoyde: number } {
  const b = (lokalGeometri(o.kilde) ?? TOM).boks;
  return {
    bredde: (b.maksX - b.minX) * Math.abs(o.transform.skalaX),
    hoyde: (b.maksY - b.minY) * Math.abs(o.transform.skalaY),
  };
}

// ---------- caches ----------

/*
 * Every edit makes a new document, so a cache per document alone redoes
 * every offset on every frame of a drag (Sivert, 2026-10-05: the hole tool
 * and several layers were slow). Each step below is remembered per layer
 * against exactly what it reads: the objects, the outline settings and the
 * regions it starts from. Documents are immutable, so comparing those by
 * reference is enough.
 *
 * A layer's shapes are also worked out where they are relative to its
 * first object, then moved into place. Dragging a layer's only object,
 * or all of them, then moves the finished text and outlines instead of
 * offsetting them again.
 */

function sammeListe(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** One remembered result per slot, reused while its inputs are the same. */
const minne = new Map<string, { inn: unknown[]; verdi: unknown }>();

/** `lag()` returns null while fonts load; that is not remembered. */
function husk<T>(slot: string, inn: unknown[], lag: () => T | null): T | null {
  const b = minne.get(slot);
  if (b && sammeListe(b.inn, inn)) return b.verdi as T;
  const verdi = lag();
  if (verdi !== null) {
    if (minne.size > 2000) minne.clear();
    minne.set(slot, { inn, verdi });
  }
  return verdi;
}

/** A region worked out around the origin, and how far (in Clipper units) it is moved into place. */
interface Plassert {
  lokal: Region;
  dx: number;
  dy: number;
}

/** The region in place; the same object while nothing changes. */
function iVerden(slot: string, p: Plassert): Region {
  return husk(`${slot}@`, [p.lokal, p.dx, p.dy], () => flyttRegion(p.lokal, p.dx, p.dy))!;
}

// ---------- layers ----------

const lagBuffer = new WeakMap<Dokument, Map<string, Region | null>>();

function erGjennomgaende(o: Objekt): boolean {
  return o.kilde.type === 'form' && o.kilde.form === 'hull';
}

/** A layer's objects and Kontur, around its first object. Null while fonts load. */
function egenLokal(dok: Dokument, lag: Lag): Plassert | null {
  const objekter = objekterILag(dok, lag.id).filter((o) => o.synlig && !erGjennomgaende(o));
  const forste = objekter[0]?.transform;
  const dx = forste ? Math.round(forste.x * SKALA) : 0;
  const dy = forste ? Math.round(forste.y * SKALA) : 0;
  // each object relative to the first, on Clipper's grid
  const relativ = objekter.map((o) => ({
    ...o.transform,
    x: (Math.round(o.transform.x * SKALA) - dx) / SKALA,
    y: (Math.round(o.transform.y * SKALA) - dy) / SKALA,
  }));
  const inn: unknown[] = [lag.kontur];
  objekter.forEach((o, i) => inn.push(o.kilde, o.operasjon, JSON.stringify(relativ[i])));
  const lokal = husk(`egen:${lag.id}`, inn, () => {
    const pluss: Region[] = [];
    const minus: Region[] = [];
    for (const [i, o] of objekter.entries()) {
      const r = verdensRegion({ ...o, transform: relativ[i]! });
      if (!r) return null;
      (o.operasjon === 'trekk-fra' ? minus : pluss).push(r);
    }
    let region = unionAlle(pluss);
    if (minus.length) region = differanse(region, unionAlle(minus));
    const k = lag.kontur;
    if (k.avstand !== 0 || k.kunRing) {
      const ytre = k.avstand !== 0 ? forskyv(region, k.avstand, k.hjorne) : region;
      region = k.kunRing
        ? differanse(ytre, forskyv(ytre, -Math.max(MIN_OMRISSBREDDE, k.ringBredde), k.hjorne))
        : ytre;
    }
    return region;
  });
  return lokal && { lokal, dx, dy };
}

/** Outline of a layer before influences (objects + Kontur). Null while fonts load. */
function egenRegion(dok: Dokument, lag: Lag): Region | null {
  const p = egenLokal(dok, lag);
  return p && iVerden(`egen:${lag.id}`, p);
}

/** The layers that influence this one (not itself, not missing ones). */
function pavirkningerAv(dok: Dokument, lag: Lag) {
  return lag.pavirkninger.flatMap((p) => {
    const kilde = finnLag(dok, p.kildeLagId);
    return kilde && kilde.id !== lag.id ? [{ p, kilde }] : [];
  });
}

/** A layer with its influences, before hanging holes. Null while fonts load. */
function lagForHull(dok: Dokument, lag: Lag): Region | null {
  const egen = egenRegion(dok, lag);
  if (!egen) return null;
  const pavirkninger = pavirkningerAv(dok, lag);
  if (!pavirkninger.length) return egen;
  const kilder: Region[] = [];
  for (const [i, { p, kilde }] of pavirkninger.entries()) {
    // a text layer acts with everything it prints: text and outlines
    const r = kilde.tekstlag ? fotavtrykk(dok, kilde) : egenLokal(dok, kilde);
    if (!r) return null;
    const slot = `pavirkning:${lag.id}:${i}`;
    const lokal =
      p.avstand !== 0
        ? husk(slot, [r.lokal, p.avstand], () => forskyv(r.lokal, p.avstand, 'rund'))!
        : r.lokal;
    kilder.push(iVerden(slot, { ...r, lokal }));
  }
  return husk(`pavirket:${lag.id}`, [egen, lag.pavirkninger, ...kilder], () => {
    let region = egen;
    for (const [i, { p }] of pavirkninger.entries()) {
      region = p.handling === 'legg-til' ? union(region, kilder[i]!) : differanse(region, kilder[i]!);
    }
    return region;
  });
}

/** Visible hanging-hole objects. */
function hullObjekter(dok: Dokument): Objekt[] {
  return Object.values(dok.objekter).filter((o) => o.synlig && erGjennomgaende(o));
}

/** Everything the sign prints, before holes and eyes. Null while fonts load. */
function modellFlate(dok: Dokument): Region | null {
  const deler: Region[] = [];
  for (const lag of dok.lag) {
    if (!lag.synlig) continue;
    const r = lagForHull(dok, lag);
    if (!r) return null;
    if (!(lag.tekstlag && lag.tekstvisning === 'kutt')) deler.push(r);
    if (lag.tekstlag) {
      const o = omrissForHull(dok, lag);
      if (!o) return null;
      for (const x of o) deler.push(x.region);
    }
  }
  return husk('modellflate', deler, () => unionAlle(deler));
}

/** Default width of the ring around an eye (mm). */
export const STANDARD_RINGBREDDE = 3;

interface Oye {
  objekt: Objekt;
  /** The hole through the eye. */
  hull: Region;
  /** The eye's outer edge (hole included). */
  ytre: Region;
}

/**
 * Hanging holes (Sivert, 2026-10-05): a hole over the model cuts through
 * it, its size being the inner diameter; dragged off the model it becomes
 * an eye, a ring outside the sign to put a key ring through. Over the
 * model means at least half the hole lies on it.
 */
function hullOgOyne(dok: Dokument): { hull: Region; oyne: Oye[] } {
  const objekter = hullObjekter(dok);
  const tom = { hull: [], oyne: [] };
  if (!objekter.length) return tom;
  const flate = modellFlate(dok) ?? [];
  return (
    husk('hulloyne', [flate, ...objekter], () => {
      const hull: Region[] = [];
      const oyne: Oye[] = [];
      for (const o of objekter) {
        const r = verdensRegion(o);
        if (!r?.length) continue;
        const inne = areal(snitt(r, flate));
        if (inne >= areal(r) / 2) hull.push(r);
        else {
          const bredde = Math.max(
            MIN_OMRISSBREDDE,
            o.kilde.type === 'form' ? (o.kilde.ringBredde ?? STANDARD_RINGBREDDE) : STANDARD_RINGBREDDE,
          );
          oyne.push({ objekt: o, hull: r, ytre: forskyv(r, bredde, 'rund') });
        }
      }
      return { hull: unionAlle(hull), oyne };
    }) ?? tom
  );
}

/** Every hanging hole over the model, as one region. */
function hullGjennom(dok: Dokument): Region {
  return hullOgOyne(dok).hull;
}

/** Whether a hanging hole lies off the model and is printed as an eye. */
export function erOye(dok: Dokument, objektId: string): boolean {
  return hullOgOyne(dok).oyne.some((x) => x.objekt.id === objektId);
}

/**
 * What the eyes join: the lowest visible layer, or its outermost outline
 * when it is a text layer with outlines (the outline is then the base).
 */
function oyeMal(dok: Dokument): { lagId: string; omrissId?: string } | null {
  const lag = dok.lag.find((l) => l.synlig);
  if (!lag) return null;
  const omriss = lag.tekstlag ? (lag.omriss ?? []).filter((o) => o.synlig) : [];
  return omriss.length ? { lagId: lag.id, omrissId: omriss.at(-1)!.id } : { lagId: lag.id };
}

/** A region with the eyes joined on and their holes kept open. */
function medOyne(slot: string, region: Region, oyne: Oye[]): Region {
  if (!oyne.length) return region;
  return husk(`oyne:${slot}`, [region, ...oyne], () =>
    differanse(unionAlle([region, ...oyne.map((x) => x.ytre)]), unionAlle(oyne.map((x) => x.hull))),
  )!;
}

function overlapper(a: Boks, b: Boks): boolean {
  return a.minX <= b.maksX && b.minX <= a.maksX && a.minY <= b.maksY && b.minY <= a.maksY;
}

/**
 * The region with the holes cut out. Only the parts a hole touches go
 * through Clipper; the rest are kept as they are (they stay disjoint).
 */
function utenHullGjennom(region: Region, hull: Region): Region {
  if (!hull.length || !region.length) return region;
  const hb = regionBoks(hull);
  const rorte: Region = [];
  const urort: Region = [];
  for (const f of region) (overlapper(regionBoks([f]), hb) ? rorte : urort).push(f);
  if (!rorte.length) return region;
  return [...urort, ...differanse(rorte, hull)];
}

/** Final outline of a layer (mm, Y up). Null while fonts load. */
export function lagRegion(dok: Dokument, lagId: string): Region | null {
  let buffer = lagBuffer.get(dok);
  if (!buffer) {
    buffer = new Map();
    lagBuffer.set(dok, buffer);
  }
  if (buffer.has(lagId)) return buffer.get(lagId)!;
  const lag = finnLag(dok, lagId);
  if (!lag) return [];
  const for_ = lagForHull(dok, lag);
  const hull = hullGjennom(dok);
  let region = for_ && husk(`kuttet:${lagId}`, [for_, hull], () => utenHullGjennom(for_, hull));
  const mal = oyeMal(dok);
  if (region && mal?.lagId === lagId && !mal.omrissId) region = medOyne(lagId, region, hullOgOyne(dok).oyne);
  // null means «fonts still loading»: do not cache it
  if (region) buffer.set(lagId, region);
  return region;
}

// ---------- outlines ----------

/** Narrowest outline that prints reliably (Sivert, 2026-10-05). */
export const MIN_OMRISSBREDDE = 0.6;

/**
 * An outline that touches the text exactly shares its edges point for
 * point, and the shared, collinear glyph points make the outline's faces
 * fail to close. A hidden 0.01 mm gap keeps every part a closed solid;
 * slicers close gaps this small.
 */
const SKJULT_GLIPE = 0.01;

/** The region with every hole filled (its outer rings only). */
function utenHull(region: Region): Region {
  return unionAlle(region.map((f) => [{ ytre: f.ytre, hull: [] }]));
}

/** What an outline's shape depends on (not its height, colour or name). */
function omrissNokkel(lag: Lag): string {
  return (lag.omriss ?? [])
    .filter((o) => o.synlig)
    .map((o) => `${o.id}|${o.type}|${o.avstand}|${o.bredde}|${o.hjorne}`)
    .join(';');
}

type Omrissliste = { id: string; region: Region }[];

/**
 * Outlines of a text layer, from a base outline (the text). Each outline
 * starts a gap away from what is inside it and never covers it: «omriss»
 * is a ring of its width; «fyll» fills out to its width and closes holes
 * such as the inside of «o» and the space between letters.
 */
function omrissFra(lag: Lag, tekst: Region, slot: string): Omrissliste {
  return husk(`omriss-${slot}:${lag.id}`, [tekst, omrissNokkel(lag)], () => {
    const ut: Omrissliste = [];
    let inne = tekst;
    for (const o of lag.omriss ?? []) {
      if (!o.synlig) continue;
      const avstand = Math.max(SKJULT_GLIPE, o.avstand);
      const start = forskyv(inne, avstand, o.hjorne);
      const ytre = forskyv(inne, avstand + Math.max(MIN_OMRISSBREDDE, o.bredde), o.hjorne);
      const kant = o.type === 'fyll' ? utenHull(ytre) : ytre;
      ut.push({ id: o.id, region: differanse(kant, start) });
      inne = union(inne, kant);
    }
    return ut;
  })!;
}

/** Everything a text layer prints (text and outlines), before influences. Null while fonts load. */
function fotavtrykk(dok: Dokument, lag: Lag): Plassert | null {
  const tekst = egenLokal(dok, lag);
  if (!tekst) return null;
  const omriss = omrissFra(lag, tekst.lokal, 'egen');
  if (!omriss.length) return tekst;
  const lokal = husk(`fotavtrykk:${lag.id}`, [tekst.lokal, omriss], () =>
    unionAlle([tekst.lokal, ...omriss.map((o) => o.region)]),
  )!;
  return { ...tekst, lokal };
}

/** A text layer's outlines in place, before holes. Null while fonts load. */
function omrissForHull(dok: Dokument, lag: Lag): Omrissliste | null {
  if (pavirkningerAv(dok, lag).length) {
    // around the text with its influences
    const tekst = lagForHull(dok, lag);
    return tekst && omrissFra(lag, tekst, 'pavirket');
  }
  // the footprint's outlines, moved into place
  const tekst = egenLokal(dok, lag);
  if (!tekst) return null;
  const lokal = omrissFra(lag, tekst.lokal, 'egen');
  return husk(`omriss-egen:${lag.id}@`, [lokal, tekst.dx, tekst.dy], () =>
    lokal.map((o) => ({ id: o.id, region: flyttRegion(o.region, tekst.dx, tekst.dy) })),
  );
}

/** Outline regions of a text layer by outline id, holes cut and eyes joined. Null while fonts load. */
export function omrissRegioner(dok: Dokument, lagId: string): Map<string, Region> | null {
  const lag = finnLag(dok, lagId);
  if (!lag) return null;
  const omriss = omrissForHull(dok, lag);
  if (!omriss) return null;
  // the holes are cut from text and outlines alike
  const hull = hullGjennom(dok);
  const mal = oyeMal(dok);
  const oyne = mal?.lagId === lagId && mal.omrissId ? hullOgOyne(dok).oyne : [];
  return husk(
    `omrisskuttet:${lagId}`,
    [omriss, hull, mal?.omrissId, ...oyne],
    () =>
      new Map(
        omriss.map((o) => {
          const r = utenHullGjennom(o.region, hull);
          return [o.id, o.id === mal?.omrissId ? medOyne(o.id, r, oyne) : r];
        }),
      ),
  );
}

/** Eyes that do not touch what they are joined to (by object). */
function losOyne(dok: Dokument): Objekt[] {
  const mal = oyeMal(dok);
  const { oyne } = hullOgOyne(dok);
  if (!mal || !oyne.length) return [];
  const lag = finnLag(dok, mal.lagId)!;
  const under = mal.omrissId
    ? omrissForHull(dok, lag)?.find((o) => o.id === mal.omrissId)?.region
    : lagForHull(dok, lag);
  if (!under) return [];
  return oyne.filter((x) => areal(snitt(forskyv(x.ytre, 0.05, 'rund'), under)) < 0.5).map((x) => x.objekt);
}

// ---------- model ----------

const tynneBuffer = new WeakMap<Region, Map<number, number>>();

function tynneDetaljer(region: Region, minVegg: number): number {
  let b = tynneBuffer.get(region);
  if (!b) tynneBuffer.set(region, (b = new Map()));
  let a = b.get(minVegg);
  if (a === undefined) b.set(minVegg, (a = tynneAreal(region, minVegg)));
  return a;
}

function tynneAreal(region: Region, minVegg: number): number {
  return areal(tynneDeler(region, minVegg));
}

function tynneDeler(region: Region, minVegg: number): Region {
  // Morphological opening removes features thinner than minVegg. It also
  // shaves sharp corners; those slivers are at most ~0.17 mm thick, so a
  // 0.1 mm erosion of the removed part leaves only genuinely thin features.
  const apnet = forskyv(forskyv(region, -minVegg / 2, 'rund'), minVegg / 2, 'rund');
  return forskyv(differanse(region, apnet), -0.1, 'rund');
}

/**
 * Thin parts of an outline, judged together with what it lies against
 * (the text and the outlines inside it): a filled outline between two
 * letters is narrow, but it prints as one with the letters beside it.
 */
function tynneOmriss(id: string, region: Region, inntil: Region[], minVegg: number): number {
  if (!inntil.some((r) => r.length)) return tynneDetaljer(region, minVegg);
  return husk(`tynn:${id}`, [region, minVegg, ...inntil], () => {
    // close the hidden gap so the slicer's view (one solid) is what is judged
    const samlet = union(region, forskyv(unionAlle(inntil), 2 * SKJULT_GLIPE, 'rund'));
    return areal(snitt(tynneDeler(samlet, minVegg), region));
  })!;
}

/** Extruded slabs by region: an unchanged layer keeps its mesh between builds. */
const ekstruderBuffer = new WeakMap<Region, Map<string, ReturnType<typeof ekstruder>>>();

function ekstruderHusket(
  region: Region,
  zBunn: number,
  hoyde: number,
  profil: Lag['profil'],
  lagHoyde: number,
  hjorne: Lag['kontur']['hjorne'],
): ReturnType<typeof ekstruder> {
  let b = ekstruderBuffer.get(region);
  if (!b) ekstruderBuffer.set(region, (b = new Map()));
  const n = JSON.stringify([zBunn, hoyde, profil, lagHoyde, hjorne]);
  let e = b.get(n);
  if (!e) b.set(n, (e = ekstruder(region, zBunn, hoyde, profil, lagHoyde, hjorne)));
  return e;
}

/** Area of a slab with nothing under it, by slab region and the regions under it. */
const flyterBuffer = new WeakMap<Region, { under: Region[]; areal: number }>();

function flytendeAreal(region: Region, under: Region[]): number {
  const b = flyterBuffer.get(region);
  if (b && sammeListe(b.under, under)) return b.areal;
  const a = areal(differanse(region, unionAlle(under)));
  flyterBuffer.set(region, { under, areal: a });
  return a;
}

export async function byggSigngen(dok: Dokument): Promise<Modellresultat> {
  const advarsler: Advarsel[] = [];
  const fontFeil = await lastFonter(dok);
  if (fontFeil.length)
    advarsler.push({
      niva: 'feil',
      tekst: 'En eller flere fonter kunne ikke lastes. Sjekk nettforbindelsen.',
    });

  const { lagHoyde } = parametre(dok);
  const deler: ModellDel[] = [];
  const plate = dok.plate;

  for (const o of Object.values(dok.objekter)) {
    if (o.kilde.type !== 'tekst') continue;
    const g = lokalGeometri(o.kilde);
    if (g?.mangler.length) {
      advarsler.push({
        niva: 'advarsel',
        tekst: `Fonten mangler tegnene ${g.mangler.map((c) => `«${c}»`).join(', ')} i «${o.navn}». De blir ikke med.`,
        objektId: o.id,
      });
    }
  }

  /** Every printed slab: a layer, a text layer's text, or one of its outlines. */
  interface Skive {
    navn: string;
    lagId: string;
    region: Region;
    zBunn: number;
    hoyde: number;
    materialId: string;
  }
  const skiver: Skive[] = [];
  const sjekk = (
    navn: string,
    lagId: string,
    region: Region,
    materialId: string,
    inntil?: { id: string; regioner: Region[] },
  ) => {
    const b = regionBoks(region);
    if (
      b.minX < -plate.bredde / 2 ||
      b.maksX > plate.bredde / 2 ||
      b.minY < -plate.dybde / 2 ||
      b.maksY > plate.dybde / 2
    ) {
      advarsler.push({ niva: 'advarsel', tekst: `«${navn}» går utenfor byggeplaten.`, lagId });
    }
    const minVegg = materialtyper[finnMateriale(materialId).type].minVegg;
    const tynt = inntil
      ? tynneOmriss(inntil.id, region, inntil.regioner, minVegg)
      : tynneDetaljer(region, minVegg);
    if (tynt > 0.05) {
      advarsler.push({
        niva: 'advarsel',
        tekst: `Noen detaljer i «${navn}» er tynnere enn ${mm(minVegg)} og kan bli borte eller brekke i printen.`,
        lagId,
      });
    }
  };

  for (const lag of dok.lag) {
    if (!lag.synlig) continue;
    const region = lagRegion(dok, lag.id) ?? [];
    const omriss = lag.tekstlag ? (omrissRegioner(dok, lag.id) ?? new Map<string, Region>()) : new Map();
    const tekstSkjult = lag.tekstvisning === 'kutt';
    if (!region.length && ![...omriss.values()].some((r) => r.length)) {
      if ((objekterILag(dok, lag.id).length && !bareHull(dok, lag.id)) || lag.pavirkninger.length) {
        advarsler.push({
          niva: 'info',
          tekst: `Laget «${lag.navn}» har ingen form og blir ikke printet.`,
          lagId: lag.id,
        });
      }
      continue;
    }

    if (region.length && !tekstSkjult) {
      const e = ekstruderHusket(region, lag.zBunn, lag.hoyde, lag.profil, lagHoyde, lag.kontur.hjorne);
      if (e.forbrukt) {
        advarsler.push({
          niva: 'advarsel',
          tekst: `Profilen på «${lag.navn}» er bredere enn formen tåler, så laget slutter ved ${mm(e.toppZ)} i stedet for ${mm(lag.zBunn + lag.hoyde)}.`,
          lagId: lag.id,
        });
      }
      deler.push({ id: lag.id, navn: lag.navn, materialId: lag.materialId, mesh: e.mesh });
      skiver.push({
        navn: lag.navn,
        lagId: lag.id,
        region,
        zBunn: lag.zBunn,
        hoyde: lag.hoyde,
        materialId: lag.materialId,
      });

      const maksOverheng = materialtyper[finnMateriale(lag.materialId).type].maksOverheng;
      const overheng = profilOverheng(lag.profil, lag.hoyde);
      if (overheng > maksOverheng + 0.5) {
        advarsler.push({
          niva: 'advarsel',
          tekst: `Profilen på «${lag.navn}» heller utover med ${Math.round(overheng)}°. Over ${maksOverheng}° kan veggen henge ned uten støttemateriale.`,
          lagId: lag.id,
        });
      }
      sjekk(lag.navn, lag.id, region, lag.materialId);
    }

    // what each outline lies against: the text (unless cut out) and the outlines inside it
    const inne: Region[] = region.length && !tekstSkjult ? [region] : [];
    for (const o of lag.omriss ?? []) {
      const r = omriss.get(o.id);
      if (!o.synlig || !r?.length) continue;
      const navn = `${lag.navn}: ${o.navn}`;
      const e = ekstruderHusket(r, lag.zBunn, o.hoyde, rettProfil(), lagHoyde, o.hjorne);
      deler.push({ id: o.id, lagId: lag.id, navn, materialId: o.materialId, mesh: e.mesh });
      skiver.push({
        navn,
        lagId: lag.id,
        region: r,
        zBunn: lag.zBunn,
        hoyde: o.hoyde,
        materialId: o.materialId,
      });
      sjekk(navn, lag.id, r, o.materialId, { id: o.id, regioner: [...inne] });
      inne.push(r);
    }
  }

  for (const o of losOyne(dok)) {
    advarsler.push({
      niva: 'advarsel',
      tekst: `Øyet «${o.navn}» henger ikke fast i skiltet. Dra det inntil kanten.`,
      objektId: o.id,
    });
  }

  for (const o of tekstUtenforTekstlag(dok)) {
    advarsler.push({
      niva: 'info',
      tekst: `«${o.navn}» ligger i et lag med andre former (fra før tekstlagene). Flytt den til et tekstlag for å gi den omriss.`,
      objektId: o.id,
      lagId: o.lagId,
    });
  }

  // unsupported material: parts that start above the plate with nothing under them
  for (const s of skiver) {
    if (s.zBunn < 0.01) continue;
    const under = skiver.filter(
      (u) => u !== s && u.zBunn < s.zBunn - 1e-6 && u.zBunn + u.hoyde >= s.zBunn - 0.01,
    );
    const flyter = flytendeAreal(
      s.region,
      under.map((u) => u.region),
    );
    if (flyter > 1) {
      advarsler.push({
        niva: 'advarsel',
        tekst: `Deler av «${s.navn}» henger i lufta (${Math.round(flyter)} mm² uten noe under). Det trenger støttemateriale eller et lag under.`,
        lagId: s.lagId,
      });
    }
  }
  if (skiver.reduce((h, s) => Math.max(h, s.zBunn + s.hoyde), 0) > plate.hoyde) {
    advarsler.push({
      niva: 'advarsel',
      tekst: `Modellen er høyere enn skriveren kan bygge (${mm(plate.hoyde)}).`,
    });
  }
  return { deler, advarsler };
}

/** Bounds of everything visible (for «tilpass»). */
export function innholdsboks(dok: Dokument): Boks | null {
  let b = tomBoks();
  for (const o of Object.values(dok.objekter)) if (o.synlig) b = slaSammen(b, verdensBoks(o));
  const m = modellBoks(dok);
  if (m) b = slaSammen(b, m);
  return erTom(b) ? null : b;
}

/** Bounds of what the sign prints, outlines included (before holes and eyes). */
export function modellBoks(dok: Dokument): Boks | null {
  const f = modellFlate(dok);
  return f?.length ? regionBoks(f) : null;
}

/**
 * The area the finished sign takes on the plate: what it prints, outlines
 * and eyes included. Used to lay signs out side by side. Null while fonts load.
 */
export function fotavtrykkBoks(dok: Dokument): Boks | null {
  const flate = modellFlate(dok);
  if (!flate) return null;
  let b = flate.length ? regionBoks(flate) : tomBoks();
  for (const o of hullOgOyne(dok).oyne) {
    const e = regionBoks(o.ytre);
    b = slaSammen(b, { minX: e.minX, minY: e.minY, maksX: e.maksX, maksY: e.maksY });
  }
  return erTom(b) ? null : b;
}
