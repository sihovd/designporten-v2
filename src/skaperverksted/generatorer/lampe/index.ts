/** Lamp generator plug-in: parametric, printable lamp shades (spec: "Lamp generator"). */
import type { GeneratorPlugin } from '../../core/generator';
import { finnMateriale } from '../../core/materialer';
import { tall } from '../../core/enheter';
import { meta } from './meta';
import { byggLampeModell, lesParametre, nyttLampeDokument, vurderingFor } from './modell';
import { monsternavn, sokler } from './parametre';
import { LampeInspektor } from './Inspektor';
import { LampeOverlegg } from './Overlegg';
import { tilpassLampe3d } from './tre';
import { lys } from './lys';
import './lampe.css';

const plugin: GeneratorPlugin = {
  ...meta,
  visninger: ['3d'],
  nyttDokument: () => nyttLampeDokument(),
  byggModell: byggLampeModell,
  ui: {
    Inspektor: LampeInspektor,
    Overlegg3d: LampeOverlegg,
  },
  tilpass3d: tilpassLampe3d,
  hurtigtaster(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const tast = e.key.toLowerCase();
    if (tast === 'l') {
      lys.sett({ pa: !lys.t.pa });
      return true;
    }
    if (tast === 'n') {
      lys.sett({ natt: !lys.t.natt });
      return true;
    }
    return false;
  },
  hurtigtastListe: [
    ['Dra punktene på lampen', 'Form silhuetten og diameteren'],
    ['Dra firkanten på målelinjen', 'Endre høyden'],
    ['Dra ringen over lampen', 'Vri mønsteret'],
    ['Tab til et håndtak, så piltaster', 'Juster med tastaturet (Shift: 10 ganger)'],
    ['L', 'Lys i lampen av/på'],
    ['N', 'Kveld i rommet av/på'],
  ],
  bestilling(dok, modell) {
    const p = lesParametre(dok);
    const v = vurderingFor(modell);
    return {
      produktId: 'skaperverksted-lampe',
      navn: `Lampeskjerm fra Lampegeneratoren: ${dok.navn}`,
      valg: {
        Mål: `${tall(v?.maksDiameter ?? Math.max(p.diameterBunn, p.diameterTopp), 0)} × ${tall(p.hoyde, 0)} mm`,
        Mønster: p.monster.type === 'glatt' ? 'Glatt' : `${monsternavn[p.monster.type]}, ${p.monster.antall}`,
        Vegg: `${tall(p.veggtykkelse, 2)} mm`,
        Bunn: sokler[p.sokkel].navn,
        Materiale: `${finnMateriale(p.materialId).type}, ${finnMateriale(p.materialId).navn}`,
      },
    };
  },
};

export default plugin;
