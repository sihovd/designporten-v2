/**
 * Fewer colour changes (Sivert, 2026-11-16): «Jeg trenger at fargene ikke overlapper når det ikke er
 * nødvendig.»
 *
 * As drawn, every layer and outline is a full body from its own bottom to its own top. An outline
 * ring, the dark ring inside it and the text all start on the plate, so every print layer near the
 * bottom holds three or four colours and the printer swaps filament several times per layer.
 *
 * Here the printed volume stays exactly the same; only the colour of material nobody can see is
 * changed. The model is cut into height bands at every top and bottom. In each band a straight
 * slab keeps its own colour only where it can be seen:
 * - within `VEGG` of the band's outer edge (the side wall, holes included), and
 * - in the top skin where nothing lies on top of it: `TOPPHUD` deep, but never below the next
 *   lower top in the sign (that colour shows there anyway), and at least two print layers.
 * Everything else in the band is hidden. When its colour does not show anywhere in the band, it gets
 * the band's fill colour instead: preferably the colour the band already prints, so the band adds no
 * swap of its own. A colour that shows in the band anyway keeps its hidden part, since moving it
 * saves nothing.
 *
 * Slabs with a side profile (rounded or bevelled tops) keep their own mesh and colour; they only
 * take up room. Holes and cut-out text are already missing from the regions, so they stay holes.
 */
import { areal, differanse, forskyv, snitt, unionAlle, type Region } from '../../geometri/polygon';
import { ekstruderStabel } from '../../geometri/ekstruder';
import { avgrensning, slaSammenMesh, type Mesh, type ModellDel } from '../../geometri/mesh';

/** How deep the side wall keeps its colour (mm): about two perimeters. */
export const VEGG = 0.8;
/** How thick the top skin keeps its colour (mm), so the colour below does not shine through. */
export const TOPPHUD = 0.6;
/** Visible bits smaller than this (mm²) are slivers from the boolean operations, not colour. */
const SMULE = 0.05;
const EPS = 1e-4;
/** Gaps narrower than twice this (mm) are closed before finding the outer edge. */
const GLIPE = 0.05;

export interface Fargeskive {
  /** The part this slab came from (id, lagId and name are kept for the first piece). */
  del: ModellDel;
  region: Region;
  zBunn: number;
  hoyde: number;
  materialId: string;
  /** False for slabs with a side profile: they keep their own mesh and colour. */
  rett: boolean;
}

interface Band {
  z0: number;
  z1: number;
}

const rund = (z: number) => Math.round(z * 1e4) / 1e4;

/** Where each slab's top skin starts. */
function hudBunner(skiver: Fargeskive[], lagHoyde: number): number[] {
  const topper = [...new Set(skiver.map((s) => rund(s.zBunn + s.hoyde)))].sort((a, b) => a - b);
  return skiver.map((s) => {
    const topp = s.zBunn + s.hoyde;
    const lavere = topper.filter((t) => t < rund(topp) - EPS).at(-1) ?? 0;
    const dybde = Math.max(Math.min(TOPPHUD, topp - lavere), 2 * lagHoyde);
    return Math.max(s.zBunn, rund(topp - dybde));
  });
}

function grenser(skiver: Fargeskive[], hud: number[]): number[] {
  const z = new Set<number>();
  for (const [i, s] of skiver.entries()) {
    z.add(rund(s.zBunn));
    z.add(rund(s.zBunn + s.hoyde));
    if (s.rett) z.add(hud[i]!);
  }
  return [...z].sort((a, b) => a - b);
}

const iBand = (s: Fargeskive, b: Band) => s.zBunn <= b.z0 + EPS && s.zBunn + s.hoyde >= b.z1 - EPS;
const vedHoyde = (s: Fargeskive, z: number) => s.zBunn <= z + EPS && s.zBunn + s.hoyde > z + EPS;

/** Which material each print layer holds, bottom to top. */
export function fargerPerLag(
  skiver: { zBunn: number; hoyde: number; materialId: string }[],
  lagHoyde: number,
): string[][] {
  const topp = skiver.reduce((h, s) => Math.max(h, s.zBunn + s.hoyde), 0);
  const steg = Math.max(0.04, lagHoyde);
  const ut: string[][] = [];
  for (let z = steg / 2; z < topp; z += steg) {
    const her = new Set<string>();
    for (const s of skiver) if (s.hoyde > 0 && s.zBunn <= z && s.zBunn + s.hoyde > z) her.add(s.materialId);
    ut.push([...her]);
  }
  return ut;
}

/** Estimated filament changes for finished parts: each part is solid from its lowest to its highest point. */
export function fargeskiftForDeler(deler: ModellDel[], lagHoyde: number): number {
  const skiver = deler
    .filter((d) => d.mesh.indekser.length)
    .map((d) => {
      const b = avgrensning(d.mesh);
      return { zBunn: b.min[2], hoyde: b.maks[2] - b.min[2], materialId: d.materialId };
    });
  return tellFargeskift(fargerPerLag(skiver, lagHoyde));
}

/**
 * Filament changes needed for a stack of print layers, counted the way a slicer orders them: a
 * layer starts with the colour the last one ended with when it can, and ends with one the next
 * layer needs. The first colour loaded is not a change.
 */
export function tellFargeskift(lag: string[][]): number {
  let skift = 0;
  let sist: string | null = null;
  for (let i = 0; i < lag.length; i++) {
    const her = lag[i]!;
    if (!her.length) continue;
    const neste = lag.slice(i + 1).find((l) => l.length) ?? [];
    const start: string = sist !== null && her.includes(sist) ? sist : her[0]!;
    if (sist !== null && start !== sist) skift++;
    skift += her.length - 1;
    // end with a colour the next layer also needs, other than the one we started with
    const slutt: string =
      her.length === 1
        ? start
        : (her.find((c) => c !== start && neste.includes(c)) ?? her.find((c) => c !== start)!);
    sist = slutt;
  }
  return skift;
}

export interface Fargeplan {
  deler: ModellDel[];
}

/**
 * Recolour hidden material so the print needs as few filament changes as possible. Returns the
 * new parts in the same order as the slabs; slabs that do not change keep their part as it was.
 */
export function faerreFargeskift(skiver: Fargeskive[], lagHoyde: number): Fargeplan {
  const hud = hudBunner(skiver, lagHoyde);
  const z = grenser(skiver, hud);
  const band: Band[] = [];
  for (let i = 0; i + 1 < z.length; i++) band.push({ z0: z[i]!, z1: z[i + 1]! });

  // the part of each straight slab whose top is open: nothing lies on it right above
  const aapenTopp = skiver.map((s) => {
    if (!s.rett) return [] as Region;
    const topp = s.zBunn + s.hoyde;
    const over = skiver.filter((o) => o !== s && vedHoyde(o, topp)).map((o) => o.region);
    return over.length ? differanse(s.region, unionAlle(over)) : s.region;
  });

  // per slab: per band, the region of each colour it prints
  const stykker = skiver.map(() => new Map<string, (Region | null)[]>());
  const legg = (i: number, farge: string, b: number, r: Region) => {
    let rad = stykker[i]!.get(farge);
    if (!rad) stykker[i]!.set(farge, (rad = band.map(() => null)));
    rad[b] = rad[b] ? unionAlle([rad[b]!, r]) : r;
  };

  let forrigeFyll: string | null = null;
  for (const [bi, b] of band.entries()) {
    const her = skiver.map((s, i) => ({ s, i })).filter(({ s }) => iBand(s, b) && s.region.length);
    if (!her.length) continue;
    const alt = unionAlle(her.map(({ s }) => s.region));
    // outlines keep a hidden 0.01 mm gap to what they surround; that gap is not an edge anyone sees
    const vegg = differanse(alt, forskyv(forskyv(alt, GLIPE, 'skarp'), -(GLIPE + VEGG), 'skarp'));

    // later slabs are drawn on top; each spot belongs to one slab only
    let tatt: Region = [];
    const synlig: { i: number; egen: Region; skjult: Region }[] = [];
    const synligAreal = new Map<string, number>();
    for (const { s, i } of [...her].reverse()) {
      const egen = tatt.length ? differanse(s.region, tatt) : s.region;
      tatt = tatt.length ? unionAlle([tatt, s.region]) : s.region;
      if (!egen.length) continue;
      if (!s.rett) continue;
      const iHuden = hud[i]! < b.z1 - EPS;
      const vis = iHuden && aapenTopp[i]!.length ? unionAlle([vegg, aapenTopp[i]!]) : vegg;
      let sett = snitt(egen, vis);
      if (areal(sett) < SMULE) sett = [];
      const skjult = sett.length ? differanse(egen, sett) : egen;
      synlig.push({ i, egen: sett, skjult });
      if (sett.length) synligAreal.set(s.materialId, (synligAreal.get(s.materialId) ?? 0) + areal(sett));
    }
    // profiled slabs show their colour wherever they are
    for (const { s } of her)
      if (!s.rett) synligAreal.set(s.materialId, (synligAreal.get(s.materialId) ?? 0) + 1e9);

    // fill colour: keep the last band's when it still shows here, else the one that shows most
    let fyll: string;
    if (forrigeFyll && (synligAreal.has(forrigeFyll) || !synligAreal.size)) fyll = forrigeFyll;
    else if (synligAreal.size) fyll = [...synligAreal.entries()].sort((a, c) => c[1] - a[1])[0]![0];
    else fyll = her.at(-1)!.s.materialId;
    forrigeFyll = fyll;

    for (const { i, egen, skjult } of synlig) {
      const s = skiver[i]!;
      if (egen.length) legg(i, s.materialId, bi, egen);
      // a colour that shows in this band anyway keeps its hidden part too: moving it saves no change
      const flytt = !synligAreal.has(s.materialId) && areal(skjult) >= SMULE;
      if (skjult.length) legg(i, flytt ? fyll : s.materialId, bi, skjult);
    }
  }

  // one part per layer and colour: a colour that fills hidden room joins that layer's own part of
  // the same colour, so the slicer gets few parts instead of one per slab and band
  const uendret = skiver.map((s, i) => !s.rett || [...stykker[i]!.keys()].every((f) => f === s.materialId));
  const grupper = new Map<string, { lagId: string; farge: string; med: number[] }>();
  const rekke: string[] = [];
  for (const [i, s] of skiver.entries()) {
    const lagId = s.del.lagId ?? s.del.id;
    // own colour first, so the parts keep the order of the layers panel
    const farger = [
      s.materialId,
      ...[...stykker[i]!.keys()].filter((f) => f !== s.materialId && !uendret[i]),
    ];
    for (const farge of farger) {
      const nokkel = `${lagId}|${farge}`;
      let g = grupper.get(nokkel);
      if (!g) {
        grupper.set(nokkel, (g = { lagId, farge, med: [] }));
        rekke.push(nokkel);
      }
      g.med.push(i);
    }
  }

  const deler: ModellDel[] = [];
  for (const nokkel of rekke) {
    const g = grupper.get(nokkel)!;
    // a group of untouched slabs keeps its parts exactly as they were
    if (g.med.every((i) => uendret[i])) {
      for (const i of g.med) deler.push(skiver[i]!.del);
      continue;
    }
    const lopene: Mesh[] = [];
    let lop: { z0: number; z1: number; region: Region }[] = [];
    const lukk = () => {
      if (lop.length) lopene.push(ekstruderStabel(lop));
      lop = [];
    };
    for (const [bi, b] of band.entries()) {
      const her = g.med.flatMap((i) => {
        const r = uendret[i]
          ? iBand(skiver[i]!, b)
            ? skiver[i]!.region
            : null
          : stykker[i]!.get(g.farge)?.[bi];
        return r?.length ? [r] : [];
      });
      if (her.length) lop.push({ z0: b.z0, z1: b.z1, region: her.length === 1 ? her[0]! : unionAlle(her) });
      else lukk();
    }
    lukk();
    if (!lopene.length) continue;
    // named and identified after the slab whose own colour it is, so clicking it in 3D still works
    const eier = g.med.map((i) => skiver[i]!).find((s) => s.materialId === g.farge);
    const lagDel = skiver.find((s) => s.del.id === g.lagId)?.del;
    const lagNavn = lagDel?.navn ?? skiver[g.med[0]!]!.del.navn.split(':')[0]!;
    deler.push({
      id: eier ? eier.del.id : `${g.lagId}~fyll~${g.farge}`,
      lagId: g.lagId,
      navn: eier ? eier.del.navn : `${lagNavn} (skjult fyll)`,
      materialId: g.farge,
      mesh: lopene.length === 1 ? lopene[0]! : slaSammenMesh(lopene),
    });
  }
  return { deler };
}
