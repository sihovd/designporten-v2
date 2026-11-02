/**
 * The drawn dragon as printable parts: one moving body per piece (and per
 * colour within it), placed in the drawn pose. View, check and export all
 * use this one result.
 */
import type { Advarsel, Modellresultat } from '../../../core/generator';
import { finnMateriale, standardPrinter } from '../../../core/materialer';
import { avgrensning, slaSammenMesh, type Mesh } from '../../../geometri/mesh';
import { soneFor } from '../bygg';
import { kontrollerLedd } from '../ledd';
import type { DrageParametre } from '../parametre';
import {
  kollisjoner,
  lagOppsett,
  plasserMesh,
  segmentform,
  segmentSkall,
  type Funn,
  type Oppsett,
} from './geometri';
import type { Tegning } from './modell';

export const TEGNING_UTVIKLINGSTEKST =
  'Delene er utviklingsgeometri bygd av de samme formene og det samme leddet som den ferdige dragen. De endelige, modellerte delene kommer senere.';

export function proveprofilTekst(o: Oppsett): string {
  const klaring = String(Math.round(o.mal.klaring * 100) / 100).replace('.', ',');
  return `Leddene er en prøveprofil (hengsel som printes ferdig koblet, klaring ${klaring} mm). De er ikke fysisk testet i bøyd printstilling.`;
}

export const delIdFor = (indeks: number, materialId: string) => `tegnet-${indeks}-${materialId}`;

export interface Tegningsresultat extends Modellresultat {
  oppsett: Oppsett;
  storrelse: [number, number, number];
}

/** Notices point at pieces (`deler:1,2`) or joints (`ledd:3`) so the views can mark them. */
export function funnTilAdvarsel(f: Funn): Advarsel {
  const objektId =
    f.segment !== undefined ? `deler:${f.segment}` : f.ledd !== undefined ? `ledd:${f.ledd}` : undefined;
  return { niva: f.niva, tekst: f.tekst, ...(objektId ? { objektId } : {}) };
}

/** Everything the layout and the bodies say is wrong, as notices. Shared by the build and the 2D views. */
export function kontroller(t: Tegning, o: Oppsett): Advarsel[] {
  const ut: Advarsel[] = o.funn.map(funnTilAdvarsel);
  const former = o.segmenter.map((s) => segmentform(t, o, s).ovenfra);
  for (const [a, b] of kollisjoner(former)) {
    const A = o.segmenter[a]!;
    const B = o.segmenter[b]!;
    ut.push({
      niva: 'feil',
      objektId: `deler:${a},${b}`,
      tekst:
        b === a + 1
          ? `${A.navn} og ${B.navn.toLowerCase()} kommer borti hverandre i svingen og ville printes sammen. Rett ut ryggen der, eller gjør delene smalere.`
          : `${A.navn} og ${B.navn.toLowerCase()} ligger oppå hverandre på platen. Flytt ryggen så de ikke krysser.`,
    });
  }
  for (const tekst of kontrollerLedd(o.mal).feil) ut.push({ niva: 'feil', tekst });
  return ut;
}

/** Build the drawn dragon. Pure and deterministic; problems become notices. */
export function byggTegning(t: Tegning, farger: DrageParametre, problemer: string[] = []): Tegningsresultat {
  const o = lagOppsett(t);
  const advarsler: Advarsel[] = [
    ...problemer.map((tekst) => ({ niva: 'advarsel' as const, tekst })),
    ...(o.segmenter.length ? kontroller(t, o) : o.funn.map(funnTilAdvarsel)),
  ];
  const deler: Modellresultat['deler'] = [];
  for (const seg of o.segmenter) {
    const grupper = new Map<string, Mesh[]>();
    for (const s of segmentSkall(t, seg, o.mal)) {
      const materialId = farger.farger[soneFor(s.type, seg.del, farger.monster)];
      const liste = grupper.get(materialId) ?? [];
      liste.push(plasserMesh(s.mesh, seg.T));
      grupper.set(materialId, liste);
    }
    for (const [materialId, mesher] of grupper)
      deler.push({
        id: delIdFor(seg.indeks, materialId),
        navn: `${seg.navn} (${finnMateriale(materialId).navn})`,
        materialId,
        mesh: slaSammenMesh(mesher),
      });
  }

  let storrelse: [number, number, number] = [0, 0, 0];
  if (deler.length) {
    advarsler.push({ niva: 'info', tekst: TEGNING_UTVIKLINGSTEKST });
    advarsler.push({ niva: 'info', tekst: proveprofilTekst(o) });
    const b = deler.map((d) => avgrensning(d.mesh));
    const min = [0, 1, 2].map((k) => Math.min(...b.map((x) => x.min[k]!)));
    const maks = [0, 1, 2].map((k) => Math.max(...b.map((x) => x.maks[k]!)));
    storrelse = [maks[0]! - min[0]!, maks[1]! - min[1]!, maks[2]! - min[2]!];
    const p = standardPrinter;
    if (
      min[0]! < -p.plateBredde / 2 ||
      maks[0]! > p.plateBredde / 2 ||
      min[1]! < -p.plateDybde / 2 ||
      maks[1]! > p.plateDybde / 2
    )
      advarsler.push({
        niva: 'advarsel',
        tekst: `Noe av dragen ligger utenfor byggeplaten (${p.plateBredde} × ${p.plateDybde} mm). Flytt ryggen inn eller gjør den kortere.`,
      });
    if (maks[2]! > p.byggHoyde)
      advarsler.push({ niva: 'advarsel', tekst: 'Dragen er høyere enn skriveren kan bygge.' });
    const materialer = new Set(deler.map((d) => d.materialId));
    if (materialer.size > p.fargerPerPrint)
      advarsler.push({
        niva: 'advarsel',
        tekst: `Dragen bruker ${materialer.size} farger. Skriveren kan bruke ${p.fargerPerPrint} i samme print.`,
      });
  }
  return { deler, advarsler, oppsett: o, storrelse };
}
