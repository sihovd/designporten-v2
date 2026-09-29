/**
 * Hardware-aware checks (Sivert, 2026-09-29, item 61): does the selected
 * light module or holder physically fit the lamp as designed?
 *
 * These are geometric checks only. They say nothing about electrical
 * safety, and passing them does not make a printed lamp certified or
 * approved; the editor says so next to them.
 */
import type { Advarsel } from '../../core/generator';
import { mm, tall } from '../../core/enheter';
import { APNING_KANT, indreRadius, type LampeGeometri } from './geometri';
import { MIN_KANT, holderHull, maskinvare, modulMal, sikkerhetTekst, type Modulmal } from './maskinvare';
import type { LampeParametre } from './parametre';

/** Radial room the shade must leave around a module that stands above the base (mm). */
export const MODUL_KLARING = 0.5;
/** Material around the recess below which the base gets a warning (mm). */
export const ANBEFALT_KANT = 3;
/** Floor above the cable channel below which it gets a warning (mm). */
export const MIN_GULV = 1.2;
/** Holder plate below which it gets a warning (mm). */
export const MIN_HOLDERPLATE = 1.6;
/** Retaining lip wider than this is hard to press past (mm). */
export const MAKS_KLEMKANT = 1;

/**
 * Smallest inner radius of the shade in a height band, and where it is.
 * Samples every row and a subset of angles (enough for patterns up to 72).
 */
export function minsteIndre(
  p: LampeParametre,
  g: LampeGeometri,
  z0: number,
  z1: number,
): { r: number; z: number } {
  const H = p.hoyde;
  const rader = Math.max(8, Math.ceil((z1 - z0) / 1.5));
  const vinkler = Math.min(g.vinkler, 288);
  let beste = { r: Infinity, z: z0 };
  for (let i = 0; i <= rader; i++) {
    const z = z0 + ((z1 - z0) * i) / rader;
    if (z < g.zStart || z > H) continue;
    for (let j = 0; j < vinkler; j++) {
      const r = indreRadius(g.form, (j / vinkler) * Math.PI * 2, z / H, H, p.veggtykkelse);
      if (r < beste.r) beste = { r, z };
    }
  }
  return beste;
}

function modulAdvarsler(p: LampeParametre, g: LampeGeometri): Advarsel[] {
  const ut: Advarsel[] = [];
  const hw = maskinvare[p.sokkel];
  const t = p.tilpasning;
  const r = g.modul!;
  const m = r.mal;
  const navn = hw.navn;
  const dModul = m.rModul * 2;

  if (r.apningKlemt || r.lommeKlemt) {
    const trenger = r.apningKlemt ? (r.onsket.rApning + APNING_KANT) * 2 : (r.onsket.rLomme + MIN_KANT) * 2;
    const har = r.apningKlemt ? g.minIndreBunn * 2 : r.minYtre * 2;
    ut.push({
      niva: 'feil',
      tekst: `${navn} får ikke plass. Fordypningen trenger ${mm(trenger, 0)} ${r.apningKlemt ? 'innvendig' : 'utvendig'} nederst, men lampen er ${mm(har, 0)} der. Gjør bunnen bredere.`,
    });
  } else if (r.minYtre - m.rLomme < ANBEFALT_KANT) {
    ut.push({
      niva: 'advarsel',
      tekst: `Bare ${mm(r.minYtre - m.rLomme)} materiale rundt modulen. Minst ${mm(ANBEFALT_KANT, 0)} gjør sokkelen stivere.`,
    });
  }
  if (r.dybdeKlemt) {
    ut.push({
      niva: 'advarsel',
      tekst: `Sokkelen ble for høy for lampen, så fordypningen er gjort grunnere enn du valgte. Gjør lampen høyere eller fordypningen grunnere.`,
    });
  }
  if (r.onsket.rHull > m.rHull + 1e-6) {
    ut.push({
      niva: 'feil',
      tekst: `Kabelhullet er så stort at modulen ikke har noe å hvile på. Det er gjort ${mm(m.rHull * 2, 0)}; gjør det mindre eller bruk en større modul.`,
    });
  }
  if (t.gulv < MIN_GULV) {
    ut.push({
      niva: 'advarsel',
      tekst: `Bunnen over kabelsporet er ${mm(t.gulv)}. Under ${mm(MIN_GULV)} kan den bli svak.`,
    });
  }

  // Cable route: the cable diameter is only checked when it is known.
  const kabel = hw.modul?.kabel.diameter.verdi ?? null;
  if (kabel !== null && (t.kabelBredde < kabel || t.kabelHoyde < kabel)) {
    ut.push({
      niva: 'feil',
      tekst: `Kabelen er ${mm(kabel)} tykk, men sporet er ${mm(t.kabelBredde)} × ${mm(t.kabelHoyde)}. Gjør sporet større.`,
    });
  } else if (kabel === null) {
    ut.push({
      niva: 'info',
      tekst: `Kabeltykkelsen er ikke oppgitt. Sjekk at kabelen passer i sporet (${tall(t.kabelBredde)} × ${mm(t.kabelHoyde)}) og at støpselet går gjennom hullet (${mm(m.rHull * 2, 0)}).`,
    });
  }

  // The module itself, standing on the floor of the recess.
  const toppModul = m.zGulv + m.hModul;
  if (t.feste === 'klemkant') {
    if (toppModul > m.zKlem + 1e-6) {
      ut.push({
        niva: 'feil',
        tekst: `Klemkanten sitter lavere enn toppen av modulen og treffer den. Gjør fordypningen minst ${mm(m.hModul + (m.zTopp - m.zKlem))} dyp.`,
      });
    }
    if (m.rApning >= m.rModul) {
      ut.push({
        niva: 'advarsel',
        tekst: `Klemkanten når ikke inn over modulen (toleransen er like stor som kanten), så den holder den ikke.`,
      });
    } else if (t.klemkant > MAKS_KLEMKANT) {
      ut.push({
        niva: 'advarsel',
        tekst: `Klemkanten er ${mm(t.klemkant)}. Så bred kant gjør det tungt å presse modulen inn, og kanten kan knekke.`,
      });
    }
  } else if (toppModul < m.zTopp - 1e-6) {
    ut.push({
      niva: 'info',
      tekst: `Modulen ligger ${mm(m.zTopp - toppModul)} under kanten av fordypningen, så kanten skygger litt for lyset.`,
    });
  }
  if (toppModul > p.hoyde) {
    ut.push({
      niva: 'feil',
      tekst: `Modulen står ${mm(toppModul, 0)} opp, men lampen er bare ${mm(p.hoyde, 0)} høy.`,
    });
  } else if (toppModul > m.zTopp) {
    const treff = minsteIndre(p, g, m.zTopp, toppModul);
    if (treff.r < m.rModul + MODUL_KLARING) {
      ut.push({
        niva: 'feil',
        tekst: `Lampeveggen treffer modulen ${mm(treff.z, 0)} over bordet. Innsiden er ${mm(treff.r * 2, 0)}, modulen er ${mm(dModul, 0)}.`,
      });
    }
  }

  // The base is part of the lamp, so the module goes in from the top.
  const vei = minsteIndre(p, g, m.zTopp, p.hoyde);
  if (vei.r < m.rModul) {
    ut.push({
      niva: 'feil',
      tekst: `Modulen kommer ikke ned gjennom lampen. Den er ${mm(dModul, 0)}, men innsiden er bare ${mm(vei.r * 2, 0)} ${mm(vei.z, 0)} over bordet.`,
    });
  }

  const hoyde = hw.modul?.kroppHoyde;
  if (t.modulHoyde === null && hoyde && hoyde.sikkerhet === 'uklar') {
    ut.push({
      niva: 'info',
      tekst: `Høyden på modulen (${mm(hoyde.verdi ?? 0, 0)}) er usikker. Mål den og legg inn riktig høyde under Avansert.`,
    });
  }
  if (!hw.passformVerifisert) {
    ut.push({
      niva: 'info',
      tekst: `Passformen for ${navn} er ikke fysisk verifisert. Skriv ut prøvebiten før hele lampen.`,
    });
  }
  return ut;
}

function holderAdvarsler(p: LampeParametre, g: LampeGeometri): Advarsel[] {
  const ut: Advarsel[] = [];
  const hw = maskinvare[p.sokkel];
  const hull = holderHull(p.sokkel, p.tilpasning) ?? 0;
  if (g.hullForStort) {
    ut.push({
      niva: 'feil',
      tekst: `Hullet til ${hw.navn} er ${mm(hull, 0)}, men bunnen er bare ${mm(g.minIndreBunn * 2, 0)} innvendig. Gjør bunnen bredere.`,
    });
  }
  if (p.bunnTykkelse < MIN_HOLDERPLATE) {
    ut.push({
      niva: 'advarsel',
      tekst: `Bunnplaten er ${mm(p.bunnTykkelse)}. Skjermringen klemmer platen, og under ${mm(MIN_HOLDERPLATE)} kan den sprekke.`,
    });
  }
  if (p.tilpasning.holderHull === null) {
    ut.push({
      niva: 'info',
      tekst: `Hullmålet for ${hw.navn} (${mm(hull, 0)}) er et vanlig mål, men ikke bekreftet av Designporten ennå. Mål holderen din og juster hullet.`,
    });
  }
  if (hw.varme) ut.push({ niva: 'info', tekst: hw.varme });
  return ut;
}

/** Fit checks for the selected hardware. Empty for shades without a light source. */
export function vurderPassform(p: LampeParametre, g: LampeGeometri): Advarsel[] {
  const type = maskinvare[p.sokkel].type;
  if (type === 'modul' && g.modul) return modulAdvarsler(p, g);
  if (type === 'holder') return holderAdvarsler(p, g);
  return [];
}

/** The recess the fit-test piece is built with (cable hole limited like on the lamp). */
export function provebitMal(p: LampeParametre): Modulmal | null {
  const m = modulMal(p.sokkel, p.tilpasning);
  if (!m) return null;
  return { ...m, rHull: Math.max(0.5, Math.min(m.rHull, m.rLomme - 2)) };
}

/** Checks that still apply to the fit-test piece on its own. */
export function vurderProvebit(p: LampeParametre, m: Modulmal): Advarsel[] {
  const ut: Advarsel[] = [];
  const hw = maskinvare[p.sokkel];
  const t = p.tilpasning;
  ut.push({
    niva: 'info',
    tekst: `Dette er bare prøvebiten for ${hw.navn}: fordypning, ${t.feste === 'klemkant' ? 'klemkant, ' : ''}kabelhull og kabelspor. Sjekk at modulen passer før du skriver ut lampen.`,
  });
  if (t.feste === 'klemkant' && m.zGulv + m.hModul > m.zKlem + 1e-6) {
    ut.push({
      niva: 'feil',
      tekst: `Klemkanten sitter lavere enn toppen av modulen og treffer den. Gjør fordypningen minst ${mm(m.hModul + (m.zTopp - m.zKlem))} dyp.`,
    });
  }
  if (modulMal(p.sokkel, t)!.rHull > m.rHull + 1e-6) {
    ut.push({
      niva: 'feil',
      tekst: `Kabelhullet er så stort at modulen ikke har noe å hvile på. Det er gjort ${mm(m.rHull * 2, 0)}.`,
    });
  }
  const h = hw.modul?.kroppHoyde;
  if (t.modulHoyde === null && h?.sikkerhet === 'uklar') {
    ut.push({
      niva: 'info',
      tekst: `Modulhøyde: ${mm(h.verdi ?? 0, 0)} (${sikkerhetTekst.uklar.toLowerCase()}).`,
    });
  }
  return ut;
}
