/**
 * Signgen UI state that is not part of the document (and not in undo):
 * the active tool and transient canvas overlays (snap guides, marquee,
 * measurement).
 */
import { useEffect, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Boks, Vec2 } from '../../core/geometri2d';
import type { Bane, NodeRef } from '../../geometri/bane';
import type { SvgDeler } from './svgdeler';

export type VerktoyId =
  'velg' | 'tekst' | 'rektangel' | 'ellipse' | 'polygon' | 'hull' | 'penn' | 'mal' | 'panorer';

export interface Hjelpelinje {
  akse: 'x' | 'y';
  /** Position on the axis (mm). */
  verdi: number;
  fra: number;
  til: number;
}

/** An imported SVG with several parts, waiting in the part picker. */
export interface SvgOppgave {
  deler: SvgDeler;
  /** Where it goes if put on the sign. */
  rolle: 'ramme' | 'pynt';
  /** The picker was opened from the sign or from the decoration gallery. */
  opphav: 'skilt' | 'galleri';
}

/** Editing the points and curves of one vector (double-click on it). */
export interface KurveRedigering {
  objektId: string;
  /** Selected anchor points. */
  noder: NodeRef[];
  /** Selected whole paths. */
  baner: number[];
  /** A selected segment (Delete takes it out). */
  segment: { bane: number; seg: number } | null;
  /** Repair: how far apart two ends may be and still be joined (mm on the sign). */
  repToleranse: number;
  /** Repair: close what is still open with a straight line. */
  repTving: boolean;
  /** Repair: show what would be joined. */
  repVis: boolean;
}

/** A path being drawn with the pen, in sign coordinates (mm). */
export interface PennUtkast {
  /** The vector the paths are added to (the first path makes a new one). */
  objektId: string | null;
  bane: Bane | null;
  /** Where the pointer is, for the line from the last point. */
  peker: Vec2 | null;
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
  /** The decoration gallery is open. */
  dekor: boolean;
  /** The CSV window («Lag skilt fra CSV») is open. */
  batch: boolean;
  /** The SVG part picker is open for this file. */
  svgdeler: SvgOppgave | null;
  /** The vector whose curves are being edited. */
  kurve: KurveRedigering | null;
  /** The pen tool's path in progress. */
  penn: PennUtkast | null;
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
    dekor: false,
    batch: false,
    svgdeler: null,
    kurve: null,
    penn: null,
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
