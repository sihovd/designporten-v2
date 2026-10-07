/**
 * Generator plug-in contract (spec: skaperverksted.md, "Ecosystem").
 * Everything else (shell, canvas, grid, units, selection, history, 2D/3D,
 * materials, export, order hand-off, autosave) is shared. Adding a generator
 * means adding one folder under src/skaperverksted/generatorer/ and one line
 * in src/skaperverksted/generatorer/index.ts.
 */
import type { ComponentType } from 'preact';
import type * as THREE from 'three';
import type { Dokument } from './dokument';
import type { ModellDel } from '../geometri/mesh';
import type { Arbeidsbenk } from './arbeidsbenk';
import type { Romspek } from '../shell/paneler/modell';

export type GeneratorStatus = 'tilgjengelig' | 'under-utvikling';

export interface Advarsel {
  niva: 'info' | 'advarsel' | 'feil';
  tekst: string;
  objektId?: string;
  lagId?: string;
}

export interface Modellresultat {
  deler: ModellDel[];
  advarsler: Advarsel[];
}

/** UI contributions a generator plugs into the shared shell. */
export interface GeneratorUi {
  /** Main 2D workspace (canvas) if the generator has one. */
  Lerret2d?: ComponentType<{ benk: Arbeidsbenk }>;
  /** Tool rail entries. */
  Verktoy?: ComponentType<{ benk: Arbeidsbenk }>;
  /** Left panel: layers, parts or picker. */
  Venstrepanel?: ComponentType<{ benk: Arbeidsbenk }>;
  /** Right panel: inspector for the current selection / parameters. */
  Inspektor: ComponentType<{ benk: Arbeidsbenk }>;
  /** Bottom tray (e.g. variant pickers). */
  Bunnbrett?: ComponentType<{ benk: Arbeidsbenk }>;
  /** Overlays on the 3D view (e.g. direct-manipulation handles). */
  Overlegg3d?: ComponentType<{ benk: Arbeidsbenk; scene: Scene3d }>;
  /**
   * Dockable panels (wide screens). With these the shell replaces the fixed
   * left panel and inspector by a panel system: dock left or right, float,
   * tabs, minimise, close and reopen, and saved workspaces. Small screens
   * keep the bottom sheets built from `Venstrepanel` and `Inspektor`.
   */
  Paneler?: PanelDef[];
  /** Workspaces (panel arrangements) shipped with the generator; the first is the default. */
  Arbeidsrom?: Romspek[];
  /** Extra entries in the Fil menu (for example «Lagre som mal»). Rendered as menu items. */
  Filvalg?: ComponentType<{ benk: Arbeidsbenk }>;
}

export interface PanelDef {
  id: string;
  navn: string;
  Innhold: ComponentType<{ benk: Arbeidsbenk }>;
  /** Size when the panel floats and the workspace says nothing else. */
  flytB?: number;
  flytH?: number;
  /** When opened by name (not from the Paneler menu) it joins this panel's group as a tab. */
  fane?: string;
}

/**
 * What the shared 3D view offers generators. Model space is millimetres
 * with Z up; the view uses the same axes (camera.up = +Z).
 */
export interface Scene3d {
  three: typeof THREE;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lerret: HTMLCanvasElement;
  /** Group holding the built model's meshes (one child per part, userData.delId). */
  modell: THREE.Group;
  /** Request a redraw (the view renders on demand). */
  tegn(): void;
  /** Model point (mm) → CSS px inside the view; synlig=false when behind the camera. */
  prosjiser(x: number, y: number, z: number): { x: number; y: number; synlig: boolean };
  /** Ray from a CSS px position inside the view. */
  straale(sx: number, sy: number): THREE.Raycaster;
  /** Enable/disable orbiting while a generator handle is dragged. */
  settKameraStyring(pa: boolean): void;
  /** Frame a box (model mm) from the current viewing direction, e.g. one part of the model. */
  fokuser(min: [number, number, number], maks: [number, number, number]): void;
}

/** Light-weight description for the hub and routes (no UI code). */
export interface GeneratorMeta {
  id: string;
  navn: string;
  /** Norwegian descriptor, e.g. «skiltgenerator». */
  undertittel: string;
  /** One sentence for the hub card. */
  beskrivelse: string;
  status: GeneratorStatus;
  /** Sort order in the hub. */
  rekkefolge: number;
  /** Concept image key in src/lib/ressurser.ts (utklippbilder), if any. */
  bilde?: string;
}

export interface GeneratorPlugin {
  id: string;
  navn: string;
  /** One sentence for the hub card. */
  beskrivelse: string;
  status: GeneratorStatus;
  /** Views this generator supports; the first is the default. */
  visninger: ('2d' | '3d')[];
  nyttDokument(): Dokument;
  /**
   * Bring a stored document (autosave or opened file) up to date with the
   * generator's current structure. Pure; returns the input when nothing changes.
   */
  lesInn?(dok: Dokument): Dokument;
  /**
   * Build printable parts from the document. Pure and deterministic; may run
   * in a worker. Throws nothing: problems become advarsler.
   */
  byggModell(dok: Dokument): Promise<Modellresultat>;
  ui: GeneratorUi;
  /** Name of the left panel on small screens and for screen readers (default «Lag»). */
  venstrepanelNavn?: string;
  /**
   * Canvas first: no tool rail column, and on wide screens the inspector
   * floats over the canvas only when asked for (the «Egenskaper» button,
   * or the generator setting `innstillinger.inspektor`). Small screens keep
   * their sheets.
   */
  lerretForst?: boolean;
  /**
   * Without an account the open project is kept in this browser, one per
   * tool. With this set it is deleted when it has not been opened for
   * `maksDager` days, and the user is told so (Sivert, 2026-10-06, §23).
   */
  gjestelagring?: { maksDager: number };
  /** Development-geometry notice (e.g. dragon parts not final). */
  utviklingsgeometri?: string;
  /**
   * Parts overlap in space (e.g. details sunk into a body). Summed part
   * volumes then overstate the solid volume, so the shell shows it as an
   * upper bound.
   */
  delerOverlapper?: boolean;
  /**
   * Generator keyboard shortcuts (Delete, Ctrl+D, arrows …). Called by the
   * shell for keys outside text fields; return true when handled.
   */
  hurtigtaster?: (e: KeyboardEvent, benk: Arbeidsbenk) => boolean;
  /** Shortcut list for the help overlay: [keys, description]. */
  hurtigtastListe?: [string, string][];
  /** Optional 3D material per part (default: material colour, PBR from the material type). */
  material3d?: (del: ModellDel, three: typeof THREE) => THREE.Material;
  /** Optional scene setup (lights, helpers). Return a cleanup function. */
  tilpass3d?: (scene: Scene3d, benk: Arbeidsbenk) => (() => void) | void;
  /**
   * Product mapping for «Bestill» (spec: ecosystem item 5). The cart line
   * references the stored design. Prices are never invented: enhetspris
   * stays null until a confirmed price rule exists.
   */
  bestilling?: (
    dok: Dokument,
    modell: Modellresultat,
  ) => { produktId: string; navn: string; valg: Record<string, string> };
  /**
   * Generator rules for the export review (optional). Without it every
   * model can be downloaded as one 3MF and one combined STL.
   */
  eksport?: (dok: Dokument, modell: Modellresultat, benk?: Arbeidsbenk) => Eksportregler;
}

export interface Eksportregler {
  /** File export is blocked; says why. Saving the project stays possible. */
  sperret?: string;
  /** Shown above the downloads (for example a prototype notice). */
  merknad?: string;
  /** Offer one STL per part instead of one combined STL. */
  stlPerDel?: boolean;
  /** A file that belongs with the export, built from the same model (for example a control report). */
  vedlegg?: { navn: string; filnavn: string; innhold: string; type: string };
  /** Other ways to export, as buttons next to the downloads (for example «Eksporter via CSV»). */
  handlinger?: { navn: string; hjelp?: string; kjor: () => void }[];
}
