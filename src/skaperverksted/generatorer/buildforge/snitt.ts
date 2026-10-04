/**
 * A vertical section (the XZ plane at y = 0) through a clicker: the outline
 * of each body as line segments, from the same fields the model is built
 * from. Used for the showroom preview; pure.
 */
import { finnStartmal } from './bibliotek';
import { beskyttetDekor, dekorBoks, dekorFelt, formerI } from './felt';
import { byggMekanikk, type Mekanikk } from './mekanikk';
import type { BuildforgeParametre, KlikkerKropp as Kropp } from './parametre';
import { finnProfil } from './profil';
import { boksUnion, type Felt } from './sdf';

export type Segment = [number, number, number, number];

/** Marching squares on f(x, z) over a box; returns segments in (x, z). */
export function konturer(
  f: (x: number, z: number) => number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  g: number,
): Segment[] {
  const nx = Math.ceil((x1 - x0) / g) + 1,
    nz = Math.ceil((z1 - z0) / g) + 1;
  const v = new Float64Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) v[i + k * nx] = f(x0 + i * g, z0 + k * g) || 1e-9;
  const ut: Segment[] = [];
  const kant = (a: number, b: number, ax: number, az: number, bx: number, bz: number): [number, number] => {
    const t = a / (a - b);
    return [ax + (bx - ax) * t, az + (bz - az) * t];
  };
  for (let k = 0; k < nz - 1; k++)
    for (let i = 0; i < nx - 1; i++) {
      const xa = x0 + i * g,
        za = z0 + k * g,
        xb = xa + g,
        zb = za + g;
      const a = v[i + k * nx]!,
        b = v[i + 1 + k * nx]!,
        c = v[i + 1 + (k + 1) * nx]!,
        d = v[i + (k + 1) * nx]!;
      const p: [number, number][] = [];
      if (a < 0 !== b < 0) p.push(kant(a, b, xa, za, xb, za));
      if (b < 0 !== c < 0) p.push(kant(b, c, xb, za, xb, zb));
      if (c < 0 !== d < 0) p.push(kant(c, d, xb, zb, xa, zb));
      if (d < 0 !== a < 0) p.push(kant(d, a, xa, zb, xa, za));
      for (let j = 0; j + 1 < p.length; j += 2) ut.push([p[j]![0], p[j]![1], p[j + 1]![0], p[j + 1]![1]]);
    }
  return ut;
}

export interface Klikkersnitt {
  underdel: Segment[];
  topp: Segment[];
  /** Switch housing above and below the plate (x0, z0, x1, z1). */
  bryter: Segment[];
  min: [number, number];
  maks: [number, number];
  vandring: number;
  farger: Record<'topp' | 'underdel', string>;
}

function kroppsfelt(p: BuildforgeParametre, mek: Mekanikk, kropp: Kropp): Felt {
  const dekor = beskyttetDekor(
    dekorFelt(formerI(p.former, kropp)),
    kropp === 'topp' ? mek.sperreTopp : mek.sperreUnderdel,
    kropp,
  );
  const kjerne = kropp === 'topp' ? mek.toppFelt : mek.underdelFelt;
  return (x, y, z) => Math.min(dekor(x, y, z), kjerne(x, y, z));
}

export function klikkersnitt(malId = 'knapp', g = 0.4): Klikkersnitt {
  const p = finnStartmal(malId).parametre();
  const mek = byggMekanikk(finnProfil(p.profil.id, p.profil.versjon)!);
  const b = boksUnion(boksUnion(dekorBoks(p.former), mek.underdelBoks), mek.toppBoks)!;
  const x0 = b.min[0] - 1,
    x1 = b.maks[0] + 1,
    z0 = -1,
    z1 = b.maks[2] + 1;
  const snitt = (k: Kropp) => {
    const f = kroppsfelt(p, mek, k);
    return konturer((x, z) => f(x, 0, z), x0, z0, x1, z1, g);
  };
  const rute = (r: { min: number[]; maks: number[] }): Segment[] => {
    const [a, c] = [r.min[0]!, r.maks[0]!];
    const [d, e] = [r.min[2]!, r.maks[2]!];
    return [
      [a, d, c, d],
      [c, d, c, e],
      [c, e, a, e],
      [a, e, a, d],
    ];
  };
  return {
    underdel: snitt('underdel'),
    topp: snitt('topp'),
    bryter: mek.referanse.filter((r) => !r.beveger).flatMap(rute),
    min: [x0, z0],
    maks: [x1, z1],
    vandring: mek.mal.vandring,
    farger: { topp: p.farger.topp!, underdel: p.farger.underdel! },
  };
}
