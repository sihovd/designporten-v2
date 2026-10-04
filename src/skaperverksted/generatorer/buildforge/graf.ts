/**
 * The modular builder's body graph (handoff 2026-10-04 §59–60): parts are
 * nodes, connections are edges between two connectors, one part is the
 * Main Body. Each group of connected parts is a tree; groups without the
 * Main Body are loose assemblies.
 *
 * Placement: the anchor of each group (the Main Body, or the first part of
 * a loose group in project order) stands where it is stored. Every other
 * part is placed by its connector: its axis points straight back at its
 * partner's axis and the two joint points meet, then the part is turned
 * about the axis by the connection's `vri`. Every group then stands on the
 * plate (its lowest shape at z = 0).
 *
 * All operations are pure: they take a project and return a new one, so
 * the editor applies each as one undoable step. Nothing here deletes a part
 * the user did not ask to delete: parts that lose their connection stay
 * where they were, as a loose group (handoff §12–14).
 */
import { nyId } from '../../core/dokument';
import { dekorBoks, formerI } from './felt';
import { finnKroppsmal, grunnformer, erGrunnform, type Kroppsmal } from './kroppsbibliotek';
import type { BuildforgeParametre, Ende, Forbindelse, Form, Kobling, Modulkropp, V3 } from './parametre';
import { rotasjon as eulerMatrise } from './sdf';

// ---------------------------------------------------------------------------
// 3×3 matrices (row-major) and placements

export type M3 = number[];
export interface Plassering {
  /** Orthonormal, may include a mirror (det −1). World = m·lokal + t. */
  m: M3;
  t: V3;
}

export const ENHET: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const SPEIL: M3 = [-1, 0, 0, 0, 1, 0, 0, 0, 1];

export function gange(a: M3, b: M3): M3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return r;
}
export const anvend = (m: M3, v: V3): V3 => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
];
export const transponer = (m: M3): M3 => [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
export const pluss = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const skaler = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const prikk = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const kryss = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normal = (a: V3): V3 => skaler(a, 1 / (Math.hypot(...a) || 1));

/** Rotation by `grader` about a unit axis (Rodrigues). */
export function omAkse(akse: V3, grader: number): M3 {
  const [x, y, z] = normal(akse);
  const v = (grader * Math.PI) / 180;
  const c = Math.cos(v),
    s = Math.sin(v),
    t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

/**
 * The shortest rotation taking unit vector u to v. Opposite vectors turn
 * half a turn about +Z (or +X when they are vertical), which a mirror across
 * the YZ plane maps onto itself, so mirrored assemblies stay mirror images.
 */
export function korteste(u: V3, v: V3): M3 {
  const c = prikk(u, v);
  if (c > 1 - 1e-9) return [...ENHET];
  if (c < -1 + 1e-9) return omAkse(Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], 180);
  const akse = kryss(u, v);
  return omAkse(akse, (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
}

/** Euler angles (degrees, the shapes' convention: R = Rz·Ry·Rx) of a rotation matrix. */
export function tilEuler(m: M3): V3 {
  const sy = Math.max(-1, Math.min(1, -m[6]!));
  const b = Math.asin(sy);
  let a: number, c: number;
  if (Math.abs(sy) < 0.99999) {
    a = Math.atan2(m[7]!, m[8]!);
    c = Math.atan2(m[3]!, m[0]!);
  } else {
    a = Math.atan2(-m[5]!, m[4]!);
    c = 0;
  }
  const g = (r: number) => Math.round(((r * 180) / Math.PI) * 1000) / 1000;
  return [g(a), g(b), g(c)];
}

export const kroppMatrise = (k: Pick<Modulkropp, 'rotasjon' | 'speilet'>): M3 =>
  k.speilet ? gange(eulerMatrise(k.rotasjon), SPEIL) : eulerMatrise(k.rotasjon);

/** The rotation part of a placement matrix (without the part's own mirror). */
const rotasjonsdel = (m: M3, speilet: boolean): M3 => (speilet ? gange(m, SPEIL) : m);

// ---------------------------------------------------------------------------
// The graph

export const kropperAv = (p: BuildforgeParametre): Modulkropp[] => p.kropper ?? [];
export const forbindelserAv = (p: BuildforgeParametre): Forbindelse[] => p.forbindelser ?? [];
export const finnKropp = (p: BuildforgeParametre, id: string) => kropperAv(p).find((k) => k.id === id);
export const finnKobling = (p: BuildforgeParametre, e: Ende): Kobling | undefined =>
  finnKropp(p, e.kropp)?.koblinger.find((x) => x.id === e.kobling);

/** A connector fits another: same family, opposite gender (handoff §34). */
export const kompatible = (a: Kobling, b: Kobling): boolean => a.familie === b.familie && a.kjonn !== b.kjonn;

export function forbindelseVed(p: BuildforgeParametre, e: Ende): Forbindelse | undefined {
  return forbindelserAv(p).find(
    (f) =>
      (f.a.kropp === e.kropp && f.a.kobling === e.kobling) ||
      (f.b.kropp === e.kropp && f.b.kobling === e.kobling),
  );
}

export const ledige = (p: BuildforgeParametre, kroppId: string): Kobling[] =>
  finnKropp(p, kroppId)?.koblinger.filter((kb) => !forbindelseVed(p, { kropp: kroppId, kobling: kb.id })) ??
  [];

const naboer = (p: BuildforgeParametre, id: string) =>
  forbindelserAv(p).flatMap((f) =>
    f.a.kropp === id
      ? [{ f, egen: f.a, annen: f.b }]
      : f.b.kropp === id
        ? [{ f, egen: f.b, annen: f.a }]
        : [],
  );

/** The groups of connected parts, each in project order; the Main Body's group first. */
export function komponenter(p: BuildforgeParametre): string[][] {
  const sett = new Set<string>();
  const ut: string[][] = [];
  const rekkefolge = kropperAv(p).map((k) => k.id);
  const start = p.rot && rekkefolge.includes(p.rot) ? [p.rot, ...rekkefolge] : rekkefolge;
  for (const id of start) {
    if (sett.has(id)) continue;
    const komp = new Set<string>([id]);
    const ko = [id];
    while (ko.length) {
      const x = ko.pop()!;
      for (const n of naboer(p, x))
        if (!komp.has(n.annen.kropp)) {
          komp.add(n.annen.kropp);
          ko.push(n.annen.kropp);
        }
    }
    for (const x of komp) sett.add(x);
    ut.push(rekkefolge.filter((x) => komp.has(x)));
  }
  return ut;
}

export const komponentAv = (p: BuildforgeParametre, id: string): string[] =>
  komponenter(p).find((k) => k.includes(id)) ?? [id];

/** The part a group stands on: the Main Body, or the first part of a loose group. */
export const ankerFor = (p: BuildforgeParametre, komp: string[]): string =>
  p.rot && komp.includes(p.rot) ? p.rot : komp[0]!;

export interface Tre {
  /** Parent of each part towards its group's anchor, and the connection to it. */
  forelder: Map<string, { kropp: string; f: Forbindelse; egen: Ende; annen: Ende }>;
  barn: Map<string, string[]>;
  /** Parts in placement order (anchor first). */
  rekkefolge: string[];
}

/** Each group as a tree from its anchor (breadth first, children in connector order). */
export function tre(p: BuildforgeParametre): Tre {
  const forelder: Tre['forelder'] = new Map();
  const barn = new Map<string, string[]>();
  const rekkefolge: string[] = [];
  for (const komp of komponenter(p)) {
    const anker = ankerFor(p, komp);
    const ko = [anker];
    const sett = new Set([anker]);
    while (ko.length) {
      const x = ko.shift()!;
      rekkefolge.push(x);
      const kropp = finnKropp(p, x)!;
      const ns = naboer(p, x).sort(
        (a, b) =>
          kropp.koblinger.findIndex((k) => k.id === a.egen.kobling) -
          kropp.koblinger.findIndex((k) => k.id === b.egen.kobling),
      );
      for (const n of ns) {
        if (sett.has(n.annen.kropp)) continue;
        sett.add(n.annen.kropp);
        forelder.set(n.annen.kropp, { kropp: x, f: n.f, egen: n.annen, annen: n.egen });
        barn.set(x, [...(barn.get(x) ?? []), n.annen.kropp]);
        ko.push(n.annen.kropp);
      }
    }
  }
  return { forelder, barn, rekkefolge };
}

/** Parts below `id` in its tree (not `id` itself). */
export function etterkommere(t: Tre, id: string): string[] {
  const ut: string[] = [];
  const ko = [...(t.barn.get(id) ?? [])];
  while (ko.length) {
    const x = ko.shift()!;
    ut.push(x);
    ko.push(...(t.barn.get(x) ?? []));
  }
  return ut;
}

/**
 * Where a part goes when its connector `egen` meets the connector `mal` of a
 * placed part, turned `vri` degrees about the joint axis.
 */
export function parring(
  forelder: Plassering,
  forelderKropp: Modulkropp,
  mal: Kobling,
  barn: Modulkropp,
  egen: Kobling,
  vri: number,
): Plassering {
  const A = normal(anvend(forelder.m, mal.akse));
  const B = rotasjonsdel(forelder.m, forelderKropp.speilet);
  const S = barn.speilet ? SPEIL : ENHET;
  const S_p = forelderKropp.speilet ? SPEIL : ENHET;
  const u = normal(anvend(S, egen.akse));
  const v = skaler(normal(anvend(S_p, mal.akse)), -1);
  const m = gange(gange(gange(omAkse(A, vri), B), korteste(u, v)), S);
  const P = pluss(anvend(forelder.m, mal.posisjon), forelder.t);
  return { m, t: minus(P, anvend(m, egen.posisjon)) };
}

/**
 * The lowest point of a part's shapes in world coordinates, or null. A sphere
 * is exact; other shapes use the corners of their own turned box, so a part
 * stands on the plate instead of floating above it.
 */
function lavesteZ(former: Form[], pl: Plassering): number | null {
  let z = Infinity;
  for (const f of former) {
    if (f.operasjon === 'trekk-fra') continue;
    const sider = f.speilet ? [1, -1] : [1];
    if (f.type === 'kule') {
      for (const s of sider)
        z = Math.min(
          z,
          anvend(pl.m, [s * f.posisjon[0], f.posisjon[1], f.posisjon[2]])[2] + pl.t[2] - f.mal[0] / 2,
        );
      continue;
    }
    const r = eulerMatrise(f.rotasjon);
    const h = [f.mal[0] / 2, f.mal[1] / 2, f.mal[2] / 2];
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        for (const c of [-1, 1]) {
          const q = pluss(f.posisjon, anvend(r, [a * h[0]!, b * h[1]!, c * h[2]!]));
          for (const s of sider) z = Math.min(z, anvend(pl.m, [s * q[0], q[1], q[2]])[2] + pl.t[2]);
        }
  }
  return Number.isFinite(z) ? z : null;
}

/** World placement of every part (handoff §13: connected parts follow their group). */
export function plasser(p: BuildforgeParametre): Map<string, Plassering> {
  const ut = new Map<string, Plassering>();
  const t = tre(p);
  for (const komp of komponenter(p)) {
    const anker = finnKropp(p, ankerFor(p, komp))!;
    ut.set(anker.id, { m: kroppMatrise(anker), t: [...anker.posisjon] });
    for (const id of t.rekkefolge) {
      if (!komp.includes(id) || id === anker.id) continue;
      const f = t.forelder.get(id)!;
      const fk = finnKropp(p, f.kropp)!;
      const k = finnKropp(p, id)!;
      const mal = fk.koblinger.find((x) => x.id === f.annen.kobling)!;
      const egen = k.koblinger.find((x) => x.id === f.egen.kobling)!;
      // vri turns side b; seen from side a it turns the other way
      const vri = f.f.b.kropp === id ? f.f.vri : -f.f.vri;
      ut.set(id, parring(ut.get(f.kropp)!, fk, mal, k, egen, vri));
    }
    // the group stands on the plate
    let z = Infinity;
    for (const id of komp) {
      const l = lavesteZ(formerI(p.former, id), ut.get(id)!);
      if (l !== null) z = Math.min(z, l);
    }
    if (Number.isFinite(z)) for (const id of komp) ut.get(id)!.t[2] -= z;
  }
  return ut;
}

/** World point and outward axis of a connector. */
export function koblingIVerden(pl: Plassering, kb: Kobling): { punkt: V3; akse: V3 } {
  return { punkt: pluss(anvend(pl.m, kb.posisjon), pl.t), akse: normal(anvend(pl.m, kb.akse)) };
}

// ---------------------------------------------------------------------------
// Operations

/** Store a part's current world placement as its own, so it stays put when it becomes an anchor. */
function frys(k: Modulkropp, pl: Plassering): Modulkropp {
  const r = rotasjonsdel(pl.m, k.speilet);
  return {
    ...k,
    posisjon: pl.t.map((v) => Math.round(v * 1000) / 1000) as V3,
    rotasjon: tilEuler(r),
  };
}

/** Freeze every part (only anchors use it), keeping the picture unchanged across a graph change. */
function frysAlle(p: BuildforgeParametre): BuildforgeParametre {
  const pl = plasser(p);
  return { ...p, kropper: kropperAv(p).map((k) => frys(k, pl.get(k.id)!)) };
}

/** Mirror the parts `ider`: each part's own mirror flips, and their joints turn the other way. */
function speilDeler(
  p: BuildforgeParametre,
  ider: Set<string>,
  ogsaForbindelse?: string,
): BuildforgeParametre {
  return {
    ...p,
    kropper: kropperAv(p).map((k) => (ider.has(k.id) ? { ...k, speilet: !k.speilet } : k)),
    forbindelser: forbindelserAv(p).map((f) =>
      (ider.has(f.a.kropp) && ider.has(f.b.kropp)) || f.id === ogsaForbindelse ? { ...f, vri: -f.vri } : f,
    ),
  };
}

/** Which side a library part should be on for a connector, given its natural side (+X). */
function skalSpeiles(p: BuildforgeParametre, barn: Modulkropp, mal: Ende): boolean | null {
  const side = finnKroppsmal(barn.komponent?.id)?.side;
  const fk = finnKropp(p, mal.kropp)!;
  const kb = fk.koblinger.find((x) => x.id === mal.kobling)!;
  if (side) {
    const x = (fk.speilet ? -1 : 1) * kb.posisjon[0];
    if (Math.abs(x) > 0.5) return Math.sign(x) !== side;
  }
  return null;
}

export type Resultat = { ok: true; p: BuildforgeParametre; melding?: string } | { ok: false; grunn: string };

/**
 * Connect connector `egen` (on a part in a group without `mal`) to connector
 * `mal`. The whole group of `egen` follows (handoff §13). A part that
 * naturally reaches to the left is mirrored when it goes on the right.
 */
export function koble(p: BuildforgeParametre, egen: Ende, mal: Ende): Resultat {
  const a = finnKobling(p, mal),
    b = finnKobling(p, egen);
  if (!a || !b) return { ok: false, grunn: 'Koblingen finnes ikke.' };
  if (forbindelseVed(p, mal) || forbindelseVed(p, egen))
    return { ok: false, grunn: 'Koblingen er allerede i bruk.' };
  if (!kompatible(a, b)) return { ok: false, grunn: 'Koblingene passer ikke sammen.' };
  const komp = komponentAv(p, egen.kropp);
  if (komp.includes(mal.kropp)) return { ok: false, grunn: 'Delene henger allerede sammen.' };
  let q = p;
  const barn = finnKropp(p, egen.kropp)!;
  const forelder = finnKropp(p, mal.kropp)!;
  const onsket = skalSpeiles(p, barn, mal) ?? forelder.speilet;
  if (onsket !== barn.speilet) q = speilDeler(q, new Set(komp));
  const f: Forbindelse = { id: nyId('c'), a: { ...mal }, b: { ...egen }, vri: 0 };
  return { ok: true, p: { ...q, forbindelser: [...forbindelserAv(q), f] } };
}

/**
 * Disconnect a connection explicitly (handoff §14). The side away from the
 * group's anchor becomes a loose group and stays where it was.
 */
export function koblFra(p: BuildforgeParametre, forbindelseId: string): Resultat {
  if (!forbindelserAv(p).some((f) => f.id === forbindelseId))
    return { ok: false, grunn: 'Forbindelsen finnes ikke.' };
  const q = frysAlle(p);
  return {
    ok: true,
    p: { ...q, forbindelser: forbindelserAv(q).filter((f) => f.id !== forbindelseId) },
  };
}

/** A part's connection towards its group's anchor, if it has one. */
export function forbindelseTilForelder(p: BuildforgeParametre, id: string): Forbindelse | undefined {
  return tre(p).forelder.get(id)?.f;
}

/**
 * Replace a part with a library part (handoff §11–12). Connections move to
 * the new part's free connectors that fit the same partner, preferring the
 * same role and then the nearest position; the connection towards the
 * anchor is matched first. Connections that find no place are dropped and
 * the parts behind them stay where they were, as loose groups. Shapes the
 * user added to the old part move to the new one; its base shapes are
 * replaced.
 */
export function erstatt(
  p: BuildforgeParametre,
  gammelId: string,
  mal: Kroppsmal,
): { ok: true; p: BuildforgeParametre; ny: string; frakoblet: number } | { ok: false; grunn: string } {
  const gammel = finnKropp(p, gammelId);
  if (!gammel) return { ok: false, grunn: 'Delen finnes ikke.' };
  const q = frysAlle(p);
  const t = tre(q);
  const tilForelder = t.forelder.get(gammelId);
  const nyId_ = nyId('k');
  const nyKropp: Modulkropp = {
    id: nyId_,
    navn: mal.navn,
    kategori: mal.kategori,
    komponent: { id: mal.id, versjon: mal.versjon },
    farge: gammel.farge,
    speilet: gammel.speilet,
    posisjon: [...finnKropp(q, gammelId)!.posisjon],
    rotasjon: [...finnKropp(q, gammelId)!.rotasjon],
    koblinger: mal.koblinger.map((x) => ({ ...structuredClone(x), familie: 'svivel' as const })),
  };
  const egne = naboer(q, gammelId).sort((a, b) =>
    a.f.id === tilForelder?.f.id
      ? -1
      : b.f.id === tilForelder?.f.id
        ? 1
        : gammel.koblinger.findIndex((k) => k.id === a.egen.kobling) -
          gammel.koblinger.findIndex((k) => k.id === b.egen.kobling),
  );
  const brukt = new Set<string>();
  const beholdt: Forbindelse[] = [];
  let frakoblet = 0;
  for (const n of egne) {
    const gammelKb = gammel.koblinger.find((k) => k.id === n.egen.kobling)!;
    const partner = finnKobling(q, n.annen)!;
    const kandidater = nyKropp.koblinger
      .filter((k) => !brukt.has(k.id) && kompatible(k, partner))
      .map((k, i) => ({
        k,
        i,
        rolle: k.rolle === gammelKb.rolle ? 0 : 1,
        d: Math.hypot(...minus(k.posisjon, gammelKb.posisjon)),
      }))
      .sort((a, b) => a.rolle - b.rolle || a.d - b.d || a.i - b.i);
    const valgt = kandidater[0]?.k;
    if (!valgt) {
      frakoblet++;
      continue;
    }
    brukt.add(valgt.id);
    const ende = { kropp: nyId_, kobling: valgt.id };
    beholdt.push({
      ...n.f,
      a: n.f.a.kropp === gammelId ? ende : n.f.a,
      b: n.f.b.kropp === gammelId ? ende : n.f.b,
    });
  }
  const andre = forbindelserAv(q).filter((f) => f.a.kropp !== gammelId && f.b.kropp !== gammelId);
  const egneFormer = q.former.filter((f) => f.kropp === gammelId && !erGrunnform(f));
  const former: Form[] = [];
  let lagtTil = false;
  for (const f of q.former) {
    if (f.kropp !== gammelId) former.push(f);
    else if (!lagtTil) {
      former.push(...grunnformer(mal, nyId_), ...egneFormer.map((x) => ({ ...x, kropp: nyId_ })));
      lagtTil = true;
    }
  }
  if (!lagtTil) former.push(...grunnformer(mal, nyId_));
  return {
    ok: true,
    ny: nyId_,
    frakoblet,
    p: {
      ...q,
      rot: q.rot === gammelId ? nyId_ : q.rot,
      kropper: kropperAv(q).map((k) => (k.id === gammelId ? nyKropp : k)),
      forbindelser: [...andre, ...beholdt],
      former,
    },
  };
}

/**
 * Delete a part, its shapes and its connections. Its neighbours stay where
 * they are; the parts behind it become loose groups. The Main Body cannot
 * be deleted, only replaced.
 */
export function slettKropp(p: BuildforgeParametre, id: string): Resultat {
  if (id === p.rot) return { ok: false, grunn: 'Hovedkroppen kan ikke slettes. Bytt den ut i stedet.' };
  if (!finnKropp(p, id)) return { ok: false, grunn: 'Delen finnes ikke.' };
  const q = frysAlle(p);
  return {
    ok: true,
    p: {
      ...q,
      kropper: kropperAv(q).filter((k) => k.id !== id),
      forbindelser: forbindelserAv(q).filter((f) => f.a.kropp !== id && f.b.kropp !== id),
      former: q.former.filter((f) => f.kropp !== id),
    },
  };
}

/** Mirror a part together with the parts behind it (handoff §55): a right arm with its hand. */
export function speilKropp(p: BuildforgeParametre, id: string): Resultat {
  if (!finnKropp(p, id)) return { ok: false, grunn: 'Delen finnes ikke.' };
  const t = tre(p);
  const ider = new Set([id, ...etterkommere(t, id)]);
  return { ok: true, p: speilDeler(p, ider, t.forelder.get(id)?.f.id) };
}

/** Turn a connected part about its joint (degrees, −180 to 180). */
export function settVri(p: BuildforgeParametre, forbindelseId: string, grader: number): BuildforgeParametre {
  const v = ((((grader + 180) % 360) + 360) % 360) - 180;
  return {
    ...p,
    forbindelser: forbindelserAv(p).map((f) =>
      f.id === forbindelseId ? { ...f, vri: Math.round(v * 10) / 10 } : f,
    ),
  };
}

/** Move a whole group: its anchor gets the placement `fra → til` applied (handoff §13). */
export function flyttGruppe(p: BuildforgeParametre, kroppId: string, delta: Plassering): BuildforgeParametre {
  const komp = komponentAv(p, kroppId);
  const ankerId = ankerFor(p, komp);
  const pl = plasser(p).get(ankerId)!;
  const anker = finnKropp(p, ankerId)!;
  const ny: Plassering = { m: gange(delta.m, pl.m), t: pluss(anvend(delta.m, pl.t), delta.t) };
  const g = (v: number) => Math.max(-280, Math.min(280, v));
  const fryst = frys(anker, ny);
  return {
    ...p,
    kropper: kropperAv(p).map((k) =>
      k.id === ankerId
        ? { ...fryst, posisjon: [g(fryst.posisjon[0]), g(fryst.posisjon[1]), fryst.posisjon[2]] }
        : k,
    ),
  };
}

/** A copy of one part (with its shapes), loose beside the original. */
export function dupliserKropp(
  p: BuildforgeParametre,
  id: string,
): { p: BuildforgeParametre; ny: string } | null {
  const k = finnKropp(p, id);
  if (!k) return null;
  const pl = plasser(p).get(id)!;
  const b = dekorBoks(formerI(p.former, id));
  const bredde = b ? b.maks[0] - b.min[0] : 20;
  const ny = nyId('k');
  const kopi = frys(
    { ...structuredClone(k), id: ny, navn: `${k.navn} (kopi)`.slice(0, 60) },
    {
      m: pl.m,
      t: [pl.t[0] + bredde + 10, pl.t[1], pl.t[2]],
    },
  );
  return {
    ny,
    p: {
      ...p,
      kropper: [...kropperAv(p), kopi],
      former: [
        ...p.former,
        ...p.former
          .filter((f) => f.kropp === id)
          .map((f) => ({ ...structuredClone(f), id: nyId('f'), kropp: ny })),
      ],
    },
  };
}

/** Add a library part as a loose part standing at `punkt` on the plate. */
export function leggTilLos(
  p: BuildforgeParametre,
  ny: { kropp: Modulkropp; former: Form[] },
  punkt: V3,
): BuildforgeParametre {
  return {
    ...p,
    kropper: [...kropperAv(p), { ...ny.kropp, posisjon: [punkt[0], punkt[1], 0] }],
    former: [...p.former, ...ny.former],
  };
}

/** Add a library part and connect it in one step. */
export function leggTilOgKoble(
  p: BuildforgeParametre,
  ny: { kropp: Modulkropp; former: Form[] },
  egenKobling: string,
  mal: Ende,
): Resultat {
  const q = leggTilLos(p, ny, [0, 0, 0]);
  return koble(q, { kropp: ny.kropp.id, kobling: egenKobling }, mal);
}

/** Connector names for people: «Kroppen · venstre skulder». */
export function koblingsnavn(p: BuildforgeParametre, e: Ende): string {
  const k = finnKropp(p, e.kropp);
  const kb = k?.koblinger.find((x) => x.id === e.kobling);
  return k && kb ? `${k.navn} · ${kb.navn.toLowerCase()}` : 'Ukjent kobling';
}

/**
 * Where a new part with these connectors can go without dragging: every free
 * connector on the model it fits, with its own fitting connectors, the one
 * with the same role first (handoff §8, keyboard and touch placement).
 */
export function koblingsvalg(
  p: BuildforgeParametre,
  egne: Pick<Kobling, 'id' | 'kjonn' | 'rolle'>[],
): { mal: Ende; egne: string[] }[] {
  const ut: { mal: Ende; egne: string[] }[] = [];
  for (const k of kropperAv(p))
    for (const kb of ledige(p, k.id)) {
      const passende = egne
        .filter((e) => kompatible({ ...e, familie: kb.familie } as Kobling, kb))
        .sort((a, b) => Number(b.rolle === kb.rolle) - Number(a.rolle === kb.rolle))
        .map((e) => e.id);
      if (passende.length) ut.push({ mal: { kropp: k.id, kobling: kb.id }, egne: passende });
    }
  return ut;
}

/** A free spot on the plate for a loose part, to the right of what is there. */
export function ledigPlass(p: BuildforgeParametre): V3 {
  let x = 0;
  for (const [id, pl] of plasser(p)) {
    const b = dekorBoks(formerI(p.former, id));
    if (!b) continue;
    for (const hx of [b.min[0], b.maks[0]])
      for (const hy of [b.min[1], b.maks[1]])
        for (const hz of [b.min[2], b.maks[2]]) x = Math.max(x, anvend(pl.m, [hx, hy, hz])[0] + pl.t[0]);
  }
  // the new part stands with its middle 30 mm beyond the rightmost point
  return [Math.min(x + 30, 260), 0, 0];
}
