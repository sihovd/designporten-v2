/**
 * Build pipeline for figures (see figur.ts):
 *
 *  1. resolve the joint profile and the skeleton from the base models;
 *  2. per segment, in its own frame: decoration → cut to its side of every
 *     joint and out of the hole → mesh, plus the locked joint parts (pegs and
 *     the socket) as exact closed shells;
 *  3. check that every segment is one piece with all its joint parts;
 *  4. place the segments, mirror the pairs, and check that no two parts go
 *     into each other in the standing pose.
 *
 * Pure and deterministic, like the clicker build.
 */
import { mm } from '../../core/enheter';
import { slaSammenMesh, type Mesh, type ModellDel } from '../../geometri/mesh';
import { dekorBoks, dekorFelt, formBoks, formFelt, formerI } from './felt';
import {
  finnLeddprofil,
  flyttMesh,
  lagSkjelett,
  segmentledd,
  sjekkLeddprofil,
  speilMesh,
  type Instans,
  type Leddprofil,
  type Skjelett,
} from './figur';
import {
  indeksomrade,
  statusFra,
  stopp,
  tilAdvarsler,
  type BuildforgeResultat,
  type Funn,
  type Kroppsdata,
} from './funn';
import {
  figurKropper,
  kroppBestemt,
  type BuildforgeParametre,
  type FigurKropp,
  type Form,
} from './parametre';
import { lagRutenett, maal, marsjer, nodePosisjon, sample } from './rutenett';
import { boksSnitt, boksUnion, type Boks, type Felt, type V3 } from './sdf';

const MAKS_NODER = 80_000;
const MIN_CELLE = 0.35;
/** Smallest cell in the overlap search (mm). */
const MINSTE_CELLE = 0.2;

interface Segment {
  kropp: FigurKropp;
  /** Decoration after the joint cuts, plus the locked parts: the whole segment's solid. */
  felt: Felt;
  /** Bounding box of the segment in its own frame. */
  boks: Boks;
  mesh: Mesh;
  data: Kroppsdata;
  funn: Funn[];
}

const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function byggSegment(kropp: FigurKropp, former: Form[], s: Skjelett, profil: Leddprofil): Segment {
  const egne = formerI(former, kropp);
  const sl = segmentledd(kropp, s, profil);
  const dekor = sl.kutt(dekorFelt(egne));
  const dBoks = dekorBoks(egne);
  let omrade: Boks | null = dBoks;
  for (const k of sl.kjerner) omrade = boksUnion(omrade, k.boks);
  const r = lagRutenett(omrade!, MAKS_NODER, MIN_CELLE);
  const dekorR = sample(r, dekor);
  const kjerneR = sl.kjerner.map((k) => sample(r, k.felt).verdier);
  const samlet = new Float32Array(dekorR.verdier.length);
  for (let i = 0; i < samlet.length; i++) {
    let v = dekorR.verdier[i]!;
    for (const kv of kjerneR) v = Math.min(v, kv[i]!);
    samlet[i] = v;
  }
  const m = maal({ ...r, verdier: samlet });
  const funn: Funn[] = [];
  const navn = kroppBestemt[kropp];

  if (!egne.some((f) => f.operasjon !== 'trekk-fra'))
    funn.push({
      regel: 'BF-FIGUR-01',
      niva: 'feil',
      tittel: `${stor(navn)} har ingen former`,
      arsak: `Bare leddet er igjen av ${navn}.`,
      konsekvens: 'Delen ville bare vært en plugg eller et leddhull.',
      forslag: 'Velg en grunnmodell for delen igjen.',
      objekter: [],
      evidens: 'beregnet',
    });
  else {
    // which shapes are where, and whether a subtraction reaches a joint
    const inni = new Map<string, Set<number>>();
    const iLaas: string[] = [];
    for (const f of egne) {
      const ff = formFelt(f);
      const [x0, x1, y0, y1, z0, z1] = indeksomrade(r, formBoks(f));
      const noder = new Set<number>();
      for (let k = z0; k <= z1; k++)
        for (let j = y0; j <= y1; j++)
          for (let n = x0; n <= x1; n++) {
            const id = n + r.nx * (j + r.ny * k);
            const p = nodePosisjon(r, id);
            if (ff(p[0], p[1], p[2]) >= 0) continue;
            noder.add(id);
            if (f.operasjon === 'trekk-fra' && kjerneR.some((kv) => kv[id]! < 0) && !iLaas.includes(f.id))
              iLaas.push(f.id);
          }
      inni.set(f.id, noder);
    }

    // one piece: every region holds a joint part, and all joint parts are in the same region
    const kjerneKomp = sl.kjerner.map(() => -1);
    const kompKjerner = m.komponenter.map(() => 0);
    m.komponenter.forEach((komp, ki) => {
      for (const id of komp)
        kjerneR.forEach((kv, j) => {
          if (kv[id]! < 0 && kjerneKomp[j] === -1) {
            kjerneKomp[j] = ki;
            kompKjerner[ki]!++;
          }
        });
    });
    let hoved = -1;
    m.komponenter.forEach((komp, ki) => {
      if (
        hoved < 0 ||
        kompKjerner[ki]! > kompKjerner[hoved]! ||
        (kompKjerner[ki] === kompKjerner[hoved] && komp.length > m.komponenter[hoved]!.length)
      )
        hoved = ki;
    });
    m.komponenter.forEach((komp, ki) => {
      if (ki === hoved || kompKjerner[ki]! > 0) return;
      const sett = new Set(komp);
      funn.push({
        regel: 'BF-FESTE-01',
        niva: 'feil',
        tittel: `En del henger ikke fast i ${navn}`,
        arsak: `Delen berører verken resten av ${navn} eller leddet.`,
        konsekvens: 'Den ville falt av som en løs bit når den printes.',
        forslag: 'Flytt delen inntil resten, eller gjør den større så den overlapper.',
        objekter: egne
          .filter(
            (f) => f.operasjon !== 'trekk-fra' && [...(inni.get(f.id) ?? [])].some((id) => sett.has(id)),
          )
          .map((f) => f.id),
        evidens: 'beregnet',
      });
    });
    const losKjerner = new Set<string>();
    sl.kjerner.forEach((k, j) => {
      if (kjerneKomp[j] !== hoved) losKjerner.add(k.navn);
    });
    for (const n of losKjerner)
      funn.push({
        regel: 'BF-FESTE-02',
        niva: 'feil',
        tittel: `${n} henger ikke fast i ${navn}`,
        arsak: `Formene i ${navn} når ikke fram til leddet.`,
        konsekvens: 'Leddet ville falt av, og delene kan ikke settes sammen.',
        forslag: 'Flytt eller forstørr formene så de dekker leddet.',
        objekter: egne.filter((f) => f.operasjon !== 'trekk-fra').map((f) => f.id),
        evidens: 'beregnet',
      });
    if (iLaas.length)
      funn.push({
        regel: 'BF-LAAS-01',
        niva: 'advarsel',
        tittel: 'Utsparingen når inn i leddet',
        arsak: '«Trekk fra»-formen overlapper en plugg eller et leddhull.',
        konsekvens: 'Leddet beholdes uendret. Utsparingen virker bare på pynten.',
        forslag: 'Flytt utsparingen bort fra leddet hvis du ventet et hull der.',
        objekter: iLaas,
        evidens: 'beregnet',
      });
  }

  const dekorMesh = dBoks ? marsjer(dekorR) : null;
  const deler = sl.kjerner.map((k) => k.mesh);
  if (dekorMesh) deler.unshift(dekorMesh);
  const felt: Felt = (x, y, z) => {
    let v = dekor(x, y, z);
    for (const k of sl.kjerner) v = Math.min(v, k.felt(x, y, z));
    return v;
  };
  return {
    kropp,
    felt,
    boks: omrade!,
    mesh: slaSammenMesh(deler),
    data: { kropp, volum: m.volum, tyngdepunkt: m.tyngdepunkt, celle: r.g },
    funn,
  };
}

/** World field and box of a placed segment. */
function plassert(seg: Segment, inst: Instans): { felt: Felt; boks: Boks } {
  const o = inst.origo;
  if (!inst.speilet)
    return {
      felt: (x, y, z) => seg.felt(x - o[0], y - o[1], z - o[2]),
      boks: {
        min: [seg.boks.min[0] + o[0], seg.boks.min[1] + o[1], seg.boks.min[2] + o[2]],
        maks: [seg.boks.maks[0] + o[0], seg.boks.maks[1] + o[1], seg.boks.maks[2] + o[2]],
      },
    };
  // mirrored: o is already mirrored, so the frame's x runs the other way
  return {
    felt: (x, y, z) => seg.felt(o[0] - x, y - o[1], z - o[2]),
    boks: {
      min: [o[0] - seg.boks.maks[0], seg.boks.min[1] + o[1], seg.boks.min[2] + o[2]],
      maks: [o[0] - seg.boks.min[0], seg.boks.maks[1] + o[1], seg.boks.maks[2] + o[2]],
    },
  };
}

const speilId = (id: string) =>
  id.endsWith('-venstre') ? id.replace(/-venstre$/, '-hoyre') : id.replace(/-hoyre$/, '-venstre');

/**
 * A point where two placed parts are both solid. Octree search: the fields
 * are 1-Lipschitz, so a cell whose centre is farther from either part than
 * the cell's half-diagonal cannot hold an overlap and is skipped. Overlaps
 * thinner than the smallest cell (0.2 mm) are not looked for.
 */
function overlapp(a: { felt: Felt; boks: Boks }, b: { felt: Felt; boks: Boks }): V3 | null {
  const snitt = boksSnitt(a.boks, b.boks);
  if (!snitt) return null;
  const sok = (x: number, y: number, z: number, h: number): V3 | null => {
    const r = h * Math.sqrt(3);
    const va = a.felt(x, y, z);
    if (va > r) return null;
    const vb = b.felt(x, y, z);
    if (vb > r) return null;
    if (va < 0 && vb < 0) return [x, y, z];
    if (h < MINSTE_CELLE / 2) return null;
    const q = h / 2;
    for (const dz of [-q, q])
      for (const dy of [-q, q])
        for (const dx of [-q, q]) {
          const t = sok(x + dx, y + dy, z + dz, q);
          if (t) return t;
        }
    return null;
  };
  const side = 4;
  for (let z = snitt.min[2]; z < snitt.maks[2]; z += side)
    for (let y = snitt.min[1]; y < snitt.maks[1]; y += side)
      for (let x = snitt.min[0]; x < snitt.maks[0]; x += side) {
        const t = sok(x + side / 2, y + side / 2, z + side / 2, side / 2);
        if (t) return t;
      }
  return null;
}

/** Shapes of a segment near a world point. */
function formerVed(former: Form[], inst: Instans, p: V3): string[] {
  const o = inst.origo;
  const l: V3 = inst.speilet
    ? [o[0] - p[0], p[1] - o[1], p[2] - o[2]]
    : [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  return formerI(former, inst.kropp)
    .filter((f) => f.operasjon !== 'trekk-fra' && formFelt(f)(l[0], l[1], l[2]) < 1)
    .map((f) => f.id);
}

export function byggFigur(p: BuildforgeParametre, rev: string): BuildforgeResultat {
  const profil = finnLeddprofil(p.profil.id, p.profil.versjon);
  if (!profil)
    return stopp(
      rev,
      [
        {
          regel: 'BF-PROFIL-01',
          niva: 'feil',
          tittel: 'Ukjent leddprofil',
          arsak: `Prosjektet bruker leddprofilen «${p.profil.id}» versjon ${p.profil.versjon}, som denne versjonen av BuildForge ikke kjenner.`,
          konsekvens: 'Uten profilen finnes ikke leddene. Ingenting kan eksporteres.',
          forslag: 'Start en ny figur fra en mal.',
          objekter: [],
          evidens: 'beregnet',
        },
      ],
      null,
    );
  const profilfeil = sjekkLeddprofil(profil);
  if (profilfeil.length)
    return stopp(
      rev,
      [
        {
          regel: 'BF-PROFIL-02',
          niva: 'feil',
          tittel: 'Leddprofilen henger ikke sammen',
          arsak: profilfeil.join(' '),
          konsekvens: 'Ingenting kan eksporteres med denne profilen.',
          forslag: 'Profilen må rettes av Designporten.',
          objekter: [],
          evidens: 'beregnet',
        },
      ],
      null,
      profil,
    );
  const s = lagSkjelett(p.grunnmodeller ?? {});
  if (!s)
    return stopp(
      rev,
      [
        {
          regel: 'BF-DATA-01',
          niva: 'feil',
          tittel: 'Prosjektet har en ukjent grunnmodell',
          arsak: 'En av grunnmodellene for figuren finnes ikke i denne versjonen av BuildForge.',
          konsekvens:
            'Uten grunnmodellene vet ikke BuildForge hvor leddene sitter. Ingenting kan eksporteres.',
          forslag: 'Start en ny figur fra en mal.',
          objekter: [],
          evidens: 'beregnet',
        },
      ],
      null,
      profil,
    );

  const segmenter = new Map<FigurKropp, Segment>();
  for (const k of figurKropper) segmenter.set(k, byggSegment(k, p.former, s, profil));
  const funn: Funn[] = figurKropper.flatMap((k) => segmenter.get(k)!.funn);

  // parts in the standing pose must not go into each other; mirror-image pairs are checked once
  const plasserte = s.instanser.map((i) => ({ i, ...plassert(segmenter.get(i.kropp)!, i) }));
  const sett = new Set<string>();
  const nokkel = (a: string, b: string) => [a, b].sort().join('|');
  for (let x = 0; x < plasserte.length; x++)
    for (let y = x + 1; y < plasserte.length; y++) {
      const a = plasserte[x]!,
        b = plasserte[y]!;
      const n = nokkel(a.i.id, b.i.id);
      if (sett.has(n)) continue;
      sett.add(n);
      sett.add(nokkel(speilId(a.i.id), speilId(b.i.id)));
      const punkt = overlapp(a, b);
      if (!punkt) continue;
      funn.unshift({
        regel: 'BF-KOLL-01',
        niva: 'feil',
        tittel: `${a.i.navn} og ${b.i.navn.toLowerCase()} går inn i hverandre`,
        arsak: `Delene overlapper ved (${punkt.map((v) => mm(v, 0)).join(', ')}) når figuren står rett opp.`,
        konsekvens: 'Delene kan ikke settes sammen slik de er tegnet.',
        forslag: 'Flytt eller krymp formene som møtes, eller velg en annen grunnmodell.',
        objekter: [...new Set([...formerVed(p.former, a.i, punkt), ...formerVed(p.former, b.i, punkt)])],
        evidens: 'beregnet',
      });
    }

  const deler: ModellDel[] = s.instanser.map((i) => {
    const seg = segmenter.get(i.kropp)!;
    const mesh = i.speilet
      ? speilMesh(flyttMesh(seg.mesh, [-i.origo[0], i.origo[1], i.origo[2]]))
      : flyttMesh(seg.mesh, i.origo);
    return { id: i.id, navn: i.navn, materialId: p.farger[i.kropp]!, mesh };
  });

  return {
    deler,
    advarsler: tilAdvarsler(funn),
    kontroll: {
      revisjon: rev,
      status: statusFra(funn),
      funn,
      profil: null,
      leddprofil: profil,
      sveip: null,
      kropper: figurKropper.map((k) => segmenter.get(k)!.data),
    },
  };
}
