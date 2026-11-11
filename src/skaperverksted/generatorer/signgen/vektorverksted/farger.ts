/**
 * Colour control for Vectorium (Sivert, 2026-11-11): the colours of a
 * vector with their area, merging colours that are nearly the same, and
 * reducing the vector to a number of colours. A colour that goes away takes
 * the colour it is closest to; the colour with the larger area wins.
 */
import { byttFarge, tegnetAreal, type Vektormodell } from './modell';

export interface Fargebruk {
  farge: string;
  deler: number;
  /** Area in vector units². */
  areal: number;
}

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? [...h].map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};

/** Distance between two colours, weighted for how the eye sees them (0 to about 765). */
export function fargeavstand(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2,
    dg = g1 - g2,
    db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** The colours of the vector, largest area first. */
export function fargebruk(m: Vektormodell): Fargebruk[] {
  const kart = new Map<string, Fargebruk>();
  for (const d of m.deler) {
    if (!d) continue;
    const f = kart.get(d.farge) ?? { farge: d.farge, deler: 0, areal: 0 };
    f.deler++;
    f.areal += Math.abs(tegnetAreal(m, d));
    kart.set(d.farge, f);
  }
  return [...kart.values()].sort((a, b) => b.areal - a.areal);
}

/** Merges the closest pair of colours (the smaller into the larger); null when only one colour is left. */
function slaSammenNaermeste(
  m: Vektormodell,
  bruk: Fargebruk[],
): { modell: Vektormodell; avstand: number } | null {
  if (bruk.length < 2) return null;
  let best: { liten: string; stor: string; avstand: number } | null = null;
  for (let i = 0; i < bruk.length; i++)
    for (let j = i + 1; j < bruk.length; j++) {
      const a = bruk[i]!,
        b = bruk[j]!;
      const d = fargeavstand(a.farge, b.farge);
      if (!best || d < best.avstand) {
        const [stor, liten] = a.areal >= b.areal ? [a, b] : [b, a];
        best = { liten: liten.farge, stor: stor.farge, avstand: d };
      }
    }
  return { modell: byttFarge(m, best!.liten, best!.stor), avstand: best!.avstand };
}

/** Every pair of colours closer than `terskel` becomes one colour. */
export function slaSammenLikeFarger(m: Vektormodell, terskel: number): Vektormodell {
  let modell = m;
  for (;;) {
    const bruk = fargebruk(modell);
    const r = slaSammenNaermeste(modell, bruk);
    if (!r || r.avstand > terskel) return modell;
    modell = r.modell;
  }
}

/** Merges the closest colours until at most `antall` are left. */
export function reduserFarger(m: Vektormodell, antall: number): Vektormodell {
  let modell = m;
  while (fargebruk(modell).length > Math.max(1, antall)) {
    const r = slaSammenNaermeste(modell, fargebruk(modell));
    if (!r) break;
    modell = r.modell;
  }
  return modell;
}

/** Every part gets one colour: for a vinyl cut or a one-colour print. */
export function flatUt(m: Vektormodell, farge: string): Vektormodell {
  let modell = m;
  for (const f of fargebruk(m)) if (f.farge !== farge) modell = byttFarge(modell, f.farge, farge);
  return modell;
}
