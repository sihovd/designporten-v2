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
  forskyv,
  regionBoks,
  regionFraRinger,
  transformerRegion,
  unionAlle,
  union,
  type Region,
} from '../../geometri/polygon';
import { stiTilRinger } from '../../geometri/stidata';
import { formTilRinger } from '../../geometri/former';
import { lastFont, tekstTilRinger } from '../../geometri/tekst';
import { ekstruder } from '../../geometri/ekstruder';
import type { ModellDel } from '../../geometri/mesh';
import { parametre, tekstUtenforTekstlag } from './dokument';
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

function nokkel(k: ObjektKilde): string {
  return JSON.stringify(k.type === 'tekst' ? { ...k, felt: undefined } : k);
}

/** Local outline of a source, or null while its font is loading. */
export function lokalGeometri(k: ObjektKilde): LokalGeometri | null {
  const n = nokkel(k);
  const b = lokalBuffer.get(n);
  if (b) return b;
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
    const region = regionFraRinger(ringer, k.fyllregel);
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

export function objektStorrelse(o: Objekt): { bredde: number; hoyde: number } {
  const b = (lokalGeometri(o.kilde) ?? TOM).boks;
  return {
    bredde: (b.maksX - b.minX) * Math.abs(o.transform.skalaX),
    hoyde: (b.maksY - b.minY) * Math.abs(o.transform.skalaY),
  };
}

// ---------- layers ----------

const lagBuffer = new WeakMap<Dokument, Map<string, Region | null>>();

function erGjennomgaende(o: Objekt): boolean {
  return o.kilde.type === 'form' && o.kilde.form === 'hull';
}

/** Outline of a layer before influences (objects + Kontur). Null while fonts load. */
function egenRegion(dok: Dokument, lag: Lag): Region | null {
  const pluss: Region[] = [];
  const minus: Region[] = [];
  for (const o of objekterILag(dok, lag.id)) {
    if (!o.synlig || erGjennomgaende(o)) continue;
    const r = verdensRegion(o);
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
  let region = egenRegion(dok, lag);
  if (region) {
    for (const p of lag.pavirkninger) {
      const kilde = finnLag(dok, p.kildeLagId);
      if (!kilde || kilde.id === lag.id) continue;
      // a text layer acts with everything it prints: text and outlines
      const r = kilde.tekstlag ? fotavtrykk(dok, kilde) : egenRegion(dok, kilde);
      if (!r) {
        region = null;
        break;
      }
      const f = p.avstand !== 0 ? forskyv(r, p.avstand, 'rund') : r;
      region = p.handling === 'legg-til' ? union(region, f) : differanse(region, f);
    }
  }
  if (region) {
    const hull: Region[] = [];
    for (const o of Object.values(dok.objekter)) {
      if (!o.synlig || !erGjennomgaende(o)) continue;
      const r = verdensRegion(o);
      if (r) hull.push(r);
    }
    if (hull.length) region = differanse(region, unionAlle(hull));
  }
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

function hullGjennom(dok: Dokument): Region {
  const hull: Region[] = [];
  for (const o of Object.values(dok.objekter)) {
    if (!o.synlig || !erGjennomgaende(o)) continue;
    const r = verdensRegion(o);
    if (r) hull.push(r);
  }
  return unionAlle(hull);
}

/**
 * Outlines of a text layer, from a base outline (the text). Each outline
 * starts a gap away from what is inside it and never covers it: «omriss»
 * is a ring of its width; «fyll» fills out to its width and closes holes
 * such as the inside of «o» and the space between letters.
 */
function omrissFra(lag: Lag, tekst: Region): { id: string; region: Region }[] {
  const ut: { id: string; region: Region }[] = [];
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
}

/** Everything a text layer prints (text and outlines), before influences. Null while fonts load. */
function fotavtrykk(dok: Dokument, lag: Lag): Region | null {
  const tekst = egenRegion(dok, lag);
  if (!tekst) return null;
  return unionAlle([tekst, ...omrissFra(lag, tekst).map((o) => o.region)]);
}

/** Outline regions of a text layer by outline id, holes cut. Null while fonts load. */
export function omrissRegioner(dok: Dokument, lagId: string): Map<string, Region> | null {
  const lag = finnLag(dok, lagId);
  const tekst = lagRegion(dok, lagId);
  if (!lag || !tekst) return null;
  const hull = hullGjennom(dok);
  return new Map(
    omrissFra(lag, tekst).map((o) => [o.id, hull.length ? differanse(o.region, hull) : o.region]),
  );
}

// ---------- model ----------

function tynneDetaljer(region: Region, minVegg: number): number {
  // Morphological opening removes features thinner than minVegg. It also
  // shaves sharp corners; those slivers are at most ~0.17 mm thick, so a
  // 0.1 mm erosion of the removed part leaves only genuinely thin features.
  const apnet = forskyv(forskyv(region, -minVegg / 2, 'rund'), minVegg / 2, 'rund');
  return areal(forskyv(differanse(region, apnet), -0.1, 'rund'));
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
  const sjekk = (navn: string, lagId: string, region: Region, materialId: string) => {
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
    if (tynneDetaljer(region, minVegg) > 0.05) {
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
      if (objekterILag(dok, lag.id).length || lag.pavirkninger.length) {
        advarsler.push({
          niva: 'info',
          tekst: `Laget «${lag.navn}» har ingen form og blir ikke printet.`,
          lagId: lag.id,
        });
      }
      continue;
    }

    if (region.length && !tekstSkjult) {
      const e = ekstruder(region, lag.zBunn, lag.hoyde, lag.profil, lagHoyde, lag.kontur.hjorne);
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

    for (const o of lag.omriss ?? []) {
      const r = omriss.get(o.id);
      if (!o.synlig || !r?.length) continue;
      const navn = `${lag.navn}: ${o.navn}`;
      const e = ekstruder(r, lag.zBunn, o.hoyde, rettProfil(), lagHoyde, o.hjorne);
      deler.push({ id: o.id, lagId: lag.id, navn, materialId: o.materialId, mesh: e.mesh });
      skiver.push({
        navn,
        lagId: lag.id,
        region: r,
        zBunn: lag.zBunn,
        hoyde: o.hoyde,
        materialId: o.materialId,
      });
      sjekk(navn, lag.id, r, o.materialId);
    }
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
    const stotte = unionAlle(under.map((u) => u.region));
    const flyter = areal(differanse(s.region, stotte));
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
  return erTom(b) ? null : b;
}
