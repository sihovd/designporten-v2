/**
 * CSV batch (spec: Signgen "Batch (CSV)"): a master sign with text fields,
 * a CSV whose columns map to fields (and optionally to layer colours),
 * one variant per row, overflow checks, grouping and sorting, and
 * distribution of the variants across build plates.
 *
 * Pure functions; the dialog in Batch.tsx drives them.
 */
import type { Dokument, TekstKilde } from '../../core/dokument';
import { finnMateriale, materialer } from '../../core/materialer';
import { erTom, slaSammen, tomBoks, type Boks } from '../../core/geometri2d';
import {
  fargeplasser,
  feltNavn,
  feltObjekter,
  oppdaterObjekter,
  palett,
  settFarge,
  synkFilamenter,
} from './dokument';
import {
  FERDIGE_PROFILER,
  hentEgneProfiler,
  narmesteFarge,
  rensFarger,
  type Fargeprofil,
} from './fargeprofiler';
import { brukOverstyringer, type Overstyringer } from './overstyring';
import {
  brukGruppeavstand,
  brukLayout,
  gruppeavstander,
  layoutProblemer,
  layoutregler,
  tekstUtenforKropp,
} from './csvlayout';
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

/**
 * What a CSV column controls: a text field, a colour (layer or outline id),
 * the sign's colour profile by name, or nothing.
 */
export type Kolonnemal =
  { type: 'felt'; felt: string } | { type: 'farge'; lagId: string } | { type: 'profil' } | { type: 'ingen' };

/** Does a column name say the cell is a colour profile («Fargeprofil», «Profil», «Palett»)? */
export function erProfilkolonne(navn: string): boolean {
  return /^(farge)?\s*(profil|palett)(en)?$/i.test(navn.trim());
}

/** All colour profiles a CSV cell can name: the ready-made ones and the user's own. */
export function alleProfiler(): Fargeprofil[] {
  return [...FERDIGE_PROFILER, ...hentEgneProfiler()];
}

/** A colour profile from a CSV cell: by name or id, ignoring case. */
export function finnProfil(
  verdi: string,
  profiler: readonly Fargeprofil[] = alleProfiler(),
): Fargeprofil | null {
  const v = verdi.trim().toLowerCase();
  if (!v) return null;
  return (
    profiler.find((p) => p.navn.trim().toLowerCase() === v) ??
    profiler.find((p) => p.id.toLowerCase() === v) ??
    null
  );
}

/**
 * Dress a sign in a colour profile: the colours of the sign's own palette
 * are swapped for the profile's colours in the same order (the first colour
 * for the first, and so on). A colour with no counterpart gets the closest
 * colour in the profile. `grunnpalett` is the palette of the master.
 */
export function brukFargeprofil(
  dok: Dokument,
  grunnpalett: readonly string[],
  profil: Fargeprofil,
): Dokument {
  const ny = rensFarger(profil.farger);
  if (!ny.length) return dok;
  const bytt = (id: string) => {
    const i = grunnpalett.indexOf(id);
    if (i >= 0 && ny[i]) return ny[i]!;
    return ny.includes(id) ? id : narmesteFarge(id, ny);
  };
  const lag = dok.lag.map((l) => ({
    ...l,
    materialId: bytt(l.materialId),
    ...(l.omriss ? { omriss: l.omriss.map((o) => ({ ...o, materialId: bytt(o.materialId) })) } : {}),
  }));
  const objekter = Object.fromEntries(
    Object.entries(dok.objekter).map(([id, o]) => [
      id,
      o.materialId ? { ...o, materialId: bytt(o.materialId) } : o,
    ]),
  );
  return synkFilamenter({ ...dok, lag, objekter, parametre: { ...dok.parametre, farger: ny } });
}

export function foreslaKobling(csv: Csv, dok: Dokument): Kolonnemal[] {
  const felt = feltObjekter(dok).map((o) => feltNavn(o)!);
  return csv.kolonner.map((k) => {
    const n = k.trim().toLowerCase();
    if (erProfilkolonne(k)) return { type: 'profil' };
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

/** Material id from a CSV value: an id, a colour code (#rrggbb) or a colour name (case-insensitive). */
export function finnFarge(verdi: string): string | null {
  const v = verdi.trim().toLowerCase();
  if (!v) return null;
  const m =
    materialer.find((x) => x.id === v) ??
    materialer.find((x) => x.hex.toLowerCase() === v) ??
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
  /** The overrides that were applied to this sign (`mal:id:egenskap`). */
  overstyrt?: string[];
  /** Footprint (mm) of the whole variant. */
  boks: Boks;
}

// ---------- layout rules (csvlayout.ts) ----------

export {
  gruppeavstander,
  hullanker,
  folgerNavnet,
  navneboks,
  settHullavstand,
  type Gruppeavstand,
  type Hullanker,
  type Hullside,
} from './csvlayout';

export interface Varianttilvalg {
  /** Keep the master's gaps inside text groups. Default on. */
  gruppeavstand?: boolean;
  /** Keep hanging holes, decorations and other free objects at their distance from the name. Default on. */
  hullavstand?: boolean;
  /** Let a plate round the name (a rectangle or an ellipse) grow and shrink with the content. Default on. */
  tilpassSkilt?: boolean;
  /** The user's own gallery vectors (default: those stored in this browser). */
  egneDekor?: EgetDekor[];
  /** The colour profiles a CSV cell can name (default: ready-made and the user's own). */
  profiler?: Fargeprofil[];
  /** Overrides per row index, laid over the master and the row (Sivert, 2026-10-06, §30). */
  overstyringer?: Record<number, Overstyringer>;
  /** Build only these rows (by index); the others are left out of the result. */
  rader?: readonly number[];
}

/** Build one variant per row. Fonts must be loaded (lastFonter) first. */
export function lagVarianter(
  master: Dokument,
  csv: Csv,
  kobling: Kolonnemal[],
  tilvalg: Varianttilvalg = {},
): Variant[] {
  const feltMaster = feltObjekter(master);
  const regler = tilvalg.gruppeavstand === false ? [] : gruppeavstander(master);
  const fullt = layoutregler(master, tilvalg.tilpassSkilt !== false);
  const layout = tilvalg.hullavstand === false ? { ...fullt, ankre: [], kropper: [] } : fullt;
  const egne = tilvalg.egneDekor ?? hentEgneDekor();
  const profiler = tilvalg.profiler ?? alleProfiler();
  const grunnpalett = palett(master);
  const utvalg = tilvalg.rader ? new Set(tilvalg.rader) : null;
  const bygde: Variant[] = [];
  csv.rader.forEach((rad, indeks) => {
    if (utvalg && !utvalg.has(indeks)) return;
    let dok = master;
    const problemer: string[] = [];
    // the colour profile first, so a colour column for one layer can still override it
    kobling.forEach((k, i) => {
      if (k.type !== 'profil') return;
      const verdi = rad[i] ?? '';
      if (!verdi.trim()) return;
      const p = finnProfil(verdi, profiler);
      if (!p) problemer.push(`ukjent fargeprofil «${verdi}»`);
      else dok = brukFargeprofil(dok, grunnpalett, p);
    });
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
    dok = brukLayout(dok, layout);
    const lokale = tilvalg.overstyringer?.[indeks];
    if (lokale) dok = brukOverstyringer(dok, lokale);
    for (const o of feltObjekter(dok)) {
      if (o.kilde.type !== 'tekst') continue;
      const g = lokalGeometri(o.kilde);
      if (g?.mangler.length) problemer.push(`fonten mangler ${g.mangler.map((c) => `«${c}»`).join(', ')}`);
    }
    problemer.push(...tekstUtenforKropp(dok, layout), ...layoutProblemer(master, dok, layout));
    // the footprint on the plate: what is printed, outlines and eyes too, not just the objects
    let boks = fotavtrykkBoks(dok) ?? tomBoks();
    for (const o of Object.values(dok.objekter)) if (o.synlig) boks = slaSammen(boks, verdensBoks(o));
    bygde.push({
      indeks,
      verdier: rad,
      dok: { ...dok, navn: `${master.navn} ${indeks + 1}` },
      farger: fargeplasser(dok)
        .map((p) => p.materialId)
        .join('+'),
      problemer: [...new Set(problemer)],
      ...(lokale && Object.keys(lokale).length ? { overstyrt: Object.keys(lokale) } : {}),
      boks: erTom(boks) ? { minX: 0, minY: 0, maksX: 0, maksY: 0 } : boks,
    });
  });
  return bygde;
}

// ---------- organisation ----------

export type Sortering = 'csv' | 'alfabet';
export type Gruppering = 'ingen' | 'farger';

/**
 * The filaments a sign needs, as ids, each once and sorted: the actual
 * filaments, not how alike the colours look and not the order the layers
 * happen to use them in (Sivert, 2026-10-06, §33).
 */
export function filamentkombinasjon(v: Pick<Variant, 'farger'>): string[] {
  return [...new Set(v.farger.split('+').filter(Boolean))].sort();
}

/** The filament ids in the order they should go in the printer: its AMS slots when set, else by id. */
export function amsRekkefolge(ider: readonly string[]): string[] {
  return [...ider].sort((x, y) => {
    const a = finnMateriale(x).amsPlass ?? Infinity;
    const b = finnMateriale(y).amsPlass ?? Infinity;
    return a === b ? x.localeCompare(y) : a - b;
  });
}

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
  for (const x of liste) {
    const nokkel = filamentkombinasjon(x).join('+');
    grupper.set(nokkel, [...(grupper.get(nokkel) ?? []), x]);
  }
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
  /** The filaments the signs on the plate need, in printer order (production plates). */
  kombinasjon?: string[];
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
  const linjer = [
    ['fil', 'plate', 'rad', 'farger', 'filamenter', 'overstyringer', ...kolonner].map(esc).join(';'),
  ];
  for (const p of plater) {
    for (const pl of p.plasseringer) {
      const farger = pl.variant.farger
        .split('+')
        .map((id) => materialer.find((m) => m.id === id)?.navn ?? id)
        .join(' + ');
      linjer.push(
        [
          filnavn(p, pl),
          String(p.nummer),
          String(pl.variant.indeks + 1),
          farger,
          filamentkombinasjon(pl.variant).join(' + '),
          String(pl.variant.overstyrt?.length ?? 0),
          ...pl.variant.verdier,
        ]
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
      else {
        const rekkefolge = amsRekkefolge(filamentkombinasjon(pl.variant));
        filer[variantFil(pl)] = tilTremfSamlinger([{ navn, deler }], {
          tittel: navn,
          filamentrekkefolge: rekkefolge,
          meta: { Filamenter: rekkefolge.join(', ') },
        });
      }
      fremdrift?.(++ferdig, totalt);
      // let the browser paint progress between signs
      await new Promise((r) => setTimeout(r, 0));
    }
    if (utdeling === 'plate') {
      const rekkefolge = amsRekkefolge(
        p.kombinasjon ?? [...new Set(p.plasseringer.flatMap((pl) => filamentkombinasjon(pl.variant)))],
      );
      filer[`${base}-plate-${to(p.nummer)}.3mf`] = tilTremfSamlinger(samlinger, {
        tittel: `${prosjekt}, plate ${p.nummer}`,
        filamentrekkefolge: rekkefolge,
        meta: { Filamenter: rekkefolge.join(', ') },
      });
    }
  }
  const navnFor = (p: Byggeplate, pl: Plassering) =>
    utdeling === 'plate' ? `${base}-plate-${to(p.nummer)}.3mf` : variantFil(pl);
  filer['manifest.csv'] = strToU8(`\uFEFF${manifest(plater, kolonner, navnFor)}`);
  return { zip: zipSync(filer, { level: 6 }), filer: Object.keys(filer), feil };
}
