/** Articulated dragon plug-in: part pickers, inspector and live 3D, or the brick builder. */
import { h } from 'preact';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { GeneratorPlugin, Scene3d } from '../../core/generator';
import { brukUtdrag } from '../../shell/bruk-benk';
import { BrikkeBibliotek } from './brikker/Bibliotek';
import { brikkeprosjekt, endreBrikker, modusFor } from './brikker/handlinger';
import { BrikkeInspektor } from './brikker/Inspektor';
import { BrikkeOverlegg } from './brikker/Overlegg';
import { editorFor } from './brikker/tilstand';
import { slett } from './brikker/graf';
import { DrageDelvelger } from './Delvelger';
import { DrageInspektor } from './Inspektor';
import { drageKjerne } from './kjerne';
import { DrageVrikk } from './Vrikk';

const brukModus = (benk: Arbeidsbenk) => brukUtdrag(benk, (t) => modusFor(t.dok.parametre));

function Inspektor({ benk }: { benk: Arbeidsbenk }) {
  return h(brukModus(benk) === 'brikker' ? BrikkeInspektor : DrageInspektor, { benk });
}

function Bunnbrett({ benk }: { benk: Arbeidsbenk }) {
  return h(brukModus(benk) === 'brikker' ? BrikkeBibliotek : DrageDelvelger, { benk });
}

function Overlegg3d({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  return h(brukModus(benk) === 'brikker' ? BrikkeOverlegg : DrageVrikk, { benk, scene });
}

const plugin: GeneratorPlugin = {
  ...drageKjerne,
  // details such as eyes and horns are sunk into the body
  delerOverlapper: true,
  ui: {
    Inspektor,
    Bunnbrett,
    Overlegg3d,
  },
  hurtigtaster(e, benk) {
    if (modusFor(benk.dok.parametre) !== 'brikker') return false;
    const lager = editorFor(benk);
    const t = lager.naa;
    if (e.key === 'Escape' && (t.plasserer || t.kilde || t.kandidat || t.bytter)) {
      lager.avbryt();
      return true;
    }
    if (e.key === 'Delete' && t.valgt) {
      const id = t.valgt;
      if (!brikkeprosjekt(benk).instanser.some((i) => i.id === id)) return false;
      const r = endreBrikker(benk, (q) => slett(q, id, 'behold'));
      if (r.ok) lager.sett({ valgt: null });
      return true;
    }
    return false;
  },
  hurtigtastListe: [
    ['Tab, så piltaster', 'Bla i delene og variantene nederst'],
    ['Ctrl/Cmd + Z', 'Angre siste endring'],
    ['Esc', 'Brikkebygger: avbryt plassering, kobling eller bytte'],
    ['Delete', 'Brikkebygger: slett valgt brikke (det som hang på den blir liggende)'],
  ],
  bunnbrettNavn: 'Deler og brikker',
};

export default plugin;
