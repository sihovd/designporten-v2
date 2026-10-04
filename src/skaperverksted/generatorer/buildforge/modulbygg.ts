/**
 * Build pipeline for the modular builder (see graf.ts and ledd.ts):
 *
 *  1. resolve the joint profile and place every part from the graph;
 *  2. per part, in its own frame: decoration → cut away from each connected
 *     joint (on the partner's side of the joint plane, within the space the
 *     partner can swing through) and out of every hole → mesh, plus the
 *     locked joint parts (pegs and sockets) as exact closed shells;
 *  3. check that every part is one piece with all its joint parts;
 *  4. place the parts and check that no two parts go into each other as
 *     they stand;
 *  5. note loose groups that are not connected to the Main Body.
 *
 * Pure and deterministic, like the clicker build.
 */
import { mm } from '../../core/enheter';
import { slaSammenMesh, type Mesh, type ModellDel } from '../../geometri/mesh';
import { dekorBoks, dekorFelt, formBoks, formFelt, formerI } from './felt';
import {
  anvend,
  finnKropp,
  forbindelserAv,
  komponenter,
  kropperAv,
  minus,
  plasser,
  transponer,
  type Plassering,
} from './graf';
import {
  finnLeddprofil,
  kroppsledd,
  leddmal,
  sjekkLeddprofil,
  transformerMesh,
  type Leddprofil,
  type Tilkobling,
} from './ledd';
import {
  indeksomrade,
  statusFra,
  stopp,
  tilAdvarsler,
  type BuildforgeResultat,
  type Funn,
  type Kroppsdata,
} from './funn';
import type { BuildforgeParametre, Form, Modulkropp, V3 } from './parametre';
import { lagRutenett, maal, marsjer, nodePosisjon, sample } from './rutenett';
import { boksSnitt, boksUnion, type Boks, type Felt } from './sdf';

const MAKS_NODER = 80_000;
const MIN_CELLE = 0.35;
/** Smallest cell in the overlap search (mm). */
const MINSTE_CELLE = 0.2;

interface Del {
  kropp: Modulkropp;
  /** Decoration after the joint cuts, plus the locked parts: the whole part's solid. */
  felt: Felt;
  boks: Boks;
  mesh: Mesh;
  data: Kroppsdata;
  funn: Funn[];
}

const bestemt = (navn: string) => `«${navn}»`;

function byggDel(kropp: Modulkropp, former: Form[], tilkoblet: Tilkobling[], profil: Leddprofil): Del {
  const egne = formerI(former, kropp.id);
  const kl = kroppsledd(tilkoblet, profil);
  const dekor = kl.kutt(dekorFelt(egne));
  const dBoks = dekorBoks(egne);
  let omrade: Boks | null = dBoks;
  for (const kj of kl.kjerner) omrade = boksUnion(omrade, kj.boks);
  const funn: Funn[] = [];
  const navn = bestemt(kropp.navn);
  if (!omrade) {
    funn.push({
      regel: 'BF-FIGUR-01',
      niva: 'feil',
      tittel: `${kropp.navn} har ingen former`,
      arsak: `${navn} har verken former eller ledd.`,
      konsekvens: 'Delen kan ikke printes.',
      forslag: 'Bytt ut delen eller slett den.',
      objekter: [],
      evidens: 'beregnet',
    });
    return {
      kropp,
      felt: () => Infinity,
      boks: { min: [0, 0, 0], maks: [0, 0, 0] },
      mesh: { posisjoner: new Float32Array(), indekser: new Uint32Array() },
      data: { kropp: kropp.id, volum: 0, tyngdepunkt: [0, 0, 0], celle: 0 },
      funn,
    };
  }
  const r = lagRutenett(omrade, MAKS_NODER, MIN_CELLE);
  const dekorR = sample(r, dekor);
  const kjerneR = kl.kjerner.map((kj) => sample(r, kj.felt).verdier);
  const samlet = new Float32Array(dekorR.verdier.length);
  for (let i = 0; i < samlet.length; i++) {
    let v = dekorR.verdier[i]!;
    for (const kv of kjerneR) v = Math.min(v, kv[i]!);
    samlet[i] = v;
  }
  const m = maal({ ...r, verdier: samlet });

  if (!egne.some((f) => f.operasjon !== 'trekk-fra'))
    funn.push({
      regel: 'BF-FIGUR-01',
      niva: 'feil',
      tittel: `${kropp.navn} har ingen former`,
      arsak: `Bare leddene er igjen av ${navn}.`,
      konsekvens: 'Delen ville bare vært plugger eller leddhull.',
      forslag: 'Bytt ut delen med en fra biblioteket, eller legg til former i den.',
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
      for (let kz = z0; kz <= z1; kz++)
        for (let j = y0; j <= y1; j++)
          for (let n = x0; n <= x1; n++) {
            const id = n + r.nx * (j + r.ny * kz);
            const p = nodePosisjon(r, id);
            if (ff(p[0], p[1], p[2]) >= 0) continue;
            noder.add(id);
            if (f.operasjon === 'trekk-fra' && kjerneR.some((kv) => kv[id]! < 0) && !iLaas.includes(f.id))
              iLaas.push(f.id);
          }
      inni.set(f.id, noder);
    }

    // one piece: every region holds a joint part (or is the only region), and all joint parts are in the same region
    const kjerneKomp = kl.kjerner.map(() => -1);
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
        tittel: `En bit henger ikke fast i ${kropp.navn.toLowerCase()}`,
        arsak: `Biten berører verken resten av ${navn} eller et ledd.`,
        konsekvens: 'Den ville falt av som en løs bit når den printes.',
        forslag: 'Flytt formen inntil resten, eller gjør den større så den overlapper.',
        objekter: egne
          .filter(
            (f) => f.operasjon !== 'trekk-fra' && [...(inni.get(f.id) ?? [])].some((id) => sett.has(id)),
          )
          .map((f) => f.id),
        evidens: 'beregnet',
      });
    });
    const losKjerner = new Set<string>();
    kl.kjerner.forEach((kj, j) => {
      if (kjerneKomp[j] !== hoved) losKjerner.add(kj.navn);
    });
    for (const n of losKjerner)
      funn.push({
        regel: 'BF-FESTE-02',
        niva: 'feil',
        tittel: `${n.charAt(0).toUpperCase()}${n.slice(1)} henger ikke fast i ${kropp.navn.toLowerCase()}`,
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
        tittel: 'Utsparingen når inn i et ledd',
        arsak: '«Trekk fra»-formen overlapper en plugg eller et leddhull.',
        konsekvens: 'Leddet beholdes uendret. Utsparingen virker bare på pynten.',
        forslag: 'Flytt utsparingen bort fra leddet hvis du ventet et hull der.',
        objekter: iLaas,
        evidens: 'beregnet',
      });
  }

  const dekorMesh = dBoks ? marsjer(dekorR) : null;
  const deler = kl.kjerner.map((kj) => kj.mesh);
  if (dekorMesh) deler.unshift(dekorMesh);
  const felt: Felt = (x, y, z) => {
    let v = dekor(x, y, z);
    for (const kj of kl.kjerner) v = Math.min(v, kj.felt(x, y, z));
    return v;
  };
  return {
    kropp,
    felt,
    boks: omrade,
    mesh: slaSammenMesh(deler),
    data: { kropp: kropp.id, volum: m.volum, tyngdepunkt: m.tyngdepunkt, celle: r.g },
    funn,
  };
}

/** World field and box of a placed part. Placements are orthonormal, so the field stays a distance bound. */
function iVerden(del: Del, pl: Plassering): { felt: Felt; boks: Boks } {
  const inv = transponer(pl.m);
  const t = pl.t;
  const felt: Felt = (x, y, z) => {
    const l = anvend(inv, [x - t[0], y - t[1], z - t[2]]);
    return del.felt(l[0], l[1], l[2]);
  };
  return { felt, boks: boksIVerden(del.boks, pl) };
}

function boksIVerden(b: Boks, pl: Plassering): Boks {
  const min: V3 = [Infinity, Infinity, Infinity];
  const maks: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [b.min[0], b.maks[0]])
    for (const y of [b.min[1], b.maks[1]])
      for (const z of [b.min[2], b.maks[2]]) {
        const v = anvend(pl.m, [x, y, z]);
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, v[i]! + pl.t[i]!);
          maks[i] = Math.max(maks[i]!, v[i]! + pl.t[i]!);
        }
      }
  return { min, maks };
}

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

/** Shapes of a part near a world point. */
function formerVed(former: Form[], kropp: string, pl: Plassering, p: V3): string[] {
  const l = anvend(transponer(pl.m), minus(p, pl.t));
  return formerI(former, kropp)
    .filter((f) => f.operasjon !== 'trekk-fra' && formFelt(f)(l[0], l[1], l[2]) < 1)
    .map((f) => f.id);
}

/** Largest distance of a part's shapes from a joint axis (point c, unit axis a), all in world coordinates. */
function rekkevidde(former: Form[], pl: Plassering, c: V3, a: V3): number {
  const b = dekorBoks(former);
  if (!b) return 0;
  let r = 0;
  for (const x of [b.min[0], b.maks[0]])
    for (const y of [b.min[1], b.maks[1]])
      for (const z of [b.min[2], b.maks[2]]) {
        const v = minus([...anvend(pl.m, [x, y, z])].map((w, i) => w + pl.t[i]!) as V3, c);
        const s = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
        r = Math.max(r, Math.sqrt(Math.max(0, v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - s * s)));
      }
  return r;
}

const profilfunn = (rev: string, regel: string, tittel: string, arsak: string, profil: Leddprofil | null) =>
  stopp(
    rev,
    [
      {
        regel,
        niva: 'feil',
        tittel,
        arsak,
        konsekvens: 'Uten en gyldig leddprofil finnes ikke leddene. Ingenting kan eksporteres.',
        forslag:
          regel === 'BF-PROFIL-01'
            ? 'Start på nytt fra «La oss bygge».'
            : 'Profilen må rettes av Designporten.',
        objekter: [],
        evidens: 'beregnet',
      },
    ],
    null,
    profil,
  );

export function byggModul(p: BuildforgeParametre, rev: string): BuildforgeResultat {
  const profil = finnLeddprofil(p.profil.id, p.profil.versjon);
  if (!profil)
    return profilfunn(
      rev,
      'BF-PROFIL-01',
      'Ukjent leddprofil',
      `Prosjektet bruker leddprofilen «${p.profil.id}» versjon ${p.profil.versjon}, som denne versjonen av BuildForge ikke kjenner.`,
      null,
    );
  const profilfeil = sjekkLeddprofil(profil);
  if (profilfeil.length)
    return profilfunn(rev, 'BF-PROFIL-02', 'Leddprofilen henger ikke sammen', profilfeil.join(' '), profil);

  const plass = plasser(p);
  const k = leddmal(profil);
  const tilkoblet = new Map<string, Tilkobling[]>();
  for (const f of forbindelserAv(p)) {
    for (const [egen, annen] of [
      [f.a, f.b],
      [f.b, f.a],
    ] as const) {
      const kb = finnKropp(p, egen.kropp)!.koblinger.find((x) => x.id === egen.kobling)!;
      const pl = plass.get(egen.kropp)!;
      const c: V3 = anvend(pl.m, kb.posisjon).map((v, i) => v + pl.t[i]!) as V3;
      const a = anvend(pl.m, kb.akse);
      const radius = Math.max(
        k.bossRadius,
        rekkevidde(formerI(p.former, annen.kropp), plass.get(annen.kropp)!, c, a),
      );
      tilkoblet.set(egen.kropp, [...(tilkoblet.get(egen.kropp) ?? []), { kobling: kb, radius }]);
    }
  }

  const kropper = kropperAv(p);
  const deler = new Map<string, Del>();
  for (const kr of kropper) deler.set(kr.id, byggDel(kr, p.former, tilkoblet.get(kr.id) ?? [], profil));
  const funn: Funn[] = kropper.flatMap((kr) => deler.get(kr.id)!.funn);

  // parts must not go into each other as they stand
  const plasserte = kropper.map((kr) => ({
    kr,
    pl: plass.get(kr.id)!,
    ...iVerden(deler.get(kr.id)!, plass.get(kr.id)!),
  }));
  for (let x = 0; x < plasserte.length; x++)
    for (let y = x + 1; y < plasserte.length; y++) {
      const a = plasserte[x]!,
        b = plasserte[y]!;
      const punkt = overlapp(a, b);
      if (!punkt) continue;
      funn.unshift({
        regel: 'BF-KOLL-01',
        niva: 'feil',
        tittel: `${a.kr.navn} og ${b.kr.navn.toLowerCase()} går inn i hverandre`,
        arsak: `Delene overlapper ved (${punkt.map((v) => mm(v, 0)).join(', ')}) slik de står nå.`,
        konsekvens: 'Delene kan ikke settes sammen slik de er tegnet.',
        forslag: 'Flytt, vri eller krymp det som møtes, eller bytt ut en av delene.',
        objekter: [
          ...new Set([
            ...formerVed(p.former, a.kr.id, a.pl, punkt),
            ...formerVed(p.former, b.kr.id, b.pl, punkt),
          ]),
        ],
        evidens: 'beregnet',
      });
    }

  // loose groups are printed too, but the user probably meant to connect them
  const lose = komponenter(p).filter((komp) => !komp.includes(p.rot!));
  if (lose.length) {
    const navn = lose.flat().map((id) => finnKropp(p, id)!.navn);
    funn.push({
      regel: 'BF-GRAF-01',
      niva: 'advarsel',
      tittel:
        navn.length === 1
          ? `${navn[0]} er ikke koblet til hovedkroppen`
          : `${navn.length} deler er ikke koblet til hovedkroppen`,
      arsak: `${navn.join(', ')} ligger løst ved siden av modellen.`,
      konsekvens: 'De eksporteres som egne deler, men henger ikke fast i figuren.',
      forslag: 'Dra dem til en ledig kobling på modellen, eller slett dem.',
      objekter: [],
      evidens: 'beregnet',
    });
  }

  const modelldeler: ModellDel[] = kropper.map((kr) => {
    const pl = plass.get(kr.id)!;
    return {
      id: kr.id,
      navn: kr.navn,
      materialId: kr.farge,
      mesh: transformerMesh(deler.get(kr.id)!.mesh, pl.m, pl.t),
    };
  });

  return {
    deler: modelldeler,
    advarsler: tilAdvarsler(funn),
    kontroll: {
      revisjon: rev,
      status: statusFra(funn),
      funn,
      profil: null,
      leddprofil: profil,
      sveip: null,
      kropper: kropper.map((kr) => deler.get(kr.id)!.data),
    },
  };
}
