/**
 * The brick builder's project model (Dragon Forge brick mode, phase 1 of
 * docs/design/dragon-forge.md). Plain JSON in `Dokument.parametre.brikker`,
 * independent of three.js:
 *
 *   - a brick DEFINITION is a versioned library entry (identity, category,
 *     size, connection points, geometry recipe);
 *   - a brick INSTANCE is one placed occurrence with its own local values;
 *   - a CONNECTION joins one point on each of two instances through a joint
 *     profile;
 *   - a GROUP is one connected set of instances: its root instance carries
 *     the placement on the plate, every other instance is placed from its
 *     parent through the connection (`graf.ts`).
 *
 * The project's truth is this graph. Groups and the tree are derived from it
 * and `lesBrikkeprosjekt` re-derives them, so a hand-edited or old file can
 * never hold two roots for one group or a connection the editor would refuse.
 */
import { leddMal, sokkelRadius, type LeddMal } from '../ledd';
import {
  katalog,
  type Halevariant,
  type Hodevariant,
  type Hornvariant,
  type Oyevariant,
  type Piggvariant,
} from '../parametre';
import {
  armEnde,
  delmaal,
  halerekkevidde,
  hodeformer,
  N,
  N_HODE,
  type Del,
  type Mal,
  type Rolle,
} from '../skjelett';

export const BRIKKESKJEMA = 1;

/* ------------------------------------------------------------------ */
/* Joint profile                                                       */
/* ------------------------------------------------------------------ */

export interface Koblingsprofil {
  id: string;
  versjon: number;
  navn: string;
  /** Mechanism family. Only the print-in-place hinge exists in phase 1. */
  familie: 'hengsel-print-i-ett';
  /** Digital trial profile until a test print is documented; never «testet» without one. */
  fysiskStatus: 'proveprofil';
  mal: LeddMal;
  beskrivelse: string;
}

/**
 * The existing Dragon Forge joint (ledd.ts) at the size of a 160 mm dragon,
 * the reference size. The numbers come from `leddMal(160)`; they are the
 * generator's own trial values, not a tested production fit.
 */
export const HENGSEL_M: Koblingsprofil = {
  id: 'hengsel-m',
  versjon: 1,
  navn: 'Hengsel M',
  familie: 'hengsel-print-i-ett',
  fysiskStatus: 'proveprofil',
  mal: leddMal(160),
  beskrivelse:
    'Vertikalt hengsel som printes ferdig montert: sokkel bak på fremre brikke, tapp og arm foran på bakre brikke.',
};

export const profiler: Koblingsprofil[] = [HENGSEL_M];

export function finnProfil(id: string, versjon: number): Koblingsprofil | undefined {
  return profiler.find((p) => p.id === id && p.versjon === versjon);
}

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

export type Kategori = 'hode' | 'kropp' | 'hale';

/** A point's role in the mechanism: the socket half or the pin half of a hinge. */
export type Punktrolle = 'sokkel' | 'tapp';

export interface Punktdefinisjon {
  /** Stable id: a swap keeps connections whose point id still exists with the same role and profile. */
  id: 'foran' | 'bak';
  navn: string;
  rolle: Punktrolle;
  profil: { id: string; versjon: number };
}

export interface Brikkedefinisjon {
  id: string;
  versjon: number;
  navn: string;
  kategori: Kategori;
  beskrivelse: string;
  /** Length, width, height in the skeleton's relative units (×SKALA_M gives mm before joint minimums). */
  mal: Mal;
  /** Head variant for the snout and eye recipe. */
  hode?: Hodevariant;
  /** Tail tip on the last piece of a tail. */
  hale?: Halevariant;
  punkter: Punktdefinisjon[];
  /** Procedural development geometry until Designporten's modelled parts exist. */
  utviklingsgeometri: true;
}

/** Relative units → mm at the reference size (a 160 mm «Lubben» dragon, see skjelett.ts). */
export const SKALA_M = 0.774;

const SOKKEL: Punktdefinisjon = {
  id: 'bak',
  navn: 'Sokkel bak',
  rolle: 'sokkel',
  profil: { id: HENGSEL_M.id, versjon: HENGSEL_M.versjon },
};
const TAPP: Punktdefinisjon = {
  id: 'foran',
  navn: 'Tapp foran',
  rolle: 'tapp',
  profil: { id: HENGSEL_M.id, versjon: HENGSEL_M.versjon },
};

function hodeMal(v: Hodevariant): Mal {
  const [lx, bx, hx] = hodeformer[v];
  return [34 * lx, 30 * bx, 22 * hx];
}

export const definisjoner: Brikkedefinisjon[] = [
  {
    id: 'hode-rundt',
    versjon: 1,
    navn: 'Rundt hode',
    kategori: 'hode',
    beskrivelse: 'Rundt hode med kort snute. Sokkel bak.',
    mal: hodeMal('rund'),
    hode: 'rund',
    punkter: [SOKKEL],
    utviklingsgeometri: true,
  },
  {
    id: 'hode-langt',
    versjon: 1,
    navn: 'Langt hode',
    kategori: 'hode',
    beskrivelse: 'Lang snute, mer klassisk drage. Sokkel bak.',
    mal: hodeMal('lang'),
    hode: 'lang',
    punkter: [SOKKEL],
    utviklingsgeometri: true,
  },
  {
    id: 'hode-bredt',
    versjon: 1,
    navn: 'Bredt hode',
    kategori: 'hode',
    beskrivelse: 'Bredt og flatt hode. Sokkel bak.',
    mal: hodeMal('bred'),
    hode: 'bred',
    punkter: [SOKKEL],
    utviklingsgeometri: true,
  },
  {
    id: 'kropp-avrundet',
    versjon: 1,
    navn: 'Kroppsledd, avrundet',
    kategori: 'kropp',
    beskrivelse: 'Bredt, avrundet kroppsledd. Tapp foran og sokkel bak.',
    mal: [18, 28, 17],
    punkter: [TAPP, SOKKEL],
    utviklingsgeometri: true,
  },
  {
    id: 'kropp-smal',
    versjon: 1,
    navn: 'Kroppsledd, smalt',
    kategori: 'kropp',
    beskrivelse: 'Kortere og smalere kroppsledd. Tapp foran og sokkel bak.',
    mal: [16, 22, 15],
    punkter: [TAPP, SOKKEL],
    utviklingsgeometri: true,
  },
  {
    id: 'haleledd',
    versjon: 1,
    navn: 'Haleledd',
    kategori: 'hale',
    beskrivelse: 'Smalt ledd mellom kropp og haletupp. Tapp foran og sokkel bak.',
    mal: [13, 17, 11],
    punkter: [TAPP, SOKKEL],
    utviklingsgeometri: true,
  },
  {
    id: 'hale-spade',
    versjon: 1,
    navn: 'Hale med spade',
    kategori: 'hale',
    beskrivelse: 'Siste haleledd med flat pilspiss. Tapp foran.',
    mal: [11, 12, 9],
    hale: 'spade',
    punkter: [TAPP],
    utviklingsgeometri: true,
  },
  {
    id: 'hale-spiss',
    versjon: 1,
    navn: 'Spiss hale',
    kategori: 'hale',
    beskrivelse: 'Siste haleledd som smalner av til en spiss. Tapp foran.',
    mal: [11, 12, 9],
    hale: 'spiss',
    punkter: [TAPP],
    utviklingsgeometri: true,
  },
  {
    id: 'hale-kolle',
    versjon: 1,
    navn: 'Hale med kølle',
    kategori: 'hale',
    beskrivelse: 'Siste haleledd med rund kølle og pigger. Tapp foran.',
    mal: [11, 12, 9],
    hale: 'kolle',
    punkter: [TAPP],
    utviklingsgeometri: true,
  },
];

export const kategorier: { id: Kategori; navn: string }[] = [
  { id: 'hode', navn: 'Hoder' },
  { id: 'kropp', navn: 'Kropp' },
  { id: 'hale', navn: 'Hale' },
];

export function finnDefinisjon(id: string, versjon?: number): Brikkedefinisjon | undefined {
  return definisjoner.find((d) => d.id === id && (versjon === undefined || d.versjon === versjon));
}

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

/** Local values on one instance. Only what changes the look; the mechanics stay locked. */
export interface Lokaleverdier {
  /** Width of the body × the definition's width (1 = as defined). The joint is not scaled. */
  bredde?: number;
  pigger?: Piggvariant;
  horn?: Hornvariant;
  oyne?: Oyevariant;
}

export const BREDDE_MIN = 0.8;
export const BREDDE_MAKS = 1.4;

export interface Brikkeinstans {
  id: string;
  definisjon: { id: string; versjon: number };
  /** User's own name; the editor numbers unnamed instances. */
  navn?: string;
  verdier: Lokaleverdier;
}

export interface Ende {
  instans: string;
  punkt: string;
}

export interface Forbindelse {
  id: string;
  a: Ende;
  b: Ende;
  profil: { id: string; versjon: number };
  /** Joint angle in the edit pose, degrees. Phase 1 keeps the print pose (0). */
  vinkel: number;
  produksjon: 'print-i-ett';
}

/** A placement on the plate: mm and degrees about Z. */
export interface Plassering {
  x: number;
  y: number;
  vinkel: number;
}

export interface Gruppe {
  id: string;
  /** The instance whose placement the group carries. */
  rot: string;
  plassering: Plassering;
}

export interface Brikkeprosjekt {
  skjema: number;
  instanser: Brikkeinstans[];
  forbindelser: Forbindelse[];
  grupper: Gruppe[];
}

export const tomtBrikkeprosjekt = (): Brikkeprosjekt => ({
  skjema: BRIKKESKJEMA,
  instanser: [],
  forbindelser: [],
  grupper: [],
});

/* ------------------------------------------------------------------ */
/* Layout of one brick (local frame)                                   */
/* ------------------------------------------------------------------ */

/** A connection point in the brick's own frame: position and the outward direction (degrees). */
export interface Punktramme {
  def: Punktdefinisjon;
  x: number;
  y: number;
  ut: number;
}

export interface Brikkeoppsett {
  def: Brikkedefinisjon;
  /** The body as a skeleton part, centred on the origin, nose towards +X. */
  del: Del;
  mal: LeddMal;
  /** Snout reach in front of the outline (heads) and tail tip reach behind it (tail ends). */
  neseX: number;
  haleX: number;
  /** The pin and its arm (bricks with a front pin). */
  tapp?: { jx: number; tilX: number };
  punkter: Punktramme[];
}

const oppsettHurtig = new Map<string, Brikkeoppsett>();

function rolleFor(k: Kategori): Rolle {
  return k;
}

export function begrensBredde(b: unknown): number {
  return typeof b === 'number' && Number.isFinite(b) ? Math.min(BREDDE_MAKS, Math.max(BREDDE_MIN, b)) : 1;
}

/**
 * The brick's layout from its definition and local values. Joint positions
 * follow the joint standard exactly as the classic skeleton does: the socket
 * centre sits one socket radius inside the rear of the body, and a front pin
 * sits `mellomrom` + one socket radius in front of the body, so two bricks
 * joined at those points have the same gap and clearance as the classic
 * dragon's neighbouring parts.
 */
export function oppsettFor(def: Brikkedefinisjon, verdier: Lokaleverdier): Brikkeoppsett {
  const bredde = begrensBredde(verdier.bredde);
  const nokkel = `${def.id}@${def.versjon}|${bredde}`;
  const ferdig = oppsettHurtig.get(nokkel);
  if (ferdig) return ferdig;

  const profil = HENGSEL_M;
  const mal = profil.mal;
  const harSokkel = def.punkter.some((p) => p.rolle === 'sokkel');
  const harTapp = def.punkter.some((p) => p.rolle === 'tapp');
  const veggHoyde = mal.hulromHoyde + mal.tak;
  const n = def.kategori === 'hode' ? N_HODE : N;
  const relativ: Mal = [def.mal[0], def.mal[1] * bredde, def.mal[2]];
  const m = delmaal(relativ, SKALA_M, mal, harSokkel, veggHoyde, n);

  const del: Del = {
    indeks: 0,
    rolle: rolleFor(def.kategori),
    navn: def.navn,
    omriss: { cx: 0, cy: 0, af: m.af, ab: m.ab, b: m.b, n },
    profil: { vegg: veggHoyde, hoyde: m.h, ringer: 9 },
  };
  const punkter: Punktramme[] = [];
  if (harSokkel) {
    del.sokkel = { jx: m.j, mal };
    punkter.push({ def: def.punkter.find((p) => p.rolle === 'sokkel')!, x: m.j, y: 0, ut: 180 });
  }
  let tapp: Brikkeoppsett['tapp'];
  if (harTapp) {
    const jx = m.af + mal.mellomrom + sokkelRadius(mal);
    const tilX = del.sokkel ? Math.max(0, del.sokkel.jx + armEnde(mal)) : 0;
    tapp = { jx, tilX };
    del.tapp = tapp;
    punkter.push({ def: def.punkter.find((p) => p.rolle === 'tapp')!, x: jx, y: 0, ut: 0 });
  }
  const snute = def.hode ? relativ[0] * SKALA_M * hodeformer[def.hode][3] : 0;
  const haletupp = def.hale ? (m.af + m.ab) * halerekkevidde[def.hale] : 0;
  const oppsett: Brikkeoppsett = {
    def,
    del,
    mal,
    neseX: m.af + snute,
    haleX: -m.ab - haletupp,
    tapp,
    punkter,
  };
  oppsettHurtig.set(nokkel, oppsett);
  return oppsett;
}

/* ------------------------------------------------------------------ */
/* Reading and validating                                              */
/* ------------------------------------------------------------------ */

const tekst = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length < 200;
const tall = (x: unknown, std: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : std);

function velg<T extends string>(liste: readonly { id: T }[], x: unknown): T | undefined {
  return liste.some((v) => v.id === x) ? (x as T) : undefined;
}

function lesVerdier(raa: unknown): Lokaleverdier {
  const r = (raa && typeof raa === 'object' ? raa : {}) as Record<string, unknown>;
  const ut: Lokaleverdier = {};
  if (typeof r.bredde === 'number') ut.bredde = begrensBredde(r.bredde);
  const pigger = velg(katalog.pigger, r.pigger);
  if (pigger) ut.pigger = pigger;
  const horn = velg(katalog.horn, r.horn);
  if (horn) ut.horn = horn;
  const oyne = velg(katalog.oyne, r.oyne);
  if (oyne) ut.oyne = oyne;
  return ut;
}

export interface Innlesing {
  prosjekt: Brikkeprosjekt;
  /** What had to be dropped or repaired, in words for the user. */
  problemer: string[];
}

/**
 * Read a brick project from stored JSON. Never throws. Numbers, references,
 * ids, capacity, compatibility and the graph (no closed loops) are checked;
 * an instance of an unknown definition version is kept as it is and reported
 * (it is never swapped for today's definition).
 */
export function lesBrikkeprosjekt(raa: unknown): Innlesing {
  const problemer: string[] = [];
  const r = (raa && typeof raa === 'object' ? raa : {}) as Record<string, unknown>;
  const skjema = tall(r.skjema, BRIKKESKJEMA);
  if (skjema > BRIKKESKJEMA)
    problemer.push('Brikkeprosjektet er laget med en nyere versjon av Dragon Forge.');

  const instanser: Brikkeinstans[] = [];
  const sett = new Set<string>();
  for (const x of Array.isArray(r.instanser) ? r.instanser : []) {
    const i = (x ?? {}) as Record<string, unknown>;
    const d = (i.definisjon ?? {}) as Record<string, unknown>;
    if (!tekst(i.id) || sett.has(i.id) || !tekst(d.id) || typeof d.versjon !== 'number') {
      problemer.push('En brikke uten gyldig id eller definisjon ble hoppet over.');
      continue;
    }
    sett.add(i.id);
    instanser.push({
      id: i.id,
      definisjon: { id: d.id, versjon: d.versjon },
      ...(tekst(i.navn) ? { navn: i.navn } : {}),
      verdier: lesVerdier(i.verdier),
    });
  }
  const instans = new Map(instanser.map((i) => [i.id, i]));
  const punktFinnes = (e: Ende): boolean => {
    const i = instans.get(e.instans);
    if (!i) return false;
    const def = finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
    // An unknown definition keeps its connections (they cannot be checked, the build reports it).
    return !def || def.punkter.some((p) => p.id === e.punkt);
  };

  const forbindelser: Forbindelse[] = [];
  const opptatt = new Set<string>();
  const forelder = new Map<string, string>();
  const finnRot = (x: string): string => {
    while (forelder.has(x)) x = forelder.get(x)!;
    return x;
  };
  const lesEnde = (x: unknown): Ende | null => {
    const e = (x ?? {}) as Record<string, unknown>;
    return tekst(e.instans) && tekst(e.punkt) ? { instans: e.instans, punkt: e.punkt } : null;
  };
  for (const x of Array.isArray(r.forbindelser) ? r.forbindelser : []) {
    const f = (x ?? {}) as Record<string, unknown>;
    const a = lesEnde(f.a);
    const b = lesEnde(f.b);
    const pr = (f.profil ?? {}) as Record<string, unknown>;
    if (!tekst(f.id) || !a || !b || !punktFinnes(a) || !punktFinnes(b) || a.instans === b.instans) {
      problemer.push('En kobling som pekte på en brikke eller et punkt som ikke finnes, ble fjernet.');
      continue;
    }
    const ka = `${a.instans}/${a.punkt}`;
    const kb = `${b.instans}/${b.punkt}`;
    if (opptatt.has(ka) || opptatt.has(kb)) {
      problemer.push('En kobling til et punkt som allerede var opptatt, ble fjernet.');
      continue;
    }
    const ia = instans.get(a.instans)!;
    const ib = instans.get(b.instans)!;
    const kjent =
      finnDefinisjon(ia.definisjon.id, ia.definisjon.versjon) &&
      finnDefinisjon(ib.definisjon.id, ib.definisjon.versjon);
    const sjekk = kjent ? kompatibilitet(ia, a.punkt, ib, b.punkt) : null;
    if (sjekk) {
      problemer.push(`En kobling ble fjernet: ${sjekk}`);
      continue;
    }
    const ra = finnRot(a.instans);
    const rb = finnRot(b.instans);
    if (ra === rb) {
      problemer.push('En kobling som ville lukket en sløyfe, ble fjernet. Sløyfer støttes ikke ennå.');
      continue;
    }
    forelder.set(ra, rb);
    opptatt.add(ka);
    opptatt.add(kb);
    const profilId = tekst(pr.id) ? pr.id : HENGSEL_M.id;
    const profilVersjon = typeof pr.versjon === 'number' ? pr.versjon : HENGSEL_M.versjon;
    if (!finnProfil(profilId, profilVersjon))
      problemer.push(
        `Koblingsprofilen ${profilId} v${profilVersjon} er ukjent for denne versjonen av Dragon Forge.`,
      );
    forbindelser.push({
      id: f.id,
      a,
      b,
      profil: { id: profilId, versjon: profilVersjon },
      vinkel: 0,
      produksjon: 'print-i-ett',
    });
  }

  const raaGrupper: Gruppe[] = [];
  for (const x of Array.isArray(r.grupper) ? r.grupper : []) {
    const g = (x ?? {}) as Record<string, unknown>;
    const p = (g.plassering ?? {}) as Record<string, unknown>;
    if (!tekst(g.id) || !tekst(g.rot) || !instans.has(g.rot)) continue;
    raaGrupper.push({
      id: g.id,
      rot: g.rot,
      plassering: { x: tall(p.x, 0), y: tall(p.y, 0), vinkel: tall(p.vinkel, 0) },
    });
  }
  const prosjekt = ordneGrupper({ skjema: BRIKKESKJEMA, instanser, forbindelser, grupper: raaGrupper });
  for (const i of instanser) {
    if (!finnDefinisjon(i.definisjon.id, i.definisjon.versjon))
      problemer.push(
        `Brikkedefinisjonen ${i.definisjon.id} v${i.definisjon.versjon} er ukjent. Brikken er beholdt, men kan ikke bygges.`,
      );
  }
  return { prosjekt, problemer: [...new Set(problemer)] };
}

/**
 * Why two points cannot be joined, or null when they can: one socket and one
 * pin of the same profile. Capacity and loops are the graph's business.
 */
export function kompatibilitet(a: Brikkeinstans, pa: string, b: Brikkeinstans, pb: string): string | null {
  const da = finnDefinisjon(a.definisjon.id, a.definisjon.versjon);
  const db = finnDefinisjon(b.definisjon.id, b.definisjon.versjon);
  if (!da || !db) return 'En av brikkene har en ukjent definisjon.';
  const x = da.punkter.find((p) => p.id === pa);
  const y = db.punkter.find((p) => p.id === pb);
  if (!x || !y) return 'Punktet finnes ikke på brikken.';
  if (x.rolle === y.rolle)
    return x.rolle === 'tapp'
      ? 'To tapper kan ikke kobles. En tapp må inn i en sokkel.'
      : 'To sokler kan ikke kobles. En sokkel må ha en tapp.';
  if (x.profil.id !== y.profil.id || x.profil.versjon !== y.profil.versjon)
    return 'Punktene bruker forskjellige koblingsprofiler.';
  return null;
}

/** Connected sets of instances, in instance order. */
export function komponenter(p: Brikkeprosjekt): string[][] {
  const naboer = new Map<string, string[]>(p.instanser.map((i) => [i.id, []]));
  for (const f of p.forbindelser) {
    naboer.get(f.a.instans)?.push(f.b.instans);
    naboer.get(f.b.instans)?.push(f.a.instans);
  }
  const sett = new Set<string>();
  const ut: string[][] = [];
  for (const i of p.instanser) {
    if (sett.has(i.id)) continue;
    const komp: string[] = [];
    const ko = [i.id];
    sett.add(i.id);
    while (ko.length) {
      const x = ko.shift()!;
      komp.push(x);
      for (const n of naboer.get(x) ?? []) {
        if (!sett.has(n)) {
          sett.add(n);
          ko.push(n);
        }
      }
    }
    ut.push(komp);
  }
  return ut;
}

/**
 * Exactly one group per connected set. A set keeps the first stored group
 * whose root is in it; a set without one gets a new group rooted at its
 * first instance, placed by `plassering` (the instance's current place in
 * the world when the caller knows it, so nothing moves).
 */
export function ordneGrupper(
  p: Brikkeprosjekt,
  plassering?: (instans: string) => Plassering | undefined,
  nyRot?: (komponent: string[]) => string,
): Brikkeprosjekt {
  const grupper: Gruppe[] = [];
  const brukt = new Set<string>();
  for (const komp of komponenter(p)) {
    const inne = new Set(komp);
    const g = p.grupper.find((x) => inne.has(x.rot) && !brukt.has(x.id));
    if (g) {
      brukt.add(g.id);
      grupper.push(g);
      continue;
    }
    const rot = nyRot?.(komp) ?? komp[0]!;
    let id = `g_${rot}`;
    for (let n = 2; p.grupper.some((x) => x.id === id) || grupper.some((x) => x.id === id); n++)
      id = `g_${rot}_${n}`;
    grupper.push({
      id,
      rot,
      plassering: plassering?.(rot) ?? { x: 0, y: 0, vinkel: 0 },
    });
  }
  const like = grupper.length === p.grupper.length && grupper.every((g, i) => g === p.grupper[i]);
  return like ? p : { ...p, grupper };
}
