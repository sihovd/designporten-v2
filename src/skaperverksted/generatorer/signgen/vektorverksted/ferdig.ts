/**
 * Finalize in Vectorim (Sivert approved the Finalize list, 2026-11-11): size
 * in millimetres, a warning for parts too thin to cut, a contour (offset
 * outline) around the motif, and export as DXF and PNG beside SVG.
 *
 * Geometry here is in millimetres: the vector is scaled by `mmPerEnhet`
 * first, so the clipper tolerances (0.01 mm) mean the same at every size.
 */
import { areal, forskyv, regionFraRinger, ringerI, type Region, type Ring } from '../../../geometri/polygon';
import { stiTilRinger } from '../../../geometri/stidata';
import { delSti, type Del, type Vektormodell } from './modell';

/** A part as a region in mm. */
export function delRegion(m: Vektormodell, d: Del, mmPerEnhet: number): Region {
  const ringer = stiTilRinger(delSti(m, d), 0.02 / mmPerEnhet).map((r) =>
    r.map((p) => ({ x: p.x * mmPerEnhet, y: p.y * mmPerEnhet })),
  );
  return regionFraRinger(ringer, 'evenodd');
}

const synligeDeler = (m: Vektormodell, skjulte?: Set<string>) =>
  m.deler.filter((d): d is Del => !!d && !skjulte?.has(d.farge));

export interface TynnDel {
  id: number;
  /** Share of the part's area that is narrower than the limit (0–1). */
  andel: number;
}

/**
 * Parts with places narrower than `minBredde` mm: shrinking by half the
 * width and growing back (an opening) loses those places, so the share of
 * area lost says how much of the part is too thin. Tiny losses at sharp
 * corners are ignored.
 */
export function tynneDeler(
  m: Vektormodell,
  mmPerEnhet: number,
  minBredde: number,
  skjulte?: Set<string>,
): TynnDel[] {
  if (minBredde <= 0) return [];
  const ut: TynnDel[] = [];
  for (const d of synligeDeler(m, skjulte)) {
    const r = delRegion(m, d, mmPerEnhet);
    const a = areal(r);
    if (a <= 0) continue;
    const apnet = forskyv(forskyv(r, -minBredde / 2), minBredde / 2);
    const andel = Math.max(0, (a - areal(apnet)) / a);
    // a round opening also trims sharp corners a little; that is not «too thin»
    if (andel > 0.03 || !apnet.length) ut.push({ id: d.id, andel: apnet.length ? andel : 1 });
  }
  return ut.sort((x, y) => y.andel - x.andel);
}

/**
 * The outline of all visible parts grown by `avstand` mm (a contour cut, or
 * a backing shape). Holes smaller than the offset close; inner holes are
 * left out when `kunYtre`.
 */
export function kontur(
  m: Vektormodell,
  mmPerEnhet: number,
  avstand: number,
  kunYtre = true,
  skjulte?: Set<string>,
): Region {
  const alle = regionFraRinger(synligeDeler(m, skjulte).flatMap((d) => ringerI(delRegion(m, d, mmPerEnhet))));
  const ut = forskyv(alle, avstand);
  return kunYtre ? ut.map((f) => ({ ytre: f.ytre, hull: [] })) : ut;
}

const tall = (v: number) => +v.toFixed(3);

/** Rings as path data, scaled from mm back to vector units by `skala`. */
export function ringerTilSti(ringer: Ring[], skala = 1): string {
  return ringer
    .filter((r) => r.length >= 3)
    .map((r) => `M${r.map((p) => `${tall(p.x * skala)} ${tall(p.y * skala)}`).join('L')}Z`)
    .join('');
}

/** DXF layer names: letters, digits, - and _ only. */
const lagnavn = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'Lag';

/**
 * The vector as DXF (R12, closed polylines in mm, one layer per colour, and
 * the contour on its own layer). Y is turned so the drawing stands the right
 * way up in CAD and cutter software.
 */
export function tilDxf(
  m: Vektormodell,
  mmPerEnhet: number,
  opt: {
    rekkefolge?: string[];
    skjulte?: Set<string>;
    navn?: Record<string, string | undefined>;
    kontur?: Region;
  } = {},
): string {
  const hoydeMm = m.hoyde * mmPerEnhet;
  const linjer: string[] = [];
  const kode = (k: number, v: string | number) => linjer.push(String(k), String(v));
  const polylinje = (lag: string, r: Ring) => {
    kode(0, 'POLYLINE');
    kode(8, lag);
    kode(66, 1);
    kode(70, 1);
    for (const p of r) {
      kode(0, 'VERTEX');
      kode(8, lag);
      kode(10, tall(p.x));
      kode(20, tall(hoydeMm - p.y));
    }
    kode(0, 'SEQEND');
    kode(8, lag);
  };
  const rang = (f: string) => {
    const i = opt.rekkefolge?.indexOf(f) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const deler = synligeDeler(m, opt.skjulte).sort((a, b) => rang(a.farge) - rang(b.farge));
  const navnFor = new Map<string, string>();
  const brukt = new Set<string>();
  for (const d of deler) {
    if (navnFor.has(d.farge)) continue;
    let n = lagnavn(opt.navn?.[d.farge] || `Farge_${d.farge.slice(1)}`);
    while (brukt.has(n)) n += '_';
    brukt.add(n);
    navnFor.set(d.farge, n);
  }
  kode(0, 'SECTION');
  kode(2, 'HEADER');
  kode(9, '$INSUNITS');
  kode(70, 4); // millimetres
  kode(0, 'ENDSEC');
  kode(0, 'SECTION');
  kode(2, 'ENTITIES');
  for (const d of deler)
    for (const r of ringerI(delRegion(m, d, mmPerEnhet))) polylinje(navnFor.get(d.farge)!, r);
  if (opt.kontur) for (const r of ringerI(opt.kontur)) polylinje('Kontur', r);
  kode(0, 'ENDSEC');
  kode(0, 'EOF');
  return linjer.join('\n') + '\n';
}
