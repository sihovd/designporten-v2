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

const K = 0.5523; // cubic approximation of a quarter circle

export const rettProfil = (): Profil => ({
  type: 'rett',
  bredde: 0,
  punkter: [
    { u: 0, t: 0 },
    { u: 0, t: 1 },
  ],
  trinn: 2,
});

const lerp = (a: number, b: number, s: number) => a + (b - a) * s;

/**
 * Build a profile from its two edge anchors, in mm of inset from the layer's
 * outline: `bunn` is where the wall starts on the bottom edge, `topp` where
 * it ends on the top edge. The wall between them follows `type`:
 * straight, convex (Bue ut), concave (Bue inn), S-curve, steps, and the older
 * rounded and chamfer shapes. Handles are placed relative to the anchors, so
 * moving an anchor keeps the shape's character. `bredde` is the editor range
 * (at least the larger anchor).
 */
export function byggProfil(
  type: Exclude<ProfilType, 'egendefinert'>,
  bunn: number,
  topp: number,
  trinn = 3,
  bredde = Math.max(bunn, topp),
): Profil {
  bunn = Math.max(0, bunn);
  topp = Math.max(0, topp);
  const b = Math.max(bredde, bunn, topp);
  if (b <= 0) return { ...rettProfil(), type, trinn };
  const a = bunn / b;
  const z = topp / b;
  const d = z - a;
  const lp = (s: number) => lerp(a, z, s);
  const profil = (punkter: ProfilPunkt[], n = trinn): Profil => ({ type, bredde: b, punkter, trinn: n });
  switch (type) {
    case 'rett':
      return profil([
        { u: a, t: 0 },
        { u: z, t: 1 },
      ]);
    case 'fas':
      return profil([
        { u: a, t: 0 },
        { u: a, t: 0.5 },
        { u: z, t: 1 },
      ]);
    case 'avrundet':
      // vertical wall that rounds over into the top: quarter circle in the upper part
      return profil([
        { u: a, t: 0 },
        { u: a, t: 0.35, ut: { u: a, t: 0.35 + 0.65 * K } },
        { u: z, t: 1, inn: { u: z - K * d, t: 1 } },
      ]);
    case 'konveks':
      return profil([
        { u: a, t: 0, ut: { u: a, t: K } },
        { u: z, t: 1, inn: { u: z - K * d, t: 1 } },
      ]);
    case 'konkav':
      return profil([
        { u: a, t: 0, ut: { u: a + K * d, t: 0 } },
        { u: z, t: 1, inn: { u: z, t: 1 - K } },
      ]);
    case 's-kurve':
      // vertical at the bottom and at the top, curving across in between
      return profil([
        { u: a, t: 0, ut: { u: a, t: 0.5 } },
        { u: z, t: 1, inn: { u: z, t: 0.5 } },
      ]);
    case 'trapp': {
      const n = Math.max(2, Math.round(trinn));
      const punkter: ProfilPunkt[] = [{ u: a, t: 0 }];
      for (let i = 0; i < n; i++) {
        const t1 = (i + 1) / n;
        punkter.push({ u: lp(i / (n - 1 || 1)), t: t1 });
        if (i < n - 1) punkter.push({ u: lp((i + 1) / (n - 1)), t: t1 });
      }
      return profil(punkter, n);
    }
  }
}

/** Presets from the spec: straight, rounded, convex (Bue), concave, S-curve, stepped, chamfer (Knekk). */
export function forhandsvalg(type: Exclude<ProfilType, 'egendefinert'>, bredde = 1.5, trinn = 3): Profil {
  return type === 'rett' ? rettProfil() : byggProfil(type, 0, bredde, trinn);
}

/** The two edge anchors in mm of inset: where the wall starts (bottom) and ends (top). */
export function ankere(p: Profil): { bunn: number; topp: number } {
  const f = p.punkter[0];
  const l = p.punkter.at(-1);
  return { bunn: (f?.u ?? 0) * p.bredde, topp: (l?.u ?? 0) * p.bredde };
}

/**
 * Anchors that sit between the bottom and the top edge. Only older profiles
 * (chamfer, rounded, stepped, hand-made) have them; the editor keeps them,
 * but new anchors are only ever placed on the bottom and top edge.
 */
export function mellomPunkter(p: Profil): number {
  return Math.max(0, p.punkter.length - 2);
}

/**
 * Move one edge anchor horizontally to `mm` of inset. Presets are rebuilt
 * around the new anchors; a hand-made curve moves the anchor with its handle
 * and keeps everything else where it was (in mm).
 */
export function flyttAnker(p: Profil, hvilken: 'bunn' | 'topp', mm: number, bredde?: number): Profil {
  mm = Math.max(0, mm);
  const n = ankere(p);
  const bunn = hvilken === 'bunn' ? mm : n.bunn;
  const topp = hvilken === 'topp' ? mm : n.topp;
  if (p.type !== 'egendefinert') {
    return byggProfil(p.type, bunn, topp, p.trinn, bredde ?? Math.max(p.bredde, bunn, topp));
  }
  // custom: work in mm, then normalise against the new range
  const gammel = Math.max(p.bredde, 1e-9);
  const nyB = Math.max(bredde ?? 0, p.bredde, mm, 1e-9);
  const skala = gammel / nyB;
  const indeks = hvilken === 'bunn' ? 0 : p.punkter.length - 1;
  const punkter = p.punkter.map((q, i) => {
    const r: ProfilPunkt = { u: q.u * skala, t: q.t };
    if (q.ut) r.ut = { u: q.ut.u * skala, t: q.ut.t };
    if (q.inn) r.inn = { u: q.inn.u * skala, t: q.inn.t };
    if (i === indeks) {
      const du = mm / nyB - r.u;
      r.u += du;
      if (r.ut) r.ut = { ...r.ut, u: Math.min(1, Math.max(0, r.ut.u + du)) };
      if (r.inn) r.inn = { ...r.inn, u: Math.min(1, Math.max(0, r.inn.u + du)) };
    }
    return r;
  });
  return { ...p, bredde: nyB, punkter };
}

/** Inset (mm) of the wall at the bottom and at the top of the layer. */
export const bunnInset = (p: Profil) => ankere(p).bunn;
export const toppInset = (p: Profil) => ankere(p).topp;

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
