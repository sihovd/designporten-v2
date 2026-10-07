/**
 * Width points of a Paint stroke, on the canvas (Sivert, 2026-10-06, §5):
 * click the stroke's spline to add a width point, drag the control across the
 * spline to make that part narrower or wider, double-click a point to take it
 * away. The outline is rebuilt from the width profile, so neither edge is
 * edited by hand.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { anvend, inverter, tilMatrise, type Vec2 } from '../../core/geometri2d';
import type { Objekt } from '../../core/dokument';
import {
  MAKS_BREDDEFAKTOR,
  breddefaktor,
  ryddBreddepunkter,
  senterlinje,
  type Senterpunkt,
  type Strek,
} from '../../geometri/strek';
import type { Farger } from '../../render2d/Lerret';
import type { Visning } from '../../render2d/visning';
import { redigerbare, valgte } from './handlinger';
import { endreStrek } from './paint';
import { signtilstand } from './tilstand';

export const MAKS_BREDDEPUNKTER = 8;

export interface Breddehandtak {
  indeks: number;
  t: number;
  /** The point on the spline, in sign coordinates. */
  senter: Vec2;
  /** The control: where the stroke's edge is (before taper), in sign coordinates. */
  kant: Vec2;
}

export interface Strekvisning {
  o: Objekt;
  strek: Strek;
  /** The spline as dense points in sign coordinates. */
  linje: { p: Vec2; t: number }[];
  handtak: Breddehandtak[];
}

/** The one selected, editable Paint stroke (nothing else selected), if any. */
export function valgtStrek(benk: Arbeidsbenk): { o: Objekt; strek: Strek } | null {
  if (signtilstand(benk).t.kurve) return null;
  const v = valgte(benk);
  if (v.length !== 1 || redigerbare(benk).length !== 1) return null;
  const o = v[0]!;
  return o.kilde.type === 'svg' && o.kilde.strek ? { o, strek: o.kilde.strek } : null;
}

function normalVed(s: Senterpunkt[], i: number): Vec2 {
  const a = s[Math.max(0, i - 2)]!.p,
    b = s[Math.min(s.length - 1, i + 2)]!.p;
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
}

/** The spline and a control for every width point of the selected stroke. */
export function strekvisning(benk: Arbeidsbenk): Strekvisning | null {
  const v = valgtStrek(benk);
  if (!v) return null;
  const m = tilMatrise(v.o.transform);
  const lokal = senterlinje(v.strek, 0.8);
  if (lokal.length < 2) return null;
  const handtak: Breddehandtak[] = v.strek.breddepunkter.map((bp, indeks) => {
    let i = lokal.findIndex((x) => x.t >= bp.t);
    if (i < 0) i = lokal.length - 1;
    const a = lokal[Math.max(0, i - 1)]!,
      b = lokal[i]!;
    const u = b.t > a.t ? (bp.t - a.t) / (b.t - a.t) : 0;
    const p = { x: a.p.x + (b.p.x - a.p.x) * u, y: a.p.y + (b.p.y - a.p.y) * u };
    const n = normalVed(lokal, i);
    const halv = (v.strek.bredde * bp.v) / 2;
    return {
      indeks,
      t: bp.t,
      senter: anvend(m, p),
      kant: anvend(m, { x: p.x + n.x * halv, y: p.y + n.y * halv }),
    };
  });
  return { ...v, linje: lokal.map((x) => ({ p: anvend(m, x.p), t: x.t })), handtak };
}

/** The control under a point (model coordinates, `tol` in mm), if any. */
export function treffBreddehandtak(sv: Strekvisning, p: Vec2, tol: number): number | null {
  let best: number | null = null;
  let bestD = tol;
  for (const h of sv.handtak) {
    const d = Math.min(
      Math.hypot(h.kant.x - p.x, h.kant.y - p.y),
      Math.hypot(h.senter.x - p.x, h.senter.y - p.y),
    );
    if (d <= bestD) {
      best = h.indeks;
      bestD = d;
    }
  }
  return best;
}

/** The position along the stroke (0 to 1) of the spline point nearest `p`, if it lies within `tol` mm. */
export function treffSenterlinje(sv: Strekvisning, p: Vec2, tol: number): number | null {
  let best: number | null = null;
  let bestD = tol;
  for (const x of sv.linje) {
    const d = Math.hypot(x.p.x - p.x, x.p.y - p.y);
    if (d <= bestD) {
      best = x.t;
      bestD = d;
    }
  }
  return best;
}

/** Add a width point at `t` that keeps the width the profile has there. Returns its index, or null when full. */
export function leggTilBreddepunkt(benk: Arbeidsbenk, id: string, t: number): number | null {
  const o = benk.dok.objekter[id];
  if (!o || o.kilde.type !== 'svg' || !o.kilde.strek) return null;
  const f = o.kilde.strek.breddepunkter;
  if (f.length >= MAKS_BREDDEPUNKTER) {
    benk.melde(`Streken har allerede ${MAKS_BREDDEPUNKTER} breddepunkter.`);
    return null;
  }
  const tt = Math.min(0.98, Math.max(0.02, t));
  if (f.some((p) => Math.abs(p.t - tt) < 0.03)) return null;
  const neste = ryddBreddepunkter([...f, { t: tt, v: breddefaktor(f, tt) }]);
  endreStrek(benk, id, 'Nytt breddepunkt', (s) => ({ ...s, breddepunkter: neste }));
  return neste.findIndex((p) => p.t === tt);
}

export function fjernBreddepunkt(benk: Arbeidsbenk, id: string, indeks: number): void {
  endreStrek(benk, id, 'Fjern breddepunkt', (s) => {
    if (indeks <= 0 || indeks >= s.breddepunkter.length - 1) return s;
    return { ...s, breddepunkter: s.breddepunkter.filter((_, i) => i !== indeks) };
  });
}

/** Drag a width control: the width at that point is the pointer's distance from the spline, both sides. */
export function settBreddeVed(benk: Arbeidsbenk, id: string, indeks: number, modell: Vec2): void {
  const o = benk.dok.objekter[id];
  if (!o || o.kilde.type !== 'svg' || !o.kilde.strek) return;
  const strek = o.kilde.strek;
  const bp = strek.breddepunkter[indeks];
  if (!bp) return;
  const lokal = senterlinje(strek, 0.8);
  let i = lokal.findIndex((x) => x.t >= bp.t);
  if (i < 0) i = lokal.length - 1;
  const a = lokal[Math.max(0, i - 1)]!,
    b = lokal[i]!;
  const u = b.t > a.t ? (bp.t - a.t) / (b.t - a.t) : 0;
  const c = { x: a.p.x + (b.p.x - a.p.x) * u, y: a.p.y + (b.p.y - a.p.y) * u };
  const n = normalVed(lokal, i);
  const p = anvend(inverter(tilMatrise(o.transform)), modell);
  const avstand = Math.abs((p.x - c.x) * n.x + (p.y - c.y) * n.y);
  const v = Math.min(MAKS_BREDDEFAKTOR, Math.max(0, Math.round(((2 * avstand) / strek.bredde) * 100) / 100));
  if (v === bp.v) return;
  endreStrek(
    benk,
    id,
    'Endre breddepunkt',
    (s) => ({ ...s, breddepunkter: s.breddepunkter.map((q, j) => (j === indeks ? { ...q, v } : q)) }),
    'breddepunkt-dra',
  );
}

/** Draw the spline and the width controls of the selected stroke. */
export function tegnBreddehandtak(
  ctx: CanvasRenderingContext2D,
  v: Visning,
  f: Farger,
  benk: Arbeidsbenk,
): void {
  const sv = strekvisning(benk);
  if (!sv) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = f.cyan;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  sv.linje.forEach((x, i) => {
    const s = v.tilSkjerm(x.p);
    if (i) ctx.lineTo(s.x, s.y);
    else ctx.moveTo(s.x, s.y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const h of sv.handtak) {
    const a = v.tilSkjerm(h.senter),
      b = v.tilSkjerm(h.kant);
    // the control across the spline: from the far edge, through the spline, to the near edge
    const motsatt = { x: 2 * a.x - b.x, y: 2 * a.y - b.y };
    ctx.strokeStyle = f.tekst;
    ctx.beginPath();
    ctx.moveTo(motsatt.x, motsatt.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = f.cyan;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = f.lilla;
    ctx.fill();
    ctx.strokeStyle = f.tekst;
    ctx.stroke();
  }
  ctx.restore();
}
