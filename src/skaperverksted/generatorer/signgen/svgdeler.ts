/**
 * The parts of an imported SVG (Sivert, 2026-10-05): a sheet of icons is a
 * handful of separate shapes, and a picture of a horse can have a mane in
 * another colour. Each shape is a part the user can keep or leave out
 * (masking), and each kept part gets a filament colour. Kept parts of one
 * colour become one vector; different colours become separate vectors that
 * lie side by side at the same height.
 *
 * Pure geometry (no DOM), so it can be tested.
 */
import type { SvgKilde } from '../../core/dokument';
import type { Boks } from '../../core/geometri2d';
import {
  differanse,
  regionBoks,
  ringAreal,
  unionAlle,
  type Flate,
  type Region,
  type Ring,
} from '../../geometri/polygon';
import { kildeFraRegion } from './svgkilde';

/** Over this many parts the SVG is imported as one piece. */
export const MAKS_DELER = 300;

export interface SvgDel {
  id: number;
  navn: string;
  /** The part: its outer rings and holes, in mm, y up, in the file's own place. */
  region: Region;
  boks: Boks;
  /** Order of the shape in the file; a later one is painted over an earlier one. */
  rekkefolge: number;
  /** The fill the file gave it, as «#rrggbb». */
  fyll: string | null;
}

export interface SvgDeler {
  filnavn: string;
  deler: SvgDel[];
  boks: Boks;
  hoppetOver: string[];
  /** Something to tell the user about how the file was split. */
  merknad?: string;
}

function punktIRing(p: { x: number; y: number }, r: Ring): boolean {
  let inne = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!,
      b = r[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inne = !inne;
  }
  return inne;
}

/**
 * Split a region into its islands. An island that lies in a hole of another
 * (the disc in the middle of a flower, the pentagons in a ball) stays with
 * the shape around it.
 */
export function delOppIOyer(region: Region): Region[] {
  if (region.length <= 1) return region.length ? [region] : [];
  const areal = region.map((f) => Math.abs(ringAreal(f.ytre)));
  const eier = region.map((f, i) => {
    const p = f.ytre[0]!;
    let beste = -1;
    for (let j = 0; j < region.length; j++) {
      if (j === i || areal[j]! <= areal[i]!) continue;
      if (region[j]!.hull.some((h) => punktIRing(p, h)) && (beste < 0 || areal[j]! > areal[beste]!)) {
        beste = j;
      }
    }
    return beste < 0 ? i : beste;
  });
  const grupper = new Map<number, Flate[]>();
  region.forEach((f, i) => {
    const rot = eier[i]!;
    grupper.set(rot, [...(grupper.get(rot) ?? []), f]);
  });
  return [...grupper.values()];
}

const NAVNGITTE: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  gray: '#808080',
  grey: '#808080',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gold: '#ffd700',
  silver: '#c0c0c0',
  navy: '#000080',
  teal: '#008080',
};

/** A CSS colour as «#rrggbb», or null when it is not a plain colour. */
export function tolkFarge(verdi: string | null | undefined): string | null {
  const v = (verdi ?? '').trim().toLowerCase();
  if (!v) return null;
  if (NAVNGITTE[v]) return NAVNGITTE[v]!;
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return `#${[...m[1]!].map((c) => c + c).join('')}`;
  m = v.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) return `#${m[1]}`;
  m = v.match(/^rgb\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*\)$/);
  if (m) {
    const h = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, '0');
    return `#${h(m[1]!)}${h(m[2]!)}${h(m[3]!)}`;
  }
  return null;
}

/**
 * The parts of a file: one or more per shape. `elementer` are the shapes in
 * the order they are painted, each already resolved with its own fill rule.
 */
export function lagDeler(
  filnavn: string,
  elementer: { region: Region; fyll: string | null }[],
  hoppetOver: string[],
): SvgDeler {
  const deler: SvgDel[] = [];
  elementer.forEach((e, rekkefolge) => {
    for (const region of delOppIOyer(e.region)) {
      deler.push({
        id: deler.length,
        navn: `Del ${deler.length + 1}`,
        region,
        boks: regionBoks(region),
        rekkefolge,
        fyll: e.fyll,
      });
    }
  });
  const boksAlle = (d: SvgDel[]): Boks =>
    d.reduce<Boks>(
      (b, x) => ({
        minX: Math.min(b.minX, x.boks.minX),
        minY: Math.min(b.minY, x.boks.minY),
        maksX: Math.max(b.maksX, x.boks.maksX),
        maksY: Math.max(b.maksY, x.boks.maksY),
      }),
      { minX: Infinity, minY: Infinity, maksX: -Infinity, maksY: -Infinity },
    );
  if (deler.length > MAKS_DELER) {
    // too many to pick one by one: keep each shape whole
    const hele: SvgDel[] = elementer
      .map((e, rekkefolge) => ({ e, rekkefolge }))
      .filter(({ e }) => e.region.length)
      .map(({ e, rekkefolge }, id) => ({
        id,
        navn: `Del ${id + 1}`,
        region: e.region,
        boks: regionBoks(e.region),
        rekkefolge,
        fyll: e.fyll,
      }));
    return {
      filnavn,
      deler: hele,
      boks: boksAlle(hele),
      hoppetOver,
      merknad: `SVG-en har over ${MAKS_DELER} deler, så hver form i filen er tatt som én del.`,
    };
  }
  return { filnavn, deler, boks: boksAlle(deler), hoppetOver };
}

// ---------- colours ----------

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

function avstand(a: string, b: string): number {
  const x = rgb(a),
    y = rgb(b);
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
}

/**
 * A start colour for each part. A file with one fill gets the first colour;
 * a file with several gets, for each fill in turn, the closest filament not
 * yet used (so the colours stay apart as long as the profile has enough).
 * Returns one filament id per part.
 */
export function fordelFarger(fyll: (string | null)[], palett: { id: string; hex: string }[]): string[] {
  if (!palett.length) return fyll.map(() => '');
  const ulike = [...new Set(fyll.filter((f): f is string => !!f))];
  if (ulike.length < 2) return fyll.map(() => palett[0]!.id);
  const brukt = new Set<string>();
  const valg = new Map<string, string>();
  for (const f of ulike) {
    const ledige = palett.filter((p) => !brukt.has(p.id));
    const fra = ledige.length ? ledige : palett;
    const p = fra.reduce((b, x) => (avstand(x.hex, f) < avstand(b.hex, f) ? x : b));
    brukt.add(p.id);
    valg.set(f, p.id);
  }
  return fyll.map((f) => (f ? valg.get(f)! : palett[0]!.id));
}

// ---------- building the result ----------

export interface Fargegruppe {
  /** Filament id. */
  farge: string;
  kilde: SvgKilde;
  bredde: number;
  hoyde: number;
  /** Where the group's centre lies relative to the whole picture's centre (mm). */
  dx: number;
  dy: number;
  /** The group in the file's own place (not stored). */
  region?: Region;
}

/** A picture in one or more colours, ready to put on a sign. */
export interface Flerfarget {
  navn: string;
  bredde: number;
  hoyde: number;
  grupper: Fargegruppe[];
}

const overlapper = (a: Boks, b: Boks) =>
  a.minX <= b.maksX && b.minX <= a.maksX && a.minY <= b.maksY && b.minY <= a.maksY;

/**
 * The kept parts as one group per colour. Where parts of different colours
 * lie on top of each other, the one painted later wins, so each point of the
 * picture is printed in exactly one colour.
 */
export function byggFlerfarget(
  navn: string,
  deler: SvgDel[],
  farge: (id: number) => string | null,
  filnavn: string,
): Flerfarget | null {
  const med = deler
    .map((d) => ({ d, farge: farge(d.id) }))
    .filter((x): x is { d: SvgDel; farge: string } => !!x.farge);
  if (!med.length) return null;
  const grupper = new Map<string, { forst: number; regioner: Region[] }>();
  for (const { d, farge: f } of med) {
    const over = med.filter(
      (q) => q.farge !== f && q.d.rekkefolge > d.rekkefolge && overlapper(q.d.boks, d.boks),
    );
    const region = over.length ? differanse(d.region, unionAlle(over.map((q) => q.d.region))) : d.region;
    if (!region.length) continue;
    const g = grupper.get(f) ?? { forst: d.rekkefolge, regioner: [] };
    g.forst = Math.min(g.forst, d.rekkefolge);
    g.regioner.push(region);
    grupper.set(f, g);
  }
  const alle = unionAlle(med.map((x) => x.d.region));
  if (!alle.length) return null;
  const b = regionBoks(alle);
  const cx = (b.minX + b.maksX) / 2,
    cy = (b.minY + b.maksY) / 2;
  const ut: Fargegruppe[] = [];
  for (const [f, g] of [...grupper.entries()].sort((a, c) => a[1].forst - c[1].forst)) {
    const region = unionAlle(g.regioner);
    const r = kildeFraRegion(region, filnavn);
    if (!r) continue;
    ut.push({
      farge: f,
      kilde: r.kilde,
      bredde: r.bredde,
      hoyde: r.hoyde,
      dx: r.senter.x - cx,
      dy: r.senter.y - cy,
      region,
    });
  }
  if (!ut.length) return null;
  return { navn, bredde: b.maksX - b.minX, hoyde: b.maksY - b.minY, grupper: ut };
}

/** The picture as an SVG file: one path per colour, with the colours given. */
export function svgFil(ff: Flerfarget, hex: (farge: string) => string): string {
  const grupper = ff.grupper.filter((g) => g.region);
  const alle = unionAlle(grupper.map((g) => g.region!));
  const b = regionBoks(alle);
  const t = (n: number) => String(Math.round(n * 1000) / 1000);
  const sti = (region: Region) =>
    region
      .flatMap((f) => [f.ytre, ...f.hull])
      .map((r) => `M${r.map((p) => `${t(p.x - b.minX)} ${t(b.maksY - p.y)}`).join('L')}Z`)
      .join('');
  const w = t(b.maksX - b.minX),
    h = t(b.maksY - b.minY);
  const paths = grupper
    .map((g) => `<path fill="${hex(g.farge)}" fill-rule="evenodd" d="${sti(g.region!)}"/>`)
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n  ${paths}\n</svg>\n`;
}
