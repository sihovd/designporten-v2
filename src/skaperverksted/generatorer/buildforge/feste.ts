/**
 * Attachment points on the current model (handoff §2, «virtuell
 * magnetisme»): each point is found by tracing a ray to the body's real
 * surface, so parts snap onto what is there now, not onto a fixed spot.
 */
import {
  alleFestepunkter,
  delAv,
  festeretninger,
  kroppFor,
  type Festepunkt,
  type FestepunktId,
  type Retning,
} from './bibliotek';
import { beskyttetDekor, dekorBoks, dekorFelt, formerI } from './felt';
import { FIGURLEDD_PROVE, finnLeddprofil, lagSkjelett, segmentledd } from './figur';
import { byggMekanikk, type Mekanikk } from './mekanikk';
import { familieFor, figurKropper, type BuildforgeParametre } from './parametre';
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

/** Figure: points on each segment's decoration, the pairs on the left (+X) side. */
function figurpunkter(p: BuildforgeParametre): Festepunkt[] {
  const s = lagSkjelett(p.grunnmodeller ?? {});
  const profil = finnLeddprofil(p.profil.id, p.profil.versjon) ?? FIGURLEDD_PROVE;
  if (!s) return [];
  const ut: Festepunkt[] = [];
  for (const kropp of figurKropper) {
    const egne = formerI(p.former, kropp);
    const b = dekorBoks(egne);
    if (!b) continue;
    const o = s.origo[kropp];
    const lokal = segmentledd(kropp, s, profil).kutt(dekorFelt(egne));
    const felt = (x: number, y: number, z: number) => lokal(x - o[0], y - o[1], z - o[2]);
    const c: V3 = [0, 1, 2].map((k) => (b.min[k]! + b.maks[k]!) / 2 + o[k]!) as V3;
    for (const r of festeretninger[kropp]) {
      const id = `${kropp}-${r}` as FestepunktId;
      const d = strale[r];
      const start: V3 =
        r === 'midt' ? [c[0], c[1], b.maks[2] + o[2] + 20] : [c[0] - d[0] * 100, c[1] - d[1] * 100, c[2]];
      const treff = straale(felt, start, d, 200);
      if (!treff) continue;
      const g = gradient(felt, treff);
      const l = Math.hypot(...g) || 1;
      ut.push({ id, punkt: treff, normal: [g[0] / l, g[1] / l, g[2] / l], origo: o });
    }
  }
  return ut;
}

export function festepunkter(p: BuildforgeParametre): Festepunkt[] {
  if (familieFor(p) === 'figur') return figurpunkter(p);
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
    for (const id of alleFestepunkter.filter((f) => kroppFor(f) === kropp)) {
      const r = retning(id);
      const start: V3 = id === 'topp-midt' ? [0, 0, b.maks[2] + 20] : [-r[0] * 100, -r[1] * 100, zMidt];
      const treff = straale(felt, start, r, avstand);
      if (!treff) continue;
      const g = gradient(felt, treff);
      const l = Math.hypot(...g) || 1;
      ut.push({ id, punkt: treff, normal: [g[0] / l, g[1] / l, g[2] / l], origo: [0, 0, 0] });
    }
  }
  return ut;
}
