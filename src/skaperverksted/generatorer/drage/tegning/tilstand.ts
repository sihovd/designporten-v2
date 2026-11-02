/**
 * Editor state that is not part of the drawing: the active tool, what is
 * selected, the spike form the spike tool adds and which view shares the
 * lower pane on small screens. Not saved and not in undo history. One store
 * per open workbench, shared by the canvas and the properties panel.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import type { Elementform, Tegning } from './modell';

export type Verktoy = 'juster' | 'tegn' | 'pigg';

export type Valg =
  | { type: 'punkt'; i: number }
  | { type: 'bredde'; i: number }
  | { type: 'hoyde'; i: number }
  | { type: 'element'; id: string }
  | { type: 'del'; i: number }
  | null;

export interface Tegneeditor {
  verktoy: Verktoy;
  valgt: Valg;
  piggform: Elementform;
  /** Small screens: which view shares the pane under the top view. */
  nedre: 'siden' | '3d';
}

const start: Tegneeditor = { verktoy: 'juster', valgt: null, piggform: 'spisse', nedre: 'siden' };

export class Tegnelager {
  private t: Tegneeditor = start;
  private lyttere = new Set<(t: Tegneeditor) => void>();

  get naa(): Tegneeditor {
    return this.t;
  }

  sett(delvis: Partial<Tegneeditor>): void {
    this.t = { ...this.t, ...delvis };
    for (const f of this.lyttere) f(this.t);
  }

  lytt(f: (t: Tegneeditor) => void): () => void {
    this.lyttere.add(f);
    return () => this.lyttere.delete(f);
  }
}

const lagre = new WeakMap<Arbeidsbenk, Tegnelager>();

export function tegnelager(benk: Arbeidsbenk): Tegnelager {
  let l = lagre.get(benk);
  if (!l) {
    l = new Tegnelager();
    lagre.set(benk, l);
  }
  return l;
}

/** Is the selection still there (undo can remove a point or an element)? */
export function gyldigValg(t: Tegning, v: Valg, antallDeler: number): Valg {
  if (!v) return null;
  switch (v.type) {
    case 'punkt':
      return v.i < t.rygg.length ? v : null;
    case 'bredde':
      return v.i < t.bredde.length ? v : null;
    case 'hoyde':
      return v.i < t.hoyde.length ? v : null;
    case 'element':
      return t.elementer.some((e) => e.id === v.id) ? v : null;
    case 'del':
      return v.i < antallDeler ? v : null;
  }
}

export function brukTegneeditor(benk: Arbeidsbenk): [Tegneeditor, Tegnelager] {
  const lager = tegnelager(benk);
  const [t, settT] = useState(lager.naa);
  useEffect(() => {
    settT(lager.naa);
    return lager.lytt(settT);
  }, [lager]);
  return [t, lager];
}
