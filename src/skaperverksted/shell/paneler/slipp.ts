/**
 * Where a dragged panel group lands (pure geometry, so it can be tested).
 * Rectangles are in CSS px in the same coordinate space as the pointer.
 */
import type { DokkSide } from './modell';

export interface Rekt {
  x: number;
  y: number;
  b: number;
  h: number;
}

export interface GruppeRekt {
  id: string;
  rekt: Rekt;
  /** Dock side, or null for a floating group. */
  dokk: DokkSide | null;
  /** Position among the groups of the same dock column. */
  indeks: number;
}

export type Mal =
  | { type: 'dokk'; side: DokkSide; indeks: number }
  | { type: 'fane'; gruppeId: string }
  | { type: 'flyt' }
  | { type: 'ingen' };

const inni = (p: { x: number; y: number }, r: Rekt) =>
  p.x >= r.x && p.x <= r.x + r.b && p.y >= r.y && p.y <= r.y + r.h;

export function finnMal(
  p: { x: number; y: number },
  flate: Rekt,
  grupper: GruppeRekt[],
  kolonner: { side: DokkSide; rekt: Rekt }[],
  draId: string,
): Mal {
  if (!inni(p, flate)) return { type: 'flyt' };
  const egen = grupper.find((g) => g.id === draId);
  // floating groups sit on top of the docks (later = higher)
  const andre = grupper.filter((g) => g.id !== draId);
  const ordnet = [...andre.filter((g) => g.dokk === null).reverse(), ...andre.filter((g) => g.dokk !== null)];
  for (const g of ordnet) {
    if (!inni(p, g.rekt)) continue;
    if (g.dokk === null) return { type: 'fane', gruppeId: g.id };
    const rel = (p.y - g.rekt.y) / Math.max(1, g.rekt.h);
    if (rel < 0.25) return { type: 'dokk', side: g.dokk, indeks: g.indeks };
    if (rel > 0.75) return { type: 'dokk', side: g.dokk, indeks: g.indeks + 1 };
    return { type: 'fane', gruppeId: g.id };
  }
  if (egen && egen.dokk !== null && inni(p, egen.rekt)) return { type: 'ingen' };
  for (const k of kolonner) if (inni(p, k.rekt)) return { type: 'dokk', side: k.side, indeks: Infinity };
  const kant = Math.min(120, flate.b * 0.15);
  if (p.x - flate.x < kant) return { type: 'dokk', side: 'venstre', indeks: Infinity };
  if (flate.x + flate.b - p.x < kant) return { type: 'dokk', side: 'hoyre', indeks: Infinity };
  return { type: 'flyt' };
}

/** The highlight shown for a target (null when there is nothing to show). */
export function malRekt(
  mal: Mal,
  flate: Rekt,
  grupper: GruppeRekt[],
  kolonner: { side: DokkSide; rekt: Rekt }[],
  dokkB: Record<DokkSide, number>,
): Rekt | null {
  if (mal.type === 'fane') return grupper.find((g) => g.id === mal.gruppeId)?.rekt ?? null;
  if (mal.type !== 'dokk') return null;
  const kolonne = grupper.filter((g) => g.dokk === mal.side);
  const bred = kolonner.find((k) => k.side === mal.side)?.rekt;
  const x = bred?.x ?? (mal.side === 'venstre' ? flate.x : flate.x + flate.b - dokkB[mal.side]);
  const b = bred?.b ?? dokkB[mal.side];
  if (!kolonne.length) return { x, y: flate.y, b, h: flate.h };
  const at = kolonne[mal.indeks];
  if (at) return { x, y: at.rekt.y - 2, b, h: 4 };
  const sist = kolonne.at(-1)!;
  return { x, y: sist.rekt.y + sist.rekt.h - 2, b, h: 4 };
}
