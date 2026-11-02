/**
 * Brick editor state that is not part of the project: the selection, a
 * library brick waiting for a point, a point waiting for a partner, the
 * previewed connection and a pending swap. Not saved and not in undo
 * history (spec: selection and viewport are not history). One store per
 * open workbench.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import { finnInstans, koble, leggTilOgKoble, type Resultat } from './graf';
import type { Brikkeprosjekt, Ende } from './modell';

/** A connection shown as a preview before it is made (DF-01). */
export type Kandidat =
  { type: 'ny'; definisjon: string; punkt: string; mal: Ende } | { type: 'koble'; flytt: Ende; mal: Ende };

export interface Brikkeeditor {
  valgt: string | null;
  /** A library brick waiting for a free point (or «Legg løst på platen»). */
  plasserer: string | null;
  /** A free point on a placed brick waiting for a partner. */
  kilde: Ende | null;
  kandidat: Kandidat | null;
  /** «Bytt»: the next library brick chosen replaces this one (after the consequences are shown). */
  bytter: string | null;
  bytteTil: string | null;
}

const tom: Brikkeeditor = {
  valgt: null,
  plasserer: null,
  kilde: null,
  kandidat: null,
  bytter: null,
  bytteTil: null,
};

export class Editorlager {
  private t: Brikkeeditor = tom;
  private lyttere = new Set<(t: Brikkeeditor) => void>();

  get naa(): Brikkeeditor {
    return this.t;
  }

  sett(delvis: Partial<Brikkeeditor>): void {
    this.t = { ...this.t, ...delvis };
    for (const f of this.lyttere) f(this.t);
  }

  /** Leave every pending action (Esc, «Avbryt»), keep the selection. */
  avbryt(): void {
    this.sett({ plasserer: null, kilde: null, kandidat: null, bytter: null, bytteTil: null });
  }

  lytt(f: (t: Brikkeeditor) => void): () => void {
    this.lyttere.add(f);
    return () => this.lyttere.delete(f);
  }
}

const lagre = new WeakMap<Arbeidsbenk, Editorlager>();

export function editorFor(benk: Arbeidsbenk): Editorlager {
  let l = lagre.get(benk);
  if (!l) {
    l = new Editorlager();
    lagre.set(benk, l);
  }
  return l;
}

/** The editor state, cleaned against the current project (undo can remove a selected brick). */
export function brukEditor(benk: Arbeidsbenk, p: Brikkeprosjekt): [Brikkeeditor, Editorlager] {
  const lager = editorFor(benk);
  const [t, settT] = useState(lager.naa);
  useEffect(() => {
    settT(lager.naa);
    return lager.lytt(settT);
  }, [lager]);
  const finnes = (id: string | null | undefined) => !id || !!finnInstans(p, id);
  const rent: Brikkeeditor = {
    ...t,
    valgt: finnes(t.valgt) ? t.valgt : null,
    kilde: t.kilde && finnes(t.kilde.instans) ? t.kilde : null,
    bytter: finnes(t.bytter) ? t.bytter : null,
    kandidat:
      t.kandidat &&
      finnes(t.kandidat.mal.instans) &&
      (t.kandidat.type === 'ny' || finnes(t.kandidat.flytt.instans))
        ? t.kandidat
        : null,
  };
  return [rent, lager];
}

/** The project after the previewed connection, or why it cannot be made. */
export function forhandsvis(p: Brikkeprosjekt, k: Kandidat): Resultat {
  return k.type === 'ny' ? leggTilOgKoble(p, k.definisjon, k.punkt, k.mal) : koble(p, k.flytt, k.mal);
}
