/**
 * Signgen UI state that is not part of the document (and not in undo):
 * the active tool and transient canvas overlays (snap guides, marquee,
 * measurement).
 */
import { useEffect, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Boks, Vec2 } from '../../core/geometri2d';
import type { Hullform } from '../../core/dokument';
import type { Bane, NodeRef } from '../../geometri/bane';
import type { ProfilId } from '../../geometri/strek';
import type { SvgDeler } from './svgdeler';
import type { Csvsteg } from './csvflyt';

export type VerktoyId =
  'velg' | 'tekst' | 'rektangel' | 'ellipse' | 'polygon' | 'trekant' | 'hull' | 'penn' | 'paint' | 'mal';

/** A line shown while dragging to say what the edge snapped to (transient). */
export interface Snaplinje {
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

/** What dragging and drawing snap to (Sivert, 2026-10-06 §8); the master switch is «Snap» in the tool rail. */
export interface Snapmal {
  rutenett: boolean;
  hjelpelinjer: boolean;
  objekter: boolean;
  sentre: boolean;
}

const SNAP_NOKKEL = 'dp-verksted:snap:signgen';

function lesSnapmal(): Snapmal {
  const std: Snapmal = { rutenett: true, hjelpelinjer: true, objekter: true, sentre: true };
  try {
    const r = JSON.parse(localStorage.getItem(SNAP_NOKKEL) ?? 'null') as Partial<Snapmal> | null;
    if (r && typeof r === 'object') {
      for (const k of Object.keys(std) as (keyof Snapmal)[]) if (typeof r[k] === 'boolean') std[k] = r[k];
    }
  } catch {
    /* blocked or damaged storage: the defaults stand */
  }
  return std;
}

/** A guide being dragged (from a ruler or from the canvas); it is saved once, when the pointer is released. */
export interface GuideDra {
  /** The saved guide that is moved; null for a new one. */
  id: string | null;
  akse: 'x' | 'y';
  verdi: number;
  /** The pointer is back over the ruler: letting go deletes (or never creates) it. */
  tilbake: boolean;
}

/** What a new Paint stroke is drawn with (changed on the bar above the canvas; each stroke keeps its own copy). */
export interface Paintvalg {
  /** Base width (mm). */
  bredde: number;
  profil: ProfilId;
  /** Smoothing of the centre line, 0 to 1. */
  glatt: number;
  /** Taper at the start and end, as a share of the stroke (0 = round). */
  tuppStart: number;
  tuppSlutt: number;
}

export interface Signtilstand {
  verktoy: VerktoyId;
  snaplinjer: Snaplinje[];
  markering: Boks | null;
  maling: { a: Vec2; b: Vec2 } | null;
  /** Form being drawn with a shape tool. */
  utkast: Boks | null;
  /** What the draft is (the wheel changes the number of sides of a polygon while drawing). */
  utkastForm: { form: 'rektangel' | 'ellipse' | 'polygon'; sider: number } | null;
  /** The number of sides last used for polygons (the mouse wheel changes it while drawing). */
  formSider: number;
  /** The shape the Hole tool makes next. */
  hullform: Hullform;
  paint: Paintvalg;
  /** The Paint stroke being drawn: the points so far (model coordinates). */
  paintUtkast: Vec2[] | null;
  /** Live dimension label while dragging (screen anchored in mm space). */
  maletikett: { p: Vec2; tekst: string } | null;
  /** The outline last chosen in the layers panel (highlighted in the inspector). */
  omriss: string | null;
  /** The colour profile window is open (it also opens by itself for a new sign). */
  fargeprofil: boolean;
  /** The project settings window is open (build plate, colours in use, print layer height). */
  prosjektinnstillinger: boolean;
  /** A new sign: which step of the start the user is on (the three entries, then the colours). */
  startsteg: 'valg' | 'farger';
  /** «Fra CSV» was chosen at the start: open the CSV window once the sign has been started. */
  startCsv: boolean;
  /** The template library, or the «Lagre som mal» window, is open. */
  malvindu: 'bibliotek' | 'lagre' | null;
  /** The window for adding fonts (Google Fonts) is open. */
  fontvindu: boolean;
  /** The decoration gallery is open. */
  dekor: boolean;
  /** The «Lagre dekorelement» window: the selected vectors become one gallery element. */
  lagreDekor: boolean;
  /** The CSV workflow's step on screen (null: the workflow is closed). */
  csv: Csvsteg | null;
  /** The generated sign shown in the plates view (CSV row index). */
  csvrad: number | null;
  /** The SVG part picker is open for this file. */
  svgdeler: SvgOppgave | null;
  /** The vector whose curves are being edited. */
  kurve: KurveRedigering | null;
  /** The pen tool's path in progress. */
  penn: PennUtkast | null;
  snapmal: Snapmal;
  /** The guide line chosen on the canvas or in the Justér panel. */
  valgtGuide: string | null;
  guideDra: GuideDra | null;
}

class Lager {
  t: Signtilstand = {
    verktoy: 'velg',
    snaplinjer: [],
    markering: null,
    maling: null,
    utkast: null,
    utkastForm: null,
    formSider: 6,
    hullform: 'sirkel',
    paint: { bredde: 3, profil: 'jevn', glatt: 0.5, tuppStart: 0, tuppSlutt: 0 },
    paintUtkast: null,
    maletikett: null,
    omriss: null,
    fargeprofil: false,
    prosjektinnstillinger: false,
    startsteg: 'valg',
    startCsv: false,
    malvindu: null,
    fontvindu: false,
    dekor: false,
    lagreDekor: false,
    csv: null,
    csvrad: null,
    svgdeler: null,
    kurve: null,
    penn: null,
    snapmal: lesSnapmal(),
    valgtGuide: null,
    guideDra: null,
  };
  private lyttere = new Set<(t: Signtilstand) => void>();
  constructor(private benk: Arbeidsbenk) {}
  sett(d: Partial<Signtilstand>) {
    this.t = { ...this.t, ...d };
    if (d.snapmal) {
      try {
        localStorage.setItem(SNAP_NOKKEL, JSON.stringify(d.snapmal));
      } catch {
        /* storage is optional */
      }
    }
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
