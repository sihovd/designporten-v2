/**
 * Editor state that is not part of the project (handoff §11, «Avledede data
 * og editorstatus»): selection, Enkel/Avansert, the part being placed, the
 * click preview and the helper layers. Not in undo history, not saved.
 */
import { useEffect, useState } from 'preact/hooks';
import type { FestepunktId } from './bibliotek';

export interface Editortilstand {
  /** Selected shape (inside a part, or on a clicker). */
  valgt: string | null;
  /** Modular builder: the selected part, when working on the whole model. */
  kropp: string | null;
  /** Modular builder: the part being worked inside (Sub-part Mode, handoff §25). */
  inne: string | null;
  /** «La oss bygge …» is showing. */
  startvelger: boolean;
  /** A library part waiting for a connector, a part to replace or the plate (without dragging). */
  plassererKropp: string | null;
  /** «Bytt ut»: the next library part chosen replaces this part. */
  erstatter: string | null;
  /** A drag in progress, for the hint over the canvas. */
  dra: Drastatus | null;
  /** The radial menu (handoff §37), centred at CSS px inside the 3D view. */
  meny: { x: number; y: number; mal: Menymal } | null;
  /** Shift+click: several parts selected on the whole model (handoff §7). */
  flere: string[];
  /** Inside a part: the selected connector. */
  kobling: string | null;
  /** Inside a part: the next click on the part's surface adds a connector there. */
  nyKobling: boolean;
  /** Left panel tab. */
  fane: 'bibliotek' | 'modell';
  /** Inside a part: hide the other parts instead of fading them (handoff §26). */
  skjulAndre: boolean;
  modus: 'enkel' | 'avansert';
  /** Library part waiting for an attachment point. */
  plasserer: string | null;
  /** Attachment point under the pointer or keyboard focus while placing. */
  sikter: FestepunktId | null;
  /** Click preview: how far the top is pressed (mm). */
  trykk: number;
  visLaast: boolean;
  visVolum: boolean;
  visBryter: boolean;
  /** Shapes pointed out by a selected finding. */
  merket: string[];
  /** What the handles on the selected shape do. */
  verktoy: Verktoy;
}

/** What the radial menu is for. */
export type Menymal =
  | { type: 'kropp'; id: string }
  | { type: 'form'; id: string }
  | { type: 'kobling'; kropp: string; kobling: string }
  | { type: 'flere'; ider: string[] }
  | { type: 'tom' };

export interface Drastatus {
  type: 'koble' | 'erstatt' | 'los' | 'ugyldig';
  tekst: string;
  /** Which of the dragged part's fitting connectors is active (1-based) and how many there are. */
  indeks: number;
  antall: number;
}

export type Verktoy = 'flytt' | 'roter' | 'skaler';
export const verktoynavn: Record<Verktoy, string> = { flytt: 'Flytt', roter: 'Roter', skaler: 'Skaler' };

const START: Editortilstand = {
  valgt: null,
  kropp: null,
  inne: null,
  startvelger: false,
  plassererKropp: null,
  erstatter: null,
  dra: null,
  meny: null,
  flere: [],
  kobling: null,
  nyKobling: false,
  skjulAndre: false,
  fane: 'bibliotek',
  modus: 'enkel',
  plasserer: null,
  sikter: null,
  trykk: 0,
  visLaast: false,
  visVolum: false,
  visBryter: true,
  merket: [],
  verktoy: 'flytt',
};

class Editorlager {
  t: Editortilstand = { ...START };
  private lyttere = new Set<(t: Editortilstand) => void>();
  sett(d: Partial<Editortilstand>): void {
    this.t = { ...this.t, ...d };
    for (const f of this.lyttere) f(this.t);
  }
  nullstill(): void {
    this.sett({ ...START, modus: this.t.modus, verktoy: this.t.verktoy, skjulAndre: this.t.skjulAndre });
  }
  lytt(f: (t: Editortilstand) => void): () => void {
    this.lyttere.add(f);
    return () => this.lyttere.delete(f);
  }
}

/** One BuildForge editor is open per page, so one store is enough. */
export const editor = new Editorlager();

export function brukEditor(): Editortilstand {
  const [t, settT] = useState(editor.t);
  useEffect(() => {
    settT(editor.t);
    return editor.lytt(settT);
  }, []);
  return t;
}
