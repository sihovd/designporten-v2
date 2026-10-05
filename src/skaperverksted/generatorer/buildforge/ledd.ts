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
import { MeshBygger, volum, type Mesh } from '../../geometri/mesh';
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

/**
 * A ball joint: a ball on a neck (male) that snaps into a spherical socket
 * (female) through a mouth narrower than the ball. It turns about every
 * axis and bends up to `maksBoy` in any direction. The mouth is a cone with
 * its tip in the ball's centre, so the neck meets the rim at the same bend
 * all the way out.
 */
export interface Kuleprofil {
  id: string;
  versjon: string;
  navn: string;
  fysiskStatus: 'ikke-testet' | 'testet';
  merknad: string;
  maal: {
    kuleDiameter: Maal;
    halsDiameter: Maal;
    /** Extra radius of the socket over the ball. */
    radialKlaring: Maal;
    /** Diameter of the socket mouth where it meets the cavity. Smaller than the ball, so the ball snaps in. */
    apningDiameter: Maal;
    vegg: Maal;
    mellomrom: Maal;
    /** Largest bend the joint is drawn for (degrees). */
    maksBoy: Maal;
  };
}

export const KULELEDD_PROVE: Kuleprofil = {
  id: 'kuleledd-prove',
  versjon: '0.1.0',
  navn: 'Kuleledd, prøveprofil',
  fysiskStatus: 'ikke-testet',
  merknad:
    'Prøveprofil. Ingen kule eller sokkel er testprintet, så det er ikke kjent om kula klikker inn, sitter for løst eller knekker halsen. Leddet holdes bare av friksjon og sokkelens innsnevring.',
  maal: {
    kuleDiameter: { navn: 'Kulediameter', verdi: 8, sikkerhet: 'proveverdi' },
    halsDiameter: { navn: 'Halsdiameter', verdi: 3.6, sikkerhet: 'proveverdi' },
    radialKlaring: { navn: 'Klaring rundt kula', verdi: 0.2, sikkerhet: 'proveverdi' },
    apningDiameter: { navn: 'Åpning i sokkelen', verdi: 7, sikkerhet: 'proveverdi' },
    vegg: { navn: 'Vegg rundt sokkelen', verdi: 1.6, sikkerhet: 'designstandard' },
    mellomrom: { navn: 'Mellomrom ved leddet', verdi: 0.6, sikkerhet: 'proveverdi' },
    maksBoy: { navn: 'Største bøy (grader)', verdi: 25, sikkerhet: 'designstandard' },
  },
};

const kuleprofiler = [KULELEDD_PROVE];

export function finnKuleprofil(id: string, versjon: string): Kuleprofil | undefined {
  return kuleprofiler.find((p) => p.id === id && p.versjon === versjon);
}

const RAD = Math.PI / 180;
/** Extra bend the clearances are drawn for, beyond the profile's largest bend (degrees). */
const BOYMARGIN = 5;
/** How far the neck reaches back into its own part (mm). */
const HALSINNFESTING = 2;

export interface Kulemal {
  kuleRadius: number;
  halsRadius: number;
  /** Cavity radius. */
  indre: number;
  /** Socket shell radius. */
  ytre: number;
  /** Half-angle of the mouth cone, measured from the axis towards the male part (radians). */
  apning: number;
  /** Distance from the connector point to the ball's centre (along the male's outward axis). */
  senter: number;
  flate: number;
  maksBoy: number;
  /** Largest bend before the neck touches the rim (degrees). */
  grenseBoy: number;
}

export function kulemal(p: Kuleprofil): Kulemal {
  const m = p.maal;
  const kuleRadius = m.kuleDiameter.verdi / 2;
  const halsRadius = m.halsDiameter.verdi / 2;
  const indre = kuleRadius + m.radialKlaring.verdi;
  const ytre = indre + m.vegg.verdi;
  const ro = m.apningDiameter.verdi / 2;
  const apning = Math.asin(Math.min(1, ro / indre));
  const flate = m.mellomrom.verdi / 2;
  const maksBoy = m.maksBoy.verdi;
  // the rim's lowest point when bent to the limit stays clear of the male's face
  const senter = ytre * Math.cos(Math.max(0, apning - (maksBoy + BOYMARGIN) * RAD)) + flate + 0.4;
  const grenseBoy = (apning - Math.asin(Math.min(1, halsRadius / indre))) / RAD;
  return { kuleRadius, halsRadius, indre, ytre, apning, senter, flate, maksBoy, grenseBoy };
}

/** Consistency of a ball joint profile. Empty when it holds together. */
export function sjekkKuleprofil(p: Kuleprofil): string[] {
  const k = kulemal(p);
  const ro = p.maal.apningDiameter.verdi / 2;
  const feil: string[] = [];
  if (ro >= k.kuleRadius) feil.push('Åpningen er ikke smalere enn kula, så kula holdes ikke på plass.');
  if (k.halsRadius >= ro) feil.push('Halsen er tykkere enn åpningen.');
  if (p.maal.radialKlaring.verdi <= 0) feil.push('Kula har ingen klaring i sokkelen.');
  if (p.maal.mellomrom.verdi <= 0) feil.push('Delene har ikke mellomrom ved leddet.');
  if (k.maksBoy + BOYMARGIN > k.grenseBoy)
    feil.push(`Halsen treffer kanten før ${k.maksBoy}° bøy (grensen er ${Math.floor(k.grenseBoy)}°).`);
  return feil;
}

/**
 * A closed solid of revolution about +Z from a profile in (r, z). The
 * profile starts and ends on the axis (r = 0); those ends become poles.
 */
export function dreid(profil: [number, number][], segmenter = 36): Mesh {
  const b = new MeshBygger();
  const n = profil.length;
  const forste = b.punkt(0, 0, profil[0]![1]);
  const ringer: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const [r, z] = profil[i]!;
    ringer.push(b.antallPunkter);
    for (let s = 0; s < segmenter; s++) {
      const a = (s / segmenter) * Math.PI * 2;
      b.punkt(r * Math.cos(a), r * Math.sin(a), z);
    }
  }
  const siste = b.punkt(0, 0, profil[n - 1]![1]);
  const v = (ring: number, s: number) => ringer[ring]! + (s % segmenter);
  for (let s = 0; s < segmenter; s++) {
    b.trekant(forste, v(0, s + 1), v(0, s));
    for (let i = 0; i < ringer.length - 1; i++) b.firkant(v(i, s), v(i, s + 1), v(i + 1, s + 1), v(i + 1, s));
    b.trekant(siste, v(ringer.length - 1, s), v(ringer.length - 1, s + 1));
  }
  const m = b.bygg();
  if (volum(m) < 0) {
    const ind = m.indekser;
    for (let i = 0; i < ind.length; i += 3) {
      const t = ind[i + 1]!;
      ind[i + 1] = ind[i + 2]!;
      ind[i + 2] = t;
    }
  }
  return m;
}

/** Points along an arc of radius r about (0, zc), at angles (from +Z) a0 → a1. */
function bue(r: number, zc: number, a0: number, a1: number, n: number): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [Math.max(0, r * Math.sin(a)), zc + r * Math.cos(a)] as [number, number];
  });
}

/** The ball and neck along +Z (connector point at z = 0, ball centre at senter). */
export function kuleMesh(k: Kulemal): Mesh {
  const a0 = Math.PI - Math.asin(k.halsRadius / k.kuleRadius);
  return dreid([
    [0, -HALSINNFESTING],
    [k.halsRadius, -HALSINNFESTING],
    ...bue(k.kuleRadius, k.senter, a0, 0, 24),
  ]);
}

/** The socket along +Z, the inward axis of the female part (ball centre at senter). */
export function sokkelMesh(k: Kulemal): Mesh {
  const ytreBue = bue(k.ytre, k.senter, 0, Math.PI - k.apning, 24);
  const indreBue = bue(k.indre, k.senter, Math.PI - k.apning, 0, 20);
  return dreid([...ytreBue, ...indreBue]);
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
export function kroppsledd(
  tilkoblet: Tilkobling[],
  profil: Leddprofil,
  kuleprofil: Kuleprofil = KULELEDD_PROVE,
): Kroppsledd {
  const k = leddmal(profil);
  const kk = kulemal(kuleprofil);
  const kjegle = Math.tan((kk.maksBoy + BOYMARGIN) * RAD);
  const kjerner: Leddkjerne[] = [];
  const plan: { c: V3; a: V3; r: number; flate: number; helning: number }[] = [];
  const sperrer: Felt[] = [];
  for (const { kobling: kb, radius } of tilkoblet) {
    const c = kb.posisjon;
    const a = normal(kb.akse);
    if (kb.familie === 'kule') {
      kuleledd(kb, c, a, radius, kk, kjegle, kjerner, plan, sperrer);
      continue;
    }
    plan.push({ c, a, r: radius + SVINGMARGIN, flate: k.flate, helning: 0 });
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
      for (const { c, a, r, flate, helning } of plan) {
        const dx = x - c[0],
          dy = y - c[1],
          dz = z - c[2];
        const s = dx * a[0] + dy * a[1] + dz * a[2];
        const radial = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - s * s));
        // removed where s > −flate − helning·radial and radial < r
        d = Math.max(d, Math.min(s + flate + helning * radial, r - radial));
      }
      for (const sp of sperrer) d = Math.max(d, -sp(x, y, z));
      return d;
    };
  };
  return { kjerner, kutt };
}

/**
 * A ball joint connector. The male part gets the ball on its neck, reaching
 * into the partner. The female part gets the socket inside its own side and
 * is cut back along a cone (not a plane), so it can bend `maksBoy` about the
 * ball's centre without meeting the male part; the analysis in
 * docs/skaperverksted.md › Kuleledd shows the male side then needs only the
 * plane. The cavity and the space the neck swings through stay clear of
 * the female part's decoration.
 */
function kuleledd(
  kb: Kobling,
  c: V3,
  a: V3,
  radius: number,
  kk: Kulemal,
  kjegle: number,
  kjerner: Leddkjerne[],
  plan: { c: V3; a: V3; r: number; flate: number; helning: number }[],
  sperrer: Felt[],
) {
  const r = radius + SVINGMARGIN + kk.senter * Math.sin((kk.maksBoy + BOYMARGIN) * RAD);
  if (kb.kjonn === 'hann') {
    plan.push({ c, a, r, flate: kk.flate, helning: 0 });
    const q: V3 = [c[0] + a[0] * kk.senter, c[1] + a[1] * kk.senter, c[2] + a[2] * kk.senter];
    const hals = sylinderLangs(c, a, kk.halsRadius, -HALSINNFESTING, kk.senter);
    kjerner.push({
      navn: `Kule ved ${kb.navn.toLowerCase()}`,
      kobling: kb.id,
      felt: (x, y, z) => Math.min(Math.hypot(x - q[0], y - q[1], z - q[2]) - kk.kuleRadius, hals(x, y, z)),
      boks: boksLangs(c, a, kk.kuleRadius, -HALSINNFESTING, kk.senter + kk.kuleRadius),
      mesh: langsAkse(kuleMesh(kk), c, a),
    });
    return;
  }
  plan.push({ c, a, r, flate: kk.flate, helning: kjegle });
  const inn: V3 = [-a[0], -a[1], -a[2]];
  const q: V3 = [c[0] + inn[0] * kk.senter, c[1] + inn[1] * kk.senter, c[2] + inn[2] * kk.senter];
  // relative to the ball centre: axial along the inward axis, radial from it
  const lokal = (x: number, y: number, z: number) => {
    const dx = x - q[0],
      dy = y - q[1],
      dz = z - q[2];
    const t = dx * inn[0] + dy * inn[1] + dz * inn[2];
    const l = Math.hypot(dx, dy, dz);
    return { t, l, radial: Math.sqrt(Math.max(0, l * l - t * t)) };
  };
  // inside the mouth cone (half-angle b from the axis towards the male part) when negative
  const munn = (b: number) => (x: number, y: number, z: number) => {
    const { t, radial } = lokal(x, y, z);
    return radial * Math.cos(b) + t * Math.sin(b);
  };
  const apning = munn(kk.apning);
  kjerner.push({
    navn: `Kulesokkel ved ${kb.navn.toLowerCase()}`,
    kobling: kb.id,
    felt: (x, y, z) => {
      const { l } = lokal(x, y, z);
      return Math.max(l - kk.ytre, kk.indre - l, -apning(x, y, z));
    },
    boks: boksLangs(c, inn, kk.ytre, kk.senter - kk.ytre, kk.senter + kk.ytre),
    mesh: langsAkse(sokkelMesh(kk), c, inn),
  });
  const sving = munn(Math.min(Math.PI / 2, kk.apning + 3 * RAD));
  sperrer.push((x, y, z) => {
    const { t, l } = lokal(x, y, z);
    const hulrom = l - (kk.indre + 0.3);
    // the cone only between the ball and a little beyond the joint face
    const kjegleRom = Math.max(sving(x, y, z), -t - kk.senter - 2);
    return Math.min(hulrom, kjegleRom);
  });
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
