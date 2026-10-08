/**
 * Signgen document operations. All pure: Dokument in, new Dokument out
 * (the workbench wraps them in undo steps).
 */
import {
  finnLag,
  nyId,
  objekterILag,
  tomtDokument,
  type Dokument,
  type FormKilde,
  type Hullform,
  type Lag,
  type LagId,
  type Objekt,
  type ObjektId,
  type ObjektKilde,
  type Omriss,
  type TekstKilde,
} from '../../core/dokument';
import { identitet, type Transform2D } from '../../core/geometri2d';
import { rettProfil } from '../../core/profil';
import { standardPrinter } from '../../core/materialer';
import { standardFont } from '../../geometri/tekst';
import { narmesteFarge, rensFarger, STANDARD_PROFIL } from './fargeprofiler';
import { lastFontbibliotek, type LagretFont, registrerProsjektfonter } from './fontbibliotek';
import { filamenterForProsjekt, lastEgneFilamenter, registrerProsjektfilamenter } from './filamenter';
import type { Materiale } from '../../core/materialer';
import type { Malopphav } from './maler';

export const SIGNGEN_ID = 'signgen';

export interface SigngenParametre {
  /** Z positions follow the layer order and heights. */
  autoZ: boolean;
  /** Print layer height used to realise side profiles (mm). */
  lagHoyde: number;
  /** The sign's colour profile: the material ids it may use (Sivert, 2026-10-05). */
  farger?: string[];
  /** False until the start window has been answered for this project. */
  startvalgt?: boolean;
  /** The user's own filaments this project uses, so it opens with the same colours anywhere. */
  filamenter?: Materiale[];
  /** The template this project was made from, so credit and licence follow the copy. */
  malopphav?: Malopphav;
  /** Added fonts (Google Fonts) the text uses, as files, so the project builds without a network. */
  fonter?: LagretFont[];
}

export function parametre(dok: Dokument): SigngenParametre {
  const p = dok.parametre as Partial<SigngenParametre>;
  return { ...p, autoZ: p.autoZ ?? true, lagHoyde: p.lagHoyde ?? standardPrinter.lagHoyde };
}

function settParametre(dok: Dokument, endring: Partial<SigngenParametre>): Dokument {
  return { ...dok, parametre: { ...dok.parametre, ...endring } };
}

/** Every colour the sign uses now, bottom to top, each once. */
function brukteFarger(dok: Dokument): string[] {
  const objektfarger = Object.values(dok.objekter).flatMap((o) => (o.materialId ? [o.materialId] : []));
  return [
    ...new Set([
      ...dok.lag.flatMap((l) => [l.materialId, ...(l.omriss ?? []).map((o) => o.materialId)]),
      ...objektfarger,
    ]),
  ];
}

/**
 * The sign's colour profile. Projects from before profiles get the
 * colours they already use, so nothing changes for them.
 */
export function palett(dok: Dokument): string[] {
  const p = parametre(dok).farger;
  const egen = p ? rensFarger(p) : [];
  return egen.length ? egen : rensFarger(brukteFarger(dok));
}

/**
 * Keep the project's copy of the user's own filaments in step with the
 * colours it uses. Returns the same document when nothing changes.
 */
export function synkFilamenter(dok: Dokument): Dokument {
  const bruk = filamenterForProsjekt([...palett(dok), ...brukteFarger(dok)]);
  const naa = parametre(dok).filamenter ?? [];
  if (JSON.stringify(bruk) === JSON.stringify(naa)) return dok;
  const { filamenter: _bort, ...rest } = dok.parametre as Record<string, unknown>;
  void _bort;
  return { ...dok, parametre: bruk.length ? { ...rest, filamenter: bruk } : rest };
}

/** Opening a project: its own filaments become known, then the text layers are brought up to date. */
export function lesInnSigngen(dok: Dokument): Dokument {
  lastEgneFilamenter();
  registrerProsjektfilamenter(dok);
  lastFontbibliotek();
  registrerProsjektfonter(dok);
  return ordneTekstlag(dok);
}

/**
 * Use a new colour profile. Colours the sign uses that are not in it are
 * swapped for the closest colour in it.
 */
export function settPalett(dok: Dokument, farger: string[]): Dokument {
  const ny = rensFarger(farger);
  if (!ny.length) return dok;
  const bytt = (id: string) => narmesteFarge(id, ny);
  const lag = dok.lag.map((l) => {
    const omriss = l.omriss?.map((o) =>
      ny.includes(o.materialId) ? o : { ...o, materialId: bytt(o.materialId) },
    );
    const endret = !ny.includes(l.materialId) || omriss?.some((o, i) => o !== l.omriss![i]);
    return endret ? { ...l, materialId: bytt(l.materialId), ...(omriss ? { omriss } : {}) } : l;
  });
  let objekter = dok.objekter;
  for (const o of Object.values(dok.objekter)) {
    if (o.materialId && !ny.includes(o.materialId)) {
      if (objekter === dok.objekter) objekter = { ...dok.objekter };
      objekter[o.id] = { ...o, materialId: bytt(o.materialId) };
    }
  }
  return synkFilamenter(settParametre({ ...dok, lag, objekter }, { farger: ny, startvalgt: true }));
}

/** Add a catalogue colour to the sign's profile. */
export function leggTilFarge(dok: Dokument, materialId: string): Dokument {
  const naa = palett(dok);
  return naa.includes(materialId)
    ? dok
    : synkFilamenter(settParametre(dok, { farger: rensFarger([...naa, materialId]) }));
}

/** The first colour in the profile that the sign does not use yet (else the first one). */
export function nesteFarge(dok: Dokument): string {
  const brukte = new Set(fargeplasser(dok).map((p) => p.materialId));
  const p = palett(dok);
  return p.find((id) => !brukte.has(id)) ?? p[0] ?? STANDARD_PROFIL.farger[0]!;
}

/** The start window has been answered. */
export function startErValgt(dok: Dokument): boolean {
  return parametre(dok).startvalgt !== false;
}

export function nyttLag(navn: string, materialId: string, hoyde: number): Lag {
  return {
    id: nyId('l'),
    navn,
    zBunn: 0,
    hoyde,
    materialId,
    profil: rettProfil(),
    kontur: { avstand: 0, hjorne: 'rund', kunRing: false, ringBredde: 2 },
    pavirkninger: [],
    synlig: true,
    last: false,
  };
}

/** A text layer: text only, with its own outlines. */
export function nyttTekstlag(navn: string, materialId: string, hoyde = 1.5): Lag {
  return { ...nyttLag(navn, materialId, hoyde), tekstlag: true, omriss: [], tekstvisning: 'normal' };
}

export function nyttOmriss(navn: string, materialId: string, endring: Partial<Omriss> = {}): Omriss {
  return {
    id: nyId('r'),
    navn,
    type: 'fyll',
    avstand: 0,
    bredde: 3,
    hoyde: 1,
    materialId,
    hjorne: 'rund',
    synlig: true,
    last: false,
    ...endring,
  };
}

/** Height a layer takes in the stack: its own, or its tallest visible outline. */
export function lagHoydeIStabel(l: Lag, dok?: Dokument): number {
  // a layer that only holds hanging holes prints nothing, so it takes no room
  if (dok && !l.pavirkninger.length && bareHull(dok, l.id)) return 0;
  return (l.omriss ?? []).reduce((h, o) => (o.synlig ? Math.max(h, o.hoyde) : h), l.hoyde);
}

/** The layer holds hanging holes and nothing else. */
export function bareHull(dok: Dokument, lagId: LagId): boolean {
  const obj = objekterILag(dok, lagId);
  return obj.length > 0 && obj.every((o) => o.kilde.type === 'form' && o.kilde.form === 'hull');
}

export function nyTekst(tekst = 'Tekst', storrelse = 16): TekstKilde {
  return {
    type: 'tekst',
    tekst,
    fontId: standardFont,
    storrelse,
    sperring: 0,
    linjeavstand: 1.15,
    justering: 'midt',
  };
}

/** The shapes a hanging hole can have, with the icons of the shape tools. */
export const HULLFORMER: {
  id: Hullform;
  navn: string;
  ikon: 'ellipse' | 'rectangle' | 'triangle' | 'polygon';
}[] = [
  { id: 'sirkel', navn: 'Sirkel', ikon: 'ellipse' },
  { id: 'firkant', navn: 'Firkant', ikon: 'rectangle' },
  { id: 'trekant', navn: 'Trekant', ikon: 'triangle' },
  { id: 'sekskant', navn: 'Sekskant', ikon: 'polygon' },
];

export function nyForm(form: FormKilde['form'], bredde: number, hoyde: number, hjorneradius = 0): FormKilde {
  return { type: 'form', form, bredde, hoyde, hjorneradius, sider: 6 };
}

export function nyttObjekt(
  lagId: LagId,
  kilde: ObjektKilde,
  transform: Partial<Transform2D> = {},
  navn?: string,
): Objekt {
  return {
    id: nyId('o'),
    navn: navn ?? standardNavn(kilde),
    lagId,
    kilde,
    transform: { ...identitet, ...transform },
    synlig: true,
    last: false,
    operasjon: kilde.type === 'form' && kilde.form === 'hull' ? 'trekk-fra' : 'legg-til',
  };
}

export function standardNavn(k: ObjektKilde): string {
  if (k.type === 'tekst') return `Tekst «${k.tekst.split('\n')[0]!.slice(0, 18)}»`;
  if (k.type === 'svg') return k.filnavn.replace(/\.svg$/i, '');
  if (k.form === 'polygon' && Math.round(k.sider) === 3) return 'Trekant';
  return { rektangel: 'Rektangel', ellipse: 'Ellipse', polygon: 'Polygon', hull: 'Opphengshull' }[k.form];
}

/**
 * The starting sign: a text layer with one filled outline that is the
 * base (Sivert, 2026-10-05: the separate base plate is no longer needed).
 * Colours come from the profile; the start window lets the user pick it.
 */
export function nyttSigngenDokument(farger: string[] = STANDARD_PROFIL.farger): Dokument {
  const dok = tomtDokument(SIGNGEN_ID, 'Mitt skilt', {
    bredde: standardPrinter.plateBredde,
    dybde: standardPrinter.plateDybde,
    hoyde: standardPrinter.byggHoyde,
    printerProfilId: standardPrinter.id,
  });
  const p = rensFarger(farger);
  const tekst = nyttTekstlag('Tekst', p[0] ?? 'pla-kritthvit', 3);
  tekst.omriss = [nyttOmriss('Underlag', p[1] ?? p[0] ?? 'pla-grafitt', { bredde: 4, hoyde: 2 })];
  const t = nyttObjekt(tekst.id, nyTekst('Designporten', 14));
  const d: Dokument = {
    ...dok,
    lag: [tekst],
    objekter: { [t.id]: t },
    rekkefolge: { [tekst.id]: [t.id] },
    parametre: {
      autoZ: true,
      lagHoyde: standardPrinter.lagHoyde,
      farger: p,
      startvalgt: false,
    } satisfies SigngenParametre,
  };
  return stable(synkFilamenter(d));
}

/** Recompute Z positions from the layer order when autoZ is on. */
export function stable(dok: Dokument): Dokument {
  if (!parametre(dok).autoZ) return dok;
  // z is the top of everything stacked so far; a level is a run of layers that start together
  let z = 0;
  let nivaaBunn = 0;
  let endret = false;
  const lag = dok.lag.map((l, i) => {
    const hoyde = lagHoydeIStabel(l, dok);
    let zBunn: number;
    if (l.sammeNivaa && i > 0) {
      zBunn = nivaaBunn;
      z = Math.max(z, zBunn + hoyde);
    } else {
      zBunn = z;
      nivaaBunn = z;
      z += hoyde;
    }
    zBunn = Math.round(zBunn * 1000) / 1000;
    if (Math.abs(l.zBunn - zBunn) < 1e-9) return l;
    endret = true;
    return { ...l, zBunn };
  });
  return endret ? { ...dok, lag } : dok;
}

export function oppdaterLag(dok: Dokument, id: LagId, endring: Partial<Lag>): Dokument {
  const lag = dok.lag.map((l) => (l.id === id ? { ...l, ...endring } : l));
  return stable({ ...dok, lag });
}

/** Add a layer at the bottom of the stack (under everything). */
export function leggTilLagNederst(dok: Dokument, lag: Lag): Dokument {
  return stable({ ...dok, lag: [lag, ...dok.lag], rekkefolge: { ...dok.rekkefolge, [lag.id]: [] } });
}

export function leggTilLag(dok: Dokument, lag: Lag, overId?: LagId): Dokument {
  const i = overId ? dok.lag.findIndex((l) => l.id === overId) : dok.lag.length - 1;
  const ny = [...dok.lag];
  ny.splice(i + 1, 0, lag);
  return stable({ ...dok, lag: ny, rekkefolge: { ...dok.rekkefolge, [lag.id]: [] } });
}

export function slettLag(dok: Dokument, id: LagId): Dokument {
  if (dok.lag.length <= 1) return dok;
  const objekter = { ...dok.objekter };
  for (const oid of dok.rekkefolge[id] ?? []) delete objekter[oid];
  const rekkefolge = { ...dok.rekkefolge };
  delete rekkefolge[id];
  const lag = dok.lag
    .filter((l) => l.id !== id)
    .map((l) =>
      l.pavirkninger.some((p) => p.kildeLagId === id)
        ? { ...l, pavirkninger: l.pavirkninger.filter((p) => p.kildeLagId !== id) }
        : l,
    );
  return stable({ ...dok, lag, objekter, rekkefolge });
}

/** Move a layer up (+1, towards the top) or down (−1) in the physical stack. */
export function flyttLag(dok: Dokument, id: LagId, retning: 1 | -1): Dokument {
  const i = dok.lag.findIndex((l) => l.id === id);
  const j = i + retning;
  if (i < 0 || j < 0 || j >= dok.lag.length) return dok;
  const lag = [...dok.lag];
  [lag[i], lag[j]] = [lag[j]!, lag[i]!];
  return stable({ ...dok, lag });
}

/** Move a layer next to another in the stack: `over` puts it just above `mal`, `under` just below. */
export function flyttLagTil(dok: Dokument, id: LagId, mal: LagId, plass: 'over' | 'under'): Dokument {
  if (id === mal) return dok;
  const lag = dok.lag.find((l) => l.id === id);
  if (!lag || !dok.lag.some((l) => l.id === mal)) return dok;
  const resten = dok.lag.filter((l) => l.id !== id);
  const i = resten.findIndex((l) => l.id === mal);
  const ny = [
    ...resten.slice(0, plass === 'over' ? i + 1 : i),
    lag,
    ...resten.slice(plass === 'over' ? i + 1 : i),
  ];
  if (ny.every((l, k) => l === dok.lag[k])) return dok;
  return stable({ ...dok, lag: ny });
}

export function dupliserLag(dok: Dokument, id: LagId): { dok: Dokument; nyId: LagId } {
  const l = finnLag(dok, id);
  if (!l) return { dok, nyId: id };
  const kopi: Lag = { ...structuredClone(l), id: nyId('l'), navn: `${l.navn} (kopi)` };
  if (kopi.omriss) kopi.omriss = kopi.omriss.map((o) => ({ ...o, id: nyId('r') }));
  let d = leggTilLag(dok, kopi, id);
  for (const o of objekterILag(dok, id)) {
    d = leggTilObjekt(d, { ...structuredClone(o), id: nyId('o'), lagId: kopi.id });
  }
  return { dok: d, nyId: kopi.id };
}

export function leggTilObjekt(dok: Dokument, o: Objekt): Dokument {
  return {
    ...dok,
    objekter: { ...dok.objekter, [o.id]: o },
    rekkefolge: { ...dok.rekkefolge, [o.lagId]: [...(dok.rekkefolge[o.lagId] ?? []), o.id] },
  };
}

export function oppdaterObjekter(dok: Dokument, ider: ObjektId[], fn: (o: Objekt) => Objekt): Dokument {
  let objekter: Dokument['objekter'] | null = null;
  for (const id of ider) {
    const o = dok.objekter[id];
    if (!o) continue;
    const n = fn(o);
    if (n === o) continue;
    objekter ??= { ...dok.objekter };
    objekter[id] = n;
  }
  return objekter ? { ...dok, objekter } : dok;
}

export function oppdaterKilde(dok: Dokument, id: ObjektId, endring: Partial<ObjektKilde>): Dokument {
  return oppdaterObjekter(dok, [id], (o) => {
    const kilde = { ...o.kilde, ...endring } as ObjektKilde;
    // editing the outline's points of a Paint stroke makes it an ordinary vector
    if (kilde.type === 'svg' && 'stier' in endring && !('strek' in endring)) delete kilde.strek;
    return { ...o, kilde };
  });
}

export function slettObjekter(dok: Dokument, ider: ObjektId[]): Dokument {
  const bort = new Set(ider.filter((id) => dok.objekter[id] && !dok.objekter[id]!.last));
  if (!bort.size) return dok;
  const objekter = { ...dok.objekter };
  for (const id of bort) delete objekter[id];
  const rekkefolge: Dokument['rekkefolge'] = {};
  for (const [lag, liste] of Object.entries(dok.rekkefolge))
    rekkefolge[lag] = liste.filter((id) => !bort.has(id));
  return { ...dok, objekter, rekkefolge };
}

/** Duplicate objects with an offset; returns the new ids. */
export function dupliserObjekter(
  dok: Dokument,
  ider: ObjektId[],
  forskyv = 5,
): { dok: Dokument; nye: ObjektId[] } {
  let d = dok;
  const nye: ObjektId[] = [];
  for (const id of ider) {
    const o = dok.objekter[id];
    if (!o) continue;
    const kopi: Objekt = {
      ...structuredClone(o),
      id: nyId('o'),
      last: false,
      transform: { ...o.transform, x: o.transform.x + forskyv, y: o.transform.y - forskyv },
    };
    d = leggTilObjekt(d, kopi);
    nye.push(kopi.id);
  }
  return { dok: d, nye };
}

/**
 * Text lives only in text layers; a vector can live in any layer, and in a
 * text layer it is grouped with the text and shares its outlines (Sivert,
 * 2026-10-05); plain shapes and holes stay in plain layers.
 */
export function kanLiggeI(o: Objekt, lag: Lag): boolean {
  if (o.kilde.type === 'tekst') return !!lag.tekstlag;
  if (o.kilde.type === 'svg') return true;
  return !lag.tekstlag;
}

export function flyttTilLag(dok: Dokument, ider: ObjektId[], lagId: LagId): Dokument {
  const mal = finnLag(dok, lagId);
  if (!mal) return dok;
  const flytt = new Set(
    ider.filter((id) => {
      const o = dok.objekter[id];
      return !!o && o.lagId !== lagId && kanLiggeI(o, mal);
    }),
  );
  if (!flytt.size) return dok;
  const rekkefolge: Dokument['rekkefolge'] = {};
  for (const [lag, liste] of Object.entries(dok.rekkefolge))
    rekkefolge[lag] = liste.filter((id) => !flytt.has(id));
  rekkefolge[lagId] = [...(rekkefolge[lagId] ?? []), ...flytt];
  const objekter = { ...dok.objekter };
  for (const id of flytt) objekter[id] = { ...objekter[id]!, lagId };
  return { ...dok, objekter, rekkefolge };
}

/** Change stacking order inside a layer (front = drawn last). */
export function ordne(dok: Dokument, id: ObjektId, til: 'fremst' | 'bakerst' | 'frem' | 'bak'): Dokument {
  const o = dok.objekter[id];
  if (!o) return dok;
  const liste = [...(dok.rekkefolge[o.lagId] ?? [])];
  const i = liste.indexOf(id);
  liste.splice(i, 1);
  const j =
    til === 'fremst'
      ? liste.length
      : til === 'bakerst'
        ? 0
        : til === 'frem'
          ? Math.min(liste.length, i + 1)
          : Math.max(0, i - 1);
  liste.splice(j, 0, id);
  return { ...dok, rekkefolge: { ...dok.rekkefolge, [o.lagId]: liste } };
}

/** Texts and vectors marked as batch fields (variables). */
export function feltObjekter(dok: Dokument): Objekt[] {
  return Object.values(dok.objekter).filter((o) => feltNavn(o));
}

/** The batch field an object is bound to, if any. */
export function feltNavn(o: Objekt): string | undefined {
  return o.kilde.type === 'tekst' || o.kilde.type === 'svg' ? o.kilde.felt || undefined : undefined;
}

// ---------- text layers and outlines (Sivert, 2026-10-05) ----------

export function erTekstlag(dok: Dokument, lagId: LagId): boolean {
  return !!finnLag(dok, lagId)?.tekstlag;
}

/** Text objects outside text layers (projects from before text layers). */
export function tekstUtenforTekstlag(dok: Dokument): Objekt[] {
  return Object.values(dok.objekter).filter((o) => o.kilde.type === 'tekst' && !erTekstlag(dok, o.lagId));
}

/** Next free «Tekst N» name. */
export function ledigTekstlagnavn(dok: Dokument): string {
  const navn = new Set(dok.lag.map((l) => l.navn));
  if (!navn.has('Tekst')) return 'Tekst';
  let n = 2;
  while (navn.has(`Tekst ${n}`)) n++;
  return `Tekst ${n}`;
}

/**
 * Remove layers left empty by moving their content away (never the last
 * layer, and not a layer that shapes itself from other layers).
 */
function fjernTommeLag(dok: Dokument, kandidater: Set<LagId>): Dokument {
  let d = dok;
  for (const id of kandidater) {
    const l = finnLag(d, id);
    if (l && !l.pavirkninger.length && !d.rekkefolge[id]?.length && d.lag.length > 1) d = slettLag(d, id);
  }
  return d;
}

/**
 * Group texts into one text layer, so they share its outlines. The texts
 * go into the layer of the first text; text layers left empty go away.
 */
export function grupperTekst(dok: Dokument, ider: ObjektId[]): { dok: Dokument; lagId: LagId | null } {
  const tekster = ider
    .map((id) => dok.objekter[id])
    .filter((o): o is Objekt => !!o && o.kilde.type === 'tekst');
  const mal = tekster.find((o) => erTekstlag(dok, o.lagId));
  if (!mal || tekster.length < 2) return { dok, lagId: null };
  const fra = new Set(tekster.map((o) => o.lagId).filter((id) => id !== mal.lagId));
  let d = flyttTilLag(
    dok,
    tekster.map((o) => o.id),
    mal.lagId,
  );
  d = fjernTommeLag(d, fra);
  return { dok: stable(d), lagId: mal.lagId };
}

/**
 * Move objects into a layer (dragging them onto it). They take on the
 * layer's outlines, colour and height. What the layer cannot hold, or
 * what is locked, stays where it is; a layer left empty goes away.
 */
export function flyttObjekterInnI(
  dok: Dokument,
  ider: ObjektId[],
  tilId: LagId,
): { dok: Dokument; flyttet: ObjektId[] } {
  const mal = finnLag(dok, tilId);
  if (!mal || mal.last) return { dok, flyttet: [] };
  const kandidater = ider.filter((id) => {
    const o = dok.objekter[id];
    return !!o && !o.last && o.lagId !== tilId;
  });
  const fra = new Set(kandidater.map((id) => dok.objekter[id]!.lagId));
  let d = flyttTilLag(dok, kandidater, tilId);
  const flyttet = kandidater.filter((id) => d.objekter[id]?.lagId === tilId);
  if (flyttet.length) d = fjernTommeLag(d, fra);
  return { dok: flyttet.length ? stable(d) : dok, flyttet };
}

/**
 * Move everything in one layer into another (dragging a layer into a
 * group). What moves takes on the target's outlines, colour and height.
 */
export function flyttLagInnI(
  dok: Dokument,
  fraId: LagId,
  tilId: LagId,
): { dok: Dokument; flyttet: ObjektId[] } {
  if (fraId === tilId) return { dok, flyttet: [] };
  return flyttObjekterInnI(dok, dok.rekkefolge[fraId] ?? [], tilId);
}

/**
 * Take an object out of its group into a layer of its own, right above.
 * A text gets a text layer with a copy of the group's height, look and
 * outlines; a vector gets a plain layer in the same colour and height.
 */
export function losUtObjekt(dok: Dokument, id: ObjektId): { dok: Dokument; lagId: LagId | null } {
  const o = dok.objekter[id];
  const lag = o ? finnLag(dok, o.lagId) : undefined;
  if (!o || !lag?.tekstlag || (dok.rekkefolge[lag.id]?.length ?? 0) < 2) return { dok, lagId: null };
  if (o.kilde.type === 'tekst') {
    const ny: Lag = {
      ...structuredClone(lag),
      id: nyId('l'),
      navn: ledigTekstlagnavn(dok),
      omriss: (lag.omriss ?? []).map((r) => ({ ...r, id: nyId('r') })),
    };
    let d = leggTilLag(dok, ny, lag.id);
    d = flyttTilLag(d, [id], ny.id);
    return { dok: d, lagId: ny.id };
  }
  if (o.kilde.type !== 'svg') return { dok, lagId: null };
  const ny: Lag = { ...nyttLag(ledigNavn(dok, 'Pynt'), lag.materialId, lag.hoyde) };
  let d = leggTilLag(dok, ny, lag.id);
  d = flyttTilLag(d, [id], ny.id);
  return { dok: d, lagId: ny.id };
}

/** Kept for callers that only deal with text. */
export const losUtTekst = losUtObjekt;

/** Next free «Navn», «Navn 2» … among the layers. */
export function ledigNavn(dok: Dokument, grunn: string): string {
  const navn = new Set(dok.lag.map((l) => l.navn));
  if (!navn.has(grunn)) return grunn;
  let n = 2;
  while (navn.has(`${grunn} ${n}`)) n++;
  return `${grunn} ${n}`;
}

function medOmriss(dok: Dokument, lagId: LagId, fn: (o: Omriss[]) => Omriss[]): Dokument {
  return stable({
    ...dok,
    lag: dok.lag.map((l) => (l.id === lagId && l.tekstlag ? { ...l, omriss: fn(l.omriss ?? []) } : l)),
  });
}

export function finnOmriss(dok: Dokument, id: string): { lag: Lag; omriss: Omriss } | undefined {
  for (const lag of dok.lag) {
    const o = lag.omriss?.find((x) => x.id === id);
    if (o) return { lag, omriss: o };
  }
  return undefined;
}

/** Add an outline outside the existing ones. */
export function leggTilOmriss(dok: Dokument, lagId: LagId, o: Omriss): Dokument {
  return medOmriss(dok, lagId, (r) => [...r, o]);
}

export function oppdaterOmriss(
  dok: Dokument,
  lagId: LagId,
  id: string,
  endring: Partial<Omit<Omriss, 'id'>>,
): Dokument {
  return medOmriss(dok, lagId, (r) => r.map((x) => (x.id === id ? { ...x, ...endring } : x)));
}

export function slettOmriss(dok: Dokument, lagId: LagId, id: string): Dokument {
  return medOmriss(dok, lagId, (r) => r.filter((x) => x.id !== id));
}

/** Move an outline next to another one in the list (innermost first): `for` puts it before `mal`, `etter` after. */
export function flyttOmrissTil(
  dok: Dokument,
  lagId: LagId,
  id: string,
  mal: string,
  plass: 'for' | 'etter',
): Dokument {
  return medOmriss(dok, lagId, (r) => {
    const o = r.find((x) => x.id === id);
    if (!o || id === mal || !r.some((x) => x.id === mal)) return r;
    const resten = r.filter((x) => x.id !== id);
    const i = resten.findIndex((x) => x.id === mal) + (plass === 'etter' ? 1 : 0);
    return [...resten.slice(0, i), o, ...resten.slice(i)];
  });
}

/** Move an outline outwards (+1) or inwards (−1). */
export function flyttOmriss(dok: Dokument, lagId: LagId, id: string, retning: 1 | -1): Dokument {
  return medOmriss(dok, lagId, (r) => {
    const i = r.findIndex((x) => x.id === id);
    const j = i + retning;
    if (i < 0 || j < 0 || j >= r.length) return r;
    const kopi = [...r];
    [kopi[i], kopi[j]] = [kopi[j]!, kopi[i]!];
    return kopi;
  });
}

/** Printed colour slots, bottom to top: each layer (a text layer's text) and each outline. */
export function fargeplasser(dok: Dokument): { id: string; navn: string; materialId: string }[] {
  return dok.lag
    .filter((l) => l.synlig)
    .flatMap((l) => [
      ...(l.tekstvisning === 'kutt' ? [] : [{ id: l.id, navn: l.navn, materialId: l.materialId }]),
      ...(l.tekstvisning === 'kutt'
        ? []
        : objekterILag(dok, l.id)
            .filter((o) => o.synlig && o.materialId && o.materialId !== l.materialId)
            .map((o) => ({ id: o.id, navn: `${l.navn}: ${o.navn}`, materialId: o.materialId! }))),
      ...(l.omriss ?? [])
        .filter((o) => o.synlig)
        .map((o) => ({ id: o.id, navn: `${l.navn}: ${o.navn}`, materialId: o.materialId })),
    ]);
}

/** Set the colour of a layer or of an outline (batch colour columns). */
export function settFarge(dok: Dokument, id: string, materialId: string): Dokument {
  if (finnLag(dok, id)) return oppdaterLag(dok, id, { materialId });
  if (dok.objekter[id]) return oppdaterObjekter(dok, [id], (o) => ({ ...o, materialId }));
  const r = finnOmriss(dok, id);
  return r ? oppdaterOmriss(dok, r.lag.id, id, { materialId }) : dok;
}

/**
 * Bring a stored project up to text layers. A project from before text
 * layers gets every layer that holds only text marked as a text layer
 * (its texts are then one group, as they were one layer). Nothing moves
 * and no geometry changes; text in a layer mixed with shapes stays where
 * it is and is reported, so the user decides.
 */
export function ordneTekstlag(dok: Dokument): Dokument {
  if (dok.generator !== SIGNGEN_ID) return dok;
  const kjent = dok.lag.some((l) => l.tekstlag);
  let endret = false;
  const lag = dok.lag.map((l): Lag => {
    if (l.tekstlag) {
      if (l.omriss && l.tekstvisning) return l;
      endret = true;
      return { ...l, omriss: l.omriss ?? [], tekstvisning: l.tekstvisning ?? 'normal' };
    }
    const obj = objekterILag(dok, l.id);
    if (kjent || !obj.length || obj.some((o) => o.kilde.type !== 'tekst')) return l;
    endret = true;
    return { ...l, tekstlag: true, omriss: [], tekstvisning: 'normal' };
  });
  return endret ? { ...dok, lag } : dok;
}
