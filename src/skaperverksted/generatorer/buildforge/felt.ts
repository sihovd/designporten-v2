/**
 * Decorative shapes as fields (handoff §7.1): one field per shape, then the
 * shapes of a body combined in order, then cut back from the protected
 * zones so decoration can never fill the switch seat or the space under
 * the top.
 */
import type { Form, Kropp } from './parametre';
import { avrundetBoks, kule, plasser, smin, sylinder, TOM, type Boks, type Felt, type V3 } from './sdf';

/** The field of one shape, including its mirror copy when it is symmetric. */
export function formFelt(f: Form): Felt {
  let lokal: Felt;
  if (f.type === 'kule') lokal = kule(f.mal[0] / 2);
  else if (f.type === 'boks') lokal = avrundetBoks(f.mal[0] / 2, f.mal[1] / 2, f.mal[2] / 2, f.avrunding);
  else lokal = sylinder(f.mal[0] / 2, f.mal[2], f.avrunding);
  const felt = plasser(lokal, f.posisjon, f.rotasjon);
  if (!f.speilet) return felt;
  return (x, y, z) => Math.min(felt(x, y, z), felt(-x, y, z));
}

/** Rotation-independent bounding box of a shape (and its mirror copy). */
export function formBoks(f: Form): Boks {
  const r =
    f.type === 'kule'
      ? f.mal[0] / 2
      : f.type === 'boks'
        ? Math.hypot(f.mal[0], f.mal[1], f.mal[2]) / 2
        : Math.hypot(f.mal[0] / 2, f.mal[2] / 2);
  // a smooth union can bulge by up to k/4 beyond the shapes
  const ekstra = f.operasjon === 'smelt' ? f.smelting / 4 : 0;
  const p = f.posisjon;
  const min: V3 = [p[0] - r - ekstra, p[1] - r - ekstra, p[2] - r - ekstra];
  const maks: V3 = [p[0] + r + ekstra, p[1] + r + ekstra, p[2] + r + ekstra];
  if (f.speilet) {
    const a = Math.max(Math.abs(min[0]), Math.abs(maks[0]));
    min[0] = Math.min(min[0], -maks[0], -a);
    maks[0] = Math.max(maks[0], -min[0], a);
  }
  return { min, maks };
}

export function formerI(former: Form[], kropp: Kropp): Form[] {
  return former.filter((f) => f.kropp === kropp);
}

/** Combined decoration of a body, before protection. Shapes apply in order. */
export function dekorFelt(former: Form[]): Felt {
  if (!former.length) return TOM;
  const felt = former.map((f) => ({ f, d: formFelt(f) }));
  return (x, y, z) => {
    let d = Infinity;
    for (const { f, d: g } of felt) {
      const v = g(x, y, z);
      if (f.operasjon === 'legg-til') d = Math.min(d, v);
      else if (f.operasjon === 'smelt') d = smin(d, v, f.smelting);
      else d = Math.max(d, -v);
    }
    return d;
  };
}

/** Decoration after the protected zone is cut out (and, for the base, everything below the plate). */
export function beskyttetDekor(dekor: Felt, sperre: Felt, kropp: Kropp): Felt {
  if (kropp === 'underdel') return (x, y, z) => Math.max(dekor(x, y, z), -sperre(x, y, z), -z);
  return (x, y, z) => Math.max(dekor(x, y, z), -sperre(x, y, z));
}

/** Bounding box of the material a list of shapes can add (subtractions add nothing). */
export function dekorBoks(former: Form[]): Boks | null {
  let b: Boks | null = null;
  for (const f of former) {
    if (f.operasjon === 'trekk-fra') continue;
    const fb = formBoks(f);
    b = b
      ? {
          min: [Math.min(b.min[0], fb.min[0]), Math.min(b.min[1], fb.min[1]), Math.min(b.min[2], fb.min[2])],
          maks: [
            Math.max(b.maks[0], fb.maks[0]),
            Math.max(b.maks[1], fb.maks[1]),
            Math.max(b.maks[2], fb.maks[2]),
          ],
        }
      : fb;
  }
  return b;
}
