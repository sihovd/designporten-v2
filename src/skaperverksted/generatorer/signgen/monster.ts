/**
 * The Pattern tool (Sivert, 2026-10-08, §8): the selected vectors are repeated in a direction or along a
 * path, with a count, a spacing and a rotation. The copies are ordinary objects in the same layers as the
 * originals, so they can be edited one by one afterwards. A pattern that stays editable (change the count
 * or path after it is made) and rows and columns are open points in the spec («Vurdering») and are not
 * built; the preview shows what «Lag mønster» will make.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, type Dokument, type Objekt } from '../../core/dokument';
import { anvend, tilMatrise, type Vec2 } from '../../core/geometri2d';
import { kontrollpunkter, punktPaaKurve, segmenter, tolkBaner, erKurve } from '../../geometri/bane';
import { senterlinje } from '../../geometri/strek';
import { ringerI } from '../../geometri/polygon';
import { leggTilObjekt } from './dokument';
import { redigerbare, utvalgsboks } from './handlinger';
import { verdensRegion } from './modell';
import { nyId } from '../../core/dokument';
import { MAKS_KOPIER, type Monstervalg } from './monstervalg';

export { STANDARD_MONSTER, type Monstervalg } from './monstervalg';

/** Where one copy goes: the group's centre is moved by (dx, dy) and the copy is turned by `drot` degrees about it. */
export interface Plassering {
  dx: number;
  dy: number;
  drot: number;
}

/** The path of a vector as a polyline in sign coordinates (a Paint stroke's centre line, a vector's first path, else a shape's outline). */
export function banelinje(o: Objekt): Vec2[] | null {
  const m = tilMatrise(o.transform);
  const k = o.kilde;
  if (k.type === 'svg' && k.strek) {
    const l = senterlinje(k.strek, 0.5).map((x) => anvend(m, x.p));
    return l.length >= 2 ? l : null;
  }
  if (k.type === 'svg') {
    const b = tolkBaner(k.stier.join(''))[0];
    if (b && b.noder.length >= 2) {
      const ut: Vec2[] = [b.noder[0]!.p];
      for (const [i, j] of segmenter(b)) {
        const a = b.noder[i]!,
          z = b.noder[j]!;
        if (erKurve(a, z)) {
          const kp = kontrollpunkter(a, z);
          for (let s = 1; s <= 16; s++) ut.push(punktPaaKurve(kp, s / 16));
        } else ut.push(z.p);
      }
      return ut.map((p) => anvend(m, p));
    }
  }
  const r = verdensRegion(o);
  const ring = r ? ringerI(r)[0] : undefined;
  return ring && ring.length >= 2 ? [...ring, ring[0]!] : null;
}

/** The point at `avstand` mm along a polyline, with the direction of the line there (degrees). */
export function langsLinje(linje: Vec2[], avstand: number): { p: Vec2; vinkel: number } {
  let rest = Math.max(0, avstand);
  for (let i = 0; i < linje.length - 1; i++) {
    const a = linje[i]!,
      b = linje[i + 1]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (rest <= l || i === linje.length - 2) {
      const u = l > 0 ? Math.min(1, rest / l) : 0;
      return {
        p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
        vinkel: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
    rest -= l;
  }
  return { p: linje[0]!, vinkel: 0 };
}

export function linjelengde(linje: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < linje.length - 1; i++)
    s += Math.hypot(linje[i + 1]!.x - linje[i]!.x, linje[i + 1]!.y - linje[i]!.y);
  return s;
}

/** The copies' placements for a group whose centre is `sentrum`. Empty when the path is missing. */
export function monsterPlasseringer(sentrum: Vec2, v: Monstervalg, linje: Vec2[] | null): Plassering[] {
  const n = Math.max(0, Math.min(MAKS_KOPIER, Math.round(v.antall)));
  const ut: Plassering[] = [];
  if (v.modus === 'retning') {
    const r = (v.vinkel * Math.PI) / 180;
    for (let i = 1; i <= n; i++)
      ut.push({
        dx: Math.cos(r) * v.avstand * i,
        dy: Math.sin(r) * v.avstand * i,
        drot: v.rotasjon * i,
      });
    return ut;
  }
  if (!linje || linje.length < 2) return [];
  const total = linjelengde(linje);
  // spacing 0 spreads the copies evenly from the start to the end of the path
  const steg = v.avstand > 0 ? v.avstand : n > 1 ? total / (n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const { p, vinkel } = langsLinje(linje, steg * i);
    ut.push({
      dx: p.x - sentrum.x,
      dy: p.y - sentrum.y,
      drot: (v.folgBane ? vinkel : 0) + v.rotasjon * (i + 1),
    });
  }
  return ut;
}

/** The vectors the pattern repeats: the selected ones, except the one that is the path. */
export function monsterKilder(benk: Arbeidsbenk, v: Monstervalg): Objekt[] {
  return redigerbare(benk).filter((o) => !(v.modus === 'bane' && o.id === v.baneId));
}

/** The vectors that can be a path: all vectors and shapes on the sign that are not being repeated. */
export function mulligeBaner(dok: Dokument, kilder: Objekt[]): Objekt[] {
  const bort = new Set(kilder.map((o) => o.id));
  return Object.values(dok.objekter).filter(
    (o) =>
      !bort.has(o.id) && o.kilde.type !== 'tekst' && !(o.kilde.type === 'form' && o.kilde.form === 'hull'),
  );
}

export function sentrumAv(kilder: Objekt[]): Vec2 | null {
  const b = utvalgsboks(kilder);
  return b ? { x: (b.minX + b.maksX) / 2, y: (b.minY + b.maksY) / 2 } : null;
}

/** An object's transform after moving the group by the placement. */
export function flyttetTransform(o: Objekt, sentrum: Vec2, p: Plassering): Objekt['transform'] {
  const r = (p.drot * Math.PI) / 180;
  const cos = Math.cos(r),
    sin = Math.sin(r);
  const rx = o.transform.x - sentrum.x,
    ry = o.transform.y - sentrum.y;
  return {
    ...o.transform,
    x: sentrum.x + p.dx + rx * cos - ry * sin,
    y: sentrum.y + p.dy + rx * sin + ry * cos,
    rotasjon: o.transform.rotasjon + p.drot,
  };
}

/** Make the copies as ordinary objects, one undo step. Returns how many were made. */
export function lagMonster(benk: Arbeidsbenk, v: Monstervalg): number {
  const kilder = monsterKilder(benk, v);
  if (!kilder.length) {
    benk.melde('Velg vektorene som skal gjentas først.');
    return 0;
  }
  const sentrum = sentrumAv(kilder)!;
  const bane = v.modus === 'bane' ? (benk.dok.objekter[v.baneId ?? ''] ?? null) : null;
  if (v.modus === 'bane' && !bane) {
    benk.melde('Velg en bane som kopiene skal følge.');
    return 0;
  }
  const plasseringer = monsterPlasseringer(sentrum, v, bane ? banelinje(bane) : null);
  if (!plasseringer.length) {
    benk.melde('Banen har ingen lengde å følge.');
    return 0;
  }
  const nye: Objekt[] = [];
  for (const p of plasseringer)
    for (const o of kilder) {
      if (!finnLag(benk.dok, o.lagId)) continue;
      nye.push({
        ...structuredClone(o),
        id: nyId('o'),
        last: false,
        transform: flyttetTransform(o, sentrum, p),
      });
    }
  benk.endre({
    navn: 'Lag mønster',
    anvend: (d) => nye.reduce((acc, o) => leggTilObjekt(acc, o), d),
  });
  benk.velg({ objekter: nye.map((o) => o.id), lag: nye[0]!.lagId });
  benk.melde(`${plasseringer.length} kopier er laget.`);
  return plasseringer.length;
}
