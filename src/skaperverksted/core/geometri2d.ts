/** 2D math in millimetres. */

export interface Vec2 {
  x: number;
  y: number;
}

/** A transform: translate (mm), rotate (degrees, counter-clockwise), scale. */
export interface Transform2D {
  x: number;
  y: number;
  rotasjon: number;
  skalaX: number;
  skalaY: number;
}

export const identitet: Transform2D = { x: 0, y: 0, rotasjon: 0, skalaX: 1, skalaY: 1 };

/** Affine matrix [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrise = [number, number, number, number, number, number];

export function tilMatrise(t: Transform2D): Matrise {
  const r = (t.rotasjon * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos * t.skalaX, sin * t.skalaX, -sin * t.skalaY, cos * t.skalaY, t.x, t.y];
}

export function anvend(m: Matrise, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function multipliser(a: Matrise, b: Matrise): Matrise {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function inverter(m: Matrise): Matrise {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) throw new Error('Matrisen kan ikke inverteres');
  const id = 1 / det;
  return [
    m[3] * id,
    -m[1] * id,
    -m[2] * id,
    m[0] * id,
    (m[2] * m[5] - m[3] * m[4]) * id,
    (m[1] * m[4] - m[0] * m[5]) * id,
  ];
}

export interface Boks {
  minX: number;
  minY: number;
  maksX: number;
  maksY: number;
}

export const tomBoks = (): Boks => ({ minX: Infinity, minY: Infinity, maksX: -Infinity, maksY: -Infinity });

export function utvidBoks(b: Boks, p: Vec2): Boks {
  b.minX = Math.min(b.minX, p.x);
  b.minY = Math.min(b.minY, p.y);
  b.maksX = Math.max(b.maksX, p.x);
  b.maksY = Math.max(b.maksY, p.y);
  return b;
}

export function slaSammen(a: Boks, b: Boks): Boks {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maksX: Math.max(a.maksX, b.maksX),
    maksY: Math.max(a.maksY, b.maksY),
  };
}

export function erTom(b: Boks): boolean {
  return !(b.maksX >= b.minX && b.maksY >= b.minY);
}

export const bredde = (b: Boks) => b.maksX - b.minX;
export const hoyde = (b: Boks) => b.maksY - b.minY;
export const senter = (b: Boks): Vec2 => ({ x: (b.minX + b.maksX) / 2, y: (b.minY + b.maksY) / 2 });

export function avstand(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
