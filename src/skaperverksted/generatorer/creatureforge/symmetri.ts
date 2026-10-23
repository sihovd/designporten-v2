/**
 * Symmetry (handoff: «Symmetri kan aktiveres; midtlinje vises ved behov»).
 * Left and right snap points are named `-v` and `-h`. A part's partner is
 * the part in the same place on the other side: on the mirrored point of the
 * same parent, or on the same point of the parent's partner.
 *
 * Mirroring a joint's values across the figure's centre plane: the offset's
 * X changes sign, and so do the turns about the joint's axis and up
 * direction (X and Z) and the dome's orientation; the turn about the side
 * axis (Y), the distance, the size and the dome's other values stay.
 */
import type { CfParametre, Ende, Kuppel, Ledd } from './parametre';
import { leddTil } from './plassering';

export { side } from './plassering';
import type { V3 } from './vektor';

export const speilId = (id: string): string | null =>
  id.endsWith('-v') ? `${id.slice(0, -2)}-h` : id.endsWith('-h') ? `${id.slice(0, -2)}-v` : null;

/** The point on the other side that matches a parent snap point, if there is one. */
export function speiletFeste(p: CfParametre, forelder: Ende): Ende | null {
  const sp = speilId(forelder.punkt);
  if (sp) return { del: forelder.del, punkt: sp };
  const pf = partner(p, forelder.del);
  return pf ? { del: pf, punkt: forelder.punkt } : null;
}

/** The part in the same place on the other side of the figure. */
export function partner(p: CfParametre, delId: string): string | null {
  const l = leddTil(p, delId);
  if (!l) return null;
  const motsatt = speiletFeste(p, l.forelder);
  if (!motsatt) return null;
  const m = p.ledd.find((x) => x.forelder.del === motsatt.del && x.forelder.punkt === motsatt.punkt);
  return m && m.barn.del !== delId ? m.barn.del : null;
}

export function partnerLedd(p: CfParametre, leddId: string): Ledd | undefined {
  const l = p.ledd.find((x) => x.id === leddId);
  const b = l && partner(p, l.barn.del);
  return b ? leddTil(p, b) : undefined;
}

const speilV3 = (v: V3): V3 => [-v[0] + 0, v[1], v[2]];
const speilRot = (v: V3): V3 => [-v[0] + 0, v[1], -v[2] + 0];

/** A joint change as it applies on the other side. */
export function speilLeddendring(e: Partial<Ledd>): Partial<Ledd> {
  const ut: Partial<Ledd> = { ...e };
  if (e.forskyvning) ut.forskyvning = speilV3(e.forskyvning);
  if (e.rotasjon) ut.rotasjon = speilRot(e.rotasjon);
  if (e.kuppel) ut.kuppel = speilKuppelendring(e.kuppel) as Kuppel;
  return ut;
}

export function speilKuppelendring(e: Partial<Kuppel>): Partial<Kuppel> {
  return e.retning === undefined ? e : { ...e, retning: -e.retning + 0 };
}
