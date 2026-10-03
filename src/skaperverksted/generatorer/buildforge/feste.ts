/**
 * Attachment points on the current model (handoff §2, «virtuell
 * magnetisme»): each point is found by tracing a ray to the body's real
 * surface, so parts snap onto what is there now, not onto a fixed spot.
 */
import { alleFestepunkter, kroppFor, type Festepunkt, type FestepunktId } from './bibliotek';
import { beskyttetDekor, dekorBoks, dekorFelt, formerI } from './felt';
import { byggMekanikk, type Mekanikk } from './mekanikk';
import type { BuildforgeParametre } from './parametre';
import { finnProfil } from './profil';
import { boksUnion, gradient, straale, type V3 } from './sdf';

const retning: Record<FestepunktId, V3> = {
  'topp-midt': [0, 0, -1],
  'topp-front': [0, 1, 0],
  'topp-venstre': [1, 0, 0],
  'topp-hoyre': [-1, 0, 0],
  'topp-bak': [0, -1, 0],
  'underdel-front': [0, 1, 0],
  'underdel-venstre': [1, 0, 0],
  'underdel-hoyre': [-1, 0, 0],
  'underdel-bak': [0, -1, 0],
};

let hurtig: { profil: string; mek: Mekanikk } | null = null;
function mekanikkFor(p: BuildforgeParametre): Mekanikk | null {
  const nokkel = `${p.profil.id}@${p.profil.versjon}`;
  if (hurtig?.profil === nokkel) return hurtig.mek;
  const profil = finnProfil(p.profil.id, p.profil.versjon);
  if (!profil) return null;
  hurtig = { profil: nokkel, mek: byggMekanikk(profil) };
  return hurtig.mek;
}

export function festepunkter(p: BuildforgeParametre): Festepunkt[] {
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
      const r = retning[id];
      const start: V3 = id === 'topp-midt' ? [0, 0, b.maks[2] + 20] : [-r[0] * 100, -r[1] * 100, zMidt];
      const treff = straale(felt, start, r, avstand);
      if (!treff) continue;
      const g = gradient(felt, treff);
      const l = Math.hypot(...g) || 1;
      ut.push({ id, punkt: treff, normal: [g[0] / l, g[1] / l, g[2] / l] });
    }
  }
  return ut;
}
