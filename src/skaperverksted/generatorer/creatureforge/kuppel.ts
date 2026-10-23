/**
 * The Boolean dome (Sivert, 2026-10-23): a negative volume centred on a
 * joint and cut from both parts it joins. It is a curved shell: its
 * mid-surface is a spherical cap with the given diameter and depth (rise)
 * whose top sits on the joint point, bulging towards the child, and its
 * thickness changes linearly from `tykkelseSenter` on the axis to
 * `tykkelseKant` at the rim. The thickness is the thickness of the cut, not
 * of the material left. The dome is tilted by `helning` towards the
 * direction `retning` (degrees round the joint axis from the joint's up
 * direction). It is built in the joint's frame, so it follows the joint, and
 * it has nothing to do with the mechanism's print clearance.
 */
import type { Boks, Felt } from './sdf';
import type { Kuppel } from './parametre';
import { kryss, lengde, omAkse, ENHET, type M3, type V3 } from './vektor';

/** The dome's own axes in the joint frame (columns: axis, s, v). */
export function kuppelRamme(k: Kuppel): M3 {
  if (Math.abs(k.helning) < 1e-9) return ENHET;
  const r = (k.retning * Math.PI) / 180;
  const mot: V3 = [0, Math.sin(r), Math.cos(r)];
  const akse = kryss([1, 0, 0], mot);
  return lengde(akse) < 1e-9 ? ENHET : omAkse(akse, k.helning);
}

/** The cut as a field in the joint frame. */
export function kuppelFelt(k: Kuppel): Felt {
  const m = kuppelRamme(k);
  // into the dome's own frame (the transpose of its rotation)
  const lokal = (x: number, y: number, z: number): [number, number, number] => [
    m[0]! * x + m[3]! * y + m[6]! * z,
    m[1]! * x + m[4]! * y + m[7]! * z,
    m[2]! * x + m[5]! * y + m[8]! * z,
  ];
  const r = k.diameter / 2;
  const h = Math.min(k.dybde, r);
  const tc = k.tykkelseSenter,
    tk = k.tykkelseKant;
  const tykkelse = (rho: number) => tc + (tk - tc) * Math.min(1, rho / r);
  if (h < 0.01)
    return (x, y, z) => {
      const [t, s, v] = lokal(x, y, z);
      const rho = Math.hypot(s, v);
      return Math.max(Math.abs(t) - tykkelse(rho) / 2, rho - r);
    };
  // the sphere through the rim and the top; the top sits on the joint point, the rim h towards the parent
  const R = (r * r + h * h) / (2 * h);
  const ct = -R;
  return (x, y, z) => {
    const [t, s, v] = lokal(x, y, z);
    const rho = Math.hypot(s, v);
    const d = Math.hypot(t - ct, rho);
    return Math.max(Math.abs(d - R) - tykkelse(rho) / 2, rho - r, ct - t);
  };
}

/** A box round the dome in the joint frame, whatever its tilt. */
export function kuppelBoks(k: Kuppel): Boks {
  const r = k.diameter / 2 + Math.max(k.tykkelseSenter, k.tykkelseKant) + Math.min(k.dybde, k.diameter / 2);
  return { min: [-r, -r, -r], maks: [r, r, r] };
}
