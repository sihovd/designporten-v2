/**
 * Generator plug-in contract (spec: skaperverksted.md, "Ecosystem").
 * Everything else (shell, canvas, grid, units, selection, history, 2D/3D,
 * materials, export, order hand-off, autosave) is shared. Adding a generator
 * means adding one folder under src/skaperverksted/generatorer/ and one line
 * in src/skaperverksted/generatorer/index.ts.
 */
import type { ComponentType } from 'preact';
import type { Dokument } from './dokument';
import type { ModellDel } from '../geometri/mesh';
import type { Arbeidsbenk } from './arbeidsbenk';

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
  Overlegg3d?: ComponentType<{ benk: Arbeidsbenk }>;
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
   * Build printable parts from the document. Pure and deterministic; may run
   * in a worker. Throws nothing: problems become advarsler.
   */
  byggModell(dok: Dokument): Promise<Modellresultat>;
  ui: GeneratorUi;
  /** Development-geometry notice (e.g. dragon parts not final). */
  utviklingsgeometri?: string;
}
