/**
 * Signgen's 2D workspace: the sign seen from above in its real colours,
 * with selection handles, snapping guides, measurements and the drawing
 * tools. Built on the shared Lerret (grid, rulers, pan/zoom).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, objekterILag, type Objekt } from '../../core/dokument';
import { anvend, inverter, tilMatrise, type Boks, type Transform2D, type Vec2 } from '../../core/geometri2d';
import { finnMateriale } from '../../core/materialer';
import { rutenettnivaa, snapTil } from '../../core/rutenett';
import { mm, tall } from '../../core/enheter';
import type { Region } from '../../geometri/polygon';
import { Lerret, type Farger, type Verktoyhandler } from '../../render2d/Lerret';
import { lagVisning, type Visning } from '../../render2d/visning';
import { brukBenk } from '../../shell/bruk-benk';
import { nyForm, nyTekst, oppdaterObjekter } from './dokument';
import {
  hjorner,
  innholdsboks,
  lagRegion,
  lokalGeometri,
  nårFontLastes,
  verdensBoks,
  verdensRegion,
} from './modell';
import { signtilstand, brukSigntilstand, type Hjelpelinje, type VerktoyId } from './tilstand';
import { dupliserValgte, leggTil, redigerbare, slettValgte, utvalgsboks, valgte } from './handlinger';

// ---------- drawing ----------

function sti(ctx: CanvasRenderingContext2D, v: Visning, region: Region) {
  ctx.beginPath();
  for (const f of region) {
    for (const r of [f.ytre, ...f.hull]) {
      r.forEach((p, i) => {
        const s = v.tilSkjerm(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
    }
  }
}

function etikett(ctx: CanvasRenderingContext2D, f: Farger, s: Vec2, tekst: string) {
  ctx.font = `11px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace'}`;
  const b = ctx.measureText(tekst).width + 10;
  ctx.fillStyle = f.cyan;
  ctx.fillRect(s.x, s.y, b, 18);
  ctx.fillStyle = f.bakgrunn;
  ctx.textBaseline = 'middle';
  ctx.fillText(tekst, s.x + 5, s.y + 9);
}

const HANDTAK = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
] as const;

/** Handle positions (world) for one object or a group box. */
function handtakFor(
  benk: Arbeidsbenk,
): { punkter: Vec2[]; roter: Vec2 | null; senter: Vec2; enkelt: Objekt | null } | null {
  const obj = valgte(benk);
  if (!obj.length) return null;
  if (obj.length === 1) {
    const o = obj[0]!;
    const g = lokalGeometri(o.kilde);
    if (!g) return null;
    const m = tilMatrise(o.transform);
    const b = g.boks;
    const cx = (b.minX + b.maksX) / 2,
      cy = (b.minY + b.maksY) / 2;
    const hx = (b.maksX - b.minX) / 2,
      hy = (b.maksY - b.minY) / 2;
    const punkter = HANDTAK.map(([x, y]) => anvend(m, { x: cx + x * hx, y: cy + y * hy }));
    return {
      punkter,
      roter: anvend(m, { x: cx, y: b.maksY }),
      senter: anvend(m, { x: cx, y: cy }),
      enkelt: o,
    };
  }
  const b = utvalgsboks(obj)!;
  const cx = (b.minX + b.maksX) / 2,
    cy = (b.minY + b.maksY) / 2;
  const hx = (b.maksX - b.minX) / 2,
    hy = (b.maksY - b.minY) / 2;
  return {
    punkter: HANDTAK.map(([x, y]) => ({ x: cx + x * hx, y: cy + y * hy })),
    roter: null,
    senter: { x: cx, y: cy },
    enkelt: null,
  };
}

const ROTER_AVSTAND = 26; // px above the top edge

function roterPunktSkjerm(v: Visning, h: NonNullable<ReturnType<typeof handtakFor>>): Vec2 | null {
  if (!h.roter) return null;
  const topp = v.tilSkjerm(h.roter);
  const senter = v.tilSkjerm(h.senter);
  const dx = topp.x - senter.x,
    dy = topp.y - senter.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: topp.x + (dx / l) * ROTER_AVSTAND, y: topp.y + (dy / l) * ROTER_AVSTAND };
}

export function tegnSign(ctx: CanvasRenderingContext2D, v: Visning, f: Farger, benk: Arbeidsbenk): void {
  const d = benk.dok;
  const st = signtilstand(benk).t;
  const aktivt = benk.tilstand.utvalg.lag;
  const valgt = new Set(benk.tilstand.utvalg.objekter);

  // layers bottom to top in their material colours: the sign seen from above
  for (const lag of d.lag) {
    if (!lag.synlig) continue;
    const region = lagRegion(d, lag.id);
    if (!region) continue;
    sti(ctx, v, region);
    ctx.fillStyle = finnMateriale(lag.materialId).hex;
    ctx.fill('evenodd');
    ctx.strokeStyle = f.bakgrunn;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // object outlines: the active layer's objects, and all cutting objects
  ctx.lineWidth = 1;
  for (const o of Object.values(d.objekter)) {
    if (!o.synlig) continue;
    const kutt = o.operasjon === 'trekk-fra';
    if (o.lagId !== aktivt && !kutt && !valgt.has(o.id)) continue;
    const r = verdensRegion(o);
    if (!r) continue;
    sti(ctx, v, r);
    ctx.setLineDash(kutt ? [4, 3] : [2, 3]);
    ctx.strokeStyle = kutt ? f.cyan : f.dempet;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // selection
  for (const o of valgte(benk)) {
    const h = hjorner(o).map(v.tilSkjerm);
    ctx.beginPath();
    h.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = f.lilla;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const h = handtakFor(benk);
  if (h && redigerbare(benk).length === valgte(benk).length) {
    if (!h.enkelt) {
      const [a, , c] = [h.punkter[0]!, h.punkter[2]!, h.punkter[4]!].map(v.tilSkjerm) as [Vec2, Vec2, Vec2];
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = f.lilla;
      ctx.strokeRect(a.x, c.y, c.x - a.x, a.y - c.y);
      ctx.setLineDash([]);
    }
    const r = roterPunktSkjerm(v, h);
    if (r) {
      const topp = v.tilSkjerm(h.roter!);
      ctx.beginPath();
      ctx.moveTo(topp.x, topp.y);
      ctx.lineTo(r.x, r.y);
      ctx.strokeStyle = f.lilla;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r.x, r.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = f.tekst;
      ctx.fill();
      ctx.stroke();
    }
    h.punkter.forEach((p, i) => {
      if (!h.enkelt && i % 2 === 1) return; // groups scale from corners only
      const s = v.tilSkjerm(p);
      ctx.fillStyle = f.tekst;
      ctx.strokeStyle = f.lilla;
      ctx.lineWidth = 1.5;
      ctx.fillRect(s.x - 4.5, s.y - 4.5, 9, 9);
      ctx.strokeRect(s.x - 4.5, s.y - 4.5, 9, 9);
    });
  }

  // guides
  ctx.strokeStyle = f.cyan;
  ctx.lineWidth = 1;
  for (const g of st.hjelpelinjer) {
    ctx.beginPath();
    if (g.akse === 'x') {
      const a = v.tilSkjerm({ x: g.verdi, y: g.fra });
      const b = v.tilSkjerm({ x: g.verdi, y: g.til });
      ctx.moveTo(Math.round(a.x) + 0.5, a.y);
      ctx.lineTo(Math.round(b.x) + 0.5, b.y);
    } else {
      const a = v.tilSkjerm({ x: g.fra, y: g.verdi });
      const b = v.tilSkjerm({ x: g.til, y: g.verdi });
      ctx.moveTo(a.x, Math.round(a.y) + 0.5);
      ctx.lineTo(b.x, Math.round(b.y) + 0.5);
    }
    ctx.stroke();
  }
  if (st.markering) {
    const a = v.tilSkjerm({ x: st.markering.minX, y: st.markering.maksY });
    const b = v.tilSkjerm({ x: st.markering.maksX, y: st.markering.minY });
    ctx.fillStyle = f.cyan;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.globalAlpha = 1;
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
  }
  if (st.utkast) {
    const a = v.tilSkjerm({ x: st.utkast.minX, y: st.utkast.maksY });
    const b = v.tilSkjerm({ x: st.utkast.maksX, y: st.utkast.minY });
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
  }
  if (st.maling) {
    const a = v.tilSkjerm(st.maling.a);
    const b = v.tilSkjerm(st.maling.b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = f.cyan;
      ctx.fill();
    }
    const dx = st.maling.b.x - st.maling.a.x,
      dy = st.maling.b.y - st.maling.a.y;
    etikett(
      ctx,
      f,
      { x: (a.x + b.x) / 2 + 8, y: (a.y + b.y) / 2 + 8 },
      `${mm(Math.hypot(dx, dy))}  (Δx ${tall(dx)}, Δy ${tall(dy)})`,
    );
  }
  if (st.maletikett) {
    const s = v.tilSkjerm(st.maletikett.p);
    etikett(ctx, f, { x: s.x + 12, y: s.y + 12 }, st.maletikett.tekst);
  }
}

// ---------- hit testing ----------

function iRegion(p: Vec2, r: Region): boolean {
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

// ---------- snapping ----------

interface Snapresultat {
  dx: number;
  dy: number;
  linjer: Hjelpelinje[];
}

function snapBoks(
  benk: Arbeidsbenk,
  b: Boks,
  utelat: Set<string>,
  v: Visning,
  deaktivert: boolean,
): Snapresultat {
  if (deaktivert || !benk.tilstand.innstillinger.snap) return { dx: 0, dy: 0, linjer: [] };
  const terskel = 7 / v.pxPerMm;
  const andre = Object.values(benk.dok.objekter)
    .filter((o) => o.synlig && !utelat.has(o.id))
    .map(verdensBoks);
  const plate: Boks = { minX: 0, maksX: 0, minY: 0, maksY: 0 };
  const mine = {
    x: [b.minX, (b.minX + b.maksX) / 2, b.maksX],
    y: [b.minY, (b.minY + b.maksY) / 2, b.maksY],
  };
  const res: Snapresultat = { dx: 0, dy: 0, linjer: [] };
  for (const akse of ['x', 'y'] as const) {
    let best: { d: number; mal: Boks; verdi: number } | null = null;
    for (const m of [plate, ...andre]) {
      const deres =
        akse === 'x' ? [m.minX, (m.minX + m.maksX) / 2, m.maksX] : [m.minY, (m.minY + m.maksY) / 2, m.maksY];
      for (const a of mine[akse]) {
        for (const t of deres) {
          const d = t - a;
          if (Math.abs(d) <= terskel && (!best || Math.abs(d) < Math.abs(best.d)))
            best = { d, mal: m, verdi: t };
        }
      }
    }
    if (best) {
      if (akse === 'x') res.dx = best.d;
      else res.dy = best.d;
      const [fra, til] =
        akse === 'x'
          ? [Math.min(b.minY, best.mal.minY), Math.max(b.maksY, best.mal.maksY)]
          : [Math.min(b.minX, best.mal.minX), Math.max(b.maksX, best.mal.maksX)];
      const pad = 6 / v.pxPerMm;
      res.linjer.push({ akse, verdi: best.verdi, fra: fra - pad, til: til + pad });
    } else {
      // grid: put the leading edge on the minor grid
      const steg = Math.max(0.1, rutenettnivaa(v.pxPerMm).liten);
      const a = mine[akse][0]!;
      const d = snapTil(a, steg) - a;
      if (akse === 'x') res.dx = d;
      else res.dy = d;
    }
  }
  return res;
}

function snapPunkt(benk: Arbeidsbenk, p: Vec2, v: Visning, deaktivert: boolean): Vec2 {
  if (deaktivert || !benk.tilstand.innstillinger.snap) return p;
  const terskel = 8 / v.pxPerMm;
  let best: Vec2 | null = null;
  let bestD = terskel;
  const kandidater: Vec2[] = [{ x: 0, y: 0 }];
  for (const o of Object.values(benk.dok.objekter)) {
    if (!o.synlig) continue;
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

// ---------- tools ----------

type Drag =
  | { type: 'flytt'; start: Vec2; orig: Map<string, Transform2D>; boks: Boks; flyttet: boolean }
  | { type: 'skaler'; indeks: number; orig: Map<string, Objekt>; start: Vec2 }
  | { type: 'roter'; orig: Objekt; senter: Vec2; start: number }
  | { type: 'marker'; start: Vec2; legg: boolean; for: string[] }
  | { type: 'utkast'; start: Vec2 }
  | { type: 'maal'; a: Vec2 };

function skalerEnkelt(o: Objekt, indeks: number, p: Vec2, proporsjonal: boolean): Objekt {
  const g = lokalGeometri(o.kilde)!;
  const b = g.boks;
  const [hx, hy] = HANDTAK[indeks]!;
  const cx = (b.minX + b.maksX) / 2,
    cy = (b.minY + b.maksY) / 2;
  const halvB = (b.maksX - b.minX) / 2 || 1,
    halvH = (b.maksY - b.minY) / 2 || 1;
  const anker = { x: cx - hx * halvB, y: cy - hy * halvH };
  const handtak = { x: cx + hx * halvB, y: cy + hy * halvH };
  const m0 = tilMatrise(o.transform);
  const lokal = anvend(inverter(m0), p);
  let sx = hx ? (lokal.x - anker.x) / (handtak.x - anker.x) : 1;
  let sy = hy ? (lokal.y - anker.y) / (handtak.y - anker.y) : 1;
  if (proporsjonal && hx && hy) {
    const s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
    sx = sy = s;
  }
  sx = Math.max(0.02, sx);
  sy = Math.max(0.02, sy);
  const verdensAnker = anvend(m0, anker);
  let ny: Objekt;
  let nyttAnker = anker;
  if (o.kilde.type === 'form') {
    ny = {
      ...o,
      kilde: {
        ...o.kilde,
        bredde: Math.max(0.2, o.kilde.bredde * sx),
        hoyde: Math.max(0.2, o.kilde.hoyde * sy),
      },
    };
    nyttAnker = { x: anker.x * sx, y: anker.y * sy };
  } else {
    ny = {
      ...o,
      transform: { ...o.transform, skalaX: o.transform.skalaX * sx, skalaY: o.transform.skalaY * sy },
    };
  }
  const m1 = tilMatrise({ ...ny.transform, x: 0, y: 0 });
  const a1 = anvend(m1, nyttAnker);
  return { ...ny, transform: { ...ny.transform, x: verdensAnker.x - a1.x, y: verdensAnker.y - a1.y } };
}

function lagVerktoy(benk: Arbeidsbenk, id: VerktoyId): Verktoyhandler | null {
  const lager = signtilstand(benk);
  let drag: Drag | null = null;

  if (id === 'panorer') return { markor: 'grab' };

  if (id === 'velg') {
    return {
      markor: 'default',
      ned({ modell, skjerm, e, visning: v }) {
        const tol = (e.pointerType === 'touch' ? 14 : 8) / v.pxPerMm;
        const h = handtakFor(benk);
        const kanEndre = redigerbare(benk).length === valgte(benk).length;
        if (h && kanEndre) {
          const r = roterPunktSkjerm(v, h);
          if (
            r &&
            h.enkelt &&
            Math.hypot(r.x - skjerm.x, r.y - skjerm.y) < (e.pointerType === 'touch' ? 16 : 9)
          ) {
            drag = {
              type: 'roter',
              orig: h.enkelt,
              senter: h.senter,
              start: Math.atan2(modell.y - h.senter.y, modell.x - h.senter.x),
            };
            return;
          }
          const indeks = h.punkter.findIndex(
            (p, i) => (h.enkelt || i % 2 === 0) && Math.hypot(p.x - modell.x, p.y - modell.y) < tol,
          );
          if (indeks >= 0) {
            drag = {
              type: 'skaler',
              indeks,
              orig: new Map(valgte(benk).map((o) => [o.id, o])),
              start: modell,
            };
            return;
          }
        }
        const o = treff(benk, modell, tol);
        const utvalg = benk.tilstand.utvalg.objekter;
        if (o) {
          if (e.shiftKey) {
            const ny = utvalg.includes(o.id) ? utvalg.filter((x) => x !== o.id) : [...utvalg, o.id];
            benk.velg({ objekter: ny, lag: o.lagId });
            return;
          }
          if (!utvalg.includes(o.id)) benk.velg({ objekter: [o.id], lag: o.lagId });
          if (e.detail === 2 && o.kilde.type === 'tekst') {
            window.dispatchEvent(new CustomEvent('signgen:rediger-tekst'));
            return;
          }
          const valgteNa = redigerbare(benk);
          drag = {
            type: 'flytt',
            start: modell,
            orig: new Map(valgteNa.map((x) => [x.id, x.transform])),
            boks: utvalgsboks(valgteNa) ?? verdensBoks(o),
            flyttet: false,
          };
          return;
        }
        drag = { type: 'marker', start: modell, legg: e.shiftKey, for: e.shiftKey ? utvalg : [] };
        if (!e.shiftKey) benk.velg({ objekter: [] });
      },
      flytt({ modell, e, visning: v }) {
        if (!drag) return;
        if (drag.type === 'flytt') {
          let dx = modell.x - drag.start.x,
            dy = modell.y - drag.start.y;
          if (!drag.flyttet && Math.hypot(dx, dy) * v.pxPerMm < 3) return;
          drag.flyttet = true;
          if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;
            else dx = 0;
          }
          const b = drag.boks;
          const flyttetBoks = {
            minX: b.minX + dx,
            maksX: b.maksX + dx,
            minY: b.minY + dy,
            maksY: b.maksY + dy,
          };
          const s = snapBoks(benk, flyttetBoks, new Set(drag.orig.keys()), v, e.altKey);
          dx += s.dx;
          dy += s.dy;
          const orig = drag.orig;
          benk.endre({
            navn: 'Flytt',
            slaSammen: 'flytt-dra',
            anvend: (d) =>
              oppdaterObjekter(d, [...orig.keys()], (o) => {
                const t = orig.get(o.id)!;
                return { ...o, transform: { ...o.transform, x: t.x + dx, y: t.y + dy } };
              }),
          });
          lager.sett({
            hjelpelinjer: s.linjer,
            maletikett: {
              p: { x: b.maksX + dx, y: b.minY + dy },
              tekst: `x ${tall((b.minX + b.maksX) / 2 + dx)}  y ${tall((b.minY + b.maksY) / 2 + dy)} mm`,
            },
          });
        } else if (drag.type === 'skaler') {
          const orig = drag.orig;
          const indeks = drag.indeks;
          const proporsjonal = !e.shiftKey;
          if (orig.size === 1) {
            const o0 = [...orig.values()][0]!;
            const ny = skalerEnkelt(o0, indeks, modell, proporsjonal);
            benk.endre({
              navn: 'Endre størrelse',
              slaSammen: 'skaler-dra',
              anvend: (d) => oppdaterObjekter(d, [o0.id], () => ny),
            });
            const g = lokalGeometri(ny.kilde)!;
            const bb = (g.boks.maksX - g.boks.minX) * ny.transform.skalaX,
              hh = (g.boks.maksY - g.boks.minY) * ny.transform.skalaY;
            lager.sett({ maletikett: { p: modell, tekst: `${tall(bb)} × ${tall(hh)} mm` } });
          } else {
            const b = utvalgsboks([...orig.values()])!;
            const [hx, hy] = HANDTAK[indeks]!;
            const anker = { x: hx > 0 ? b.minX : b.maksX, y: hy > 0 ? b.minY : b.maksY };
            const bredde0 = b.maksX - b.minX || 1,
              hoyde0 = b.maksY - b.minY || 1;
            const s = Math.max(
              0.02,
              Math.max(Math.abs(modell.x - anker.x) / bredde0, Math.abs(modell.y - anker.y) / hoyde0),
            );
            benk.endre({
              navn: 'Endre størrelse',
              slaSammen: 'skaler-dra',
              anvend: (d) =>
                oppdaterObjekter(d, [...orig.keys()], (o) => {
                  const o0 = orig.get(o.id)!;
                  const t = o0.transform;
                  const pos = { x: anker.x + (t.x - anker.x) * s, y: anker.y + (t.y - anker.y) * s };
                  if (o0.kilde.type === 'form') {
                    return {
                      ...o0,
                      kilde: { ...o0.kilde, bredde: o0.kilde.bredde * s, hoyde: o0.kilde.hoyde * s },
                      transform: { ...t, ...pos },
                    };
                  }
                  return { ...o0, transform: { ...t, ...pos, skalaX: t.skalaX * s, skalaY: t.skalaY * s } };
                }),
            });
            lager.sett({ maletikett: { p: modell, tekst: `${tall(bredde0 * s)} × ${tall(hoyde0 * s)} mm` } });
          }
        } else if (drag.type === 'roter') {
          const vinkel = Math.atan2(modell.y - drag.senter.y, modell.x - drag.senter.x);
          let rot = drag.orig.transform.rotasjon + ((vinkel - drag.start) * 180) / Math.PI;
          if ((benk.tilstand.innstillinger.snap && !e.altKey) || e.shiftKey) rot = Math.round(rot / 15) * 15;
          rot = (((rot % 360) + 540) % 360) - 180;
          const o0 = drag.orig;
          const g = lokalGeometri(o0.kilde)!;
          const cLokal = { x: (g.boks.minX + g.boks.maksX) / 2, y: (g.boks.minY + g.boks.maksY) / 2 };
          const m1 = tilMatrise({ ...o0.transform, rotasjon: rot, x: 0, y: 0 });
          const c1 = anvend(m1, cLokal);
          const senter = drag.senter;
          benk.endre({
            navn: 'Roter',
            slaSammen: 'roter-dra',
            anvend: (d) =>
              oppdaterObjekter(d, [o0.id], (o) => ({
                ...o,
                transform: { ...o.transform, rotasjon: rot, x: senter.x - c1.x, y: senter.y - c1.y },
              })),
          });
          lager.sett({ maletikett: { p: modell, tekst: `${tall(rot, 1)}°` } });
        } else if (drag.type === 'marker') {
          const b = {
            minX: Math.min(drag.start.x, modell.x),
            maksX: Math.max(drag.start.x, modell.x),
            minY: Math.min(drag.start.y, modell.y),
            maksY: Math.max(drag.start.y, modell.y),
          };
          const inni = Object.values(benk.dok.objekter).filter((o) => {
            if (
              !o.synlig ||
              o.last ||
              finnLag(benk.dok, o.lagId)?.last ||
              !finnLag(benk.dok, o.lagId)?.synlig
            )
              return false;
            const ob = verdensBoks(o);
            return ob.minX >= b.minX && ob.maksX <= b.maksX && ob.minY >= b.minY && ob.maksY <= b.maksY;
          });
          benk.velg({ objekter: [...new Set([...drag.for, ...inni.map((o) => o.id)])] });
          lager.sett({ markering: b });
        }
      },
      opp() {
        if (drag && drag.type !== 'marker') benk.historikk.avsluttSammenslaing();
        if (drag?.type === 'marker') {
          const n = benk.tilstand.utvalg.objekter.length;
          if (n) benk.melde(n === 1 ? '1 objekt valgt.' : `${n} objekter valgt.`);
        }
        drag = null;
        lager.sett({ hjelpelinjer: [], markering: null, maletikett: null });
      },
      avbryt() {
        if (drag && drag.type !== 'marker') benk.historikk.avsluttSammenslaing();
        drag = null;
        lager.sett({ hjelpelinjer: [], markering: null, maletikett: null });
      },
    };
  }

  if (id === 'tekst') {
    return {
      markor: 'text',
      ned({ modell, e, visning }) {
        const p = snapPunkt(benk, modell, visning, e.altKey);
        const o = leggTil(benk, nyTekst('Tekst', 12), { x: p.x, y: p.y });
        if (o) {
          lager.sett({ verktoy: 'velg' });
          requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('signgen:rediger-tekst')));
        }
      },
    };
  }

  if (id === 'mal') {
    return {
      markor: 'crosshair',
      ned({ modell, e, visning }) {
        const a = snapPunkt(benk, modell, visning, e.altKey);
        drag = { type: 'maal', a };
        lager.sett({ maling: { a, b: a } });
      },
      flytt({ modell, e, visning }) {
        if (drag?.type !== 'maal') return;
        lager.sett({ maling: { a: drag.a, b: snapPunkt(benk, modell, visning, e.altKey) } });
      },
      opp() {
        const m = lager.t.maling;
        if (m) benk.melde(`Avstand ${mm(Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y))}.`);
        drag = null;
      },
    };
  }

  // shape tools: drag a box, or click for a default size
  const form =
    id === 'rektangel' ? 'rektangel' : id === 'ellipse' ? 'ellipse' : id === 'polygon' ? 'polygon' : 'hull';
  return {
    markor: 'crosshair',
    ned({ modell, e, visning }) {
      const p = snapPunkt(benk, modell, visning, e.altKey);
      if (form === 'hull') {
        leggTil(benk, nyForm('hull', 5, 5), { x: p.x, y: p.y });
        lager.sett({ verktoy: 'velg' });
        return;
      }
      drag = { type: 'utkast', start: p };
      lager.sett({ utkast: { minX: p.x, maksX: p.x, minY: p.y, maksY: p.y } });
    },
    flytt({ modell, e, visning }) {
      if (drag?.type !== 'utkast') return;
      const p = snapPunkt(benk, modell, visning, e.altKey);
      let w = p.x - drag.start.x,
        h = p.y - drag.start.y;
      if (e.shiftKey) {
        const s = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * s;
        h = Math.sign(h || 1) * s;
      }
      const b = {
        minX: Math.min(drag.start.x, drag.start.x + w),
        maksX: Math.max(drag.start.x, drag.start.x + w),
        minY: Math.min(drag.start.y, drag.start.y + h),
        maksY: Math.max(drag.start.y, drag.start.y + h),
      };
      lager.sett({
        utkast: b,
        maletikett: { p, tekst: `${tall(b.maksX - b.minX)} × ${tall(b.maksY - b.minY)} mm` },
      });
    },
    opp() {
      const b = lager.t.utkast;
      drag = null;
      lager.sett({ utkast: null, maletikett: null, verktoy: 'velg' });
      if (!b) return;
      let w = b.maksX - b.minX,
        h = b.maksY - b.minY;
      let cx = (b.minX + b.maksX) / 2,
        cy = (b.minY + b.maksY) / 2;
      if (w < 1 || h < 1) {
        w = form === 'rektangel' ? 40 : 30;
        h = form === 'rektangel' ? 20 : 30;
        cx = b.minX;
        cy = b.minY;
      }
      leggTil(benk, nyForm(form, w, h, form === 'rektangel' ? Math.min(3, w / 4, h / 4) : 0), {
        x: cx,
        y: cy,
      });
    },
    avbryt() {
      drag = null;
      lager.sett({ utkast: null, maletikett: null });
    },
  };
}

// ---------- floating contextual toolbar ----------

function Flytlinje({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const ref = useRef<HTMLDivElement>(null);
  const [str, settStr] = useState({ b: 0, h: 0 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => settStr({ b: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const obj = valgte(benk);
  const boks = utvalgsboks(obj);
  if (!boks || !str.b) return <div ref={ref} hidden />;
  const v = lagVisning(t.utsnitt, str.b, str.h);
  const topp = v.tilSkjerm({ x: (boks.minX + boks.maksX) / 2, y: boks.maksY });
  const x = Math.min(Math.max(topp.x, 150), str.b - 150);
  const y = Math.max(topp.y - 56 - (obj.length === 1 ? 32 : 0), 30);
  const last = obj.every((o) => o.last);
  return (
    <div
      ref={ref}
      class="flytlinje"
      style={{ left: `${x}px`, top: `${y}px` }}
      role="toolbar"
      aria-label="Valgte objekter"
    >
      <button type="button" onClick={() => dupliserValgte(benk)} title="Dupliser (Ctrl+D)">
        Dupliser
      </button>
      <button type="button" onClick={() => slettValgte(benk)} disabled={last} title="Slett (Delete)">
        Slett
      </button>
      <button
        type="button"
        aria-pressed={last}
        onClick={() => {
          const ider = obj.map((o) => o.id);
          benk.endre({
            navn: last ? 'Lås opp' : 'Lås',
            anvend: (d) => oppdaterObjekter(d, ider, (o) => ({ ...o, last: !last })),
          });
          benk.melde(last ? 'Låst opp.' : 'Låst.');
        }}
      >
        {last ? 'Lås opp' : 'Lås'}
      </button>
    </div>
  );
}

// ---------- component ----------

export function SigngenLerret({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  const t = brukBenk(benk);
  useEffect(() => nårFontLastes(() => benk.kommando('tegn')), [benk]);
  const verktoy = useMemo(() => lagVerktoy(benk, st.verktoy), [benk, st.verktoy]);
  const markering = utvalgsboks(valgte(benk));
  const antall = Object.keys(t.dok.objekter).length;
  return (
    <Lerret
      benk={benk}
      tegn={(ctx, v, f) => tegnSign(ctx, v, f, benk)}
      verktoy={verktoy}
      markering={markering}
      innhold={() => innholdsboks(benk.dok)}
      panorer={st.verktoy === 'panorer'}
      etikett={`Skiltet sett ovenfra, ${t.dok.lag.length} lag og ${antall} objekter. Velg objekter i lagpanelet med tastatur. Piltaster flytter valgte objekter.`}
    >
      {st.verktoy === 'velg' && <Flytlinje benk={benk} />}
    </Lerret>
  );
}
