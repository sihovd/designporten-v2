/**
 * Geometry for brick mode. Every brick is built from the same recipe as the
 * classic dragon's parts (utviklingsbibliotek.ts for bodies and details,
 * ledd-geometri.ts for the socket, pin and arm), in its own frame, then
 * placed by the graph. View, check and export all use this one result.
 *
 * Output: one ModellDel per (brick, material), so every brick is its own
 * moving body in the 3MF, and colour zones within a brick stay with it.
 */
import type { Advarsel, Modellresultat } from '../../../core/generator';
import { finnMateriale, standardPrinter } from '../../../core/materialer';
import { avgrensning, slaSammenMesh, type Mesh } from '../../../geometri/mesh';
import type { Skall } from '../bibliotek';
import { soneFor } from '../bygg';
import { kontrollerLedd } from '../ledd';
import { tappOgArm } from '../ledd-geometri';
import { standardParametre, type DrageParametre } from '../parametre';
import type { Skjelett } from '../skjelett';
import { hale, hode, kropp, pigger, Samler } from '../utviklingsbibliotek';
import { navnPa, plasseringer, type T2 } from './graf';
import {
  finnDefinisjon,
  HENGSEL_M,
  oppsettFor,
  type Brikkedefinisjon,
  type Brikkeprosjekt,
  type Lokaleverdier,
} from './modell';

export const BRIKKE_UTVIKLINGSTEKST =
  'Brikkene er utviklingsgeometri bygd av de samme formene og det samme leddet som den ferdige dragen. De endelige, modellerte brikkene kommer senere.';

export const PROVEPROFIL_TEKST = `Leddene bruker prøveprofilen ${HENGSEL_M.navn} v${HENGSEL_M.versjon} (klaring ${String(HENGSEL_M.mal.klaring).replace('.', ',')} mm). Den er ikke fysisk testet som brikkeledd.`;

/** The classic part values a brick reads, with the brick's own values on top. */
export function brikkeparametre(
  def: Brikkedefinisjon,
  v: Lokaleverdier,
  farger: DrageParametre,
): DrageParametre {
  const s = standardParametre;
  return {
    ...farger,
    hode: def.hode ?? s.hode,
    hale: def.hale ?? s.hale,
    horn: def.kategori === 'hode' ? (v.horn ?? s.horn) : 'ingen',
    pigger: v.pigger ?? s.pigger,
    detaljer: { ...s.detaljer, oyne: v.oyne ?? s.detaljer.oyne, bein: false, vingeribber: false },
  };
}

const hurtig = new Map<string, Skall[]>();

/** The brick's shells in its own frame (origin in the body's centre, nose towards +X). */
export function lokaleSkall(def: Brikkedefinisjon, v: Lokaleverdier): Skall[] {
  const nokkel = `${def.id}@${def.versjon}|${JSON.stringify(v)}`;
  const ferdig = hurtig.get(nokkel);
  if (ferdig) return ferdig;
  const o = oppsettFor(def, v);
  const q = brikkeparametre(def, v, standardParametre);
  const sk: Skjelett = {
    deler: [o.del],
    mal: o.mal,
    neseX: o.neseX,
    haleX: o.haleX,
    snute: o.neseX - o.del.omriss.af,
    haletupp: -o.haleX - o.del.omriss.ab,
    vingeDel: -1,
    beinDeler: [],
  };
  const s = new Samler();
  kropp(s, o.del);
  if (def.kategori === 'hode') hode(s, sk, q);
  pigger(s, sk, q);
  if (def.hale) hale(s, sk, q);
  if (o.tapp) for (const mesh of tappOgArm(o.tapp.jx, o.tapp.tilX, o.mal)) s.legg(0, 'ledd', mesh);
  hurtig.set(nokkel, s.skall);
  while (hurtig.size > 80) hurtig.delete(hurtig.keys().next().value!);
  return s.skall;
}

/** Move a mesh by a plane motion (rotation about Z keeps the winding). */
export function plasserMesh(m: Mesh, t: T2): Mesh {
  const c = Math.cos(t.v);
  const s = Math.sin(t.v);
  const p = m.posisjoner;
  const ut = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!;
    const y = p[i + 1]!;
    ut[i] = t.x + c * x - s * y;
    ut[i + 1] = t.y + s * x + c * y;
    ut[i + 2] = p[i + 2]!;
  }
  return { posisjoner: ut, indekser: m.indekser };
}

type P2 = [number, number];

/** Convex hull of the mesh seen from above (monotone chain), counter-clockwise. */
export function fotavtrykk(mesher: Mesh[]): P2[] {
  const pkt: P2[] = [];
  for (const m of mesher)
    for (let i = 0; i < m.posisjoner.length; i += 3) pkt.push([m.posisjoner[i]!, m.posisjoner[i + 1]!]);
  pkt.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pkt.length < 3) return pkt;
  const kryss = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const nedre: P2[] = [];
  for (const p of pkt) {
    while (nedre.length >= 2 && kryss(nedre.at(-2)!, nedre.at(-1)!, p) <= 0) nedre.pop();
    nedre.push(p);
  }
  const ovre: P2[] = [];
  for (let i = pkt.length - 1; i >= 0; i--) {
    const p = pkt[i]!;
    while (ovre.length >= 2 && kryss(ovre.at(-2)!, ovre.at(-1)!, p) <= 0) ovre.pop();
    ovre.push(p);
  }
  return [...nedre.slice(0, -1), ...ovre.slice(0, -1)];
}

/** Do two convex polygons overlap (separating axis test)? */
export function overlapper(a: P2[], b: P2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      let aMin = Infinity,
        aMaks = -Infinity,
        bMin = Infinity,
        bMaks = -Infinity;
      for (const r of a) {
        const d = r[0] * nx + r[1] * ny;
        aMin = Math.min(aMin, d);
        aMaks = Math.max(aMaks, d);
      }
      for (const r of b) {
        const d = r[0] * nx + r[1] * ny;
        bMin = Math.min(bMin, d);
        bMaks = Math.max(bMaks, d);
      }
      if (aMaks <= bMin || bMaks <= aMin) return false;
    }
  }
  return true;
}

export interface Brikkeinfo {
  brikker: number;
  forbindelser: number;
  grupper: number;
  storrelse: [number, number, number];
  materialer: string[];
}

export interface Brikkeresultat extends Modellresultat {
  info: Brikkeinfo;
}

export const delIdFor = (instans: string, materialId: string) => `brikke:${instans}:${materialId}`;

/** The instance id in a part id from `delIdFor`, or null for other parts. */
export function instansFraDelId(id: string): string | null {
  const m = /^brikke:([^:]+):/.exec(id);
  return m ? m[1]! : null;
}

/**
 * Build the whole brick project. Pure and deterministic. `problemer` are
 * the repairs made when the project was read; they are shown as notices.
 */
export function byggBrikker(
  prosjekt: Brikkeprosjekt,
  farger: DrageParametre,
  problemer: string[] = [],
): Brikkeresultat {
  const advarsler: Advarsel[] = problemer.map((tekst) => ({ niva: 'advarsel' as const, tekst }));
  const W = plasseringer(prosjekt);
  const deler: Modellresultat['deler'] = [];
  const avtrykk = new Map<string, P2[]>();

  prosjekt.instanser.forEach((i, indeks) => {
    const def = finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
    const t = W.get(i.id);
    if (!def) return;
    if (!t) {
      advarsler.push({
        niva: 'advarsel',
        tekst: `${navnPa(prosjekt, i.id)} henger bak en brikke som ikke kan bygges, og vises ikke.`,
        objektId: i.id,
      });
      return;
    }
    const o = oppsettFor(def, i.verdier);
    const del = { ...o.del, indeks };
    const grupper = new Map<string, Mesh[]>();
    for (const s of lokaleSkall(def, i.verdier)) {
      const materialId = farger.farger[soneFor(s.type, del, farger.monster)];
      const liste = grupper.get(materialId) ?? [];
      liste.push(plasserMesh(s.mesh, t));
      grupper.set(materialId, liste);
    }
    const alle: Mesh[] = [];
    for (const [materialId, mesher] of grupper) {
      alle.push(...mesher);
      deler.push({
        id: delIdFor(i.id, materialId),
        navn: `${navnPa(prosjekt, i.id)} (${finnMateriale(materialId).navn})`,
        materialId,
        mesh: slaSammenMesh(mesher),
      });
    }
    avtrykk.set(i.id, fotavtrykk(alle));
  });

  // Overlap between bricks that are not joined to each other: their footprints
  // seen from above must not overlap, or they print fused. Joined neighbours
  // are kept apart by the joint standard itself (the pin sits in the socket).
  const naboer = new Set(
    prosjekt.forbindelser.flatMap((f) => [`${f.a.instans}|${f.b.instans}`, `${f.b.instans}|${f.a.instans}`]),
  );
  const ider = [...avtrykk.keys()];
  for (let x = 0; x < ider.length; x++) {
    for (let y = x + 1; y < ider.length; y++) {
      const a = ider[x]!;
      const b = ider[y]!;
      if (naboer.has(`${a}|${b}`)) continue;
      if (overlapper(avtrykk.get(a)!, avtrykk.get(b)!))
        advarsler.push({
          niva: 'feil',
          tekst: `${navnPa(prosjekt, a)} og ${navnPa(prosjekt, b)} overlapper sett ovenfra og ville printes sammen. Flytt en av gruppene.`,
          objektId: a,
        });
    }
  }

  if (prosjekt.instanser.some((i) => finnDefinisjon(i.definisjon.id, i.definisjon.versjon)))
    advarsler.push({ niva: 'info', tekst: BRIKKE_UTVIKLINGSTEKST });
  if (prosjekt.forbindelser.length) advarsler.push({ niva: 'info', tekst: PROVEPROFIL_TEKST });
  if (prosjekt.grupper.length > 1)
    advarsler.push({
      niva: 'info',
      tekst: `Modellen har ${prosjekt.grupper.length} grupper som ikke henger sammen. De printes som løse deler.`,
    });

  let storrelse: [number, number, number] = [0, 0, 0];
  if (deler.length) {
    const b = deler.map((d) => avgrensning(d.mesh));
    const min = [0, 1, 2].map((k) => Math.min(...b.map((x) => x.min[k]!)));
    const maks = [0, 1, 2].map((k) => Math.max(...b.map((x) => x.maks[k]!)));
    storrelse = [maks[0]! - min[0]!, maks[1]! - min[1]!, maks[2]! - min[2]!];
    const printer = standardPrinter;
    if (
      min[0]! < -printer.plateBredde / 2 ||
      maks[0]! > printer.plateBredde / 2 ||
      min[1]! < -printer.plateDybde / 2 ||
      maks[1]! > printer.plateDybde / 2
    )
      advarsler.push({
        niva: 'advarsel',
        tekst: `Noe av modellen ligger utenfor byggeplaten (${printer.plateBredde} × ${printer.plateDybde} mm). Flytt gruppene inn mot midten.`,
      });
    if (maks[2]! > printer.byggHoyde)
      advarsler.push({ niva: 'advarsel', tekst: 'Modellen er høyere enn skriveren kan bygge.' });
  }
  const materialer = [...new Set(deler.map((d) => d.materialId))];
  if (materialer.length > standardPrinter.fargerPerPrint)
    advarsler.push({
      niva: 'advarsel',
      tekst: `Modellen bruker ${materialer.length} farger. Skriveren kan bruke ${standardPrinter.fargerPerPrint} i samme print.`,
    });
  for (const tekst of kontrollerLedd(HENGSEL_M.mal).feil) advarsler.push({ niva: 'feil', tekst });

  return {
    deler,
    advarsler,
    info: {
      brikker: prosjekt.instanser.length,
      forbindelser: prosjekt.forbindelser.length,
      grupper: prosjekt.grupper.length,
      storrelse,
      materialer,
    },
  };
}
