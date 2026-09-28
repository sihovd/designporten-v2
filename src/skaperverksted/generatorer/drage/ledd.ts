/**
 * The articulation joint standard. Functional geometry owned by the
 * generator, never by the part library: every body part (procedural or
 * modelled) connects through this joint, so every combination prints in
 * place and moves.
 *
 * The joint is a vertical hinge printed in place, lying on the bed:
 *
 *   - the FRONT part carries a socket: a biconical cavity (widest at mid
 *     height, 45° walls) open to the bed, roofed over, with a wedge-shaped
 *     slot towards the rear;
 *   - the REAR part carries a biconical pin inside that cavity, joined to
 *     its body by a straight arm through the slot.
 *
 * All faces are vertical or 45°, so nothing needs support. The pin is
 * wider at mid height than both the cavity's openings and the slot, so it
 * is captured. The slot's edges are the rotation stops.
 *
 * Tolerances: the clearance does not scale linearly with the part. It is a
 * printer property that grows slowly with part size (warping, elephant's
 * foot on larger prints), while the joint's proportions scale with the
 * dragon down to fixed minimums for strength.
 */

export interface LeddMal {
  /** Clearance between moving surfaces, measured normal to the surface (mm). */
  klaring: number;
  /** Horizontal gap on 45° faces that gives `klaring` normal to them. */
  skraaKlaring: number;
  /** Cavity radius at the bed and at the top of the pin (mm). */
  a: number;
  /** Height of the pin and the biconical part of the cavity (mm). */
  h: number;
  /** Cavity height incl. vertical clearance above the pin. */
  hulromHoyde: number;
  /** Solid roof over the cavity before the dome starts. */
  tak: number;
  /** Minimum wall beside the cavity. */
  vegg: number;
  /** Arm width through the slot. */
  armBredde: number;
  /** Slot half-angle, radians, measured from the rearward axis. */
  spalteVinkel: number;
  /** Rotation each way before the arm meets the slot edge, radians. */
  bevegelse: number;
  /** Gap between neighbouring parts' bodies in the print pose. */
  mellomrom: number;
}

const REFERANSE = 160;

export function klaringFor(lengde: number): number {
  return Math.min(0.6, Math.max(0.35, 0.3 + 0.0012 * lengde));
}

/** Joint dimensions for a dragon of `lengde` mm. */
export function leddMal(lengde: number): LeddMal {
  const k = lengde / REFERANSE;
  const klaring = klaringFor(lengde);
  const skraaKlaring = klaring * Math.SQRT2;
  const a = Math.max(1.8, 1.8 * k);
  const h = Math.max(3.6, 3.8 * k);
  const vegg = Math.max(1.2, 1.2 * k);
  const tak = Math.max(0.8, 1 * k);
  const armBredde = Math.max(1.2, 0.7 * a);
  const spalteVinkel = (48 * Math.PI) / 180;
  const bevegelse = spalteVinkel - Math.asin(armBredde / 2 / a);
  return {
    klaring,
    skraaKlaring,
    a,
    h,
    hulromHoyde: h + klaring,
    tak,
    vegg,
    armBredde,
    spalteVinkel,
    bevegelse,
    mellomrom: klaring + 0.3,
  };
}

/** Cavity radius at height z (0 ≤ z ≤ hulromHoyde). */
export function hulromRadius(m: LeddMal, z: number): number {
  if (z >= m.h) return m.a;
  return m.a + Math.min(z, m.h - z);
}

/** Pin radius at height z (0 ≤ z ≤ h). */
export function tappRadius(m: LeddMal, z: number): number {
  return hulromRadius(m, Math.min(z, m.h)) - m.skraaKlaring;
}

/** Widest cavity radius; the socket needs `vegg` more around it. */
export function hulromMaks(m: LeddMal): number {
  return m.a + m.h / 2;
}

/** Radius the socket occupies in the front part (cavity plus wall). */
export function sokkelRadius(m: LeddMal): number {
  return hulromMaks(m) + m.vegg;
}

export interface Leddkontroll {
  ok: boolean;
  feil: string[];
}

/**
 * Checks the joint's own invariants: clearance around the arm in the slot,
 * pin captured by the slot and the openings, printable pin.
 */
export function kontrollerLedd(m: LeddMal): Leddkontroll {
  const feil: string[] = [];
  const armAvstand = m.a * Math.sin(m.spalteVinkel) - m.armBredde / 2;
  if (armAvstand < m.klaring) feil.push('Armen har for liten klaring i spalten.');
  const tappMidt = tappRadius(m, m.h / 2);
  const spalteMidt = hulromMaks(m) * Math.sin(m.spalteVinkel);
  if (tappMidt <= spalteMidt + 0.15) feil.push('Tappen kan gli ut gjennom spalten.');
  if (tappMidt <= m.a + 0.3) feil.push('Tappen kan løftes ut av hulrommet.');
  if (tappRadius(m, 0) < 0.6) feil.push('Tappen er for tynn ved platen.');
  if (m.bevegelse < (10 * Math.PI) / 180) feil.push('Leddet beveger seg for lite.');
  return { ok: feil.length === 0, feil };
}
