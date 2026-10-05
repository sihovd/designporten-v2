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
  type TekstKilde,
  type Underlag,
  type UnderlagId,
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

export function nyttUnderlag(navn: string, materialId: string): Underlag {
  return { id: nyId('u'), navn, materialId, synlig: true, last: false };
}

/** A text layer with one colour group. */
export function nyttTekstlag(materialId: string, hoyde = 1.5, navn = 'Tekst'): Lag {
  const u = nyttUnderlag('Farge 1', materialId);
  return { ...nyttLag(navn, materialId, hoyde), tekstlag: true, underlag: [u] };
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
  underlagId?: UnderlagId,
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
    ...(underlagId ? { underlagId } : {}),
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
  const tekst = nyttTekstlag('pla-kritthvit');
  const plate = nyttObjekt(bunn.id, nyForm('rektangel', 120, 42, 6), {}, 'Bunnplate');
  const t = nyttObjekt(tekst.id, nyTekst('Designporten', 14), {}, undefined, tekst.underlag![0]!.id);
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
    z += l.hoyde;
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
  // deleting the text layer makes the topmost layer that still has text the text layer
  return ordneTekstlag(stable({ ...dok, lag, objekter, rekkefolge }));
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
  // there is only one text layer per sign
  if (!l || l.tekstlag) return { dok, nyId: id };
  const kopi: Lag = { ...structuredClone(l), id: nyId('l'), navn: `${l.navn} (kopi)` };
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

/**
 * Move objects to a layer, or to a colour group of the text layer. Text
 * only goes into the text layer; text asked to go elsewhere stays put.
 */
export function flyttTilLag(
  dok: Dokument,
  ider: ObjektId[],
  lagId: LagId,
  underlagId?: UnderlagId,
): Dokument {
  const mal = finnLag(dok, lagId);
  if (!mal) return dok;
  const ul = mal.tekstlag
    ? (mal.underlag?.find((u) => u.id === underlagId) ?? mal.underlag?.at(-1))
    : undefined;
  const flytt = new Set(
    ider.filter((id) => {
      const o = dok.objekter[id];
      if (!o || (o.kilde.type === 'tekst' && !mal.tekstlag)) return false;
      return o.lagId !== lagId || o.underlagId !== ul?.id;
    }),
  );
  if (!flytt.size) return dok;
  const rekkefolge: Dokument['rekkefolge'] = {};
  for (const [lag, liste] of Object.entries(dok.rekkefolge))
    rekkefolge[lag] = liste.filter((id) => !flytt.has(id));
  rekkefolge[lagId] = [...(rekkefolge[lagId] ?? []), ...flytt];
  const objekter = { ...dok.objekter };
  for (const id of flytt) {
    const { underlagId: _, ...o } = objekter[id]!;
    objekter[id] = ul ? { ...o, lagId, underlagId: ul.id } : { ...o, lagId };
  }
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

// ---------- the text layer and its colour groups ----------

export function finnTekstlag(dok: Dokument): Lag | undefined {
  return dok.lag.find((l) => l.tekstlag);
}

export function finnUnderlag(dok: Dokument, id: UnderlagId): { lag: Lag; underlag: Underlag } | undefined {
  for (const lag of dok.lag) {
    const u = lag.underlag?.find((x) => x.id === id);
    if (u) return { lag, underlag: u };
  }
  return undefined;
}

/** The colour group an object is in, if it is in the text layer. */
export function underlagFor(dok: Dokument, o: Objekt): Underlag | undefined {
  if (!o.underlagId) return undefined;
  return finnLag(dok, o.lagId)?.underlag?.find((u) => u.id === o.underlagId);
}

/** Objects of one colour group, in stacking order. */
export function objekterIUnderlag(dok: Dokument, lagId: LagId, underlagId: UnderlagId): Objekt[] {
  return objekterILag(dok, lagId).filter((o) => o.underlagId === underlagId);
}

/** Text objects outside the text layer (projects from before the text layer). */
export function tekstUtenforTekstlaget(dok: Dokument): Objekt[] {
  return Object.values(dok.objekter).filter(
    (o) => o.kilde.type === 'tekst' && !finnLag(dok, o.lagId)?.tekstlag,
  );
}

function medUnderlag(dok: Dokument, lagId: LagId, fn: (u: Underlag[]) => Underlag[]): Dokument {
  const lag = dok.lag.map((l) => {
    if (l.id !== lagId || !l.underlag) return l;
    const underlag = fn(l.underlag);
    // the layer's own colour follows its first group (stack diagram, summaries)
    return { ...l, underlag, materialId: underlag[0]?.materialId ?? l.materialId };
  });
  return { ...dok, lag };
}

export function oppdaterUnderlag(
  dok: Dokument,
  lagId: LagId,
  id: UnderlagId,
  endring: Partial<Omit<Underlag, 'id'>>,
): Dokument {
  return medUnderlag(dok, lagId, (u) => u.map((x) => (x.id === id ? { ...x, ...endring } : x)));
}

/** Add a colour group above `overId` (or on top). */
export function leggTilUnderlag(dok: Dokument, lagId: LagId, ny: Underlag, overId?: UnderlagId): Dokument {
  return medUnderlag(dok, lagId, (u) => {
    const i = overId ? u.findIndex((x) => x.id === overId) : u.length - 1;
    const kopi = [...u];
    kopi.splice(i < 0 ? u.length : i + 1, 0, ny);
    return kopi;
  });
}

/** Delete a colour group and its objects. The last group cannot be deleted. */
export function slettUnderlag(dok: Dokument, lagId: LagId, id: UnderlagId): Dokument {
  const lag = finnLag(dok, lagId);
  if (!lag?.underlag || lag.underlag.length <= 1 || !lag.underlag.some((u) => u.id === id)) return dok;
  const bort = objekterILag(dok, lagId)
    .filter((o) => o.underlagId === id)
    .map((o) => o.id);
  const objekter = { ...dok.objekter };
  for (const oid of bort) delete objekter[oid];
  const rekkefolge = {
    ...dok.rekkefolge,
    [lagId]: (dok.rekkefolge[lagId] ?? []).filter((x) => !bort.includes(x)),
  };
  return medUnderlag({ ...dok, objekter, rekkefolge }, lagId, (u) => u.filter((x) => x.id !== id));
}

/** Move a colour group up (+1) or down (−1). Higher groups win where they overlap. */
export function flyttUnderlag(dok: Dokument, lagId: LagId, id: UnderlagId, retning: 1 | -1): Dokument {
  return medUnderlag(dok, lagId, (u) => {
    const i = u.findIndex((x) => x.id === id);
    const j = i + retning;
    if (i < 0 || j < 0 || j >= u.length) return u;
    const kopi = [...u];
    [kopi[i], kopi[j]] = [kopi[j]!, kopi[i]!];
    return kopi;
  });
}

/** Set the colour of a layer or of a colour group (batch colour columns). */
export function settFarge(dok: Dokument, id: string, materialId: string): Dokument {
  if (finnLag(dok, id)) {
    const lag = finnLag(dok, id)!;
    // a text layer's colour is its first group's colour
    if (lag.underlag?.length) return oppdaterUnderlag(dok, id, lag.underlag[0]!.id, { materialId });
    return oppdaterLag(dok, id, { materialId });
  }
  const u = finnUnderlag(dok, id);
  return u ? oppdaterUnderlag(dok, u.lag.id, id, { materialId }) : dok;
}

/** Printed colour slots, bottom to top: plain layers and the text layer's groups. */
export function fargeplasser(dok: Dokument): { id: string; navn: string; materialId: string }[] {
  return dok.lag
    .filter((l) => l.synlig)
    .flatMap((l) =>
      // a text layer with one colour is one slot, named and addressed as the layer
      l.underlag && l.underlag.length > 1
        ? l.underlag
            .filter((u) => u.synlig)
            .map((u) => ({ id: u.id, navn: `${l.navn}: ${u.navn}`, materialId: u.materialId }))
        : [{ id: l.id, navn: l.navn, materialId: l.underlag?.[0]?.materialId ?? l.materialId }],
    );
}

/**
 * Bring a stored project up to the text-layer structure (Sivert,
 * 2026-10-05: one text layer per sign, colour groups at one height).
 * A project from before gets its topmost layer with text as the text
 * layer, with one colour group in the layer's colour. Nothing moves and
 * no geometry changes: text in other layers stays where it is and is
 * reported, so the user decides where it goes.
 */
export function ordneTekstlag(dok: Dokument): Dokument {
  if (dok.generator !== SIGNGEN_ID) return dok;
  let endret = false;
  let funnet = false;
  let lag: Lag[] = dok.lag.map((l): Lag => {
    if (!l.tekstlag) {
      if (!l.underlag) return l;
      endret = true;
      const { underlag: _, ...rest } = l;
      return rest;
    }
    if (funnet) {
      // only one text layer: later ones become plain layers
      endret = true;
      const { underlag: _, tekstlag: __, ...rest } = l;
      return rest;
    }
    funnet = true;
    if (l.underlag?.length) return l;
    endret = true;
    return { ...l, underlag: [nyttUnderlag('Farge 1', l.materialId)] };
  });
  if (!funnet) {
    const harTekst = (l: Lag) => objekterILag(dok, l.id).some((o) => o.kilde.type === 'tekst');
    const kandidat = [...lag].reverse().find(harTekst);
    if (kandidat) {
      endret = true;
      lag = lag.map((l) =>
        l.id === kandidat.id
          ? { ...l, tekstlag: true, underlag: [nyttUnderlag('Farge 1', l.materialId)] }
          : l,
      );
    }
  }
  // every object in the text layer belongs to one of its groups; no others carry one
  let objekter: Dokument['objekter'] | null = null;
  for (const o of Object.values(dok.objekter)) {
    const l = lag.find((x) => x.id === o.lagId);
    const grupper = l?.tekstlag ? l.underlag! : null;
    let ny: Objekt = o;
    if (grupper && !grupper.some((u) => u.id === o.underlagId)) ny = { ...o, underlagId: grupper[0]!.id };
    else if (!grupper && o.underlagId !== undefined) {
      const { underlagId: _, ...rest } = o;
      ny = rest;
    }
    if (ny !== o) {
      objekter ??= { ...dok.objekter };
      objekter[o.id] = ny;
    }
  }
  if (!endret && !objekter) return dok;
  return { ...dok, lag, objekter: objekter ?? dok.objekter };
}
