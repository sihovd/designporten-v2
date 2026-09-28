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
  const tekst = nyttLag('Tekst', 'pla-kritthvit', 1.5);
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
  if (!finnLag(dok, lagId)) return dok;
  const flytt = new Set(ider.filter((id) => dok.objekter[id] && dok.objekter[id]!.lagId !== lagId));
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
