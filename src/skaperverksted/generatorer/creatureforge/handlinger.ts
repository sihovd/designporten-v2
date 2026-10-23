/**
 * Undoable project changes. Every change goes through the workbench history with a Norwegian name.
 * With symmetry on, a change on one side is made on the other side in the same step (`symmetri.ts`).
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument } from '../../core/dokument';
import { grunnformer, type Deltype } from './grunnformer';
import { GRENSER, valider, type CfParametre, type Del, type Ende, type Kuppel, type Ledd } from './parametre';
import { koble, leggTilRot, slett, type Resultat } from './plassering';
import { partner, partnerLedd, speiletFeste, speilKuppelendring, speilLeddendring } from './symmetri';
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

export function leggTilForste(benk: Arbeidsbenk, type: Deltype, variant?: string): boolean {
  return utfor(
    benk,
    `La til ${grunnformer[type].navn.toLowerCase()}`,
    leggTilRot(les(benk.dok), type, variant),
  );
}

/** Attaches a part; with symmetry on, the same part goes on the matching free point on the other side. */
export function fest(benk: Arbeidsbenk, type: Deltype, forelder: Ende, variant?: string): boolean {
  const p = les(benk.dok);
  const r = koble(p, type, forelder, variant);
  if (!r.ok || !p.symmetri) return utfor(benk, `Festet ${grunnformer[type].navn.toLowerCase()}`, r);
  const motsatt = speiletFeste(r.p, forelder);
  const ledig =
    motsatt && !r.p.ledd.some((l) => l.forelder.del === motsatt.del && l.forelder.punkt === motsatt.punkt);
  const par = ledig ? koble(r.p, type, motsatt, variant) : null;
  if (!par?.ok) return utfor(benk, `Festet ${grunnformer[type].navn.toLowerCase()}`, r);
  return utfor(benk, `Festet to ${grunnformer[type].navn.toLowerCase()}`, { ok: true, p: par.p, id: r.id });
}

/** The part and, with symmetry on, its partner. */
const medPartner = (p: CfParametre, id: string): string[] => {
  const m = p.symmetri ? partner(p, id) : null;
  return m ? [id, m] : [id];
};

export function slettDel(benk: Arbeidsbenk, id: string): void {
  const p = les(benk.dok);
  const d = p.deler.find((x) => x.id === id);
  if (!d) return;
  const ider = medPartner(p, id);
  endre(benk, `Slettet ${d.navn.toLowerCase()}`, (q) => ider.reduce((acc, x) => slett(acc, x), q));
  tilstand(benk).valgt.value = null;
}

export function settDel(
  benk: Arbeidsbenk,
  id: string,
  navn: string,
  endring: Partial<Del>,
  slaSammen?: string,
): void {
  const p = les(benk.dok);
  // a name and the root's place belong to the part itself
  const speiles = !('navn' in endring || 'posisjon' in endring || 'rotasjon' in endring);
  const ider = speiles ? medPartner(p, id) : [id];
  const ny = { ...p, deler: p.deler.map((d) => (ider.includes(d.id) ? { ...d, ...endring } : d)) };
  if (endring.variant !== undefined) {
    // a shape without a point that holds a joint would break the figure
    const v = valider(ny);
    if (!v.ok) {
      benk.melde('Den formen mangler et punkt som har et ledd. Fjern delen som henger der først.');
      return;
    }
  }
  endre(benk, navn, () => ny, slaSammen && `${slaSammen}:${id}`);
}

/** A joint change; with symmetry on, mirrored on the other side's joint. */
export function settLedd(
  benk: Arbeidsbenk,
  id: string,
  navn: string,
  endring: Partial<Ledd>,
  slaSammen?: string,
): void {
  const p = les(benk.dok);
  const motsatt = p.symmetri ? partnerLedd(p, id) : undefined;
  const speilet = speilLeddendring(endring);
  endre(
    benk,
    navn,
    (q) => ({
      ...q,
      ledd: q.ledd.map((l) =>
        l.id === id ? { ...l, ...endring } : l.id === motsatt?.id ? { ...l, ...speilet } : l,
      ),
    }),
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
  const p = les(benk.dok);
  const motsatt = p.symmetri ? partnerLedd(p, id) : undefined;
  const speilet = speilKuppelendring(endring);
  endre(
    benk,
    navn,
    (q) => ({
      ...q,
      ledd: q.ledd.map((l) =>
        l.id === id
          ? { ...l, kuppel: { ...l.kuppel, ...endring } }
          : l.id === motsatt?.id
            ? { ...l, kuppel: { ...l.kuppel, ...speilet } }
            : l,
      ),
    }),
    slaSammen && `${slaSammen}:${id}`,
  );
}

export function settSymmetri(benk: Arbeidsbenk, pa: boolean): void {
  endre(benk, pa ? 'Slo på symmetri' : 'Slo av symmetri', (p) => ({ ...p, symmetri: pa || undefined }));
  benk.melde(pa ? 'Symmetri er på: endringer gjøres på begge sider.' : 'Symmetri er av.');
}

/** The part on the other side, for the panel (only with symmetry on). */
export function speilpartner(p: CfParametre, delId: string): string | null {
  return p.symmetri ? partner(p, delId) : null;
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
