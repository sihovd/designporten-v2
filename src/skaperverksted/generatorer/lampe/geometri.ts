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
import { antallRader, antallVinkler, lagForm, type Form } from './form';
import { sokler, type LampeParametre } from './parametre';

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
}

function indreRadius(form: Form, theta: number, t: number, hoyde: number, vegg: number): number {
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
  const form = lagForm(p);
  const N = antallVinkler(p);
  const M = antallRader(p, N);
  const H = p.hoyde;
  const vegg = p.veggtykkelse;
  const sokkel = sokler[p.sokkel];
  const harBunn = sokkel.hullDiameter !== null;
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
  } else if (sokkel.hullDiameter === 0) {
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
    const onsket = sokkel.hullDiameter! / 2;
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
  };
}
