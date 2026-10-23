/** Undoable project changes. Every change goes through the workbench history with a Norwegian name. */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument } from '../../core/dokument';
import { grunnformer, type Deltype } from './grunnformer';
import { GRENSER, type CfParametre, type Del, type Ende, type Kuppel, type Ledd } from './parametre';
import { koble, leggTilRot, slett, type Resultat } from './plassering';
import { tilstand } from './tilstand';

export const les = (dok: Dokument): CfParametre => dok.parametre as unknown as CfParametre;

function endre(
  benk: Arbeidsbenk,
  navn: string,
  f: (p: CfParametre) => CfParametre,
  slaSammen?: string,
): void {
  benk.endre({
    navn,
    slaSammen,
    anvend: (d) => {
      const ny = f(les(d));
      return ny === les(d) ? d : { ...d, parametre: ny as unknown as Record<string, unknown> };
    },
  });
}

function utfor(benk: Arbeidsbenk, navn: string, r: Resultat): boolean {
  if (!r.ok) {
    benk.melde(r.grunn);
    return false;
  }
  endre(benk, navn, () => r.p);
  tilstand(benk).valgt.value = { type: 'del', id: r.id };
  benk.melde(`${navn}.`);
  return true;
}

export function leggTilForste(benk: Arbeidsbenk, type: Deltype): boolean {
  return utfor(benk, `La til ${grunnformer[type].navn.toLowerCase()}`, leggTilRot(les(benk.dok), type));
}

export function fest(benk: Arbeidsbenk, type: Deltype, forelder: Ende): boolean {
  return utfor(benk, `Festet ${grunnformer[type].navn.toLowerCase()}`, koble(les(benk.dok), type, forelder));
}

export function slettDel(benk: Arbeidsbenk, id: string): void {
  const d = les(benk.dok).deler.find((x) => x.id === id);
  if (!d) return;
  endre(benk, `Slettet ${d.navn.toLowerCase()}`, (p) => slett(p, id));
  tilstand(benk).valgt.value = null;
}

export function settDel(
  benk: Arbeidsbenk,
  id: string,
  navn: string,
  endring: Partial<Del>,
  slaSammen?: string,
): void {
  endre(
    benk,
    navn,
    (p) => ({ ...p, deler: p.deler.map((d) => (d.id === id ? { ...d, ...endring } : d)) }),
    slaSammen && `${slaSammen}:${id}`,
  );
}

export function settLedd(
  benk: Arbeidsbenk,
  id: string,
  navn: string,
  endring: Partial<Ledd>,
  slaSammen?: string,
): void {
  endre(
    benk,
    navn,
    (p) => ({ ...p, ledd: p.ledd.map((l) => (l.id === id ? { ...l, ...endring } : l)) }),
    slaSammen && `${slaSammen}:${id}`,
  );
}

export function settKuppel(
  benk: Arbeidsbenk,
  id: string,
  navn: string,
  endring: Partial<Kuppel>,
  slaSammen?: string,
): void {
  endre(
    benk,
    navn,
    (p) => ({
      ...p,
      ledd: p.ledd.map((l) => (l.id === id ? { ...l, kuppel: { ...l.kuppel, ...endring } } : l)),
    }),
    slaSammen && `${slaSammen}:${id}`,
  );
}

export function settToleranse(
  benk: Arbeidsbenk,
  hva: 'klaring' | 'spillerom',
  verdi: number | undefined,
): void {
  const g = GRENSER[hva];
  endre(
    benk,
    verdi === undefined ? `Tilbakestilte ${hva}` : `Endret ${hva}`,
    (p) => {
      const t = { ...(p.toleranser ?? {}) };
      if (verdi === undefined) delete t[hva];
      else t[hva] = Math.min(g.maks, Math.max(g.min, verdi));
      return { ...p, toleranser: Object.keys(t).length ? t : undefined };
    },
    verdi === undefined ? undefined : `toleranse:${hva}`,
  );
}
