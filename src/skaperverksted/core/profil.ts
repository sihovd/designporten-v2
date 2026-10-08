/**
 * Side profiles. A profile describes how a layer's wall rises from its
 * bottom (t = 0) to its top (t = 1) as an inset from the layer's outline.
 *
 * The curve is a chain of cubic Bézier segments in normalised space:
 *   u ∈ [0, 1]: horizontal position across the profile width
 *               (0 = the outline itself, 1 = fully inset by `bredde` mm)
 *   t ∈ [0, 1]: height fraction of the layer
 * The solid lies on the inner side of the curve. At height t the curve is
 * crossed at one or more insets; the layer is solid from the first crossing
 * inwards, between the second and third crossing, and so on (`skiveDeler`).
 * A wall that only rises has one crossing: the outline offset inwards by
 * inset(t) × bredde. A curve that goes back down while moving inwards (a
 * groove or a ridge in the top) has more, and the slab becomes a ring.
 * This is physical geometry: the mesher offsets the outline per slab
 * (see geometri/ekstruder.ts).
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

type Pkt = { u: number; t: number };
const mix = (a: Pkt, b: Pkt, s: number): Pkt => ({ u: lerp(a.u, b.u, s), t: lerp(a.t, b.t, s) });

/**
 * The point on the wall closest to (`mm` inset, `t` height fraction), as the Bézier segment it lies on and
 * the position `s` (0..1) along that segment. `px` scales mm and height to screen pixels so «closest» is
 * what the eye sees; `avstand` is in those pixels.
 */
export function narmestePaaKurve(
  p: Profil,
  mm: number,
  t: number,
  px: { x: number; y: number },
  perSegment = 40,
): { segment: number; s: number; avstand: number } | null {
  const pk = p.punkter;
  if (pk.length < 2) return null;
  const bredde = Math.max(p.bredde, 0);
  let best: { segment: number; s: number; avstand: number } | null = null;
  for (let i = 0; i < pk.length - 1; i++) {
    const a = pk[i]!;
    const b = pk[i + 1]!;
    const c1 = a.ut ?? a;
    const c2 = b.inn ?? b;
    for (let k = 0; k <= perSegment; k++) {
      const s = k / perSegment;
      const x = bezier(a.u, c1.u, c2.u, b.u, s) * bredde;
      const y = bezier(a.t, c1.t, c2.t, b.t, s);
      const d = Math.hypot((x - mm) * px.x, (y - t) * px.y);
      if (!best || d < best.avstand) best = { segment: i, s, avstand: d };
    }
  }
  return best;
}

/**
 * Add an anchor on the wall, on segment `segment` at position `s`, without changing the wall's shape (the
 * Bézier segment is split there). The profile becomes a hand-made one, so the new point can be dragged
 * sideways and up and down between its neighbours. A vertical wall gets a width to be dragged into.
 */
export function settInnPunkt(p: Profil, segment: number, s: number): Profil {
  const pk = p.punkter.map((q) => ({ ...q })) as ProfilPunkt[];
  const a = pk[segment];
  const b = pk[segment + 1];
  if (!a || !b) return p;
  s = Math.min(0.95, Math.max(0.05, s));
  const c1: Pkt = a.ut ?? a;
  const c2: Pkt = b.inn ?? b;
  let ny: ProfilPunkt;
  if (!a.ut && !b.inn) {
    ny = { ...mix(a, b, s) };
  } else {
    const q0 = mix(a, c1, s);
    const q1 = mix(c1, c2, s);
    const q2 = mix(c2, b, s);
    const r0 = mix(q0, q1, s);
    const r1 = mix(q1, q2, s);
    const m = mix(r0, r1, s);
    a.ut = q0;
    b.inn = q2;
    ny = { u: m.u, t: m.t, inn: r0, ut: r1 };
  }
  pk.splice(segment + 1, 0, ny);
  return { ...p, type: 'egendefinert', bredde: p.bredde > 0 ? p.bredde : 1.5, punkter: pk };
}

/** The same wall in a wider (or narrower) editor range: `u` is a fraction of `bredde`, so it is rescaled. */
export function medBredde(p: Profil, bredde: number): Profil {
  if (bredde <= 0 || Math.abs(bredde - p.bredde) < 1e-9) return p;
  const k = p.bredde / bredde;
  const f = (q: Pkt): Pkt => ({ u: q.u * k, t: q.t });
  return {
    ...p,
    bredde,
    punkter: p.punkter.map((q) => ({
      ...q,
      u: q.u * k,
      ...(q.ut ? { ut: f(q.ut) } : {}),
      ...(q.inn ? { inn: f(q.inn) } : {}),
    })),
  };
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
  // The curve may go back down (a groove in the top), so heights are only kept inside the layer.
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
  return null;
}

/**
 * Where the layer is solid at height fraction `t`, as insets in mm from the outline: `[fra, til]` pairs,
 * `til` null meaning all the way in. One pair for a wall that only rises; more where the curve has gone
 * back down and up again (the slab is then a ring).
 */
export function skiveDeler(prover: { inset: number; t: number }[], t: number): [number, number | null][] {
  const kryss: number[] = [];
  for (let i = 1; i < prover.length; i++) {
    const a = prover[i - 1]!;
    const b = prover[i]!;
    // half-open, so a point exactly at t is counted once
    if ((a.t <= t && t < b.t) || (b.t <= t && t < a.t)) {
      kryss.push(a.inset + ((t - a.t) / (b.t - a.t)) * (b.inset - a.inset));
    }
  }
  kryss.sort((x, y) => x - y);
  const ut: [number, number | null][] = [];
  for (let i = 0; i < kryss.length; i += 2) ut.push([kryss[i]!, kryss[i + 1] ?? null]);
  return ut.length ? ut : [[prover.at(-1)?.inset ?? 0, null]];
}

/** The wall goes back down at some point (a groove or ridge in the top). */
export function harSpor(p: Profil): boolean {
  const s = samplerProfil(p);
  return s.some((x, i) => i > 0 && x.t < s[i - 1]!.t - 1e-6);
}

/**
 * Steepest outward overhang of a profile, in degrees from vertical
 * (0 = vertical or leaning in, 90 = a horizontal ledge sticking out).
 * The wall overhangs wherever the curve moves outwards (the inset shrinks),
 * going up or down. A curve that goes back down while moving inwards is a
 * groove in the top and does not overhang.
 */
export function profilOverheng(p: Profil, hoyde: number): number {
  const s = samplerProfil(p);
  let maks = 0;
  for (let i = 1; i < s.length; i++) {
    const ut = s[i - 1]!.inset - s[i]!.inset;
    if (ut <= 1e-6) continue;
    const dz = Math.abs(s[i]!.t - s[i - 1]!.t) * hoyde;
    maks = Math.max(maks, dz <= 1e-9 ? 90 : (Math.atan(ut / dz) * 180) / Math.PI);
  }
  return maks;
}
