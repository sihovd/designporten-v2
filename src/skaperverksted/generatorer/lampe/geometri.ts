/**
 * Lamp mesh: a closed, printable shade.
 *
 *   outer patterned wall ─┐ top rim ┌─ inner wall (outer offset inwards)
 *                         └─ bottom: open rim, closed plate, or plate with
 *                            a centre hole for the lamp holder.
 *
 * The inner wall is the outer wall moved towards the axis by the wall
 * thickness, corrected for slope so the thickness is measured along the
 * surface normal. Both walls are radial functions r(θ, z), so they can never
 * self-intersect in cross-section. Every surface shares its boundary vertices
 * with its neighbours, so the result is one watertight 2-manifold.
 */
import { MeshBygger, type Mesh } from '../../geometri/mesh';
import type { Ring } from '../../geometri/polygon';
import { antallRader, antallVinkler, lagForm, type Form } from './form';
import { MIN_KANT, holderHull, maskinvare, modulMal, type Modulmal } from './maskinvare';
import type { LampeParametre } from './parametre';
import { byggSokkel, rund, sveis, toppFlate } from './sokkel';

/** Largest slope correction; beyond this the wall would be very thick in plan. */
const MAKS_KORREKSJON = 3;
/** Minimum ring of material between the hole and the inner wall (mm). */
export const HULL_KANT = 3;

export interface LampeGeometri {
  mesh: Mesh;
  form: Form;
  /** Sample grid of the outer wall, for printability checks: [rad][vinkel] radius. */
  ytreRutenett: Float64Array;
  vinkler: number;
  rader: number;
  /** Hole radius actually built (mm); null = open bottom. */
  hullRadius: number | null;
  /** Hole requested but larger than the bottom allows. */
  hullForStort: boolean;
  /** Smallest inner radius at the top of the bottom plate (mm). */
  minIndreBunn: number;
  /** Height where the shade's sampled walls start (0, or the top of a module base). */
  zStart: number;
  /** Module base as built, when the lamp is built around a light module. */
  modul?: ModulResultat;
}

export interface ModulResultat {
  /** The recess as actually built (after any clamping below). */
  mal: Modulmal;
  /** The recess as requested. */
  onsket: Modulmal;
  /** Smallest outer radius of the base (mm). */
  minYtre: number;
  /** Opening had to shrink to fit inside the shade wall. */
  apningKlemt: boolean;
  /** Recess had to shrink to leave material around it. */
  lommeKlemt: boolean;
  /** Recess depth had to shrink to leave room for the shade above. */
  dybdeKlemt: boolean;
}

export function indreRadius(form: Form, theta: number, t: number, hoyde: number, vegg: number): number {
  const h = 1e-3;
  const r = form.ytre(theta, t);
  const t0 = Math.max(0, t - h);
  const t1 = Math.min(1, t + h);
  const drdz = (form.ytre(theta, t1) - form.ytre(theta, t0)) / ((t1 - t0) * hoyde);
  const drdv = (form.ytre(theta + h, t) - form.ytre(theta - h, t)) / (2 * h * r);
  const korr = Math.min(MAKS_KORREKSJON, Math.sqrt(1 + drdz * drdz + drdv * drdv));
  return Math.max(1, r - vegg * korr);
}

export function byggLampe(p: LampeParametre): LampeGeometri {
  if (maskinvare[p.sokkel].type === 'modul') return byggModulLampe(p);
  const form = lagForm(p);
  const N = antallVinkler(p);
  const M = antallRader(p, N);
  const H = p.hoyde;
  const vegg = p.veggtykkelse;
  const hullDiameter = holderHull(p.sokkel, p.tilpasning);
  const harBunn = hullDiameter !== null;
  const zBunn = harBunn ? Math.min(p.bunnTykkelse, H / 4) : 0;

  const b = new MeshBygger();
  const cos = new Float64Array(N);
  const sin = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const v = (j / N) * Math.PI * 2;
    cos[j] = Math.cos(v);
    sin[j] = Math.sin(v);
  }
  const vinkel = (j: number) => (j / N) * Math.PI * 2;

  // Outer wall, z from 0 to H.
  const ytreRutenett = new Float64Array((M + 1) * N);
  const ytre: number[][] = [];
  for (let i = 0; i <= M; i++) {
    const t = i / M;
    const rad: number[] = [];
    for (let j = 0; j < N; j++) {
      const r = form.ytre(vinkel(j), t);
      ytreRutenett[i * N + j] = r;
      rad.push(b.punkt(r * cos[j]!, r * sin[j]!, t * H));
    }
    ytre.push(rad);
  }

  // Inner wall, z from zBunn to H. Rows are spread evenly over that span.
  const indre: number[][] = [];
  let minIndreBunn = Infinity;
  for (let i = 0; i <= M; i++) {
    const z = zBunn + ((H - zBunn) * i) / M;
    const t = z / H;
    const rad: number[] = [];
    for (let j = 0; j < N; j++) {
      const r = indreRadius(form, vinkel(j), t, H, vegg);
      if (i === 0) minIndreBunn = Math.min(minIndreBunn, r);
      rad.push(b.punkt(r * cos[j]!, r * sin[j]!, z));
    }
    indre.push(rad);
  }

  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      b.firkant(ytre[i]![j]!, ytre[i]![j1]!, ytre[i + 1]![j1]!, ytre[i + 1]![j]!);
      b.firkant(indre[i]![j]!, indre[i + 1]![j]!, indre[i + 1]![j1]!, indre[i]![j1]!);
    }
  }

  // Top rim (faces up).
  const oTopp = ytre[M]!;
  const iTopp = indre[M]!;
  for (let j = 0; j < N; j++) {
    const j1 = (j + 1) % N;
    b.firkant(oTopp[j]!, oTopp[j1]!, iTopp[j1]!, iTopp[j]!);
  }

  const oBunn = ytre[0]!;
  const iBunn = indre[0]!;
  let hullRadius: number | null = null;
  let hullForStort = false;

  if (!harBunn) {
    // Open bottom rim (faces down).
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      b.firkant(oBunn[j]!, iBunn[j]!, iBunn[j1]!, oBunn[j1]!);
    }
  } else if (hullDiameter === 0) {
    // Closed plate: fans to the centre on top and underneath.
    const cTopp = b.punkt(0, 0, zBunn);
    const cBunn = b.punkt(0, 0, 0);
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      b.trekant(cTopp, iBunn[j]!, iBunn[j1]!);
      b.trekant(cBunn, oBunn[j1]!, oBunn[j]!);
    }
    hullRadius = 0;
  } else {
    const onsket = hullDiameter! / 2;
    const maks = minIndreBunn - HULL_KANT;
    hullForStort = onsket > maks;
    const r = Math.max(1, Math.min(onsket, maks));
    hullRadius = r;
    const hTopp: number[] = [];
    const hBunn: number[] = [];
    for (let j = 0; j < N; j++) {
      hTopp.push(b.punkt(r * cos[j]!, r * sin[j]!, zBunn));
      hBunn.push(b.punkt(r * cos[j]!, r * sin[j]!, 0));
    }
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      // Plate top (up), hole wall (towards the axis), plate underside (down).
      b.firkant(iBunn[j]!, iBunn[j1]!, hTopp[j1]!, hTopp[j]!);
      b.firkant(hBunn[j]!, hTopp[j]!, hTopp[j1]!, hBunn[j1]!);
      b.firkant(oBunn[j]!, hBunn[j]!, hBunn[j1]!, oBunn[j1]!);
    }
  }

  return {
    mesh: b.bygg(),
    form,
    ytreRutenett,
    vinkler: N,
    rader: M,
    hullRadius,
    hullForStort,
    minIndreBunn,
    zStart: 0,
  };
}

/**
 * Append `b` to `a`, reusing a's vertices `felles` where b has a vertex at
 * the same position (Float32, so compared after the mesh's own rounding).
 */
function skjot(a: Mesh, b: Mesh, felles: number[]): Mesh {
  const nokkel = (p: Float32Array, i: number) => `${p[i * 3]},${p[i * 3 + 1]},${p[i * 3 + 2]}`;
  const kart = new Map<string, number>();
  for (const i of felles) kart.set(nokkel(a.posisjoner, i), i);
  const na = a.posisjoner.length / 3;
  const nb = b.posisjoner.length / 3;
  const indeks = new Uint32Array(nb);
  const pos: number[] = [];
  for (let i = 0; i < nb; i++) {
    const k = kart.get(nokkel(b.posisjoner, i));
    if (k !== undefined) indeks[i] = k;
    else {
      indeks[i] = na + pos.length / 3;
      pos.push(b.posisjoner[i * 3]!, b.posisjoner[i * 3 + 1]!, b.posisjoner[i * 3 + 2]!);
    }
  }
  const posisjoner = new Float32Array(a.posisjoner.length + pos.length);
  posisjoner.set(a.posisjoner);
  posisjoner.set(pos, a.posisjoner.length);
  const indekser = new Uint32Array(a.indekser.length + b.indekser.length);
  indekser.set(a.indekser);
  for (let t = 0; t < b.indekser.length; t++) indekser[a.indekser.length + t] = indeks[b.indekser[t]!]!;
  return { posisjoner, indekser };
}

/** Room left for the shade above a module base (fraction of the height). */
const MAKS_SOKKEL = 0.8;
/** Smallest ledge the module rests on around the cable hole (mm). */
const MIN_HYLLE = 2;
/** Material kept between the opening and the shade's inner wall (mm). */
export const APNING_KANT = 0.4;

/**
 * A lamp around a light module: the shade from the top of the base up, on
 * a solid base with a recess for the module and a cable route underneath
 * (sokkel.ts). The base keeps the outline of the shade's first row, so the
 * shade's walls continue straight down into it.
 */
function byggModulLampe(p: LampeParametre): LampeGeometri {
  const form = lagForm(p);
  const N = antallVinkler(p);
  const M = antallRader(p, N);
  const H = p.hoyde;
  const vegg = p.veggtykkelse;
  const onsket = modulMal(p.sokkel, p.tilpasning)!;
  const mal: Modulmal = { ...onsket };

  // The base may not eat the shade.
  const maksTopp = H * MAKS_SOKKEL;
  const dybdeKlemt = mal.zTopp > maksTopp;
  if (dybdeKlemt) {
    const kutt = mal.zTopp - Math.max(maksTopp, mal.zGulv + 1);
    mal.zTopp -= kutt;
    mal.zKlem = Math.max(mal.zGulv, mal.zKlem - kutt);
  }
  const zS = mal.zTopp;

  const b = new MeshBygger();
  const cos = new Float64Array(N);
  const sin = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const v = (j / N) * Math.PI * 2;
    cos[j] = Math.cos(v);
    sin[j] = Math.sin(v);
  }
  const vinkel = (j: number) => (j / N) * Math.PI * 2;

  const ytreRutenett = new Float64Array((M + 1) * N);
  const ytre: number[][] = [];
  const indre: number[][] = [];
  // Rows 0 and 1 also go into the base mesh; keep their coordinates.
  const koord: [number, number, number][][] = [];
  const omriss: Ring = [];
  const indreRing: Ring = [];
  let minYtre = Infinity;
  let minIndreBunn = Infinity;
  for (let i = 0; i <= M; i++) {
    const z = zS + ((H - zS) * i) / M;
    const t = z / H;
    const yRad: number[] = [];
    const iRad: number[] = [];
    const kRad: [number, number, number][] = [];
    for (let j = 0; j < N; j++) {
      const ro = form.ytre(vinkel(j), t);
      const ri = indreRadius(form, vinkel(j), t, H, vegg);
      ytreRutenett[i * N + j] = ro;
      if (i === 0) {
        // The seam with the base: on the Clipper grid so both sides share vertices.
        const o = { x: rund(ro * cos[j]!), y: rund(ro * sin[j]!) };
        const n = { x: rund(ri * cos[j]!), y: rund(ri * sin[j]!) };
        omriss.push(o);
        indreRing.push(n);
        minYtre = Math.min(minYtre, ro);
        minIndreBunn = Math.min(minIndreBunn, ri);
        kRad.push([o.x, o.y, z]);
        yRad.push(kRad.length - 1);
        kRad.push([n.x, n.y, z]);
        iRad.push(kRad.length - 1);
      } else {
        const oy: [number, number, number] = [ro * cos[j]!, ro * sin[j]!, z];
        const iy: [number, number, number] = [ri * cos[j]!, ri * sin[j]!, z];
        yRad.push(b.punkt(...oy));
        iRad.push(b.punkt(...iy));
        if (i === 1) kRad.push(oy, iy);
      }
    }
    ytre.push(yRad);
    indre.push(iRad);
    if (i <= 1) koord.push(kRad);
  }

  // Shade walls above the first band, and the top rim.
  for (let i = 1; i < M; i++) {
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      b.firkant(ytre[i]![j]!, ytre[i]![j1]!, ytre[i + 1]![j1]!, ytre[i + 1]![j]!);
      b.firkant(indre[i]![j]!, indre[i + 1]![j]!, indre[i + 1]![j1]!, indre[i]![j1]!);
    }
  }
  for (let j = 0; j < N; j++) {
    const j1 = (j + 1) % N;
    b.firkant(ytre[M]![j]!, ytre[M]![j1]!, indre[M]![j1]!, indre[M]![j]!);
  }

  // Fit the recess inside what the shape allows; the checks report any clamping.
  const maksApning = minIndreBunn - APNING_KANT;
  const apningKlemt = mal.rApning > maksApning;
  if (apningKlemt) {
    const d = mal.rLomme - mal.rApning;
    mal.rApning = Math.max(1, maksApning);
    mal.rLomme = Math.min(mal.rLomme, mal.rApning + d);
  }
  const maksLomme = minYtre - MIN_KANT;
  const lommeKlemt = mal.rLomme > maksLomme;
  if (lommeKlemt) {
    mal.rLomme = Math.max(1, maksLomme);
    mal.rApning = Math.min(mal.rApning, mal.rLomme);
  }
  mal.rHull = Math.max(0.5, Math.min(mal.rHull, mal.rLomme - MIN_HYLLE));

  // The base and the shade's first band are welded on their own (the slab
  // stack has T-junctions to repair), then joined to the rest at row 1.
  const bs = new MeshBygger();
  // koord[i][2j] is the outer and koord[i][2j + 1] the inner vertex at angle j.
  const r0 = koord[0]!.map((q) => bs.punkt(...q));
  const r1 = koord[1]!.map((q) => bs.punkt(...q));
  for (let j = 0; j < N; j++) {
    const j1 = (j + 1) % N;
    bs.firkant(r0[2 * j]!, r0[2 * j1]!, r1[2 * j1]!, r1[2 * j]!);
    bs.firkant(r0[2 * j + 1]!, r1[2 * j + 1]!, r1[2 * j1 + 1]!, r0[2 * j1 + 1]!);
  }
  byggSokkel(bs, omriss, mal, toppFlate(indreRing, mal));
  const sokkel = sveis(bs.bygg());
  const rad1 = [...ytre[1]!, ...indre[1]!];

  return {
    mesh: skjot(b.bygg(), sokkel, rad1),
    form,
    ytreRutenett,
    vinkler: N,
    rader: M,
    hullRadius: mal.rHull,
    hullForStort: false,
    minIndreBunn,
    zStart: zS,
    modul: { mal, onsket, minYtre, apningKlemt, lommeKlemt, dybdeKlemt },
  };
}
