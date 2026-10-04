/**
 * Attachment points on the current model (handoff §2, «virtuell
 * magnetisme»): each point is found by tracing a ray to the body's real
 * surface, so parts snap onto what is there now, not onto a fixed spot.
 */
import {
  alleFestepunkter,
  delAv,
  festeretninger,
  type Festepunkt,
  type FestepunktId,
  type Retning,
} from './bibliotek';
import { beskyttetDekor, dekorBoks, dekorFelt, formerI } from './felt';
import { anvend, kropperAv, plasser } from './graf';
import { finnKroppsmal } from './kroppsbibliotek';
import { byggMekanikk, type Mekanikk } from './mekanikk';
import { familieFor, type BuildforgeParametre } from './parametre';
import { finnProfil } from './profil';
import { boksUnion, gradient, straale, type V3 } from './sdf';

/** Direction of the ray that finds each face. */
const strale: Record<Retning, V3> = {
  midt: [0, 0, -1],
  front: [0, 1, 0],
  venstre: [1, 0, 0],
  hoyre: [-1, 0, 0],
  bak: [0, -1, 0],
  utside: [-1, 0, 0],
};
const retning = (id: FestepunktId): V3 => strale[delAv(id).retning];

let hurtig: { profil: string; mek: Mekanikk } | null = null;
function mekanikkFor(p: BuildforgeParametre): Mekanikk | null {
  const nokkel = `${p.profil.id}@${p.profil.versjon}`;
  if (hurtig?.profil === nokkel) return hurtig.mek;
  const profil = finnProfil(p.profil.id, p.profil.versjon);
  if (!profil) return null;
  hurtig = { profil: nokkel, mek: byggMekanikk(profil) };
  return hurtig.mek;
}

/**
 * Modular builder: points on each part's own shapes, found in the part's
 * frame and moved to where the part stands. Joints are not cut here; a
 * point close to a joint can land on a surface the joint later trims.
 */
function modulpunkter(p: BuildforgeParametre, bare?: string): Festepunkt[] {
  const plass = plasser(p);
  const ut: Festepunkt[] = [];
  for (const k of kropperAv(p)) {
    if (bare && k.id !== bare) continue;
    const egne = formerI(p.former, k.id);
    const b = dekorBoks(egne);
    const pl = plass.get(k.id);
    if (!b || !pl) continue;
    const felt = dekorFelt(egne);
    const c: V3 = [0, 1, 2].map((i) => (b.min[i]! + b.maks[i]!) / 2) as V3;
    const symmetrisk = !finnKroppsmal(k.komponent?.id)?.side;
    for (const r of festeretninger[k.kategori]) {
      const d = strale[r];
      const start: V3 =
        r === 'midt' ? [c[0], c[1], b.maks[2] + 20] : [c[0] - d[0] * 100, c[1] - d[1] * 100, c[2]];
      const treff = straale(felt, start, d, 200);
      if (!treff) continue;
      const g = gradient(felt, treff);
      const l = Math.hypot(...g) || 1;
      const n: V3 = [g[0] / l, g[1] / l, g[2] / l];
      const verden = anvend(pl.m, treff);
      ut.push({
        id: `${k.id}-${r}` as FestepunktId,
        kropp: k.id,
        retning: r,
        slag: k.kategori,
        punkt: [verden[0] + pl.t[0], verden[1] + pl.t[1], verden[2] + pl.t[2]],
        normal: anvend(pl.m, n),
        lokalPunkt: treff,
        lokalNormal: n,
        symmetrisk,
      });
    }
  }
  return ut;
}

/** Attachment points on the current model; `bare` limits them to one part (modular builder). */
export function festepunkter(p: BuildforgeParametre, bare?: string): Festepunkt[] {
  if (familieFor(p) === 'modul') return modulpunkter(p, bare);
  const mek = mekanikkFor(p);
  if (!mek) return [];
  const ut: Festepunkt[] = [];
  for (const kropp of ['topp', 'underdel'] as const) {
    const egne = formerI(p.former, kropp);
    const dekor = beskyttetDekor(
      dekorFelt(egne),
      kropp === 'topp' ? mek.sperreTopp : mek.sperreUnderdel,
      kropp,
    );
    const kjerne = kropp === 'topp' ? mek.toppFelt : mek.underdelFelt;
    const felt = (x: number, y: number, z: number) => Math.min(dekor(x, y, z), kjerne(x, y, z));
    const b = boksUnion(dekorBoks(egne), kropp === 'topp' ? mek.toppBoks : mek.underdelBoks)!;
    // the top's side points sit halfway up its visible part (between its plate and the
    // highest point on the axis), the base's halfway up the base
    const toppunkt = straale(felt, [0, 0, b.maks[2] + 20], [0, 0, -1], 400);
    const zMidt =
      kropp === 'topp'
        ? (mek.mal.toppPlateBunn + Math.max(toppunkt?.[2] ?? 0, mek.mal.toppPlateTopp)) / 2
        : mek.mal.plateTopp / 2;
    const avstand = 200;
    for (const id of alleFestepunkter.filter((f) => delAv(f).kropp === kropp)) {
      const r = retning(id);
      const start: V3 = id === 'topp-midt' ? [0, 0, b.maks[2] + 20] : [-r[0] * 100, -r[1] * 100, zMidt];
      const treff = straale(felt, start, r, avstand);
      if (!treff) continue;
      const g = gradient(felt, treff);
      const l = Math.hypot(...g) || 1;
      const n: V3 = [g[0] / l, g[1] / l, g[2] / l];
      ut.push({
        id,
        kropp,
        retning: delAv(id).retning,
        slag: kropp,
        punkt: treff,
        normal: n,
        lokalPunkt: treff,
        lokalNormal: n,
        symmetrisk: true,
      });
    }
  }
  return ut;
}
