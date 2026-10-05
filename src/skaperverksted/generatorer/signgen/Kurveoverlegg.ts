/**
 * What the canvas shows while the curves of a vector are edited or a path
 * is drawn with the pen: the paths, their points and handles, open paths
 * and what a repair would join.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Vec2 } from '../../core/geometri2d';
import { erKurve, kontrollpunkter, segmenter, type Bane } from '../../geometri/bane';
import type { Farger } from '../../render2d/Lerret';
import type { Visning } from '../../render2d/visning';
import { forhandsvisReparasjon, kurveObjekt, tilVerden } from './kurver';
import { signtilstand } from './tilstand';

let forhandsvisning: { objektId: string; baner: Bane[] } | null = null;

/** Curves shown instead of the vector's own while a point or handle is dragged (null clears). */
export function settForhandsvisning(benk: Arbeidsbenk, objektId: string | null, baner: Bane[] | null): void {
  forhandsvisning = objektId && baner ? { objektId, baner } : null;
  benk.kommando('tegn');
}

/** Many points: draw the unselected ones small so the vector stays readable. */
const MANGE = 500;

function token(navn: string, reserve: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(navn).trim() || reserve;
}

/** One path as a canvas path; `til` maps its own coordinates to the screen. */
function banesti(ctx: CanvasRenderingContext2D, bane: Bane, til: (p: Vec2) => Vec2): void {
  const n0 = bane.noder[0];
  if (!n0) return;
  const s0 = til(n0.p);
  ctx.moveTo(s0.x, s0.y);
  for (const [i, j] of segmenter(bane)) {
    const a = bane.noder[i]!,
      z = bane.noder[j]!;
    if (erKurve(a, z)) {
      const [, c1, c2, e] = kontrollpunkter(a, z);
      const p1 = til(c1),
        p2 = til(c2),
        pe = til(e);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, pe.x, pe.y);
    } else {
      const pe = til(z.p);
      ctx.lineTo(pe.x, pe.y);
    }
  }
  if (bane.lukket) ctx.closePath();
}

function punkt(ctx: CanvasRenderingContext2D, s: Vec2, glatt: boolean, valgt: boolean, f: Farger): void {
  ctx.beginPath();
  if (glatt) ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
  else ctx.rect(s.x - 4, s.y - 4, 8, 8);
  ctx.fillStyle = valgt ? f.lilla : f.tekst;
  ctx.fill();
  ctx.strokeStyle = valgt ? f.tekst : f.lilla;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function handtak(ctx: CanvasRenderingContext2D, a: Vec2, h: Vec2, f: Farger): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(h.x, h.y);
  ctx.strokeStyle = f.lilla;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(h.x, h.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = f.tekst;
  ctx.fill();
  ctx.stroke();
}

function tegnRedigering(ctx: CanvasRenderingContext2D, v: Visning, f: Farger, benk: Arbeidsbenk): void {
  const c = kurveObjekt(benk);
  if (!c) return;
  const til = (p: Vec2) => v.tilSkjerm(tilVerden(c.o, p));
  const fv = forhandsvisning?.objektId === c.o.id ? forhandsvisning : null;
  const baner = fv?.baner ?? c.baner;
  const advarsel = token('--advarsel-mork', '#f2b84b');
  const ok = token('--ok-mork', '#5fd18f');
  const heleBaner = new Set(c.k.baner);

  ctx.save();
  ctx.setLineDash([]);
  if (fv) {
    // the new shape as a light fill over the old one while dragging
    ctx.beginPath();
    for (const bane of baner) banesti(ctx, { ...bane, lukket: true }, til);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = f.cyan;
    ctx.fill(c.o.kilde.type === 'svg' && c.o.kilde.fyllregel === 'nonzero' ? 'nonzero' : 'evenodd');
    ctx.globalAlpha = 1;
  }
  baner.forEach((bane, b) => {
    ctx.beginPath();
    banesti(ctx, bane, til);
    if (bane.lukket) {
      ctx.strokeStyle = heleBaner.has(b) ? f.lilla : f.cyan;
      ctx.lineWidth = heleBaner.has(b) ? 2.5 : 1.5;
    } else {
      ctx.strokeStyle = advarsel;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // the selected curve piece
  if (c.k.segment) {
    const bane = baner[c.k.segment.bane];
    const par = bane && segmenter(bane)[c.k.segment.seg];
    if (bane && par) {
      const a = bane.noder[par[0]]!,
        z = bane.noder[par[1]]!;
      ctx.beginPath();
      const s = til(a.p);
      ctx.moveTo(s.x, s.y);
      if (erKurve(a, z)) {
        const [, c1, c2, e] = kontrollpunkter(a, z);
        const p1 = til(c1),
          p2 = til(c2),
          pe = til(e);
        ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, pe.x, pe.y);
      } else {
        const pe = til(z.p);
        ctx.lineTo(pe.x, pe.y);
      }
      ctx.strokeStyle = f.lilla;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
  }

  // the ends of open paths
  for (const bane of baner) {
    if (bane.lukket || bane.noder.length < 2) continue;
    for (const n of [bane.noder[0]!, bane.noder[bane.noder.length - 1]!]) {
      const s = til(n.p);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = advarsel;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // what a repair would join
  if (c.k.repVis) {
    for (const g of forhandsvisReparasjon(c).gap) {
      const a = til(g.fra),
        b = til(g.til);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = ok;
      ctx.lineWidth = 3;
      ctx.stroke();
      for (const p of [a, b]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = ok;
        ctx.fill();
      }
    }
  }

  // points and handles
  const antall = baner.reduce((s, b) => s + b.noder.length, 0);
  const valgt = (b: number, n: number) => c.k.noder.some((r) => r[0] === b && r[1] === n);
  baner.forEach((bane, b) =>
    bane.noder.forEach((nd, n) => {
      const sel = valgt(b, n);
      if (antall > MANGE && !sel) {
        const s = til(nd.p);
        ctx.fillStyle = f.cyan;
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        return;
      }
      punkt(ctx, til(nd.p), nd.glatt, sel, f);
    }),
  );
  const medHandtak = [...c.k.noder];
  if (c.k.segment) {
    const bane = baner[c.k.segment.bane];
    const par = bane && segmenter(bane)[c.k.segment.seg];
    if (par) medHandtak.push([c.k.segment.bane, par[0]], [c.k.segment.bane, par[1]]);
  }
  for (const [b, n] of medHandtak) {
    const nd = baner[b]?.noder[n];
    if (!nd) continue;
    const a = til(nd.p);
    for (const hv of [nd.inn, nd.ut]) {
      if (hv) handtak(ctx, a, til({ x: nd.p.x + hv.x, y: nd.p.y + hv.y }), f);
    }
    punkt(ctx, a, nd.glatt, valgt(b, n), f);
  }
  ctx.restore();
}

function tegnPenn(ctx: CanvasRenderingContext2D, v: Visning, f: Farger, benk: Arbeidsbenk): void {
  const u = signtilstand(benk).t.penn;
  const bane = u?.bane;
  if (!u || !bane || !bane.noder.length) return;
  const ok = token('--ok-mork', '#5fd18f');
  const til = (p: Vec2) => v.tilSkjerm(p);
  ctx.save();
  ctx.beginPath();
  banesti(ctx, bane, til);
  // the line from the last point to the pointer
  const siste = bane.noder[bane.noder.length - 1]!;
  if (u.peker) {
    const a = til(siste.p),
      p = til(u.peker);
    ctx.setLineDash([5, 4]);
    if (siste.ut) {
      const c1 = til({ x: siste.p.x + siste.ut.x, y: siste.p.y + siste.ut.y });
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(c1.x, c1.y, p.x, p.y, p.x, p.y);
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.strokeStyle = f.lilla;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  bane.noder.forEach((nd, i) => {
    const a = til(nd.p);
    for (const hv of [nd.inn, nd.ut]) {
      if (hv) handtak(ctx, a, til({ x: nd.p.x + hv.x, y: nd.p.y + hv.y }), f);
    }
    punkt(ctx, a, nd.glatt, i === bane.noder.length - 1, f);
  });
  // hint: clicking the first point closes the path
  if (bane.noder.length >= 3 && u.peker) {
    const a = til(bane.noder[0]!.p),
      p = til(u.peker);
    if (Math.hypot(a.x - p.x, a.y - p.y) < 9) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = ok;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function tegnKurver(ctx: CanvasRenderingContext2D, v: Visning, f: Farger, benk: Arbeidsbenk): void {
  const st = signtilstand(benk).t;
  if (st.kurve) tegnRedigering(ctx, v, f, benk);
  if (st.penn) tegnPenn(ctx, v, f, benk);
}
