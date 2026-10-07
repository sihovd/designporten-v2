/**
 * Signgen's 2D workspace: the sign seen from above in its real colours,
 * with selection handles, snapping guides, measurements and the drawing
 * tools. Built on the shared Lerret (grid, rulers, pan/zoom).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, type Objekt } from '../../core/dokument';
import { anvend, inverter, tilMatrise, type Boks, type Transform2D, type Vec2 } from '../../core/geometri2d';
import { finnMateriale } from '../../core/materialer';
import { rutenettnivaa, snapTil } from '../../core/rutenett';
import { mm, tall } from '../../core/enheter';
import type { Region } from '../../geometri/polygon';
import { Lerret, type Farger, type Verktoyhandler } from '../../render2d/Lerret';
import { LINJAL, lagVisning, type Visning } from '../../render2d/visning';
import { brukBenk } from '../../shell/bruk-benk';
import { nyForm, nyTekst, oppdaterObjekter } from './dokument';
import {
  hjorner,
  innholdsboks,
  lagRegion,
  omrissRegioner,
  lokalGeometri,
  nårFontLastes,
  verdensBoks,
  verdensRegion,
} from './modell';
import { signtilstand, brukSigntilstand, type Snaplinje, type VerktoyId } from './tilstand';
import { dupliserValgte, leggTil, redigerbare, slettValgte, utvalgsboks, valgte } from './handlinger';
import { snapPunkt, treff } from './plukk';
import { erDobbeltklikk } from './dobbeltklikk';
import {
  flyttHjelpelinjeTil,
  hjelpelinjerAv,
  laasHjelpelinje,
  leggTilHjelpelinjeI,
  narmesteHjelpelinje,
  slettHjelpelinjeI,
} from './hjelpelinjer';
import { TallFelt } from '../../shell/kontroller';
import { kurveObjekt, startKurveredigering } from './kurver';
import { lagKurveverktoy } from './Kurveverktoy';
import { tegnKurver } from './Kurveoverlegg';
import { lagPennverktoy } from './Pennverktoy';

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

/** Guide lines across the whole canvas: cyan, dashed when locked, brighter when chosen. */
function tegnHjelpelinjer(
  ctx: CanvasRenderingContext2D,
  v: Visning,
  f: Farger,
  benk: Arbeidsbenk,
  st: ReturnType<typeof signtilstand>['t'],
): void {
  if (!benk.tilstand.innstillinger.hjelpelinjer) return;
  const dra = st.guideDra;
  const linjer = hjelpelinjerAv(benk.dok)
    .filter((g) => g.id !== dra?.id)
    .map((g) => ({ id: g.id, akse: g.akse, verdi: g.verdi, last: !!g.last }));
  if (dra && !dra.tilbake) linjer.push({ id: dra.id ?? 'ny', akse: dra.akse, verdi: dra.verdi, last: false });
  ctx.save();
  for (const g of linjer) {
    const valgt = g.id === st.valgtGuide || (dra && g.id === (dra.id ?? 'ny'));
    ctx.beginPath();
    if (g.akse === 'x') {
      const x = Math.round(v.tilSkjerm({ x: g.verdi, y: 0 }).x) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, v.hoyde);
    } else {
      const y = Math.round(v.tilSkjerm({ x: 0, y: g.verdi }).y) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(v.bredde, y);
    }
    ctx.strokeStyle = valgt ? f.tekst : f.cyan;
    ctx.lineWidth = valgt ? 1.5 : 1;
    ctx.globalAlpha = valgt ? 0.95 : 0.7;
    ctx.setLineDash(g.last ? [6, 4] : []);
    ctx.stroke();
  }
  ctx.restore();
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
    // a text layer: its outlines, then the text (unless it is cut out of them)
    const deler: [Region, string][] = [];
    if (lag.tekstlag) {
      const omriss = omrissRegioner(d, lag.id);
      for (const o of lag.omriss ?? []) {
        const r = omriss?.get(o.id);
        if (o.synlig && r?.length) deler.push([r, o.materialId]);
      }
    }
    if (lag.tekstvisning !== 'kutt') deler.push([region, lag.materialId]);
    for (const [r, materialId] of deler) {
      sti(ctx, v, r);
      ctx.fillStyle = finnMateriale(materialId).hex;
      ctx.fill('evenodd');
      ctx.strokeStyle = f.bakgrunn;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  tegnHjelpelinjer(ctx, v, f, benk, st);

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
  if (h && !st.kurve && redigerbare(benk).length === valgte(benk).length) {
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
  for (const g of st.snaplinjer) {
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
  tegnKurver(ctx, v, f, benk);
}

// ---------- hit testing ----------

// ---------- snapping ----------

interface Snapresultat {
  dx: number;
  dy: number;
  linjer: Snaplinje[];
}

function snapBoks(
  benk: Arbeidsbenk,
  b: Boks,
  utelat: Set<string>,
  v: Visning,
  deaktivert: boolean,
): Snapresultat {
  if (deaktivert || !benk.tilstand.innstillinger.snap) return { dx: 0, dy: 0, linjer: [] };
  const mal = signtilstand(benk).t.snapmal;
  const terskel = 7 / v.pxPerMm;
  const andre = Object.values(benk.dok.objekter)
    .filter((o) => o.synlig && !utelat.has(o.id))
    .map(verdensBoks);
  const plate: Boks = { minX: 0, maksX: 0, minY: 0, maksY: 0 };
  const guider = mal.hjelpelinjer && benk.tilstand.innstillinger.hjelpelinjer ? hjelpelinjerAv(benk.dok) : [];
  const mine = {
    x: [b.minX, (b.minX + b.maksX) / 2, b.maksX],
    y: [b.minY, (b.minY + b.maksY) / 2, b.maksY],
  };
  const res: Snapresultat = { dx: 0, dy: 0, linjer: [] };
  for (const akse of ['x', 'y'] as const) {
    let best: { d: number; mal: Boks | null; verdi: number } | null = null;
    const prov = (a: number, t: number, m: Boks | null) => {
      const d = t - a;
      if (Math.abs(d) <= terskel && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, mal: m, verdi: t };
    };
    // edges and centres of the other objects (and the plate centre), as the Snap menu allows
    for (const m of mal.objekter || mal.sentre ? [plate, ...andre] : []) {
      const lav = akse === 'x' ? m.minX : m.minY;
      const hoy = akse === 'x' ? m.maksX : m.maksY;
      const deres = [...(mal.objekter ? [lav, hoy] : []), ...(mal.sentre ? [(lav + hoy) / 2] : [])];
      for (const a of mine[akse]) for (const t of deres) prov(a, t, m);
    }
    // guide lines: any edge or the centre of the dragged box
    for (const g of guider) if (g.akse === akse) for (const a of mine[akse]) prov(a, g.verdi, null);
    const treff = best as { d: number; mal: Boks | null; verdi: number } | null;
    if (treff) {
      if (akse === 'x') res.dx = treff.d;
      else res.dy = treff.d;
      if (treff.mal) {
        const [fra, til] =
          akse === 'x'
            ? [Math.min(b.minY, treff.mal.minY), Math.max(b.maksY, treff.mal.maksY)]
            : [Math.min(b.minX, treff.mal.minX), Math.max(b.maksX, treff.mal.maksX)];
        const pad = 6 / v.pxPerMm;
        res.linjer.push({ akse, verdi: treff.verdi, fra: fra - pad, til: til + pad });
      }
    } else if (mal.rutenett) {
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

/** Keep a movement on the nearest 45° line (Shift): the part of the movement along it. */
function laasTil45(dx: number, dy: number): { x: number; y: number; retning: Vec2 } {
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const rx = Math.abs(Math.cos(a)) < 1e-9 ? 0 : Math.cos(a);
  const ry = Math.abs(Math.sin(a)) < 1e-9 ? 0 : Math.sin(a);
  const lengde = dx * rx + dy * ry;
  return { x: lengde * rx, y: lengde * ry, retning: { x: rx, y: ry } };
}

// ---------- tools ----------

type Drag =
  | { type: 'flytt'; start: Vec2; orig: Map<string, Transform2D>; boks: Boks; flyttet: boolean }
  | { type: 'skaler'; indeks: number; orig: Map<string, Objekt>; start: Vec2 }
  | { type: 'roter'; orig: Objekt; senter: Vec2; start: number }
  | { type: 'marker'; start: Vec2; legg: boolean; for: string[] }
  | { type: 'utkast'; start: Vec2 }
  | { type: 'maal'; a: Vec2 }
  | { type: 'guide'; id: string; akse: 'x' | 'y'; start: number; flyttet: boolean };

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

/** Where a guide being dragged lands: on the grid or another object's edge, unless Alt is held. */
function snapGuide(benk: Arbeidsbenk, akse: 'x' | 'y', p: Vec2, v: Visning, deaktivert: boolean): number {
  const f = snapPunkt(benk, p, v, deaktivert);
  return Math.round((akse === 'x' ? f.x : f.y) * 100) / 100;
}

/** Dragging out of a ruler: a new guide, kept when it is let go on the canvas. */
function lagGuideverktoy(benk: Arbeidsbenk, side: 'topp' | 'venstre'): Verktoyhandler {
  const lager = signtilstand(benk);
  const akse = side === 'topp' ? 'y' : 'x';
  return {
    markor: 'default',
    ned({ modell, visning }) {
      benk.velg({ objekter: [] });
      lager.sett({
        valgtGuide: null,
        guideDra: { id: null, akse, verdi: snapGuide(benk, akse, modell, visning, true), tilbake: true },
      });
    },
    flytt({ modell, skjerm, e, visning }) {
      const tilbake = (akse === 'x' ? skjerm.x : skjerm.y) < LINJAL;
      lager.sett({
        guideDra: { id: null, akse, verdi: snapGuide(benk, akse, modell, visning, e.altKey), tilbake },
      });
    },
    opp() {
      const dra = lager.t.guideDra;
      lager.sett({ guideDra: null });
      if (!dra || dra.tilbake) return;
      if (!benk.tilstand.innstillinger.hjelpelinjer) benk.settInnstillinger({ hjelpelinjer: true });
      const g = leggTilHjelpelinjeI(benk, dra.akse, dra.verdi);
      lager.sett({ valgtGuide: g.id });
    },
    avbryt() {
      lager.sett({ guideDra: null });
    },
  };
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
        const dobbel = erDobbeltklikk(skjerm);
        if (o) {
          if (lager.t.valgtGuide) lager.sett({ valgtGuide: null });
          if (e.shiftKey) {
            const ny = utvalg.includes(o.id) ? utvalg.filter((x) => x !== o.id) : [...utvalg, o.id];
            benk.velg({ objekter: ny, lag: o.lagId });
            return;
          }
          if (!utvalg.includes(o.id)) benk.velg({ objekter: [o.id], lag: o.lagId });
          if (dobbel && o.kilde.type === 'tekst') {
            window.dispatchEvent(new CustomEvent('signgen:rediger-tekst'));
            return;
          }
          if (dobbel && o.kilde.type === 'svg' && !e.shiftKey) {
            drag = null;
            startKurveredigering(benk, o.id);
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
        // a guide line (not under an object): choose it, and drag it unless it is locked
        if (benk.tilstand.innstillinger.hjelpelinjer && !e.shiftKey) {
          const g = narmesteHjelpelinje(hjelpelinjerAv(benk.dok), modell, 5 / v.pxPerMm, true);
          if (g) {
            benk.velg({ objekter: [] });
            lager.sett({ valgtGuide: g.id });
            if (!g.last) {
              drag = { type: 'guide', id: g.id, akse: g.akse, start: g.verdi, flyttet: false };
              lager.sett({ guideDra: { id: g.id, akse: g.akse, verdi: g.verdi, tilbake: false } });
            }
            return;
          }
        }
        if (lager.t.valgtGuide) lager.sett({ valgtGuide: null });
        drag = { type: 'marker', start: modell, legg: e.shiftKey, for: e.shiftKey ? utvalg : [] };
        if (!e.shiftKey) benk.velg({ objekter: [] });
      },
      flytt({ modell, skjerm, e, visning: v }) {
        if (!drag) return;
        if (drag.type === 'guide') {
          const verdi = snapGuide(benk, drag.akse, modell, v, e.altKey);
          const tilbake = (drag.akse === 'x' ? skjerm.x : skjerm.y) < LINJAL;
          drag.flyttet = true;
          lager.sett({ guideDra: { id: drag.id, akse: drag.akse, verdi, tilbake } });
          return;
        }
        if (drag.type === 'flytt') {
          let dx = modell.x - drag.start.x,
            dy = modell.y - drag.start.y;
          if (!drag.flyttet && Math.hypot(dx, dy) * v.pxPerMm < 3) return;
          drag.flyttet = true;
          let retning: Vec2 | null = null;
          if (e.shiftKey) {
            const l = laasTil45(dx, dy);
            dx = l.x;
            dy = l.y;
            retning = l.retning;
          }
          const b = drag.boks;
          const flyttetBoks = {
            minX: b.minX + dx,
            maksX: b.maksX + dx,
            minY: b.minY + dy,
            maksY: b.maksY + dy,
          };
          const s = snapBoks(benk, flyttetBoks, new Set(drag.orig.keys()), v, e.altKey);
          if (retning) {
            // snapping only moves the box along the locked line
            const langs = s.dx * retning.x + s.dy * retning.y;
            dx += langs * retning.x;
            dy += langs * retning.y;
          } else {
            dx += s.dx;
            dy += s.dy;
          }
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
            snaplinjer: s.linjer,
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
          if (e.shiftKey) rot = Math.round(rot / 45) * 45;
          else if (benk.tilstand.innstillinger.snap && !e.altKey) rot = Math.round(rot / 15) * 15;
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
        if (drag?.type === 'guide') {
          const dra = lager.t.guideDra;
          if (dra?.tilbake) {
            slettHjelpelinjeI(benk, drag.id);
            lager.sett({ valgtGuide: null });
            benk.melde('Hjelpelinjen er fjernet.');
          } else if (dra && drag.flyttet && dra.verdi !== drag.start) {
            flyttHjelpelinjeTil(benk, drag.id, dra.verdi);
          }
          drag = null;
          lager.sett({ guideDra: null });
          return;
        }
        if (drag && drag.type !== 'marker') benk.historikk.avsluttSammenslaing();
        if (drag?.type === 'marker') {
          const n = benk.tilstand.utvalg.objekter.length;
          if (n) benk.melde(n === 1 ? '1 objekt valgt.' : `${n} objekter valgt.`);
        }
        drag = null;
        lager.sett({ snaplinjer: [], markering: null, maletikett: null });
      },
      avbryt() {
        if (drag?.type === 'guide') lager.sett({ guideDra: null });
        if (drag && drag.type !== 'marker') benk.historikk.avsluttSammenslaing();
        drag = null;
        lager.sett({ snaplinjer: [], markering: null, maletikett: null });
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
      {obj.length === 1 && obj[0]!.kilde.type === 'svg' && (
        <button
          type="button"
          onClick={() => startKurveredigering(benk, obj[0]!.id)}
          title="Rediger punkter og kurver (dobbeltklikk)"
        >
          Rediger kurver
        </button>
      )}
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

// ---------- guide bar ----------

/** The chosen guide line: its position, lock and delete, at the edge of the canvas. */
function Guidebar({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const ref = useRef<HTMLDivElement>(null);
  const [str, settStr] = useState({ b: 0, h: 0 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => settStr({ b: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const g = hjelpelinjerAv(t.dok).find((x) => x.id === st.valgtGuide);
  if (!g || !str.b || !t.innstillinger.hjelpelinjer) return <div ref={ref} hidden />;
  const v = lagVisning(t.utsnitt, str.b, str.h);
  const pos =
    g.akse === 'x'
      ? {
          left: `${Math.min(Math.max(v.tilSkjerm({ x: g.verdi, y: 0 }).x + 8, LINJAL + 4), str.b - 230)}px`,
          top: `${LINJAL + 8}px`,
        }
      : {
          left: `${LINJAL + 8}px`,
          top: `${Math.min(Math.max(v.tilSkjerm({ x: 0, y: g.verdi }).y + 8, LINJAL + 4), str.h - 50)}px`,
        };
  return (
    <div ref={ref} class="flytlinje guidebar" style={pos} role="toolbar" aria-label="Valgt hjelpelinje">
      <TallFelt
        etikett={g.akse === 'x' ? 'Hjelpelinje, vannrett posisjon' : 'Hjelpelinje, loddrett posisjon'}
        kortEtikett={g.akse === 'x' ? 'X' : 'Y'}
        verdi={g.verdi}
        steg={1}
        deaktivert={!!g.last}
        endre={(v2, k) => flyttHjelpelinjeTil(benk, g.id, v2, k === 'pil' ? 'guide-pil' : undefined)}
      />
      <button
        type="button"
        aria-pressed={!!g.last}
        onClick={() => laasHjelpelinje(benk, g.id, !g.last)}
        title={g.last ? 'Lås opp hjelpelinjen' : 'Lås hjelpelinjen'}
      >
        {g.last ? 'Lås opp' : 'Lås'}
      </button>
      <button
        type="button"
        disabled={!!g.last}
        onClick={() => {
          slettHjelpelinjeI(benk, g.id);
          signtilstand(benk).sett({ valgtGuide: null });
        }}
        title="Slett hjelpelinjen (Delete)"
      >
        Slett
      </button>
    </div>
  );
}

// ---------- component ----------

export function SigngenLerret({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  const t = brukBenk(benk);
  useEffect(() => nårFontLastes(() => benk.kommando('tegn')), [benk]);
  const redigerer = !!st.kurve;
  const verktoy = useMemo(
    () =>
      st.verktoy === 'penn'
        ? lagPennverktoy(benk)
        : st.verktoy === 'velg' && redigerer
          ? lagKurveverktoy(benk)
          : lagVerktoy(benk, st.verktoy),
    [benk, st.verktoy, redigerer],
  );
  // leave curve editing and the pen when the work moves elsewhere
  useEffect(() => {
    const lager = signtilstand(benk);
    const k = lager.t.kurve;
    if (lager.t.penn && st.verktoy !== 'penn') lager.sett({ penn: null });
    if (!k) return;
    const utvalg = t.utvalg.objekter;
    const borte =
      !kurveObjekt(benk) ||
      (st.verktoy !== 'velg' && st.verktoy !== 'penn') ||
      (st.verktoy === 'velg' && (utvalg.length !== 1 || utvalg[0] !== k.objektId));
    if (borte) lager.sett({ kurve: null, markering: null });
  }, [benk, st.verktoy, st.kurve, t.utvalg.objekter, t.dok]);
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
      linjalverktoy={(side) => lagGuideverktoy(benk, side)}
      etikett={`Skiltet sett ovenfra, ${t.dok.lag.length} lag og ${antall} objekter. Velg objekter i lagpanelet med tastatur. Piltaster flytter valgte objekter.`}
    >
      {st.verktoy === 'velg' && !st.kurve && <Flytlinje benk={benk} />}
      {st.valgtGuide && <Guidebar benk={benk} />}
    </Lerret>
  );
}
