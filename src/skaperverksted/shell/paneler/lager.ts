/**
 * The user's panel arrangement for one generator: the live layout, the
 * named workspaces and the user's own. Pure reducer plus browser storage
 * (storage is best effort: a blocked or damaged store falls back to the
 * generator's first workspace).
 */
import { byggOppsett, normaliser, type Oppsett, type PanelStorrelse, type Romspek } from './modell';

export const EGENDEFINERT = 'egendefinert';
const EGET = 'eget:';

export interface EgetRom {
  navn: string;
  oppsett: Oppsett;
}

export interface PanelLager {
  versjon: 1;
  /** Active workspace: a Romspek id, «egendefinert» or «eget:<navn>». */
  rom: string;
  oppsett: Oppsett;
  egendefinert: Oppsett | null;
  egne: EgetRom[];
}

export interface RomKontekst {
  paneler: PanelStorrelse[];
  rom: Romspek[];
  /** Narrow desktop window: workspaces may ship a layout with a single dock. */
  smal?: boolean;
}

export type PanelHandling =
  | { t: 'endre'; f: (o: Oppsett) => Oppsett; rolig?: boolean }
  | { t: 'rom'; id: string }
  | { t: 'lagre'; navn: string }
  | { t: 'slett'; navn: string }
  | { t: 'tilbakestill' };

export function standardLager(k: RomKontekst): PanelLager {
  const forste = k.rom[0];
  const oppsett = forste
    ? byggOppsett(forste, k.paneler, k.smal)
    : byggOppsett({ id: '', navn: '', grupper: [] }, k.paneler);
  return { versjon: 1, rom: forste?.id ?? EGENDEFINERT, oppsett, egendefinert: null, egne: [] };
}

export function romOppsett(l: PanelLager, id: string, k: RomKontekst): Oppsett | null {
  const spek = k.rom.find((r) => r.id === id);
  if (spek) return byggOppsett(spek, k.paneler, k.smal);
  if (id === EGENDEFINERT) return l.egendefinert;
  if (id.startsWith(EGET)) return l.egne.find((e) => e.navn === id.slice(EGET.length))?.oppsett ?? null;
  return null;
}

export function egetId(navn: string): string {
  return EGET + navn;
}

export function panelReduser(l: PanelLager, h: PanelHandling, k: RomKontekst): PanelLager {
  switch (h.t) {
    case 'endre': {
      const oppsett = h.f(l.oppsett);
      if (oppsett === l.oppsett) return l;
      if (h.rolig) return { ...l, oppsett };
      return { ...l, oppsett, rom: EGENDEFINERT, egendefinert: oppsett };
    }
    case 'rom': {
      const oppsett = romOppsett(l, h.id, k);
      return oppsett ? { ...l, rom: h.id, oppsett } : l;
    }
    case 'lagre': {
      const navn = h.navn.trim().slice(0, 40);
      if (!navn || k.rom.some((r) => r.navn.toLowerCase() === navn.toLowerCase())) return l;
      const egne = [...l.egne.filter((e) => e.navn !== navn), { navn, oppsett: l.oppsett }];
      return { ...l, egne, rom: egetId(navn) };
    }
    case 'slett': {
      const egne = l.egne.filter((e) => e.navn !== h.navn);
      return egne.length === l.egne.length
        ? l
        : { ...l, egne, rom: l.rom === egetId(h.navn) ? EGENDEFINERT : l.rom, egendefinert: l.oppsett };
    }
    case 'tilbakestill': {
      const spek = k.rom.find((r) => r.id === l.rom) ?? k.rom[0];
      return spek ? { ...l, rom: spek.id, oppsett: byggOppsett(spek, k.paneler, k.smal) } : l;
    }
  }
}

const NOKKEL = (generator: string) => `dp-verksted:paneler:${generator}`;

export function lesLager(generator: string, k: RomKontekst, lagring: Storage | null = trygg()): PanelLager {
  const std = standardLager(k);
  if (!lagring) return std;
  try {
    const rå = JSON.parse(lagring.getItem(NOKKEL(generator)) ?? 'null') as Partial<PanelLager> | null;
    if (!rå || rå.versjon !== 1) return std;
    const ider = k.paneler.map((p) => p.id);
    const reserve = std.oppsett;
    const oppsett = normaliser(rå.oppsett, ider, reserve);
    const rom =
      typeof rå.rom === 'string' &&
      (k.rom.some((r) => r.id === rå.rom) || rå.rom === EGENDEFINERT || rå.rom.startsWith(EGET))
        ? rå.rom
        : std.rom;
    const egne = (Array.isArray(rå.egne) ? rå.egne : [])
      .filter((e): e is EgetRom => !!e && typeof e.navn === 'string' && e.navn.length > 0)
      .slice(0, 12)
      .map((e) => ({ navn: e.navn.slice(0, 40), oppsett: normaliser(e.oppsett, ider, reserve) }));
    const egendefinert = rå.egendefinert ? normaliser(rå.egendefinert, ider, reserve) : null;
    const romGyldig = !rom.startsWith(EGET) || egne.some((e) => egetId(e.navn) === rom);
    return { versjon: 1, rom: romGyldig ? rom : EGENDEFINERT, oppsett, egendefinert, egne };
  } catch {
    return std;
  }
}

export function skrivLager(generator: string, l: PanelLager, lagring: Storage | null = trygg()): void {
  try {
    lagring?.setItem(NOKKEL(generator), JSON.stringify(l));
  } catch {
    /* private window or full store: the layout then lasts for this visit only */
  }
}

function trygg(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
