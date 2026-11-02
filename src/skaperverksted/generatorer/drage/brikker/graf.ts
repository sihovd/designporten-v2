/**
 * The brick graph: placement from connections, and every operation on the
 * project (add, connect, disconnect, move, swap, duplicate, delete, local
 * values). Pure functions on plain JSON; the UI runs each one as one undo
 * step (`handlinger.ts`).
 *
 * Placement. Each group's root carries its placement on the plate; every
 * other brick is placed from its parent through the connection:
 *
 *   T_barn = T_forelder · K_forelder · R(180° + q) · K_barn⁻¹
 *
 * K is the point's frame in its brick (position and outward direction), so
 * the two points meet with their outward directions opposed, then turned by
 * the joint angle q (0 in phase 1: the print pose). The rule lives here and
 * in the profile, never in the UI.
 */
import { nyId } from '../../../core/dokument';
import {
  finnDefinisjon,
  kompatibilitet,
  komponenter,
  oppsettFor,
  ordneGrupper,
  type Brikkeinstans,
  type Brikkeprosjekt,
  type Ende,
  type Forbindelse,
  type Gruppe,
  type Lokaleverdier,
  type Plassering,
  type Punktramme,
} from './modell';

/** A rigid motion in the plane: mm and radians. */
export interface T2 {
  x: number;
  y: number;
  v: number;
}

const RAD = Math.PI / 180;

export function sett(a: T2, b: T2): T2 {
  const c = Math.cos(a.v);
  const s = Math.sin(a.v);
  return { x: a.x + c * b.x - s * b.y, y: a.y + s * b.x + c * b.y, v: a.v + b.v };
}

export function inverter(a: T2): T2 {
  const c = Math.cos(a.v);
  const s = Math.sin(a.v);
  return { x: -(c * a.x + s * a.y), y: -(-s * a.x + c * a.y), v: -a.v };
}

export function anvend(t: T2, x: number, y: number): [number, number] {
  const c = Math.cos(t.v);
  const s = Math.sin(t.v);
  return [t.x + c * x - s * y, t.y + s * x + c * y];
}

export const fraPlassering = (p: Plassering): T2 => ({ x: p.x, y: p.y, v: p.vinkel * RAD });

/** Back to stored form; the angle is kept in (-180, 180]. */
export function tilPlassering(t: T2): Plassering {
  let v = t.v / RAD;
  v = ((((v + 180) % 360) + 360) % 360) - 180;
  if (v === -180) v = 180;
  const rund = (x: number) => Math.round(x * 1e6) / 1e6;
  return { x: rund(t.x), y: rund(t.y), vinkel: rund(v) };
}

const ramme = (k: Punktramme): T2 => ({ x: k.x, y: k.y, v: k.ut * RAD });

export const finnInstans = (p: Brikkeprosjekt, id: string): Brikkeinstans | undefined =>
  p.instanser.find((i) => i.id === id);

/** The point's frame in its own brick, or undefined for an unknown definition or point. */
export function punktramme(i: Brikkeinstans, punkt: string): Punktramme | undefined {
  const def = finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
  if (!def) return undefined;
  return oppsettFor(def, i.verdier).punkter.find((k) => k.def.id === punkt);
}

export function forbindelseVed(p: Brikkeprosjekt, e: Ende): Forbindelse | undefined {
  return p.forbindelser.find(
    (f) =>
      (f.a.instans === e.instans && f.a.punkt === e.punkt) ||
      (f.b.instans === e.instans && f.b.punkt === e.punkt),
  );
}

export const andreEnde = (f: Forbindelse, instans: string): Ende => (f.a.instans === instans ? f.b : f.a);

/** The connected set an instance belongs to. */
export function komponenterAv(p: Brikkeprosjekt, instans: string): string[] | undefined {
  return komponenter(p).find((k) => k.includes(instans));
}

export function gruppeFor(p: Brikkeprosjekt, instans: string): Gruppe | undefined {
  const komp = komponenter(p).find((k) => k.includes(instans));
  return komp ? p.grupper.find((g) => komp.includes(g.rot)) : undefined;
}

/** Parent of each instance in its group's tree (the root has none). */
export function foreldre(p: Brikkeprosjekt): Map<string, { forelder: string; via: Forbindelse }> {
  const ut = new Map<string, { forelder: string; via: Forbindelse }>();
  for (const g of p.grupper) {
    const sett_ = new Set([g.rot]);
    const ko = [g.rot];
    while (ko.length) {
      const u = ko.shift()!;
      for (const f of p.forbindelser) {
        if (f.a.instans !== u && f.b.instans !== u) continue;
        const w = andreEnde(f, u).instans;
        if (sett_.has(w)) continue;
        sett_.add(w);
        ut.set(w, { forelder: u, via: f });
        ko.push(w);
      }
    }
  }
  return ut;
}

/**
 * World placement of every instance that can be placed. A brick of an
 * unknown definition has no known points, so it and what hangs behind it
 * are left out (the build reports them).
 */
export function plasseringer(p: Brikkeprosjekt): Map<string, T2> {
  const ut = new Map<string, T2>();
  const instans = new Map(p.instanser.map((i) => [i.id, i]));
  for (const g of p.grupper) {
    const rot = instans.get(g.rot);
    if (!rot || !finnDefinisjon(rot.definisjon.id, rot.definisjon.versjon)) continue;
    ut.set(g.rot, fraPlassering(g.plassering));
    const ko = [g.rot];
    while (ko.length) {
      const u = ko.shift()!;
      const tu = ut.get(u)!;
      for (const f of p.forbindelser) {
        if (f.a.instans !== u && f.b.instans !== u) continue;
        const egen = f.a.instans === u ? f.a : f.b;
        const annen = andreEnde(f, u);
        if (ut.has(annen.instans)) continue;
        const iu = instans.get(u)!;
        const iw = instans.get(annen.instans);
        const ku = punktramme(iu, egen.punkt);
        const kw = iw && punktramme(iw, annen.punkt);
        if (!ku || !kw) continue;
        const q = (f.a.instans === u ? 1 : -1) * f.vinkel * RAD;
        const tw = sett(sett(sett(tu, ramme(ku)), { x: 0, y: 0, v: Math.PI + q }), inverter(ramme(kw)));
        ut.set(annen.instans, tw);
        ko.push(annen.instans);
      }
    }
  }
  return ut;
}

/** A point in the world, for markers and previews. */
export function punktIVerden(p: Brikkeprosjekt, e: Ende, W = plasseringer(p)): T2 | undefined {
  const i = finnInstans(p, e.instans);
  const t = W.get(e.instans);
  const k = i && punktramme(i, e.punkt);
  return t && k ? sett(t, ramme(k)) : undefined;
}

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

/** The instance's own name, or the definition's name numbered among its kind. */
export function navnPa(p: Brikkeprosjekt, id: string): string {
  const i = finnInstans(p, id);
  if (!i) return 'Ukjent brikke';
  if (i.navn) return i.navn;
  const def = finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
  const navn = def?.navn ?? `${i.definisjon.id} v${i.definisjon.versjon}`;
  const like = p.instanser.filter((x) => !x.navn && x.definisjon.id === i.definisjon.id);
  return like.length > 1 ? `${navn} ${like.indexOf(i) + 1}` : navn;
}

export function punktnavn(p: Brikkeprosjekt, e: Ende): string {
  const i = finnInstans(p, e.instans);
  const def = i && finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
  const k = def?.punkter.find((x) => x.id === e.punkt);
  return `${navnPa(p, e.instans)}, ${(k?.navn ?? e.punkt).toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export type Resultat =
  { ok: true; p: Brikkeprosjekt; melding: string; ny?: string } | { ok: false; grunn: string };

const feil = (grunn: string): Resultat => ({ ok: false, grunn });

function omgruppert(p: Brikkeprosjekt, W: Map<string, T2>): Brikkeprosjekt {
  return ordneGrupper(p, (id) => {
    const t = W.get(id);
    return t ? tilPlassering(t) : undefined;
  });
}

/** Rough reach of a brick from its own origin (mm), for free space on the plate. */
function rekkevidde(i: Brikkeinstans): number {
  const def = finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
  if (!def) return 20;
  const o = oppsettFor(def, i.verdier);
  return Math.max(o.neseX, -o.haleX, o.del.omriss.b, o.tapp?.jx ?? 0);
}

/** A free place in front of the plate (towards −Y), below what is already there. */
export function ledigPlass(p: Brikkeprosjekt, ny?: Brikkeinstans): Plassering {
  const W = plasseringer(p);
  let minY = Infinity;
  for (const i of p.instanser) {
    const t = W.get(i.id);
    if (t) minY = Math.min(minY, t.y - rekkevidde(i));
  }
  const r = ny ? rekkevidde(ny) : 20;
  if (!Number.isFinite(minY)) return { x: 0, y: 0, vinkel: 0 };
  return { x: 0, y: Math.round(minY - r - 8), vinkel: 0 };
}

/** Add a brick from the library as a loose group of its own. */
export function leggTil(
  p: Brikkeprosjekt,
  definisjon: string,
  plassering?: Plassering,
  verdier: Lokaleverdier = {},
): Resultat {
  const def = finnDefinisjon(definisjon);
  if (!def) return feil('Brikken finnes ikke i biblioteket.');
  const i: Brikkeinstans = {
    id: nyId('b'),
    definisjon: { id: def.id, versjon: def.versjon },
    verdier: { ...verdier },
  };
  const g: Gruppe = { id: nyId('g'), rot: i.id, plassering: plassering ?? ledigPlass(p, i) };
  return {
    ok: true,
    p: { ...p, instanser: [...p.instanser, i], grupper: [...p.grupper, g] },
    melding: `La til ${def.navn.toLowerCase()}`,
    ny: i.id,
  };
}

/**
 * Why `flytt` cannot be connected to `mal`, or null. Explains every refusal
 * in words: missing brick or point, occupied point, the same brick, two
 * pins or two sockets, other profile, or a closed loop.
 */
export function kanKoble(p: Brikkeprosjekt, flytt: Ende, mal: Ende): string | null {
  const a = finnInstans(p, flytt.instans);
  const b = finnInstans(p, mal.instans);
  if (!a || !b) return 'Brikken finnes ikke lenger.';
  if (a.id === b.id) return 'En brikke kan ikke kobles til seg selv.';
  if (!punktramme(a, flytt.punkt) || !punktramme(b, mal.punkt)) return 'Punktet finnes ikke på brikken.';
  const k = kompatibilitet(a, flytt.punkt, b, mal.punkt);
  if (k) return k;
  const opptattA = forbindelseVed(p, flytt);
  if (opptattA)
    return `${punktnavn(p, flytt)} er allerede koblet til ${punktnavn(p, andreEnde(opptattA, a.id)).toLowerCase()}.`;
  const opptattB = forbindelseVed(p, mal);
  if (opptattB)
    return `${punktnavn(p, mal)} er allerede koblet til ${punktnavn(p, andreEnde(opptattB, b.id)).toLowerCase()}.`;
  if (komponenter(p).some((c) => c.includes(a.id) && c.includes(b.id)))
    return 'Brikkene henger allerede sammen. En lukket sløyfe støttes ikke i denne versjonen.';
  return null;
}

/**
 * Connect: the group holding `flytt` moves so its point meets `mal` and
 * becomes part of `mal`'s group. One step; nothing is created when refused.
 */
export function koble(p: Brikkeprosjekt, flytt: Ende, mal: Ende): Resultat {
  const grunn = kanKoble(p, flytt, mal);
  if (grunn) return feil(grunn);
  const a = finnInstans(p, flytt.instans)!;
  const k = punktramme(a, flytt.punkt)!;
  const flyttGruppe_ = gruppeFor(p, flytt.instans);
  const f: Forbindelse = {
    id: nyId('k'),
    a: { ...flytt },
    b: { ...mal },
    profil: { ...k.def.profil },
    vinkel: 0,
    produksjon: 'print-i-ett',
  };
  const neste = ordneGrupper({
    ...p,
    forbindelser: [...p.forbindelser, f],
    grupper: p.grupper.filter((g) => g.id !== flyttGruppe_?.id),
  });
  return {
    ok: true,
    p: neste,
    melding: `Koblet ${punktnavn(p, flytt).toLowerCase()} til ${punktnavn(p, mal).toLowerCase()}`,
  };
}

/** Add a library brick and connect it in one step. */
export function leggTilOgKoble(
  p: Brikkeprosjekt,
  definisjon: string,
  egetPunkt: string,
  mal: Ende,
): Resultat {
  const lagt = leggTil(p, definisjon, { x: 0, y: 0, vinkel: 0 });
  if (!lagt.ok) return lagt;
  const r = koble(lagt.p, { instans: lagt.ny!, punkt: egetPunkt }, mal);
  if (!r.ok) return r;
  return {
    ...r,
    ny: lagt.ny,
    melding: `${lagt.melding} og koblet den til ${punktnavn(p, mal).toLowerCase()}`,
  };
}

/** The point on a library brick that fits `mal` (the opposite role), if any. */
export function passendePunkt(p: Brikkeprosjekt, definisjon: string, mal: Ende): string | null {
  const def = finnDefinisjon(definisjon);
  const b = finnInstans(p, mal.instans);
  if (!def || !b) return null;
  const proveinstans: Brikkeinstans = {
    id: '_prove',
    definisjon: { id: def.id, versjon: def.versjon },
    verdier: {},
  };
  const punkt = def.punkter.find((k) => !kompatibilitet(proveinstans, k.id, b, mal.punkt));
  return punkt?.id ?? null;
}

/**
 * Disconnect: both sides stay exactly where they are; the side without the
 * group's root becomes a loose group of its own.
 */
export function kobleFra(p: Brikkeprosjekt, forbindelse: string): Resultat {
  const f = p.forbindelser.find((x) => x.id === forbindelse);
  if (!f) return feil('Koblingen finnes ikke lenger.');
  const W = plasseringer(p);
  const neste = omgruppert({ ...p, forbindelser: p.forbindelser.filter((x) => x !== f) }, W);
  return { ok: true, p: neste, melding: `Koblet fra ${punktnavn(p, f.a).toLowerCase()}` };
}

/** Move (and turn) the group an instance belongs to. */
export function flyttGruppe(p: Brikkeprosjekt, gruppe: string, plassering: Plassering): Resultat {
  const g = p.grupper.find((x) => x.id === gruppe);
  if (!g) return feil('Gruppen finnes ikke lenger.');
  const ny = tilPlassering(fraPlassering(plassering));
  return {
    ok: true,
    p: { ...p, grupper: p.grupper.map((x) => (x === g ? { ...g, plassering: ny } : x)) },
    melding: 'Flyttet gruppen',
  };
}

/** Instances that hang behind `id` in its group's tree (seen from the root). */
export function gren(p: Brikkeprosjekt, id: string): string[] {
  const F = foreldre(p);
  const barn = new Map<string, string[]>();
  for (const [b, { forelder }] of F) barn.set(forelder, [...(barn.get(forelder) ?? []), b]);
  const ut: string[] = [];
  const ko = [...(barn.get(id) ?? [])];
  while (ko.length) {
    const x = ko.shift()!;
    ut.push(x);
    ko.push(...(barn.get(x) ?? []));
  }
  return ut;
}

/**
 * Delete a brick. «behold» keeps everything it held as loose groups where
 * they lie; «gren» also deletes what hangs behind it (seen from the root).
 */
export function slett(p: Brikkeprosjekt, id: string, modus: 'behold' | 'gren'): Resultat {
  const i = finnInstans(p, id);
  if (!i) return feil('Brikken finnes ikke lenger.');
  const W = plasseringer(p);
  const borte = new Set([id, ...(modus === 'gren' ? gren(p, id) : [])]);
  const neste = omgruppert(
    {
      ...p,
      instanser: p.instanser.filter((x) => !borte.has(x.id)),
      forbindelser: p.forbindelser.filter((f) => !borte.has(f.a.instans) && !borte.has(f.b.instans)),
      grupper: p.grupper.filter((g) => !borte.has(g.rot)),
    },
    W,
  );
  const navn = navnPa(p, id);
  return {
    ok: true,
    p: neste,
    melding:
      borte.size > 1
        ? `Slettet ${navn.toLowerCase()} og ${borte.size - 1} brikker bak den`
        : `Slettet ${navn.toLowerCase()}`,
  };
}

/** What a swap keeps and what it loses, shown before the swap is made. */
export function byttKonsekvens(
  p: Brikkeprosjekt,
  id: string,
  definisjon: string,
): { beholdt: Forbindelse[]; tapt: { f: Forbindelse; grunn: string }[] } {
  const i = finnInstans(p, id);
  const def = finnDefinisjon(definisjon);
  const beholdt: Forbindelse[] = [];
  const tapt: { f: Forbindelse; grunn: string }[] = [];
  if (!i || !def) return { beholdt, tapt };
  const ny: Brikkeinstans = { ...i, definisjon: { id: def.id, versjon: def.versjon } };
  for (const f of p.forbindelser) {
    if (f.a.instans !== id && f.b.instans !== id) continue;
    const egen = f.a.instans === id ? f.a : f.b;
    const annen = andreEnde(f, id);
    const annenInstans = finnInstans(p, annen.instans);
    if (!def.punkter.some((k) => k.id === egen.punkt)) {
      tapt.push({
        f,
        grunn: `${def.navn} har ikke ${egen.punkt === 'foran' ? 'tapp foran' : 'sokkel bak'}.`,
      });
      continue;
    }
    const k = annenInstans
      ? kompatibilitet(ny, egen.punkt, annenInstans, annen.punkt)
      : 'Brikken finnes ikke.';
    if (k) tapt.push({ f, grunn: k });
    else beholdt.push(f);
  }
  return { beholdt, tapt };
}

/**
 * Swap a brick for another definition. Connections whose point exists on
 * the new brick with a fitting role and profile are kept (matched by the
 * stable point id, never by distance); the others are disconnected and
 * what hung on them stays where it lay as loose groups.
 */
export function bytt(p: Brikkeprosjekt, id: string, definisjon: string): Resultat {
  const i = finnInstans(p, id);
  const def = finnDefinisjon(definisjon);
  if (!i) return feil('Brikken finnes ikke lenger.');
  if (!def) return feil('Brikken finnes ikke i biblioteket.');
  if (i.definisjon.id === def.id && i.definisjon.versjon === def.versjon)
    return feil('Brikken er allerede av denne typen.');
  const W = plasseringer(p);
  const { tapt } = byttKonsekvens(p, id, definisjon);
  const borte = new Set(tapt.map((x) => x.f.id));
  const gammeltNavn = navnPa(p, id);
  const neste = omgruppert(
    {
      ...p,
      instanser: p.instanser.map((x) =>
        x.id === id ? { ...x, definisjon: { id: def.id, versjon: def.versjon } } : x,
      ),
      forbindelser: p.forbindelser.filter((f) => !borte.has(f.id)),
    },
    W,
  );
  return {
    ok: true,
    p: neste,
    melding:
      `Byttet ${gammeltNavn.toLowerCase()} med ${def.navn.toLowerCase()}` +
      (tapt.length ? `; ${tapt.length} kobling${tapt.length > 1 ? 'er' : ''} ble løst` : ''),
  };
}

/** A loose copy of a brick with the same definition and local values. */
export function dupliser(p: Brikkeprosjekt, id: string): Resultat {
  const i = finnInstans(p, id);
  if (!i) return feil('Brikken finnes ikke lenger.');
  const kopi: Brikkeinstans = { ...i, id: nyId('b'), verdier: { ...i.verdier } };
  const g: Gruppe = { id: nyId('g'), rot: kopi.id, plassering: ledigPlass(p, kopi) };
  return {
    ok: true,
    p: { ...p, instanser: [...p.instanser, kopi], grupper: [...p.grupper, g] },
    melding: `Dupliserte ${navnPa(p, id).toLowerCase()}`,
    ny: kopi.id,
  };
}

/** Change this instance only (the definition and the other instances stay as they are). */
export function settVerdier(p: Brikkeprosjekt, id: string, verdier: Lokaleverdier): Resultat {
  const i = finnInstans(p, id);
  if (!i) return feil('Brikken finnes ikke lenger.');
  const ny = { ...i.verdier, ...verdier };
  for (const k of Object.keys(ny) as (keyof Lokaleverdier)[]) if (ny[k] === undefined) delete ny[k];
  return {
    ok: true,
    p: { ...p, instanser: p.instanser.map((x) => (x === i ? { ...i, verdier: ny } : x)) },
    melding: `Endret ${navnPa(p, id).toLowerCase()}`,
  };
}

export function giNavn(p: Brikkeprosjekt, id: string, navn: string): Resultat {
  const i = finnInstans(p, id);
  if (!i) return feil('Brikken finnes ikke lenger.');
  const rent = navn.trim().slice(0, 60);
  const neste: Brikkeinstans = { ...i };
  if (rent) neste.navn = rent;
  else delete neste.navn;
  return {
    ok: true,
    p: { ...p, instanser: p.instanser.map((x) => (x === i ? neste : x)) },
    melding: rent ? `Ga brikken navnet ${rent}` : 'Fjernet brikkens eget navn',
  };
}

/* ------------------------------------------------------------------ */
/* The reference dragon (work order ch. 32)                            */
/* ------------------------------------------------------------------ */

/**
 * One head, three body pieces and one tail end, connected in a chain and
 * centred on the plate. Built through the same operations as the editor,
 * so it can never hold a connection the editor would refuse.
 */
export function referansedrage(
  hode = 'hode-rundt',
  hale = 'hale-spade',
  start: Brikkeprosjekt = { skjema: 1, instanser: [], forbindelser: [], grupper: [] },
): Brikkeprosjekt {
  let p = start;
  const r0 = leggTil(p, hode, { x: 0, y: 0, vinkel: 0 });
  if (!r0.ok) return p;
  p = r0.p;
  let forrige = r0.ny!;
  const rot = r0.ny!;
  for (const def of ['kropp-avrundet', 'kropp-avrundet', 'kropp-avrundet', hale]) {
    const r = leggTilOgKoble(p, def, 'foran', { instans: forrige, punkt: 'bak' });
    if (!r.ok) break;
    p = r.p;
    forrige = r.ny!;
  }
  // Centre the chain on the plate along X.
  const W = plasseringer(p);
  let minX = Infinity;
  let maksX = -Infinity;
  for (const i of p.instanser) {
    const t = W.get(i.id);
    const def = finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
    if (!t || !def) continue;
    const o = oppsettFor(def, i.verdier);
    minX = Math.min(minX, t.x + o.haleX);
    maksX = Math.max(maksX, t.x + o.neseX);
  }
  const g = p.grupper.find((x) => x.rot === rot);
  if (!g || !Number.isFinite(minX)) return p;
  const r = flyttGruppe(p, g.id, {
    ...g.plassering,
    x: Math.round((g.plassering.x - (minX + maksX) / 2) * 100) / 100,
  });
  return r.ok ? r.p : p;
}
