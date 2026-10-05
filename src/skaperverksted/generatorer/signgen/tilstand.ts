/**
 * Signgen UI state that is not part of the document (and not in undo):
 * the active tool and transient canvas overlays (snap guides, marquee,
 * measurement).
 */
import { useEffect, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Boks, Vec2 } from '../../core/geometri2d';

export type VerktoyId = 'velg' | 'tekst' | 'rektangel' | 'ellipse' | 'polygon' | 'hull' | 'mal' | 'panorer';

export interface Hjelpelinje {
  akse: 'x' | 'y';
  /** Position on the axis (mm). */
  verdi: number;
  fra: number;
  til: number;
}

export interface Signtilstand {
  verktoy: VerktoyId;
  hjelpelinjer: Hjelpelinje[];
  markering: Boks | null;
  maling: { a: Vec2; b: Vec2 } | null;
  /** Form being drawn with a shape tool. */
  utkast: Boks | null;
  /** Live dimension label while dragging (screen anchored in mm space). */
  maletikett: { p: Vec2; tekst: string } | null;
  /** The outline last chosen in the layers panel (highlighted in the inspector). */
  omriss: string | null;
  /** The colour profile window is open (it also opens by itself for a new sign). */
  fargeprofil: boolean;
}

class Lager {
  t: Signtilstand = {
    verktoy: 'velg',
    hjelpelinjer: [],
    markering: null,
    maling: null,
    utkast: null,
    maletikett: null,
    omriss: null,
    fargeprofil: false,
  };
  private lyttere = new Set<(t: Signtilstand) => void>();
  constructor(private benk: Arbeidsbenk) {}
  sett(d: Partial<Signtilstand>) {
    this.t = { ...this.t, ...d };
    for (const f of this.lyttere) f(this.t);
    this.benk.kommando('tegn');
  }
  lytt(f: (t: Signtilstand) => void) {
    this.lyttere.add(f);
    return () => this.lyttere.delete(f);
  }
}

const lagre = new WeakMap<Arbeidsbenk, Lager>();

export function signtilstand(benk: Arbeidsbenk): Lager {
  let l = lagre.get(benk);
  if (!l) {
    l = new Lager(benk);
    lagre.set(benk, l);
  }
  return l;
}

export function brukSigntilstand(benk: Arbeidsbenk): Signtilstand {
  const l = signtilstand(benk);
  const [t, settT] = useState(l.t);
  useEffect(() => {
    settT(l.t);
    return l.lytt(settT);
  }, [l]);
  return t;
}
