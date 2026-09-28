/**
 * Side profiles. A profile describes how a layer's wall rises from its
 * bottom (t = 0) to its top (t = 1) as an inset from the layer's outline.
 *
 * The curve is a chain of cubic Bézier segments in normalised space:
 *   u ∈ [0, 1]: horizontal position across the profile width
 *               (0 = the outline itself, 1 = fully inset by `bredde` mm)
 *   t ∈ [0, 1]: height fraction of the layer
 * The wall at height t is the outline offset inwards by inset(t) × bredde.
 * This is physical geometry: the mesher samples the curve and offsets the
 * outline per sample (see geometri/ekstruder.ts).
 */

export interface ProfilPunkt {
  /** Anchor. */
  u: number;
  t: number;
  /** Outgoing handle (towards the next anchor), absolute coordinates. */
  ut?: { u: number; t: number };
  /** Incoming handle (from the previous anchor), absolute coordinates. */
  inn?: { u: number; t: number };
}

export type ProfilType =
  'rett' | 'avrundet' | 'konveks' | 'konkav' | 's-kurve' | 'trapp' | 'fas' | 'egendefinert';

export interface Profil {
  type: ProfilType;
  /** Horizontal extent of the profile (mm). 0 = vertical wall. */
  bredde: number;
  /** Anchors from bottom (t = 0) to top (t = 1). */
  punkter: ProfilPunkt[];
  /** Steps for the stepped preset. */
  trinn: number;
}

export const rettProfil = (): Profil => ({
  type: 'rett',
  bredde: 0,
  punkter: [
    { u: 0, t: 0 },
    { u: 0, t: 1 },
  ],
  trinn: 2,
});

const K = 0.5523; // cubic approximation of a quarter circle

/** Presets from the spec: straight, rounded, convex (Bue), concave, S-curve, stepped, chamfer (Knekk). */
export function forhandsvalg(type: Exclude<ProfilType, 'egendefinert'>, bredde = 1.5, trinn = 3): Profil {
  switch (type) {
    case 'rett':
      return rettProfil();
    case 'fas':
      return {
        type,
        bredde,
        punkter: [
          { u: 0, t: 0 },
          { u: 0, t: 0.5 },
          { u: 1, t: 1 },
        ],
        trinn,
      };
    case 'avrundet':
      // vertical wall that rounds over into the top: quarter circle in the upper part
      return {
        type,
        bredde,
        punkter: [
          { u: 0, t: 0 },
          { u: 0, t: 0.35, ut: { u: 0, t: 0.35 + 0.65 * K } },
          { u: 1, t: 1, inn: { u: 1 - K, t: 1 } },
        ],
        trinn,
      };
    case 'konveks':
      return {
        type,
        bredde,
        punkter: [
          { u: 0, t: 0, ut: { u: 0, t: K } },
          { u: 1, t: 1, inn: { u: 1 - K, t: 1 } },
        ],
        trinn,
      };
    case 'konkav':
      return {
        type,
        bredde,
        punkter: [
          { u: 0, t: 0, ut: { u: K, t: 0 } },
          { u: 1, t: 1, inn: { u: 1, t: 1 - K } },
        ],
        trinn,
      };
    case 's-kurve':
      // vertical at the bottom and at the top, curving across in between
      return {
        type,
        bredde,
        punkter: [
          { u: 0, t: 0, ut: { u: 0, t: 0.5 } },
          { u: 1, t: 1, inn: { u: 1, t: 0.5 } },
        ],
        trinn,
      };
    case 'trapp': {
      const n = Math.max(2, Math.round(trinn));
      const punkter: ProfilPunkt[] = [{ u: 0, t: 0 }];
      for (let i = 0; i < n; i++) {
        const t1 = (i + 1) / n;
        const u0 = i / (n - 1 || 1);
        punkter.push({ u: u0, t: t1 });
        if (i < n - 1) punkter.push({ u: (i + 1) / (n - 1), t: t1 });
      }
      return { type, bredde, punkter, trinn: n };
    }
  }
}

function bezier(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const m = 1 - s;
  return m * m * m * p0 + 3 * m * m * s * p1 + 3 * m * s * s * p2 + s * s * s * p3;
}

/**
 * Sample the profile into (inset mm, height fraction) pairs from bottom to top.
 * `perSegment` samples per Bézier segment; straight segments use 1.
 */
export function samplerProfil(p: Profil, perSegment = 12): { inset: number; t: number }[] {
  const ut: { inset: number; t: number }[] = [];
  const pk = p.punkter;
  if (pk.length < 2 || p.bredde <= 0) {
    return [
      { inset: 0, t: 0 },
      { inset: 0, t: 1 },
    ];
  }
  ut.push({ inset: pk[0]!.u * p.bredde, t: pk[0]!.t });
  for (let i = 0; i < pk.length - 1; i++) {
    const a = pk[i]!;
    const b = pk[i + 1]!;
    const c1 = a.ut ?? { u: a.u, t: a.t };
    const c2 = b.inn ?? { u: b.u, t: b.t };
    const rett = !a.ut && !b.inn;
    const n = rett ? 1 : perSegment;
    for (let k = 1; k <= n; k++) {
      const s = k / n;
      ut.push({
        inset: bezier(a.u, c1.u, c2.u, b.u, s) * p.bredde,
        t: bezier(a.t, c1.t, c2.t, b.t, s),
      });
    }
  }
  // Heights must be non-decreasing for a valid wall; clamp and sort defensively.
  for (let i = 1; i < ut.length; i++) {
    if (ut[i]!.t < ut[i - 1]!.t) ut[i]!.t = ut[i - 1]!.t;
  }
  for (const s of ut) {
    s.t = Math.min(1, Math.max(0, s.t));
    s.inset = Math.max(0, s.inset);
  }
  return ut;
}

/** Validate a user-edited profile. Returns a Norwegian message or null. */
export function validerProfil(p: Profil): string | null {
  if (p.bredde < 0) return 'Profilbredden kan ikke være negativ.';
  const pk = p.punkter;
  if (pk.length < 2) return 'Profilen trenger minst to punkter.';
  if (pk[0]!.t !== 0 || pk[pk.length - 1]!.t !== 1) return 'Profilen må gå fra bunnen til toppen av laget.';
  for (let i = 1; i < pk.length; i++) {
    if (pk[i]!.t < pk[i - 1]!.t) return 'Punktene må ligge i stigende høyde.';
  }
  return null;
}

/**
 * Steepest outward overhang of a profile, in degrees from vertical
 * (0 = vertical or leaning in, 90 = a horizontal ledge sticking out).
 * A wall overhangs where the inset shrinks as the height grows.
 */
export function profilOverheng(p: Profil, hoyde: number): number {
  const s = samplerProfil(p);
  let maks = 0;
  for (let i = 1; i < s.length; i++) {
    const ut = s[i - 1]!.inset - s[i]!.inset;
    if (ut <= 1e-6) continue;
    const dz = (s[i]!.t - s[i - 1]!.t) * hoyde;
    maks = Math.max(maks, dz <= 1e-9 ? 90 : (Math.atan(ut / dz) * 180) / Math.PI);
  }
  return maks;
}
