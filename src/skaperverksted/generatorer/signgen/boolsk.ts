/**
 * Boolean operations on shapes and vectors (Sivert, 2026-10-06, the contextual
 * bar): Union, Subtract, Intersect and Exclude. The selected objects are
 * replaced by one vector with the result, in the layer of the back-most one.
 * Subtract takes everything in front away from the back-most object, as
 * «minus front» does in a drawing program.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { finnLag, type Dokument, type Objekt, type SvgKilde } from '../../core/dokument';
import type { Bane, Node } from '../../geometri/bane';
import { banerTilSti } from '../../geometri/bane';
import {
  differanse,
  forenkle,
  regionBoks,
  ringerI,
  snitt,
  union,
  unionAlle,
  type Region,
} from '../../geometri/polygon';
import type { IkonId } from '../../shell/ikoner';
import { leggTilObjekt, nyttObjekt, slettObjekter } from './dokument';
import { verdensRegion } from './modell';
import { valgte } from './handlinger';

export type Boolsk = 'union' | 'subtract' | 'intersect' | 'exclude';

export const BOOLSKE: { id: Boolsk; navn: string; hjelp: string; ikon: IkonId }[] = [
  { id: 'union', navn: 'Union', hjelp: 'Slå formene sammen til én', ikon: 'union' },
  { id: 'subtract', navn: 'Subtract', hjelp: 'Trekk formene foran fra den bakerste', ikon: 'subtract' },
  {
    id: 'intersect',
    navn: 'Intersect',
    hjelp: 'Behold bare det som ligger i alle formene',
    ikon: 'intersect',
  },
  { id: 'exclude', navn: 'Exclude', hjelp: 'Behold det som ikke overlapper', ikon: 'exclude' },
];

const NAVN: Record<Boolsk, string> = {
  union: 'Union',
  subtract: 'Subtract',
  intersect: 'Intersect',
  exclude: 'Exclude',
};

/** Why the selection cannot be combined, or null when it can. */
export function boolskHinder(dok: Dokument, objekter: Objekt[]): string | null {
  if (objekter.length < 2) return 'Velg to eller flere former.';
  for (const o of objekter) {
    if (o.last || finnLag(dok, o.lagId)?.last) return 'Noen av objektene er låst.';
    if (o.kilde.type === 'tekst') return 'Tekst kan ikke kombineres ennå.';
    if (o.kilde.type === 'form' && o.kilde.form === 'hull') return 'Hull kan ikke kombineres.';
    if (o.operasjon === 'trekk-fra') return 'Kuttere kan ikke kombineres.';
  }
  return null;
}

/** Back to front: lower layers first, and within a layer by stacking order. */
export function bakerstTilFremst(dok: Dokument, objekter: Objekt[]): Objekt[] {
  const nokkel = (o: Objekt): [number, number] => [
    dok.lag.findIndex((l) => l.id === o.lagId),
    (dok.rekkefolge[o.lagId] ?? []).indexOf(o.id),
  ];
  return [...objekter].sort((a, b) => {
    const [la, ia] = nokkel(a),
      [lb, ib] = nokkel(b);
    return la - lb || ia - ib;
  });
}

/** The result of the operation on regions given back to front. */
export function kombiner(op: Boolsk, regioner: Region[]): Region {
  const [forste, ...resten] = regioner;
  if (!forste) return [];
  switch (op) {
    case 'union':
      return unionAlle(regioner);
    case 'subtract':
      return resten.reduce((r, x) => differanse(r, x), forste);
    case 'intersect':
      return resten.reduce((r, x) => snitt(r, x), forste);
    case 'exclude':
      // what lies in an odd number of the shapes
      return resten.reduce((r, x) => union(differanse(r, x), differanse(x, r)), forste);
  }
}

const hjorne = (p: { x: number; y: number }): Node => ({ p, inn: null, ut: null, glatt: false });

/** Combine the selected shapes. Returns false (with a message) when it cannot. */
export function kombinerValgte(benk: Arbeidsbenk, op: Boolsk): boolean {
  const dok = benk.dok;
  const valg = valgte(benk);
  const hinder = boolskHinder(dok, valg);
  if (hinder) {
    benk.melde(hinder);
    return false;
  }
  const sortert = bakerstTilFremst(dok, valg);
  const regioner = sortert.map((o) => verdensRegion(o));
  if (regioner.some((r) => !r)) {
    benk.melde('Noen av formene har ingen flate ennå.');
    return false;
  }
  const resultat = forenkle(kombiner(op, regioner as Region[]), 0.005);
  if (!resultat.length) {
    benk.melde(
      op === 'intersect'
        ? 'Formene overlapper ikke, så det er ingenting å beholde.'
        : 'Resultatet ble tomt. Ingenting er endret.',
    );
    return false;
  }
  const boks = regionBoks(resultat);
  const cx = (boks.minX + boks.maksX) / 2,
    cy = (boks.minY + boks.maksY) / 2;
  const baner: Bane[] = ringerI(resultat)
    .filter((r) => r.length >= 3)
    .map((r) => ({ noder: r.map((p) => hjorne({ x: p.x - cx, y: p.y - cy })), lukket: true }));
  const kilde: SvgKilde = {
    type: 'svg',
    stier: [banerTilSti(baner)],
    filnavn: NAVN[op],
    fyllregel: 'evenodd',
  };
  const mal = sortert[0]!;
  const nytt = nyttObjekt(mal.lagId, kilde, { x: cx, y: cy }, NAVN[op]);
  const bort = sortert.map((o) => o.id);
  benk.endre({
    navn: NAVN[op],
    anvend: (d) => leggTilObjekt(slettObjekter(d, bort), nytt),
  });
  benk.velg({ objekter: [nytt.id], lag: mal.lagId });
  benk.melde(
    `${NAVN[op]}: ${bort.length} former er blitt én vektor i «${finnLag(benk.dok, mal.lagId)?.navn ?? 'laget'}».`,
  );
  return true;
}
