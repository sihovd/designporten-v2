/**
 * Geometry of the joint standard (see ledd.ts): the socket body of the
 * front part and the pin + arm of the rear part.
 */
import { MeshBygger, type Mesh } from '../../geometri/mesh';
import {
  boks,
  flate,
  kuppelNivaa,
  loft,
  omdreining,
  omrissNorm,
  omrissParameter,
  omrissPunkt,
  type Kuppelprofil,
  type Omriss,
  type V2,
  type V3,
} from './former';
import { hulromRadius, tappRadius, type LeddMal } from './ledd';

const FORAN = 56;
const BAK = 16;
const HULROM = 36;

/** Where a ray from (x, y) in direction `vinkel` leaves the outline. */
function utgang(o: Omriss, x: number, y: number, vinkel: number): V2 {
  const dx = Math.cos(vinkel);
  const dy = Math.sin(vinkel);
  let inne = 0;
  let ute = 4 * Math.max(o.af, o.ab, o.b);
  for (let i = 0; i < 60; i++) {
    const m = (inne + ute) / 2;
    if (omrissNorm(o, x + dx * m, y + dy * m) < 1) inne = m;
    else ute = m;
  }
  return [x + dx * inne, y + dy * inne];
}

export interface Sokkel {
  /** Joint centre X (the socket is on the part's centre line). */
  jx: number;
  mal: LeddMal;
}

/**
 * A body part (dome over a superellipse outline) with the joint socket cut
 * in at the rear. The outline must be unrotated and centred on y = 0.
 * Built directly as one closed shell: below the roof each horizontal
 * section is the outline minus a keyhole (cavity + rearward slot), which is
 * still a simple polygon, so the part can be lofted without booleans.
 */
export function sokkelKropp(o: Omriss, profil: Kuppelprofil, sokkel: Sokkel): Mesh {
  const { jx, mal } = sokkel;
  const psi = mal.spalteVinkel;
  const ePluss = utgang(o, jx, 0, Math.PI - psi);
  const eMinus = utgang(o, jx, 0, Math.PI + psi);
  const tPluss = omrissParameter(o, ePluss[0], ePluss[1]);
  const tMinus = omrissParameter(o, eMinus[0], eMinus[1]);

  const foran: number[] = Array.from(
    { length: FORAN },
    (_, i) => tMinus + ((tPluss - tMinus) * i) / (FORAN - 1),
  );
  const bak: number[] = Array.from(
    { length: BAK },
    (_, i) => tPluss + ((tMinus + 2 * Math.PI - tPluss) * (i + 1)) / (BAK + 1),
  );
  const foranXY = foran.map((t) => omrissPunkt(o, t));
  const bakXY = bak.map((t) => omrissPunkt(o, t));

  const hulrom = (z: number): V3[] => {
    const r = hulromRadius(mal, z);
    return Array.from({ length: HULROM }, (_, i) => {
      const v = Math.PI - psi - (i / (HULROM - 1)) * 2 * (Math.PI - psi);
      return [jx + r * Math.cos(v), r * Math.sin(v), z];
    });
  };
  const nedre = (z: number): V3[] => [...foranXY.map((p) => [p[0], p[1], z] as V3), ...hulrom(z)];

  const b = new MeshBygger();
  const hc = mal.hulromHoyde;
  loft(b, [nedre(0), nedre(mal.h / 2), nedre(mal.h), nedre(hc)], { type: 'plan' }, { type: 'apen' });

  // Roof of the cavity and slot, facing down: E+ → round the back → E− → P−
  // → along the cavity (front side) → P+.
  const tak: V2[] = [
    foranXY.at(-1)!,
    ...bakXY,
    foranXY[0]!,
    ...hulrom(hc)
      .reverse()
      .map((p) => [p[0], p[1]] as V2),
  ];
  flate(b, tak, hc, false);

  const ovre = (z: number, s: number): V3[] =>
    [...foran, ...bak].map((t) => {
      const p = omrissPunkt(o, t, s);
      return [p[0], p[1], z];
    });
  const ringer: V3[][] = [ovre(hc, 1), ovre(profil.vegg, 1)];
  for (const n of kuppelNivaa(profil)) ringer.push(ovre(n.z, n.skala));
  loft(b, ringer, { type: 'apen' }, { type: 'punkt', p: [o.cx, o.cy, profil.hoyde] });
  return b.bygg();
}

/**
 * The rear part's pin (at the joint centre) and arm (from the pin back to
 * `tilX`, inside the rear part's body). Two closed shells that overlap the
 * body; slicers merge overlapping shells of one part.
 */
export function tappOgArm(jx: number, tilX: number, mal: LeddMal): Mesh[] {
  const tapp = omdreining(
    jx,
    0,
    [
      [tappRadius(mal, 0), 0],
      [tappRadius(mal, mal.h / 2), mal.h / 2],
      [tappRadius(mal, mal.h), mal.h],
    ],
    40,
  );
  const halv = mal.armBredde / 2;
  const arm = boks([tilX, -halv, 0], [jx, halv, mal.h]);
  return [tapp, arm];
}

/** Thinnest wall between the widest cavity and the outline (outside the slot). */
export function minsteVegg(o: Omriss, sokkel: Sokkel): number {
  const { jx, mal } = sokkel;
  const r = hulromRadius(mal, mal.h / 2);
  const psi = mal.spalteVinkel;
  // Only the outline near the socket matters: sample the rear, fine.
  const omriss: V2[] = [];
  for (let i = 0; i <= 96; i++) {
    const p = omrissPunkt(o, Math.PI / 4 + (i / 96) * 1.5 * Math.PI);
    if (p[0] <= jx + r + mal.vegg * 2) omriss.push(p);
  }
  let minst = Infinity;
  for (let i = 0; i <= 24; i++) {
    const v = -(Math.PI - psi) + (i / 24) * 2 * (Math.PI - psi);
    const px = jx + r * Math.cos(v);
    const py = r * Math.sin(v);
    if (omrissNorm(o, px, py) >= 1) return 0;
    for (let k = 0; k + 1 < omriss.length; k++) {
      minst = Math.min(minst, avstandTilLinje(px, py, omriss[k]!, omriss[k + 1]!));
    }
  }
  return minst;
}

function avstandTilLinje(px: number, py: number, a: V2, b: V2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l = vx * vx + vy * vy;
  const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l)) : 0;
  return Math.hypot(px - a[0] - t * vx, py - a[1] - t * vy);
}
