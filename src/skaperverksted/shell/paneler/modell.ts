/**
 * Panel layout model (pure, no UI). A layout is a list of groups. A group
 * holds one or more panels as tabs and sits either in a dock column (left or
 * right of the canvas) or floats over the canvas. All changes are pure
 * functions from layout to layout, so they are easy to test, and a stored
 * layout can be repaired against the panels that exist today (`normaliser`).
 */

export type DokkSide = 'venstre' | 'hoyre';

export type Plassering =
  { type: 'dokk'; side: DokkSide } | { type: 'flyt'; x: number; y: number; b: number; h: number };

export interface Gruppe {
  id: string;
  /** Panel ids in tab order. */
  paneler: string[];
  aktiv: string;
  minimert: boolean;
  plass: Plassering;
  /** Share of the dock column's height (flex weight); only used when docked. */
  vekt: number;
}

export interface Oppsett {
  versjon: 1;
  /** Dock order inside a column follows this order; floating groups later in the list sit on top. */
  grupper: Gruppe[];
  dokkB: Record<DokkSide, number>;
  /** Panels the user closed (reopened from the menu). */
  lukket: string[];
}

export const DOKK_MIN = 220;
export const DOKK_MAKS = 560;
export const DOKK_STANDARD = 296;
export const FLYT_MIN_B = 200;
export const FLYT_MIN_H = 120;
export const GRUPPE_HODE = 34;

/** Declarative description of a layout (what a generator ships as its workspaces). */
export interface RomGruppe {
  paneler: string[];
  side?: DokkSide;
  flyt?: { x: number; y: number; b?: number; h?: number };
  minimert?: boolean;
  vekt?: number;
}

export interface Romspek {
  id: string;
  navn: string;
  grupper: RomGruppe[];
  /** The same workspace on a narrow desktop window (less than 1280 px), where two docks leave too little canvas. */
  smal?: RomGruppe[];
  dokkB?: Partial<Record<DokkSide, number>>;
}

export interface PanelStorrelse {
  id: string;
  flytB?: number;
  flytH?: number;
}

const klem = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const endelig = (v: unknown, standard: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : standard;

export function tomtOppsett(): Oppsett {
  return { versjon: 1, grupper: [], dokkB: { venstre: DOKK_STANDARD, hoyre: DOKK_STANDARD }, lukket: [] };
}

function nyGruppeId(o: Oppsett): string {
  const brukt = new Set(o.grupper.map((g) => g.id));
  let n = o.grupper.length + 1;
  while (brukt.has(`g${n}`)) n++;
  return `g${n}`;
}

/** Build a layout from a workspace description. Unknown panels are skipped. */
export function byggOppsett(rom: Romspek, paneler: PanelStorrelse[], smal = false): Oppsett {
  const kjent = new Map(paneler.map((p) => [p.id, p]));
  const brukt = new Set<string>();
  let o = tomtOppsett();
  o = { ...o, dokkB: { ...o.dokkB, ...rom.dokkB } };
  for (const g of smal && rom.smal ? rom.smal : rom.grupper) {
    const ids = g.paneler.filter((id) => kjent.has(id) && !brukt.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => brukt.add(id));
    const f = kjent.get(ids[0]!)!;
    const plass: Plassering = g.flyt
      ? {
          type: 'flyt',
          x: g.flyt.x,
          y: g.flyt.y,
          b: g.flyt.b ?? f.flytB ?? 320,
          h: g.flyt.h ?? f.flytH ?? 360,
        }
      : { type: 'dokk', side: g.side ?? 'hoyre' };
    o = {
      ...o,
      grupper: [
        ...o.grupper,
        {
          id: nyGruppeId(o),
          paneler: ids,
          aktiv: ids[0]!,
          minimert: !!g.minimert,
          plass,
          vekt: g.vekt ?? 1,
        },
      ],
    };
  }
  o.lukket = paneler.map((p) => p.id).filter((id) => !brukt.has(id));
  return o;
}

export function finnGruppe(o: Oppsett, panelId: string): Gruppe | undefined {
  return o.grupper.find((g) => g.paneler.includes(panelId));
}

export function dokkGrupper(o: Oppsett, side: DokkSide): Gruppe[] {
  return o.grupper.filter((g) => g.plass.type === 'dokk' && g.plass.side === side);
}

export function flytGrupper(o: Oppsett): Gruppe[] {
  return o.grupper.filter((g) => g.plass.type === 'flyt');
}

export function erApen(o: Oppsett, panelId: string): boolean {
  return !!finnGruppe(o, panelId);
}

function medGruppe(o: Oppsett, id: string, endre: (g: Gruppe) => Gruppe): Oppsett {
  let rort = false;
  const grupper = o.grupper.map((g) => {
    if (g.id !== id) return g;
    const n = endre(g);
    if (n !== g) rort = true;
    return n;
  });
  return rort ? { ...o, grupper } : o;
}

/** Take a panel out of its group (the group goes away when it becomes empty). */
function fjernPanel(o: Oppsett, panelId: string): Oppsett {
  const grupper: Gruppe[] = [];
  for (const g of o.grupper) {
    if (!g.paneler.includes(panelId)) {
      grupper.push(g);
      continue;
    }
    const rest = g.paneler.filter((p) => p !== panelId);
    if (!rest.length) continue;
    grupper.push({ ...g, paneler: rest, aktiv: g.aktiv === panelId ? rest[0]! : g.aktiv });
  }
  return { ...o, grupper };
}

export function lukkPanel(o: Oppsett, panelId: string): Oppsett {
  if (!erApen(o, panelId)) return o;
  const ut = fjernPanel(o, panelId);
  return { ...ut, lukket: [...ut.lukket.filter((p) => p !== panelId), panelId] };
}

/** Reopen a closed panel at `plass` (a new group). */
export function apnePanel(o: Oppsett, panelId: string, plass: Plassering): Oppsett {
  if (erApen(o, panelId)) return o;
  const g: Gruppe = {
    id: nyGruppeId(o),
    paneler: [panelId],
    aktiv: panelId,
    minimert: false,
    plass,
    vekt: 1,
  };
  return { ...o, lukket: o.lukket.filter((p) => p !== panelId), grupper: [...o.grupper, g] };
}

/** Pull a tab out into a group of its own (same place), returning the new group's id. */
export function losneFane(o: Oppsett, panelId: string): { oppsett: Oppsett; gruppeId: string } | null {
  const g = finnGruppe(o, panelId);
  if (!g) return null;
  if (g.paneler.length === 1) return { oppsett: o, gruppeId: g.id };
  const id = nyGruppeId(o);
  const ut = fjernPanel(o, panelId);
  const ny: Gruppe = { ...g, id, paneler: [panelId], aktiv: panelId, minimert: false };
  const grupper = [...ut.grupper];
  // right after its old group, so a docked tab stays in the same column
  const ved = grupper.findIndex((x) => x.id === g.id);
  grupper.splice(ved + 1, 0, ny);
  return { oppsett: { ...ut, grupper }, gruppeId: id };
}

/** Place a group in a dock column before dock group number `indeks` (default: last). */
export function flyttGruppeTilDokk(o: Oppsett, gruppeId: string, side: DokkSide, indeks = Infinity): Oppsett {
  const g = o.grupper.find((x) => x.id === gruppeId);
  if (!g) return o;
  const uten = o.grupper.filter((x) => x.id !== gruppeId);
  const kolonne = uten.filter((x) => x.plass.type === 'dokk' && x.plass.side === side);
  const ny: Gruppe = { ...g, plass: { type: 'dokk', side } };
  const grupper = [...uten];
  if (indeks >= kolonne.length) {
    const siste = kolonne.at(-1);
    grupper.splice(siste ? grupper.indexOf(siste) + 1 : grupper.length, 0, ny);
  } else {
    grupper.splice(grupper.indexOf(kolonne[Math.max(0, indeks)]!), 0, ny);
  }
  return { ...o, grupper };
}

export function flyttGruppeTilFlyt(
  o: Oppsett,
  gruppeId: string,
  r: { x: number; y: number; b?: number; h?: number },
): Oppsett {
  const g = o.grupper.find((x) => x.id === gruppeId);
  if (!g) return o;
  const forrige = g.plass.type === 'flyt' ? g.plass : null;
  const plass: Plassering = {
    type: 'flyt',
    x: r.x,
    y: r.y,
    b: Math.max(FLYT_MIN_B, r.b ?? forrige?.b ?? 320),
    h: Math.max(FLYT_MIN_H, r.h ?? forrige?.h ?? 360),
  };
  // floating groups end up on top
  const uten = o.grupper.filter((x) => x.id !== gruppeId);
  return { ...o, grupper: [...uten, { ...g, plass }] };
}

/** Put all panels of a group into another group as tabs. */
export function slaaSammen(o: Oppsett, gruppeId: string, malId: string): Oppsett {
  if (gruppeId === malId) return o;
  const g = o.grupper.find((x) => x.id === gruppeId);
  const m = o.grupper.find((x) => x.id === malId);
  if (!g || !m) return o;
  const grupper = o.grupper
    .filter((x) => x.id !== gruppeId)
    .map((x) =>
      x.id === malId ? { ...x, paneler: [...x.paneler, ...g.paneler], aktiv: g.aktiv, minimert: false } : x,
    );
  return { ...o, grupper };
}

/** Raise a floating group above the others. */
export function loft(o: Oppsett, gruppeId: string): Oppsett {
  const g = o.grupper.find((x) => x.id === gruppeId);
  if (!g || g.plass.type !== 'flyt') return o;
  if (o.grupper.at(-1)?.id === gruppeId) return o;
  return { ...o, grupper: [...o.grupper.filter((x) => x.id !== gruppeId), g] };
}

export function settAktiv(o: Oppsett, gruppeId: string, panelId: string): Oppsett {
  return medGruppe(o, gruppeId, (g) =>
    g.paneler.includes(panelId) && (g.aktiv !== panelId || g.minimert)
      ? { ...g, aktiv: panelId, minimert: false }
      : g,
  );
}

export function settMinimert(o: Oppsett, gruppeId: string, minimert: boolean): Oppsett {
  return medGruppe(o, gruppeId, (g) => (g.minimert === minimert ? g : { ...g, minimert }));
}

export function settFlyt(
  o: Oppsett,
  gruppeId: string,
  r: Partial<{ x: number; y: number; b: number; h: number }>,
): Oppsett {
  return medGruppe(o, gruppeId, (g) => {
    if (g.plass.type !== 'flyt') return g;
    const p = g.plass;
    const neste = {
      type: 'flyt' as const,
      x: r.x ?? p.x,
      y: r.y ?? p.y,
      b: Math.max(FLYT_MIN_B, r.b ?? p.b),
      h: Math.max(FLYT_MIN_H, r.h ?? p.h),
    };
    return neste.x === p.x && neste.y === p.y && neste.b === p.b && neste.h === p.h
      ? g
      : { ...g, plass: neste };
  });
}

export function settDokkB(o: Oppsett, side: DokkSide, b: number): Oppsett {
  const v = Math.round(klem(b, DOKK_MIN, DOKK_MAKS));
  return o.dokkB[side] === v ? o : { ...o, dokkB: { ...o.dokkB, [side]: v } };
}

export function settVekter(o: Oppsett, vekter: Record<string, number>): Oppsett {
  let rort = false;
  const grupper = o.grupper.map((g) => {
    const v = vekter[g.id];
    if (v === undefined || !(v > 0) || v === g.vekt) return g;
    rort = true;
    return { ...g, vekt: v };
  });
  return rort ? { ...o, grupper } : o;
}

/** Keep floating groups inside the work area (the window can shrink after a layout was stored). */
export function klemFlyt(p: { x: number; y: number; b: number; h: number }, areaB: number, areaH: number) {
  const b = Math.min(p.b, Math.max(FLYT_MIN_B, areaB - 8));
  const h = Math.min(p.h, Math.max(FLYT_MIN_H, areaH - 8));
  return {
    x: klem(p.x, 0, Math.max(0, areaB - Math.min(b, 120))),
    y: klem(p.y, 0, Math.max(0, areaH - GRUPPE_HODE)),
    b,
    h,
  };
}

/**
 * Repair a stored layout against the panels that exist now: unknown panels
 * go, damaged values get defaults, and panels that are neither placed nor
 * closed (new since the layout was stored) are put where the fallback has
 * them, or closed. Returns the fallback when nothing usable is left.
 */
export function normaliser(rå: unknown, kjente: string[], reserve: Oppsett): Oppsett {
  if (!rå || typeof rå !== 'object') return reserve;
  const r = rå as Partial<Oppsett>;
  if (r.versjon !== 1 || !Array.isArray(r.grupper)) return reserve;
  const kjentSett = new Set(kjente);
  const sett = new Set<string>();
  const grupper: Gruppe[] = [];
  const ider = new Set<string>();
  for (const g of r.grupper as Partial<Gruppe>[]) {
    if (!g || typeof g !== 'object' || !Array.isArray(g.paneler)) continue;
    const paneler = g.paneler.filter(
      (p): p is string => typeof p === 'string' && kjentSett.has(p) && !sett.has(p),
    );
    if (!paneler.length) continue;
    paneler.forEach((p) => sett.add(p));
    let id = typeof g.id === 'string' && g.id && !ider.has(g.id) ? g.id : '';
    if (!id) {
      let n = grupper.length + 1;
      while (ider.has(`g${n}`)) n++;
      id = `g${n}`;
    }
    ider.add(id);
    const p = g.plass as Partial<Plassering> | undefined;
    let plass: Plassering;
    if (p && p.type === 'flyt') {
      plass = {
        type: 'flyt',
        x: endelig(p.x, 40),
        y: endelig(p.y, 40),
        b: Math.max(FLYT_MIN_B, endelig(p.b, 320)),
        h: Math.max(FLYT_MIN_H, endelig(p.h, 360)),
      };
    } else {
      plass = { type: 'dokk', side: p && p.type === 'dokk' && p.side === 'venstre' ? 'venstre' : 'hoyre' };
    }
    grupper.push({
      id,
      paneler,
      aktiv: typeof g.aktiv === 'string' && paneler.includes(g.aktiv) ? g.aktiv : paneler[0]!,
      minimert: g.minimert === true,
      plass,
      vekt: typeof g.vekt === 'number' && g.vekt > 0 && Number.isFinite(g.vekt) ? g.vekt : 1,
    });
  }
  const lukket = (Array.isArray(r.lukket) ? r.lukket : []).filter(
    (p): p is string => typeof p === 'string' && kjentSett.has(p) && !sett.has(p),
  );
  const d = (r.dokkB ?? {}) as Partial<Record<DokkSide, number>>;
  let o: Oppsett = {
    versjon: 1,
    grupper,
    dokkB: {
      venstre: Math.round(klem(endelig(d.venstre, DOKK_STANDARD), DOKK_MIN, DOKK_MAKS)),
      hoyre: Math.round(klem(endelig(d.hoyre, DOKK_STANDARD), DOKK_MIN, DOKK_MAKS)),
    },
    lukket: [...new Set(lukket)],
  };
  // new panels: where the fallback has them (closed if the fallback has them closed)
  for (const id of kjente) {
    if (sett.has(id) || o.lukket.includes(id)) continue;
    const fg = finnGruppe(reserve, id);
    o = fg ? apnePanel(o, id, fg.plass) : { ...o, lukket: [...o.lukket, id] };
  }
  return o;
}
