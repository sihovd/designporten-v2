/**
 * The centre line of a Paint stroke as editable points (Sivert, 2026-10-08, §3): move the points of the
 * line the stroke follows, add and remove points, and the width points, taper and look are kept because
 * the outline is rebuilt from the source. The points have the same gestures as the points of an
 * ordinary vector: drag to move, Delete to remove, the add and remove icons in the context bar.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { anvend, inverter, tilMatrise, type Vec2 } from '../../core/geometri2d';
import type { Objekt } from '../../core/dokument';
import type { Strek } from '../../geometri/strek';
import { arbeidsomraade } from '../../render2d/visning';
import { endreStrek } from './paint';
import { signtilstand } from './tilstand';
import type { Strekvisning } from './Strekverktoy';

export const MIN_STREKPUNKTER = 2;
export const MAKS_STREKPUNKTER = 60;

/** The selected centre-line point, if it still exists on that stroke. */
export function valgtStrekpunkt(benk: Arbeidsbenk): { id: string; indeks: number } | null {
  const v = signtilstand(benk).t.strekPunkt;
  const o = v && benk.dok.objekter[v.id];
  if (!v || !o || o.kilde.type !== 'svg' || !o.kilde.strek) return null;
  return v.indeks < o.kilde.strek.punkter.length ? v : null;
}

/** The control points of the stroke in sign coordinates. */
export function strekpunkterIVerden(o: Objekt, strek: Strek): Vec2[] {
  const m = tilMatrise(o.transform);
  return strek.punkter.map((p) => anvend(m, p));
}

/** The centre-line point under a position (sign coordinates, `tol` in mm), the nearest one. */
export function treffStrekpunkt(sv: Strekvisning, p: Vec2, tol: number): number | null {
  let best: number | null = null;
  let bestD = tol;
  strekpunkterIVerden(sv.o, sv.strek).forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Move one centre-line point to a position in sign coordinates; one drag is one undo step. */
export function flyttStrekpunkt(benk: Arbeidsbenk, id: string, indeks: number, modell: Vec2): void {
  const o = benk.dok.objekter[id];
  if (!o || o.kilde.type !== 'svg' || !o.kilde.strek || !o.kilde.strek.punkter[indeks]) return;
  // a point cannot be dragged off the table (Sivert, 2026-10-16)
  const rom = arbeidsomraade(benk.dok.plate);
  const innenfor = {
    x: Math.min(rom.maksX, Math.max(rom.minX, modell.x)),
    y: Math.min(rom.maksY, Math.max(rom.minY, modell.y)),
  };
  const lokal = anvend(inverter(tilMatrise(o.transform)), innenfor);
  const naa = o.kilde.strek.punkter[indeks]!;
  if (Math.abs(naa.x - lokal.x) < 1e-6 && Math.abs(naa.y - lokal.y) < 1e-6) return;
  endreStrek(
    benk,
    id,
    'Flytt punkt på strek',
    (s) => ({ ...s, punkter: s.punkter.map((q, i) => (i === indeks ? lokal : q)) }),
    'strekpunkt-dra',
  );
}

/** Where a new point goes: on the segment nearest `p` (local coordinates), or the middle of the longest. */
function innsettingssted(punkter: Vec2[], p: Vec2 | null): { etter: number; pos: Vec2 } {
  let etter = 0;
  let pos: Vec2 = punkter[0]!;
  let best = Infinity;
  for (let i = 0; i < punkter.length - 1; i++) {
    const a = punkter[i]!,
      b = punkter[i + 1]!;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    // with a position: the nearest point on the segment; without: the middle (the longest segment wins)
    const u = p && l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0.5;
    const q = { x: a.x + dx * u, y: a.y + dy * u };
    const mal = p ? Math.hypot(p.x - q.x, p.y - q.y) : -Math.sqrt(l2);
    if (mal < best) [best, etter, pos] = [mal, i, q];
  }
  return { etter, pos };
}

/**
 * Add a centre-line point on the segment nearest `modell` (sign coordinates), or in the middle of the
 * longest segment when no position is given. Returns the new point's index, or null when the stroke is full.
 */
export function leggTilStrekpunkt(benk: Arbeidsbenk, id: string, modell: Vec2 | null): number | null {
  const o = benk.dok.objekter[id];
  if (!o || o.kilde.type !== 'svg' || !o.kilde.strek) return null;
  if (o.kilde.strek.punkter.length >= MAKS_STREKPUNKTER) {
    benk.melde(`Streken har allerede ${MAKS_STREKPUNKTER} punkter.`);
    return null;
  }
  const lokal = modell ? anvend(inverter(tilMatrise(o.transform)), modell) : null;
  const sted = innsettingssted(o.kilde.strek.punkter, lokal);
  endreStrek(benk, id, 'Nytt punkt på strek', (s) => ({
    ...s,
    punkter: [...s.punkter.slice(0, sted.etter + 1), sted.pos, ...s.punkter.slice(sted.etter + 1)],
  }));
  signtilstand(benk).sett({ strekPunkt: { id, indeks: sted.etter + 1 } });
  return sted.etter + 1;
}

/** Remove one centre-line point; a stroke keeps at least two. */
export function fjernStrekpunkt(benk: Arbeidsbenk, id: string, indeks: number): boolean {
  const o = benk.dok.objekter[id];
  if (!o || o.kilde.type !== 'svg' || !o.kilde.strek) return false;
  if (o.kilde.strek.punkter.length <= MIN_STREKPUNKTER) {
    benk.melde('En strek trenger minst to punkter.');
    return false;
  }
  endreStrek(benk, id, 'Fjern punkt på strek', (s) => ({
    ...s,
    punkter: s.punkter.filter((_, i) => i !== indeks),
  }));
  signtilstand(benk).sett({ strekPunkt: null });
  return true;
}
