import { describe, expect, it } from 'vitest';
import { avgrensning, sjekkManifold, volum } from '../../geometri/mesh';
import { finnDel, plasserDel } from './bibliotek';
import { byggBuildforge, type BuildforgeResultat } from './bygg';
import { festepunkter } from './feste';
import {
  dupliserKropp,
  erstatt,
  finnKropp,
  forbindelseTilForelder,
  koble,
  koblFra,
  koblingsvalg,
  komponenter,
  leggTilLos,
  leggTilOgKoble,
  plasser,
  settVri,
  slettKropp,
  speilKropp,
} from './graf';
import { buildforgeKjerne, nyttBuildforgeDokument } from './kjerne';
import { finnKroppsmal, grunnformer, lagKropp, modulprosjekt, starter } from './kroppsbibliotek';
import { FIGURLEDD_PROVE, leddmal, sjekkLeddprofil } from './ledd';
import { fraFigur, type FigurProsjekt } from './migrering';
import { tolkParametre, type BuildforgeParametre, type Form } from './parametre';

type Valg = FigurProsjekt['grunnmodeller'];

const standard: Valg = {
  hode: 'rund',
  kropp: 'rund',
  armer: 'tynne',
  hender: 'votter',
  bein: 'korte',
  fotter: 'stovler',
};

function figur(valg: Partial<Valg> = {}, former: FigurProsjekt['former'] = []): FigurProsjekt {
  const f = 'pla-cyan';
  return {
    skjema: 1,
    familie: 'figur',
    profil: { id: FIGURLEDD_PROVE.id, versjon: FIGURLEDD_PROVE.versjon },
    mal: 'venn',
    farger: { hode: f, kropp: f, armer: f, hender: f, bein: f, fotter: f },
    grunnmodeller: { ...standard, ...valg },
    former,
  };
}

/** A 0.2 figure converted, with every part's base shapes. */
function migrert(valg: Partial<Valg> = {}): BuildforgeParametre {
  const p = fraFigur(figur(valg))!;
  return { ...p, former: p.kropper!.flatMap((k) => grunnformer(finnKroppsmal(k.komponent!.id)!, k.id)) };
}

/** Attach library parts to a project one by one; returns the new part's id. */
function bygger(p0: BuildforgeParametre) {
  let p = p0;
  return {
    get p() {
      return p;
    },
    fest(malId: string, kropp: string, kobling: string, egen: string): string {
      const ny = lagKropp(finnKroppsmal(malId)!);
      const r = leggTilOgKoble(p, ny, egen, { kropp, kobling });
      if (!r.ok) throw new Error(r.grunn);
      p = r.p;
      return ny.kropp.id;
    },
  };
}

function drage() {
  const b = bygger(modulprosjekt('drage'));
  const rot = b.p.rot!;
  const hals = b.fest('hals-kort', rot, 'hals', 'bunn');
  b.fest('hode-drage', hals, 'topp', 'hals');
  const hale = b.fest('hale-ledd', rot, 'hale', 'front');
  b.fest('hale-spiss', hale, 'bak', 'front');
  b.fest('vinge', rot, 'vinge-v', 'rot');
  b.fest('vinge', rot, 'vinge-h', 'rot');
  for (const h of ['hofte-vf', 'hofte-hf', 'hofte-vb', 'hofte-hb']) {
    const bein = b.fest('bein-kort', rot, h, 'feste');
    b.fest('fot-rund', bein, 'ankel', 'feste');
  }
  return b.p;
}

const status = (p: BuildforgeParametre) => {
  const r = byggBuildforge(p);
  return {
    r,
    tekst: `${r.kontroll.status}: ${r.kontroll.funn.map((f) => `${f.regel} ${f.tittel}`).join(' | ')}`,
  };
};

describe('leddprofil', () => {
  it('er en prøveprofil som henger sammen', () => {
    expect(sjekkLeddprofil(FIGURLEDD_PROVE)).toEqual([]);
    expect(FIGURLEDD_PROVE.fysiskStatus).toBe('ikke-testet');
    const k = leddmal(FIGURLEDD_PROVE);
    expect(k.hullRadius - k.pluggRadius).toBeCloseTo(0.2, 6);
    expect(k.pluggEnde).toBeLessThan(k.hullBunn);
  });
});

describe('figurer fra 0.2', () => {
  it('leses som en modulmodell med ti deler, ni ledd og formene kopiert', () => {
    const form = {
      id: 'a1',
      navn: 'Pigg',
      kropp: 'armer' as const,
      type: 'kjegle' as const,
      posisjon: [8, 0, -10] as Form['posisjon'],
      rotasjon: [0, 0, 0] as Form['rotasjon'],
      mal: [6, 6, 8] as Form['mal'],
      avrunding: 0,
      operasjon: 'smelt' as const,
      smelting: 1,
      speilet: false,
    };
    const t = tolkParametre(figur({}, [form]));
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.p.familie).toBe('modul');
    expect(t.p.rot).toBe('kropp');
    expect(t.p.kropper).toHaveLength(10);
    expect(t.p.forbindelser).toHaveLength(9);
    expect(t.p.former.map((f) => `${f.id}@${f.kropp}`).sort()).toEqual(['a1-h@arm-hoyre', 'a1@arm-venstre']);
    expect(t.p.kropper!.filter((k) => k.speilet).map((k) => k.id)).toEqual([
      'arm-hoyre',
      'hand-hoyre',
      'bein-hoyre',
      'fot-hoyre',
    ]);
  });

  it('bygger grønt med lukkede deler som står på platen', { timeout: 60_000 }, () => {
    // every base model at least once
    const valg: Partial<Valg>[] = [
      {},
      { kropp: 'kloss', hode: 'kantet', armer: 'kraftige', hender: 'kloer', bein: 'lange', fotter: 'runde' },
      { kropp: 'paere', hode: 'hoy' },
    ];
    for (const v of valg) {
      const { r, tekst } = status(migrert(v));
      expect(r.kontroll.status, `${JSON.stringify(v)} ${tekst}`).toBe('gronn');
      expect(r.deler).toHaveLength(10);
      for (const d of r.deler) expect(sjekkManifold(d.mesh).lukket, d.id).toBe(true);
      expect(Math.min(...r.deler.map((d) => avgrensning(d.mesh).min[2]))).toBeCloseTo(0, 0);
      expect(r.kontroll.leddprofil?.id).toBe(FIGURLEDD_PROVE.id);
    }
  });

  it('høyre side er speilbildet av venstre', () => {
    const p = migrert();
    const pl = plasser(p);
    const v = pl.get('arm-venstre')!.t;
    const h = pl.get('arm-hoyre')!.t;
    expect(h[0]).toBeCloseTo(-v[0], 6);
    expect(h[1]).toBeCloseTo(v[1], 6);
    expect(h[2]).toBeCloseTo(v[2], 6);
    const r = byggBuildforge(p);
    const mv = r.deler.find((d) => d.id === 'arm-venstre')!.mesh;
    const mh = r.deler.find((d) => d.id === 'arm-hoyre')!.mesh;
    expect(avgrensning(mh).min[0]).toBeCloseTo(-avgrensning(mv).maks[0], 3);
    expect(volum(mh)).toBeCloseTo(volum(mv), 0);
  });
});

describe('modulbyggeren', () => {
  it('hver start gir nøyaktig én del, og den bygger grønt', () => {
    for (const s of starter) {
      const p = modulprosjekt(s.id);
      expect(p.kropper, s.id).toHaveLength(1);
      expect(p.rot).toBe(p.kropper![0]!.id);
      const { r, tekst } = status(p);
      expect(r.kontroll.status, `${s.id} ${tekst}`).toBe('gronn');
    }
  });

  it('en ny modell starter uten valgt start, så «La oss bygge» åpnes', () => {
    const dok = nyttBuildforgeDokument();
    expect(dok.parametre).toMatchObject({ familie: 'modul', mal: 'ny' });
    expect(nyttBuildforgeDokument('knapp').parametre.familie).toBeUndefined();
  });

  it('en hel drage bygger grønt, med høyre vinge og høyre bein speilet', { timeout: 30_000 }, () => {
    const p = drage();
    const { r, tekst } = status(p);
    expect(r.kontroll.status, tekst).toBe('gronn');
    expect(r.deler).toHaveLength(15);
    for (const d of r.deler) expect(sjekkManifold(d.mesh).lukket, d.navn).toBe(true);
    const vinger = p.kropper!.filter((k) => k.komponent?.id === 'vinge');
    expect(vinger.map((k) => k.speilet).sort()).toEqual([false, true]);
    const pl = plasser(p);
    const [a, b] = vinger.map((k) => pl.get(k.id)!.t);
    expect(a![0]).toBeCloseTo(-b![0], 6);
  });

  it('kobler bare hann mot hunn, og hver kobling bare én gang', () => {
    const b = bygger(modulprosjekt('menneske'));
    const rot = b.p.rot!;
    // a male connector against a male connector
    const blank = lagKropp(finnKroppsmal('kropp-blank')!);
    expect(leggTilOgKoble(b.p, blank, 'topp', { kropp: rot, kobling: 'hals' }).ok).toBe(false);
    b.fest('hode-rund', rot, 'hals', 'hals');
    const hode2 = lagKropp(finnKroppsmal('hode-rund')!);
    expect(leggTilOgKoble(b.p, hode2, 'hals', { kropp: rot, kobling: 'hals' }).ok).toBe(false);
  });

  it('kobler en løs del og kobler den fra igjen; løse deler gir gult', () => {
    const p0 = modulprosjekt('menneske');
    const arm = lagKropp(finnKroppsmal('arm-tynn')!);
    const p1 = leggTilLos(p0, arm, [60, 0, 0]);
    expect(komponenter(p1)).toHaveLength(2);
    const s1 = status(p1);
    expect(
      s1.r.kontroll.funn.some((f) => f.regel === 'BF-GRAF-01'),
      s1.tekst,
    ).toBe(true);
    expect(s1.r.kontroll.status).toBe('gul');

    const r = koble(
      p1,
      { kropp: arm.kropp.id, kobling: 'skulder' },
      { kropp: p0.rot!, kobling: 'skulder-v' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(komponenter(r.p)).toHaveLength(1);
    // the same group cannot be connected to itself
    expect(
      koble(r.p, { kropp: arm.kropp.id, kobling: 'handledd' }, { kropp: p0.rot!, kobling: 'hals' }).ok,
    ).toBe(false);
    const f = forbindelseTilForelder(r.p, arm.kropp.id)!;
    const fra = koblFra(r.p, f.id);
    expect(fra.ok).toBe(true);
    if (!fra.ok) return;
    expect(komponenter(fra.p)).toHaveLength(2);
    // the part stays where it was
    expect(plasser(fra.p).get(arm.kropp.id)!.t[0]).toBeCloseTo(plasser(r.p).get(arm.kropp.id)!.t[0], 6);
  });

  it('bytter ut en del: passende deler følger med, resten blir løse, egne former blir', () => {
    const b = bygger(migrert());
    // a shape the user added to the head
    const egen: Form = {
      ...grunnformer(finnKroppsmal('hode-rund')!, 'hode')[0]!,
      id: 'egen',
      komponent: undefined,
    };
    const p = {
      ...b.p,
      former: [
        ...b.p.former,
        { ...egen, posisjon: [0, -8, 10] as Form['posisjon'], mal: [6, 6, 6] as Form['mal'] },
      ],
    };
    const hode = erstatt(p, 'hode', finnKroppsmal('hode-drage')!);
    expect(hode.ok).toBe(true);
    if (!hode.ok) return;
    expect(hode.frakoblet).toBe(0);
    expect(hode.p.former.find((f) => f.id === 'egen')?.kropp).toBe(hode.ny);
    expect(hode.p.former.some((f) => f.kropp === 'hode')).toBe(false);

    // a tail segment has one male connector: the head keeps it, arms and legs come loose and stay put
    const kropp = erstatt(p, 'kropp', finnKroppsmal('hale-ledd')!);
    expect(kropp.ok).toBe(true);
    if (!kropp.ok) return;
    expect(kropp.p.rot).toBe(kropp.ny);
    expect(kropp.frakoblet).toBe(4);
    expect(forbindelseTilForelder(kropp.p, 'hode')).toBeDefined();
    expect(tolkParametre(kropp.p).ok).toBe(true);
    const for_ = plasser(p).get('hand-venstre')!.t;
    const etter = plasser(kropp.p).get('hand-venstre')!.t;
    expect(etter[0]).toBeCloseTo(for_[0], 6);
    expect(etter[1]).toBeCloseTo(for_[1], 6);
  });

  it('sletter en del, men aldri hovedkroppen; delene bak den blir løse', () => {
    const p = migrert();
    expect(slettKropp(p, 'kropp').ok).toBe(false);
    const r = slettKropp(p, 'arm-venstre');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(finnKropp(r.p, 'arm-venstre')).toBeUndefined();
    expect(r.p.former.some((f) => f.kropp === 'arm-venstre')).toBe(false);
    expect(komponenter(r.p).some((g) => g.length === 1 && g[0] === 'hand-venstre')).toBe(true);
  });

  it('speiler en del med alt som henger på den', () => {
    const p = migrert();
    const r = speilKropp(p, 'arm-venstre');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(finnKropp(r.p, 'arm-venstre')!.speilet).toBe(true);
    expect(finnKropp(r.p, 'hand-venstre')!.speilet).toBe(true);
    expect(tolkParametre(r.p).ok).toBe(true);
  });

  it('dupliserer en del som en løs kopi og vrir et ledd innenfor ±180°', () => {
    const p = migrert();
    const d = dupliserKropp(p, 'hode')!;
    expect(komponenter(d.p)).toHaveLength(2);
    expect(d.p.former.filter((f) => f.kropp === d.ny)).toHaveLength(
      p.former.filter((f) => f.kropp === 'hode').length,
    );
    const v = settVri(p, 'c-hode', 270);
    expect(v.forbindelser!.find((f) => f.id === 'c-hode')!.vri).toBe(-90);
  });

  it('avviser ugyldige grafer', () => {
    const p = migrert();
    const kopi = () => structuredClone(p);
    const a = kopi();
    a.forbindelser!.push({ ...a.forbindelser![0]!, id: 'dobbel' });
    expect(tolkParametre(a).ok, 'samme kobling to ganger').toBe(false);
    const b = kopi();
    b.former[0] = { ...b.former[0]!, kropp: 'finnes-ikke' };
    expect(tolkParametre(b).ok, 'form på ukjent del').toBe(false);
    const c = kopi();
    c.rot = 'finnes-ikke';
    expect(tolkParametre(c).ok, 'ukjent hovedkropp').toBe(false);
    const d = kopi();
    d.forbindelser![0] = { ...d.forbindelser![0]!, b: { kropp: 'arm-venstre', kobling: 'handledd' } };
    expect(tolkParametre(d).ok, 'hann mot hann').toBe(false);
  });

  it('deler som står i hverandre blir røde', () => {
    const p0 = modulprosjekt('skapning');
    const p = leggTilLos(p0, lagKropp(finnKroppsmal('kropp-rund')!), [4, 0, 0]);
    const { r, tekst } = status(p);
    expect(
      r.kontroll.funn.some((f) => f.regel === 'BF-KOLL-01'),
      tekst,
    ).toBe(true);
    expect(r.kontroll.status).toBe('rod');
  });

  it('en løs form og en ukjent leddprofil blir røde', () => {
    const p = migrert();
    p.former.push({
      ...p.former.find((f) => f.kropp === 'hode')!,
      id: 'los',
      posisjon: [0, 0, 70],
      mal: [5, 5, 5],
    });
    expect(byggBuildforge(p).kontroll.funn.find((f) => f.regel === 'BF-FESTE-01')?.objekter).toContain('los');
    expect(
      byggBuildforge({ ...migrert(), profil: { id: FIGURLEDD_PROVE.id, versjon: '9' } }).kontroll.funn[0]!
        .regel,
    ).toBe('BF-PROFIL-01');
  });

  it('festepunkter inne i en del gir former i delens egen ramme', () => {
    const p = migrert();
    const punkter = festepunkter(p, 'hode');
    expect(punkter.every((f) => f.kropp === 'hode')).toBe(true);
    const topp = punkter.find((f) => f.retning === 'midt')!;
    const horn = plasserDel(finnDel('horn')!, topp);
    expect(horn[0]!.kropp).toBe('hode');
    // the head's frame starts at the neck
    expect(horn[0]!.posisjon[2]).toBeGreaterThan(15);
    const { r, tekst } = status({ ...p, former: [...p.former, ...horn] });
    expect(r.kontroll.status, tekst).toBe('gronn');
  });

  it('foreslår koblinger uten dra, med samme rolle først', () => {
    const p = modulprosjekt('menneske');
    const valg = koblingsvalg(p, finnKroppsmal('arm-tynn')!.koblinger);
    expect(valg.map((v) => v.mal.kobling)).toEqual(['hals', 'skulder-v', 'skulder-h', 'hofte-v', 'hofte-h']);
    expect(valg.every((v) => v.egne[0] === 'skulder')).toBe(true);
    expect(koblingsvalg(p, finnKroppsmal('kropp-blank')!.koblinger)).toEqual([]);
  });

  it('grønn modell gir én STL per del og en rapport med leddprofilen', async () => {
    const dok = nyttBuildforgeDokument();
    dok.parametre = { ...migrert() };
    const m = (await buildforgeKjerne.byggModell(dok)) as BuildforgeResultat;
    const r = buildforgeKjerne.eksport!(dok, m);
    expect(r.sperret).toBeUndefined();
    expect(r.stlPerDel).toBe(true);
    expect(r.merknad).toMatch(/Leddene er ikke fysisk testet/);
    const rapport = JSON.parse(r.vedlegg!.innhold);
    expect(rapport.familie).toBe('modul');
    expect(rapport.leddprofil).toMatchObject({ id: FIGURLEDD_PROVE.id, fysiskStatus: 'Ikke testet' });
    expect(rapport.deler).toHaveLength(10);
  });
});
