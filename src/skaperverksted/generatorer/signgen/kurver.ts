/**
 * Editing the points and curves of a vector (Sivert, 2026-10-05): the
 * actions behind double-click editing, the pen tool and the curve panel.
 * Each is one undo step with a Norwegian label.
 *
 * The vector's path data is read into paths of nodes (geometri/bane.ts),
 * changed, and written back as the object's path data. The object's
 * transform stays as it is, so every edit happens in the vector's own
 * coordinates and works for a rotated or scaled vector too.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, objekterILag, type Dokument, type Objekt, type SvgKilde } from '../../core/dokument';
import { anvend, inverter, tilMatrise, type Vec2 } from '../../core/geometri2d';
import {
  antallAapne,
  banerBoks,
  banerTilSti,
  flyttBaner,
  flyttNoder,
  formAv,
  lukkBane,
  reparerBaner,
  settInnNode,
  settNodeType,
  slettBaner,
  slettNoder,
  slettSegment,
  tolkBaner,
  transformerBaner,
  type Bane,
  type NodeRef,
  type Reparasjon,
} from '../../geometri/bane';
import {
  leggTilObjekt,
  nyttObjekt,
  oppdaterKilde,
  oppdaterLag,
  oppdaterObjekter,
  slettObjekter,
} from './dokument';
import { leggTil } from './handlinger';
import { lagreEgetDekor, type EgetDekor } from './dekor';
import { lokalGeometri } from './modell';
import { signtilstand, type KurveRedigering } from './tilstand';

// ---------- reading ----------

const baneMinne = new WeakMap<SvgKilde, Bane[] | null>();

/** The curves of a vector, or null if it is not one or its path data cannot be read. Do not change the result. */
export function hentBaner(o: Objekt): Bane[] | null {
  if (o.kilde.type !== 'svg') return null;
  const k = o.kilde;
  if (baneMinne.has(k)) return baneMinne.get(k)!;
  let r: Bane[] | null;
  try {
    r = tolkBaner(k.stier.join(''));
  } catch {
    r = null;
  }
  baneMinne.set(k, r);
  return r;
}

export interface Kurvekontekst {
  k: KurveRedigering;
  o: Objekt;
  baner: Bane[];
}

/** The vector being edited, if there is one and it can still be edited. */
export function kurveObjekt(benk: Arbeidsbenk): Kurvekontekst | null {
  const k = signtilstand(benk).t.kurve;
  if (!k) return null;
  const o = benk.dok.objekter[k.objektId];
  const baner = o ? hentBaner(o) : null;
  if (!o || !baner) return null;
  return { k, o, baner };
}

/** Local → sign coordinates for a vector. */
export function tilVerden(o: Objekt, p: Vec2): Vec2 {
  return anvend(tilMatrise(o.transform), p);
}

/** Sign → local coordinates. */
export function tilLokal(o: Objekt, p: Vec2): Vec2 {
  return anvend(inverter(tilMatrise(o.transform)), p);
}

/** A sign-space distance vector in the vector's own units. */
export function tilLokalVektor(o: Objekt, v: Vec2): Vec2 {
  const m = inverter(tilMatrise(o.transform));
  return { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y };
}

/** How many sign millimetres one local unit is (for tolerances). */
export function lokalSkala(o: Objekt): number {
  return (Math.abs(o.transform.skalaX) + Math.abs(o.transform.skalaY)) / 2 || 1;
}

// ---------- state ----------

export function settKurve(benk: Arbeidsbenk, endring: Partial<KurveRedigering>): void {
  const k = signtilstand(benk).t.kurve;
  if (k) signtilstand(benk).sett({ kurve: { ...k, ...endring } });
}

/** Start editing the curves of a vector. */
export function startKurveredigering(benk: Arbeidsbenk, objektId: string): boolean {
  const d = benk.dok;
  const o = d.objekter[objektId];
  if (!o || o.kilde.type !== 'svg') return false;
  if (o.last || finnLag(d, o.lagId)?.last) {
    benk.melde('Vektoren er låst. Lås den opp for å redigere kurvene.');
    return false;
  }
  if (!hentBaner(o)?.length) {
    benk.melde('Kurvene i denne vektoren kan ikke leses.');
    return false;
  }
  benk.velg({ objekter: [objektId], lag: o.lagId });
  signtilstand(benk).sett({
    verktoy: 'velg',
    penn: null,
    kurve: {
      objektId,
      noder: [],
      baner: [],
      segment: null,
      repToleranse: 0.5,
      repTving: false,
      repVis: false,
    },
  });
  benk.melde(
    `Redigerer kurvene i «${o.navn}». Dra punktene, dobbeltklikk på en kurve for å legge til et punkt, Esc for å avslutte.`,
  );
  return true;
}

export function avsluttKurveredigering(benk: Arbeidsbenk): void {
  if (!signtilstand(benk).t.kurve) return;
  signtilstand(benk).sett({ kurve: null, markering: null });
  benk.melde('Ferdig med å redigere kurvene.');
}

/**
 * Whether a node is smooth is read from its handles when path data is
 * parsed, so a corner whose handles happen to be in line would turn smooth
 * again. The curves just written are remembered with their node types, for
 * this session and for undo and redo.
 */
function medBaner(d: Dokument, id: string, baner: Bane[]): Dokument {
  const ut = oppdaterKilde(d, id, { stier: [banerTilSti(baner)] });
  const k = ut.objekter[id]?.kilde;
  if (k?.type === 'svg') baneMinne.set(k, baner);
  return ut;
}

function skriv(benk: Arbeidsbenk, c: Kurvekontekst, baner: Bane[], navn: string, slaSammen?: string): void {
  const id = c.o.id;
  benk.endre({
    navn,
    slaSammen,
    anvend: (d) => (baner.length ? medBaner(d, id, baner) : slettObjekter(d, [id])),
  });
  if (!baner.length) {
    signtilstand(benk).sett({ kurve: null });
    benk.velg({ objekter: [] });
    benk.melde('Vektoren har ingen kurver igjen og er fjernet.');
  }
}

/** Write changed curves back (one undo step; `slaSammen` merges the steps of a drag). */
export function skrivBaner(benk: Arbeidsbenk, baner: Bane[], navn: string, slaSammen?: string): void {
  const c = kurveObjekt(benk);
  if (c) skriv(benk, c, baner, navn, slaSammen);
}

function ingenValg(c: Kurvekontekst): Partial<KurveRedigering> {
  return { noder: [], baner: [], segment: null, repVis: c.k.repVis };
}

// ---------- the actions ----------

/** The paths the selection touches: selected paths, paths with selected points, the selected segment's path. */
export function valgteBaner(k: KurveRedigering): number[] {
  const s = new Set<number>(k.baner);
  for (const [b] of k.noder) s.add(b);
  if (k.segment) s.add(k.segment.bane);
  return [...s].sort((a, b) => a - b);
}

export function leggTilPunkt(benk: Arbeidsbenk, bane: number, seg: number, t: number): void {
  const c = kurveObjekt(benk);
  if (!c) return;
  const r = settInnNode(c.baner, bane, seg, t);
  skriv(benk, c, r.baner, 'Legg til punkt');
  settKurve(benk, { noder: [[bane, r.node]], baner: [], segment: null });
}

/** A corner becomes smooth and the other way round. */
export function veksleNodetype(benk: Arbeidsbenk, bane: number, node: number): void {
  const c = kurveObjekt(benk);
  const nd = c?.baner[bane]?.noder[node];
  if (!c || !nd) return;
  skriv(
    benk,
    c,
    settNodeType(c.baner, bane, node, !nd.glatt),
    nd.glatt ? 'Gjør punktet til hjørne' : 'Gjør punktet jevnt',
  );
}

/** Make all selected points smooth or corners. */
export function settValgteNodetype(benk: Arbeidsbenk, glatt: boolean): void {
  const c = kurveObjekt(benk);
  if (!c || !c.k.noder.length) return;
  let baner = c.baner;
  for (const [b, n] of c.k.noder) baner = settNodeType(baner, b, n, glatt);
  skriv(benk, c, baner, glatt ? 'Gjør punkter jevne' : 'Gjør punkter til hjørner');
}

export function slettValgtePunkter(benk: Arbeidsbenk): void {
  const c = kurveObjekt(benk);
  if (!c || !c.k.noder.length) return;
  const n = c.k.noder.length;
  skriv(benk, c, slettNoder(c.baner, c.k.noder), n === 1 ? 'Slett punkt' : `Slett ${n} punkter`);
  settKurve(benk, ingenValg(c));
}

export function slettValgtSegment(benk: Arbeidsbenk): void {
  const c = kurveObjekt(benk);
  if (!c?.k.segment) return;
  const { bane, seg } = c.k.segment;
  skriv(benk, c, slettSegment(c.baner, bane, seg), 'Slett kurvestykke');
  settKurve(benk, ingenValg(c));
}

/** Delete the selected paths; with `medHull`, the holes inside a shape go with it. */
export function slettValgteBaner(benk: Arbeidsbenk, medHull: boolean): void {
  const c = kurveObjekt(benk);
  if (!c) return;
  const valgt = valgteBaner(c.k);
  if (!valgt.length) return;
  const bort = [...new Set(valgt.flatMap((b) => (medHull ? formAv(c.baner, b) : [b])))];
  skriv(benk, c, slettBaner(c.baner, bort), medHull ? 'Slett form' : 'Slett bane');
  settKurve(benk, ingenValg(c));
}

/**
 * What Delete does: selected points first, then a selected curve piece,
 * else the selected shape. Returns false if nothing is selected.
 */
export function slettKurveValg(benk: Arbeidsbenk): boolean {
  const c = kurveObjekt(benk);
  if (!c) return false;
  if (c.k.noder.length) slettValgtePunkter(benk);
  else if (c.k.segment) slettValgtSegment(benk);
  else if (c.k.baner.length) slettValgteBaner(benk, true);
  else return false;
  return true;
}

/** Close the open paths among the selected (or all open ones when none is selected). */
export function lukkValgteBaner(benk: Arbeidsbenk): void {
  const c = kurveObjekt(benk);
  if (!c) return;
  const valgt = valgteBaner(c.k);
  const mal = (valgt.length ? valgt : c.baner.map((_, i) => i)).filter((i) => !c.baner[i]?.lukket);
  if (!mal.length) {
    benk.melde('Det er ingen åpne baner å lukke.');
    return;
  }
  let baner = c.baner;
  for (const i of [...mal].sort((a, b) => b - a)) baner = lukkBane(baner, i);
  skriv(benk, c, baner, mal.length === 1 ? 'Lukk bane' : `Lukk ${mal.length} baner`);
  settKurve(benk, ingenValg(c));
}

/** Move the selected points (or paths) by a distance in mm on the sign. */
export function dyttValgte(benk: Arbeidsbenk, dx: number, dy: number): boolean {
  const c = kurveObjekt(benk);
  if (!c) return false;
  const noder: NodeRef[] = [
    ...c.k.noder,
    ...c.k.baner.flatMap((b) => (c.baner[b]?.noder ?? []).map((_, n) => [b, n] as NodeRef)),
  ];
  if (!noder.length) return false;
  const v = tilLokalVektor(c.o, { x: dx, y: dy });
  skriv(benk, c, flyttNoder(c.baner, noder, v.x, v.y), 'Flytt punkter', 'kurve-pil');
  return true;
}

// ---------- repair ----------

/** The tolerance in the vector's own units. */
export function lokalToleranse(c: Kurvekontekst): number {
  return c.k.repToleranse / lokalSkala(c.o);
}

/** What repairing would do with the current settings (not applied). */
export function forhandsvisReparasjon(c: Kurvekontekst): Reparasjon {
  return reparerBaner(c.baner, lokalToleranse(c), c.k.repTving);
}

export function reparerAapne(benk: Arbeidsbenk): void {
  const c = kurveObjekt(benk);
  if (!c) return;
  const r = forhandsvisReparasjon(c);
  if (!r.lukket && !r.koblet && !r.tvunget && !r.fjernet) {
    const n = antallAapne(c.baner);
    benk.melde(
      n
        ? `Fant ingen åpne baner som slutter innenfor ${c.k.repToleranse} mm. Øk avstanden, eller velg «Lukk resten med rett linje».`
        : 'Alle banene er lukket.',
    );
    return;
  }
  skriv(benk, c, r.baner, 'Reparer åpne baner');
  settKurve(benk, ingenValg(c));
  const deler = [
    r.koblet ? `${r.koblet} koblet` : '',
    r.lukket ? `${r.lukket} lukket` : '',
    r.tvunget ? `${r.tvunget} lukket med rett linje` : '',
    r.fjernet ? `${r.fjernet} løse streker fjernet` : '',
  ].filter(Boolean);
  benk.melde(`Reparert: ${deler.join(', ')}.`);
}

// ---------- colour and gallery ----------

/**
 * Give the selected shape a colour of its own. It becomes an object of its own in the same layer
 * with its own colour, so the layer's outline, height and profile stay the same for all colours.
 */
export function fargeValgtForm(benk: Arbeidsbenk, materialId: string): boolean {
  const c = kurveObjekt(benk);
  if (!c) return false;
  const valgt = valgteBaner(c.k);
  if (!valgt.length) {
    benk.melde('Velg en form først: klikk på den.');
    return false;
  }
  const d = benk.dok;
  const lag = finnLag(d, c.o.lagId);
  if (!lag) return false;
  const form = [...new Set(valgt.flatMap((b) => formAv(c.baner, b)))].sort((a, b) => a - b);
  const ut = form.map((i) => c.baner[i]!);
  const rest = c.baner.filter((_, i) => !form.includes(i));
  const naa = c.o.materialId ?? lag.materialId;
  if (naa === materialId && !rest.length) {
    benk.melde('Hele vektoren har allerede den fargen.');
    return false;
  }
  // the object's own colour is only stored when it differs from the layer's
  const eget = materialId === lag.materialId ? undefined : materialId;
  const id = c.o.id;
  // the whole vector: the object changes colour, or the layer does when it is alone in it
  if (!rest.length) {
    const alene = objekterILag(d, lag.id).length === 1;
    benk.endre({
      navn: 'Bytt farge på formen',
      anvend: (x) =>
        alene
          ? oppdaterObjekter(oppdaterLag(x, lag.id, { materialId }), [id], (o) => ({
              ...o,
              materialId: undefined,
            }))
          : oppdaterObjekter(x, [id], (o) => ({ ...o, materialId: eget })),
    });
    benk.melde('Formen har fått ny farge.');
    return true;
  }
  const kilde = c.o.kilde as SvgKilde;
  const nytt = {
    ...nyttObjekt(
      lag.id,
      { ...kilde, stier: [banerTilSti(ut)], felt: undefined, dekorId: undefined },
      { ...c.o.transform },
      `${c.o.navn} (ny farge)`,
    ),
    materialId: eget,
  };
  benk.endre({
    navn: 'Bytt farge på formen',
    anvend: (x) => oppdaterKilde(leggTilObjekt(x, nytt), id, { stier: [banerTilSti(rest)] }),
  });
  settKurve(benk, ingenValg(c));
  benk.melde('Formen er et eget objekt i samme lag, med egen farge. Laget har samme omriss som før.');
  return true;
}

/** Save the vector in the gallery under «Dine egne». */
export function lagreKurverIGalleri(benk: Arbeidsbenk): EgetDekor | null {
  const c = kurveObjekt(benk);
  if (!c) return null;
  const g = lokalGeometri(c.o.kilde);
  if (!g) return null;
  const b = g.boks;
  const r = lagreEgetDekor(c.o.navn, {
    kilde: c.o.kilde as SvgKilde,
    bredde: b.maksX - b.minX,
    hoyde: b.maksY - b.minY,
  });
  benk.melde(
    r
      ? `«${r.navn}» er lagt i galleriet under «Dine egne».`
      : 'Nettleseren fikk ikke lagret vektoren (for mye data).',
  );
  return r;
}

/** Baner, åpne baner og punkter, for the panel. */
export function kurveTall(c: Kurvekontekst): { baner: number; aapne: number; punkter: number } {
  return {
    baner: c.baner.length,
    aapne: antallAapne(c.baner),
    punkter: c.baner.reduce((s, b) => s + b.noder.length, 0),
  };
}

// ---------- the pen ----------

const NAVN_TEGNING = 'Tegning';

/**
 * Put a finished pen path on the sign. The first path of a drawing makes a
 * vector of its own where it was drawn (1:1, not scaled); the next ones are
 * added to that vector, so one drawing is one shape in one colour.
 * `bane` is in sign coordinates. Returns the vector's id.
 */
export function leggTilPennBane(benk: Arbeidsbenk, bane: Bane, objektId: string | null): string | null {
  const mal = objektId ? benk.dok.objekter[objektId] : undefined;
  const baner = mal ? hentBaner(mal) : null;
  if (mal && baner && mal.kilde.type === 'svg') {
    const lokal = transformerBaner([bane], inverter(tilMatrise(mal.transform)));
    const alle = [...baner, ...lokal];
    benk.endre({
      navn: 'Tegn bane',
      anvend: (d) => oppdaterKilde(d, mal.id, { stier: [banerTilSti(alle)] }),
    });
    benk.melde('Banen er lagt til i tegningen.');
    return mal.id;
  }
  const boks = banerBoks([bane]);
  if (!boks) return null;
  const sx = (boks.minX + boks.maksX) / 2,
    sy = (boks.minY + boks.maksY) / 2;
  const kilde: SvgKilde = {
    type: 'svg',
    stier: [banerTilSti(flyttBaner([bane], -sx, -sy))],
    filnavn: NAVN_TEGNING,
    // a path drawn inside another is a hole, as when drawing with a pen in a drawing program
    fyllregel: 'evenodd',
  };
  const o = leggTil(benk, kilde, { x: sx, y: sy }, NAVN_TEGNING);
  return o?.id ?? null;
}
