/**
 * Arbeidsbenk (workbench): the runtime state of one open editor.
 * Framework-free. Holds the document history, selection, viewport and the
 * latest built model. UI subscribes via `lytt` (see shell/bruk-benk.ts).
 *
 * Selection and viewport are not in undo history (spec).
 */
import { Historikk, type Endring } from './historikk';
import type { Dokument, ObjektId, LagId } from './dokument';
import type { GeneratorPlugin, Modellresultat } from './generator';

export interface Utsnitt {
  /** Screen px per mm is zoom × PX_PER_MM. */
  zoom: number;
  /** Model coordinate (mm) at the centre of the canvas. */
  senterX: number;
  senterY: number;
}

export interface Utvalg {
  objekter: ObjektId[];
  lag: LagId | null;
}

export interface Innstillinger {
  snap: boolean;
  rutenett: boolean;
  visning: '2d' | '3d';
  /** Which mobile sheet is open. */
  ark: 'ingen' | 'lag' | 'egenskaper' | 'bibliotek';
  /** Wide screens: the inspector is showing (always, unless the generator is canvas first). */
  inspektor: boolean;
}

export interface BenkTilstand {
  dok: Dokument;
  utvalg: Utvalg;
  utsnitt: Utsnitt;
  /** False until the view has been fitted or moved (views fit on first show). */
  utsnittSatt: boolean;
  innstillinger: Innstillinger;
  modell: Modellresultat | null;
  bygger: boolean;
  melding: string | null;
}

type Lytter = (t: BenkTilstand) => void;

export class Arbeidsbenk {
  readonly historikk: Historikk<Dokument>;
  private t: BenkTilstand;
  private lyttere = new Set<Lytter>();
  private byggNr = 0;
  private byggTidsur: ReturnType<typeof setTimeout> | undefined;
  /**
   * View commands registered by the active view (tilpass, zoom-100,
   * zoom-inn, zoom-ut, tegn) so shortcuts and toolbars can drive whichever
   * view is showing.
   */
  readonly kommandoer = new Map<string, () => void>();

  constructor(
    readonly generator: GeneratorPlugin,
    dok: Dokument,
  ) {
    this.historikk = new Historikk(dok);
    this.t = {
      dok,
      utvalg: { objekter: [], lag: dok.lag.at(-1)?.id ?? null },
      utsnitt: { zoom: 1, senterX: 0, senterY: 0 },
      utsnittSatt: false,
      innstillinger: {
        snap: true,
        rutenett: true,
        visning: generator.visninger[0] ?? '2d',
        ark: 'ingen',
        inspektor: !generator.lerretForst,
      },
      modell: null,
      bygger: false,
      melding: null,
    };
    this.historikk.lytt((d) => {
      this.oppdater({ dok: d, utvalg: this.rensUtvalg(d, this.t.utvalg) });
      this.planleggBygg();
    });
    this.planleggBygg(0);
  }

  get tilstand(): BenkTilstand {
    return this.t;
  }

  get dok(): Dokument {
    return this.t.dok;
  }

  lytt(fn: Lytter): () => void {
    this.lyttere.add(fn);
    return () => this.lyttere.delete(fn);
  }

  /** Apply a document change through history. */
  endre(e: Endring<Dokument>): void {
    this.historikk.utfor({
      ...e,
      anvend: (d) => {
        const ny = e.anvend(d);
        return ny === d ? d : { ...ny, meta: { ...ny.meta, endret: new Date().toISOString() } };
      },
    });
  }

  angre(): void {
    if (this.historikk.angre()) this.melde(`Angret: ${this.historikk.nesteGjorOm ?? ''}`);
  }

  gjorOm(): void {
    if (this.historikk.gjorOm()) this.melde(`Gjort om: ${this.historikk.nesteAngre ?? ''}`);
  }

  velg(utvalg: Partial<Utvalg>): void {
    this.oppdater({ utvalg: this.rensUtvalg(this.t.dok, { ...this.t.utvalg, ...utvalg }) });
  }

  settUtsnitt(u: Partial<Utsnitt>): void {
    const zoom = Math.min(40, Math.max(0.05, u.zoom ?? this.t.utsnitt.zoom));
    this.oppdater({ utsnitt: { ...this.t.utsnitt, ...u, zoom }, utsnittSatt: true });
  }

  /** Run a registered view command; returns false if no view offers it. */
  kommando(navn: string): boolean {
    const f = this.kommandoer.get(navn);
    f?.();
    return !!f;
  }

  settInnstillinger(i: Partial<Innstillinger>): void {
    this.oppdater({ innstillinger: { ...this.t.innstillinger, ...i } });
  }

  /** Short status text for the live region (screen readers) and status bar. */
  melde(tekst: string | null): void {
    this.oppdater({ melding: tekst });
  }

  /** Replace the document (load project). Clears history. */
  lastInn(dok: Dokument): void {
    this.historikk.nullstill(dok);
    this.oppdater({ utvalg: { objekter: [], lag: dok.lag.at(-1)?.id ?? null } });
  }

  private rensUtvalg(d: Dokument, u: Utvalg): Utvalg {
    const objekter = u.objekter.filter((id) => d.objekter[id]);
    const lag = u.lag && d.lag.some((l) => l.id === u.lag) ? u.lag : (d.lag.at(-1)?.id ?? null);
    return objekter.length === u.objekter.length && lag === u.lag ? u : { objekter, lag };
  }

  private oppdater(delvis: Partial<BenkTilstand>): void {
    this.t = { ...this.t, ...delvis };
    for (const fn of this.lyttere) fn(this.t);
  }

  /** Rebuild the model after changes, debounced; stale results are dropped. */
  private planleggBygg(forsinkelse = 120): void {
    clearTimeout(this.byggTidsur);
    this.byggTidsur = setTimeout(() => void this.bygg(), forsinkelse);
  }

  async bygg(): Promise<Modellresultat> {
    const nr = ++this.byggNr;
    const dok = this.t.dok;
    this.oppdater({ bygger: true });
    let resultat: Modellresultat;
    try {
      resultat = await this.generator.byggModell(dok);
    } catch (feil) {
      console.error(feil);
      resultat = { deler: [], advarsler: [{ niva: 'feil', tekst: 'Modellen kunne ikke bygges.' }] };
    }
    if (nr === this.byggNr) this.oppdater({ modell: resultat, bygger: false });
    return resultat;
  }

  avslutt(): void {
    clearTimeout(this.byggTidsur);
    this.lyttere.clear();
  }
}
