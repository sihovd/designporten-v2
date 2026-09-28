/**
 * Basic shapes as rings, centred on the origin, in mm (Y up).
 */
import type { FormKilde } from '../core/dokument';
import type { Ring } from './polygon';

/** Segments for a full circle of radius r (mm), ~0.02 mm chord error. */
export function sirkelSegmenter(r: number): number {
  if (r <= 0) return 8;
  const vinkel = 2 * Math.acos(Math.max(-1, 1 - 0.02 / r));
  return Math.max(12, Math.min(256, Math.ceil((2 * Math.PI) / vinkel)));
}

export function ellipse(bredde: number, hoyde: number): Ring {
  const rx = bredde / 2,
    ry = hoyde / 2;
  const n = sirkelSegmenter(Math.max(rx, ry));
  const r: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    r.push({ x: rx * Math.cos(a), y: ry * Math.sin(a) });
  }
  return r;
}

export function rektangel(bredde: number, hoyde: number, radius = 0): Ring {
  const w = bredde / 2,
    h = hoyde / 2;
  const rad = Math.max(0, Math.min(radius, w, h));
  if (rad < 1e-3) {
    return [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w, y: h },
      { x: -w, y: h },
    ];
  }
  const n = Math.max(3, Math.ceil(sirkelSegmenter(rad) / 4));
  const ring: Ring = [];
  const hjorner: [number, number, number][] = [
    [w - rad, -h + rad, -Math.PI / 2],
    [w - rad, h - rad, 0],
    [-w + rad, h - rad, Math.PI / 2],
    [-w + rad, -h + rad, Math.PI],
  ];
  for (const [cx, cy, a0] of hjorner) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      ring.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
    }
  }
  return ring;
}

/** Regular polygon with `sider` sides inscribed in the bredde × hoyde box, flat bottom. */
export function polygon(bredde: number, hoyde: number, sider: number): Ring {
  const n = Math.max(3, Math.min(64, Math.round(sider)));
  const r: Ring = [];
  const start = -Math.PI / 2 + Math.PI / n;
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    r.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  // scale to fill the box exactly
  let minX = Infinity,
    maksX = -Infinity,
    minY = Infinity,
    maksY = -Infinity;
  for (const p of r) {
    minX = Math.min(minX, p.x);
    maksX = Math.max(maksX, p.x);
    minY = Math.min(minY, p.y);
    maksY = Math.max(maksY, p.y);
  }
  const sx = bredde / (maksX - minX),
    sy = hoyde / (maksY - minY);
  const cx = (minX + maksX) / 2,
    cy = (minY + maksY) / 2;
  return r.map((p) => ({ x: (p.x - cx) * sx, y: (p.y - cy) * sy }));
}

export function formTilRinger(f: FormKilde): Ring[] {
  const b = Math.max(0.1, f.bredde),
    h = Math.max(0.1, f.hoyde);
  switch (f.form) {
    case 'rektangel':
      return [rektangel(b, h, f.hjorneradius)];
    case 'ellipse':
    case 'hull':
      return [ellipse(b, h)];
    case 'polygon':
      return [polygon(b, h, f.sider)];
  }
}
