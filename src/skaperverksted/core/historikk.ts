/**
 * Undo/redo. Every document change goes through `utfor` with a Norwegian
 * label. Documents are immutable values, so history stores snapshots
 * (structural sharing keeps this cheap). Consecutive changes with the same
 * `slaSammen` key inside the time window merge into one step, so a drag or
 * a slider move is one undo step.
 */

export interface Endring<T> {
  navn: string;
  /** Pure: returns the next state. Must not mutate the input. */
  anvend: (forrige: T) => T;
  /** Merge with the previous step when the keys match (drags, sliders). */
  slaSammen?: string;
}

interface Steg<T> {
  navn: string;
  for: T;
  etter: T;
  nokkel?: string;
  tid: number;
}

export class Historikk<T> {
  private angreStabel: Steg<T>[] = [];
  private gjorOmStabel: Steg<T>[] = [];
  private lyttere = new Set<(tilstand: T) => void>();

  constructor(
    private tilstand: T,
    private readonly maks = 200,
    private readonly vindu = 800,
    private readonly klokke: () => number = () => Date.now(),
  ) {}

  get naa(): T {
    return this.tilstand;
  }

  get kanAngre(): boolean {
    return this.angreStabel.length > 0;
  }

  get kanGjoreOm(): boolean {
    return this.gjorOmStabel.length > 0;
  }

  get nesteAngre(): string | undefined {
    return this.angreStabel.at(-1)?.navn;
  }

  get nesteGjorOm(): string | undefined {
    return this.gjorOmStabel.at(-1)?.navn;
  }

  utfor(e: Endring<T>): T {
    const for_ = this.tilstand;
    const etter = e.anvend(for_);
    if (etter === for_) return for_;
    const tid = this.klokke();
    const siste = this.angreStabel.at(-1);
    if (e.slaSammen && siste && siste.nokkel === e.slaSammen && tid - siste.tid < this.vindu) {
      siste.etter = etter;
      siste.tid = tid;
    } else {
      this.angreStabel.push({ navn: e.navn, for: for_, etter, nokkel: e.slaSammen, tid });
      if (this.angreStabel.length > this.maks) this.angreStabel.shift();
    }
    this.gjorOmStabel = [];
    this.sett(etter);
    return etter;
  }

  /** End merging (call on pointer up) so the next change becomes a new step. */
  avsluttSammenslaing(): void {
    const siste = this.angreStabel.at(-1);
    if (siste) siste.nokkel = undefined;
  }

  angre(): boolean {
    const steg = this.angreStabel.pop();
    if (!steg) return false;
    this.gjorOmStabel.push(steg);
    this.sett(steg.for);
    return true;
  }

  gjorOm(): boolean {
    const steg = this.gjorOmStabel.pop();
    if (!steg) return false;
    this.angreStabel.push({ ...steg, nokkel: undefined });
    this.sett(steg.etter);
    return true;
  }

  /** Replace state without history (loading a project). */
  nullstill(tilstand: T): void {
    this.angreStabel = [];
    this.gjorOmStabel = [];
    this.sett(tilstand);
  }

  lytt(fn: (tilstand: T) => void): () => void {
    this.lyttere.add(fn);
    return () => this.lyttere.delete(fn);
  }

  private sett(t: T): void {
    this.tilstand = t;
    for (const fn of this.lyttere) fn(t);
  }
}
