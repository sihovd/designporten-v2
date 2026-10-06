/**
 * SVG path data ("d" attribute) → closed rings in the path's own
 * coordinates. Supports M L H V C S Q T A Z, absolute and relative.
 * Curves are flattened to line segments with a chord tolerance in the
 * path's units. Open subpaths are closed (fill semantics, as in SVG).
 */
import type { Ring } from './polygon';
import type { Vec2 } from '../core/geometri2d';

export class StiFeil extends Error {}

const TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

export function tokeniser(d: string): (string | number)[] {
  const ut: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) ut.push(m[1] ?? Number(m[2]));
  return ut;
}

/** Number of segments for a curve of approximate length `lengde`. */
function segmenter(lengde: number, toleranse: number): number {
  return Math.max(2, Math.min(64, Math.ceil(Math.sqrt(lengde / Math.max(toleranse, 1e-6)) * 0.9)));
}

function kubisk(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, s: number): Vec2 {
  const m = 1 - s;
  const a = m * m * m,
    b = 3 * m * m * s,
    c = 3 * m * s * s,
    d = s * s * s;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function kvadratisk(p0: Vec2, p1: Vec2, p2: Vec2, s: number): Vec2 {
  const m = 1 - s;
  return {
    x: m * m * p0.x + 2 * m * s * p1.x + s * s * p2.x,
    y: m * m * p0.y + 2 * m * s * p1.y + s * s * p2.y,
  };
}

const len = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);

export function flatKubisk(ring: Ring, p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, toleranse: number): void {
  const n = segmenter(len(p0, p1) + len(p1, p2) + len(p2, p3), toleranse);
  for (let k = 1; k <= n; k++) ring.push(kubisk(p0, p1, p2, p3, k / n));
}

export function flatKvadratisk(ring: Ring, p0: Vec2, p1: Vec2, p2: Vec2, toleranse: number): void {
  const n = segmenter(len(p0, p1) + len(p1, p2), toleranse);
  for (let k = 1; k <= n; k++) ring.push(kvadratisk(p0, p1, p2, k / n));
}

/** SVG elliptical arc (endpoint parameterisation, SVG spec F.6.5). */
function flatBue(
  ring: Ring,
  p0: Vec2,
  rx: number,
  ry: number,
  rotGrader: number,
  storBue: boolean,
  medSol: boolean,
  p1: Vec2,
  toleranse: number,
): void {
  if (rx === 0 || ry === 0) {
    ring.push(p1);
    return;
  }
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
  const n = segmenter(Math.abs(dt) * Math.max(rx, ry) * 2, toleranse);
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    const ex = rx * Math.cos(t),
      ey = ry * Math.sin(t);
    ring.push(i === n ? p1 : { x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
}

/**
 * Parse path data into rings. Throws StiFeil on malformed data.
 * `toleranse` is the flattening tolerance in path units.
 */
export function stiTilRinger(d: string, toleranse = 0.05): Ring[] {
  const t = tokeniser(d);
  const ringer: Ring[] = [];
  let ring: Ring | null = null;
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
  const avslutt = () => {
    if (ring && ring.length >= 3) ringer.push(ring);
    ring = null;
  };
  const sikreRing = () => {
    if (!ring) ring = [{ ...p }];
    return ring;
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
        avslutt();
        p = { x: o.x + tall(), y: o.y + tall() };
        start = p;
        ring = [{ ...p }];
        // subsequent pairs are implicit lineto
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        p = { x: o.x + tall(), y: o.y + tall() };
        sikreRing().push(p);
        break;
      case 'H':
        p = { x: (rel ? p.x : 0) + tall(), y: p.y };
        sikreRing().push(p);
        break;
      case 'V':
        p = { x: p.x, y: (rel ? p.y : 0) + tall() };
        sikreRing().push(p);
        break;
      case 'C': {
        const c1 = { x: o.x + tall(), y: o.y + tall() };
        const c2 = { x: o.x + tall(), y: o.y + tall() };
        const e = { x: o.x + tall(), y: o.y + tall() };
        flatKubisk(sikreRing(), p, c1, c2, e, toleranse);
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
        flatKubisk(sikreRing(), p, c1, c2, e, toleranse);
        kontroll = c2;
        p = e;
        break;
      }
      case 'Q': {
        const c = { x: o.x + tall(), y: o.y + tall() };
        const e = { x: o.x + tall(), y: o.y + tall() };
        flatKvadratisk(sikreRing(), p, c, e, toleranse);
        kontroll = c;
        p = e;
        break;
      }
      case 'T': {
        const c: Vec2 =
          sisteKontroll && (sisteType === 'Q' || sisteType === 'T')
            ? { x: 2 * p.x - sisteKontroll.x, y: 2 * p.y - sisteKontroll.y }
            : p;
        const e = { x: o.x + tall(), y: o.y + tall() };
        flatKvadratisk(sikreRing(), p, c, e, toleranse);
        kontroll = c;
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
        flatBue(sikreRing(), p, rx, ry, rot, stor, sol, e, toleranse);
        p = e;
        break;
      }
      case 'Z':
        avslutt();
        p = start;
        break;
      default:
        throw new StiFeil(`Ukjent stikommando «${cmd}».`);
    }
    sisteKontroll = kontroll;
    sisteType = C;
  }
  avslutt();
  // drop closing duplicates
  for (const r of ringer) {
    const a = r[0]!,
      b = r[r.length - 1]!;
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) r.pop();
  }
  return ringer.filter((r) => r.length >= 3);
}
