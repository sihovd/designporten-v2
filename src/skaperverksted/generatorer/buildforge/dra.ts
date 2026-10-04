/**
 * One drag engine for the modular builder (handoff 2026-10-04 §66 D). A
 * drag starts from the library (a new part) or from the canvas (a part and
 * everything connected to it). While it runs, the 3D view resolves the
 * pointer into one of: connect to a connector, replace a part, put loose on
 * the plate, or invalid, and shows it. Letting go applies that result as
 * one undoable step; Esc cancels.
 *
 * Pointer events, not HTML drag and drop, so a right-click during the drag
 * can switch which of the part's connectors is used (handoff §9). Touch and
 * keyboard get the same through the «Bytt kobling» button and the C key.
 */
import { editor, type Drastatus } from './tilstand';

export type Drakilde = { type: 'bibliotek'; malId: string } | { type: 'gruppe'; kropp: string };

export interface Lerretskobling {
  /** Resolve and show the drag at a pointer position (client px). */
  vis(
    kilde: Drakilde,
    x: number,
    y: number,
    syklus: number,
    startX: number,
    startY: number,
  ): Drastatus | null;
  /** Apply the drag at a pointer position. */
  slipp(kilde: Drakilde, x: number, y: number, syklus: number, startX: number, startY: number): void;
  /** Remove what the drag showed. */
  avbryt(): void;
}

let lerret: Lerretskobling | null = null;

export function registrerLerret(l: Lerretskobling): () => void {
  lerret = l;
  return () => {
    if (lerret === l) lerret = null;
  };
}

interface Aktiv {
  kilde: Drakilde;
  startX: number;
  startY: number;
  x: number;
  y: number;
  syklus: number;
  startet: boolean;
  rydd: () => void;
}

let aktiv: Aktiv | null = null;
let sisteSyklus = 0;

/** Movement before a press becomes a drag (px). */
const TERSKEL = 5;

const oppdater = () => {
  if (!aktiv?.startet) return;
  const s = lerret?.vis(aktiv.kilde, aktiv.x, aktiv.y, aktiv.syklus, aktiv.startX, aktiv.startY) ?? null;
  editor.sett({ dra: s });
};

/** Switch to the dragged part's next fitting connector (right-click, «Bytt kobling», C). */
export function nesteKobling(): void {
  if (!aktiv?.startet) return;
  const na = performance.now();
  // a right press can arrive both as a button change and as a context menu event
  if (na - sisteSyklus < 250) return;
  sisteSyklus = na;
  aktiv.syklus++;
  oppdater();
}

export const drarNa = (): boolean => !!aktiv?.startet;

/**
 * Start following a press. Returns at once; the drag begins after a few
 * pixels of movement, so a click stays a click. `vedKlikk` runs when the
 * press ends without a drag.
 */
export function startDra(kilde: Drakilde, ev: PointerEvent, el: Element, vedKlikk?: () => void): void {
  if (aktiv) avslutt(false);
  try {
    el.setPointerCapture(ev.pointerId);
  } catch {
    // capture is a convenience; window listeners still follow the pointer
  }
  let knapper = ev.buttons;
  const flytt = (e: PointerEvent) => {
    if (!aktiv || e.pointerId !== ev.pointerId) return;
    aktiv.x = e.clientX;
    aktiv.y = e.clientY;
    if (!aktiv.startet && Math.hypot(e.clientX - aktiv.startX, e.clientY - aktiv.startY) > TERSKEL)
      aktiv.startet = true;
    // the right button pressed while the left is held
    if (aktiv.startet && e.buttons & 2 && !(knapper & 2)) nesteKobling();
    knapper = e.buttons;
    oppdater();
  };
  const opp = (e: PointerEvent) => {
    if (!aktiv || e.pointerId !== ev.pointerId || e.button === 2) return;
    aktiv.x = e.clientX;
    aktiv.y = e.clientY;
    if (aktiv.startet) avslutt(true);
    else {
      avslutt(false);
      vedKlikk?.();
    }
  };
  const avbrutt = (e: PointerEvent) => {
    if (e.pointerId === ev.pointerId) avslutt(false);
  };
  const meny = (e: MouseEvent) => {
    if (!aktiv?.startet) return;
    e.preventDefault();
    e.stopPropagation();
    nesteKobling();
  };
  const tast = (e: KeyboardEvent) => {
    if (!aktiv?.startet) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      avslutt(false);
      editor.sett({ dra: null });
    } else if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      e.stopPropagation();
      nesteKobling();
    }
  };
  window.addEventListener('pointermove', flytt, true);
  window.addEventListener('pointerup', opp, true);
  window.addEventListener('pointercancel', avbrutt, true);
  window.addEventListener('contextmenu', meny, true);
  window.addEventListener('keydown', tast, true);
  aktiv = {
    kilde,
    startX: ev.clientX,
    startY: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    syklus: 0,
    startet: false,
    rydd: () => {
      window.removeEventListener('pointermove', flytt, true);
      window.removeEventListener('pointerup', opp, true);
      window.removeEventListener('pointercancel', avbrutt, true);
      window.removeEventListener('contextmenu', meny, true);
      window.removeEventListener('keydown', tast, true);
    },
  };
}

function avslutt(slipp: boolean): void {
  const a = aktiv;
  if (!a) return;
  aktiv = null;
  a.rydd();
  if (slipp && a.startet) lerret?.slipp(a.kilde, a.x, a.y, a.syklus, a.startX, a.startY);
  lerret?.avbryt();
  editor.sett({ dra: null });
}

/** Cancel any drag (the view is going away). */
export function avbrytDra(): void {
  avslutt(false);
}
