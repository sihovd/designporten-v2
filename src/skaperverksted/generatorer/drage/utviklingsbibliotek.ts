/**
 * UTVIKLINGSGEOMETRI: procedural stand-ins for the dragon parts until
 * Designporten's modelled part library exists (see bibliotek.ts). Shapes
 * are simple domes, cones and plates chosen to print without support and
 * to read as the mascot direction (cute, slightly spiky). They are not the
 * final design.
 */
import type { Mesh } from '../../geometri/mesh';
import type { Delbibliotek, Skall, Skalltype } from './bibliotek';
import {
  ekstruder,
  ekstruderXZ,
  ellipsoide,
  kuppel,
  kuppelHoyde,
  ror,
  speilY,
  type Omriss,
  type V2,
  type V3,
} from './former';
import { sokkelRadius } from './ledd';
import { sokkelKropp } from './ledd-geometri';
import type { DrageParametre } from './parametre';
import type { Del, Skjelett } from './skjelett';

/** Chaikin corner cutting on a closed polygon: rounds tips and scallops. */
function avrund(p: V2[], runder = 2): V2[] {
  let q = p;
  for (let r = 0; r < runder; r++) {
    const ny: V2[] = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[i]!;
      const b = q[(i + 1) % q.length]!;
      ny.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      ny.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    q = ny;
  }
  return q;
}

function speilet(m: Mesh): Mesh[] {
  return [m, speilY(m)];
}

class Samler {
  skall: Skall[] = [];
  legg(del: number, type: Skalltype, ...mesher: Mesh[]): void {
    for (const mesh of mesher) this.skall.push({ mesh, type, del });
  }
}

function kropp(s: Samler, d: Del): void {
  const mesh = d.sokkel ? sokkelKropp(d.omriss, d.profil, d.sokkel) : kuppel(d.omriss, d.profil, 64);
  s.legg(d.indeks, 'kropp', mesh);
}

function hode(s: Samler, sk: Skjelett, p: DrageParametre): void {
  const d = sk.deler[0]!;
  const o = d.omriss;
  const h = d.profil.hoyde;
  const bredde = { rund: 0.62, lang: 0.5, bred: 0.78 }[p.hode];
  const hoyde = { rund: 0.6, lang: 0.55, bred: 0.55 }[p.hode];
  // Snout: a lower dome from inside the head to the nose tip (x = 0).
  const bak = o.cx + o.af * 0.1;
  const snute: Omriss = {
    cx: (bak + sk.neseX) / 2,
    cy: 0,
    af: (sk.neseX - bak) / 2,
    ab: (sk.neseX - bak) / 2,
    b: o.b * bredde,
    n: 2.2,
  };
  const sh = Math.max(d.profil.vegg * 0.9, h * hoyde);
  s.legg(0, 'snute', kuppel(snute, { vegg: Math.min(d.profil.vegg, sh * 0.5), hoyde: sh, ringer: 8 }, 48));

  // Eyes sit on the head's surface, forward and to the sides.
  const r = o.b * { runde: 0.17, store: 0.23, sovende: 0.2 }[p.detaljer.oyne];
  const ex = o.cx + o.af * 0.3;
  const ey = o.b * 0.48;
  const ez = kuppelHoyde(o, d.profil, ex, ey);
  const rz = p.detaljer.oyne === 'sovende' ? r * 0.45 : r;
  const oye = ellipsoide([ex, ey, ez - rz * 0.35], [r * 0.9, r, rz], 24, 12);
  s.legg(0, 'oye', ...speilet(oye));

  if (p.horn !== 'ingen') {
    const hx = o.cx - o.ab * 0.2;
    const hy = o.b * 0.4;
    const r0 = Math.max(1.2, o.b * 0.13);
    const hz = kuppelHoyde(o, d.profil, hx, hy) - r0 * 0.8;
    const lengde = { sma: 0.35, lange: 0.7, buede: 0.65 }[p.horn] * h;
    const sti: V3[] = [];
    const radier: number[] = [];
    const steg = 6;
    for (let i = 0; i <= steg; i++) {
      const t = i / steg;
      // Tilt from the vertical: straight 30° back, or curving 5° → 45°.
      const vinkel = p.horn === 'buede' ? ((5 + 40 * t) * Math.PI) / 180 : (30 * Math.PI) / 180;
      const forrige = sti[i - 1] ?? [hx, hy, hz];
      const l = i === 0 ? 0 : lengde / steg;
      sti.push([forrige[0] - Math.sin(vinkel) * l, forrige[1] + l * 0.15, forrige[2] + Math.cos(vinkel) * l]);
      radier.push(i === steg ? 0 : r0 * (1 - 0.85 * t));
    }
    s.legg(0, 'horn', ...speilet(ror(sti, radier, 16)));
  }
}

function pigger(s: Samler, sk: Skjelett, p: DrageParametre): void {
  if (p.pigger === 'ingen') return;
  for (const d of sk.deler) {
    const o = d.omriss;
    const h = d.profil.hoyde;
    const x = d.rolle === 'hode' ? o.cx - o.ab * 0.55 : o.cx;
    if (d.rolle === 'hode' && p.horn !== 'ingen') continue;
    const z = d.rolle === 'hode' ? kuppelHoyde(o, d.profil, x, 0) : h;
    const storrelse = Math.min(o.b, (o.af + o.ab) / 2) * 0.7;
    if (p.pigger === 'spisse') {
      const r0 = Math.max(1.2, storrelse * 0.45);
      const l = storrelse * 1.1;
      const v = (20 * Math.PI) / 180;
      s.legg(
        d.indeks,
        'pigg',
        ror(
          [
            [x, 0, z - r0],
            [x - Math.sin(v) * l * 0.5, 0, z - r0 + Math.cos(v) * l * 0.5],
            [x - Math.sin(v) * l, 0, z - r0 + Math.cos(v) * l],
          ],
          [r0, r0 * 0.55, 0],
          16,
        ),
      );
    } else if (p.pigger === 'runde') {
      const r = Math.max(1.2, storrelse * 0.5);
      s.legg(d.indeks, 'pigg', ellipsoide([x, 0, z - r * 0.35], [r * 1.1, r * 0.8, r], 20, 10));
    } else {
      const t = Math.max(1.2, o.b * 0.12);
      const w = Math.min(o.af + o.ab, 2 * o.b) * 0.5;
      const l = storrelse * 1.2;
      const plate = avrund(
        [
          [x + w / 2, z - 2],
          [x + w * 0.1, z + l * 0.7],
          [x - w * 0.25, z + l],
          [x - w / 2, z - 2],
        ],
        2,
      );
      s.legg(d.indeks, 'pigg', ekstruderXZ(plate, -t / 2, t / 2));
    }
  }
}

function hale(s: Samler, sk: Skjelett, p: DrageParametre): void {
  const d = sk.deler.at(-1)!;
  const o = d.omriss;
  const h = d.profil.hoyde;
  const bak = o.cx - o.ab;
  const ende = sk.haleX;
  if (p.hale === 'spade') {
    const t = Math.max(2, h * 0.4);
    const b = o.b;
    const lengde = bak - ende;
    const spade = avrund(
      [
        [o.cx, -b * 0.45],
        [o.cx, b * 0.45],
        [bak - lengde * 0.15, b * 0.4],
        [bak - lengde * 0.4, b * 1.5],
        [ende, 0],
        [bak - lengde * 0.4, -b * 1.5],
        [bak - lengde * 0.15, -b * 0.4],
      ],
      2,
    );
    // Chaikin pulls the tip in; stretch back so the tip still reaches `ende`.
    const minX = Math.min(...spade.map((q) => q[0]));
    const skalert = spade.map((q): V2 => [
      q[0] < bak ? bak - ((bak - q[0]) * (bak - ende)) / (bak - minX) : q[0],
      q[1],
    ]);
    s.legg(d.indeks, 'haletupp', ekstruder(skalert, 0, t));
  } else if (p.hale === 'spiss') {
    const start = o.cx;
    const spiss: Omriss = { cx: start, cy: 0, af: o.af * 0.5, ab: start - ende, b: o.b * 0.75, n: 1.8 };
    s.legg(d.indeks, 'haletupp', kuppel(spiss, { vegg: d.profil.vegg * 0.6, hoyde: h * 0.8, ringer: 8 }, 64));
  } else {
    const r = (bak - ende) / 2 + o.ab * 0.35;
    const cx = ende + r;
    const kolle: Omriss = { cx, cy: 0, af: r, ab: r, b: r * 0.95, n: 2.2 };
    const profil = { vegg: d.profil.vegg * 0.8, hoyde: Math.max(h * 1.05, r * 1.2), ringer: 9 };
    s.legg(d.indeks, 'haletupp', kuppel(kolle, profil, 48));
    const l = r * 0.7;
    const r0 = Math.max(1.2, r * 0.3);
    for (const [vx, vy] of [
      [-1, 0],
      [-0.2, 1],
      [-0.2, -1],
    ] as const) {
      const bx = cx + vx * r * 0.45;
      const by = vy * r * 0.45;
      const bz = kuppelHoyde(kolle, profil, bx, by) - r0;
      const tilt = (35 * Math.PI) / 180;
      const len = Math.hypot(vx, vy);
      s.legg(
        d.indeks,
        'haletupp',
        ror(
          [
            [bx, by, bz],
            [
              bx + (vx / len) * Math.sin(tilt) * l,
              by + (vy / len) * Math.sin(tilt) * l,
              bz + Math.cos(tilt) * l,
            ],
          ],
          [r0, 0],
          14,
        ),
      );
    }
  }
}

/** Half-width a wing root must clear so neighbouring parts never touch it. */
function frirom(sk: Skjelett, i: number): number {
  const naboer = [sk.deler[i - 1], sk.deler[i + 1]].filter((d): d is Del => !!d);
  const legg = [...naboer.map((d) => d.omriss.b), sk.deler[i]!.omriss.b];
  return Math.max(...legg) + sk.mal.mellomrom + 0.5;
}

/** Wing outlines in units of the span S: u back from the root's front, v out from the clearance line. */
const vingeformer: Record<'sma' | 'store' | 'flaggermus', { spisser: V2[]; kant: V2[] }> = {
  sma: {
    spisser: [[-0.3, 1]],
    kant: [
      [0, 0.35],
      [-0.02, 0.8],
      [-0.3, 1],
      [-0.55, 0.85],
      [-0.72, 0.55],
      [-0.8, 0.25],
    ],
  },
  store: {
    spisser: [
      [-0.15, 1],
      [-0.5, 0.88],
      [-0.82, 0.55],
    ],
    kant: [
      [0, 0.4],
      [-0.02, 0.85],
      [-0.15, 1],
      [-0.3, 0.74],
      [-0.5, 0.88],
      [-0.6, 0.5],
      [-0.82, 0.55],
      [-0.78, 0.28],
    ],
  },
  flaggermus: {
    spisser: [
      [-0.1, 1],
      [-0.4, 0.95],
      [-0.68, 0.74],
      [-0.9, 0.42],
    ],
    kant: [
      [0, 0.35],
      [-0.1, 1],
      [-0.26, 0.7],
      [-0.4, 0.95],
      [-0.52, 0.6],
      [-0.68, 0.74],
      [-0.76, 0.42],
      [-0.9, 0.42],
    ],
  },
};

/** Keep the wing forward of the rear legs where it is low enough to meet them. */
function unnaBakbein(polygon: V2[], sk: Skjelett, p: DrageParametre): V2[] {
  if (!p.detaljer.bein) return polygon;
  const r = sk.deler[sk.beinDeler.at(-1)!]!;
  const o = r.omriss;
  const xGrense = o.cx + o.af + sk.mal.mellomrom + 0.5;
  const yGrense = beinRekkevidde(o) + sk.mal.mellomrom + 0.5;
  return polygon.map((q): V2 => (q[0] < xGrense && q[1] < yGrense ? [xGrense, q[1]] : q));
}

function vinger(s: Samler, sk: Skjelett, p: DrageParametre): void {
  if (p.vinger === 'ingen') return;
  const d = sk.deler[sk.vingeDel]!;
  const o = d.omriss;
  const t = Math.max(1.2, p.lengde * 0.012);
  const indre = Math.max(sokkelRadius(sk.mal), o.b * 0.55);
  const yc = frirom(sk, d.indeks);
  const x1 = o.cx + o.af * 0.6;
  const x0 = o.cx - o.ab * 0.6;
  const S = p.lengde * { sma: 0.2, store: 0.27, flaggermus: 0.27 }[p.vinger];
  const form = vingeformer[p.vinger];
  const tilXY = (q: V2): V2 => [x1 + q[0] * S, yc + q[1] * S];
  const spisser = form.spisser.map(tilXY);
  const kant = form.kant.map(tilXY);
  // Trailing edge back to the root, always behind the last tip so the
  // outline cannot cross itself at any size.
  const sisteX = Math.min(...spisser.map((q) => q[0]));
  kant.push([Math.min(x0, sisteX + S * 0.2), yc + S * 0.05]);
  const polygon: V2[] = [[x0, indre], [x1, indre], [x1, yc], ...kant, [x0, yc]];
  const vinge = ekstruder(unnaBakbein(avrund(polygon, 2), sk, p), 0, t);
  s.legg(d.indeks, 'vinge', ...speilet(vinge));

  if (p.detaljer.vingeribber) {
    const rot: V2 = [(x0 + x1) / 2, yc * 0.9];
    const w = Math.max(1.2, S * 0.05) / 2;
    const th = t + Math.max(0.6, t * 0.4);
    for (const spiss of spisser) {
      const ende: V2 = [rot[0] + (spiss[0] - rot[0]) * 0.8, rot[1] + (spiss[1] - rot[1]) * 0.8];
      const dx = ende[0] - rot[0];
      const dy = ende[1] - rot[1];
      const l = Math.hypot(dx, dy);
      const nx = (-dy / l) * w;
      const ny = (dx / l) * w;
      const ribbe = ekstruder(
        [
          [rot[0] + nx, rot[1] + ny],
          [rot[0] - nx, rot[1] - ny],
          [ende[0] - nx * 0.4, ende[1] - ny * 0.4],
          [ende[0] + nx * 0.4, ende[1] + ny * 0.4],
        ],
        0,
        th,
      );
      s.legg(d.indeks, 'ribbe', ...speilet(ribbe));
    }
  }
}

/** How far out (|y|) a leg with its foot and claws reaches. */
function beinRekkevidde(o: Omriss): number {
  return o.b * 1.6 + Math.min(o.af, o.ab) * 0.75 * 0.85;
}

function bein(s: Samler, sk: Skjelett, p: DrageParametre): void {
  if (!p.detaljer.bein) return;
  for (const i of sk.beinDeler) {
    const d = sk.deler[i]!;
    const o = d.omriss;
    const inn = Math.max(sokkelRadius(sk.mal), o.b * 0.5);
    const ut = o.b * 1.6;
    const bredde = Math.min(o.af, o.ab) * 0.75;
    const hoyde = Math.max(d.profil.vegg, d.profil.hoyde * 0.5);
    const foran = i === sk.beinDeler[0];
    // Legs point sideways, feet turned slightly forward (front) or back (rear).
    const lengs: Omriss = {
      cx: o.cx,
      cy: (inn + ut) / 2,
      af: (ut - inn) / 2,
      ab: (ut - inn) / 2,
      b: bredde,
      n: 2.3,
      vinkel: Math.PI / 2,
    };
    const profil = { vegg: Math.min(hoyde * 0.5, d.profil.vegg), hoyde, ringer: 8 };
    s.legg(i, 'bein', ...speilet(kuppel(lengs, profil, 40)));
    const fot: Omriss = {
      cx: o.cx + (foran ? 1 : -1) * bredde * 0.25,
      cy: ut - bredde * 0.4,
      af: bredde * 0.8,
      ab: bredde * 0.8,
      b: bredde * 0.85,
      n: 2.2,
    };
    const fotProfil = { vegg: profil.vegg * 0.8, hoyde: hoyde * 0.75, ringer: 7 };
    s.legg(i, 'bein', ...speilet(kuppel(fot, fotProfil, 40)));
    if (p.detaljer.klor) {
      for (const v of [-0.55, 0, 0.55]) {
        const kx = fot.cx + Math.sin(v) * bredde * 0.75;
        const ky = fot.cy + Math.cos(v) * bredde * 0.75;
        const klo: Omriss = {
          cx: kx,
          cy: ky,
          af: bredde * 0.45,
          ab: bredde * 0.2,
          b: bredde * 0.18,
          n: 1.8,
          vinkel: Math.PI / 2 - v,
        };
        s.legg(
          i,
          'klo',
          ...speilet(
            kuppel(klo, { vegg: fotProfil.vegg * 0.5, hoyde: fotProfil.hoyde * 0.55, ringer: 5 }, 24),
          ),
        );
      }
    }
  }
}

export const utviklingsbibliotek: Delbibliotek = {
  id: 'utvikling',
  navn: 'Utviklingsgeometri',
  utviklingsgeometri: true,
  byggDeler(sk, p) {
    const s = new Samler();
    for (const d of sk.deler) kropp(s, d);
    hode(s, sk, p);
    pigger(s, sk, p);
    hale(s, sk, p);
    vinger(s, sk, p);
    bein(s, sk, p);
    return s.skall;
  },
};
