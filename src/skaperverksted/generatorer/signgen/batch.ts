/**
 * CSV batch (spec: Signgen "Batch (CSV)"): a master sign with text fields,
 * a CSV whose columns map to fields (and optionally to layer colours),
 * one variant per row, overflow checks, grouping and sorting, and
 * distribution of the variants across build plates.
 *
 * Pure functions; the dialog in Batch.tsx drives them.
 */
import { finnLag, objekterILag, type Dokument, type Objekt, type TekstKilde } from '../../core/dokument';
import { materialer } from '../../core/materialer';
import { erTom, slaSammen, tomBoks, type Boks } from '../../core/geometri2d';
import { fargeplasser, feltNavn, feltObjekter, oppdaterObjekter, settFarge } from './dokument';
import { byggSigngen, fotavtrykkBoks, lokalGeometri, objektStorrelse, verdensBoks } from './modell';
import { erIngenDekor, finnDekorFraTekst, hentEgneDekor, type EgetDekor } from './dekor';
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
  const felt = feltObjekter(dok).map((o) => feltNavn(o)!);
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

/**
 * The area a field's text must stay inside: the shapes of the plain
 * layers (a plate or an SVG frame). Text layers and their outlines grow
 * with the text, so a sign built from outlines has no such limit, and
 * other texts are not a limit either.
 */
function feltGrense(dok: Dokument): Boks | null {
  let b = tomBoks();
  for (const o of Object.values(dok.objekter)) {
    if (!o.synlig || o.operasjon === 'trekk-fra' || o.kilde.type === 'tekst') continue;
    if (finnLag(dok, o.lagId)?.tekstlag) continue;
    b = slaSammen(b, verdensBoks(o));
  }
  return erTom(b) ? null : b;
}

// ---------- spacing inside a group ----------

/**
 * The gap between the texts (and vectors) of a text layer is a rule:
 * measured on the master sign and kept on every sign, so first and last
 * name sit the same distance apart whatever the names are (Sivert,
 * 2026-10-05). The group keeps its centre, so it grows from the middle.
 */
export interface Gruppeavstand {
  lagId: string;
  akse: 'x' | 'y';
  /** The group's objects in reading order: left to right, or top to bottom. */
  ider: string[];
  /** Gap before each object after the first (mm). */
  gap: number[];
  /** The group's centre along the axis (mm). */
  senter: number;
}

/** Gaps below this are overlaps, not spacing (mm). */
const MIN_GAP = -2;

export function gruppeavstander(master: Dokument): Gruppeavstand[] {
  const ut: Gruppeavstand[] = [];
  for (const lag of master.lag) {
    if (!lag.tekstlag || !lag.synlig) continue;
    const obj = objekterILag(master, lag.id).filter(
      (o) => o.synlig && o.operasjon === 'legg-til' && o.kilde.type !== 'form',
    );
    // only worth a rule when something in the group varies from sign to sign
    if (obj.length < 2 || !obj.some((o) => feltNavn(o))) continue;
    const med = obj.map((o) => ({ o, b: verdensBoks(o) }));
    const kandidat = (akse: 'x' | 'y') => {
      const sortert = [...med].sort((a, b) => (akse === 'x' ? a.b.minX - b.b.minX : b.b.maksY - a.b.maksY));
      const gap = sortert.slice(1).map((m, i) => {
        const f = sortert[i]!.b;
        return akse === 'x' ? m.b.minX - f.maksX : f.minY - m.b.maksY;
      });
      const fra =
        akse === 'x' ? Math.min(...med.map((m) => m.b.minX)) : Math.min(...med.map((m) => m.b.minY));
      const til =
        akse === 'x' ? Math.max(...med.map((m) => m.b.maksX)) : Math.max(...med.map((m) => m.b.maksY));
      return { akse, sortert, gap, senter: (fra + til) / 2, ok: gap.every((g) => g >= MIN_GAP) };
    };
    const x = kandidat('x');
    const y = kandidat('y');
    // side by side or stacked; if both read, the wider gap decides
    const valgt =
      x.ok && y.ok
        ? x.gap.reduce((a, g) => a + g, 0) >= y.gap.reduce((a, g) => a + g, 0)
          ? x
          : y
        : x.ok
          ? x
          : y.ok
            ? y
            : null;
    if (!valgt) continue;
    ut.push({
      lagId: lag.id,
      akse: valgt.akse,
      ider: valgt.sortert.map((m) => m.o.id),
      gap: valgt.gap,
      senter: valgt.senter,
    });
  }
  return ut;
}

/** Lay a group out again with its measured gaps, around its centre. */
function brukGruppeavstand(dok: Dokument, regler: Gruppeavstand[]): Dokument {
  let d = dok;
  for (const r of regler) {
    const obj = r.ider.map((id) => d.objekter[id]).filter((o): o is Objekt => !!o && o.synlig);
    // a hidden member (a decoration left out) takes no room and leaves no gap
    if (obj.length < 2) continue;
    const bokser = obj.map((o) => verdensBoks(o));
    const storrelse = bokser.map((b) => (r.akse === 'x' ? b.maksX - b.minX : b.maksY - b.minY));
    const gap = r.ider.flatMap((id, i) => (i > 0 && d.objekter[id]?.synlig ? [r.gap[i - 1]!] : []));
    const total = storrelse.reduce((a, v) => a + v, 0) + gap.reduce((a, v) => a + v, 0);
    let pos = r.akse === 'x' ? r.senter - total / 2 : r.senter + total / 2;
    const flytt = new Map<string, number>();
    obj.forEach((o, i) => {
      const b = bokser[i]!;
      if (r.akse === 'x') {
        flytt.set(o.id, pos - b.minX);
        pos += storrelse[i]! + (gap[i] ?? 0);
      } else {
        flytt.set(o.id, pos - b.maksY);
        pos -= storrelse[i]! + (gap[i] ?? 0);
      }
    });
    d = oppdaterObjekter(d, [...flytt.keys()], (o) => {
      const v = flytt.get(o.id)!;
      return Math.abs(v) < 1e-9
        ? o
        : { ...o, transform: { ...o.transform, [r.akse]: o.transform[r.akse] + v } };
    });
  }
  return d;
}

export interface Varianttilvalg {
  /** Keep the master's gaps inside text groups. Default on. */
  gruppeavstand?: boolean;
  /** The user's own gallery vectors (default: those stored in this browser). */
  egneDekor?: EgetDekor[];
}

/** Build one variant per row. Fonts must be loaded (lastFonter) first. */
export function lagVarianter(
  master: Dokument,
  csv: Csv,
  kobling: Kolonnemal[],
  tilvalg: Varianttilvalg = {},
): Variant[] {
  const feltMaster = feltObjekter(master);
  const grense = feltGrense(master);
  const regler = tilvalg.gruppeavstand === false ? [] : gruppeavstander(master);
  const egne = tilvalg.egneDekor ?? hentEgneDekor();
  return csv.rader.map((rad, indeks) => {
    let dok = master;
    const problemer: string[] = [];
    kobling.forEach((k, i) => {
      const verdi = rad[i] ?? '';
      if (k.type === 'felt') {
        const treff = feltMaster.filter((o) => feltNavn(o) === k.felt);
        const tekster = treff.filter((o) => o.kilde.type === 'tekst').map((o) => o.id);
        const dekor = treff.filter((o) => o.kilde.type === 'svg');
        if (tekster.length) {
          dok = oppdaterObjekter(dok, tekster, (o) => ({
            ...o,
            kilde: { ...(o.kilde as TekstKilde), tekst: verdi },
          }));
          if (!verdi.trim()) problemer.push(`«${k.felt}» er tom`);
        }
        if (dekor.length) {
          // a decoration variable: the cell names a gallery element, empty or «ingen» leaves it off
          const valg = erIngenDekor(verdi) ? null : finnDekorFraTekst(verdi, egne);
          if (!valg && !erIngenDekor(verdi)) problemer.push(`ukjent dekor «${verdi}» i «${k.felt}»`);
          dok = oppdaterObjekter(
            dok,
            dekor.map((o) => o.id),
            (o) => {
              if (!valg) return { ...o, synlig: false };
              // the new element keeps the size the old one had on the sign
              const gammel = objektStorrelse(o);
              const ny = valg.lag();
              const s = Math.max(gammel.bredde, gammel.hoyde) / Math.max(ny.bredde, ny.hoyde);
              return {
                ...o,
                synlig: true,
                kilde: { ...ny.kilde, felt: feltNavn(o) },
                transform: { ...o.transform, skalaX: s, skalaY: s },
              };
            },
          );
        }
      } else if (k.type === 'farge') {
        const m = finnFarge(verdi);
        const plass = fargeplasser(dok).find((p) => p.id === k.lagId);
        if (!m) problemer.push(`ukjent farge «${verdi}»${plass ? ` for ${plass.navn}` : ''}`);
        else dok = settFarge(dok, k.lagId, m);
      }
    });
    if (regler.length) dok = brukGruppeavstand(dok, regler);
    for (const o of feltObjekter(dok)) {
      if (o.kilde.type !== 'tekst') continue;
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
        problemer.push(`«${o.kilde.tekst.slice(0, 24)}» er for lang for skiltet`);
      }
    }
    // the footprint on the plate: what is printed, outlines and eyes too, not just the objects
    let boks = fotavtrykkBoks(dok) ?? tomBoks();
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
