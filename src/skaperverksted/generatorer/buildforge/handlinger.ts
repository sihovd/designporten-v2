/**
 * Project changes, each one undoable step through the workbench history
 * (handoff §4: «Slipp utfører én angrebar transaksjon»).
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { nyId } from '../../core/dokument';
import { klem } from '../../core/enheter';
import { finnDel, finnStartmal, plasserDel, startmaler, type FestepunktId } from './bibliotek';
import { festepunkter } from './feste';
import { GRENSER, tolkParametre, type BuildforgeParametre, type Form } from './parametre';
import { editor } from './tilstand';

/** The current project, or null when the stored data is invalid (the build reports why). */
export function parametre(benk: Arbeidsbenk): BuildforgeParametre | null {
  const t = tolkParametre(benk.dok.parametre);
  return t.ok ? t.p : null;
}

export function endre(
  benk: Arbeidsbenk,
  navn: string,
  endring: (p: BuildforgeParametre) => BuildforgeParametre,
  slaSammen?: string,
): void {
  benk.endre({
    navn,
    slaSammen,
    anvend: (d) => {
      const t = tolkParametre(d.parametre);
      if (!t.ok) return d;
      const neste = endring(t.p);
      // never store something the validator would reject
      if (!tolkParametre(neste).ok || JSON.stringify(neste) === JSON.stringify(t.p)) return d;
      return { ...d, parametre: { ...neste } };
    },
  });
}

export function endreForm(
  benk: Arbeidsbenk,
  id: string,
  navn: string,
  f: (x: Form) => Form,
  slaSammen?: string,
): void {
  endre(benk, navn, (p) => ({ ...p, former: p.former.map((x) => (x.id === id ? f(x) : x)) }), slaSammen);
}

export function velgMal(benk: Arbeidsbenk, malId: string): void {
  const mal = finnStartmal(malId);
  editor.sett({ valgt: null, merket: [], plasserer: null });
  const malnavn = new Set(startmaler.map((m) => m.navn));
  benk.endre({
    navn: `Start fra «${mal.navn}»`,
    anvend: (d) => ({
      ...d,
      // keep a name the user has chosen
      navn: malnavn.has(d.navn) || d.navn === 'Uten navn' ? mal.navn : d.navn,
      parametre: { ...mal.parametre() },
    }),
  });
  benk.melde(`Startet fra «${mal.navn}».`);
}

/** Attach a library part at an attachment point. Returns false when it does not fit there. */
export function festDel(benk: Arbeidsbenk, delId: string, punktId: FestepunktId): boolean {
  const del = finnDel(delId);
  const p = parametre(benk);
  if (!del || !p) return false;
  if (!del.passer.includes(punktId)) {
    benk.melde(`${del.navn} passer ikke der.`);
    return false;
  }
  const punkt = festepunkter(p).find((f) => f.id === punktId);
  if (!punkt) return false;
  const nye = plasserDel(del, punkt);
  if (p.former.length + nye.length > GRENSER.maksFormer) {
    benk.melde(`Modellen kan ha opptil ${GRENSER.maksFormer} former.`);
    return false;
  }
  endre(benk, `Fest ${del.navn.toLowerCase()}`, (q) => ({ ...q, former: [...q.former, ...nye] }));
  editor.sett({ plasserer: null, sikter: null, valgt: nye[0]!.id, merket: [] });
  benk.melde(`${del.navn} er festet.`);
  return true;
}

export function slettForm(benk: Arbeidsbenk, id: string): void {
  const p = parametre(benk);
  const f = p?.former.find((x) => x.id === id);
  if (!f) return;
  endre(benk, `Slett ${f.navn.toLowerCase()}`, (q) => ({
    ...q,
    former: q.former.filter((x) => x.id !== id),
  }));
  editor.sett({ valgt: null, merket: editor.t.merket.filter((m) => m !== id) });
  benk.melde(`${f.navn} er slettet.`);
}

export function dupliserForm(benk: Arbeidsbenk, id: string): void {
  const p = parametre(benk);
  const f = p?.former.find((x) => x.id === id);
  if (!f || !p) return;
  if (p.former.length >= GRENSER.maksFormer) return;
  const ny: Form = {
    ...structuredClone(f),
    id: nyId('f'),
    navn: `${f.navn} (kopi)`.slice(0, 60),
    posisjon: [
      klem(f.posisjon[0] + 5, GRENSER.posisjon.min, GRENSER.posisjon.maks),
      f.posisjon[1],
      f.posisjon[2],
    ],
  };
  endre(benk, `Dupliser ${f.navn.toLowerCase()}`, (q) => {
    const i = q.former.findIndex((x) => x.id === id);
    const former = [...q.former];
    former.splice(i + 1, 0, ny);
    return { ...q, former };
  });
  editor.sett({ valgt: ny.id });
  benk.melde(`${f.navn} er duplisert.`);
}

export function flyttForm(benk: Arbeidsbenk, id: string, d: [number, number, number]): void {
  endreForm(
    benk,
    id,
    'Flytt form',
    (f) => ({
      ...f,
      posisjon: f.posisjon.map(
        (v, k) => Math.round(klem(v + d[k]!, GRENSER.posisjon.min, GRENSER.posisjon.maks) * 10) / 10,
      ) as [number, number, number],
    }),
    `flytt-${id}`,
  );
}

/** Uniform size change (Enkel): every dimension by the same factor, within limits. */
export function skalerForm(benk: Arbeidsbenk, id: string, faktor: number, slaSammen?: string): void {
  endreForm(
    benk,
    id,
    'Endre størrelse',
    (f) => {
      const k = Math.min(faktor, ...f.mal.map((v) => GRENSER.mal.maks / v));
      const k2 = Math.max(k, ...f.mal.map((v) => GRENSER.mal.min / v));
      const r = (v: number) => Math.round(v * k2 * 10) / 10;
      return {
        ...f,
        mal: f.mal.map(r) as [number, number, number],
        avrunding: Math.round(f.avrunding * k2 * 10) / 10,
      };
    },
    slaSammen,
  );
}
