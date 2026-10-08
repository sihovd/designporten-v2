/**
 * User settings for the workshop (not the project): colour mode and the editor background.
 * They live in the browser, apply to every project and are read by the canvases through
 * the CSS tokens, so the 2D canvas, the 3D view and the panels share one source.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Horisont } from './tema';

export type Temavalg = 'standard' | 'lys' | 'mork';

export interface Brukerinnstillinger {
  /** Colour mode: the generator's own, or forced light or dark. */
  tema: Temavalg;
  /** Background preset id (see BAKGRUNNER), «egen» uses `egenFarge`. */
  bakgrunn: string;
  egenFarge: string;
}

export interface Bakgrunn {
  id: string;
  navn: string;
  /** null: whatever the colour mode gives. */
  horisont: Horisont | null;
}

const flat = (c: string): Horisont => ({ topp: c, hoy: c, linje: c, bunn: c, pos: 0.62 });

export const BAKGRUNNER: Bakgrunn[] = [
  { id: 'standard', navn: 'Standard', horisont: null },
  {
    id: 'blaa',
    navn: 'Blå horisont',
    horisont: { topp: '#04070f', hoy: '#0f2a5c', linje: '#3a73c4', bunn: '#0d2250', pos: 0.62 },
  },
  {
    id: 'midnatt',
    navn: 'Midnatt',
    horisont: { topp: '#05060d', hoy: '#111a33', linje: '#2c3a66', bunn: '#0a0f20', pos: 0.62 },
  },
  {
    id: 'solnedgang',
    navn: 'Skumring',
    horisont: { topp: '#140a24', hoy: '#3a1f63', linje: '#b86a8f', bunn: '#2a1646', pos: 0.62 },
  },
  { id: 'grafitt', navn: 'Grafitt', horisont: flat('#17181c') },
  { id: 'lysgra', navn: 'Lys grå', horisont: flat('#dfe3ea') },
  { id: 'hvit', navn: 'Hvit', horisont: flat('#fbfbfd') },
];

export const STANDARD_INNSTILLINGER: Brukerinnstillinger = {
  tema: 'standard',
  bakgrunn: 'standard',
  egenFarge: '#2f6fd0',
};

const NOKKEL = 'designporten.skaperverksted.innstillinger.v1';

export function gyldigHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

/** Read what is stored; anything unknown falls back to the defaults. */
export function lesInnstillinger(raa: string | null): Brukerinnstillinger {
  if (!raa) return STANDARD_INNSTILLINGER;
  try {
    const j = JSON.parse(raa) as Partial<Brukerinnstillinger>;
    const tema: Temavalg = j.tema === 'lys' || j.tema === 'mork' ? j.tema : 'standard';
    const bakgrunn =
      j.bakgrunn === 'egen' || BAKGRUNNER.some((b) => b.id === j.bakgrunn)
        ? (j.bakgrunn as string)
        : 'standard';
    const egenFarge = gyldigHex(j.egenFarge) ? j.egenFarge : STANDARD_INNSTILLINGER.egenFarge;
    return { tema, bakgrunn, egenFarge };
  } catch {
    return STANDARD_INNSTILLINGER;
  }
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tilHex(r: number, g: number, b: number): string {
  const d = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

/** Mix two colours (`t` = share of `b`). */
export function bland(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  return tilHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** A horizon gradient built from one colour: darker at the top, the colour at the horizon. */
export function horisontFraFarge(c: string): Horisont {
  return {
    topp: bland(c, '#000000', 0.8),
    hoy: bland(c, '#000000', 0.5),
    linje: c,
    bunn: bland(c, '#000000', 0.55),
    pos: 0.62,
  };
}

/** Perceived brightness 0..1 of a colour. */
export function lysstyrke(c: string): number {
  const [r, g, b] = hex(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** The gradient the user's settings ask for, or null for the workshop's own. */
export function valgtHorisont(i: Brukerinnstillinger): Horisont | null {
  if (i.bakgrunn === 'egen') return horisontFraFarge(i.egenFarge);
  return BAKGRUNNER.find((b) => b.id === i.bakgrunn)?.horisont ?? null;
}

/** A background that is light needs dark ink on the canvas. */
export function bakgrunnErLys(h: Horisont): boolean {
  return (lysstyrke(h.hoy) + lysstyrke(h.linje) + lysstyrke(h.bunn)) / 3 > 0.55;
}

/** The colour of the build plate that goes with a horizon: between the horizon line and the sky. */
export function platefarge(h: Horisont): string {
  return bland(h.hoy, h.linje, 0.5);
}

/** CSS tokens for the workshop root: the horizon the user chose, and a plate colour that goes with it. */
export function bakgrunnVariabler(i: Brukerinnstillinger): Record<string, string> | null {
  const h = valgtHorisont(i);
  if (!h) return null;
  const plate = platefarge(h);
  return {
    '--horisont-topp': h.topp,
    '--horisont-hoy': h.hoy,
    '--horisont-linje': h.linje,
    '--horisont-bunn': h.bunn,
    '--horisont-pos': String(h.pos),
    '--plate-egen': plate,
    '--plate-egen-2': bland(plate, bakgrunnErLys(h) ? '#000000' : '#ffffff', 0.12),
  };
}

// ---------- store ----------

let na: Brukerinnstillinger | null = null;
const lyttere = new Set<() => void>();

function hent(): Brukerinnstillinger {
  if (!na) {
    let raa: string | null = null;
    try {
      raa = typeof localStorage === 'undefined' ? null : localStorage.getItem(NOKKEL);
    } catch {
      /* private mode */
    }
    na = lesInnstillinger(raa);
  }
  return na;
}

export function settInnstillinger(del: Partial<Brukerinnstillinger>): void {
  na = lesInnstillinger(JSON.stringify({ ...hent(), ...del }));
  try {
    localStorage.setItem(NOKKEL, JSON.stringify(na));
  } catch {
    /* the setting then only lasts for this visit */
  }
  for (const l of lyttere) l();
}

/** The user's settings; the component renders again when they change. */
export function brukInnstillinger(): Brukerinnstillinger {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    lyttere.add(l);
    return () => void lyttere.delete(l);
  }, []);
  return hent();
}

/** Tells the canvases to read their colours again. */
export const FARGER_ENDRET = 'verksted-farger';
