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
import { boksFor, feltFor } from './grunnformer';
import { antallBiter, fjernSmuler, meshboks, naerhet, tetthet, tilBoks, tynnesteVegg } from './kontroll';
import { kuppelBoks, kuppelFelt } from './kuppel';
import {
  finnProfil,
  mekanisme,
  toleranser,
  type Leddprofil,
  type Mekanismeform,
  type Toleranser,
} from './ledd';
import { lagRutenett, marsjer } from './marsj';
import { valider, type CfParametre, type Ledd } from './parametre';
import { leddFra, leddTil, plasser, type Leddramme, type Plassering } from './plassering';
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
import {
  anvend,
  ENHET,
  gange,
  kolonne,
  minus,
  omAkse,
  pluss,
  prikk,
  transponer,
  vinkel,
  type M3,
  type V3,
} from './vektor';

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

/** A part built in its own frame (cached: moving the figure or another part does not rebuild it). */
interface Delbygg {
  felt: Felt;
  mesh: Mesh;
  /** Specks left by the mesher and removed. */
  smuler: number;
  tett: { lukket: boolean; aapneKanter: number; feilKanter: number };
  biter: number;
}

/** A joint's measurements between its two built parts (cached by both parts and where they sit). */
interface Leddmaal {
  naerhet: { minste: number; inni: number };
  sving: { pluss: number; minus: number };
  vegg: ({ tykkelse: number; antall: number } | null)[];
}

const delLager = new Map<string, Delbygg>();
const leddLager = new Map<string, Leddmaal>();
const LAGER_MAKS = 64;

function husk<T>(lager: Map<string, T>, nokkel: string, lag: () => T): T {
  const finnes = lager.get(nokkel);
  if (finnes) {
    // most recently used last
    lager.delete(nokkel);
    lager.set(nokkel, finnes);
    return finnes;
  }
  const ny = lag();
  lager.set(nokkel, ny);
  while (lager.size > LAGER_MAKS) lager.delete(lager.keys().next().value!);
  return ny;
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
const rundM = (m: M3) => m.map(r6);

/** A frame expressed in another: (Rᵀ · Rj, Rᵀ · (pj − t)). */
function relativ(pl: Plassering, R: M3, punkt: V3): { R: M3; t: V3 } {
  const inv = transponer(pl.R);
  return { R: gange(inv, R), t: anvend(inv, minus(punkt, pl.t)) };
}

/** Mesh vertices from one frame into another (p' = R · p + t). */
function flyttMesh(m: Mesh, R: M3, t: V3): Mesh {
  const q = m.posisjoner;
  const ut = new Float32Array(q.length);
  for (let i = 0; i < q.length; i += 3) {
    const w = anvend(R, [q[i]!, q[i + 1]!, q[i + 2]!]);
    ut[i] = w[0] + t[0];
    ut[i + 1] = w[1] + t[1];
    ut[i + 2] = w[2] + t[2];
  }
  return { posisjoner: ut, indekser: m.indekser };
}

interface Leddform {
  ledd: Ledd;
  ramme: Leddramme;
  form: Mekanismeform;
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
  const felles = JSON.stringify([profil.id, profil.versjon, tol.klaring, tol.spillerom]);

  const leddformer = new Map<string, Leddform>();
  for (const l of p.ledd) {
    const ramme = oppsett.ledd.get(l.id);
    if (ramme)
      leddformer.set(l.id, { ledd: l, ramme, form: mekanisme(l.mekanisme, profil, tol, l.storrelse ?? 1) });
  }

  // each part in its own frame: the base shape, its joints' domes, rooms and mechanism parts
  const delnokkel = new Map<string, string>();
  const bygg = new Map<string, Delbygg>();
  p.deler.forEach((d, i) => {
    const pl = oppsett.deler.get(d.id);
    if (!pl) return;
    const ledd = [
      ...leddFra(p, d.id).map((l) => ({ l, rolle: 'forelder' as const })),
      ...(leddTil(p, d.id) ? [{ l: leddTil(p, d.id)!, rolle: 'barn' as const }] : []),
    ]
      .map(({ l, rolle }) => {
        const lf = leddformer.get(l.id);
        return lf && { lf, rolle, rel: relativ(pl, lf.ramme.R, lf.ramme.punkt) };
      })
      .filter((x) => !!x);
    const nokkel = JSON.stringify([
      felles,
      d.type,
      d.variant ?? '',
      d.lengde,
      d.tykkelse,
      ledd
        .map((x) => [
          x.rolle,
          x.lf.ledd.mekanisme,
          x.lf.ledd.storrelse ?? 1,
          x.lf.ledd.kuppel,
          rundM(x.rel.R),
          x.rel.t.map(r6),
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]);
    delnokkel.set(d.id, nokkel);
    bygg.set(
      d.id,
      husk(delLager, nokkel, () => {
        const grunnBoks = boksFor(d);
        const kupler: Felt[] = [],
          rom: Felt[] = [],
          egne: Felt[] = [];
        let boks: Boks = grunnBoks;
        for (const { lf, rolle, rel } of ledd) {
          const mekBoks = boksIRamme(lf.form.boks, rel.R, rel.t);
          const plassert = (f: Felt, b: Boks) => avgrenset(iRamme(f, rel.R, rel.t), b);
          kupler.push(
            plassert(kuppelFelt(lf.ledd.kuppel), boksIRamme(kuppelBoks(lf.ledd.kuppel), rel.R, rel.t)),
          );
          rom.push(plassert(rolle === 'forelder' ? lf.form.romForelder : lf.form.romBarn, mekBoks));
          egne.push(plassert(rolle === 'forelder' ? lf.form.forelderPluss : lf.form.barnPluss, mekBoks));
          boks = boksUnion(boks, mekBoks)!;
        }
        const grunn = avgrenset(feltFor(d), utvid(grunnBoks, 1));
        const felt = union(differanse(differanse(grunn, union(...kupler)), union(...rom)), ...egne);
        const { mesh, fjernet } = fjernSmuler(
          marsjer(lagRutenett(utvid(boks, 1), CELLE, MAKS_NODER), felt),
          SMULE,
        );
        return {
          felt,
          mesh,
          smuler: fjernet,
          tett: mesh.indekser.length ? tetthet(mesh) : { lukket: true, aapneKanter: 0, feilKanter: 0 },
          biter: mesh.indekser.length ? antallBiter(mesh) : 0,
        };
      }),
    );
    fremdrift?.(((i + 1) / p.deler.length) * 0.7);
  });

  // the parts themselves
  for (const d of p.deler) {
    const b = bygg.get(d.id);
    if (!b) continue;
    if (!b.mesh.indekser.length) {
      funn.push({
        regel: 'CF-DEL-03',
        niva: 'feil',
        tittel: `${d.navn} er tom`,
        tekst: 'Kuppelen og leddene har skåret bort hele delen. Gjør kuppelen mindre eller delen større.',
        delId: d.id,
      });
      continue;
    }
    if (!b.tett.lukket)
      funn.push({
        regel: 'CF-DEL-01',
        niva: 'feil',
        tittel: `${d.navn} er ikke tett`,
        tekst: `Overflaten har ${b.tett.aapneKanter} åpne og ${b.tett.feilKanter} feil kanter, så den kan ikke printes slik.`,
        delId: d.id,
      });
    if (b.smuler)
      funn.push({
        regel: 'CF-DEL-04',
        niva: 'info',
        tittel: `${d.navn}: ${b.smuler} ${b.smuler === 1 ? 'smule' : 'smuler'} fjernet`,
        tekst: `Meshingen la igjen ${b.smuler === 1 ? 'en bit' : 'biter'} mindre enn ${SMULE} mm der to snitt nesten møtes. ${b.smuler === 1 ? 'Den er' : 'De er'} tatt bort, for de er for små til å printes.`,
        delId: d.id,
      });
    if (b.biter > 1)
      funn.push({
        regel: 'CF-DEL-02',
        niva: 'feil',
        tittel: `${d.navn} er delt i ${b.biter} biter`,
        tekst:
          'Kuppelen eller leddet skjærer delen i flere løse biter. Juster kuppelens tykkelse eller diameter, eller leddets avstand.',
        delId: d.id,
      });
  }

  const navnPa = (id: string) => p.deler.find((d) => d.id === id)?.navn ?? 'delen';
  const leddinfo: Leddinfo[] = [];
  p.ledd.forEach((l, i) => {
    const lf = leddformer.get(l.id);
    if (!lf) return;
    const { ramme, form } = lf;
    const navn = `${navnPa(l.forelder.del)} og ${navnPa(l.barn.del)}`;
    // capture
    if (form.fangst < profil.maal.minFang.verdi)
      funn.push({
        regel: 'CF-FANG-01',
        niva: 'feil',
        tittel: `Leddet mellom ${navn} holder ikke`,
        tekst: `${form.fangstTekst} med bare ${mmTekst(form.fangst)} (minst ${mmTekst(profil.maal.minFang.verdi)}). Delene kan falle fra hverandre. Mindre klaring eller spillerom hjelper.`,
        leddId: l.id,
      });
    // upright in the print pose
    const skjevhet = vinkel(kolonne(ramme.R, 2), [0, -1, 0]);
    if (skjevhet > 15)
      funn.push({
        regel: 'CF-PRINT-01',
        niva: 'advarsel',
        tittel: `Leddet mellom ${navn} står skrått i printposisjonen`,
        tekst: `Mekanismen er dreid ${Math.round(skjevhet)}° bort fra rett opp når figuren ligger på ryggen. Da kan den trenge støtte. Overheng kontrolleres ikke ennå.`,
        leddId: l.id,
      });
    const sving = { pluss: 0, minus: 0, maal: profil.maal.sving.verdi };
    const akse = anvend(ramme.R, form.svingakse.akse);
    const punkt = pluss(ramme.punkt, anvend(ramme.R, form.svingakse.punkt));
    const fb = bygg.get(l.forelder.del),
      bb = bygg.get(l.barn.del);
    const pf = oppsett.deler.get(l.forelder.del),
      pb = oppsett.deler.get(l.barn.del);
    if (fb?.mesh.indekser.length && bb?.mesh.indekser.length && pf && pb) {
      // measured in the parent's frame, so it only depends on the two parts and how they sit together
      const barnIF = relativ(pf, pb.R, pb.t);
      const leddIF = relativ(pf, ramme.R, ramme.punkt);
      const leddIB = relativ(pb, ramme.R, ramme.punkt);
      const nokkel = JSON.stringify([
        delnokkel.get(l.forelder.del),
        delnokkel.get(l.barn.del),
        rundM(barnIF.R),
        barnIF.t.map(r6),
        l.mekanisme,
        l.storrelse ?? 1,
        l.kuppel.diameter,
      ]);
      const maal = husk(leddLager, nokkel, () => {
        const barnMesh = flyttMesh(bb.mesh, barnIF.R, barnIF.t);
        const barnFelt = iRamme(bb.felt, barnIF.R, barnIF.t);
        const n = naerhet(fb.mesh, fb.felt, barnMesh, barnFelt, tol.klaring + 1);
        const aksePF = anvend(leddIF.R, form.svingakse.akse);
        const punktPF = pluss(leddIF.t, anvend(leddIF.R, form.svingakse.punkt));
        const radius = l.kuppel.diameter / 2 + 2;
        const vegg = [
          tynnesteVegg(fb.mesh, fb.felt, leddIF.t, radius, profil.maal.minVegg.verdi),
          tynnesteVegg(bb.mesh, bb.felt, leddIB.t, radius, profil.maal.minVegg.verdi),
        ].map((t) => t && { tykkelse: t.tykkelse, antall: t.antall });
        return {
          naerhet: { minste: n.minste, inni: n.inni },
          sving: fri(barnMesh, barnFelt, fb.mesh, fb.felt, punktPF, aksePF, sving.maal),
          vegg,
        };
      });
      const n = maal.naerhet;
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
      sving.pluss = maal.sving.pluss;
      sving.minus = maal.sving.minus;
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
      [l.forelder.del, l.barn.del].forEach((id, k) => {
        const t = maal.vegg[k];
        if (t)
          funn.push({
            regel: 'CF-VEGG-01',
            niva: 'advarsel',
            tittel: `Tynt materiale i ${navnPa(id)} ved leddet`,
            tekst: `Ned mot ${mmTekst(t.tykkelse)} på ${t.antall} steder (varsles under ${mmTekst(profil.maal.minVegg.verdi)}, en prøveverdi). Tynne kanter kan brekke.`,
            delId: id,
            leddId: l.id,
          });
      });
    }
    leddinfo.push({ id: l.id, ramme, svingakse: { punkt, akse }, sving, fangst: form.fangst });
    fremdrift?.(0.7 + ((i + 1) / Math.max(1, p.ledd.length)) * 0.3);
  });

  funn.push({
    regel: 'CF-INFO-01',
    niva: 'info',
    tittel: 'Ikke fysisk testet',
    tekst: `${profil.navn} ${profil.versjon} er ikke testprintet. Overheng og støtte for kroppsformene kontrolleres ikke ennå.`,
  });

  // print pose: each part from its own frame straight into lying on the back, then centred on the plate
  const R = UTSKRIFT_R;
  const iUtskrift = p.deler
    .map((d) => {
      const b = bygg.get(d.id),
        pl = oppsett.deler.get(d.id);
      return b && pl ? { d, mesh: flyttMesh(b.mesh, gange(R, pl.R), anvend(R, pl.t)) } : null;
    })
    .filter((x) => !!x);
  let minZ = Infinity,
    x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const { mesh } of iUtskrift) {
    const q = mesh.posisjoner;
    for (let i = 0; i < q.length; i += 3) {
      x0 = Math.min(x0, q[i]!);
      x1 = Math.max(x1, q[i]!);
      y0 = Math.min(y0, q[i + 1]!);
      y1 = Math.max(y1, q[i + 1]!);
      minZ = Math.min(minZ, q[i + 2]!);
    }
  }
  const t: V3 = Number.isFinite(minZ) ? [-(x0 + x1) / 2, -(y0 + y1) / 2, -minZ] : [0, 0, 0];
  const deler: ModellDel[] = iUtskrift.map(({ d, mesh }) => ({
    id: d.id,
    navn: d.navn,
    materialId: d.farge,
    // own buffers: the cached meshes stay intact when the result is handed over from the worker
    mesh: { posisjoner: flyttMesh(mesh, ENHET, t).posisjoner, indekser: new Uint32Array(mesh.indekser) },
  }));

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
 * How far (degrees, in 5° steps) the child can turn about the axis each way before it reaches into the
 * parent, or the parent into the child.
 */
function fri(
  barnMesh: Mesh,
  barnFelt: Felt,
  forelderMesh: Mesh,
  forelderFelt: Felt,
  punkt: V3,
  akse: V3,
  maal: number,
): { pluss: number; minus: number } {
  const toler = 0.05;
  const maks = (maal * Math.PI) / 180;
  // each vertex that could reach the other part within the angle: a point turned by an angle moves at
  // most rho · angle, so one further than that from the other part's box (or field) cannot
  const forbered = (m: Mesh, annen: Felt, annenMesh: Mesh) => {
    const q = m.posisjoner;
    const boks = meshboks(annenMesh);
    const naer: { rel: V3; grense: number }[] = [];
    for (let i = 0; i < q.length; i += 3) {
      const v: V3 = [q[i]!, q[i + 1]!, q[i + 2]!];
      const rel = minus(v, punkt);
      const langs = prikk(rel, akse);
      const rho = Math.hypot(rel[0] - akse[0] * langs, rel[1] - akse[1] * langs, rel[2] - akse[2] * langs);
      if (rho < 1e-6 || tilBoks(v[0], v[1], v[2], boks) > rho * maks + toler) continue;
      const grense = (annen(v[0], v[1], v[2]) - toler) / rho;
      if (grense < maks) naer.push({ rel, grense });
    }
    return naer;
  };
  const barnNaer = forbered(barnMesh, forelderFelt, forelderMesh),
    forelderNaer = forbered(forelderMesh, barnFelt, barnMesh);
  const sjekk = (naer: { rel: V3; grense: number }[], annen: Felt, grader: number): boolean => {
    const R = omAkse(akse, grader);
    const rad = (Math.abs(grader) * Math.PI) / 180;
    for (const n of naer) {
      if (n.grense > rad) continue;
      const w = pluss(punkt, anvend(R, n.rel));
      if (annen(w[0], w[1], w[2]) < -toler) return false;
    }
    return true;
  };
  const retning = (r: 1 | -1) => {
    let fri = 0;
    for (let g = SVINGSTEG; g <= maal; g += SVINGSTEG) {
      if (!sjekk(barnNaer, forelderFelt, r * g) || !sjekk(forelderNaer, barnFelt, -r * g)) break;
      fri = g;
    }
    return fri;
  };
  return { pluss: retning(1), minus: retning(-1) };
}
