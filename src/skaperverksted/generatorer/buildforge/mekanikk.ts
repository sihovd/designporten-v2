/**
 * The protected mechanics of a clicker, generated from the profile alone
 * (handoff §5.5, §7.2): the base with its switch seat, the top with its
 * cross socket, the switch as a reference, and the zones decoration may
 * not enter. Exact meshes for export, exact fields for the checks.
 */
import { slaSammenMesh, type Mesh } from '../../geometri/mesh';
import { mekanikkmal, type Mekanikkmal, type Mekanikkprofil } from './profil';
import { avrundetRektangel, kors, prisme, sirkel } from './prisme';
import { avrundetPrisme, boksMellom, differanse, sylinder, union, type Boks, type Felt } from './sdf';

export interface Referanseboks {
  navn: string;
  min: [number, number, number];
  maks: [number, number, number];
  /** Moves with the top (the stem). */
  beveger: boolean;
}

export interface Mekanikk {
  profil: Mekanikkprofil;
  mal: Mekanikkmal;
  underdelMesh: Mesh;
  toppMesh: Mesh;
  /** Solid fields of the locked parts. */
  underdelFelt: Felt;
  toppFelt: Felt;
  underdelBoks: Boks;
  toppBoks: Boks;
  /** Switch housing above the plate: fixed, never printed. */
  husFelt: Felt;
  husBoks: Boks;
  /** Zones decoration is cut back from, per body. */
  sperreUnderdel: Felt;
  sperreTopp: Felt;
  /** Switch reference for the preview only (not exported). */
  referanse: Referanseboks[];
  /** Protected zones for the preview. */
  sperresoner: {
    kropp: 'topp' | 'underdel';
    min: [number, number, number];
    maks: [number, number, number];
  }[];
}

/** Extra distance between decoration and the switch, beyond the profile's clearance. */
const SPERREMARGIN = 1;

export function byggMekanikk(p: Mekanikkprofil): Mekanikk {
  const k = mekanikkmal(p);
  const b = p.bryter;
  const t = p.topp;
  const hb = p.underdel.bredde.verdi / 2;
  const hu = b.husBreddeUnder.verdi / 2;
  const hs = b.utsparing.verdi / 2;
  const ho = b.husBreddeOver.verdi / 2;

  // Base: rounded block, open below, switch cavity under a plate with the square cutout.
  const underdelMesh = prisme(avrundetRektangel(hb, hb, p.underdel.radius.verdi), 0, k.plateTopp, [
    { omriss: avrundetRektangel(hu, hu, 0), z0: 0, z1: k.plateBunn },
    { omriss: avrundetRektangel(hs, hs, 0), z0: k.plateBunn, z1: k.plateTopp },
  ]);
  const underdelFelt = differanse(
    avrundetPrisme(hb, hb, p.underdel.radius.verdi, 0, k.plateTopp),
    union(
      boksMellom([-hu, -hu, -1], [hu, hu, k.plateBunn]),
      boksMellom([-hs, -hs, -1], [hs, hs, k.plateTopp + 1]),
    ),
  );

  // Top: a boss with a blind cross socket, under a small plate. The boss runs
  // 0.5 mm into the plate so the two closed shells overlap.
  const kl = b.korsLengde.verdi + 2 * t.korsKlaring.verdi;
  const kt = b.korsTykkelse.verdi + 2 * t.korsKlaring.verdi;
  const rb = t.bossDiameter.verdi / 2;
  const hp = t.plateBredde.verdi / 2;
  const bossTopp = k.toppPlateBunn + 0.5;
  const toppMesh = slaSammenMesh([
    prisme(sirkel(rb, 40), k.bossBunn, bossTopp, [
      { omriss: kors(kl, kt), z0: k.bossBunn, z1: k.stammeTopp },
    ]),
    prisme(avrundetRektangel(hp, hp, t.plateRadius.verdi), k.toppPlateBunn, k.toppPlateTopp),
  ]);
  const korsFelt = union(
    boksMellom([-kl / 2, -kt / 2, k.bossBunn - 1], [kl / 2, kt / 2, k.stammeTopp]),
    boksMellom([-kt / 2, -kl / 2, k.bossBunn - 1], [kt / 2, kl / 2, k.stammeTopp]),
  );
  const bossH = bossTopp - k.bossBunn;
  const bossFelt = sylinder(rb, bossH, 0);
  const bossZ = (bossTopp + k.bossBunn) / 2;
  const toppFelt = union(
    differanse((x, y, z) => bossFelt(x, y, z - bossZ), korsFelt),
    avrundetPrisme(hp, hp, t.plateRadius.verdi, k.toppPlateBunn, k.toppPlateTopp),
  );

  const husFelt = boksMellom([-ho, -ho, k.plateTopp], [ho, ho, k.husTopp]);

  const hsperre = Math.max(hu, ho) + p.klaring.verdi + SPERREMARGIN;
  const sperreUnderdel = boksMellom([-hsperre, -hsperre, -1000], [hsperre, hsperre, 1000]);
  const sperreTopp = boksMellom([-hsperre, -hsperre, -1000], [hsperre, hsperre, k.toppPlateBunn]);

  const kh = b.korsTykkelse.verdi / 2;
  const kL = b.korsLengde.verdi / 2;
  return {
    profil: p,
    mal: k,
    underdelMesh,
    toppMesh,
    underdelFelt,
    toppFelt,
    underdelBoks: { min: [-hb, -hb, 0], maks: [hb, hb, k.plateTopp] },
    toppBoks: { min: [-hp, -hp, k.bossBunn], maks: [hp, hp, k.toppPlateTopp] },
    husFelt,
    husBoks: { min: [-ho, -ho, k.plateTopp], maks: [ho, ho, k.husTopp] },
    sperreUnderdel,
    sperreTopp,
    referanse: [
      {
        navn: 'Bryterhus under platen',
        min: [-hs, -hs, k.plateBunn - b.husDybdeUnder.verdi],
        maks: [hs, hs, k.plateBunn],
        beveger: false,
      },
      {
        navn: 'Bryterhus over platen',
        min: [-ho, -ho, k.plateTopp],
        maks: [ho, ho, k.husTopp],
        beveger: false,
      },
      { navn: 'Stamme', min: [-kL, -kh, k.husTopp], maks: [kL, kh, k.stammeTopp], beveger: true },
      { navn: 'Stamme', min: [-kh, -kL, k.husTopp], maks: [kh, kL, k.stammeTopp], beveger: true },
    ],
    sperresoner: [
      { kropp: 'underdel', min: [-hsperre, -hsperre, 0], maks: [hsperre, hsperre, k.plateTopp] },
      { kropp: 'topp', min: [-hsperre, -hsperre, k.plateTopp], maks: [hsperre, hsperre, k.toppPlateBunn] },
    ],
  };
}
