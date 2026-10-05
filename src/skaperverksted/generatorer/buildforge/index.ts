/**
 * BuildForge plug-in: start picker, body-part library and connectors, the
 * radial menu, handles, Enkel/Avansert, «Prøv klikk» and live checks. The
 * canvas comes first: properties open on demand (handoff §39–41).
 */
import { Fragment, h } from 'preact';
import type { GeneratorPlugin } from '../../core/generator';
import { finnMateriale, materialtyper } from '../../core/materialer';
import { Bibliotekpanel } from './Bibliotekpanel';
import { Festeoverlegg, Koblingsoverlegg } from './Festeoverlegg';
import { Handtaksverktoy } from './Handtaksverktoy';
import { ENHET } from './graf';
import {
  dupliserForm,
  dupliserKropp,
  flyttForm,
  flyttGruppe,
  gaInn,
  gaUt,
  slettFlere,
  slettForm,
  slettKropp,
} from './handlinger';
import { Lerretsoverlegg } from './Lerretsoverlegg';
import { Startvelger } from './Startvelger';
import { Statusbrikke } from './Statusbrikke';
import { Koblingsmerker } from './Koblingsmerker';
import { BuildforgeInspektor } from './Inspektor';
import { Klikkbrett, spillKlikk } from './Klikkbrett';
import { buildforgeKjerne } from './kjerne';
import { familieFor } from './parametre';
import { editor, type Menymal, type Verktoy } from './tilstand';
import { tilpassBuildforge3d } from './tre';
import './buildforge.css';

const plugin: GeneratorPlugin = {
  ...buildforgeKjerne,
  ui: {
    Venstrepanel: Bibliotekpanel,
    Inspektor: BuildforgeInspektor,
    Bunnbrett: Klikkbrett,
    Overlegg3d: (props) =>
      h(
        Fragment,
        null,
        h(Festeoverlegg, props),
        h(Koblingsoverlegg, props),
        h(Koblingsmerker, props),
        h(Lerretsoverlegg, props),
        h(Handtaksverktoy, null),
        h(Statusbrikke, props),
        h(Startvelger, props),
      ),
  },
  lerretForst: true,
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
    const klikker = familieFor(benk.dok.parametre as { familie?: 'klikker' | 'modul' }) === 'klikker';
    const t = editor.t;
    if (klikker && !mod && !e.altKey && e.key.toLowerCase() === 'k') {
      spillKlikk();
      return true;
    }
    // the menu key or Shift+F10 opens the radial menu for the selection (keyboard users, handoff §37)
    if (!klikker && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      const lerret = document.querySelector<HTMLCanvasElement>('.visning3d canvas');
      const r = lerret?.getBoundingClientRect();
      const x = r ? r.width / 2 : 200,
        y = r ? r.height / 2 : 200;
      const mal: Menymal = t.inne
        ? valgt
          ? { type: 'form', id: valgt }
          : t.kobling
            ? { type: 'kobling', kropp: t.inne, kobling: t.kobling }
            : { type: 'tom' }
        : t.flere.length > 1
          ? { type: 'flere', ider: [...t.flere] }
          : t.kropp
            ? { type: 'kropp', id: t.kropp }
            : { type: 'tom' };
      editor.sett({ meny: { x, y, mal } });
      return true;
    }
    if (e.key === 'Escape') {
      // one step out at a time: placing, the selection, then out of the part
      if (
        valgt ||
        t.plasserer ||
        t.plassererKropp ||
        t.erstatter ||
        t.meny ||
        t.flere.length ||
        t.kobling ||
        t.nyKobling
      ) {
        editor.sett({
          valgt: null,
          plasserer: null,
          sikter: null,
          merket: [],
          plassererKropp: null,
          erstatter: null,
          meny: null,
          flere: [],
          kobling: null,
          nyKobling: false,
        });
        return true;
      }
      if (t.inne) {
        gaUt(benk);
        return true;
      }
      if (t.kropp) {
        editor.sett({ kropp: null });
        return true;
      }
      return false;
    }
    if (
      !klikker &&
      !valgt &&
      !t.inne &&
      t.flere.length > 1 &&
      (e.key === 'Delete' || e.key === 'Backspace')
    ) {
      slettFlere(benk, t.flere);
      return true;
    }
    const kropp = !klikker && !valgt && !t.inne ? t.kropp : null;
    if (kropp) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        slettKropp(benk, kropp);
        return true;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        dupliserKropp(benk, kropp);
        return true;
      }
      if (!mod && e.key === 'Enter') {
        gaInn(benk, kropp);
        return true;
      }
      const steg = e.shiftKey ? 10 : 1;
      const piler: Record<string, [number, number, number]> = {
        ArrowLeft: [-steg, 0, 0],
        ArrowRight: [steg, 0, 0],
        ArrowUp: [0, steg, 0],
        ArrowDown: [0, -steg, 0],
      };
      if (piler[e.key] && !mod) {
        // the whole group moves on the plate; it always stands on it
        flyttGruppe(benk, kropp, { m: ENHET, t: piler[e.key]! }, 'Flytt gruppe');
        return true;
      }
      const verktoy: Record<string, Verktoy> = { g: 'flytt', r: 'roter' };
      if (!mod && !e.altKey && verktoy[e.key.toLowerCase()]) {
        editor.sett({ verktoy: verktoy[e.key.toLowerCase()] });
        return true;
      }
      return false;
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
    ['Dra en kroppsdel til modellen', 'Den fester seg til nærmeste kobling som passer'],
    ['Høyreklikk eller C mens du drar', 'Bytt hvilken kobling som brukes'],
    [
      'Slipp en kroppsdel på en del av samme slag',
      'Bytt ut delen; deler som ikke passer, blir liggende løst',
    ],
    ['Velg en del, så en kobling i listen', 'Fest uten å dra'],
    ['Klikk på en del', 'Velg delen'],
    ['Shift + klikk', 'Velg flere deler'],
    ['Høyreklikk (langt trykk på berøringsskjerm)', 'Valg for det du peker på, i en ring'],
    ['Menytasten eller Shift + F10', 'Valg for det som er valgt'],
    ['Dobbeltklikk, dobbelttrykk eller Enter', 'Gå inn i delen og jobb med formene og koblingene'],
    ['G / R / S', 'Håndtak for å flytte, rotere eller skalere'],
    ['Piltaster', 'Flytt valgt form eller gruppe 1 mm (Shift: 10 mm)'],
    ['Page Up / Page Down', 'Flytt valgt form opp eller ned'],
    ['Delete', 'Slett valgt form eller del'],
    ['Ctrl/Cmd + D', 'Dupliser valgt form eller del'],
    ['K', 'Prøv klikk (klikkere)'],
    ['Esc', 'Avbryt, fjern valget eller gå ut av delen'],
  ],
};

export default plugin;
