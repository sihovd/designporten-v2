/**
 * Editor state that is not saved and not undone: what is selected, the
 * manipulator mode, the print view, and a part being dragged in from the
 * bottom menu. One state per open workbench.
 */
import { signal, type Signal } from '@preact/signals';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Deltype } from './grunnformer';
import type { Ende } from './parametre';

export type Valg = { type: 'del' | 'ledd'; id: string } | null;

export interface Dra {
  type: Deltype;
  /** Pointer position (client px). */
  x: number;
  y: number;
  /** The snap point the part would attach to if dropped now (set by the 3D overlay). */
  mal: Ende | null;
}

export interface CfTilstand {
  valgt: Signal<Valg>;
  modus: Signal<'flytt' | 'roter'>;
  printvisning: Signal<boolean>;
  visKuppel: Signal<boolean>;
  dra: Signal<Dra | null>;
}

const tilstander = new WeakMap<Arbeidsbenk, CfTilstand>();

export function tilstand(benk: Arbeidsbenk): CfTilstand {
  let t = tilstander.get(benk);
  if (!t) {
    t = {
      valgt: signal<Valg>(null),
      modus: signal<'flytt' | 'roter'>('flytt'),
      printvisning: signal(false),
      visKuppel: signal(true),
      dra: signal<Dra | null>(null),
    };
    tilstander.set(benk, t);
  }
  return t;
}
