/**
 * The hierarchy: where every part is, where every joint is, and the
 * operations that change it. The root keeps its own position and rotation;
 * every other part is placed by the joint it hangs on, so moving a parent
 * moves its children without breaking anything.
 *
 * A joint's frame has its axis along the parent snap point's normal, turned
 * by the joint's rotation; its up direction is the snap point's «opp». The
 * child is placed so its own snap point faces back along the axis with the
 * same up direction, `avstand` further along.
 */
import { nyId } from '../../core/dokument';
import { grunnformer, type Deltype, type Snappunkt } from './grunnformer';
import { finnProfil, toleranser } from './ledd';
import {
  STANDARD_AVSTAND,
  standardKuppel,
  type CfParametre,
  type Del,
  type Ende,
  type Ledd,
} from './parametre';
import {
  anvend,
  fraEuler,
  gange,
  kolonne,
  kolonner,
  kryss,
  pluss,
  skaler,
  transponer,
  type M3,
  type V3,
} from './vektor';

export interface Plassering {
  /** Part frame → figure coordinates: p_world = R · p + t. */
  R: M3;
  t: V3;
}

export interface Leddramme {
  /** The joint point (figure coordinates). */
  punkt: V3;
  /** Columns: axis (towards the child), s, up. */
  R: M3;
}

export const snappunkter = (d: Del): Snappunkt[] => grunnformer[d.type].snappunkter(d.lengde, d.tykkelse);
export const finnPunkt = (d: Del, id: string): Snappunkt | undefined =>
  snappunkter(d).find((s) => s.id === id);

/** The snap point's basis: columns normal, up × normal, up. */
const basis = (s: Snappunkt): M3 => kolonner(s.normal, kryss(s.opp, s.normal), s.opp);
/** Turns the axis and the side half round, keeping up: the child faces the parent. */
const SNU: M3 = [-1, 0, 0, 0, -1, 0, 0, 0, 1];

export const rot = (p: CfParametre): Del | undefined => {
  const barn = new Set(p.ledd.map((l) => l.barn.del));
  return p.deler.find((d) => !barn.has(d.id));
};

export const leddTil = (p: CfParametre, delId: string): Ledd | undefined =>
  p.ledd.find((l) => l.barn.del === delId);
export const leddFra = (p: CfParametre, delId: string): Ledd[] =>
  p.ledd.filter((l) => l.forelder.del === delId);
export const finnDel = (p: CfParametre, id: string): Del | undefined => p.deler.find((d) => d.id === id);

export interface Oppsett {
  deler: Map<string, Plassering>;
  ledd: Map<string, Leddramme>;
}

/** The frame a joint turns from: the parent snap point's basis in figure coordinates (before the joint's own rotation). */
export function grunnramme(p: CfParametre, oppsett: Oppsett, l: Ledd): M3 | null {
  const f = finnDel(p, l.forelder.del);
  const sf = f && finnPunkt(f, l.forelder.punkt);
  const pl = f && oppsett.deler.get(f.id);
  return sf && pl ? gange(pl.R, basis(sf)) : null;
}

/** Places every part and joint, parents before children. Assumes validated data. */
export function plasser(p: CfParametre): Oppsett {
  const deler = new Map<string, Plassering>();
  const ledd = new Map<string, Leddramme>();
  const r = rot(p);
  if (!r) return { deler, ledd };
  deler.set(r.id, { R: fraEuler(r.rotasjon ?? [0, 0, 0]), t: r.posisjon ?? [0, 0, 0] });
  const ko = [r.id];
  while (ko.length) {
    const fId = ko.shift()!;
    const f = finnDel(p, fId)!;
    const fp = deler.get(fId)!;
    for (const l of leddFra(p, fId)) {
      const b = finnDel(p, l.barn.del);
      const sf = finnPunkt(f, l.forelder.punkt);
      const sb = b && finnPunkt(b, l.barn.punkt);
      if (!b || !sf || !sb) continue;
      const Rj = gange(gange(fp.R, basis(sf)), fraEuler(l.rotasjon));
      const akse = kolonne(Rj, 0);
      const punkt = pluss(
        pluss(fp.t, anvend(fp.R, pluss(sf.posisjon, l.forskyvning))),
        skaler(akse, l.avstand / 2),
      );
      ledd.set(l.id, { punkt, R: Rj });
      const Rb = gange(gange(Rj, SNU), transponer(basis(sb)));
      const barnPunkt = pluss(punkt, skaler(akse, l.avstand / 2));
      deler.set(b.id, { R: Rb, t: pluss(barnPunkt, skaler(anvend(Rb, sb.posisjon), -1)) });
      ko.push(b.id);
    }
  }
  return { deler, ledd };
}

/** A snap point in figure coordinates. */
export function punktIVerden(pl: Plassering, s: Snappunkt): { punkt: V3; normal: V3 } {
  return { punkt: pluss(pl.t, anvend(pl.R, s.posisjon)), normal: anvend(pl.R, s.normal) };
}

/** Free parent snap points a new part of this type can hang on, with the child point it would use. */
export function ledigeFor(
  p: CfParametre,
  type: Deltype,
): { forelder: Ende; barnPunkt: string; navn: string }[] {
  const brukt = new Set(p.ledd.map((l) => `${l.forelder.del}/${l.forelder.punkt}`));
  const ny = grunnformer[type];
  const barnPunkter = ny
    .snappunkter(ny.lengde.standard, ny.tykkelse.standard)
    .filter((s) => s.side === 'barn');
  const ut: { forelder: Ende; barnPunkt: string; navn: string }[] = [];
  for (const d of p.deler)
    for (const s of snappunkter(d)) {
      if (s.side !== 'forelder' || brukt.has(`${d.id}/${s.id}`)) continue;
      const passer = barnPunkter.find((b) => b.type === s.type);
      if (passer)
        ut.push({
          forelder: { del: d.id, punkt: s.id },
          barnPunkt: passer.id,
          navn: `${s.navn} på ${d.navn}`,
        });
    }
  return ut;
}

export type Resultat = { ok: true; p: CfParametre; id: string } | { ok: false; grunn: string };

const nyttNavn = (p: CfParametre, type: Deltype): string => {
  const navn = grunnformer[type].navn;
  const antall = p.deler.filter((d) => d.type === type).length;
  return antall ? `${navn} ${antall + 1}` : navn;
};

function nyDel(p: CfParametre, type: Deltype): Del {
  const g = grunnformer[type];
  return {
    id: nyId('del'),
    type,
    navn: nyttNavn(p, type),
    farge: g.farge,
    lengde: g.lengde.standard,
    tykkelse: g.tykkelse.standard,
  };
}

/** The head (or another part) as the figure's root, standing on the plate. Only when the figure is empty. */
export function leggTilRot(p: CfParametre, type: Deltype): Resultat {
  if (p.deler.length) return { ok: false, grunn: 'Figuren har allerede en del å bygge videre fra.' };
  const d = nyDel(p, type);
  // high enough that an upper body under it stands on the plate
  d.posisjon = [0, 0, Math.round(d.lengde / 2 + grunnformer.overkropp.lengde.standard - 4)];
  d.rotasjon = [0, 0, 0];
  return { ok: true, p: { ...p, deler: [d] }, id: d.id };
}

/** Hangs a new part on a free parent snap point, with an automatic joint. */
export function koble(p: CfParametre, type: Deltype, forelder: Ende): Resultat {
  const f = finnDel(p, forelder.del);
  const sf = f && finnPunkt(f, forelder.punkt);
  if (!f || !sf || sf.side !== 'forelder') return { ok: false, grunn: 'Punktet finnes ikke.' };
  if (p.ledd.some((l) => l.forelder.del === forelder.del && l.forelder.punkt === forelder.punkt))
    return { ok: false, grunn: `${sf.navn} på ${f.navn} er allerede i bruk.` };
  const b = nyDel(p, type);
  const sb = snappunkter(b).find((s) => s.side === 'barn' && s.type === sf.type);
  if (!sb) return { ok: false, grunn: `${grunnformer[type].navn} passer ikke på ${sf.navn.toLowerCase()}.` };
  const ledd: Ledd = {
    id: nyId('ledd'),
    forelder,
    barn: { del: b.id, punkt: sb.id },
    mekanisme: finnProfil(p.profil.id, p.profil.versjon)?.mekanismer[0] ?? 'kjede',
    forskyvning: [0, 0, 0],
    rotasjon: [0, 0, 0],
    ...startverdier(p, f, sf, b),
  };
  return { ok: true, p: { ...p, deler: [...p.deler, b], ledd: [...p.ledd, ledd] }, id: b.id };
}

/**
 * How sharply the parent curves at a snap point, in the plane the joint swings in (the normal and
 * the side direction): the radius of the circle through the surface at the point and a few
 * millimetres to each side (mm). Measured on the base shape.
 */
export function krumning(d: Del, s: Snappunkt): number {
  const f = grunnformer[d.type].felt(d.lengde, d.tykkelse);
  const side = kryss(s.opp, s.normal);
  const x = Math.max(2, Math.min(6, d.tykkelse / 6));
  const dypt = 4;
  // where a line along the normal, x to the side, leaves the shape: its drop behind the point
  const fall = (fortegn: number): number => {
    const start: V3 = pluss(pluss(s.posisjon, skaler(s.normal, -dypt)), skaler(side, fortegn * x));
    let inne = 0,
      ute = dypt + x;
    if (f(...start) >= 0) return dypt;
    for (let i = 0; i < 50; i++) {
      const m = (inne + ute) / 2;
      if (f(...pluss(start, skaler(s.normal, m))) < 0) inne = m;
      else ute = m;
    }
    return dypt - (inne + ute) / 2;
  };
  const delta = Math.max(1e-3, (fall(1) + fall(-1)) / 2);
  return (x * x + delta * delta) / (2 * delta);
}

/**
 * What a new joint starts with. With the pivot in the dome (profile 0.2.0) the parts stand a gap
 * apart (the clearance plus the play), and the dome is a spherical shell round the parent's centre of
 * curvature, a little thinner than the gap: it cuts nothing to begin with, so no thin edges, and the
 * parent's surface turns in place as the joint swings. With the staples (stiftledd 0.1.0), the same
 * gap and a bowl that is the staples' cavity (below). With the pivot in the joint (0.1.0), the
 * earlier start: the child sunk 4 mm into the parent and a curved dome parting them.
 */
function startverdier(p: CfParametre, f: Del, sf: Snappunkt, b: Del): Pick<Ledd, 'avstand' | 'kuppel'> {
  const profil = finnProfil(p.profil.id, p.profil.versjon);
  if (!profil || (profil.dreiepunkt !== 'kuppel' && profil.mekanismer[0] !== 'stifter'))
    return { avstand: STANDARD_AVSTAND, kuppel: standardKuppel(f, b) };
  const tol = toleranser(p, profil);
  const gap = tol.klaring + tol.spillerom;
  const s = Math.min(f.tykkelse, b.tykkelse);
  const R = Math.min(s * 1.5, Math.max(s * 0.3, krumning(f, sf))) + gap / 2;
  const r = Math.min(Math.round(s * 0.8) / 2, R * 0.95);
  const tidel = (v: number) => Math.round(v * 10) / 10;
  const dybde = Math.round((R - Math.sqrt(R * R - r * r)) * 100) / 100;
  if (profil.mekanismer[0] === 'stifter') {
    // A wide bowl round the parent's curvature that reaches past the sides of the parts, so its rim
    // leaves no edge, and thick enough in the middle to make a cavity for the hooked staples. It thins
    // towards the rim, so the cavity meets the parts' surfaces at a shallow, blunt angle.
    const e = profil.maal.stift.verdi;
    const rekk = 2 * e + gap * 1.5 + 0.3;
    // the rim reaches the thinner part's sides; where the parent curves more sharply than that allows,
    // the bowl is flatter than the parent, so the rim does not end inside it as a thin ring
    const rs = s / 2;
    const Rs = Math.max(R, rs / 0.95);
    return {
      avstand: tidel(gap),
      kuppel: {
        diameter: tidel(rs * 2),
        dybde: Math.round((Rs - Math.sqrt(Rs * Rs - rs * rs)) * 100) / 100,
        helning: 0,
        retning: 0,
        tykkelseSenter: tidel(Math.min(s * 0.7, 2 * (rekk + gap) + 1.4)),
        tykkelseKant: tidel(gap + 1),
      },
    };
  }
  const baand = tidel(Math.max(0.2, gap - 0.2));
  return {
    avstand: tidel(gap),
    kuppel: {
      diameter: tidel(r * 2),
      dybde,
      helning: 0,
      retning: 0,
      tykkelseSenter: baand,
      tykkelseKant: baand,
    },
  };
}

/** All parts that hang below a part, at any depth. */
export function etterkommere(p: CfParametre, id: string): string[] {
  const ut: string[] = [];
  const ko = [id];
  while (ko.length) {
    const n = ko.shift()!;
    for (const l of leddFra(p, n)) {
      ut.push(l.barn.del);
      ko.push(l.barn.del);
    }
  }
  return ut;
}

/** Removes a part, everything hanging on it and their joints. */
export function slett(p: CfParametre, id: string): CfParametre {
  const borte = new Set([id, ...etterkommere(p, id)]);
  return {
    ...p,
    deler: p.deler.filter((d) => !borte.has(d.id)),
    ledd: p.ledd.filter((l) => !borte.has(l.barn.del) && !borte.has(l.forelder.del)),
  };
}
