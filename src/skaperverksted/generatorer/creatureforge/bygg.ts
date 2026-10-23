/**
 * The Creature Forge build: project → one closed mesh per part, in the print
 * pose, with findings. Pure and deterministic; runs in a web worker.
 *
 * Each part is a field: its base shape, minus the domes of its joints, minus
 * the room its partners' mechanisms need, plus its own mechanism parts. Each
 * part is meshed on its own grid, so parts never merge. Checks are measured
 * on the meshes in figure coordinates; the export is the same meshes turned
 * into the print pose (lying on the back, front up) and set on the plate.
 */
import type { Advarsel, Modellresultat } from '../../core/generator';
import type { Mesh, ModellDel } from '../../geometri/mesh';
import { grunnformer } from './grunnformer';
import { antallBiter, fjernSmuler, naerhet, tetthet, tynnesteVegg } from './kontroll';
import { kuppelBoks, kuppelFelt, kuppelSenter } from './kuppel';
import {
  finnProfil,
  mekanisme,
  toleranser,
  type Leddprofil,
  type Mekanismeform,
  type Toleranser,
} from './ledd';
import { lagRutenett, marsjer } from './marsj';
import { valider, type CfParametre, type Del } from './parametre';
import { leddFra, leddTil, plasser, type Leddramme } from './plassering';
import {
  avgrenset,
  boksIRamme,
  boksUnion,
  differanse,
  iRamme,
  union,
  utvid,
  type Boks,
  type Felt,
} from './sdf';
import { anvend, kolonne, lengde, minus, omAkse, pluss, prikk, vinkel, type M3, type V3 } from './vektor';

export type Niva = 'feil' | 'advarsel' | 'info';

export interface Funn {
  regel: string;
  niva: Niva;
  tittel: string;
  tekst: string;
  delId?: string;
  leddId?: string;
}

/** Plain data about a built joint (it crosses from the worker). */
export interface Leddinfo {
  id: string;
  ramme: Leddramme;
  /** The axis the mechanism swings about, figure coordinates. */
  svingakse: { punkt: V3; akse: V3 };
  /** Degrees the joint swings each way about that axis before the parts touch (checked in 5° steps). */
  sving: { pluss: number; minus: number; maal: number };
  /** How much wider the held part is than its opening (mm). */
  fangst: number;
}

export interface CfResultat extends Modellresultat {
  funn: Funn[];
  status: 'gronn' | 'gul' | 'rod' | 'tom';
  /** Figure coordinates → print pose: p' = R · p + t. */
  utskrift: { R: M3; t: V3 } | null;
  ledd: Leddinfo[];
  profil: Leddprofil | null;
  toleranser: Toleranser | null;
  /** Checksum of the project the result was built from. */
  revisjon: string;
}

/** Grid cell (mm) and the most grid nodes per part. */
export const CELLE = 0.45;
export const MAKS_NODER = 2_400_000;
/** Pieces smaller than this in every direction are meshing specks (mm). */
export const SMULE = 1;
/** Lying on the back with the front up: (x, y, z) → (x, z, −y). */
export const UTSKRIFT_R: M3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
const SVINGSTEG = 5;

export function revisjon(p: unknown): string {
  const s = JSON.stringify(p);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const tom = (funn: Funn[], rev: string): CfResultat => ({
  deler: [],
  advarsler: advarsler(funn),
  funn,
  status: funn.some((f) => f.niva === 'feil') ? 'rod' : 'tom',
  utskrift: null,
  ledd: [],
  profil: null,
  toleranser: null,
  revisjon: rev,
});

export const advarsler = (funn: Funn[]): Advarsel[] =>
  funn.map((f) => ({ niva: f.niva, tekst: `${f.tittel}. ${f.tekst}`, objektId: f.delId ?? f.leddId }));

const mmTekst = (v: number) => `${v.toFixed(2).replace('.', ',')} mm`;

interface Bygget {
  del: Del;
  felt: Felt;
  mesh: Mesh;
  /** Specks left by the mesher and removed. */
  smuler: number;
}

export function byggCreature(raw: unknown, fremdrift?: (andel: number) => void): CfResultat {
  const rev = revisjon(raw);
  const v = valider(raw);
  if (!v.ok)
    return tom(
      [
        {
          regel: 'CF-PROSJEKT-01',
          niva: 'feil',
          tittel: 'Prosjektet kan ikke leses',
          tekst: v.grunner.join(' '),
        },
      ],
      rev,
    );
  const p: CfParametre = v.p;
  const profil = finnProfil(p.profil.id, p.profil.versjon);
  if (!profil)
    return tom(
      [
        {
          regel: 'CF-PROSJEKT-02',
          niva: 'feil',
          tittel: 'Ukjent leddprofil',
          tekst: `Profilen ${p.profil.id} ${p.profil.versjon} finnes ikke i denne versjonen.`,
        },
      ],
      rev,
    );
  if (!p.deler.length) return tom([], rev);

  const tol = toleranser(p, profil);
  const oppsett = plasser(p);
  const funn: Funn[] = [];

  // joints: frame, dome and mechanism in figure coordinates
  const leddData = new Map<
    string,
    {
      ramme: Leddramme;
      form: Mekanismeform;
      /** Where the mechanism sits and turns (figure coordinates). */
      dreiepunkt: V3;
      kuppel: Felt;
      forelderPluss: Felt;
      barnPluss: Felt;
      romF: Felt;
      romB: Felt;
      boks: Boks;
    }
  >();
  for (const l of p.ledd) {
    const ramme = oppsett.ledd.get(l.id);
    if (!ramme) continue;
    // the pivot: the joint point, or the centre of the dome's sphere (profile 0.2.0)
    const senter = profil.dreiepunkt === 'kuppel' ? kuppelSenter(l.kuppel) : null;
    const rekkevidde = senter
      ? lengde(senter) + Math.max(l.kuppel.tykkelseSenter, l.kuppel.tykkelseKant) / 2 + 0.5
      : 0;
    const dreiepunkt = senter ? pluss(ramme.punkt, anvend(ramme.R, senter)) : ramme.punkt;
    const form = mekanisme(l.mekanisme, profil, tol, rekkevidde);
    const mekBoks = boksIRamme(form.boks, ramme.R, dreiepunkt);
    const kBoks = boksIRamme(kuppelBoks(l.kuppel), ramme.R, ramme.punkt);
    const iMek = (f: Felt) => avgrenset(iRamme(f, ramme.R, dreiepunkt), mekBoks);
    leddData.set(l.id, {
      ramme,
      form,
      dreiepunkt,
      kuppel: avgrenset(iRamme(kuppelFelt(l.kuppel), ramme.R, ramme.punkt), kBoks),
      forelderPluss: iMek(form.forelderPluss),
      barnPluss: iMek(form.barnPluss),
      romF: iMek(form.romForelder),
      romB: iMek(form.romBarn),
      boks: mekBoks,
    });
  }

  const bygget: Bygget[] = [];
  p.deler.forEach((d, i) => {
    const pl = oppsett.deler.get(d.id);
    if (!pl) return;
    const g = grunnformer[d.type];
    const grunnBoks = boksIRamme(g.boks(d.lengde, d.tykkelse), pl.R, pl.t);
    const kupler: Felt[] = [],
      rom: Felt[] = [],
      egne: Felt[] = [];
    let boks: Boks | null = grunnBoks;
    for (const l of leddFra(p, d.id)) {
      const ld = leddData.get(l.id);
      if (!ld) continue;
      kupler.push(ld.kuppel);
      rom.push(ld.romF);
      egne.push(ld.forelderPluss);
      boks = boksUnion(boks, ld.boks);
    }
    const opp = leddTil(p, d.id);
    const ld = opp && leddData.get(opp.id);
    if (ld) {
      kupler.push(ld.kuppel);
      rom.push(ld.romB);
      egne.push(ld.barnPluss);
      boks = boksUnion(boks, ld.boks);
    }
    const grunn = avgrenset(iRamme(g.felt(d.lengde, d.tykkelse), pl.R, pl.t), utvid(grunnBoks, 1));
    const felt = union(differanse(differanse(grunn, union(...kupler)), union(...rom)), ...egne);
    const { mesh, fjernet } = fjernSmuler(
      marsjer(lagRutenett(utvid(boks!, 1), CELLE, MAKS_NODER), felt),
      SMULE,
    );
    bygget.push({ del: d, felt, mesh, smuler: fjernet });
    fremdrift?.(((i + 1) / p.deler.length) * 0.7);
  });

  // the parts themselves
  for (const b of bygget) {
    if (!b.mesh.indekser.length) {
      funn.push({
        regel: 'CF-DEL-03',
        niva: 'feil',
        tittel: `${b.del.navn} er tom`,
        tekst: 'Kuppelen og leddene har skåret bort hele delen. Gjør kuppelen mindre eller delen større.',
        delId: b.del.id,
      });
      continue;
    }
    const m = tetthet(b.mesh);
    if (!m.lukket)
      funn.push({
        regel: 'CF-DEL-01',
        niva: 'feil',
        tittel: `${b.del.navn} er ikke tett`,
        tekst: `Overflaten har ${m.aapneKanter} åpne og ${m.feilKanter} feil kanter, så den kan ikke printes slik.`,
        delId: b.del.id,
      });
    if (b.smuler)
      funn.push({
        regel: 'CF-DEL-04',
        niva: 'info',
        tittel: `${b.del.navn}: ${b.smuler} ${b.smuler === 1 ? 'smule' : 'smuler'} fjernet`,
        tekst: `Meshingen la igjen ${b.smuler === 1 ? 'en bit' : 'biter'} mindre enn ${SMULE} mm der to snitt nesten møtes. ${b.smuler === 1 ? 'Den er' : 'De er'} tatt bort, for de er for små til å printes.`,
        delId: b.del.id,
      });
    const biter = antallBiter(b.mesh);
    if (biter > 1)
      funn.push({
        regel: 'CF-DEL-02',
        niva: 'feil',
        tittel: `${b.del.navn} er delt i ${biter} biter`,
        tekst:
          'Kuppelen eller leddet skjærer delen i flere løse biter. Juster kuppelens tykkelse eller diameter, eller leddets avstand.',
        delId: b.del.id,
      });
  }

  const finn = (id: string) => bygget.find((b) => b.del.id === id && b.mesh.indekser.length);
  const leddinfo: Leddinfo[] = [];
  p.ledd.forEach((l, i) => {
    const ld = leddData.get(l.id);
    const f = finn(l.forelder.del),
      b = finn(l.barn.del);
    if (!ld) return;
    const navn = `${f?.del.navn ?? 'Delen'} og ${b?.del.navn ?? 'delen'}`;
    // capture
    if (ld.form.fangst < profil.maal.minFang.verdi)
      funn.push({
        regel: 'CF-FANG-01',
        niva: 'feil',
        tittel: `Leddet mellom ${navn} holder ikke`,
        tekst: `${ld.form.fangstTekst} med bare ${mmTekst(ld.form.fangst)} (minst ${mmTekst(profil.maal.minFang.verdi)}). Delene kan falle fra hverandre. Mindre klaring eller spillerom hjelper.`,
        leddId: l.id,
      });
    // upright in the print pose
    const skjevhet = vinkel(kolonne(ld.ramme.R, 2), [0, -1, 0]);
    if (skjevhet > 15)
      funn.push({
        regel: 'CF-PRINT-01',
        niva: 'advarsel',
        tittel: `Leddet mellom ${navn} står skrått i printposisjonen`,
        tekst: `Mekanismen er dreid ${Math.round(skjevhet)}° bort fra rett opp når figuren ligger på ryggen. Da kan den trenge støtte. Overheng kontrolleres ikke ennå.`,
        leddId: l.id,
      });
    const sving = { pluss: 0, minus: 0, maal: profil.maal.sving.verdi };
    const akse = anvend(ld.ramme.R, ld.form.svingakse.akse);
    const punkt = pluss(ld.dreiepunkt, anvend(ld.ramme.R, ld.form.svingakse.punkt));
    if (f && b) {
      // clearance in the print pose
      const n = naerhet(f.mesh, f.felt, b.mesh, b.felt, tol.klaring + 1);
      if (n.inni > 0)
        funn.push({
          regel: 'CF-KLAR-01',
          niva: 'feil',
          tittel: `${navn} vokser inn i hverandre`,
          tekst:
            'Delene overlapper, så de printes fast sammen. Gjør kuppelen større eller tykkere, eller øk avstanden i leddet.',
          leddId: l.id,
        });
      else if (n.minste < tol.klaring - 0.02)
        funn.push({
          regel: 'CF-KLAR-01',
          niva: 'feil',
          tittel: `For liten klaring mellom ${navn}`,
          tekst: `Minste avstand er ${mmTekst(n.minste)}, men utskriftsklaringen er ${mmTekst(tol.klaring)}. Delene kan smelte sammen i printen. Gjør kuppelen tykkere der, eller øk avstanden.`,
          leddId: l.id,
        });
      else
        funn.push({
          regel: 'CF-KLAR-01',
          niva: 'info',
          tittel: `Klaring mellom ${navn}`,
          tekst: `Minste målte avstand er ${n.minste >= tol.klaring + 0.99 ? `over ${mmTekst(tol.klaring + 1)}` : mmTekst(n.minste)} (krav ${mmTekst(tol.klaring)}).`,
          leddId: l.id,
        });
      // swing about the mechanism's axis
      sving.pluss = fri(b, f, punkt, akse, 1, sving.maal);
      sving.minus = fri(b, f, punkt, akse, -1, sving.maal);
      const minst = Math.min(sving.pluss, sving.minus);
      funn.push({
        regel: 'CF-SVING-01',
        niva: minst < sving.maal ? 'advarsel' : 'info',
        tittel: `Leddet mellom ${navn} kan svinge ${minst >= sving.maal ? `±${sving.maal}°` : `${sving.minus}° og ${sving.pluss}°`}`,
        tekst:
          minst >= sving.maal
            ? `Delene møtes ikke innenfor ±${sving.maal}° om leddets akse (kontrollert i steg på ${SVINGSTEG}°).`
            : `Delene møtes før ±${sving.maal}° om leddets akse. Kuppelens dybde, diameter og tykkelse avgjør hvor fritt leddet kan svinge.`,
        leddId: l.id,
      });
      // walls round the joint
      const radius = l.kuppel.diameter / 2 + 4;
      for (const del of [f, b]) {
        const t = tynnesteVegg(del.mesh, del.felt, ld.ramme.punkt, radius, profil.maal.minVegg.verdi);
        if (t)
          funn.push({
            regel: 'CF-VEGG-01',
            niva: 'advarsel',
            tittel: `Tynt materiale i ${del.del.navn} ved leddet`,
            tekst: `Ned mot ${mmTekst(t.tykkelse)} på ${t.antall} steder (varsles under ${mmTekst(profil.maal.minVegg.verdi)}, en prøveverdi). Tynne kanter kan brekke.`,
            delId: del.del.id,
            leddId: l.id,
          });
      }
    }
    leddinfo.push({ id: l.id, ramme: ld.ramme, svingakse: { punkt, akse }, sving, fangst: ld.form.fangst });
    fremdrift?.(0.7 + ((i + 1) / Math.max(1, p.ledd.length)) * 0.3);
  });

  funn.push({
    regel: 'CF-INFO-01',
    niva: 'info',
    tittel: 'Ikke fysisk testet',
    tekst: `${profil.navn} ${profil.versjon} er ikke testprintet. Overheng og støtte for kroppsformene kontrolleres ikke ennå.`,
  });

  // print pose: lying on the back, centred on the plate
  const R = UTSKRIFT_R;
  let minZ = Infinity,
    x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const b of bygget) {
    const q = b.mesh.posisjoner;
    for (let i = 0; i < q.length; i += 3) {
      const [x, y, z] = anvend(R, [q[i]!, q[i + 1]!, q[i + 2]!]);
      minZ = Math.min(minZ, z);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  const t: V3 = Number.isFinite(minZ) ? [-(x0 + x1) / 2, -(y0 + y1) / 2, -minZ] : [0, 0, 0];
  const deler: ModellDel[] = bygget.map((b) => {
    const q = b.mesh.posisjoner;
    const ut = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 3) {
      const w = anvend(R, [q[i]!, q[i + 1]!, q[i + 2]!]);
      ut[i] = w[0] + t[0];
      ut[i + 1] = w[1] + t[1];
      ut[i + 2] = w[2] + t[2];
    }
    return {
      id: b.del.id,
      navn: b.del.navn,
      materialId: b.del.farge,
      mesh: { posisjoner: ut, indekser: b.mesh.indekser },
    };
  });

  const status = funn.some((f) => f.niva === 'feil')
    ? 'rod'
    : funn.some((f) => f.niva === 'advarsel')
      ? 'gul'
      : 'gronn';
  return {
    deler,
    advarsler: advarsler(funn.filter((f) => f.niva !== 'info')),
    funn,
    status,
    utskrift: { R, t },
    ledd: leddinfo,
    profil,
    toleranser: tol,
    revisjon: rev,
  };
}

/**
 * How far (degrees, in 5° steps) the child can turn about the axis in one
 * direction before it reaches into the parent, or the parent into the child.
 */
function fri(barn: Bygget, forelder: Bygget, punkt: V3, akse: V3, retning: 1 | -1, maal: number): number {
  const toler = 0.05;
  // each vertex's distance to the other part (by its field) and to the axis, once
  const forbered = (m: Mesh, annen: Felt) => {
    const q = m.posisjoner;
    const naer: { v: V3; rel: V3; grense: number }[] = [];
    for (let i = 0; i < q.length; i += 3) {
      const v: V3 = [q[i]!, q[i + 1]!, q[i + 2]!];
      const rel = minus(v, punkt);
      const langs = prikk(rel, akse);
      const rho = Math.hypot(rel[0] - akse[0] * langs, rel[1] - akse[1] * langs, rel[2] - akse[2] * langs);
      const d0 = annen(v[0], v[1], v[2]);
      // a point turned by an angle moves at most rho · angle, so it cannot reach the other part before this
      const grense = rho < 1e-6 ? Infinity : (d0 - toler) / rho;
      if (grense < (maal * Math.PI) / 180) naer.push({ v, rel, grense });
    }
    return naer;
  };
  const barnNaer = forbered(barn.mesh, forelder.felt),
    forelderNaer = forbered(forelder.mesh, barn.felt);
  const sjekk = (naer: { v: V3; rel: V3; grense: number }[], annen: Felt, grader: number): boolean => {
    const R = omAkse(akse, grader);
    const rad = (Math.abs(grader) * Math.PI) / 180;
    for (const n of naer) {
      if (n.grense > rad) continue;
      const w = pluss(punkt, anvend(R, n.rel));
      if (annen(w[0], w[1], w[2]) < -toler) return false;
    }
    return true;
  };
  let fri = 0;
  for (let g = SVINGSTEG; g <= maal; g += SVINGSTEG) {
    if (!sjekk(barnNaer, forelder.felt, retning * g) || !sjekk(forelderNaer, barn.felt, -retning * g)) break;
    fri = g;
  }
  return fri;
}
