/**
 * Project changes, each one undoable step through the workbench history
 * (handoff §4: «Slipp utfører én angrebar transaksjon»).
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { nyId } from '../../core/dokument';
import { klem } from '../../core/enheter';
import { finnDel, finnStartmal, passer, plasserDel, startmaler, type FestepunktId } from './bibliotek';
import { festepunkter } from './feste';
import { erGrunnform, finnGrunnmodell, grunnformer } from './figur';
import { erBuildforgeResultat } from './funn';
import {
  GRENSER,
  kroppBestemt,
  revisjon,
  tolkParametre,
  type BuildforgeParametre,
  type FigurKropp,
  type Form,
  type Kropp,
} from './parametre';
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
  editor.sett({ valgt: null, merket: [], plasserer: null, trykk: 0 });
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
  // frame the new model once it is built (a figure is taller than a clicker)
  const rev = revisjon(benk.dok.parametre);
  const av = benk.lytt((t) => {
    if (t.bygger || !erBuildforgeResultat(t.modell) || t.modell.kontroll.revisjon !== rev) return;
    av();
    requestAnimationFrame(() => requestAnimationFrame(() => benk.kommando('tilpass')));
  });
}

/** Attach a library part at an attachment point. Returns false when it does not fit there. */
export function festDel(benk: Arbeidsbenk, delId: string, punktId: FestepunktId): boolean {
  const del = finnDel(delId);
  const p = parametre(benk);
  if (!del || !p) return false;
  if (!passer(del, punktId)) {
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

/** Figure: swap a segment's base model. Shapes the user added stay where they are on the segment. */
export function velgGrunnmodell(benk: Arbeidsbenk, kropp: FigurKropp, id: string): void {
  const m = finnGrunnmodell(kropp, id);
  const p = parametre(benk);
  if (!m || !p || p.grunnmodeller?.[kropp] === id) return;
  const nye = grunnformer(kropp, m);
  endre(benk, `Bytt grunnmodell for ${kroppBestemt[kropp]}`, (q) => {
    const gamle = (f: Form) => f.kropp === kropp && erGrunnform(f);
    const i = q.former.findIndex(gamle);
    const resten = q.former.filter((f) => !gamle(f));
    const plass =
      i < 0
        ? resten.findIndex((f) => f.kropp === kropp)
        : q.former.slice(0, i).filter((f) => !gamle(f)).length;
    const former = [...resten];
    former.splice(plass < 0 ? former.length : plass, 0, ...nye);
    return { ...q, grunnmodeller: { ...q.grunnmodeller, [kropp]: id }, former };
  });
  if (editor.t.valgt && !parametre(benk)?.former.some((f) => f.id === editor.t.valgt))
    editor.sett({ valgt: null, merket: [] });
  benk.melde(`${m.navn} ${kroppBestemt[kropp]} er valgt.`);
}

export function settFarge(benk: Arbeidsbenk, kropp: Kropp, materialId: string): void {
  endre(benk, `Endre farge på ${kroppBestemt[kropp]}`, (q) => ({
    ...q,
    farger: { ...q.farger, [kropp]: materialId },
  }));
}

/** Set position, rotation and size in one step (the handles in the 3D view). */
export function transformerForm(
  benk: Arbeidsbenk,
  id: string,
  navn: string,
  endring: Pick<Form, 'posisjon' | 'rotasjon' | 'mal'>,
): void {
  const r = (v: number) => Math.round(v * 10) / 10;
  endreForm(benk, id, navn, (f) => ({
    ...f,
    posisjon: endring.posisjon.map((v) =>
      r(klem(v, GRENSER.posisjon.min, GRENSER.posisjon.maks)),
    ) as Form['posisjon'],
    rotasjon: endring.rotasjon.map((v) => r(klem(v, -360, 360))) as Form['rotasjon'],
    mal: endring.mal.map((v) => r(klem(v, GRENSER.mal.min, GRENSER.mal.maks))) as Form['mal'],
  }));
}
