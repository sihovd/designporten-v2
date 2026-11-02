/**
 * Articulated dragon plug-in. New dragons are drawn: the spine from above,
 * the height from the side and the live 3D model side by side (tegning/).
 * Dragons made with the earlier part picker open as before, with its
 * pickers, inspector and 3D view.
 */
import { h } from 'preact';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { GeneratorPlugin, Scene3d } from '../../core/generator';
import { Visning3d } from '../../render3d/Lat3d';
import { brukUtdrag } from '../../shell/bruk-benk';
import { DrageDelvelger } from './Delvelger';
import { DrageInspektor } from './Inspektor';
import { drageKjerne } from './kjerne';
import { tegning, modusFor } from './tegning/handlinger';
import { slettValgt, TegneInspektor } from './tegning/Inspektor';
import { TegneLerret, TegneVerktoy } from './tegning/Lerret';
import { gyldigValg, tegnelager } from './tegning/tilstand';
import { DrageVrikk } from './Vrikk';

const brukModus = (benk: Arbeidsbenk) => brukUtdrag(benk, (t) => modusFor(t.dok.parametre));

function Lerret2d({ benk }: { benk: Arbeidsbenk }) {
  return brukModus(benk) === 'tegning' ? h(TegneLerret, { benk }) : h(Visning3d, { benk });
}

function Verktoy({ benk }: { benk: Arbeidsbenk }) {
  return brukModus(benk) === 'tegning' ? h(TegneVerktoy, { benk }) : null;
}

function Inspektor({ benk }: { benk: Arbeidsbenk }) {
  return h(brukModus(benk) === 'tegning' ? TegneInspektor : DrageInspektor, { benk });
}

function Bunnbrett({ benk }: { benk: Arbeidsbenk }) {
  return brukModus(benk) === 'tegning' ? null : h(DrageDelvelger, { benk });
}

function Overlegg3d({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  return brukModus(benk) === 'tegning' ? null : h(DrageVrikk, { benk, scene });
}

const plugin: GeneratorPlugin = {
  ...drageKjerne,
  // details such as eyes and horns are sunk into the body
  delerOverlapper: true,
  ui: {
    Lerret2d,
    Verktoy,
    Inspektor,
    Bunnbrett,
    Overlegg3d,
  },
  hurtigtaster(e, benk) {
    if (modusFor(benk.dok.parametre) !== 'tegning' || e.ctrlKey || e.metaKey) return false;
    const lager = tegnelager(benk);
    const t = tegning(benk);
    const naa = lager.naa;
    const verktoy = { v: 'juster', r: 'tegn', p: 'pigg' } as const;
    const v = verktoy[e.key.toLowerCase() as keyof typeof verktoy];
    if (v && !e.altKey) {
      lager.sett({ verktoy: v });
      return true;
    }
    if (e.key === 'Escape' && (naa.valgt || naa.verktoy !== 'juster')) {
      lager.sett({ valgt: null, verktoy: 'juster' });
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const valgt = gyldigValg(t, naa.valgt, Infinity);
      return slettValgt(benk, t, valgt, lager);
    }
    return false;
  },
  hurtigtastListe: [
    ['V', 'Tegnet drage: juster punkter, bredder og pigger'],
    ['R', 'Tegnet drage: tegn ny rygg'],
    ['P', 'Tegnet drage: legg til pigg'],
    ['Piltaster', 'Flytt valgt punkt 1 mm (med Shift 5 mm)'],
    ['Delete', 'Slett valgt punkt eller pigg'],
    ['Esc', 'Fjern valget og gå tilbake til Juster'],
    ['Ctrl/Cmd + Z', 'Angre siste endring'],
  ],
};

export default plugin;
