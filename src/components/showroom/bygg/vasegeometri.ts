/**
 * Construction geometry for the spiral vase shown in the hero and the
 * process slider (functional programmatic geometry, D-3): the side profile,
 * cross-sections, the twisted ribs and the print layers of the same object
 * as the concept cut-out `utklipp/spiralvase.webp`.
 *
 * Coordinates are in the cut-out's own pixel space (900 × 900, y down) so
 * the drawing lines up with the photo when both fill the same square.
 * The vase is seen slightly from above: a horizontal ring of radius r at
 * height y projects to an ellipse with half-axes r and r · HELNING.
 */

export const VISNING = 900;
export const AKSE_X = 370;
export const HELNING = 0.2;

/** Measured from the cut-out: height y (px) → radius r (px), top to bottom. */
export const PROFIL: readonly (readonly [number, number])[] = [
  [150, 120],
  [178, 106],
  [210, 102],
  [250, 128],
  [305, 172],
  [385, 212],
  [470, 230],
  [565, 228],
  [665, 205],
  [745, 170],
  [805, 128],
];

export const TOPP_Y = PROFIL[0]![0];
export const BUNN_Y = PROFIL[PROFIL.length - 1]![0];

/** Radius at height y: Catmull-Rom through the measured profile. */
export function radiusVed(y: number): number {
  const p = PROFIL;
  if (y <= p[0]![0]) return p[0]![1];
  if (y >= p[p.length - 1]![0]) return p[p.length - 1]![1];
  let i = 0;
  while (i < p.length - 2 && y > p[i + 1]![0]) i++;
  const p0 = p[Math.max(0, i - 1)]!;
  const p1 = p[i]!;
  const p2 = p[i + 1]!;
  const p3 = p[Math.min(p.length - 1, i + 2)]!;
  const t = (y - p1[0]) / (p2[0] - p1[0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  );
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

function polylinje(punkter: [number, number][]): string {
  return punkter.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join(' ');
}

/** Left and right silhouette, top to bottom. */
export function kontur(steg = 64): { venstre: string; hoyre: string } {
  const v: [number, number][] = [];
  const h: [number, number][] = [];
  for (let i = 0; i <= steg; i++) {
    const y = TOPP_Y + ((BUNN_Y - TOPP_Y) * i) / steg;
    const r = radiusVed(y);
    v.push([AKSE_X - r, y]);
    h.push([AKSE_X + r, y]);
  }
  return { venstre: polylinje(v), hoyre: polylinje(h) };
}

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A horizontal cross-section at height y. */
export function snitt(y: number): Ellipse {
  const r = radiusVed(y);
  return { cx: AKSE_X, cy: y, rx: r, ry: r * HELNING };
}

/** Evenly spaced cross-sections from top to bottom (inclusive). */
export function snittliste(antall: number): Ellipse[] {
  return Array.from({ length: antall }, (_, i) => snitt(TOPP_Y + ((BUNN_Y - TOPP_Y) * i) / (antall - 1)));
}

/** The visible (front) half of a cross-section as an SVG arc. */
export function frontbue(e: Ellipse): string {
  return `M${f(e.cx - e.rx)} ${f(e.cy)} A${f(e.rx)} ${f(e.ry)} 0 0 0 ${f(e.cx + e.rx)} ${f(e.cy)}`;
}

/**
 * Twisted ribs: each rib turns `vri` radians from base to rim. Only the
 * parts facing the viewer are returned, as separate path strings.
 */
export function ribber(antall: number, vri: number, steg = 90): string[] {
  const ut: string[] = [];
  for (let n = 0; n < antall; n++) {
    const start = (n / antall) * Math.PI * 2;
    let lop: [number, number][] = [];
    for (let i = 0; i <= steg; i++) {
      const t = i / steg;
      const y = BUNN_Y - (BUNN_Y - TOPP_Y) * t;
      const r = radiusVed(y);
      const theta = start + vri * t;
      const foran = Math.cos(theta) > 0;
      if (foran) {
        lop.push([AKSE_X + r * Math.sin(theta), y + r * Math.cos(theta) * HELNING]);
      } else if (lop.length > 1) {
        ut.push(polylinje(lop));
        lop = [];
      } else {
        lop = [];
      }
    }
    if (lop.length > 1) ut.push(polylinje(lop));
  }
  return ut;
}

/** Print layers from the base upwards, as front arcs. */
export function lag(antall: number): string[] {
  return Array.from({ length: antall }, (_, i) =>
    frontbue(snitt(BUNN_Y - ((BUNN_Y - TOPP_Y) * i) / (antall - 1))),
  );
}

/**
 * The vase's outline as a CSS polygon in percent of the square, padded
 * slightly outwards. Clips the cut-out to the object itself.
 */
export function silhuett(utenfor = 4, steg = 40): string {
  const p: [number, number][] = [];
  const pst = (n: number) => `${f((n / VISNING) * 100)}%`;
  for (let i = 0; i <= steg; i++) {
    const y = TOPP_Y + ((BUNN_Y - TOPP_Y) * i) / steg;
    p.push([AKSE_X - radiusVed(y) - utenfor, y]);
  }
  const bunn = snitt(BUNN_Y);
  for (let i = 1; i < 16; i++) {
    const phi = Math.PI - (Math.PI * i) / 16;
    p.push([bunn.cx + (bunn.rx + utenfor) * Math.cos(phi), bunn.cy + (bunn.ry + utenfor) * Math.sin(phi)]);
  }
  for (let i = steg; i >= 0; i--) {
    const y = TOPP_Y + ((BUNN_Y - TOPP_Y) * i) / steg;
    p.push([AKSE_X + radiusVed(y) + utenfor, y]);
  }
  const topp = snitt(TOPP_Y);
  for (let i = 1; i < 16; i++) {
    const phi = -(Math.PI * i) / 16;
    p.push([topp.cx + (topp.rx + utenfor) * Math.cos(phi), topp.cy + (topp.ry + utenfor) * Math.sin(phi)]);
  }
  return `polygon(${p.map(([x, y]) => `${pst(x)} ${pst(y)}`).join(', ')})`;
}
