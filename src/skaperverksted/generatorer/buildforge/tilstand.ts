/**
 * Editor state that is not part of the project (handoff §11, «Avledede data
 * og editorstatus»): selection, Enkel/Avansert, the part being placed, the
 * click preview and the helper layers. Not in undo history, not saved.
 */
import { useEffect, useState } from 'preact/hooks';
import type { FestepunktId } from './bibliotek';

export interface Editortilstand {
  valgt: string | null;
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
}

const START: Editortilstand = {
  valgt: null,
  modus: 'enkel',
  plasserer: null,
  sikter: null,
  trykk: 0,
  visLaast: false,
  visVolum: false,
  visBryter: true,
  merket: [],
};

class Editorlager {
  t: Editortilstand = { ...START };
  private lyttere = new Set<(t: Editortilstand) => void>();
  sett(d: Partial<Editortilstand>): void {
    this.t = { ...this.t, ...d };
    for (const f of this.lyttere) f(this.t);
  }
  nullstill(): void {
    this.sett({ ...START, modus: this.t.modus });
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
