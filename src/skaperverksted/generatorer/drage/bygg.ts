/**
 * byggModell for the dragon: parameters → skeleton → library shells +
 * joint pins → printable parts. Pure and deterministic.
 *
 * Output: one ModellDel per (skeleton part, material). Parts that share a
 * skeleton part are printed fused (overlapping shells of one object);
 * different skeleton parts are separate, articulated pieces printed in
 * place with the joint clearance between them.
 */
import type { Advarsel, Modellresultat } from '../../core/generator';
import { finnMateriale, standardPrinter } from '../../core/materialer';
import { avgrensning, slaSammenMesh, type Boks3, type Mesh } from '../../geometri/mesh';
import { hentDelbibliotek, type Delbibliotek, type Skall, type Skalltype } from './bibliotek';
import { flytt } from './former';
import { kontrollerLedd } from './ledd';
import { tappOgArm } from './ledd-geometri';
import type { DrageParametre, Fargesone, Monster } from './parametre';
import { lagSkjelett, type Del, type Skjelett } from './skjelett';

export const UTVIKLINGSGEOMETRI_TEKST =
  'Dragedelene er foreløpig utviklingsgeometri: enkle former som viser hvordan dragen settes sammen og beveger seg. De endelige, modellerte delene fra Designporten kommer senere.';

/** Which colour zone a shell takes, given the pattern. */
export function soneFor(type: Skalltype, del: Del, monster: Monster): Fargesone {
  switch (type) {
    case 'oye':
      return 'oyne';
    case 'vinge':
      return 'vinger';
    case 'ribbe':
      return monster === 'ensfarget' ? 'vinger' : 'aksent';
    case 'pigg':
    case 'horn':
    case 'haletupp':
    case 'klo':
      return monster === 'ensfarget' ? 'kropp' : 'aksent';
    default:
      // Stripes: every other body and tail part (never the head).
      return monster === 'striper' && del.rolle !== 'hode' && del.indeks % 2 === 0 ? 'aksent' : 'kropp';
  }
}

export interface Drageinfo {
  skjelett: Skjelett;
  /** Size of the whole print (mm). */
  storrelse: [number, number, number];
  antallLedd: number;
  /** Clearance (mm) and rotation each way (degrees) per joint. */
  klaring: number;
  bevegelseGrader: number;
  materialer: string[];
}

export interface Drageresultat extends Modellresultat {
  info: Drageinfo;
}

function samletBoks(mesher: Mesh[]): Boks3 {
  const b = mesher.map(avgrensning);
  return {
    min: [0, 1, 2].map((k) => Math.min(...b.map((x) => x.min[k]!))) as [number, number, number],
    maks: [0, 1, 2].map((k) => Math.max(...b.map((x) => x.maks[k]!))) as [number, number, number],
  };
}

/** Synchronous core, for tests and workers. */
export function byggDrage(p: DrageParametre, bibliotek: Delbibliotek): Drageresultat {
  const advarsler: Advarsel[] = [];
  const skjelett = lagSkjelett(p);
  const skall: Skall[] = [...bibliotek.byggDeler(skjelett, p)];
  for (const d of skjelett.deler) {
    if (!d.tapp) continue;
    for (const mesh of tappOgArm(d.tapp.jx, d.tapp.tilX, skjelett.mal))
      skall.push({ mesh, type: 'ledd', del: d.indeks });
  }

  // Centre the print on the plate.
  const boks = samletBoks(skall.map((s) => s.mesh));
  const dx = -(boks.min[0] + boks.maks[0]) / 2;
  const dy = -(boks.min[1] + boks.maks[1]) / 2;

  const grupper = new Map<string, { del: Del; materialId: string; mesher: Mesh[] }>();
  for (const s of skall) {
    const del = skjelett.deler[s.del]!;
    const materialId = p.farger[soneFor(s.type, del, p.monster)];
    const nokkel = `${del.indeks}:${materialId}`;
    let g = grupper.get(nokkel);
    if (!g) {
      g = { del, materialId, mesher: [] };
      grupper.set(nokkel, g);
    }
    g.mesher.push(flytt(s.mesh, dx, dy, 0));
  }
  const deler = [...grupper.values()].map((g) => ({
    id: `drage-${g.del.indeks}-${g.materialId}`,
    navn: `${g.del.navn} (${finnMateriale(g.materialId).navn})`,
    materialId: g.materialId,
    mesh: slaSammenMesh(g.mesher),
  }));

  if (bibliotek.utviklingsgeometri) advarsler.push({ niva: 'info', tekst: UTVIKLINGSGEOMETRI_TEKST });

  const storrelse: [number, number, number] = [
    boks.maks[0] - boks.min[0],
    boks.maks[1] - boks.min[1],
    boks.maks[2] - boks.min[2],
  ];
  const printer = standardPrinter;
  if (storrelse[0] > printer.plateBredde || storrelse[1] > printer.plateDybde) {
    advarsler.push({
      niva: 'advarsel',
      tekst: `Dragen er større enn byggeplaten (${printer.plateBredde} × ${printer.plateDybde} mm). Velg en kortere lengde eller mindre vinger.`,
    });
  }
  if (storrelse[2] > printer.byggHoyde) {
    advarsler.push({ niva: 'advarsel', tekst: 'Dragen er høyere enn skriveren kan bygge.' });
  }
  const materialer = [...new Set(deler.map((d) => d.materialId))];
  if (materialer.length > printer.fargerPerPrint) {
    advarsler.push({
      niva: 'advarsel',
      tekst: `Dragen bruker ${materialer.length} farger. Skriveren kan bruke ${printer.fargerPerPrint} i samme print.`,
    });
  }
  const kontroll = kontrollerLedd(skjelett.mal);
  for (const tekst of kontroll.feil) advarsler.push({ niva: 'feil', tekst });

  return {
    deler,
    advarsler,
    info: {
      skjelett,
      storrelse,
      antallLedd: skjelett.deler.length - 1,
      klaring: skjelett.mal.klaring,
      bevegelseGrader: (skjelett.mal.bevegelse * 180) / Math.PI,
      materialer,
    },
  };
}

export async function byggDrageModell(p: DrageParametre): Promise<Drageresultat> {
  return byggDrage(p, await hentDelbibliotek());
}
