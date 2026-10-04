/**
 * Joint mechanics for connected body parts: the joint profile and the
 * functional geometry of one connector.
 *
 * A connection joins a male connector (hann: a peg) and a female connector
 * (hunn: a blind hole in a boss) of the same family. Each connector has a
 * point and an outward axis in its body's frame; the two axes point at each
 * other when connected. Each body's decoration is cut back to its own side
 * of a plane through the connector (s ≤ −mellomrom/2 along its outward
 * axis), so the parts keep a gap and the joint can turn about the axis.
 *
 * Every mechanical number comes from a profile the project only names. The
 * only profile is a trial profile: nothing has been printed, so the peg fit
 * is not confirmed. Open connectors (not connected) produce no geometry.
 */
import type { Mesh } from '../../geometri/mesh';
import type { Kobling } from './parametre';
import type { Maal } from './profil';
import { prisme, sirkel } from './prisme';
import { sylinder, type Boks, type Felt, type V3 } from './sdf';

export interface Leddprofil {
  id: string;
  versjon: string;
  navn: string;
  fysiskStatus: 'ikke-testet' | 'testet';
  merknad: string;
  maal: {
    pluggDiameter: Maal;
    /** Extra radius of the hole over the peg. Decides whether the joint turns stiffly or loosely. */
    radialKlaring: Maal;
    hullDybde: Maal;
    /** How far the peg reaches back into its own part. */
    pluggInnfesting: Maal;
    /** Wall around the hole and above its bottom. */
    vegg: Maal;
    /** Gap between neighbouring parts at the joint. */
    mellomrom: Maal;
    /** Space between the end of the peg and the bottom of the hole. */
    endeklaring: Maal;
  };
}

/** The swivel joint's trial profile. The id is kept from BuildForge 0.2 so saved projects still resolve. */
export const FIGURLEDD_PROVE: Leddprofil = {
  id: 'figurledd-prove',
  versjon: '0.1.0',
  navn: 'Pluggledd, prøveprofil',
  fysiskStatus: 'ikke-testet',
  merknad:
    'Prøveprofil. Ingen del er testprintet, så det er ikke kjent om pluggene sitter for stramt eller for løst. Leddene holdes bare av friksjon.',
  maal: {
    pluggDiameter: { navn: 'Pluggdiameter', verdi: 5, sikkerhet: 'proveverdi' },
    radialKlaring: { navn: 'Klaring rundt pluggen', verdi: 0.2, sikkerhet: 'proveverdi' },
    hullDybde: { navn: 'Hulldybde', verdi: 6, sikkerhet: 'designstandard' },
    pluggInnfesting: { navn: 'Plugg inn i egen del', verdi: 4, sikkerhet: 'designstandard' },
    vegg: { navn: 'Vegg rundt hullet', verdi: 1.6, sikkerhet: 'designstandard' },
    mellomrom: { navn: 'Mellomrom ved leddet', verdi: 0.6, sikkerhet: 'proveverdi' },
    endeklaring: { navn: 'Klaring ved pluggenden', verdi: 0.5, sikkerhet: 'proveverdi' },
  },
};

const leddprofiler = [FIGURLEDD_PROVE];

export function finnLeddprofil(id: string, versjon: string): Leddprofil | undefined {
  return leddprofiler.find((p) => p.id === id && p.versjon === versjon);
}

/** Extra space between decoration and the hole, beyond the hole itself. */
const SPERREMARGIN = 0.5;

export interface Leddmal {
  pluggRadius: number;
  hullRadius: number;
  bossRadius: number;
  /** Distance from the connector point to each part's face along the axis. */
  flate: number;
  hullBunn: number;
  bossTopp: number;
  pluggStart: number;
  pluggEnde: number;
  sperreRadius: number;
}

export function leddmal(p: Leddprofil): Leddmal {
  const m = p.maal;
  const pluggRadius = m.pluggDiameter.verdi / 2;
  const hullRadius = pluggRadius + m.radialKlaring.verdi;
  const flate = m.mellomrom.verdi / 2;
  const hullBunn = flate + m.hullDybde.verdi;
  return {
    pluggRadius,
    hullRadius,
    bossRadius: hullRadius + m.vegg.verdi,
    flate,
    hullBunn,
    bossTopp: hullBunn + m.vegg.verdi,
    pluggStart: -m.pluggInnfesting.verdi,
    pluggEnde: hullBunn - m.endeklaring.verdi,
    sperreRadius: hullRadius + SPERREMARGIN,
  };
}

/** Consistency of a joint profile. Empty when it holds together. */
export function sjekkLeddprofil(p: Leddprofil): string[] {
  const k = leddmal(p);
  const feil: string[] = [];
  if (k.sperreRadius >= k.bossRadius) feil.push('Veggen rundt hullet er tynnere enn sperresonen.');
  if (k.pluggEnde <= k.flate) feil.push('Pluggen når ikke inn i hullet.');
  if (p.maal.radialKlaring.verdi <= 0) feil.push('Pluggen har ingen klaring i hullet.');
  if (p.maal.mellomrom.verdi <= 0) feil.push('Delene har ikke mellomrom ved leddet.');
  return feil;
}

// ---------------------------------------------------------------------------
// Geometry along an axis

/** Right-handed basis (u, v, a) for an axis a. */
export function basis(a: V3): { u: V3; v: V3 } {
  const h: V3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u: V3 = [h[1] * a[2] - h[2] * a[1], h[2] * a[0] - h[0] * a[2], h[0] * a[1] - h[1] * a[0]];
  const l = Math.hypot(...u);
  u = [u[0] / l, u[1] / l, u[2] / l];
  const v: V3 = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  return { u, v };
}

/** A mesh built along +Z, placed at c with +Z along a. */
function langsAkse(m: Mesh, c: V3, a: V3): Mesh {
  const { u, v } = basis(a);
  const p = new Float32Array(m.posisjoner.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = m.posisjoner[i]!,
      y = m.posisjoner[i + 1]!,
      z = m.posisjoner[i + 2]!;
    for (let k = 0; k < 3; k++) p[i + k] = c[k]! + x * u[k]! + y * v[k]! + z * a[k]!;
  }
  return { posisjoner: p, indekser: m.indekser };
}

/** A cylinder field along a through c, from s0 to s1 (s measured from c along a). */
function sylinderLangs(c: V3, a: V3, r: number, s0: number, s1: number): Felt {
  const { u, v } = basis(a);
  const f = sylinder(r, s1 - s0, 0);
  const sm = (s0 + s1) / 2;
  return (x, y, z) => {
    const dx = x - c[0],
      dy = y - c[1],
      dz = z - c[2];
    return f(
      dx * u[0] + dy * u[1] + dz * u[2],
      dx * v[0] + dy * v[1] + dz * v[2],
      dx * a[0] + dy * a[1] + dz * a[2] - sm,
    );
  };
}

function boksLangs(c: V3, a: V3, r: number, s0: number, s1: number): Boks {
  const ender: V3[] = [s0, s1].map((s) => [c[0] + a[0] * s, c[1] + a[1] * s, c[2] + a[2] * s] as V3);
  const min = [0, 1, 2].map((k) => Math.min(ender[0]![k]!, ender[1]![k]!) - r) as V3;
  const maks = [0, 1, 2].map((k) => Math.max(ender[0]![k]!, ender[1]![k]!) + r) as V3;
  return { min, maks };
}

const normal = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface Leddkjerne {
  navn: string;
  kobling: string;
  felt: Felt;
  boks: Boks;
  mesh: Mesh;
}

export interface Kroppsledd {
  /** Locked joint parts of this body (its pegs and sockets). */
  kjerner: Leddkjerne[];
  /** Decoration after the joint cuts: away from every partner's side of its joint, out of every hole. */
  kutt: (dekor: Felt) => Felt;
}

/** A connected connector and how far its partner reaches from the joint axis (mm). */
export interface Tilkobling {
  kobling: Kobling;
  radius: number;
}

/** Extra room around the space a partner swings through (mm). */
const SVINGMARGIN = 1;

/**
 * The joint parts and cuts of one body for its connected connectors, in its
 * own frame. Decoration is removed on the partner's side of each joint plane
 * (s > −mellomrom/2 along the outward axis) within the cylinder the partner
 * sweeps when it turns about the axis, so the two parts at a joint stay
 * clear of each other in every position. Decoration farther out is kept.
 */
export function kroppsledd(tilkoblet: Tilkobling[], profil: Leddprofil): Kroppsledd {
  const k = leddmal(profil);
  const kjerner: Leddkjerne[] = [];
  const plan: { c: V3; a: V3; r: number }[] = [];
  const sperrer: Felt[] = [];
  for (const { kobling: kb, radius } of tilkoblet) {
    const c = kb.posisjon;
    const a = normal(kb.akse);
    plan.push({ c, a, r: radius + SVINGMARGIN });
    if (kb.kjonn === 'hann') {
      kjerner.push({
        navn: `Plugg ved ${kb.navn.toLowerCase()}`,
        kobling: kb.id,
        felt: sylinderLangs(c, a, k.pluggRadius, k.pluggStart, k.pluggEnde),
        boks: boksLangs(c, a, k.pluggRadius, k.pluggStart, k.pluggEnde),
        mesh: langsAkse(prisme(sirkel(k.pluggRadius, 32), k.pluggStart, k.pluggEnde), c, a),
      });
    } else {
      // the socket is built along the inward axis: face at flate, hole bottom at hullBunn
      const inn: V3 = [-a[0], -a[1], -a[2]];
      const boss = sylinderLangs(c, inn, k.bossRadius, k.flate, k.bossTopp);
      const hull = sylinderLangs(c, inn, k.hullRadius, k.flate - 1, k.hullBunn);
      kjerner.push({
        navn: `Leddhull ved ${kb.navn.toLowerCase()}`,
        kobling: kb.id,
        felt: (x, y, z) => Math.max(boss(x, y, z), -hull(x, y, z)),
        boks: boksLangs(c, inn, k.bossRadius, k.flate, k.bossTopp),
        mesh: langsAkse(
          prisme(sirkel(k.bossRadius, 40), k.flate, k.bossTopp, [
            { omriss: sirkel(k.hullRadius, 32), z0: k.flate, z1: k.hullBunn },
          ]),
          c,
          inn,
        ),
      });
      sperrer.push(sylinderLangs(c, inn, k.sperreRadius, -1000, k.hullBunn + 0.3));
    }
  }
  const kutt = (dekor: Felt): Felt => {
    if (!plan.length) return dekor;
    return (x, y, z) => {
      let d = dekor(x, y, z);
      for (const { c, a, r } of plan) {
        const dx = x - c[0],
          dy = y - c[1],
          dz = z - c[2];
        const s = dx * a[0] + dy * a[1] + dz * a[2];
        const radial = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - s * s));
        // removed where s > −flate and radial < r
        d = Math.max(d, Math.min(s + k.flate, r - radial));
      }
      for (const sp of sperrer) d = Math.max(d, -sp(x, y, z));
      return d;
    };
  };
  return { kjerner, kutt };
}

/** Apply a placement (x → m·x + t, m orthonormal, possibly mirrored) to a mesh; keeps it outward-facing. */
export function transformerMesh(mesh: Mesh, m: number[], t: V3): Mesh {
  const ut: Mesh = {
    posisjoner: new Float32Array(mesh.posisjoner),
    indekser: new Uint32Array(mesh.indekser),
  };
  const p = ut.posisjoner;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!,
      y = p[i + 1]!,
      z = p[i + 2]!;
    p[i] = m[0]! * x + m[1]! * y + m[2]! * z + t[0];
    p[i + 1] = m[3]! * x + m[4]! * y + m[5]! * z + t[1];
    p[i + 2] = m[6]! * x + m[7]! * y + m[8]! * z + t[2];
  }
  const det =
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
  if (det < 0) {
    const ind = ut.indekser;
    for (let i = 0; i < ind.length; i += 3) {
      const a = ind[i + 1]!;
      ind[i + 1] = ind[i + 2]!;
      ind[i + 2] = a;
    }
  }
  return ut;
}
