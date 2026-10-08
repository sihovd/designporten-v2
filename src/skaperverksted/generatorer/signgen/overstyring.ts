/**
 * Master and instance overrides (Sivert, 2026-10-06, §30 and §31).
 *
 * A sign made from a CSV row is the master with the row's values put in. If
 * one sign needs something else (the first name 3 mm tighter, another colour
 * on one outline), that is stored as a local override on that sign only:
 * one named property of one object, layer or outline. It is not a detached
 * copy. The sign is always built master first, row second, overrides last,
 * so a later change to the master (font, colour, height) still reaches the
 * sign, except in the properties that have their own override.
 *
 * Pure functions on documents.
 */
import type { Dokument, Lag, Objekt, Omriss, TekstKilde } from '../../core/dokument';
import { fargekode, finnMateriale } from '../../core/materialer';
import { finnFont } from '../../geometri/tekst';
import { finnOmriss, oppdaterLag, oppdaterObjekter, oppdaterOmriss } from './dokument';

export type Overstyringsmal = 'objekt' | 'lag' | 'omriss';

export type Overstyringsverdi = string | number | boolean;

export interface Overstyring {
  mal: Overstyringsmal;
  id: string;
  egenskap: string;
  verdi: Overstyringsverdi;
}

/** Overrides of one sign, by `mal:id:egenskap`. */
export type Overstyringer = Record<string, Overstyring>;

export const overstyringsnokkel = (o: Pick<Overstyring, 'mal' | 'id' | 'egenskap'>) =>
  `${o.mal}:${o.id}:${o.egenskap}`;

interface Egenskap<T> {
  id: string;
  navn: string;
  enhet?: string;
  type: 'tall' | 'bryter' | 'filament' | 'font' | 'valg';
  les(x: T): Overstyringsverdi | undefined;
  skriv(x: T, v: Overstyringsverdi): T;
}

const tallEgenskap = <T>(
  id: string,
  navn: string,
  les: (x: T) => number | undefined,
  skriv: (x: T, v: number) => T,
  enhet?: string,
): Egenskap<T> => ({
  id,
  navn,
  enhet,
  type: 'tall',
  les,
  skriv: (x, v) => (typeof v === 'number' ? skriv(x, v) : x),
});

const tekstKilde = (o: Objekt): TekstKilde | null => (o.kilde.type === 'tekst' ? o.kilde : null);

const medTekst = (o: Objekt, endring: Partial<TekstKilde>): Objekt =>
  o.kilde.type === 'tekst' ? { ...o, kilde: { ...o.kilde, ...endring } } : o;

const OBJEKT: Egenskap<Objekt>[] = [
  tallEgenskap(
    'x',
    'Plassering vannrett',
    (o) => o.transform.x,
    (o, v) => ({ ...o, transform: { ...o.transform, x: v } }),
    'mm',
  ),
  tallEgenskap(
    'y',
    'Plassering loddrett',
    (o) => o.transform.y,
    (o, v) => ({ ...o, transform: { ...o.transform, y: v } }),
    'mm',
  ),
  tallEgenskap(
    'rotasjon',
    'Rotasjon',
    (o) => o.transform.rotasjon,
    (o, v) => ({ ...o, transform: { ...o.transform, rotasjon: v } }),
    '°',
  ),
  tallEgenskap(
    'skalaX',
    'Skala bredde',
    (o) => o.transform.skalaX,
    (o, v) => ({ ...o, transform: { ...o.transform, skalaX: v } }),
  ),
  tallEgenskap(
    'skalaY',
    'Skala høyde',
    (o) => o.transform.skalaY,
    (o, v) => ({ ...o, transform: { ...o.transform, skalaY: v } }),
  ),
  {
    id: 'synlig',
    navn: 'Synlighet',
    type: 'bryter',
    les: (o) => o.synlig,
    skriv: (o, v) => (typeof v === 'boolean' ? { ...o, synlig: v } : o),
  },
  tallEgenskap(
    'storrelse',
    'Tekststørrelse',
    (o) => tekstKilde(o)?.storrelse,
    (o, v) => medTekst(o, { storrelse: v }),
    'mm',
  ),
  tallEgenskap(
    'sperring',
    'Bokstavavstand',
    (o) => tekstKilde(o)?.sperring,
    (o, v) => medTekst(o, { sperring: v }),
    'em',
  ),
  tallEgenskap(
    'linjeavstand',
    'Linjeavstand',
    (o) => tekstKilde(o)?.linjeavstand,
    (o, v) => medTekst(o, { linjeavstand: v }),
  ),
  {
    id: 'fontId',
    navn: 'Font',
    type: 'font',
    les: (o) => tekstKilde(o)?.fontId,
    skriv: (o, v) => (typeof v === 'string' ? medTekst(o, { fontId: v }) : o),
  },
  {
    id: 'justering',
    navn: 'Justering',
    type: 'valg',
    les: (o) => tekstKilde(o)?.justering,
    skriv: (o, v) => (v === 'venstre' || v === 'midt' || v === 'hoyre' ? medTekst(o, { justering: v }) : o),
  },
];

const FILAMENT = <T>(les: (x: T) => string, skriv: (x: T, v: string) => T): Egenskap<T> => ({
  id: 'materialId',
  navn: 'Farge',
  type: 'filament',
  les,
  skriv: (x, v) => (typeof v === 'string' ? skriv(x, v) : x),
});

const LAG: Egenskap<Lag>[] = [
  FILAMENT(
    (l) => l.materialId,
    (l, v) => ({ ...l, materialId: v }),
  ),
  tallEgenskap(
    'hoyde',
    'Høyde',
    (l) => l.hoyde,
    (l, v) => ({ ...l, hoyde: v }),
    'mm',
  ),
  {
    id: 'synlig',
    navn: 'Synlighet',
    type: 'bryter',
    les: (l) => l.synlig,
    skriv: (l, v) => (typeof v === 'boolean' ? { ...l, synlig: v } : l),
  },
];

const OMRISS: Egenskap<Omriss>[] = [
  FILAMENT(
    (r) => r.materialId,
    (r, v) => ({ ...r, materialId: v }),
  ),
  tallEgenskap(
    'hoyde',
    'Høyde',
    (r) => r.hoyde,
    (r, v) => ({ ...r, hoyde: v }),
    'mm',
  ),
  tallEgenskap(
    'avstand',
    'Avstand',
    (r) => r.avstand,
    (r, v) => ({ ...r, avstand: v }),
    'mm',
  ),
  tallEgenskap(
    'bredde',
    'Bredde',
    (r) => r.bredde,
    (r, v) => ({ ...r, bredde: v }),
    'mm',
  ),
  {
    id: 'synlig',
    navn: 'Synlighet',
    type: 'bryter',
    les: (r) => r.synlig,
    skriv: (r, v) => (typeof v === 'boolean' ? { ...r, synlig: v } : r),
  },
];

function egenskaperFor(mal: Overstyringsmal): Egenskap<never>[] {
  return (mal === 'objekt' ? OBJEKT : mal === 'lag' ? LAG : OMRISS) as Egenskap<never>[];
}

/** The property definition behind an override, for editors and lists. */
export function finnEgenskap(mal: Overstyringsmal, egenskap: string) {
  const e = egenskaperFor(mal).find((x) => x.id === egenskap);
  return e ? { navn: e.navn, enhet: e.enhet, type: e.type } : undefined;
}

/** The value of one property in a document, or undefined when the object or property is not there. */
export function lesVerdi(
  dok: Dokument,
  mal: Overstyringsmal,
  id: string,
  egenskap: string,
): Overstyringsverdi | undefined {
  const e = egenskaperFor(mal).find((x) => x.id === egenskap) as Egenskap<unknown> | undefined;
  if (!e) return undefined;
  if (mal === 'objekt') {
    const o = dok.objekter[id];
    return o ? e.les(o) : undefined;
  }
  if (mal === 'lag') {
    const l = dok.lag.find((x) => x.id === id);
    return l ? e.les(l) : undefined;
  }
  const r = finnOmriss(dok, id);
  return r ? e.les(r.omriss) : undefined;
}

/** Put one value in a document. A missing target or property leaves the document as it was. */
export function skrivVerdi(
  dok: Dokument,
  mal: Overstyringsmal,
  id: string,
  egenskap: string,
  verdi: Overstyringsverdi,
): Dokument {
  const e = egenskaperFor(mal).find((x) => x.id === egenskap) as Egenskap<unknown> | undefined;
  if (!e) return dok;
  if (mal === 'objekt') {
    return oppdaterObjekter(dok, [id], (o) => e.skriv(o, verdi) as Objekt);
  }
  if (mal === 'lag') {
    const l = dok.lag.find((x) => x.id === id);
    if (!l) return dok;
    const ny = e.skriv(l, verdi) as Lag;
    return ny === l ? dok : oppdaterLag(dok, id, ny);
  }
  const r = finnOmriss(dok, id);
  if (!r) return dok;
  const ny = e.skriv(r.omriss, verdi) as Omriss;
  return ny === r.omriss ? dok : oppdaterOmriss(dok, r.lag.id, id, ny);
}

/** Apply a sign's overrides on top of its master and row. */
export function brukOverstyringer(dok: Dokument, ov: Overstyringer | undefined): Dokument {
  if (!ov) return dok;
  let d = dok;
  for (const o of Object.values(ov)) d = skrivVerdi(d, o.mal, o.id, o.egenskap, o.verdi);
  return d;
}

/** Overrides that no longer find their target (the master lost the object, layer or outline). */
export function foreldreloseOverstyringer(dok: Dokument, ov: Overstyringer | undefined): Overstyring[] {
  return Object.values(ov ?? {}).filter((o) => lesVerdi(dok, o.mal, o.id, o.egenskap) === undefined);
}

const samme = (a: Overstyringsverdi | undefined, b: Overstyringsverdi | undefined) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;

export interface Avvik {
  overstyringer: Overstyringer;
  /** Changes that cannot be an override: objects, layers or outlines added or removed, text typed over. */
  utenfor: string[];
}

/**
 * What differs between the sign as master and row make it and the sign as
 * the user left it. Properties become overrides; structure (new or deleted
 * objects, layers and outlines) and the text itself do not, since those
 * belong to the master and the CSV.
 */
export function finnOverstyringer(grunn: Dokument, redigert: Dokument): Avvik {
  const overstyringer: Overstyringer = {};
  const utenfor: string[] = [];
  const legg = (mal: Overstyringsmal, id: string, egenskap: string, verdi: Overstyringsverdi) => {
    overstyringer[overstyringsnokkel({ mal, id, egenskap })] = { mal, id, egenskap, verdi };
  };

  for (const id of new Set([...Object.keys(grunn.objekter), ...Object.keys(redigert.objekter)])) {
    const a = grunn.objekter[id];
    const b = redigert.objekter[id];
    if (!a || !b) {
      utenfor.push(!a ? 'Nye objekter hører til masteren.' : 'Slettede objekter hører til masteren.');
      continue;
    }
    const ta = tekstKilde(a);
    const tb = tekstKilde(b);
    if (ta && tb && ta.tekst !== tb.tekst)
      utenfor.push('Teksten kommer fra CSV-raden. Endre raden i tabellen.');
    for (const e of OBJEKT) {
      const va = e.les(a);
      const vb = e.les(b);
      if (vb !== undefined && !samme(va, vb)) legg('objekt', id, e.id, vb);
    }
  }

  const lagA = new Map(grunn.lag.map((l) => [l.id, l]));
  const lagB = new Map(redigert.lag.map((l) => [l.id, l]));
  if ([...lagA.keys()].some((id) => !lagB.has(id)) || [...lagB.keys()].some((id) => !lagA.has(id))) {
    utenfor.push('Nye eller slettede lag hører til masteren.');
  }
  for (const [id, a] of lagA) {
    const b = lagB.get(id);
    if (!b) continue;
    for (const e of LAG) {
      const vb = e.les(b);
      if (!samme(e.les(a), vb)) legg('lag', id, e.id, vb!);
    }
    const ra = new Map((a.omriss ?? []).map((r) => [r.id, r]));
    const rb = new Map((b.omriss ?? []).map((r) => [r.id, r]));
    if ([...ra.keys()].some((k) => !rb.has(k)) || [...rb.keys()].some((k) => !ra.has(k))) {
      utenfor.push('Nye eller slettede omriss hører til masteren.');
    }
    for (const [rid, r] of ra) {
      const s = rb.get(rid);
      if (!s) continue;
      for (const e of OMRISS) {
        const vb = e.les(s);
        if (!samme(e.les(r), vb)) legg('omriss', rid, e.id, vb!);
      }
    }
  }
  return { overstyringer, utenfor: [...new Set(utenfor)] };
}

// ---------- readable lists ----------

/** What the object, layer or outline is called in a list: a text by its words. */
export function malnavn(dok: Dokument, mal: Overstyringsmal, id: string): string {
  if (mal === 'objekt') {
    const o = dok.objekter[id];
    if (!o) return 'Objekt som er borte';
    return o.kilde.type === 'tekst' ? `«${o.kilde.tekst.split('\n')[0]!.slice(0, 24)}»` : o.navn;
  }
  if (mal === 'lag') return dok.lag.find((l) => l.id === id)?.navn ?? 'Lag som er borte';
  const r = finnOmriss(dok, id);
  return r ? `${r.lag.navn}: ${r.omriss.navn}` : 'Omriss som er borte';
}

const tallTekst = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/** A value as the user reads it: «47 mm», «Lilla», «skjult». */
export function visVerdi(
  o: Pick<Overstyring, 'mal' | 'egenskap'>,
  verdi: Overstyringsverdi | undefined,
): string {
  if (verdi === undefined) return 'finnes ikke';
  const e = finnEgenskap(o.mal, o.egenskap);
  if (e?.type === 'bryter') return verdi ? 'synlig' : 'skjult';
  if (e?.type === 'filament') return fargekode(finnMateriale(String(verdi)));
  if (e?.type === 'font') return finnFont(String(verdi)).navn;
  if (typeof verdi === 'number') return `${tallTekst(verdi)}${e?.enhet ? ` ${e.enhet}` : ''}`;
  return String(verdi);
}

/** «Marie · Plassering vannrett». */
export function overstyringsetikett(dok: Dokument, o: Overstyring): string {
  return `${malnavn(dok, o.mal, o.id)} · ${finnEgenskap(o.mal, o.egenskap)?.navn ?? o.egenskap}`;
}
