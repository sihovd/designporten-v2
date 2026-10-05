/**
 * Picking on the Signgen canvas: which object lies under a point, and where
 * a point snaps to. Shared by the select tool, the curve editor and the pen.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { objekterILag, type Objekt } from '../../core/dokument';
import type { Vec2 } from '../../core/geometri2d';
import { rutenettnivaa, snapTil } from '../../core/rutenett';
import type { Region } from '../../geometri/polygon';
import type { Visning } from '../../render2d/visning';
import { verdensBoks, verdensRegion } from './modell';

export function iRegion(p: Vec2, r: Region): boolean {
  let inne = false;
  for (const f of r) {
    for (const ring of [f.ytre, ...f.hull]) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!,
          b = ring[j]!;
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inne = !inne;
      }
    }
  }
  return inne;
}

/** Topmost selectable object under a model point. */
export function treff(benk: Arbeidsbenk, p: Vec2, toleranseMm: number): Objekt | null {
  const d = benk.dok;
  for (const lag of [...d.lag].reverse()) {
    if (!lag.synlig || lag.last) continue;
    const obj = objekterILag(d, lag.id).reverse();
    for (const o of obj) {
      if (!o.synlig || o.last) continue;
      const r = verdensRegion(o);
      if (r && iRegion(p, r)) return o;
    }
    // near-miss on thin shapes: accept the box when zoomed out
    for (const o of obj) {
      if (!o.synlig || o.last) continue;
      const b = verdensBoks(o);
      if (b.maksX - b.minX < toleranseMm * 3 || b.maksY - b.minY < toleranseMm * 3) {
        if (
          p.x > b.minX - toleranseMm &&
          p.x < b.maksX + toleranseMm &&
          p.y > b.minY - toleranseMm &&
          p.y < b.maksY + toleranseMm
        )
          return o;
      }
    }
  }
  return null;
}

export function snapPunkt(
  benk: Arbeidsbenk,
  p: Vec2,
  v: Visning,
  deaktivert: boolean,
  utelatId?: string,
): Vec2 {
  if (deaktivert || !benk.tilstand.innstillinger.snap) return p;
  const terskel = 8 / v.pxPerMm;
  let best: Vec2 | null = null;
  let bestD = terskel;
  const kandidater: Vec2[] = [{ x: 0, y: 0 }];
  for (const o of Object.values(benk.dok.objekter)) {
    if (!o.synlig || o.id === utelatId) continue;
    const b = verdensBoks(o);
    const cx = (b.minX + b.maksX) / 2,
      cy = (b.minY + b.maksY) / 2;
    kandidater.push(
      { x: b.minX, y: b.minY },
      { x: b.maksX, y: b.minY },
      { x: b.maksX, y: b.maksY },
      { x: b.minX, y: b.maksY },
      { x: cx, y: cy },
      { x: cx, y: b.minY },
      { x: cx, y: b.maksY },
      { x: b.minX, y: cy },
      { x: b.maksX, y: cy },
    );
  }
  for (const k of kandidater) {
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  if (best) return best;
  const steg = Math.max(0.1, rutenettnivaa(v.pxPerMm).liten);
  return { x: snapTil(p.x, steg), y: snapTil(p.y, steg) };
}
