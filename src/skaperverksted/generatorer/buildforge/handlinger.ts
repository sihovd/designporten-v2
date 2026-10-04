/**
 * Project changes, each one undoable step through the workbench history
 * (handoff §4: «Slipp utfører én angrebar transaksjon»).
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { nyId } from '../../core/dokument';
import { klem } from '../../core/enheter';
import { finnDel, finnStartmal, passer, plasserDel, startmaler, type FestepunktId } from './bibliotek';
import { festepunkter } from './feste';
import { erBuildforgeResultat } from './funn';
import {
  dupliserKropp as dupliser,
  erstatt,
  finnKropp,
  flyttGruppe as flytt,
  forbindelseTilForelder,
  koble,
  koblFra,
  leggTilLos,
  leggTilOgKoble,
  settVri as vri,
  slettKropp as slett,
  speilKropp as speil,
  type Plassering,
  type Resultat,
} from './graf';
import { finnKroppsmal, lagKropp, modulprosjekt, starter } from './kroppsbibliotek';

export { modulprosjekt };
import {
  familieFor,
  GRENSER,
  kroppBestemt,
  revisjon,
  tolkParametre,
  type BuildforgeParametre,
  type Ende,
  type Form,
  type KlikkerKropp,
  type V3,
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
  tilpassEtterBygg(benk);
}

/** Frame the model once the current project is built. */
function tilpassEtterBygg(benk: Arbeidsbenk): void {
  const rev = revisjon(benk.dok.parametre);
  const av = benk.lytt((t) => {
    if (t.bygger || !erBuildforgeResultat(t.modell) || t.modell.kontroll.revisjon !== rev) return;
    av();
    requestAnimationFrame(() => requestAnimationFrame(() => benk.kommando('tilpass')));
  });
}

/** «La oss bygge …»: start over with one part, the Main Body (handoff §3). */
export function velgStart(benk: Arbeidsbenk, startId: string): void {
  const start = starter.find((s) => s.id === startId);
  if (!start) return;
  editor.sett({
    valgt: null,
    merket: [],
    plasserer: null,
    trykk: 0,
    kropp: null,
    inne: null,
    startvelger: false,
  });
  const navn = new Set([...startmaler.map((m) => m.navn), ...starter.map((s) => s.navn)]);
  benk.endre({
    navn: `Start en ${start.navn.toLowerCase()}`,
    anvend: (d) => ({
      ...d,
      navn: navn.has(d.navn) || d.navn === 'Uten navn' ? start.navn : d.navn,
      parametre: { ...modulprosjekt(start.id) },
    }),
  });
  benk.melde(`${start.navn}: hovedkroppen står på platen. Dra kroppsdeler fra biblioteket til den.`);
  tilpassEtterBygg(benk);
}

/** The most shapes a project of this family may hold. */
export const maksFormer = (p: BuildforgeParametre): number =>
  familieFor(p) === 'modul' ? GRENSER.maksFormerModul : GRENSER.maksFormer;

/** Attach a library part at an attachment point. Returns false when it does not fit there. */
export function festDel(benk: Arbeidsbenk, delId: string, punktId: FestepunktId): boolean {
  const del = finnDel(delId);
  const p = parametre(benk);
  if (!del || !p) return false;
  const punkt = festepunkter(p).find((f) => f.id === punktId);
  if (!punkt) return false;
  if (!passer(del, punkt)) {
    benk.melde(`${del.navn} passer ikke der.`);
    return false;
  }
  const nye = plasserDel(del, punkt);
  if (p.former.length + nye.length > maksFormer(p)) {
    benk.melde(`Modellen kan ha opptil ${maksFormer(p)} former.`);
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
  if (p.former.length >= maksFormer(p)) return;
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

export function settFarge(benk: Arbeidsbenk, kropp: string, materialId: string): void {
  const p = parametre(benk);
  if (!p) return;
  if (familieFor(p) === 'klikker') {
    endre(benk, `Endre farge på ${kroppBestemt[kropp as KlikkerKropp]}`, (q) => ({
      ...q,
      farger: { ...q.farger, [kropp]: materialId },
    }));
    return;
  }
  const k = finnKropp(p, kropp);
  if (!k) return;
  endre(benk, `Endre farge på ${k.navn.toLowerCase()}`, (q) => ({
    ...q,
    kropper: q.kropper!.map((x) => (x.id === kropp ? { ...x, farge: materialId } : x)),
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

// ---------------------------------------------------------------------------
// Body parts (modular builder)

/** Apply a graph operation as one undoable step; says why when it cannot be done. */
function graf(benk: Arbeidsbenk, navn: string, op: (p: BuildforgeParametre) => Resultat): boolean {
  const p = parametre(benk);
  if (!p) return false;
  const r = op(p);
  if (!r.ok) {
    benk.melde(r.grunn);
    return false;
  }
  if (!tolkParametre(r.p).ok) {
    benk.melde('Det ville gjort prosjektet ugyldig, så det ble ikke gjort.');
    return false;
  }
  endre(benk, navn, () => r.p);
  if (r.melding) benk.melde(r.melding);
  return true;
}

const forMange = (p: BuildforgeParametre, kropper: number, former: number): string | null =>
  p.kropper!.length + kropper > GRENSER.maksKropper
    ? `Modellen kan ha opptil ${GRENSER.maksKropper} deler.`
    : p.former.length + former > maksFormer(p)
      ? `Modellen kan ha opptil ${maksFormer(p)} former.`
      : null;

/** Attach a library part: its connector `egen` meets the free connector `mal` (handoff §8). */
export function kobleNyKropp(benk: Arbeidsbenk, malId: string, egen: string, mal: Ende): boolean {
  const km = finnKroppsmal(malId);
  if (!km) return false;
  let ny = '';
  const ok = graf(benk, `Fest ${km.navn.toLowerCase()}`, (p) => {
    const grense = forMange(p, 1, km.former.length);
    if (grense) return { ok: false, grunn: grense };
    // a new part takes the colour of the part it goes on
    const del = lagKropp(km, finnKropp(p, mal.kropp)?.farge);
    ny = del.kropp.id;
    return leggTilOgKoble(p, del, egen, mal);
  });
  if (ok) {
    editor.sett({ kropp: ny, valgt: null, merket: [] });
    benk.melde(`${km.navn} er festet.`);
  }
  return ok;
}

/** Attach from the list or a connector button (no drag): the model grew, so frame it again. */
export function kobleNyKroppOgVis(benk: Arbeidsbenk, malId: string, egen: string, mal: Ende): boolean {
  const ok = kobleNyKropp(benk, malId, egen, mal);
  if (ok) tilpassEtterBygg(benk);
  return ok;
}

/** Put a library part loose on the plate (handoff §13). */
export function leggNyKroppLost(benk: Arbeidsbenk, malId: string, punkt: V3): boolean {
  const km = finnKroppsmal(malId);
  if (!km) return false;
  let ny = '';
  const ok = graf(benk, `Legg ${km.navn.toLowerCase()} på platen`, (p) => {
    const grense = forMange(p, 1, km.former.length);
    if (grense) return { ok: false, grunn: grense };
    const del = lagKropp(km);
    ny = del.kropp.id;
    return { ok: true, p: leggTilLos(p, del, punkt) };
  });
  if (ok) {
    editor.sett({ kropp: ny, valgt: null, merket: [] });
    benk.melde(`${km.navn} ligger løst på platen. Dra den til en kobling når du vil feste den.`);
  }
  return ok;
}

/** Connect a loose group: the connector `egen` on one of its parts meets `mal` (handoff §13). */
export function kobleGruppe(benk: Arbeidsbenk, egen: Ende, mal: Ende): boolean {
  const ok = graf(benk, 'Koble sammen', (p) => koble(p, egen, mal));
  if (ok) benk.melde('Delene er koblet sammen.');
  return ok;
}

/** Replace a part with a library part (handoff §11–12). */
export function erstattKropp(benk: Arbeidsbenk, gammelId: string, malId: string): boolean {
  const km = finnKroppsmal(malId);
  const p = parametre(benk);
  const gammel = p ? finnKropp(p, gammelId) : undefined;
  if (!km || !p || !gammel) return false;
  const grense = forMange(p, 0, km.former.length);
  if (grense) {
    benk.melde(grense);
    return false;
  }
  const r = erstatt(p, gammelId, km);
  if (!r.ok) {
    benk.melde(r.grunn);
    return false;
  }
  if (!tolkParametre(r.p).ok) {
    benk.melde('Det ville gjort prosjektet ugyldig, så det ble ikke gjort.');
    return false;
  }
  endre(benk, `Bytt ut ${gammel.navn.toLowerCase()}`, () => r.p);
  editor.sett({ kropp: r.ny, valgt: null, merket: [], erstatter: null });
  benk.melde(
    r.frakoblet
      ? `${gammel.navn} er byttet ut med ${km.navn.toLowerCase()}. ${r.frakoblet === 1 ? 'Én del' : `${r.frakoblet} deler`} ble frakoblet fordi den nye delen mangler passende koblinger. De ligger der de var.`
      : `${gammel.navn} er byttet ut med ${km.navn.toLowerCase()}.`,
  );
  return true;
}

/** Disconnect a part from the part it hangs on (handoff §14). */
export function koblFraKropp(benk: Arbeidsbenk, id: string): boolean {
  const p = parametre(benk);
  const f = p ? forbindelseTilForelder(p, id) : undefined;
  const k = p ? finnKropp(p, id) : undefined;
  if (!f || !k) {
    benk.melde('Delen henger ikke fast i noe.');
    return false;
  }
  const ok = graf(benk, `Koble fra ${k.navn.toLowerCase()}`, (q) => koblFra(q, f.id));
  if (ok) benk.melde(`${k.navn} er koblet fra og ligger løst der den var.`);
  return ok;
}

export function slettKropp(benk: Arbeidsbenk, id: string): boolean {
  const k = parametre(benk) && finnKropp(parametre(benk)!, id);
  if (!k) return false;
  const ok = graf(benk, `Slett ${k.navn.toLowerCase()}`, (p) => slett(p, id));
  if (ok) {
    editor.sett({ kropp: null, valgt: null, merket: [], inne: editor.t.inne === id ? null : editor.t.inne });
    benk.melde(`${k.navn} er slettet. Delene som hang på den, ligger løst der de var.`);
  }
  return ok;
}

export function speilKropp(benk: Arbeidsbenk, id: string): boolean {
  const k = parametre(benk) && finnKropp(parametre(benk)!, id);
  if (!k) return false;
  const ok = graf(benk, `Speil ${k.navn.toLowerCase()}`, (p) => speil(p, id));
  if (ok) benk.melde(`${k.navn} er speilet.`);
  return ok;
}

export function dupliserKropp(benk: Arbeidsbenk, id: string): boolean {
  const p = parametre(benk);
  const k = p && finnKropp(p, id);
  if (!p || !k) return false;
  const grense = forMange(p, 1, p.former.filter((f) => f.kropp === id).length);
  if (grense) {
    benk.melde(grense);
    return false;
  }
  const r = dupliser(p, id);
  if (!r || !tolkParametre(r.p).ok) return false;
  endre(benk, `Dupliser ${k.navn.toLowerCase()}`, () => r.p);
  editor.sett({ kropp: r.ny, valgt: null });
  benk.melde(`${k.navn} er duplisert. Kopien ligger løst ved siden av.`);
  return true;
}

/** Turn a connected part about its joint. */
export function settVri(benk: Arbeidsbenk, forbindelseId: string, grader: number, slaSammen?: string): void {
  endre(benk, 'Vri ved leddet', (p) => vri(p, forbindelseId, grader), slaSammen);
}

/** Move or turn a whole group (handles, dragging a part on the plate). */
export function flyttGruppe(benk: Arbeidsbenk, kroppId: string, delta: Plassering, navn = 'Flytt'): void {
  endre(benk, navn, (p) => flytt(p, kroppId, delta));
}

/** Rename a part. */
export function giKroppNavn(benk: Arbeidsbenk, id: string, navn: string): void {
  endre(benk, 'Gi nytt navn', (p) => ({
    ...p,
    kropper: p.kropper!.map((k) => (k.id === id ? { ...k, navn: navn.slice(0, 60) } : k)),
  }));
}

/** Double-click: work inside a part (handoff §25). Esc goes back out. */
export function gaInn(benk: Arbeidsbenk, id: string): void {
  const p = parametre(benk);
  const k = p && finnKropp(p, id);
  if (!k) return;
  editor.sett({
    inne: id,
    kropp: null,
    valgt: null,
    merket: [],
    plasserer: null,
    sikter: null,
    erstatter: null,
  });
  benk.melde(`Inne i ${k.navn.toLowerCase()}. Esc går ut igjen.`);
}

export function gaUt(benk: Arbeidsbenk): void {
  const inne = editor.t.inne;
  if (!inne) return;
  editor.sett({ inne: null, kropp: inne, valgt: null, merket: [], plasserer: null, sikter: null });
  benk.melde('Tilbake i hele modellen.');
}
