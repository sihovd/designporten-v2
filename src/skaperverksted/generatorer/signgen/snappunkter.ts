/**
 * Snap points on the master (Sivert, 2026-10-10). A point is not a place on the screen or a pair of numbers
 * in millimetres: it is a place in the geometry of what it sits on, given as a fraction of the box of the sign
 * or of one object (0, 0 is the lower left corner, 1, 1 the upper right). When the text of a CSV row is longer,
 * the sign larger or an outline wider, the box moves and the point goes with it. A sign made from the master
 * therefore reads the points off its own geometry, and a change in one sign never reaches the master or
 * the others.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { nyId, type Dokument } from '../../core/dokument';
import { erTom, type Boks, type Vec2 } from '../../core/geometri2d';
import { fotavtrykkBoks, verdensBoks } from './modell';
import { lesArbeid, settArbeid } from './csvflyt';
import { lesSnap, settSnap, type Snappunkt } from './snapmotor';

/** The box a point sits in: the footprint of the sign, or one object. Null when it is not there (yet). */
export function malboks(dok: Dokument, mal: Snappunkt['mal']): Boks | null {
  const b = mal === 'skilt' ? fotavtrykkBoks(dok) : dok.objekter[mal] ? verdensBoks(dok.objekter[mal]) : null;
  return b && !erTom(b) ? b : null;
}

/** Where a point is in a document, read off the geometry as it is now. Null when its target is gone. */
export function snappunktPosisjon(dok: Dokument, p: Snappunkt): Vec2 | null {
  const b = malboks(dok, p.mal);
  if (!b) return null;
  return { x: b.minX + p.u * (b.maksX - b.minX), y: b.minY + p.v * (b.maksY - b.minY) };
}

export interface PlassertPunkt extends Vec2 {
  id: string;
  navn: string;
  mal: Snappunkt['mal'];
}

/** The points of the master as placed on this document's geometry; those whose target is gone are left out. */
export function snappunkterAv(
  dok: Dokument,
  liste: readonly Snappunkt[] = lesSnap(dok).punktliste,
): PlassertPunkt[] {
  return liste.flatMap((p) => {
    const pos = snappunktPosisjon(dok, p);
    return pos ? [{ id: p.id, navn: p.navn, mal: p.mal, ...pos }] : [];
  });
}

/** The nine places a point can be put on a box. */
export const PUNKTPLASSER: { u: number; v: number; navn: string }[] = [
  { u: 0, v: 1, navn: 'Oppe til venstre' },
  { u: 0.5, v: 1, navn: 'Oppe i midten' },
  { u: 1, v: 1, navn: 'Oppe til høyre' },
  { u: 0, v: 0.5, navn: 'Midt til venstre' },
  { u: 0.5, v: 0.5, navn: 'Midten' },
  { u: 1, v: 0.5, navn: 'Midt til høyre' },
  { u: 0, v: 0, navn: 'Nede til venstre' },
  { u: 0.5, v: 0, navn: 'Nede i midten' },
  { u: 1, v: 0, navn: 'Nede til høyre' },
];

export const plassNavn = (u: number, v: number) =>
  PUNKTPLASSER.find((p) => Math.abs(p.u - u) < 0.01 && Math.abs(p.v - v) < 0.01)?.navn ??
  `${Math.round(u * 100)} % fra venstre, ${Math.round(v * 100)} % fra bunnen`;

export function leggTilSnappunkt(dok: Dokument, mal: Snappunkt['mal'], u: number, v: number): Dokument {
  const liste = lesSnap(dok).punktliste;
  const navn = `Punkt ${liste.length + 1}`;
  const punkt: Snappunkt = { id: nyId('sp'), navn, mal, u, v };
  return settSnap(dok, { punktliste: [...liste, punkt] });
}

export function slettSnappunkt(dok: Dokument, id: string): Dokument {
  return settSnap(dok, { punktliste: lesSnap(dok).punktliste.filter((p) => p.id !== id) });
}

/**
 * The distance between objects. It is also the space the automatic packing leaves between the signs, so the
 * moves made by hand on the plates of the CSV work, which are offsets from that packing, no longer fit and go.
 */
export function settSnapAvstand(dok: Dokument, avstand: number): Dokument {
  const ny = settSnap(dok, { avstand });
  const a = lesArbeid(ny);
  return a && Object.keys(a.plateflytt).length && lesSnap(ny).avstand !== lesSnap(dok).avstand
    ? settArbeid(ny, { ...a, plateflytt: {} })
    : ny;
}

// ---------- actions ----------

export function leggTilSnappunktI(benk: Arbeidsbenk, mal: Snappunkt['mal'], u: number, v: number): void {
  benk.endre({ navn: 'Nytt snap-punkt', anvend: (d) => leggTilSnappunkt(d, mal, u, v) });
}

export function slettSnappunktI(benk: Arbeidsbenk, id: string): void {
  benk.endre({ navn: 'Slett snap-punkt', anvend: (d) => slettSnappunkt(d, id) });
}

export function endreSnapAvstandI(benk: Arbeidsbenk, avstand: number): void {
  benk.endre({
    navn: 'Avstand mellom objekter',
    slaSammen: 'snap-avstand',
    anvend: (d) => settSnapAvstand(d, avstand),
  });
}

export function endreSnapI(
  benk: Arbeidsbenk,
  endring: Parameters<typeof settSnap>[1],
  slaSammen?: string,
): void {
  benk.endre({ navn: 'Snap', slaSammen, anvend: (d) => settSnap(d, endring) });
}
