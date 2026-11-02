/**
 * From a drawing to pieces: the spine curve, where the joints go along it,
 * each piece's body in its own frame (the same recipe as the classic
 * dragon: utviklingsbibliotek.ts and the joint in ledd.ts) and where it
 * lies on the plate. Pure and deterministic. The 2D views, the 3D view and
 * the export all read this one layout, so what is drawn is what is printed.
 *
 * The dragon prints in place in the pose that is drawn: every joint is
 * printed at the angle the spine bends there. That angle must stay inside
 * the hinge's range, and neighbouring bodies must not touch in the bend.
 */
import type { Mesh } from '../../../geometri/mesh';
import type { Skall } from '../bibliotek';
import { leddMal, sokkelRadius, type LeddMal } from '../ledd';
import { omrissPunkt } from '../former';
import { minsteVegg, tappOgArm } from '../ledd-geometri';
import { LENGDE_MAKS, LENGDE_MIN, standardParametre, type DrageParametre } from '../parametre';
import {
  armEnde,
  halerekkevidde,
  hodeformer,
  N_HODE,
  type Del,
  type Rolle,
  type Skjelett,
} from '../skjelett';
import { hale, hode, kropp, pigger, Samler } from '../utviklingsbibliotek';
import { profilVerdi, type Elementform, type Tegning, type V2 } from './modell';

/* ------------------------------------------------------------------ */
/* The spine                                                           */
/* ------------------------------------------------------------------ */

export interface Sti {
  punkter: V2[];
  /** Arc length at each point. */
  s: number[];
  L: number;
}

/** Centripetal Catmull-Rom through the drawn points, sampled densely. */
export function lagSti(rygg: V2[], perSpenn = 20): Sti {
  const p = rygg.filter(
    (q, i) => i === 0 || Math.hypot(q[0] - rygg[i - 1]![0], q[1] - rygg[i - 1]![1]) > 1e-6,
  );
  const punkter: V2[] = [];
  if (p.length < 2) {
    const a = p[0] ?? [0, 0];
    punkter.push(a, [a[0] - 1, a[1]]);
  } else {
    const ut = (a: V2, b: V2): V2 => [2 * a[0] - b[0], 2 * a[1] - b[1]];
    const utvidet = [ut(p[0]!, p[1]!), ...p, ut(p.at(-1)!, p.at(-2)!)];
    const avst = (a: V2, b: V2) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    for (let i = 1; i < utvidet.length - 2; i++) {
      const [p0, p1, p2, p3] = [utvidet[i - 1]!, utvidet[i]!, utvidet[i + 1]!, utvidet[i + 2]!];
      const t0 = 0;
      const t1 = t0 + avst(p0, p1);
      const t2 = t1 + avst(p1, p2);
      const t3 = t2 + avst(p2, p3);
      for (let k = 0; k < perSpenn; k++) {
        const t = t1 + ((t2 - t1) * k) / perSpenn;
        const lerp = (a: V2, b: V2, ta: number, tb: number): V2 => {
          const w = (t - ta) / (tb - ta);
          return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
        };
        const a1 = lerp(p0, p1, t0, t1);
        const a2 = lerp(p1, p2, t1, t2);
        const a3 = lerp(p2, p3, t2, t3);
        const b1 = lerp(a1, a2, t0, t2);
        const b2 = lerp(a2, a3, t1, t3);
        punkter.push(lerp(b1, b2, t1, t2));
      }
    }
    punkter.push(p.at(-1)!);
  }
  const s = [0];
  for (let i = 1; i < punkter.length; i++)
    s.push(s[i - 1]! + Math.hypot(punkter[i]![0] - punkter[i - 1]![0], punkter[i]![1] - punkter[i - 1]![1]));
  return { punkter, s, L: s.at(-1)! };
}

/** Point and unit direction (towards the tail) at arc length `s`. */
export function vedLengde(sti: Sti, s: number): { p: V2; retning: V2 } {
  const { punkter, s: ss } = sti;
  const x = Math.min(sti.L, Math.max(0, s));
  let lo = 0;
  let hi = ss.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ss[m]! <= x) lo = m;
    else hi = m;
  }
  const a = punkter[lo]!;
  const b = punkter[hi]!;
  const l = ss[hi]! - ss[lo]!;
  const w = l > 1e-9 ? (x - ss[lo]!) / l : 0;
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return {
    p: [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w],
    retning: [(b[0] - a[0]) / d, (b[1] - a[1]) / d],
  };
}

/** Arc length of the spine point nearest to `q`, and how far away it is. */
export function naermesteLengde(sti: Sti, q: V2): { s: number; avstand: number } {
  let best = { s: 0, avstand: Infinity };
  for (let i = 1; i < sti.punkter.length; i++) {
    const a = sti.punkter[i - 1]!;
    const b = sti.punkter[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const w = l2 > 0 ? Math.min(1, Math.max(0, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    const avstand = Math.hypot(a[0] + dx * w - q[0], a[1] + dy * w - q[1]);
    if (avstand < best.avstand) best = { s: sti.s[i - 1]! + (sti.s[i]! - sti.s[i - 1]!) * w, avstand };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/** A plane motion: rotate by `v` about the origin, then move by (x, y). */
export interface T2 {
  x: number;
  y: number;
  v: number;
}

export function tilVerden(t: T2, p: V2): V2 {
  const c = Math.cos(t.v);
  const s = Math.sin(t.v);
  return [t.x + c * p[0] - s * p[1], t.y + s * p[0] + c * p[1]];
}

export interface Segment {
  indeks: number;
  rolle: Rolle;
  navn: string;
  /** The body in its own frame (nose towards +X), as the classic dragon's parts. */
  del: Del;
  /** Own frame → plate. */
  T: T2;
  /** Arc lengths of the front end (nose or front joint) and the rear end (rear joint or tail tip). */
  s0: number;
  s1: number;
  /** Local X of the front and rear ends (to map the body onto the spine in the side view). */
  x0: number;
  x1: number;
  /** Full width and height as built (after the joint's minimums). */
  bredde: number;
  hoyde: number;
  /** The drawn width was too narrow for the socket and was widened. */
  breddeOkt: boolean;
  /** Gap to the piece in front (mm); grows where the spine bends so the bodies clear each other. */
  gap: number;
  pigg: Elementform | null;
  /** Ids of the elements on this piece (the first one is built). */
  elementer: string[];
  neseX?: number;
  haleX?: number;
  snute?: number;
  haletupp?: number;
}

export interface Leddpunkt {
  /** Joint k sits between piece k−1 (in front) and piece k. */
  indeks: number;
  s: number;
  p: V2;
  /** Print angle: how far the rear piece is turned from the front one (radians, + = left). It moves ±bevegelse from here. */
  boy: number;
  forSkarp: boolean;
}

export interface Funn {
  niva: 'feil' | 'advarsel' | 'info';
  tekst: string;
  segment?: number;
  ledd?: number;
}

export interface Oppsett {
  sti: Sti;
  L: number;
  mal: LeddMal;
  segmenter: Segment[];
  ledd: Leddpunkt[];
  funn: Funn[];
  /** Shortest spine the drawing can be built on, mm. */
  minsteLengde: number;
  /** How many pieces the spine has room for. */
  maksDeler: number;
}

const grader = (r: number) => Math.round((r * 180) / Math.PI);
const halvtall = (x: number) => String(Math.round(x)).replace('.', ',');

/** Body pieces are rounder than the classic parts so they clear each other in a bend. */
export const N_TEGNET = 2.3;

/** Least distance between neighbouring bodies in the print pose: the joint's clearance and a margin for the mesh's facets. */
export const kroppsklaring = (mal: LeddMal) => mal.klaring + 0.15;

/** A piece's body outline on the plate (the superellipse, without details). */
export function kroppsomriss(seg: Segment, punkter = 48): V2[] {
  const o = seg.del.omriss;
  return Array.from({ length: punkter }, (_, k) =>
    tilVerden(seg.T, omrissPunkt(o, (k / punkter) * 2 * Math.PI)),
  );
}

function avstandTilKant(p: V2, a: V2, b: V2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const w = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(a[0] + dx * w - p[0], a[1] + dy * w - p[1]);
}

/** Least distance between two convex outlines, 0 when they overlap. */
export function avstandMellom(a: V2[], b: V2[]): number {
  if (overlapper(a, b)) return 0;
  let minst = Infinity;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const)
    for (const p of x)
      for (let i = 0; i < y.length; i++)
        minst = Math.min(minst, avstandTilKant(p, y[i]!, y[(i + 1) % y.length]!));
  return minst;
}

/** Sharpest bend a joint can be printed in (the slot turns with it; beyond this the socket wall gets thin). */
export const MAKS_BOY = (40 * Math.PI) / 180;

/** Tail pieces carry this much more spine than the others (they include the tip). */
const HALEANDEL = 1.4;

function bredHalv(
  b: number,
  sokkel: boolean,
  mal: LeddMal,
  R: number,
  lengder: { af: number; ab: number; n: number; j: number },
): number {
  let h = Math.max(b, mal.a + 2 * mal.vegg, sokkel ? 1.12 * R : 0);
  if (!sokkel) return h;
  for (let i = 0; i < 60; i++) {
    const o = { cx: 0, cy: 0, af: lengder.af, ab: lengder.ab, b: h, n: lengder.n };
    if (minsteVegg(o, { jx: lengder.j, mal }) >= mal.vegg * 0.98) return h;
    h *= 1.04;
  }
  return h;
}

/** The whole layout of a drawing. */
export function lagOppsett(t: Tegning): Oppsett {
  const sti = lagSti(t.rygg);
  const L = sti.L;
  const mal = leddMal(Math.min(LENGDE_MAKS, Math.max(LENGDE_MIN, L)));
  const R = sokkelRadius(mal);
  const mel = mal.mellomrom;
  const veggHoyde = mal.hulromHoyde + mal.tak;
  const funn: Funn[] = [];
  const f = hodeformer[t.hode.form];
  const rek = halerekkevidde[t.hale];

  // Smallest half-lengths that still give the socket its wall and the arm somewhere to end.
  const aMin = Math.max(1.05 * R, (R + armEnde(mal) + mal.vegg + 0.5) / 2);
  const aMinHale = Math.max(0.6 * R, mal.a + 2 * mal.vegg);
  const dMin = 2 * aMin + mel;
  const dHodeMin = 2 * aMin * (1 + f[3]) - R;
  const dHaleMin = R + mel + 2 * aMinHale * (1 + rek);
  const eMin = Math.max(dMin, dHaleMin / HALEANDEL);

  const sHode = Math.max(dHodeMin * 1.04, L * 0.19 * f[0]);
  const rest = L - sHode;
  const maksEtter = Math.floor(rest / (eMin * 1.02) + 1 - HALEANDEL);
  const maksDeler = Math.max(0, Math.min(24, maksEtter + 1));
  const minsteLengde = Math.ceil(dHodeMin * 1.04 + eMin * 1.02 * (1 + HALEANDEL));

  const tom = (tekst: string): Oppsett => ({
    sti,
    L,
    mal,
    segmenter: [],
    ledd: [],
    funn: [...funn, { niva: 'feil', tekst }],
    minsteLengde,
    maksDeler,
  });
  if (maksDeler < 3)
    return tom(
      `Ryggen er ${halvtall(L)} mm. Tegn den minst ${minsteLengde} mm lang for at hode, en del og hale skal få plass med ledd.`,
    );

  const mal1 = Math.max(dMin * 1.3, L / 11);
  let antall = t.antallDeler ?? Math.round(rest / mal1 + 1 - HALEANDEL) + 1;
  if (t.antallDeler !== null && antall > maksDeler)
    funn.push({
      niva: 'info',
      tekst: `Ryggen har plass til ${maksDeler} deler, ikke ${t.antallDeler}. Tegn den lengre for flere.`,
    });
  antall = Math.max(3, Math.min(maksDeler, antall));
  const etter = antall - 1; // pieces behind the head, the last one is the tail
  const e = rest / (etter - 1 + HALEANDEL);

  const leddS = Array.from({ length: etter }, (_, k) => sHode + k * e);
  const P = (s: number) => vedLengde(sti, s).p;
  const nese = P(0);
  const ende = P(L);
  const J = leddS.map(P);

  const segmenter: Segment[] = [];
  const tellere = { kropp: 0 };
  const hale0 = Math.round(etter * 0.55); // the last ~45 % of the pieces behind the head read as tail
  const maksGap = mel + 1.5 * R;

  /** Piece i with gap g between its front end and the piece in front (ignored for the head). */
  const lagDel = (i: number, g: number): { seg: Segment; kort: boolean } => {
    const erHode = i === 0;
    const erHale = i === antall - 1;
    const F = erHode ? nese : J[i - 1]!;
    const B = erHale ? ende : J[i]!;
    const s0 = erHode ? 0 : leddS[i - 1]!;
    const s1 = erHale ? L : leddS[i]!;
    const d = Math.hypot(F[0] - B[0], F[1] - B[1]);
    const u: V2 = d > 1e-9 ? [(F[0] - B[0]) / d, (F[1] - B[1]) / d] : [1, 0];
    const v = Math.atan2(u[1], u[0]);

    let a: number;
    if (erHode) a = (d + R) / (2 * (1 + f[3]));
    else if (erHale) a = (d - R - g) / (2 * (1 + rek));
    else a = (d - g) / 2;
    const aKrav = erHale ? aMinHale : aMin;
    const kort = a < aKrav * 0.999;
    if (kort) a = aKrav;

    const harSokkel = !erHale;
    const j = harSokkel ? R - a : 0;
    const n = erHode ? N_HODE : N_TEGNET;
    const midtS = (s0 + s1) / 2;
    const tegnetB = profilVerdi(t.bredde, midtS / L) / 2;
    const b = bredHalv(tegnetB, harSokkel, mal, R, { af: a, ab: a, n, j });
    const h = Math.max(profilVerdi(t.hoyde, midtS / L), veggHoyde + 2.5);

    const rolle: Rolle = erHode ? 'hode' : i >= Math.max(2, hale0) ? 'hale' : 'kropp';
    const del: Del = {
      indeks: i,
      rolle,
      navn: '',
      omriss: { cx: 0, cy: 0, af: a, ab: a, b, n },
      profil: { vegg: veggHoyde, hoyde: h, ringer: 9 },
    };
    if (harSokkel) del.sokkel = { jx: j, mal };
    const ekstra: Partial<Segment> = {};
    let x0: number;
    let x1: number;
    let T: T2;
    if (erHode) {
      const snute = 2 * a * f[3];
      x0 = a + snute;
      x1 = j;
      ekstra.neseX = x0;
      ekstra.snute = snute;
      // the head hangs on its rear joint
      T = { x: B[0] - u[0] * x1, y: B[1] - u[1] * x1, v };
    } else {
      const jx = a + g + R;
      del.tapp = { jx, tilX: harSokkel ? Math.max(0, j + armEnde(mal)) : 0 };
      x0 = jx;
      if (erHale) {
        const tupp = 2 * a * rek;
        x1 = -a - tupp;
        ekstra.haleX = x1;
        ekstra.haletupp = tupp;
      } else x1 = j;
      // every other piece hangs on its front joint, so the pin is exactly in the socket
      T = { x: F[0] - u[0] * x0, y: F[1] - u[1] * x0, v };
    }
    return {
      kort,
      seg: {
        indeks: i,
        rolle,
        navn: '',
        del,
        T,
        s0,
        s1,
        x0,
        x1,
        bredde: 2 * b,
        hoyde: h,
        breddeOkt: b > tegnetB + 0.25,
        gap: erHode ? 0 : g,
        pigg: null,
        elementer: [],
        ...ekstra,
      },
    };
  };

  for (let i = 0; i < antall; i++) {
    let valgt = lagDel(i, mel);
    const forran = segmenter[i - 1];
    if (forran) {
      // Widen the gap at this joint until the two bodies clear each other in the drawn bend.
      const foran = kroppsomriss(forran);
      const fri = (g: number) => {
        const r = lagDel(i, g);
        return { r, ok: avstandMellom(foran, kroppsomriss(r.seg)) >= kroppsklaring(mal) };
      };
      let forsok = fri(mel);
      if (!forsok.ok) {
        let lo = mel;
        let hi = maksGap;
        const ytterst = fri(hi);
        if (ytterst.ok) {
          forsok = ytterst;
          for (let k = 0; k < 18; k++) {
            const m = (lo + hi) / 2;
            const x = fri(m);
            if (x.ok) {
              hi = m;
              forsok = x;
            } else lo = m;
          }
        } else forsok = ytterst;
      }
      valgt = forsok.r;
    }
    const { seg, kort } = valgt;
    const navn =
      i === 0
        ? 'Hode'
        : i === antall - 1
          ? 'Haletupp'
          : `${seg.rolle === 'hale' ? 'Hale' : 'Kropp'} ${++tellere.kropp}`;
    seg.navn = navn;
    seg.del.navn = navn;
    if (kort)
      funn.push({
        niva: 'feil',
        tekst: `Ryggen svinger så krapt ved ${i === 0 ? 'hodet' : navn.toLowerCase()} at delen ikke får plass til leddet. Gjør svingen rundere eller ryggen lengre.`,
        segment: i,
      });
    segmenter.push(seg);
  }

  // Elements land on the piece their spine position falls in.
  for (const el of t.elementer) {
    const s = el.t * L;
    const seg = segmenter.find((x) => s >= x.s0 && s <= x.s1) ?? segmenter.at(-1)!;
    seg.elementer.push(el.id);
    if (seg.elementer.length === 1) {
      if (seg.rolle === 'hode' && t.hode.horn !== 'ingen')
        funn.push({
          niva: 'info',
          tekst: 'Hodet har horn, så piggen der vises ikke. Velg «Ingen» horn for å bruke den.',
          segment: seg.indeks,
        });
      else seg.pigg = el.form;
    } else if (seg.elementer.length === 2)
      funn.push({
        niva: 'info',
        tekst: `${seg.navn} har flere pigger. Bare den første bygges, én per del.`,
        segment: seg.indeks,
      });
  }

  // Print angle at each joint. The socket's slot is turned to where the arm lies in the drawn
  // pose, so the arm prints in the middle of it with full clearance and moves ±bevegelse from there.
  const ledd: Leddpunkt[] = [];
  for (let k = 1; k < segmenter.length; k++) {
    const foran = segmenter[k - 1]!;
    const a = foran.T.v;
    const b = segmenter[k]!.T.v;
    const boy = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    const forSkarp = Math.abs(boy) > MAKS_BOY;
    foran.del.sokkel = { ...foran.del.sokkel!, retning: Math.PI + boy };
    ledd.push({ indeks: k, s: leddS[k - 1]!, p: J[k - 1]!, boy, forSkarp });
    if (forSkarp)
      funn.push({
        niva: 'feil',
        tekst: `Leddet mellom ${foran.navn.toLowerCase()} og ${segmenter[k]!.navn.toLowerCase()} er bøyd ${grader(Math.abs(boy))}°. Et ledd kan printes bøyd høyst ${grader(MAKS_BOY)}°. Gjør svingen rundere der.`,
        ledd: k,
      });
  }

  const okt = segmenter.filter((s) => s.breddeOkt);
  if (okt.length)
    funn.push({
      niva: 'info',
      tekst: `${okt.length === 1 ? `${okt[0]!.navn} er gjort bredere` : `${okt.length} deler er gjort bredere`} enn tegnet, så leddet får vegg rundt seg.`,
    });

  return { sti, L, mal, segmenter, ledd, funn, minsteLengde, maksDeler };
}

/* ------------------------------------------------------------------ */
/* Shells                                                              */
/* ------------------------------------------------------------------ */

function delParametre(t: Tegning, pigg: Elementform | null): DrageParametre {
  const s = standardParametre;
  return {
    ...s,
    hode: t.hode.form,
    horn: t.hode.horn,
    pigger: pigg ?? 'ingen',
    hale: t.hale,
    vinger: 'ingen',
    detaljer: { ...s.detaljer, oyne: t.hode.oyne, bein: false, vingeribber: false },
  };
}

const hurtig = new Map<string, Skall[]>();

/** A piece's shells in its own frame: body, head or tail details, its spike, and the pin and arm into the piece in front. */
export function segmentSkall(t: Tegning, seg: Segment, mal: LeddMal): Skall[] {
  const q = delParametre(t, seg.pigg);
  const nokkel = JSON.stringify([
    seg.del,
    seg.rolle,
    seg.pigg,
    seg.neseX,
    seg.haleX,
    q.hode,
    q.horn,
    q.hale,
    q.detaljer.oyne,
  ]);
  const ferdig = hurtig.get(nokkel);
  if (ferdig) return ferdig;
  const d = seg.del;
  const sk: Skjelett = {
    deler: [d],
    mal,
    neseX: seg.neseX ?? d.omriss.af,
    haleX: seg.haleX ?? -d.omriss.ab,
    snute: seg.snute ?? 0,
    haletupp: seg.haletupp ?? 0,
    vingeDel: -1,
    beinDeler: [],
  };
  const s = new Samler();
  kropp(s, d);
  if (seg.indeks === 0) hode(s, sk, q);
  if (seg.pigg) pigger(s, sk, q);
  if (seg.haleX !== undefined) hale(s, sk, q);
  if (d.tapp) for (const mesh of tappOgArm(d.tapp.jx, d.tapp.tilX, mal)) s.legg(d.indeks, 'ledd', mesh);
  hurtig.set(nokkel, s.skall);
  while (hurtig.size > 160) hurtig.delete(hurtig.keys().next().value!);
  return s.skall;
}

/** Move a mesh by a plane motion (rotation about Z keeps the winding). */
export function plasserMesh(m: Mesh, t: T2): Mesh {
  const c = Math.cos(t.v);
  const s = Math.sin(t.v);
  const p = m.posisjoner;
  const ut = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!;
    const y = p[i + 1]!;
    ut[i] = t.x + c * x - s * y;
    ut[i + 1] = t.y + s * x + c * y;
    ut[i + 2] = p[i + 2]!;
  }
  return { posisjoner: ut, indekser: m.indekser };
}

/** Convex hull of points (monotone chain), counter-clockwise. */
export function skrog(pkt: V2[]): V2[] {
  const p = [...pkt].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const kryss = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const nedre: V2[] = [];
  for (const q of p) {
    while (nedre.length >= 2 && kryss(nedre.at(-2)!, nedre.at(-1)!, q) <= 0) nedre.pop();
    nedre.push(q);
  }
  const ovre: V2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (ovre.length >= 2 && kryss(ovre.at(-2)!, ovre.at(-1)!, q) <= 0) ovre.pop();
    ovre.push(q);
  }
  return [...nedre.slice(0, -1), ...ovre.slice(0, -1)];
}

/** Do two convex polygons overlap (separating axis test)? */
export function overlapper(a: V2[], b: V2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      let aMin = Infinity;
      let aMaks = -Infinity;
      let bMin = Infinity;
      let bMaks = -Infinity;
      for (const r of a) {
        const d = r[0] * nx + r[1] * ny;
        aMin = Math.min(aMin, d);
        aMaks = Math.max(aMaks, d);
      }
      for (const r of b) {
        const d = r[0] * nx + r[1] * ny;
        bMin = Math.min(bMin, d);
        bMaks = Math.max(bMaks, d);
      }
      if (aMaks <= bMin || bMaks <= aMin) return false;
    }
  }
  return true;
}

export interface Segmentform {
  /** The body seen from above on the plate (convex outline, pin and arm left out). */
  ovenfra: V2[];
  /** The piece seen from the side: [arc length along the spine, height] from front to back, over the top. */
  fraSiden: V2[];
}

const formHurtig = new WeakMap<Skall[], { lokal: V2[]; side: V2[] }>();

function lokalForm(skall: Skall[]): { lokal: V2[]; side: V2[] } {
  const ferdig = formHurtig.get(skall);
  if (ferdig) return ferdig;
  const xy: V2[] = [];
  const xz: V2[] = [];
  for (const s of skall) {
    if (s.type === 'ledd') continue;
    const p = s.mesh.posisjoner;
    for (let i = 0; i < p.length; i += 3) {
      xy.push([p[i]!, p[i + 1]!]);
      xz.push([p[i]!, p[i + 2]!]);
    }
  }
  const lokal = skrog(xy);
  // Side silhouette: the highest point in narrow slices along X.
  const minX = Math.min(...xz.map((q) => q[0]));
  const maksX = Math.max(...xz.map((q) => q[0]));
  const skiver = 36;
  const topp = new Array<number>(skiver + 1).fill(-1);
  for (const [x, z] of xz) {
    const k = Math.round(((x - minX) / Math.max(1e-6, maksX - minX)) * skiver);
    topp[k] = Math.max(topp[k]!, z);
  }
  // slices no vertex fell in (flat parts with few vertices) take the line between their neighbours
  for (let k = 0; k <= skiver; k++) {
    if (topp[k]! >= 0) continue;
    let a = k - 1;
    while (a >= 0 && topp[a]! < 0) a--;
    let b = k + 1;
    while (b <= skiver && topp[b]! < 0) b++;
    const za = a >= 0 ? topp[a]! : 0;
    const zb = b <= skiver ? topp[b]! : 0;
    topp[k] = a >= 0 && b <= skiver ? za + ((zb - za) * (k - a)) / (b - a) : Math.max(za, zb);
  }
  const side: V2[] = [[maksX, 0]];
  for (let k = skiver; k >= 0; k--) side.push([minX + ((maksX - minX) * k) / skiver, topp[k]!]);
  side.push([minX, 0]);
  const ut = { lokal, side };
  formHurtig.set(skall, ut);
  return ut;
}

/** What the 2D views draw for one piece, from the same shells as the 3D model. */
export function segmentform(t: Tegning, o: Oppsett, seg: Segment): Segmentform {
  const { lokal, side } = lokalForm(segmentSkall(t, seg, o.mal));
  const skala = (seg.s1 - seg.s0) / Math.max(1e-6, seg.x0 - seg.x1);
  return {
    ovenfra: lokal.map((p) => tilVerden(seg.T, p)),
    fraSiden: side.map(([x, z]): V2 => [seg.s0 + (seg.x0 - x) * skala, z]),
  };
}

/** Pairs of pieces whose bodies touch on the plate (they would print fused). */
export function kollisjoner(former: V2[][]): [number, number][] {
  const ut: [number, number][] = [];
  for (let a = 0; a < former.length; a++)
    for (let b = a + 1; b < former.length; b++) if (overlapper(former[a]!, former[b]!)) ut.push([a, b]);
  return ut;
}
