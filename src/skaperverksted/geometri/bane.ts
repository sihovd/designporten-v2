/**
 * Editable curves (Sivert, 2026-10-05: edit the points and curves of an
 * SVG, draw with a pen tool, repair paths that are not closed).
 *
 * A vector's path data is read into paths of nodes: an anchor point and an
 * optional handle on each side, as an offset from the anchor. A segment
 * between two nodes is a straight line when neither has a handle towards
 * it, else a cubic Bézier. Quadratic curves and arcs are converted to
 * cubics exactly (arcs within 0.03 % of the radius). All functions are pure
 * and return new paths, so every edit is one undo step.
 *
 * Fill semantics stay SVG's: an open path is filled as if closed with a
 * straight line, so a path that is not closed still has an area. «Open»
 * is kept in the data so it can be shown and repaired, not because the
 * geometry would otherwise differ.
 */
import type { Boks, Matrise, Vec2 } from '../core/geometri2d';
import { StiFeil, stiTilRinger, tokeniser } from './stidata';
import type { Ring } from './polygon';

export interface Node {
  /** The anchor point. */
  p: Vec2;
  /** Handle towards the previous node, as an offset from `p` (null = none). */
  inn: Vec2 | null;
  /** Handle towards the next node, as an offset from `p` (null = none). */
  ut: Vec2 | null;
  /** Smooth: both handles stay in line, so the curve has no corner here. */
  glatt: boolean;
}

export interface Bane {
  noder: Node[];
  lukket: boolean;
}

/** A node picked by path and index. */
export type NodeRef = [bane: number, node: number];

const EPS = 1e-6;

const lengde = (v: Vec2) => Math.hypot(v.x, v.y);
const minus = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const pluss = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const gange = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const avst = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const handtak = (v: Vec2 | null): Vec2 | null => (v && lengde(v) > EPS ? v : null);

function nyNode(p: Vec2, inn: Vec2 | null = null, ut: Vec2 | null = null): Node {
  return { p, inn: handtak(inn), ut: handtak(ut), glatt: false };
}

function klonNode(n: Node): Node {
  return { p: { ...n.p }, inn: n.inn && { ...n.inn }, ut: n.ut && { ...n.ut }, glatt: n.glatt };
}

export function klonBaner(baner: Bane[]): Bane[] {
  return baner.map((b) => ({ noder: b.noder.map(klonNode), lukket: b.lukket }));
}

// ---------- reading path data ----------

/** SVG elliptical arc → cubic Béziers (SVG spec F.6.5 for the centre, then ≤ 90° pieces). */
function bueTilKubiske(
  p0: Vec2,
  rx: number,
  ry: number,
  rotGrader: number,
  storBue: boolean,
  medSol: boolean,
  p1: Vec2,
): { c1: Vec2; c2: Vec2; til: Vec2 }[] {
  if (rx === 0 || ry === 0 || avst(p0, p1) < EPS) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotGrader * Math.PI) / 180;
  const cos = Math.cos(phi),
    sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2,
    dy = (p0.y - p1.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const teller = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const nevner = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let k = Math.sqrt(Math.max(0, teller / nevner));
  if (storBue === medSol) k = -k;
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p1.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p1.y) / 2;
  const vinkel = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = vinkel(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = vinkel((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!medSol && dt > 0) dt -= 2 * Math.PI;
  if (medSol && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const steg = dt / n;
  const kappa = (4 / 3) * Math.tan(steg / 4);
  const punkt = (t: number): Vec2 => ({
    x: cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx,
    y: sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy,
  });
  const retning = (t: number): Vec2 => ({
    x: -cos * rx * Math.sin(t) - sin * ry * Math.cos(t),
    y: -sin * rx * Math.sin(t) + cos * ry * Math.cos(t),
  });
  const ut: { c1: Vec2; c2: Vec2; til: Vec2 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + steg * i,
      b = t1 + steg * (i + 1);
    const fra = i === 0 ? p0 : punkt(a);
    const til = i === n - 1 ? p1 : punkt(b);
    ut.push({
      c1: pluss(fra, gange(retning(a), kappa)),
      c2: minus(til, gange(retning(b), kappa)),
      til,
    });
  }
  return ut;
}

/** Nodes with opposite handles in line are smooth. */
function finnGlatte(b: Bane): void {
  const n = b.noder.length;
  b.noder.forEach((nd, i) => {
    const ende = !b.lukket && (i === 0 || i === n - 1);
    if (ende || !nd.inn || !nd.ut) return;
    const kryss = nd.inn.x * nd.ut.y - nd.inn.y * nd.ut.x;
    const prikk = nd.inn.x * nd.ut.x + nd.inn.y * nd.ut.y;
    nd.glatt = prikk < 0 && Math.abs(kryss) < 1e-3 * lengde(nd.inn) * lengde(nd.ut);
  });
}

/** Path data → editable paths. Throws StiFeil on malformed data. Supports M L H V C S Q T A Z. */
export function tolkBaner(d: string): Bane[] {
  const t = tokeniser(d);
  const baner: Bane[] = [];
  let bane: Bane | null = null;
  let i = 0;
  let cmd = '';
  let p: Vec2 = { x: 0, y: 0 };
  let start: Vec2 = { x: 0, y: 0 };
  let sisteKontroll: Vec2 | null = null;
  let sisteType = '';

  const tall = (): number => {
    const v = t[i++];
    if (typeof v !== 'number') throw new StiFeil('Ugyldig stidata.');
    return v;
  };
  const flagg = (): boolean => tall() !== 0;
  const ferdig = (lukk: boolean) => {
    if (bane) {
      if (lukk) {
        bane.lukket = true;
        const f = bane.noder[0]!,
          s = bane.noder[bane.noder.length - 1]!;
        // a closing line back to the start: the last node is the first one again
        if (bane.noder.length > 1 && avst(f.p, s.p) < EPS) {
          f.inn = s.inn;
          bane.noder.pop();
        }
      }
      if (bane.noder.length >= 2) {
        finnGlatte(bane);
        baner.push(bane);
      }
    }
    bane = null;
  };
  const sikre = (): Bane => {
    if (!bane) bane = { noder: [nyNode({ ...p })], lukket: false };
    return bane;
  };
  const linje = (til: Vec2) => {
    sikre().noder.push(nyNode({ ...til }));
  };
  const kubisk = (c1: Vec2, c2: Vec2, til: Vec2) => {
    const b = sikre();
    const siste = b.noder[b.noder.length - 1]!;
    siste.ut = handtak(minus(c1, siste.p));
    b.noder.push(nyNode({ ...til }, minus(c2, til), null));
  };

  while (i < t.length) {
    const tok = t[i];
    if (typeof tok === 'string') {
      cmd = tok;
      i++;
    } else if (!cmd) {
      throw new StiFeil('Stidata må starte med M.');
    }
    if (!sisteType && cmd.toUpperCase() !== 'M') throw new StiFeil('Stidata må starte med M.');
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const o = rel ? p : { x: 0, y: 0 };
    let kontroll: Vec2 | null = null;
    switch (C) {
      case 'M': {
        ferdig(false);
        p = { x: o.x + tall(), y: o.y + tall() };
        start = p;
        bane = { noder: [nyNode({ ...p })], lukket: false };
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        p = { x: o.x + tall(), y: o.y + tall() };
        linje(p);
        break;
      case 'H':
        p = { x: (rel ? p.x : 0) + tall(), y: p.y };
        linje(p);
        break;
      case 'V':
        p = { x: p.x, y: (rel ? p.y : 0) + tall() };
        linje(p);
        break;
      case 'C': {
        const c1 = { x: o.x + tall(), y: o.y + tall() };
        const c2 = { x: o.x + tall(), y: o.y + tall() };
        const e = { x: o.x + tall(), y: o.y + tall() };
        kubisk(c1, c2, e);
        kontroll = c2;
        p = e;
        break;
      }
      case 'S': {
        const c1: Vec2 =
          sisteKontroll && (sisteType === 'C' || sisteType === 'S')
            ? { x: 2 * p.x - sisteKontroll.x, y: 2 * p.y - sisteKontroll.y }
            : p;
        const c2 = { x: o.x + tall(), y: o.y + tall() };
        const e = { x: o.x + tall(), y: o.y + tall() };
        kubisk(c1, c2, e);
        kontroll = c2;
        p = e;
        break;
      }
      case 'Q': {
        const q = { x: o.x + tall(), y: o.y + tall() };
        const e = { x: o.x + tall(), y: o.y + tall() };
        kubisk(lerp(p, q, 2 / 3), lerp(e, q, 2 / 3), e);
        kontroll = q;
        p = e;
        break;
      }
      case 'T': {
        const q: Vec2 =
          sisteKontroll && (sisteType === 'Q' || sisteType === 'T')
            ? { x: 2 * p.x - sisteKontroll.x, y: 2 * p.y - sisteKontroll.y }
            : p;
        const e = { x: o.x + tall(), y: o.y + tall() };
        kubisk(lerp(p, q, 2 / 3), lerp(e, q, 2 / 3), e);
        kontroll = q;
        p = e;
        break;
      }
      case 'A': {
        const rx = tall(),
          ry = tall(),
          rot = tall(),
          stor = flagg(),
          sol = flagg();
        const e = { x: o.x + tall(), y: o.y + tall() };
        const biter = bueTilKubiske(p, rx, ry, rot, stor, sol, e);
        if (!biter.length) linje(e);
        for (const b of biter) kubisk(b.c1, b.c2, b.til);
        p = e;
        break;
      }
      case 'Z':
        ferdig(true);
        p = start;
        break;
      default:
        throw new StiFeil(`Ukjent stikommando «${cmd}».`);
    }
    sisteKontroll = kontroll;
    sisteType = C;
  }
  ferdig(false);
  return baner;
}

// ---------- writing path data ----------

const f3 = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
};
const par = (p: Vec2) => `${f3(p.x)} ${f3(p.y)}`;

/** A segment is a curve when either end has a handle towards it. */
export function erKurve(a: Node, b: Node): boolean {
  return !!(a.ut || b.inn);
}

/** The segments of a path as index pairs (the closing one last, when closed). */
export function segmenter(b: Bane): [number, number][] {
  const n = b.noder.length;
  const ut: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) ut.push([i, i + 1]);
  if (b.lukket && n >= 2) ut.push([n - 1, 0]);
  return ut;
}

/** The four control points of a segment (a straight one has its handles at its ends). */
export function kontrollpunkter(a: Node, b: Node): [Vec2, Vec2, Vec2, Vec2] {
  return [a.p, a.ut ? pluss(a.p, a.ut) : a.p, b.inn ? pluss(b.p, b.inn) : b.p, b.p];
}

export function banerTilSti(baner: Bane[]): string {
  return baner
    .map((b) => {
      const ut = [`M${par(b.noder[0]!.p)}`];
      for (const [i, j] of segmenter(b)) {
        const a = b.noder[i]!,
          z = b.noder[j]!;
        const lukkende = j === 0;
        if (erKurve(a, z)) {
          const [, c1, c2, e] = kontrollpunkter(a, z);
          ut.push(`C${par(c1)} ${par(c2)} ${par(e)}`);
        } else if (!lukkende) ut.push(`L${par(z.p)}`);
      }
      if (b.lukket) ut.push('Z');
      return ut.join('');
    })
    .join('');
}

/** Apply an affine matrix: anchors fully, handles by the linear part. */
export function transformerBaner(baner: Bane[], m: Matrise): Bane[] {
  const pkt = (p: Vec2): Vec2 => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
  const vek = (v: Vec2 | null): Vec2 | null =>
    v && { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y };
  return baner.map((b) => ({
    lukket: b.lukket,
    noder: b.noder.map((n) => ({ p: pkt(n.p), inn: vek(n.inn), ut: vek(n.ut), glatt: n.glatt })),
  }));
}

export function flyttBaner(baner: Bane[], dx: number, dy: number): Bane[] {
  return transformerBaner(baner, [1, 0, 0, 1, dx, dy]);
}

/** The flattened outlines, as the geometry reads them (open paths closed). */
export function banerTilRinger(baner: Bane[], toleranse = 0.02): Ring[] {
  if (!baner.length) return [];
  return stiTilRinger(banerTilSti(baner), toleranse);
}

/** The box round the curves (anchors and the curve between them, not the handles). */
export function banerBoks(baner: Bane[]): Boks | null {
  let minX = Infinity,
    minY = Infinity,
    maksX = -Infinity,
    maksY = -Infinity;
  const ta = (p: Vec2) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maksX = Math.max(maksX, p.x);
    maksY = Math.max(maksY, p.y);
  };
  for (const b of baner) {
    for (const n of b.noder) ta(n.p);
    for (const [i, j] of segmenter(b)) {
      const a = b.noder[i]!,
        z = b.noder[j]!;
      if (!erKurve(a, z)) continue;
      const k = kontrollpunkter(a, z);
      for (let s = 1; s < 16; s++) ta(punktPaaKurve(k, s / 16));
    }
  }
  return minX <= maksX ? { minX, minY, maksX, maksY } : null;
}

export function punktPaaKurve(k: [Vec2, Vec2, Vec2, Vec2], t: number): Vec2 {
  const a = lerp(k[0], k[1], t),
    b = lerp(k[1], k[2], t),
    c = lerp(k[2], k[3], t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

// ---------- editing ----------

function medBane(baner: Bane[], b: number, fn: (bane: Bane) => void): Bane[] {
  const ut = klonBaner(baner);
  const bane = ut[b];
  if (bane) fn(bane);
  return ut;
}

/** Move anchors (their handles follow). */
export function flyttNoder(baner: Bane[], noder: NodeRef[], dx: number, dy: number): Bane[] {
  const ut = klonBaner(baner);
  for (const [b, n] of noder) {
    const nd = ut[b]?.noder[n];
    if (nd) nd.p = { x: nd.p.x + dx, y: nd.p.y + dy };
  }
  return ut;
}

/**
 * Set one handle of a node. On a smooth node the other handle turns to
 * stay in line and keeps its length, unless `bryt` (Alt) is set: then the
 * node becomes a corner and the handles move on their own.
 */
export function settHandtak(
  baner: Bane[],
  b: number,
  n: number,
  hvilken: 'inn' | 'ut',
  utslag: Vec2 | null,
  bryt = false,
): Bane[] {
  return medBane(baner, b, (bane) => {
    const nd = bane.noder[n];
    if (!nd) return;
    nd[hvilken] = handtak(utslag);
    const andre = hvilken === 'inn' ? 'ut' : 'inn';
    if (bryt) nd.glatt = false;
    else if (nd.glatt && utslag && lengde(utslag) >= EPS) {
      const l = lengde(utslag);
      const egen = nd[andre] ? lengde(nd[andre]!) : l;
      nd[andre] = handtak(gange(utslag, -egen / l));
    }
  });
}

/** Make a node a corner (handles move on their own) or smooth (handles in line). */
export function settNodeType(baner: Bane[], b: number, n: number, glatt: boolean): Bane[] {
  return medBane(baner, b, (bane) => {
    const nd = bane.noder[n];
    if (!nd) return;
    if (!glatt) {
      nd.glatt = false;
      return;
    }
    const k = bane.noder.length;
    const forrige = n > 0 ? bane.noder[n - 1] : bane.lukket ? bane.noder[k - 1] : undefined;
    const neste = n < k - 1 ? bane.noder[n + 1] : bane.lukket ? bane.noder[0] : undefined;
    const lenInn = forrige ? avst(nd.p, forrige.p) / 3 : 0;
    const lenUt = neste ? avst(nd.p, neste.p) / 3 : 0;
    if (nd.inn && nd.ut) {
      const u1 = gange(nd.inn, -1 / lengde(nd.inn));
      const u2 = gange(nd.ut, 1 / lengde(nd.ut));
      let d = pluss(u1, u2);
      if (lengde(d) < EPS) d = { x: -u2.y, y: u2.x };
      d = gange(d, 1 / lengde(d));
      nd.inn = gange(d, -lengde(nd.inn));
      nd.ut = gange(d, lengde(nd.ut));
    } else if (nd.inn || nd.ut) {
      // one handle: the other points the opposite way
      if (nd.inn) nd.ut = lenUt > EPS ? gange(nd.inn, -lenUt / lengde(nd.inn)) : null;
      else nd.inn = lenInn > EPS ? gange(nd.ut!, -lenInn / lengde(nd.ut!)) : null;
    } else {
      const fra = forrige?.p ?? nd.p;
      const til = neste?.p ?? nd.p;
      let d = minus(til, fra);
      if (lengde(d) < EPS) return;
      d = gange(d, 1 / lengde(d));
      nd.inn = handtak(gange(d, -lenInn));
      nd.ut = handtak(gange(d, lenUt));
    }
    nd.glatt = !!(nd.inn && nd.ut);
  });
}

/** Add a node on a segment at parameter t (0..1) without changing the shape. Returns the new node's index. */
export function settInnNode(
  baner: Bane[],
  b: number,
  seg: number,
  t: number,
): { baner: Bane[]; node: number } {
  let node = -1;
  const ut = medBane(baner, b, (bane) => {
    const n = bane.noder.length;
    const [i, j] = segmenter(bane)[seg] ?? [];
    if (i === undefined || j === undefined) return;
    const a = bane.noder[i]!,
      z = bane.noder[j]!;
    let ny: Node;
    if (erKurve(a, z)) {
      const [p0, p1, p2, p3] = kontrollpunkter(a, z);
      const q0 = lerp(p0, p1, t),
        q1 = lerp(p1, p2, t),
        q2 = lerp(p2, p3, t);
      const r0 = lerp(q0, q1, t),
        r1 = lerp(q1, q2, t);
      const s = lerp(r0, r1, t);
      ny = { p: s, inn: handtak(minus(r0, s)), ut: handtak(minus(r1, s)), glatt: true };
      a.ut = handtak(minus(q0, p0));
      z.inn = handtak(minus(q2, p3));
    } else {
      ny = nyNode(lerp(a.p, z.p, t));
    }
    node = j === 0 ? n : j;
    bane.noder.splice(node, 0, ny);
  });
  return { baner: ut, node };
}

function rydd(baner: Bane[]): Bane[] {
  return baner.filter((b) => {
    const n = b.noder.length;
    if (n < 2) return false;
    if (b.lukket && n === 2 && !erKurve(b.noder[0]!, b.noder[1]!) && !erKurve(b.noder[1]!, b.noder[0]!)) {
      return false;
    }
    return true;
  });
}

/** Delete nodes; the neighbours join up (like the Delete Anchor Point tool). */
export function slettNoder(baner: Bane[], noder: NodeRef[]): Bane[] {
  const ut = klonBaner(baner);
  const perBane = new Map<number, Set<number>>();
  for (const [b, n] of noder) perBane.set(b, (perBane.get(b) ?? new Set()).add(n));
  for (const [b, set] of perBane) {
    const bane = ut[b];
    if (!bane) continue;
    bane.noder = bane.noder.filter((_, i) => !set.has(i));
  }
  return rydd(ut);
}

export function slettBaner(baner: Bane[], indekser: number[]): Bane[] {
  const bort = new Set(indekser);
  return baner.filter((_, i) => !bort.has(i)).map((b) => ({ ...b, noder: b.noder.map(klonNode) }));
}

/**
 * Delete one segment. A closed path becomes open there; an open path is
 * split in two.
 */
export function slettSegment(baner: Bane[], b: number, seg: number): Bane[] {
  const ut: Bane[] = [];
  baner.forEach((bane, k) => {
    if (k !== b) {
      ut.push({ lukket: bane.lukket, noder: bane.noder.map(klonNode) });
      return;
    }
    const noder = bane.noder.map(klonNode);
    const n = noder.length;
    const par_ = segmenter(bane)[seg];
    if (!par_) {
      ut.push({ lukket: bane.lukket, noder });
      return;
    }
    const [i] = par_;
    if (bane.lukket) {
      // start again after the cut and go round to it
      const rotert = [...noder.slice(i + 1), ...noder.slice(0, i + 1)];
      rotert[0]!.inn = null;
      rotert[rotert.length - 1]!.ut = null;
      ut.push({ lukket: false, noder: rotert });
    } else {
      const venstre = noder.slice(0, i + 1);
      const hoyre = noder.slice(i + 1, n);
      venstre[venstre.length - 1]!.ut = null;
      hoyre[0]!.inn = null;
      ut.push({ lukket: false, noder: venstre }, { lukket: false, noder: hoyre });
    }
  });
  return rydd(ut);
}

/** Close an open path (a straight line from its end to its start; if they meet, they become one node). */
export function lukkBane(baner: Bane[], b: number): Bane[] {
  return rydd(
    medBane(baner, b, (bane) => {
      if (bane.lukket) return;
      const f = bane.noder[0]!,
        s = bane.noder[bane.noder.length - 1]!;
      bane.lukket = true;
      if (bane.noder.length > 2 && avst(f.p, s.p) < EPS) {
        f.inn = s.inn;
        bane.noder.pop();
      }
      finnGlatte(bane);
    }),
  );
}

export function reverserBane(baner: Bane[], b: number): Bane[] {
  return medBane(baner, b, (bane) => {
    bane.noder = bane.noder.reverse().map((n) => ({ ...n, inn: n.ut, ut: n.inn }));
    if (bane.lukket) bane.noder.unshift(bane.noder.pop()!);
  });
}

// ---------- finding things ----------

export interface Segmenttreff {
  bane: number;
  seg: number;
  t: number;
  punkt: Vec2;
  avstand: number;
}

/** The point on the curves nearest to `p` within `maks` (same units as the paths). */
export function narmesteSegment(baner: Bane[], p: Vec2, maks = Infinity): Segmenttreff | null {
  let best: Segmenttreff | null = null;
  baner.forEach((bane, b) => {
    segmenter(bane).forEach(([i, j], seg) => {
      const a = bane.noder[i]!,
        z = bane.noder[j]!;
      const k = kontrollpunkter(a, z);
      let t: number;
      let q: Vec2;
      if (!erKurve(a, z)) {
        const d = minus(z.p, a.p);
        const l2 = d.x * d.x + d.y * d.y;
        t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.p.x) * d.x + (p.y - a.p.y) * d.y) / l2));
        q = lerp(a.p, z.p, t);
      } else {
        const N = 32;
        let bt = 0,
          bd = Infinity;
        for (let s = 0; s <= N; s++) {
          const d = avst(punktPaaKurve(k, s / N), p);
          if (d < bd) {
            bd = d;
            bt = s / N;
          }
        }
        let lo = Math.max(0, bt - 1 / N),
          hi = Math.min(1, bt + 1 / N);
        for (let r = 0; r < 14; r++) {
          const m1 = lo + (hi - lo) / 3,
            m2 = hi - (hi - lo) / 3;
          if (avst(punktPaaKurve(k, m1), p) < avst(punktPaaKurve(k, m2), p)) hi = m2;
          else lo = m1;
        }
        t = (lo + hi) / 2;
        q = punktPaaKurve(k, t);
      }
      const avstand = avst(q, p);
      if (avstand <= maks && (!best || avstand < best.avstand)) best = { bane: b, seg, t, punkt: q, avstand };
    });
  });
  return best;
}

function punktIRing(p: Vec2, r: Ring): boolean {
  let inne = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!,
      b = r[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inne = !inne;
  }
  return inne;
}

/**
 * The paths that make up one shape together with path `b`: an outer path
 * and the holes directly inside it. A hole is only itself.
 */
export function formAv(baner: Bane[], b: number): number[] {
  const ringer = baner.map((x) => banerTilRinger([x], 0.05)[0] ?? []);
  const rep = baner.map((x) => x.noder[0]!.p);
  const inni = (i: number, j: number) => i !== j && ringer[j]!.length >= 3 && punktIRing(rep[i]!, ringer[j]!);
  const dybde = baner.map((_, i) => baner.reduce((s, _x, j) => s + (inni(i, j) ? 1 : 0), 0));
  if (dybde[b]! % 2 === 1) return [b];
  const barn = baner.flatMap((_, j) => (dybde[j] === dybde[b]! + 1 && inni(j, b) ? [j] : []));
  return [b, ...barn];
}

/**
 * The path of the filled shape that covers a point: the innermost path
 * around it, unless that is a hole (then the point is in the empty space).
 */
export function baneVedPunkt(baner: Bane[], p: Vec2): number | null {
  const ringer = baner.map((x) => banerTilRinger([x], 0.05)[0] ?? []);
  const areal = (r: Ring) => {
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j]!.x + r[i]!.x) * (r[j]!.y - r[i]!.y);
    return Math.abs(s / 2);
  };
  let best = -1;
  ringer.forEach((r, i) => {
    if (r.length < 3 || !punktIRing(p, r)) return;
    if (best < 0 || areal(r) < areal(ringer[best]!)) best = i;
  });
  if (best < 0) return null;
  const rep = baner[best]!.noder[0]!.p;
  const dybde = ringer.reduce(
    (s, r, j) => s + (j !== best && r.length >= 3 && punktIRing(rep, r) ? 1 : 0),
    0,
  );
  return dybde % 2 === 1 ? null : best;
}

// ---------- repairing open paths ----------

export interface Gap {
  fra: Vec2;
  til: Vec2;
  avstand: number;
  /** One path closing on itself, or two paths joined end to end. */
  type: 'lukk' | 'koble';
}

export interface Reparasjon {
  baner: Bane[];
  /** What was done, in order (also what a preview shows). */
  gap: Gap[];
  lukket: number;
  koblet: number;
  /** Still open paths closed with a straight line (only when asked for). */
  tvunget: number;
  /** Open paths without an area (a single line) taken away (only when asked for). */
  fjernet: number;
}

/** Remove a node that sits on the one before it, keeping the handles on the outside. */
function fjernDubletter(bane: Bane): void {
  for (let i = bane.noder.length - 1; i > 0; i--) {
    const a = bane.noder[i - 1]!,
      b = bane.noder[i]!;
    if (avst(a.p, b.p) < EPS && !a.ut && !b.inn) {
      a.ut = b.ut;
      bane.noder.splice(i, 1);
    }
  }
  const n = bane.noder.length;
  if (bane.lukket && n > 2) {
    const f = bane.noder[0]!,
      s = bane.noder[n - 1]!;
    if (avst(f.p, s.p) < EPS && !f.inn && !s.ut) {
      f.inn = s.inn;
      bane.noder.pop();
    }
  }
}

/**
 * Close paths whose ends nearly meet and join paths that nearly touch end
 * to end, nearest first, up to `toleranse`. A shape drawn as several loose
 * pieces becomes one closed shape. With `tving`, paths still open after
 * that are closed with a straight line, and lone lines are dropped.
 */
export function reparerBaner(baner: Bane[], toleranse: number, tving = false): Reparasjon {
  let arb = klonBaner(baner);
  const gap: Gap[] = [];
  let lukket = 0,
    koblet = 0,
    tvunget = 0,
    fjernet = 0;
  type Ende = { b: number; ende: 0 | 1 };
  for (;;) {
    const ender: Ende[] = [];
    arb.forEach((bane, b) => {
      if (bane.lukket || bane.noder.length < 2) return;
      ender.push({ b, ende: 0 }, { b, ende: 1 });
    });
    const pos = (e: Ende) => {
      const n = arb[e.b]!.noder;
      return (e.ende === 0 ? n[0]! : n[n.length - 1]!).p;
    };
    let best: { a: Ende; z: Ende; d: number } | null = null;
    for (let i = 0; i < ender.length; i++) {
      for (let j = i + 1; j < ender.length; j++) {
        const a = ender[i]!,
          z = ender[j]!;
        // the two ends of one path close it, but only when it has an area to close
        if (a.b === z.b && arb[a.b]!.noder.length < 3) continue;
        const d = avst(pos(a), pos(z));
        if (d <= toleranse && (!best || d < best.d)) best = { a, z, d };
      }
    }
    if (!best) break;
    const { a, z, d } = best;
    const fra = pos(a),
      til = pos(z);
    if (a.b === z.b) {
      gap.push({ fra, til, avstand: d, type: 'lukk' });
      const bane = arb[a.b]!;
      bane.lukket = true;
      fjernDubletter(bane);
      finnGlatte(bane);
      lukket++;
      continue;
    }
    gap.push({ fra, til, avstand: d, type: 'koble' });
    // join: A ends where B starts (reverse either to make that so)
    let A = arb[a.b]!,
      B = arb[z.b]!;
    if (a.ende === 0) A = arb[reverserIndeks(arb, a.b)]!;
    if (z.ende === 1) B = arb[reverserIndeks(arb, z.b)]!;
    const sammen: Bane = { lukket: false, noder: [...A.noder, ...B.noder] };
    fjernDubletter(sammen);
    finnGlatte(sammen);
    arb = arb.filter((_, k) => k !== a.b && k !== z.b);
    arb.splice(Math.min(a.b, z.b), 0, sammen);
    koblet++;
  }
  if (tving) {
    arb = arb.flatMap((bane) => {
      if (bane.lukket) return [bane];
      if (bane.noder.length < 3) {
        fjernet++;
        return [];
      }
      bane.lukket = true;
      tvunget++;
      return [bane];
    });
  }
  return { baner: arb, gap, lukket, koblet, tvunget, fjernet };
}

/** Reverse path `b` in place and return its index (a helper for joining). */
function reverserIndeks(arb: Bane[], b: number): number {
  const bane = arb[b]!;
  bane.noder = bane.noder.reverse().map((n) => ({ ...n, inn: n.ut, ut: n.inn }));
  return b;
}

/** Number of paths that are not closed. */
export function antallAapne(baner: Bane[]): number {
  return baner.filter((b) => !b.lukket).length;
}
