/**
 * BuildForge build pipeline (handoff §7.2 and §10, «Beregningspipeline»):
 *
 *  1. validate the stored project and resolve the exact profile version;
 *  2. build the locked mechanics from the profile;
 *  3. per body: decoration field → cut back from the protected zones →
 *     mesh, plus the locked part as its own exact closed shell;
 *  4. check anchoring, the top's size and balance, and collision through
 *     the whole travel on the final fields;
 *  5. report every finding with rule, objects, cause, consequence, fix and
 *     evidence, tied to the project revision.
 *
 * Pure and deterministic. The switch reference is never part of the parts.
 */
import { slaSammenMesh, type Mesh, type ModellDel } from '../../geometri/mesh';
import { mm, tall } from '../../core/enheter';
import { beskyttetDekor, dekorBoks, dekorFelt, formBoks, formFelt, formerI } from './felt';
import { byggMekanikk, type Mekanikk } from './mekanikk';
import {
  familieFor,
  kroppnavn,
  revisjon,
  tolkParametre,
  type BuildforgeParametre,
  type Form,
  type Kropp,
} from './parametre';
import { finnProfil, sjekkProfil } from './profil';
import { lagRutenett, maal, marsjer, nodePosisjon, sample } from './rutenett';
import { boksUnion, type Boks, type Felt } from './sdf';
import { sjekkSveip, type Sveipresultat } from './sveip';
import { byggFigur } from './figurbygg';
import {
  indeksomrade,
  statusFra,
  stopp,
  tilAdvarsler,
  type BuildforgeResultat,
  type Digitalstatus,
  type Funn,
  type Kroppsdata,
} from './funn';

export * from './funn';

const MAKS_NODER = 160_000;
const MIN_CELLE = 0.3;

interface Kroppbygg {
  dekorMesh: Mesh | null;
  data: Kroppsdata;
  /** Decoration after protection. */
  felt: Felt;
  boks: Boks | null;
  funn: Funn[];
}

function byggKropp(kropp: Kropp, former: Form[], mek: Mekanikk): Kroppbygg {
  const egne = formerI(former, kropp);
  const sperre = kropp === 'topp' ? mek.sperreTopp : mek.sperreUnderdel;
  const kjerne = kropp === 'topp' ? mek.toppFelt : mek.underdelFelt;
  const kjerneBoks = kropp === 'topp' ? mek.toppBoks : mek.underdelBoks;
  const felt = beskyttetDekor(dekorFelt(egne), sperre, kropp);
  const boks = dekorBoks(egne);
  const funn: Funn[] = [];
  const omrade = boksUnion(boks, kjerneBoks)!;
  const r = lagRutenett(omrade, MAKS_NODER, MIN_CELLE);
  const dekor = sample(r, felt);
  const kjerneVerdier = sample(r, kjerne).verdier;
  const samlet = new Float32Array(dekor.verdier.length);
  for (let i = 0; i < samlet.length; i++) samlet[i] = Math.min(dekor.verdier[i]!, kjerneVerdier[i]!);
  const m = maal({ ...r, verdier: samlet });

  // Per-shape facts on the grid: where each shape is, whether it was cut.
  const inni = new Map<string, Set<number>>();
  const kuttet: string[] = [];
  const iLaas: string[] = [];
  for (const f of egne) {
    const ff = formFelt(f);
    const [x0, x1, y0, y1, z0, z1] = indeksomrade(r, formBoks(f));
    const noder = new Set<number>();
    let erKuttet = false,
      erILaas = false;
    for (let k = z0; k <= z1; k++)
      for (let j = y0; j <= y1; j++)
        for (let n = x0; n <= x1; n++) {
          const id = n + r.nx * (j + r.ny * k);
          const p = nodePosisjon(r, id);
          if (ff(p[0], p[1], p[2]) >= 0) continue;
          noder.add(id);
          if (f.operasjon === 'trekk-fra') {
            if (kjerneVerdier[id]! < 0) erILaas = true;
          } else if (sperre(p[0], p[1], p[2]) < 0 || (kropp === 'underdel' && p[2] < 0)) erKuttet = true;
        }
    inni.set(f.id, noder);
    if (erKuttet) kuttet.push(f.id);
    if (erILaas) iLaas.push(f.id);
  }

  // Anchoring: every inside region must reach the locked part.
  for (const komp of m.komponenter) {
    if (komp.some((id) => kjerneVerdier[id]! < 0)) continue;
    const sett = new Set(komp);
    const objekter = egne
      .filter((f) => f.operasjon !== 'trekk-fra' && [...(inni.get(f.id) ?? [])].some((id) => sett.has(id)))
      .map((f) => f.id);
    funn.push({
      regel: 'BF-FESTE-01',
      niva: 'feil',
      tittel: `En del henger ikke fast i ${kroppnavn[kropp].toLowerCase()}en`,
      arsak: 'Delen berører verken resten av kroppen eller det låste festet.',
      konsekvens: 'Den ville falt av som en løs bit når den printes.',
      forslag: 'Flytt delen inntil kroppen, eller gjør den større så den overlapper.',
      objekter,
      evidens: 'beregnet',
    });
  }
  if (kuttet.length)
    funn.push({
      regel: 'BF-SONE-01',
      niva: 'info',
      tittel: kropp === 'topp' ? 'Formen er kuttet over bryteren' : 'Formen er kuttet rundt bryteren',
      arsak:
        kropp === 'topp'
          ? 'Under toppens grunnplate trenger bryteren og klikket fri plass.'
          : 'Bryteren må kunne settes inn, og underdelen må stå flatt på platen.',
      konsekvens: 'Den delen av formen er tatt bort i modellen og i filen.',
      forslag: 'Ingenting å gjøre. Flytt formen hvis du vil se hele den.',
      objekter: kuttet,
      evidens: 'beregnet',
    });
  if (iLaas.length)
    funn.push({
      regel: 'BF-LAAS-01',
      niva: 'advarsel',
      tittel: 'Utsparingen når inn i det låste festet',
      arsak: 'En «trekk fra»-form overlapper festet for bryteren.',
      konsekvens: 'Festet beholdes uendret. Utsparingen virker bare på pynten.',
      forslag: 'Flytt utsparingen bort fra festet hvis du ventet et hull der.',
      objekter: iLaas,
      evidens: 'beregnet',
    });

  return {
    dekorMesh: boks ? marsjer(dekor) : null,
    data: { kropp, volum: m.volum, tyngdepunkt: m.tyngdepunkt, celle: r.g },
    felt,
    boks,
    funn,
  };
}

function sveipFunn(s: Sveipresultat, former: Form[], mek: Mekanikk): Funn | null {
  const v = mek.mal.vandring;
  const klaring = mek.mal.klaring;
  // which shapes are near the worst point (moving shapes at the travel offset)
  const naer = (): string[] => {
    if (!s.punkt) return [];
    const [x, y, z] = s.punkt;
    const sv = s.vedVandring ?? 0;
    return former
      .filter((f) => f.operasjon !== 'trekk-fra')
      .filter((f) => {
        const d = f.kropp === 'topp' ? formFelt(f)(x, y, z + sv) : formFelt(f)(x, y, z);
        return d < klaring + s.feilgrense + 0.5;
      })
      .map((f) => f.id);
  };
  if (s.status === 'fri') return null;
  if (s.status === 'usikker')
    return {
      regel: 'BF-KLIKK-02',
      niva: 'advarsel',
      tittel: 'Klaringen er for knapp til å avgjøre',
      arsak: `Toppen kommer svært nær underdelen eller bryteren et sted i klikket. Kontrollen kan ikke skille avstanden fra kravet på ${mm(klaring)} innen sin nøyaktighet (${mm(s.feilgrense, 2)}).`,
      konsekvens: 'Klikket kan stoppe eller skrape.',
      forslag: 'Gi delene litt mer avstand.',
      objekter: naer(),
      evidens: 'beregnet',
    };
  const ved = s.vedVandring ?? 0;
  const hvor =
    ved < 0.05 ? 'allerede i hvile' : ved > v - 0.05 ? 'helt nede' : `etter ${mm(ved)} av ${mm(v)} vandring`;
  return {
    regel: 'BF-KLIKK-01',
    niva: 'feil',
    tittel:
      s.status === 'kollisjon'
        ? `Toppen treffer underdelen ${hvor}`
        : `Toppen kommer for nær underdelen ${hvor}`,
    arsak:
      s.status === 'kollisjon'
        ? 'Når toppen trykkes ned, går den inn i underdelen, pynten der eller bryteren.'
        : `Toppen og den faste delen kommer nærmere hverandre enn ${mm(klaring)}.`,
    konsekvens: 'Klikket stopper før bryteren er trykket helt ned, eller delene binder seg sammen.',
    forslag: 'Flytt eller krymp den markerte formen, eller gi den mer avstand nedover.',
    objekter: naer(),
    evidens: 'beregnet',
  };
}

export function byggBuildforge(raw: unknown): BuildforgeResultat {
  const rev = revisjon(raw);
  const t = tolkParametre(raw);
  if (!t.ok)
    return stopp(
      rev,
      [
        {
          regel: 'BF-DATA-01',
          niva: 'feil',
          tittel: 'Prosjektet har ugyldige data',
          arsak: t.feil.join(' '),
          konsekvens: 'Modellen bygges ikke, og ingenting kan eksporteres.',
          forslag: 'Åpne en fersk kopi av prosjektfilen, eller start et nytt prosjekt.',
          objekter: [],
          evidens: 'beregnet',
        },
      ],
      null,
    );
  const p: BuildforgeParametre = t.p;
  if (familieFor(p) === 'figur') return byggFigur(p, rev);
  const profil = finnProfil(p.profil.id, p.profil.versjon);
  if (!profil)
    return stopp(
      rev,
      [
        {
          regel: 'BF-PROFIL-01',
          niva: 'feil',
          tittel: 'Ukjent mekanikkprofil',
          arsak: `Prosjektet bruker profilen «${p.profil.id}» versjon ${p.profil.versjon}, som denne versjonen av BuildForge ikke kjenner.`,
          konsekvens: 'Uten profilen finnes ikke festet for bryteren. Ingenting kan eksporteres.',
          forslag: 'Start et nytt prosjekt med en kjent profil.',
          objekter: [],
          evidens: 'beregnet',
        },
      ],
      null,
    );
  const profilfeil = sjekkProfil(profil);
  if (profilfeil.length)
    return stopp(
      rev,
      [
        {
          regel: 'BF-PROFIL-02',
          niva: 'feil',
          tittel: 'Mekanikkprofilen henger ikke sammen',
          arsak: profilfeil.join(' '),
          konsekvens: 'Ingenting kan eksporteres med denne profilen.',
          forslag: 'Profilen må rettes av Designporten.',
          objekter: [],
          evidens: 'beregnet',
        },
      ],
      profil,
    );

  const mek = byggMekanikk(profil);
  const topp = byggKropp('topp', p.former, mek);
  const underdel = byggKropp('underdel', p.former, mek);
  const funn: Funn[] = [...topp.funn, ...underdel.funn];

  // Collision through the travel. The locked parts against each other are
  // proven by the profile check (coaxial boxes, exact), so the numeric check
  // covers decoration: the top's decoration against everything fixed, and
  // the top's locked part against the base's decoration.
  const k = mek.mal;
  const par = [];
  const fast: Felt = (x, y, z) =>
    Math.min(mek.underdelFelt(x, y, z), underdel.felt(x, y, z), mek.husFelt(x, y, z));
  const fastBoks = boksUnion(boksUnion(mek.underdelBoks, underdel.boks), mek.husBoks)!;
  if (topp.boks)
    par.push({ statisk: fast, statiskBoks: fastBoks, bevegelig: topp.felt, bevegeligBoks: topp.boks });
  if (underdel.boks)
    par.push({
      statisk: underdel.felt,
      statiskBoks: underdel.boks,
      bevegelig: mek.toppFelt,
      bevegeligBoks: mek.toppBoks,
    });
  const sveip = par.length ? sjekkSveip(par, k.vandring, k.klaring) : null;
  const sf = sveip ? sveipFunn(sveip, p.former, mek) : null;
  if (sf) funn.unshift(sf);

  // The top: size and balance against the trial limits (return is not tested).
  const g = profil.grenser;
  const td = topp.data;
  const toppTopp = Math.max(k.toppPlateTopp, topp.boks?.maks[2] ?? 0);
  const hoyde = toppTopp - k.toppPlateBunn;
  const skjevhet = Math.hypot(td.tyngdepunkt[0], td.tyngdepunkt[1]);
  const toppIder = formerI(p.former, 'topp').map((f) => f.id);
  if (td.volum > g.toppVolum.verdi)
    funn.push({
      regel: 'BF-TOPP-01',
      niva: 'advarsel',
      tittel: 'Toppen er tung for bryteren',
      arsak: `Toppen er omtrent ${tall(td.volum / 1000)} cm³ massivt. Prøvegrensen er ${tall(g.toppVolum.verdi / 1000)} cm³.`,
      konsekvens: 'En tung topp kan gjøre at klikket ikke fjærer helt tilbake. Det er ikke testet.',
      forslag: 'Gjør toppen mindre, eller bruk «trekk fra» for å hule den ut.',
      objekter: toppIder,
      evidens: 'estimert',
    });
  if (hoyde > g.toppHoyde.verdi)
    funn.push({
      regel: 'BF-TOPP-02',
      niva: 'advarsel',
      tittel: 'Toppen er høy',
      arsak: `Toppen er ${mm(hoyde, 0)} høy over grunnplaten. Prøvegrensen er ${mm(g.toppHoyde.verdi, 0)}.`,
      konsekvens: 'En høy topp gir mer sidebelastning på bryteren og kan vippe.',
      forslag: 'Senk eller krymp den øverste formen.',
      objekter: toppIder,
      evidens: 'estimert',
    });
  if (skjevhet > g.skjevhet.verdi)
    funn.push({
      regel: 'BF-TOPP-03',
      niva: 'advarsel',
      tittel: 'Toppen er skjev',
      arsak: `Tyngdepunktet ligger ${mm(skjevhet)} til siden for bryteren. Prøvegrensen er ${mm(g.skjevhet.verdi)}.`,
      konsekvens: 'Klikket kan gå skjevt og slite på bryteren.',
      forslag: 'Flytt formene mot midten, eller slå på speiling.',
      objekter: toppIder,
      evidens: 'estimert',
    });

  const deler: ModellDel[] = [
    {
      id: 'underdel',
      navn: 'Underdel',
      materialId: p.farger.underdel!,
      mesh: underdel.dekorMesh ? slaSammenMesh([mek.underdelMesh, underdel.dekorMesh]) : mek.underdelMesh,
    },
    {
      id: 'topp',
      navn: 'Topp',
      materialId: p.farger.topp!,
      mesh: topp.dekorMesh ? slaSammenMesh([mek.toppMesh, topp.dekorMesh]) : mek.toppMesh,
    },
  ];

  const status: Digitalstatus = statusFra(funn);
  return {
    deler,
    advarsler: tilAdvarsler(funn),
    kontroll: { revisjon: rev, status, funn, profil, sveip, kropper: [underdel.data, topp.data] },
  };
}
