/**
 * Material and printer catalogue. This is product data, not UI tokens.
 * `bekreftet: false` = not yet confirmed by Designporten (stock, colours,
 * printers). The editor says so where it matters. Replace with confirmed
 * data when Sivert supplies it.
 */

export type Materialtype = 'PLA' | 'PLA Matt' | 'PLA Silk' | 'PETG' | 'Resirkulert PLA' | 'Tre-look PLA';

export interface Materialtypeinfo {
  type: Materialtype;
  beskrivelse: string;
  /** Minimum printable wall (mm) for warnings. */
  minVegg: number;
  /** Max overhang from vertical, degrees, before a warning. */
  maksOverheng: number;
  /** Density g/cm³ for weight estimates. */
  tetthet: number;
  /** Surface look in 3D preview. */
  ruhet: number;
  metallisk: number;
}

export const materialtyper: Record<Materialtype, Materialtypeinfo> = {
  PLA: {
    type: 'PLA',
    beskrivelse: 'Stiv og presis. Til ting som skal stå pent innendørs.',
    minVegg: 0.8,
    maksOverheng: 50,
    tetthet: 1.24,
    ruhet: 0.55,
    metallisk: 0,
  },
  'PLA Matt': {
    type: 'PLA Matt',
    beskrivelse: 'Matt overflate som skjuler laglinjene godt.',
    minVegg: 0.8,
    maksOverheng: 50,
    tetthet: 1.24,
    ruhet: 0.85,
    metallisk: 0,
  },
  'PLA Silk': {
    type: 'PLA Silk',
    beskrivelse: 'Blank, silkeaktig glans.',
    minVegg: 0.8,
    maksOverheng: 45,
    tetthet: 1.24,
    ruhet: 0.25,
    metallisk: 0.35,
  },
  PETG: {
    type: 'PETG',
    beskrivelse: 'Seigere. Tåler sol, vann og temperatursvingninger.',
    minVegg: 1,
    maksOverheng: 45,
    tetthet: 1.27,
    ruhet: 0.4,
    metallisk: 0,
  },
  'Resirkulert PLA': {
    type: 'Resirkulert PLA',
    beskrivelse: 'PLA laget av gjenvunnet materiale.',
    minVegg: 0.8,
    maksOverheng: 50,
    tetthet: 1.24,
    ruhet: 0.6,
    metallisk: 0,
  },
  'Tre-look PLA': {
    type: 'Tre-look PLA',
    beskrivelse: 'PLA med trefiber. Gir et treaktig preg, men er fortsatt 3D-print.',
    minVegg: 1,
    maksOverheng: 45,
    tetthet: 1.15,
    ruhet: 0.9,
    metallisk: 0,
  },
};

export interface Materiale {
  id: string;
  navn: string;
  type: Materialtype;
  hex: string;
  bekreftet: boolean;
}

function m(id: string, navn: string, type: Materialtype, hex: string): Materiale {
  return { id, navn, type, hex, bekreftet: false };
}

/** Starting catalogue (colour names from the Sep 2026 test bench). Not confirmed stock. */
export const materialer: Materiale[] = [
  m('pla-kritthvit', 'Kritthvit', 'PLA', '#f1efe9'),
  m('pla-grafitt', 'Grafitt', 'PLA', '#33373d'),
  m('pla-svart', 'Svart', 'PLA', '#1a1a1c'),
  m('pla-lilla', 'Lilla', 'PLA', '#883dff'),
  m('pla-cyan', 'Cyan', 'PLA', '#00c4d6'),
  m('pla-isbla', 'Isblå', 'PLA', '#9fd3ea'),
  m('pla-skog', 'Skogsgrønn', 'PLA', '#2f6b4f'),
  m('pla-signal', 'Signalgul', 'PLA', '#f0c02f'),
  m('pla-rust', 'Rust', 'PLA', '#b4552b'),
  m('pla-rosa', 'Rosa', 'PLA', '#f19cc4'),
  m('matt-sand', 'Sand', 'PLA Matt', '#d9c7a7'),
  m('matt-marine', 'Marineblå', 'PLA Matt', '#1f2f5c'),
  m('silk-gull', 'Gull', 'PLA Silk', '#c9a444'),
  m('silk-solv', 'Sølv', 'PLA Silk', '#b8bcc2'),
  m('petg-klar', 'Klar', 'PETG', '#dfe9ec'),
  m('petg-svart', 'Svart', 'PETG', '#202124'),
  m('resirk-gra', 'Grå', 'Resirkulert PLA', '#8b8d8f'),
  m('tre-lys', 'Lys tre', 'Tre-look PLA', '#c49a6c'),
];

export function finnMateriale(id: string): Materiale {
  return materialer.find((x) => x.id === id) ?? materialer[0]!;
}

export interface Printerprofil {
  id: string;
  navn: string;
  plateBredde: number;
  plateDybde: number;
  byggHoyde: number;
  dyse: number;
  lagHoyde: number;
  /** Colours per print (multi-material). */
  fargerPerPrint: number;
  bekreftet: boolean;
}

/** Generic profile until Designporten's printers are confirmed. */
export const standardPrinter: Printerprofil = {
  id: 'generisk-fdm-4',
  navn: 'Generisk FDM, 4 farger',
  plateBredde: 256,
  plateDybde: 256,
  byggHoyde: 250,
  dyse: 0.4,
  lagHoyde: 0.2,
  fargerPerPrint: 4,
  bekreftet: false,
};
