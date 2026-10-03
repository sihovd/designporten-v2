/**
 * Mechanism profiles for BuildForge clickers (handoff 2026-10-03, §5 and §17).
 *
 * A profile owns every mechanical number: the switch seat in the base, the
 * coupling in the top, the travel and the clearance between moving and
 * fixed parts. The project only stores the profile id and version, so a
 * hand-edited project file cannot change the mechanics.
 *
 * Nothing here is measured. The only profile is a trial profile
 * («prøveprofil») built from commonly published numbers for MX-style
 * keyboard switches plus trial values chosen so the geometry is consistent.
 * Every number says where it came from, and the editor shows it. A measured
 * value is a data change here, followed by a new profile version.
 */

/**
 * How sure we are of a value:
 * - `fysisk-verifisert`: measured on a real switch / proven by a test print.
 * - `vanlig-mal`: a commonly published value for MX-style switches, not checked on a specific switch.
 * - `proveverdi`: chosen by us so the trial geometry is consistent. Not a product fact.
 * - `designstandard`: a Designporten design choice (wall size, rounding), not a fit value.
 */
export type Sikkerhet = 'fysisk-verifisert' | 'vanlig-mal' | 'proveverdi' | 'designstandard';

export const sikkerhetTekst: Record<Sikkerhet, string> = {
  'fysisk-verifisert': 'Målt og testet',
  'vanlig-mal': 'Vanlig mål, ikke målt',
  proveverdi: 'Prøveverdi',
  designstandard: 'Designvalg',
};

export interface Maal {
  verdi: number;
  sikkerhet: Sikkerhet;
  navn: string;
}

export interface Mekanikkprofil {
  id: string;
  versjon: string;
  navn: string;
  /** Physical status of the profile. `ikke-testet` blocks any production claim. */
  fysiskStatus: 'ikke-testet' | 'testet';
  /** Plain description shown next to the status. */
  merknad: string;
  bryter: {
    /** Square plate cutout the switch clips into. */
    utsparing: Maal;
    platetykkelse: Maal;
    /** Free square space under the plate for the switch body and clips. */
    husBreddeUnder: Maal;
    husDybdeUnder: Maal;
    /** Top housing above the plate (drawn as a box; reference only). */
    husBreddeOver: Maal;
    husHoydeOver: Maal;
    /** Top of the stem above the plate top, at rest. */
    stammeTopp: Maal;
    /** Total travel of the stem. */
    vandring: Maal;
    /** Cross stem arm length and thickness. */
    korsLengde: Maal;
    korsTykkelse: Maal;
  };
  topp: {
    /** Extra width per side of the cross socket (fit clearance). */
    korsKlaring: Maal;
    /** How far the cross stem goes into the top. */
    korsDybde: Maal;
    bossDiameter: Maal;
    /** Closed material above the socket before the top plate starts. */
    takOverKors: Maal;
    plateBredde: Maal;
    plateTykkelse: Maal;
    plateRadius: Maal;
  };
  underdel: {
    bredde: Maal;
    hoyde: Maal;
    radius: Maal;
  };
  /** Minimum gap between moving and fixed parts through the whole travel. */
  klaring: Maal;
  /** Trial limits for the moving top (return not tested). */
  grenser: {
    toppVolum: Maal;
    toppHoyde: Maal;
    skjevhet: Maal;
  };
}

const m = (verdi: number, sikkerhet: Sikkerhet, navn: string): Maal => ({ verdi, sikkerhet, navn });

export const MX_PROVE: Mekanikkprofil = {
  id: 'mx-lignende-prove',
  versjon: '0.1.0',
  navn: 'MX-lignende bryter, prøveprofil',
  fysiskStatus: 'ikke-testet',
  merknad:
    'Prøveprofil. Målene er ikke kontrollert på en bestemt bryter, og ingen del er testprintet. Passform, klikk og retur er ikke bekreftet.',
  bryter: {
    utsparing: m(14, 'vanlig-mal', 'Hull i platen'),
    platetykkelse: m(1.5, 'vanlig-mal', 'Platetykkelse'),
    husBreddeUnder: m(15.6, 'proveverdi', 'Plass til bryteren under platen'),
    husDybdeUnder: m(5.2, 'proveverdi', 'Bryterhus under platen'),
    husBreddeOver: m(15.6, 'proveverdi', 'Bryterhus over platen, bredde'),
    husHoydeOver: m(4.2, 'proveverdi', 'Bryterhus over platen, høyde'),
    stammeTopp: m(11.6, 'proveverdi', 'Stammetopp over platen i hvile'),
    vandring: m(4, 'vanlig-mal', 'Vandring'),
    korsLengde: m(4, 'vanlig-mal', 'Korsstamme, lengde'),
    korsTykkelse: m(1.2, 'proveverdi', 'Korsstamme, tykkelse'),
  },
  topp: {
    korsKlaring: m(0.1, 'proveverdi', 'Klaring i korshullet per side'),
    korsDybde: m(2.8, 'proveverdi', 'Korshullets dybde'),
    bossDiameter: m(5.6, 'designstandard', 'Feste rundt korshullet, diameter'),
    takOverKors: m(0.6, 'designstandard', 'Materiale over korshullet'),
    plateBredde: m(18, 'designstandard', 'Toppens grunnplate, bredde'),
    plateTykkelse: m(2, 'designstandard', 'Toppens grunnplate, tykkelse'),
    plateRadius: m(3, 'designstandard', 'Toppens grunnplate, hjørneradius'),
  },
  underdel: {
    bredde: m(24, 'designstandard', 'Underdelens bredde'),
    hoyde: m(11, 'proveverdi', 'Underdelens høyde (plass til bryterens pinner)'),
    radius: m(3, 'designstandard', 'Underdelens hjørneradius'),
  },
  klaring: m(0.4, 'proveverdi', 'Minste klaring mellom topp og underdel'),
  grenser: {
    toppVolum: m(14_000, 'proveverdi', 'Største massive volum på toppen (mm³)'),
    toppHoyde: m(45, 'proveverdi', 'Største høyde på toppen over grunnplaten'),
    skjevhet: m(8, 'proveverdi', 'Største sideforskyvning av toppens tyngdepunkt'),
  },
};

export const profiler: Record<string, Mekanikkprofil> = { [`${MX_PROVE.id}@${MX_PROVE.versjon}`]: MX_PROVE };

export function finnProfil(id: string, versjon: string): Mekanikkprofil | undefined {
  return profiler[`${id}@${versjon}`];
}

/** Heights (mm above the build plate) derived from a profile. */
export interface Mekanikkmal {
  /** Top of the base = top of the switch plate. */
  plateTopp: number;
  plateBunn: number;
  husTopp: number;
  stammeTopp: number;
  /** Bottom of the top's boss (= cross socket opening) at rest. */
  bossBunn: number;
  /** Underside of the top's plate at rest. */
  toppPlateBunn: number;
  toppPlateTopp: number;
  vandring: number;
  klaring: number;
}

export function mekanikkmal(p: Mekanikkprofil): Mekanikkmal {
  const b = p.bryter;
  const plateTopp = p.underdel.hoyde.verdi;
  const stammeTopp = plateTopp + b.stammeTopp.verdi;
  const bossBunn = stammeTopp - p.topp.korsDybde.verdi;
  const toppPlateBunn = stammeTopp + p.topp.takOverKors.verdi;
  return {
    plateTopp,
    plateBunn: plateTopp - b.platetykkelse.verdi,
    husTopp: plateTopp + b.husHoydeOver.verdi,
    stammeTopp,
    bossBunn,
    toppPlateBunn,
    toppPlateTopp: toppPlateBunn + p.topp.plateTykkelse.verdi,
    vandring: b.vandring.verdi,
    klaring: p.klaring.verdi,
  };
}

/**
 * Internal consistency of a profile: the geometry it describes must leave
 * room for the switch and keep the top's coupling clear of the switch
 * housing through the whole travel. Says nothing about a real switch.
 */
export function sjekkProfil(p: Mekanikkprofil): string[] {
  const feil: string[] = [];
  const k = mekanikkmal(p);
  const b = p.bryter;
  if (k.bossBunn - k.vandring < k.husTopp + k.klaring - 1e-9)
    feil.push('Toppens feste treffer bryterhuset før vandringen er ferdig.');
  if (b.husBreddeUnder.verdi <= b.utsparing.verdi)
    feil.push('Rommet under platen er smalere enn platehullet.');
  if (k.plateBunn - b.husDybdeUnder.verdi < 0) feil.push('Underdelen er for lav for bryterhuset.');
  if (p.underdel.bredde.verdi - b.husBreddeUnder.verdi < 2) feil.push('Veggen rundt bryteren er under 1 mm.');
  if (p.topp.bossDiameter.verdi < b.korsLengde.verdi + 2 * p.topp.korsKlaring.verdi + 1)
    feil.push('Festet rundt korshullet er for tynt.');
  if (k.stammeTopp - p.topp.korsDybde.verdi < k.husTopp)
    feil.push('Korshullet går ned under bryterhusets topp.');
  return feil;
}
