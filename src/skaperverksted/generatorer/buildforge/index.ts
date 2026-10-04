/** BuildForge plug-in: library, attachment points, handles, Enkel/Avansert, «Prøv klikk» and live checks. */
import { Fragment, h } from 'preact';
import type { GeneratorPlugin } from '../../core/generator';
import { finnMateriale, materialtyper } from '../../core/materialer';
import { Bibliotekpanel } from './Bibliotekpanel';
import { Festeoverlegg } from './Festeoverlegg';
import { Handtaksverktoy } from './Handtaksverktoy';
import { dupliserForm, flyttForm, slettForm } from './handlinger';
import { BuildforgeInspektor } from './Inspektor';
import { Klikkbrett, spillKlikk } from './Klikkbrett';
import { buildforgeKjerne } from './kjerne';
import { familieFor } from './parametre';
import { editor, type Verktoy } from './tilstand';
import { tilpassBuildforge3d } from './tre';
import './buildforge.css';

const plugin: GeneratorPlugin = {
  ...buildforgeKjerne,
  ui: {
    Venstrepanel: Bibliotekpanel,
    Inspektor: BuildforgeInspektor,
    Bunnbrett: Klikkbrett,
    Overlegg3d: (props) => h(Fragment, null, h(Festeoverlegg, props), h(Handtaksverktoy, null)),
  },
  tilpass3d: tilpassBuildforge3d,
  // smooth shading: the formed surfaces are meshed from fields; tre.ts adds the normals
  material3d(del, three) {
    const m = finnMateriale(del.materialId);
    const t = materialtyper[m.type];
    return new three.MeshStandardMaterial({
      color: new three.Color(m.hex),
      roughness: t.ruhet,
      metalness: t.metallisk,
    });
  },
  hurtigtaster(e, benk) {
    const mod = e.ctrlKey || e.metaKey;
    const valgt = editor.t.valgt;
    const klikker = familieFor(benk.dok.parametre as { familie?: 'klikker' | 'figur' }) === 'klikker';
    if (klikker && !mod && !e.altKey && e.key.toLowerCase() === 'k') {
      spillKlikk();
      return true;
    }
    if (e.key === 'Escape' && (valgt || editor.t.plasserer)) {
      editor.sett({ valgt: null, plasserer: null, sikter: null, merket: [] });
      return true;
    }
    if (!valgt) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      slettForm(benk, valgt);
      return true;
    }
    const verktoy: Record<string, Verktoy> = { g: 'flytt', r: 'roter', s: 'skaler' };
    if (!mod && !e.altKey && verktoy[e.key.toLowerCase()]) {
      editor.sett({ verktoy: verktoy[e.key.toLowerCase()] });
      return true;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      dupliserForm(benk, valgt);
      return true;
    }
    const steg = e.shiftKey ? 10 : 1;
    const flytt: Record<string, [number, number, number]> = {
      ArrowLeft: [-steg, 0, 0],
      ArrowRight: [steg, 0, 0],
      ArrowUp: [0, steg, 0],
      ArrowDown: [0, -steg, 0],
      PageUp: [0, 0, steg],
      PageDown: [0, 0, -steg],
    };
    const d = flytt[e.key];
    if (d && !mod) {
      flyttForm(benk, valgt, d);
      return true;
    }
    return false;
  },
  hurtigtastListe: [
    ['Dra en del til et lilla punkt', 'Fest delen på modellen'],
    ['Velg en del, så et punkt i listen', 'Fest uten å dra'],
    ['Klikk på modellen', 'Velg formen der'],
    ['G / R / S', 'Håndtak for å flytte, rotere eller skalere valgt form'],
    ['Piltaster', 'Flytt valgt form 1 mm (Shift: 10 mm)'],
    ['Page Up / Page Down', 'Flytt valgt form opp eller ned'],
    ['Delete', 'Slett valgt form'],
    ['Ctrl/Cmd + D', 'Dupliser valgt form'],
    ['K', 'Prøv klikk (klikkere)'],
    ['Esc', 'Avbryt plassering eller fjern valget'],
  ],
};

export default plugin;
