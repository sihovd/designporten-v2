/**
 * «Lagre dekorelement» (Sivert, 2026-10-08, §7): the selected vectors become one element in the gallery
 * under «Dine egne», with their colours. The element keeps the vectors' outlines and colours; it is
 * stored as outlines (not as the original editable curves), which is the open point the spec marks as
 * «Vurdering». It can be put on a sign as a whole or part by part.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, type Dokument, type Objekt } from '../../core/dokument';
import { regionBoks, type Region } from '../../geometri/polygon';
import { lagreEgetFlerfarget, type EgetDekor } from './dekor';
import { valgte } from './handlinger';
import { verdensRegion } from './modell';
import { byggFlerfarget, type SvgDel } from './svgdeler';

/** Why the selection cannot be saved as a decoration, or null when it can. */
export function dekorlagringHinder(dok: Dokument, objekter: Objekt[]): string | null {
  if (!objekter.length) return 'Velg en eller flere vektorer på lerretet først.';
  for (const o of objekter) {
    if (o.kilde.type === 'tekst') return 'Tekst kan ikke lagres som dekor. Velg vektorer og former.';
    if (o.kilde.type === 'form' && o.kilde.form === 'hull') return 'Hull kan ikke lagres som dekor.';
    if (o.operasjon === 'trekk-fra') return 'Kuttere kan ikke lagres som dekor.';
    if (!finnLag(dok, o.lagId)) return 'Et av objektene mangler lag.';
  }
  return null;
}

/** Save the selected vectors as one gallery element. Null (with a message) when it cannot be done. */
export function lagreValgteSomDekor(benk: Arbeidsbenk, navn: string): EgetDekor | null {
  const dok = benk.dok;
  const valg = valgte(benk);
  const hinder = dekorlagringHinder(dok, valg);
  if (hinder) {
    benk.melde(hinder);
    return null;
  }
  // back to front, so a shape painted over another wins where they overlap
  const sortert = [...valg].sort((a, b) => {
    const la = dok.lag.findIndex((l) => l.id === a.lagId);
    const lb = dok.lag.findIndex((l) => l.id === b.lagId);
    if (la !== lb) return lb - la;
    const r = dok.rekkefolge[a.lagId] ?? [];
    return r.indexOf(a.id) - r.indexOf(b.id);
  });
  const deler: SvgDel[] = [];
  const farger = new Map<number, string>();
  sortert.forEach((o, i) => {
    const region: Region | null = verdensRegion(o);
    if (!region?.length) return;
    deler.push({ id: i, navn: o.navn, region, boks: regionBoks(region), rekkefolge: i, fyll: null });
    farger.set(i, o.materialId ?? finnLag(dok, o.lagId)!.materialId);
  });
  const ff = deler.length
    ? byggFlerfarget(navn.trim() || 'Eget dekor', deler, (id) => farger.get(id) ?? null, navn)
    : null;
  if (!ff) {
    benk.melde('Vektorene har ingen flate å lagre.');
    return null;
  }
  const lagret = lagreEgetFlerfarget(navn, ff);
  if (!lagret) {
    benk.melde('Nettleseren fikk ikke lagret dekoret (for mye data i galleriet).');
    return null;
  }
  benk.melde(`«${lagret.navn}» er lagret i dekorgalleriet under Dine egne.`);
  return lagret;
}
