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
import { rutenettnivaa } from '../../core/rutenett';
import { mm, tall } from '../../core/enheter';
import { ellipse as ellipseRing, polygon } from '../../geometri/former';
import type { Region } from '../../geometri/polygon';
import { Lerret, type Farger, type Verktoyhandler } from '../../render2d/Lerret';
import { LINJAL, lagVisning, type Visning } from '../../render2d/visning';
import { brukBenk } from '../../shell/bruk-benk';
import { nyForm, nyTekst, oppdaterObjekter } from './dokument';
import {
  hjorner,
  innholdsboks,
  lokalGeometri,
  nårFontLastes,
  beroererBoks,
  verdensBoks,
  verdensRegion,
} from './modell';
import { skiltdeler } from './forhandsbilde';
import { signtilstand, brukSigntilstand, type Snaplinje, type VerktoyId } from './tilstand';
import { dupliserValgte, leggTil, redigerbare, slettValgte, utvalgsboks, valgte } from './handlinger';
import { laas45Punkt, snapPunkt, treff } from './plukk';
import { erDobbeltklikk } from './dobbeltklikk';
import { tegnMonster } from './monsterforhandsvisning';
import { fjernStrekpunkt, flyttStrekpunkt, leggTilStrekpunkt, treffStrekpunkt } from './strekpunkter';
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
import {
  fjernBreddepunkt,
  leggTilBreddepunkt,
  settBreddeVed,
  strekvisning,
  tegnBreddehandtak,
  treffBreddehandtak,
  treffSenterlinje,
} from './Strekverktoy';
import { lagPennverktoy } from './Pennverktoy';
import { leggTilStrek, strekFraPunkter } from './paint';
import { BOOLSKE, boolskHinder, kombinerValgte } from './boolsk';
import { feltrandFor, lagSilhuettFraRegioner, type Silhuett } from './silhuett';
import {
  boksAnkere,
  lesSnap,
  snapKanter,
  snapPunkter,
  snapSkilt,
  type PlassertSkilt,
  type SnapKontakt,
  type Snapoppsett,
} from './snapmotor';
import { snappunkterAv, type PlassertPunkt } from './snappunkter';
import { Tips } from '../../shell/Tips';
import { Ikon } from '../../shell/ikoner';
import { strekRing } from '../../geometri/strek';

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
  for (const [r, materialId] of skiltdeler(d)) {
    sti(ctx, v, r);
    ctx.fillStyle = finnMateriale(materialId).hex;
    ctx.fill('evenodd');
    ctx.strokeStyle = f.bakgrunn;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
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
  // the snap points of the master, on the geometry they follow
  if (benk.tilstand.innstillinger.snap && lesSnap(benk.dok).punktliste.length) {
    ctx.lineWidth = 1.5;
    for (const p of snappunkterAv(benk.dok)) {
      const q = v.tilSkjerm(p);
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - 5);
      ctx.lineTo(q.x + 5, q.y);
      ctx.lineTo(q.x, q.y + 5);
      ctx.lineTo(q.x - 5, q.y);
      ctx.closePath();
      ctx.fillStyle = f.tekst;
      ctx.fill();
      ctx.strokeStyle = f.cyan;
      ctx.stroke();
    }
  }
  // where a move holds on: the distance between two contours, or a snap point
  const sk = st.snapkontakt;
  if (sk) {
    ctx.strokeStyle = f.cyan;
    ctx.fillStyle = f.cyan;
    ctx.lineWidth = 1.5;
    const a = v.tilSkjerm({ x: sk.a[0], y: sk.a[1] });
    const b = v.tilSkjerm({ x: sk.b[0], y: sk.b[1] });
    if (sk.type === 'punkt') {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      for (const q of [a, b]) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = f.tekst;
      ctx.fillText(`${tall(sk.d)} mm`, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6);
    }
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
    const uf = st.utkastForm;
    if (uf && uf.form !== 'rektangel') {
      // the real outline of the shape being drawn, inside its box
      const w = st.utkast.maksX - st.utkast.minX,
        h = st.utkast.maksY - st.utkast.minY;
      const cx = (st.utkast.minX + st.utkast.maksX) / 2,
        cy = (st.utkast.minY + st.utkast.maksY) / 2;
      const ring = uf.form === 'polygon' ? polygon(w, h, uf.sider) : ellipseRing(w, h);
      ctx.setLineDash([]);
      ctx.beginPath();
      ring.forEach((q, i) => {
        const sp = v.tilSkjerm({ x: cx + q.x, y: cy + q.y });
        if (i) ctx.lineTo(sp.x, sp.y);
        else ctx.moveTo(sp.x, sp.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (st.paintUtkast && st.paintUtkast.length > 1) {
    const strek = strekFraPunkter(st.paintUtkast, st.paint);
    if (strek) {
      ctx.beginPath();
      strekRing(strek).forEach((q, i) => {
        const sp = v.tilSkjerm(q);
        if (i) ctx.lineTo(sp.x, sp.y);
        else ctx.moveTo(sp.x, sp.y);
      });
      ctx.closePath();
      ctx.fillStyle = f.lilla;
      ctx.globalAlpha = 0.55;
      ctx.fill('nonzero');
      ctx.globalAlpha = 1;
    }
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
  if (st.verktoy === 'velg') tegnBreddehandtak(ctx, v, f, benk);
  if (st.verktoy === 'monster') tegnMonster(ctx, v, f, benk);
}

// ---------- hit testing ----------

// ---------- snapping ----------

/** What the snap engine reads for one drag: the contours and points as they were when it began. */
interface Snapmotor2D {
  /** Snap points of what is not moved, and the places of the moved objects' own points. */
  punkterMal: PlassertPunkt[];
  punkterMine: Vec2[];
  /** The contour of everything that is moved, and of every other object (only when the contour target is on). */
  mover: PlassertSkilt | null;
  naboer: PlassertSkilt[];
}

interface Snapresultat {
  dx: number;
  dy: number;
  linjer: Snaplinje[];
  /** Set while the move holds on to a contour or a snap point. */
  kontakt: SnapKontakt | null;
}

/** The contour of one object, kept as long as the object is the same and the margin is wide enough. */
const objektSilhuett = new WeakMap<Objekt, Silhuett>();

function silhuettAv(o: Objekt, felt: number): Silhuett | null {
  const c = objektSilhuett.get(o);
  if (c && c.felt >= felt) return c;
  const r = verdensRegion(o);
  if (!r?.length) return null;
  const s = lagSilhuettFraRegioner([r], felt);
  objektSilhuett.set(o, s);
  return s;
}

function byggMotor(benk: Arbeidsbenk, utelat: Set<string>, b: Boks, oppsett: Snapoppsett): Snapmotor2D {
  const dok = benk.dok;
  const punkter = oppsett.punkter ? snappunkterAv(dok, oppsett.punktliste) : [];
  const motor: Snapmotor2D = {
    punkterMal: punkter.filter((p) => !utelat.has(p.mal)),
    punkterMine: punkter.filter((p) => utelat.has(p.mal)).map(({ x, y }) => ({ x, y })),
    mover: null,
    naboer: [],
  };
  if (oppsett.konturer) {
    const felt = feltrandFor(oppsett.avstand, oppsett.fangavstand);
    const regioner = [...utelat]
      .map((id) => dok.objekter[id])
      .flatMap((o) => (o?.synlig ? [verdensRegion(o)] : []))
      .filter((r): r is Region => !!r?.length);
    if (regioner.length) {
      motor.mover = { id: -1, silhuett: lagSilhuettFraRegioner(regioner, felt), boks: b, dx: 0, dy: 0 };
    }
    let id = 0;
    for (const o of Object.values(dok.objekter)) {
      if (!o.synlig || utelat.has(o.id)) continue;
      const silhuett = silhuettAv(o, felt);
      if (silhuett) motor.naboer.push({ id: id++, silhuett, boks: verdensBoks(o), dx: 0, dy: 0 });
    }
  }
  return motor;
}

/**
 * Where a move of the box `b` by (dx, dy) lands: on a snap point, at the wanted distance from a contour, or
 * against the edges, centres, guide lines and the grid, in that order. The result is the correction to add.
 * The engine is in `snapmotor.ts`; this only reads the document for it and draws what it found.
 */
function snapBoks(
  benk: Arbeidsbenk,
  b: Boks,
  dx: number,
  dy: number,
  utelat: Set<string>,
  v: Visning,
  deaktivert: boolean,
  drag: { motor?: Snapmotor2D },
): Snapresultat {
  if (deaktivert || !benk.tilstand.innstillinger.snap) return { dx: 0, dy: 0, linjer: [], kontakt: null };
  const mal = signtilstand(benk).t.snapmal;
  const oppsett = lesSnap(benk.dok);
  const motor = (drag.motor ??= byggMotor(benk, utelat, b, oppsett));
  const flyttet: Boks = { minX: b.minX + dx, maksX: b.maksX + dx, minY: b.minY + dy, maksY: b.maksY + dy };

  if (motor.punkterMal.length) {
    const mine = [...boksAnkere(flyttet), ...motor.punkterMine.map((p) => ({ x: p.x + dx, y: p.y + dy }))];
    const f = snapPunkter(mine, motor.punkterMal, oppsett.fangavstand);
    if (f) {
      const til: [number, number] = [f.til.x, f.til.y];
      return { dx: f.dx, dy: f.dy, linjer: [], kontakt: { type: 'punkt', nabo: -1, a: til, b: til, d: 0 } };
    }
  }
  if (motor.mover && motor.naboer.length) {
    const r = snapSkilt(motor.mover, dx, dy, motor.naboer, null, {
      paa: true,
      avstand: oppsett.avstand,
      radius: oppsett.fangavstand,
    });
    if (r.kontakt) return { dx: r.dx - dx, dy: r.dy - dy, linjer: [], kontakt: r.kontakt };
  }

  const andre = Object.values(benk.dok.objekter)
    .filter((o) => o.synlig && !utelat.has(o.id))
    .map(verdensBoks);
  const guider = benk.tilstand.innstillinger.hjelpelinjer ? hjelpelinjerAv(benk.dok) : [];
  const k = snapKanter(
    flyttet,
    andre,
    guider,
    mal,
    7 / v.pxPerMm,
    Math.max(0.1, rutenettnivaa(v.pxPerMm).liten),
  );
  const linjer: Snaplinje[] = [];
  const pad = 6 / v.pxPerMm;
  for (const t of k.treff) {
    if (!t.mal) continue;
    const [fra, til] =
      t.akse === 'x'
        ? [Math.min(flyttet.minY, t.mal.minY), Math.max(flyttet.maksY, t.mal.maksY)]
        : [Math.min(flyttet.minX, t.mal.minX), Math.max(flyttet.maksX, t.mal.maksX)];
    linjer.push({ akse: t.akse, verdi: t.verdi, fra: fra - pad, til: til + pad });
  }
  return { dx: k.dx, dy: k.dy, linjer, kontakt: null };
}

/** Keep a movement on the nearest 45° line (Shift): the part of the movement along it. */
function laasTil45(dx: number, dy: number): { x: number; y: number; retning: Vec2 } {
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const rx = Math.abs(Math.cos(a)) < 1e-9 ? 0 : Math.cos(a);
  const ry = Math.abs(Math.sin(a)) < 1e-9 ? 0 : Math.sin(a);
  const lengde = dx * rx + dy * ry;
  return { x: lengde * rx, y: lengde * ry, retning: { x: rx, y: ry } };
}

/** One side more or fewer on the polygon being drawn (the mouse wheel and the up/down arrows). */
export function endreUtkastSider(benk: Arbeidsbenk, steg: number): boolean {
  const lager = signtilstand(benk);
  const f = lager.t.utkastForm;
  if (!f || f.form !== 'polygon' || !lager.t.utkast) return false;
  const sider = Math.min(24, Math.max(3, f.sider + steg));
  const b = lager.t.utkast;
  lager.sett({
    utkastForm: { form: 'polygon', sider },
    maletikett: lager.t.maletikett && {
      ...lager.t.maletikett,
      tekst: `${sider} sider · ${tall(b.maksX - b.minX)} × ${tall(b.maksY - b.minY)} mm`,
    },
  });
  benk.melde(`${sider} sider.`);
  return true;
}

// ---------- tools ----------

type Drag =
  | {
      type: 'flytt';
      start: Vec2;
      orig: Map<string, Transform2D>;
      boks: Boks;
      flyttet: boolean;
      /** What the snap engine reads, built when the move begins. */
      motor?: Snapmotor2D;
    }
  | { type: 'skaler'; indeks: number; orig: Map<string, Objekt>; start: Vec2 }
  | { type: 'roter'; orig: Objekt; senter: Vec2; start: number }
  | { type: 'marker'; start: Vec2; legg: boolean; for: string[] }
  | { type: 'utkast'; start: Vec2 }
  | { type: 'paint' }
  | { type: 'bredde'; id: string; indeks: number }
  | { type: 'strekpunkt'; id: string; indeks: number }
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

  // the Pattern tool selects and moves like the Select tool; its choices are in the context bar
  if (id === 'velg' || id === 'monster') {
    let ventendeBredde: { id: string; t: number } | null = null;
    return {
      markor: 'default',
      ned({ modell, skjerm, e, visning: v }) {
        const tol = (e.pointerType === 'touch' ? 14 : 8) / v.pxPerMm;
        const h = handtakFor(benk);
        const kanEndre = redigerbare(benk).length === valgte(benk).length;
        ventendeBredde = null;
        const sv = kanEndre ? strekvisning(benk) : null;
        if (sv && !e.shiftKey) {
          const htol = (e.pointerType === 'touch' ? 14 : 9) / v.pxPerMm;
          // the width controls on the edge first, then the points of the centre line, then the rest
          const kant = treffBreddehandtak(sv, modell, htol, false);
          if (kant !== null) {
            drag = { type: 'bredde', id: sv.o.id, indeks: kant };
            return;
          }
          const sp = treffStrekpunkt(sv, modell, htol);
          if (sp !== null) {
            if (erDobbeltklikk(skjerm)) {
              fjernStrekpunkt(benk, sv.o.id, sp);
              return;
            }
            lager.sett({ strekPunkt: { id: sv.o.id, indeks: sp } });
            drag = { type: 'strekpunkt', id: sv.o.id, indeks: sp };
            return;
          }
          // Alt on the centre line puts a new point there and drags it
          if (e.altKey && treffSenterlinje(sv, modell, tol) !== null) {
            const ny = leggTilStrekpunkt(benk, sv.o.id, modell);
            if (ny !== null) drag = { type: 'strekpunkt', id: sv.o.id, indeks: ny };
            return;
          }
          const hit = treffBreddehandtak(sv, modell, htol);
          if (hit !== null) {
            if (erDobbeltklikk(skjerm) && hit > 0 && hit < sv.handtak.length - 1) {
              fjernBreddepunkt(benk, sv.o.id, hit);
              return;
            }
            drag = { type: 'bredde', id: sv.o.id, indeks: hit };
            return;
          }
          // a click on the spline (not a drag) adds a width point
          const t = treffSenterlinje(sv, modell, tol);
          if (t !== null) ventendeBredde = { id: sv.o.id, t };
        }
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
          // a Paint stroke is edited by its centre line and widths; «Gjør til vanlig vektor» opens its outline
          if (dobbel && o.kilde.type === 'svg' && !o.kilde.strek && !e.shiftKey) {
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
        if (drag.type === 'bredde') {
          settBreddeVed(benk, drag.id, drag.indeks, modell);
          return;
        }
        if (drag.type === 'strekpunkt') {
          flyttStrekpunkt(benk, drag.id, drag.indeks, modell);
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
          const s = snapBoks(benk, b, dx, dy, new Set(drag.orig.keys()), v, e.altKey, drag);
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
            snapkontakt: s.kontakt,
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
            return beroererBoks(o, b);
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
        if (drag?.type === 'flytt' && !drag.flyttet && ventendeBredde) {
          leggTilBreddepunkt(benk, ventendeBredde.id, ventendeBredde.t);
        }
        ventendeBredde = null;
        if (drag?.type === 'marker') {
          const n = benk.tilstand.utvalg.objekter.length;
          if (n) benk.melde(n === 1 ? '1 objekt valgt.' : `${n} objekter valgt.`);
        }
        drag = null;
        lager.sett({ snaplinjer: [], snapkontakt: null, markering: null, maletikett: null });
      },
      avbryt() {
        if (drag?.type === 'guide') lager.sett({ guideDra: null });
        if (drag && drag.type !== 'marker') benk.historikk.avsluttSammenslaing();
        drag = null;
        lager.sett({ snaplinjer: [], snapkontakt: null, markering: null, maletikett: null });
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

  if (id === 'paint') {
    let punkter: Vec2[] = [];
    /** Where Shift was pressed: the stroke runs on from there along a 45° line. */
    let laasAnker: Vec2 | null = null;
    return {
      markor: 'crosshair',
      ned({ modell }) {
        drag = { type: 'paint' };
        punkter = [modell];
        lager.sett({ paintUtkast: punkter });
      },
      flytt({ modell: rå, e }) {
        if (drag?.type !== 'paint') return;
        const sist = punkter[punkter.length - 1]!;
        // Shift: the direction from where it was pressed is kept to steps of 45°
        if (!e.shiftKey) laasAnker = null;
        else laasAnker ??= sist;
        const modell = laasAnker ? laas45Punkt(laasAnker, rå) : rå;
        if (Math.hypot(modell.x - sist.x, modell.y - sist.y) < 0.2) return;
        punkter = [...punkter, modell];
        lager.sett({ paintUtkast: punkter });
      },
      opp() {
        if (drag?.type !== 'paint') return;
        drag = null;
        laasAnker = null;
        const strek = strekFraPunkter(punkter, lager.t.paint);
        punkter = [];
        lager.sett({ paintUtkast: null });
        if (!strek) {
          benk.melde('Dra for å male et strøk.');
          return;
        }
        leggTilStrek(benk, strek);
      },
      avbryt() {
        drag = null;
        punkter = [];
        lager.sett({ paintUtkast: null });
      },
    };
  }

  // shape tools: drag a box, or click for a default size
  const form =
    id === 'rektangel'
      ? 'rektangel'
      : id === 'ellipse'
        ? 'ellipse'
        : id === 'polygon' || id === 'trekant'
          ? 'polygon'
          : 'hull';
  const harSider = form === 'polygon';
  /** Sides of the polygon being drawn: the wheel changes them (3 to 24) while the button is down. */
  const startSider = () => (id === 'trekant' ? 3 : lager.t.formSider);
  const sider = () => lager.t.utkastForm?.sider ?? startSider();
  const sideTekst = (b: Boks) =>
    `${harSider ? `${sider()} sider · ` : ''}${tall(b.maksX - b.minX)} × ${tall(b.maksY - b.minY)} mm`;
  return {
    markor: 'crosshair',
    ned({ modell, e, visning }) {
      const p = snapPunkt(benk, modell, visning, e.altKey);
      if (form === 'hull') {
        leggTil(benk, { ...nyForm('hull', 5, 5), hullform: lager.t.hullform }, { x: p.x, y: p.y });
        lager.sett({ verktoy: 'velg' });
        return;
      }
      drag = { type: 'utkast', start: p };
      lager.sett({
        utkast: { minX: p.x, maksX: p.x, minY: p.y, maksY: p.y },
        utkastForm: { form, sider: startSider() },
      });
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
      lager.sett({ utkast: b, maletikett: { p, tekst: sideTekst(b) } });
    },
    hjul(e) {
      if (!harSider || drag?.type !== 'utkast') return false;
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (!d) return true;
      // one step per notch; scrolling up (negative) adds a side
      endreUtkastSider(benk, d < 0 ? 1 : -1);
      return true;
    },
    opp() {
      const b = lager.t.utkast;
      const n = sider();
      drag = null;
      lager.sett({ utkast: null, utkastForm: null, maletikett: null, verktoy: 'velg' });
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
      const kilde = nyForm(form, w, h, form === 'rektangel' ? Math.min(3, w / 4, h / 4) : 0);
      if (harSider) {
        kilde.sider = n;
        // the number of sides is remembered for the next polygon (the triangle tool stays a triangle)
        if (id === 'polygon') lager.sett({ formSider: n });
      }
      leggTil(benk, kilde, { x: cx, y: cy });
    },
    avbryt() {
      drag = null;
      lager.sett({ utkast: null, utkastForm: null, maletikett: null });
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

// ---------- boolean bar ----------

/** Union, Subtract, Intersect and Exclude: shown under two or more selected shapes. */
function Boolskbar({ benk }: { benk: Arbeidsbenk }) {
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
  if (obj.length < 2 || !boks || !str.b) return <div ref={ref} hidden />;
  const v = lagVisning(t.utsnitt, str.b, str.h);
  const bunn = v.tilSkjerm({ x: (boks.minX + boks.maksX) / 2, y: boks.minY });
  const x = Math.min(Math.max(bunn.x, 190), str.b - 190);
  const y = Math.min(bunn.y + 14, str.h - 48);
  const hinder = boolskHinder(t.dok, obj);
  return (
    <div
      ref={ref}
      class="flytlinje boolskbar"
      style={{ left: `${x}px`, top: `${y}px` }}
      role="toolbar"
      aria-label="Kombiner former"
    >
      {BOOLSKE.map((b) => (
        <Tips key={b.id} navn={b.navn} hjelp={hinder ?? b.hjelp} side="under">
          {(p) => (
            <button
              type="button"
              class="ikonknapp"
              aria-label={b.navn}
              aria-disabled={!!hinder}
              onClick={() => {
                if (hinder) benk.melde(hinder);
                else kombinerValgte(benk, b.id);
              }}
              {...p}
            >
              <Ikon id={b.ikon} storrelse={18} />
            </button>
          )}
        </Tips>
      ))}
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
      begrensTilPlate
      linjalverktoy={(side) => lagGuideverktoy(benk, side)}
      etikett={`Skiltet sett ovenfra, ${t.dok.lag.length} lag og ${antall} objekter. Velg objekter i lagpanelet med tastatur. Piltaster flytter valgte objekter.`}
    >
      {st.verktoy === 'velg' && !st.kurve && <Flytlinje benk={benk} />}
      {st.verktoy === 'velg' && !st.kurve && <Boolskbar benk={benk} />}
      {st.valgtGuide && <Guidebar benk={benk} />}
    </Lerret>
  );
}
