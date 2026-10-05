/**
 * CSV batch (spec: Signgen "Batch (CSV)"): a master sign with text fields,
 * a CSV whose columns map to fields (and optionally to layer colours),
 * one variant per row, overflow checks, grouping and sorting, and
 * distribution of the variants across build plates.
 *
 * Pure functions; the dialog in Batch.tsx drives them.
 */
import type { Dokument, Objekt, TekstKilde } from '../../core/dokument';
import { materialer } from '../../core/materialer';
import { erTom, slaSammen, tomBoks, type Boks } from '../../core/geometri2d';
import { fargeplasser, feltObjekter, oppdaterObjekter, settFarge } from './dokument';
import { byggSigngen, lokalGeometri, verdensBoks } from './modell';
import type { Mesh, ModellDel } from '../../geometri/mesh';
import { filnavn as trygtFilnavn, tilTremfSamlinger, type TremfSamling } from '../../eksport/tremf';
import { zipSync, strToU8 } from 'fflate';

// ---------- CSV ----------

export interface Csv {
  kolonner: string[];
  rader: string[][];
}

/** Parse CSV with auto-detected delimiter (; , or tab), quotes and BOM. */
export function tolkCsv(tekst: string): Csv {
  const t = tekst.replace(/^\uFEFF/, '');
  const forste = t.split(/\r?\n/, 1)[0] ?? '';
  const skilletegn = [';', ',', '\t'].reduce(
    (best, s) => (forste.split(s).length > forste.split(best).length ? s : best),
    ',',
  );
  const rader: string[][] = [];
  let rad: string[] = [];
  let felt = '';
  let iAnforsel = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (iAnforsel) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          felt += '"';
          i++;
        } else iAnforsel = false;
      } else felt += c;
    } else if (c === '"' && felt === '') iAnforsel = true;
    else if (c === skilletegn) {
      rad.push(felt);
      felt = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      rad.push(felt);
      rader.push(rad);
      rad = [];
      felt = '';
    } else felt += c;
  }
  if (felt !== '' || rad.length) {
    rad.push(felt);
    rader.push(rad);
  }
  const ikkeTomme = rader.filter((r) => r.some((v) => v.trim() !== ''));
  const [hode, ...resten] = ikkeTomme;
  const kolonner = (hode ?? []).map((k, i) => k.trim() || `Kolonne ${i + 1}`);
  return { kolonner, rader: resten.map((r) => kolonner.map((_, i) => (r[i] ?? '').trim())) };
}

// ---------- mapping and variants ----------

/** What a CSV column controls: a text field, a colour (layer or outline id), or nothing. */
export type Kolonnemal =
  { type: 'felt'; felt: string } | { type: 'farge'; lagId: string } | { type: 'ingen' };

export function foreslaKobling(csv: Csv, dok: Dokument): Kolonnemal[] {
  const felt = feltObjekter(dok).map((o) => (o.kilde as TekstKilde).felt!);
  return csv.kolonner.map((k) => {
    const n = k.trim().toLowerCase();
    const f = felt.find((x) => x === n);
    if (f) return { type: 'felt', felt: f };
    // a colour column names a layer or an outline («Omriss 1» or «Tekst: Omriss 1»)
    const plass = fargeplasser(dok).find((p) => {
      const hele = p.navn.trim().toLowerCase();
      const kort = (p.navn.split(': ').at(-1) ?? p.navn).trim().toLowerCase();
      return [hele, kort].some((x) => x === n || `farge ${x}` === n);
    });
    if (plass) return { type: 'farge', lagId: plass.id };
    return { type: 'ingen' };
  });
}

/** Material id from a CSV value: an id or a colour name (case-insensitive). */
export function finnFarge(verdi: string): string | null {
  const v = verdi.trim().toLowerCase();
  if (!v) return null;
  const m =
    materialer.find((x) => x.id === v) ??
    materialer.find((x) => x.navn.toLowerCase() === v) ??
    materialer.find((x) => `${x.navn} ${x.type}`.toLowerCase() === v);
  return m?.id ?? null;
}

export interface Variant {
  indeks: number;
  verdier: string[];
  dok: Dokument;
  /** Colour combination key, bottom to top. */
  farger: string;
  problemer: string[];
  /** Footprint (mm) of the whole variant. */
  boks: Boks;
}

function feltGrense(dok: Dokument, felt: Objekt[]): Boks | null {
  // the sign area: everything that is not a field
  const ider = new Set(felt.map((o) => o.id));
  let b = tomBoks();
  for (const o of Object.values(dok.objekter)) {
    if (!o.synlig || ider.has(o.id) || o.operasjon === 'trekk-fra') continue;
    b = slaSammen(b, verdensBoks(o));
  }
  return erTom(b) ? null : b;
}

/** Build one variant per row. Fonts must be loaded (lastFonter) first. */
export function lagVarianter(master: Dokument, csv: Csv, kobling: Kolonnemal[]): Variant[] {
  const feltMaster = feltObjekter(master);
  const grense = feltGrense(master, feltMaster);
  return csv.rader.map((rad, indeks) => {
    let dok = master;
    const problemer: string[] = [];
    kobling.forEach((k, i) => {
      const verdi = rad[i] ?? '';
      if (k.type === 'felt') {
        const ider = feltMaster.filter((o) => (o.kilde as TekstKilde).felt === k.felt).map((o) => o.id);
        dok = oppdaterObjekter(dok, ider, (o) => ({
          ...o,
          kilde: { ...(o.kilde as TekstKilde), tekst: verdi },
        }));
        if (!verdi.trim()) problemer.push(`«${k.felt}» er tom`);
      } else if (k.type === 'farge') {
        const m = finnFarge(verdi);
        const plass = fargeplasser(dok).find((p) => p.id === k.lagId);
        if (!m) problemer.push(`ukjent farge «${verdi}»${plass ? ` for ${plass.navn}` : ''}`);
        else dok = settFarge(dok, k.lagId, m);
      }
    });
    for (const o of feltObjekter(dok)) {
      const g = lokalGeometri(o.kilde);
      if (!g) continue;
      if (g.mangler.length) problemer.push(`fonten mangler ${g.mangler.map((c) => `«${c}»`).join(', ')}`);
      const b = verdensBoks(o);
      const margin = 1;
      if (
        grense &&
        (b.minX < grense.minX + margin ||
          b.maksX > grense.maksX - margin ||
          b.minY < grense.minY + margin ||
          b.maksY > grense.maksY - margin)
      ) {
        problemer.push(`«${(o.kilde as TekstKilde).tekst.slice(0, 24)}» er for lang for skiltet`);
      }
    }
    let boks = tomBoks();
    for (const o of Object.values(dok.objekter)) if (o.synlig) boks = slaSammen(boks, verdensBoks(o));
    return {
      indeks,
      verdier: rad,
      dok: { ...dok, navn: `${master.navn} ${indeks + 1}` },
      farger: fargeplasser(dok)
        .map((p) => p.materialId)
        .join('+'),
      problemer: [...new Set(problemer)],
      boks: erTom(boks) ? { minX: 0, minY: 0, maksX: 0, maksY: 0 } : boks,
    };
  });
}

// ---------- organisation ----------

export type Sortering = 'csv' | 'alfabet';
export type Gruppering = 'ingen' | 'farger';

export function organiser(
  v: Variant[],
  sortering: Sortering,
  gruppering: Gruppering,
  sorterKolonne = 0,
): Variant[][] {
  const liste = [...v];
  if (sortering === 'alfabet') {
    liste.sort((a, b) =>
      (a.verdier[sorterKolonne] ?? '').localeCompare(b.verdier[sorterKolonne] ?? '', 'nb'),
    );
  }
  if (gruppering === 'ingen') return [liste];
  const grupper = new Map<string, Variant[]>();
  for (const x of liste) grupper.set(x.farger, [...(grupper.get(x.farger) ?? []), x]);
  return [...grupper.values()];
}

export interface Plassering {
  variant: Variant;
  /** Offset to add to the variant's coordinates (mm). */
  dx: number;
  dy: number;
}

export interface Byggeplate {
  nummer: number;
  plasseringer: Plassering[];
}

/**
 * Shelf packing onto build plates (row by row from the back left),
 * keeping `avstand` mm between signs and to the plate edge. Groups start
 * on a new plate so colour changes stay per plate. Throws if a single
 * sign does not fit on the plate.
 */
export function fordelPaPlater(
  grupper: Variant[][],
  plate: { bredde: number; dybde: number },
  avstand = 5,
): Byggeplate[] {
  const plater: Byggeplate[] = [];
  for (const gruppe of grupper) {
    let naa: Byggeplate | null = null;
    let x = 0,
      y = 0,
      radHoyde = 0;
    for (const v of gruppe) {
      const b = v.boks.maksX - v.boks.minX;
      const h = v.boks.maksY - v.boks.minY;
      if (b + 2 * avstand > plate.bredde || h + 2 * avstand > plate.dybde) {
        throw new Error(`Skilt ${v.indeks + 1} er større enn byggeplaten.`);
      }
      if (!naa || x + b > plate.bredde - 2 * avstand) {
        // new row
        if (naa && y + radHoyde + avstand + h <= plate.dybde - 2 * avstand) {
          y += radHoyde + avstand;
          x = 0;
          radHoyde = 0;
        } else {
          naa = { nummer: plater.length + 1, plasseringer: [] };
          plater.push(naa);
          x = 0;
          y = 0;
          radHoyde = 0;
        }
      }
      // place with the sign's box top-left at (x, y) from the plate's back-left corner
      const venstre = -plate.bredde / 2 + avstand + x;
      const topp = plate.dybde / 2 - avstand - y;
      naa.plasseringer.push({ variant: v, dx: venstre - v.boks.minX, dy: topp - v.boks.maksY });
      x += b + avstand;
      radHoyde = Math.max(radHoyde, h);
    }
  }
  return plater;
}

/** Manifest CSV for the batch output. */
export function manifest(
  plater: Byggeplate[],
  kolonner: string[],
  filnavn: (p: Byggeplate, pl: Plassering) => string,
): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const linjer = [['fil', 'plate', 'rad', 'farger', ...kolonner].map(esc).join(';')];
  for (const p of plater) {
    for (const pl of p.plasseringer) {
      const farger = pl.variant.farger
        .split('+')
        .map((id) => materialer.find((m) => m.id === id)?.navn ?? id)
        .join(' + ');
      linjer.push(
        [filnavn(p, pl), String(p.nummer), String(pl.variant.indeks + 1), farger, ...pl.variant.verdier]
          .map(esc)
          .join(';'),
      );
    }
  }
  return linjer.join('\r\n');
}

// ---------- output ----------

export function forskyvMesh(m: Mesh, dx: number, dy: number): Mesh {
  const p = new Float32Array(m.posisjoner);
  for (let i = 0; i < p.length; i += 3) {
    p[i] = p[i]! + dx;
    p[i + 1] = p[i + 1]! + dy;
  }
  return { posisjoner: p, indekser: m.indekser };
}

export type Utdeling = 'plate' | 'variant';

export interface Batchresultat {
  zip: Uint8Array;
  filer: string[];
  /** Build errors per variant (1-based row) that stop a clean result. */
  feil: string[];
}

/**
 * Build every variant and write one 3MF per plate (placed as laid out)
 * or one 3MF per variant, plus manifest.csv, into a zip.
 */
export async function byggBatch(
  plater: Byggeplate[],
  kolonner: string[],
  prosjekt: string,
  utdeling: Utdeling,
  fremdrift?: (ferdig: number, totalt: number) => void,
): Promise<Batchresultat> {
  const base = trygtFilnavn(prosjekt, '3mf').replace(/\.3mf$/, '');
  const to = (n: number) => String(n).padStart(2, '0');
  const totalt = plater.reduce((n, p) => n + p.plasseringer.length, 0);
  const filer: Record<string, Uint8Array> = {};
  const feil: string[] = [];
  const variantFil = (pl: Plassering) =>
    trygtFilnavn(`${base}-${to(pl.variant.indeks + 1)}-${pl.variant.verdier[0] ?? ''}`, '3mf');
  let ferdig = 0;
  for (const p of plater) {
    const samlinger: TremfSamling[] = [];
    for (const pl of p.plasseringer) {
      const r = await byggSigngen(pl.variant.dok);
      for (const a of r.advarsler)
        if (a.niva === 'feil') feil.push(`Rad ${pl.variant.indeks + 1}: ${a.tekst}`);
      const navn = pl.variant.verdier.filter(Boolean).join(' ') || `Skilt ${pl.variant.indeks + 1}`;
      const deler: ModellDel[] =
        utdeling === 'plate'
          ? r.deler.map((d) => ({ ...d, mesh: forskyvMesh(d.mesh, pl.dx, pl.dy) }))
          : r.deler;
      if (utdeling === 'plate') samlinger.push({ navn, deler });
      else filer[variantFil(pl)] = tilTremfSamlinger([{ navn, deler }], { tittel: navn });
      fremdrift?.(++ferdig, totalt);
      // let the browser paint progress between signs
      await new Promise((r) => setTimeout(r, 0));
    }
    if (utdeling === 'plate') {
      filer[`${base}-plate-${to(p.nummer)}.3mf`] = tilTremfSamlinger(samlinger, {
        tittel: `${prosjekt}, plate ${p.nummer}`,
      });
    }
  }
  const navnFor = (p: Byggeplate, pl: Plassering) =>
    utdeling === 'plate' ? `${base}-plate-${to(p.nummer)}.3mf` : variantFil(pl);
  filer['manifest.csv'] = strToU8(`\uFEFF${manifest(plater, kolonner, navnFor)}`);
  return { zip: zipSync(filer, { level: 6 }), filer: Object.keys(filer), feil };
}
