/**
 * Document ↔ lamp: new document, parameter access, the pure model builder and
 * the printability assessment (spec: "Printability: vase-mode compatibility,
 * overhang limits and minimum wall thickness are enforced or warned about
 * with plain explanations").
 */
import { tomtDokument, type Dokument } from '../../core/dokument';
import type { Advarsel, Modellresultat } from '../../core/generator';
import { finnMateriale, materialtyper, standardPrinter } from '../../core/materialer';
import { mm, tall } from '../../core/enheter';
import { byggLampe, type LampeGeometri } from './geometri';
import { normaliser, sokler, standardParametre, type LampeParametre } from './parametre';

export const LAMPE_ID = 'lampe';

export function nyttLampeDokument(p: LampeParametre = standardParametre()): Dokument {
  const dok = tomtDokument(LAMPE_ID, 'Min lampe', {
    bredde: standardPrinter.plateBredde,
    dybde: standardPrinter.plateDybde,
    hoyde: standardPrinter.byggHoyde,
    printerProfilId: standardPrinter.id,
  });
  return { ...dok, parametre: { ...p } };
}

/** Read the lamp parameters from a document (always valid). */
export function lesParametre(dok: Dokument): LampeParametre {
  return normaliser(dok.parametre);
}

/** Pure document update helper for the UI: returns a new document. */
export function medParametre(dok: Dokument, endring: Partial<LampeParametre>): Dokument {
  const p = normaliser({ ...lesParametre(dok), ...endring });
  return { ...dok, parametre: { ...p } };
}

export interface Utskriftsvurdering {
  /** Largest wall angle from vertical (degrees). */
  maksOverheng: number;
  /** Height fraction where the largest overhang is. */
  overhengVed: number;
  /** Largest outer diameter including the pattern (mm). */
  maksDiameter: number;
  vasemodus: { mulig: boolean; grunn: string };
  advarsler: Advarsel[];
}

export function vurderUtskrift(p: LampeParametre, g: LampeGeometri, dok?: Dokument): Utskriftsvurdering {
  const advarsler: Advarsel[] = [];
  const mat = finnMateriale(p.materialId);
  const info = materialtyper[mat.type];
  const plate = dok?.plate ?? {
    bredde: standardPrinter.plateBredde,
    dybde: standardPrinter.plateDybde,
    hoyde: standardPrinter.byggHoyde,
  };

  const { ytreRutenett: rn, vinkler: N, rader: M } = g;
  const dz = p.hoyde / M;
  let maksOverheng = 0;
  let overhengVed = 0;
  let maksR = 0;
  for (let i = 0; i <= M; i++) {
    for (let j = 0; j < N; j++) {
      const r = rn[i * N + j]!;
      if (r > maksR) maksR = r;
      if (i < M) {
        const vinkel = (Math.atan2(Math.abs(rn[(i + 1) * N + j]! - r), dz) * 180) / Math.PI;
        if (vinkel > maksOverheng) {
          maksOverheng = vinkel;
          overhengVed = (i + 0.5) / M;
        }
      }
    }
  }
  const maksDiameter = maksR * 2;

  if (p.hoyde > plate.hoyde) {
    advarsler.push({
      niva: 'feil',
      tekst: `Lampen er ${mm(p.hoyde, 0)} høy, men skriveren bygger maks ${mm(plate.hoyde, 0)}. Gjør den lavere.`,
    });
  }
  if (maksDiameter > Math.min(plate.bredde, plate.dybde)) {
    advarsler.push({
      niva: 'feil',
      tekst: `Lampen er ${mm(maksDiameter, 0)} bred, men byggeplaten er ${mm(Math.min(plate.bredde, plate.dybde), 0)}. Gjør den smalere.`,
    });
  }
  if (p.veggtykkelse < info.minVegg) {
    advarsler.push({
      niva: 'advarsel',
      tekst: `Veggen er ${mm(p.veggtykkelse)} tykk. ${mat.type} bør ha minst ${mm(info.minVegg)} for å bli stiv nok.`,
    });
  }
  if (maksOverheng > info.maksOverheng) {
    advarsler.push({
      niva: 'advarsel',
      tekst: `Veggen heller ${tall(maksOverheng, 0)}° ved ${tall(overhengVed * 100, 0)} % av høyden. ${mat.type} tåler rundt ${info.maksOverheng}° uten støtte. Gjør silhuetten eller mønsteret slakere.`,
    });
  }
  if (g.form.klemt) {
    advarsler.push({
      niva: 'advarsel',
      tekst:
        'Silhuetten går nesten inn til midten. Den er rettet ut til minste radius, så modellen avviker fra kurven.',
    });
  }
  const sokkel = sokler[p.sokkel];
  if (g.hullForStort) {
    advarsler.push({
      niva: 'feil',
      tekst: `Hullet til ${sokkel.navn} er ${mm(sokkel.hullDiameter ?? 0, 0)}, men bunnen er bare ${mm(g.minIndreBunn * 2, 0)} innvendig. Gjør bunnen bredere.`,
    });
  }
  if (!sokkel.bekreftet) {
    advarsler.push({
      niva: 'info',
      tekst: `Hullmålet for ${sokkel.navn} (${mm(sokkel.hullDiameter ?? 0, 0)}) er et vanlig mål, men ikke bekreftet av Designporten ennå.`,
    });
  }

  const vaseVegg = standardPrinter.dyse * 2;
  let vasemodus: Utskriftsvurdering['vasemodus'];
  if (p.veggtykkelse > vaseVegg) {
    vasemodus = {
      mulig: false,
      grunn: `Vasemodus skriver én strengbredde. Veggen må være ${mm(vaseVegg)} eller tynnere.`,
    };
  } else if (maksOverheng > info.maksOverheng) {
    vasemodus = { mulig: false, grunn: 'Veggen heller for mye til å skrives ut uten støtte.' };
  } else {
    vasemodus = {
      mulig: true,
      grunn: 'Kan skrives ut i vasemodus: én sammenhengende vegg, rask og uten sømmer.',
    };
  }
  return { maksOverheng, overhengVed, maksDiameter, vasemodus, advarsler };
}

const vurderinger = new WeakMap<Modellresultat, Utskriftsvurdering>();

/** The printability assessment made with a built model (for the inspector). */
export function vurderingFor(m: Modellresultat | null): Utskriftsvurdering | undefined {
  return m ? vurderinger.get(m) : undefined;
}

/** GeneratorPlugin.byggModell: pure, deterministic, never throws. */
export async function byggLampeModell(dok: Dokument): Promise<Modellresultat> {
  try {
    const p = lesParametre(dok);
    const g = byggLampe(p);
    const v = vurderUtskrift(p, g, dok);
    const resultat: Modellresultat = {
      deler: [{ id: 'skjerm', navn: 'Lampeskjerm', materialId: p.materialId, mesh: g.mesh }],
      advarsler: v.advarsler,
    };
    vurderinger.set(resultat, v);
    return resultat;
  } catch (feil) {
    console.error(feil);
    return {
      deler: [],
      advarsler: [{ niva: 'feil', tekst: 'Lampen kunne ikke bygges med disse verdiene.' }],
    };
  }
}
