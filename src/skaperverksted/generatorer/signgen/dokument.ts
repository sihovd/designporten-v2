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

export const SIGNGEN_ID = 'signgen';

export interface SigngenParametre {
  /** Z positions follow the layer order and heights. */
  autoZ: boolean;
  /** Print layer height used to realise side profiles (mm). */
  lagHoyde: number;
}

export function parametre(dok: Dokument): SigngenParametre {
  const p = dok.parametre as Partial<SigngenParametre>;
  return { autoZ: p.autoZ ?? true, lagHoyde: p.lagHoyde ?? standardPrinter.lagHoyde };
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
export function lagHoydeIStabel(l: Lag): number {
  return (l.omriss ?? []).reduce((h, o) => (o.synlig ? Math.max(h, o.hoyde) : h), l.hoyde);
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
  return { rektangel: 'Rektangel', ellipse: 'Ellipse', polygon: 'Polygon', hull: 'Opphengshull' }[k.form];
}

/** The starting sign: a rounded base plate and a text layer on top. */
export function nyttSigngenDokument(): Dokument {
  const dok = tomtDokument(SIGNGEN_ID, 'Mitt skilt', {
    bredde: standardPrinter.plateBredde,
    dybde: standardPrinter.plateDybde,
    hoyde: standardPrinter.byggHoyde,
    printerProfilId: standardPrinter.id,
  });
  const bunn = nyttLag('Bunnplate', 'pla-grafitt', 3);
  const tekst = nyttTekstlag('Tekst', 'pla-kritthvit');
  const plate = nyttObjekt(bunn.id, nyForm('rektangel', 120, 42, 6), {}, 'Bunnplate');
  const t = nyttObjekt(tekst.id, nyTekst('Designporten', 14));
  const d: Dokument = {
    ...dok,
    lag: [bunn, tekst],
    objekter: { [plate.id]: plate, [t.id]: t },
    rekkefolge: { [bunn.id]: [plate.id], [tekst.id]: [t.id] },
    parametre: { autoZ: true, lagHoyde: standardPrinter.lagHoyde } satisfies SigngenParametre,
  };
  return stable(d);
}

/** Recompute Z positions from the layer order when autoZ is on. */
export function stable(dok: Dokument): Dokument {
  if (!parametre(dok).autoZ) return dok;
  let z = 0;
  let endret = false;
  const lag = dok.lag.map((l) => {
    const zBunn = Math.round(z * 1000) / 1000;
    z += lagHoydeIStabel(l);
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
  return oppdaterObjekter(dok, [id], (o) => ({ ...o, kilde: { ...o.kilde, ...endring } as ObjektKilde }));
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

export function flyttTilLag(dok: Dokument, ider: ObjektId[], lagId: LagId): Dokument {
  const mal = finnLag(dok, lagId);
  if (!mal) return dok;
  // text goes only into text layers, and text layers hold only text
  const flytt = new Set(
    ider.filter((id) => {
      const o = dok.objekter[id];
      return !!o && o.lagId !== lagId && (o.kilde.type === 'tekst') === !!mal.tekstlag;
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

/** Text objects marked as batch fields. */
export function feltObjekter(dok: Dokument): Objekt[] {
  return Object.values(dok.objekter).filter((o) => o.kilde.type === 'tekst' && o.kilde.felt);
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

/** Remove layers left empty by moving their text away (never the last layer). */
function fjernTommeTekstlag(dok: Dokument, kandidater: Set<LagId>): Dokument {
  let d = dok;
  for (const id of kandidater) {
    const l = finnLag(d, id);
    if (l?.tekstlag && !d.rekkefolge[id]?.length && d.lag.length > 1) d = slettLag(d, id);
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
  d = fjernTommeTekstlag(d, fra);
  return { dok: stable(d), lagId: mal.lagId };
}

/**
 * Take a text out of its group into a text layer of its own, right above,
 * with a copy of the group's height, look and outlines.
 */
export function losUtTekst(dok: Dokument, id: ObjektId): { dok: Dokument; lagId: LagId | null } {
  const o = dok.objekter[id];
  const lag = o ? finnLag(dok, o.lagId) : undefined;
  if (!o || !lag?.tekstlag || (dok.rekkefolge[lag.id]?.length ?? 0) < 2) return { dok, lagId: null };
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
      ...(l.omriss ?? [])
        .filter((o) => o.synlig)
        .map((o) => ({ id: o.id, navn: `${l.navn}: ${o.navn}`, materialId: o.materialId })),
    ]);
}

/** Set the colour of a layer or of an outline (batch colour columns). */
export function settFarge(dok: Dokument, id: string, materialId: string): Dokument {
  if (finnLag(dok, id)) return oppdaterLag(dok, id, { materialId });
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
