import { describe, expect, it } from 'vitest';
import { avgrensning, sjekkManifold, volum } from '../../geometri/mesh';
import { byggBuildforge, type BuildforgeResultat } from './bygg';
import { buildforgeKjerne, nyttBuildforgeDokument } from './kjerne';
import { lagRapport } from './rapport';
import {
  alleFestepunkter,
  bibliotek,
  festepunkterFor,
  finnDel,
  finnStartmal,
  passer,
  plasserDel,
  startmaler,
} from './bibliotek';
import { festepunkter } from './feste';
import { beskyttetDekor, dekorFelt, formFelt } from './felt';
import { byggMekanikk } from './mekanikk';
import { revisjon, tolkParametre, type BuildforgeParametre, type Form } from './parametre';
import { MX_PROVE, mekanikkmal, sjekkProfil } from './profil';
import { lagRutenett, marsjer, sample } from './rutenett';
import { boksMellom, kjegle, kule } from './sdf';
import { FIGURLEDD_PROVE, grunnmodeller, lagSkjelett, leddmal, sjekkLeddprofil } from './figur';
import { figurKropper, type FigurKropp } from './parametre';
import { sjekkSveip } from './sveip';

const knapp = () => startmaler[0]!.parametre();

function form(over: Partial<Form>): Form {
  return {
    id: over.id ?? 'x',
    navn: 'Test',
    kropp: 'topp',
    type: 'kule',
    posisjon: [0, 0, 28],
    rotasjon: [0, 0, 0],
    mal: [10, 10, 10],
    avrunding: 0,
    operasjon: 'smelt',
    smelting: 2,
    speilet: false,
    ...over,
  };
}

function med(...former: Form[]): BuildforgeParametre {
  return { ...knapp(), former };
}

describe('mekanikkprofil', () => {
  it('prøveprofilen henger sammen', () => {
    expect(sjekkProfil(MX_PROVE)).toEqual([]);
    expect(MX_PROVE.fysiskStatus).toBe('ikke-testet');
  });

  it('avviser en profil der toppen treffer bryterhuset før vandringen er ferdig', () => {
    const p = structuredClone(MX_PROVE);
    p.topp.korsDybde.verdi = 3.6;
    expect(sjekkProfil(p).join(' ')).toMatch(/treffer bryterhuset/);
  });

  it('festet er eksakt og lukket, ikke voxlet', () => {
    const m = byggMekanikk(MX_PROVE);
    const k = mekanikkmal(MX_PROVE);
    expect(sjekkManifold(m.underdelMesh).lukket).toBe(true);
    expect(sjekkManifold(m.toppMesh).lukket).toBe(true);
    const b = avgrensning(m.underdelMesh);
    expect(b.maks[2]).toBeCloseTo(k.plateTopp, 5);
    expect(b.maks[0] - b.min[0]).toBeCloseTo(24, 5);
    // the plate cutout corners are exactly 14 mm apart
    const p = m.underdelMesh.posisjoner;
    let funnet = false;
    for (let i = 0; i < p.length; i += 3)
      if (
        Math.abs(p[i]! - 7) < 1e-5 &&
        Math.abs(p[i + 1]! - 7) < 1e-5 &&
        Math.abs(p[i + 2]! - k.plateTopp) < 1e-5
      )
        funnet = true;
    expect(funnet).toBe(true);
    // solid volume: block minus cavity minus cutout
    expect(volum(m.underdelMesh)).toBeGreaterThan(0);
  });
});

describe('felt og meshing', () => {
  it('en kule meshes lukket og med riktig volum', () => {
    const r = sample(lagRutenett({ min: [-10, -10, -10], maks: [10, 10, 10] }, 80_000, 0.3), kule(10));
    const m = marsjer(r);
    expect(sjekkManifold(m).lukket).toBe(true);
    const fasit = (4 / 3) * Math.PI * 1000;
    expect(Math.abs(volum(m) - fasit) / fasit).toBeLessThan(0.03);
  });

  it('speiling er en relasjon: feltet er symmetrisk om YZ-planet', () => {
    const f = formFelt(form({ posisjon: [6, 2, 28], speilet: true, type: 'boks', mal: [4, 6, 3] }));
    expect(f(6, 2, 28)).toBeCloseTo(f(-6, 2, 28), 9);
    expect(f(-6, 2, 28)).toBeLessThan(0);
  });

  it('pynt kan aldri fylle bryterhulrommet eller gå under platen', () => {
    const m = byggMekanikk(MX_PROVE);
    const stor = form({ kropp: 'underdel', posisjon: [0, 0, 5], mal: [40, 40, 40] });
    const f = beskyttetDekor(dekorFelt([stor]), m.sperreUnderdel, 'underdel');
    expect(f(0, 0, 5)).toBeGreaterThan(0);
    expect(f(15, 0, -1)).toBeGreaterThan(0);
    const r = byggBuildforge(med(stor));
    const ud = r.deler.find((d) => d.id === 'underdel')!;
    const p = ud.mesh.posisjoner;
    for (let i = 0; i < p.length; i += 3) {
      const inne =
        Math.abs(p[i]!) < 6.9 && Math.abs(p[i + 1]!) < 6.9 && p[i + 2]! > 0.01 && p[i + 2]! < 10.99;
      expect(inne).toBe(false);
      expect(p[i + 2]!).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});

describe('kollisjon gjennom vandringen', () => {
  const tynnPlate = boksMellom([-5, -5, 10], [5, 5, 11]);
  const plateBoks = {
    min: [-5, -5, 10] as [number, number, number],
    maks: [5, 5, 11] as [number, number, number],
  };

  it('finner en kollisjon som bare skjer midt i vandringen', () => {
    // a small ball 0.5 mm above a thin plate passes all the way through it with 4 mm travel
    const ball = (x: number, y: number, z: number) => Math.hypot(x, y, z - 12.5) - 1;
    const r = sjekkSveip(
      [
        {
          statisk: tynnPlate,
          statiskBoks: plateBoks,
          bevegelig: ball,
          bevegeligBoks: { min: [-1, -1, 11.5], maks: [1, 1, 13.5] },
        },
      ],
      4,
      0.2,
    );
    expect(r.status).toBe('kollisjon');
    expect(r.vedVandring!).toBeGreaterThan(0.2);
    expect(r.vedVandring!).toBeLessThan(3.9);
  });

  it('godkjenner når avstanden er større enn vandringen pluss klaring', () => {
    const ball = (x: number, y: number, z: number) => Math.hypot(x, y, z - 17) - 1;
    const r = sjekkSveip(
      [
        {
          statisk: tynnPlate,
          statiskBoks: plateBoks,
          bevegelig: ball,
          bevegeligBoks: { min: [-1, -1, 16], maks: [1, 1, 18] },
        },
      ],
      4,
      0.4,
    );
    expect(r.status).toBe('fri');
    expect(r.margin!).toBeGreaterThan(0);
  });

  it('melder for liten klaring selv uten berøring', () => {
    // bottom of the ball ends 0.2 mm above the plate; clearance demands 0.4
    const ball = (x: number, y: number, z: number) => Math.hypot(x, y, z - 16.2) - 1;
    const r = sjekkSveip(
      [
        {
          statisk: tynnPlate,
          statiskBoks: plateBoks,
          bevegelig: ball,
          bevegeligBoks: { min: [-1, -1, 15.2], maks: [1, 1, 17.2] },
        },
      ],
      4,
      0.4,
      90_000,
      6,
    );
    expect(['for-naer', 'usikker']).toContain(r.status);
    expect(r.status).not.toBe('fri');
  });
});

describe('BuildForge-modellen', () => {
  it('startmalene bygger grønt med lukkede deler og uten bryteren i filene', () => {
    for (const m of startmaler.filter((x) => x.familie === 'klikker')) {
      const r = byggBuildforge(m.parametre());
      expect(r.kontroll.status, m.id).toBe('gronn');
      expect(r.deler.map((d) => d.id)).toEqual(['underdel', 'topp']);
      for (const d of r.deler) expect(sjekkManifold(d.mesh).lukket, `${m.id} ${d.id}`).toBe(true);
    }
  });

  it('en løs form blir rød og pekes ut', () => {
    const r = byggBuildforge(
      med(...knapp().former, form({ id: 'los', posisjon: [0, 0, 60], mal: [6, 6, 6] })),
    );
    const f = r.kontroll.funn.find((x) => x.regel === 'BF-FESTE-01');
    expect(f?.niva).toBe('feil');
    expect(f?.objekter).toContain('los');
    expect(r.kontroll.status).toBe('rod');
  });

  it('pynt som henger ned og treffer underdelen i klikket blir rød', () => {
    // a leg on the top at the side of the base, ending 2 mm above the base's top: hit after ~2 mm travel
    const ben = form({ id: 'ben', type: 'boks', posisjon: [14, 0, 18], mal: [6, 6, 10], avrunding: 1 });
    const fot = form({
      id: 'hylle',
      kropp: 'underdel',
      type: 'boks',
      posisjon: [14, 0, 6],
      mal: [8, 8, 12],
      avrunding: 1,
    });
    const r = byggBuildforge(
      med(
        ...knapp().former,
        form({ id: 'arm', type: 'boks', posisjon: [12, 0, 24.5], mal: [8, 6, 3], smelting: 1 }),
        ben,
        fot,
      ),
    );
    const f = r.kontroll.funn.find((x) => x.regel === 'BF-KLIKK-01');
    expect(f, JSON.stringify(r.kontroll.funn)).toBeDefined();
    expect(f!.objekter).toEqual(expect.arrayContaining(['ben', 'hylle']));
    expect(r.kontroll.sveip!.vedVandring!).toBeGreaterThan(0.5);
  });

  it('en manipulert prosjektfil kan ikke endre mekanikken', () => {
    const ukjent = byggBuildforge({ ...knapp(), profil: { id: MX_PROVE.id, versjon: '9.9.9' } });
    expect(ukjent.kontroll.status).toBe('rod');
    expect(ukjent.deler).toEqual([]);
    expect(ukjent.kontroll.funn[0]!.regel).toBe('BF-PROFIL-01');

    const ugyldig = byggBuildforge({
      ...knapp(),
      former: [{ ...knapp().former[0]!, mal: [Number.NaN, 1, 1] }],
    });
    expect(ugyldig.kontroll.funn[0]!.regel).toBe('BF-DATA-01');

    const dobbel = tolkParametre({ ...knapp(), former: [form({ id: 'a' }), form({ id: 'a' })] });
    expect(dobbel.ok).toBe(false);

    // extra fields are dropped: the base is the profile's base, whatever the file says
    const juks = byggBuildforge({ ...knapp(), utsparing: 20, bryter: { utsparing: 20 } });
    const fasit = byggBuildforge(knapp());
    expect(Array.from(juks.deler[0]!.mesh.posisjoner)).toEqual(Array.from(fasit.deler[0]!.mesh.posisjoner));
  });

  it('samme prosjekt gir samme geometri og revisjon; en endring gir ny revisjon', () => {
    const p = knapp();
    const a = byggBuildforge(p);
    const b = byggBuildforge(structuredClone(p));
    expect(a.kontroll.revisjon).toBe(b.kontroll.revisjon);
    expect(Array.from(a.deler[1]!.mesh.posisjoner)).toEqual(Array.from(b.deler[1]!.mesh.posisjoner));
    const endret = structuredClone(p);
    endret.former[0]!.mal[0] = 22;
    expect(revisjon(endret)).not.toBe(revisjon(p));
  });

  it('formendring endrer eksportgeometrien, men festet består', () => {
    const p = knapp();
    const stor = structuredClone(p);
    stor.former[0]!.mal = [26, 26, 10];
    const a = byggBuildforge(p).deler[1]!;
    const b = byggBuildforge(stor).deler[1]!;
    expect(avgrensning(b.mesh).maks[0]).toBeGreaterThan(avgrensning(a.mesh).maks[0] + 2);
    const m = byggMekanikk(MX_PROVE);
    // the exact top part is the first shell of the top in both
    const n = m.toppMesh.posisjoner.length;
    expect(Array.from(b.mesh.posisjoner.slice(0, n))).toEqual(Array.from(m.toppMesh.posisjoner));
  });
});

describe('bibliotek og festepunkter', () => {
  it('øyne passer bare foran på toppen eller hodet, horn bare øverst', () => {
    const oyne = finnDel('oyne')!;
    expect(alleFestepunkter.filter((id) => passer(oyne, id))).toEqual(['topp-front']);
    expect(festepunkterFor('figur').filter((id) => passer(oyne, id))).toEqual(['hode-front']);
    expect(festepunkterFor('figur').filter((id) => passer(finnDel('horn')!, id))).toEqual(['hode-midt']);
    for (const d of bibliotek)
      expect(
        festepunkterFor('klikker').some((id) => passer(d, id)),
        d.id,
      ).toBe(true);
  });

  it('plasserer en del ut fra festepunktets normal', () => {
    const [f] = plasserDel(finnDel('kule')!, {
      id: 'topp-front',
      punkt: [0, -10, 27],
      normal: [0, -1, 0],
      origo: [0, 0, 0],
    });
    expect(f!.kropp).toBe('topp');
    expect(f!.posisjon[1]).toBeLessThan(-10);
    expect(f!.komponent).toEqual({ id: 'kule', versjon: '1' });
  });
});

describe('eksport og rapport', () => {
  it('rød modell kan ikke eksporteres, men rapporten kan lastes ned', async () => {
    const dok = nyttBuildforgeDokument();
    dok.parametre = { ...med(form({ id: 'los', posisjon: [0, 0, 70], mal: [5, 5, 5] }), ...knapp().former) };
    const m = await buildforgeKjerne.byggModell(dok);
    const r = buildforgeKjerne.eksport!(dok, m);
    expect(r.sperret).toBeTruthy();
    expect(r.vedlegg?.filnavn).toMatch(/\.kontroll\.json$/);
  });

  it('grønn prototype gir én STL per del og en rapport knyttet til samme revisjon', async () => {
    const dok = nyttBuildforgeDokument('figur');
    const m = (await buildforgeKjerne.byggModell(dok)) as BuildforgeResultat;
    const r = buildforgeKjerne.eksport!(dok, m);
    expect(r.sperret).toBeUndefined();
    expect(r.stlPerDel).toBe(true);
    expect(r.merknad).toMatch(/ikke fysisk testet/);
    const rapport = JSON.parse(r.vedlegg!.innhold);
    expect(rapport.prosjekt.revisjon).toBe(revisjon(dok.parametre));
    expect(rapport.enhet).toBe('mm');
    expect(rapport.profil).toMatchObject({
      id: MX_PROVE.id,
      versjon: MX_PROVE.versjon,
      fysiskStatus: 'Ikke testet',
    });
    expect(rapport.deler.map((d: { id: string }) => d.id)).toEqual(['underdel', 'topp']);
    expect(JSON.stringify(rapport)).not.toMatch(/"id":"bryter/);
    expect(lagRapport(dok, m).toString()).toBeDefined();
  });
});

describe('festepunkter på modellen', () => {
  it('alle startmaler har alle festepunktene for familien sin, på overflaten', () => {
    for (const m of startmaler) {
      const p = m.parametre();
      const punkter = festepunkter(p);
      expect(punkter.map((f) => f.id).sort(), m.id).toEqual([...festepunkterFor(m.familie)].sort());
      for (const f of punkter) expect(Math.hypot(...f.normal)).toBeCloseTo(1, 3);
    }
  });
});

describe('kjegle', () => {
  it('er en eksakt avstand med spiss øverst', () => {
    const f = kjegle(5, 10, 0);
    expect(f(0, 0, 0)).toBeLessThan(0);
    expect(f(0, 0, 5)).toBeCloseTo(0, 5);
    expect(f(5, 0, -5)).toBeCloseTo(0, 5);
    expect(f(0, 0, 7)).toBeCloseTo(2, 5);
    expect(f(0, 0, -7)).toBeCloseTo(2, 5);
    expect(f(2.5, 0, 0)).toBeCloseTo(0, 5);
    // never changes faster than the distance
    let maks = 0;
    let frø = 1;
    const tilfeldig = () => ((frø = (frø * 16807) % 2147483647) / 2147483647) * 20 - 10;
    for (let i = 0; i < 5000; i++) {
      const a = [tilfeldig(), tilfeldig(), tilfeldig()] as const;
      const b = [a[0] + tilfeldig() / 50, a[1] + tilfeldig() / 50, a[2] + tilfeldig() / 50] as const;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      maks = Math.max(maks, Math.abs(f(...a) - f(...b)) / d);
    }
    expect(maks).toBeLessThan(1.001);
  });
});

describe('figur', () => {
  const venn = () => finnStartmal('venn').parametre();

  it('leddprofilen er en prøveprofil som henger sammen', () => {
    expect(sjekkLeddprofil(FIGURLEDD_PROVE)).toEqual([]);
    expect(FIGURLEDD_PROVE.fysiskStatus).toBe('ikke-testet');
    const k = leddmal(FIGURLEDD_PROVE);
    expect(k.hullRadius - k.pluggRadius).toBeCloseTo(0.2, 6);
    expect(k.pluggEnde).toBeLessThan(k.hullBunn);
  });

  it('figurmalene bygger grønt med ti lukkede deler som står på platen', () => {
    for (const m of startmaler.filter((x) => x.familie === 'figur')) {
      const r = byggBuildforge(m.parametre());
      expect(r.kontroll.status, `${m.id}: ${JSON.stringify(r.kontroll.funn)}`).toBe('gronn');
      expect(r.deler.map((d) => d.id)).toEqual([
        'hode',
        'kropp',
        'arm-venstre',
        'arm-hoyre',
        'hand-venstre',
        'hand-hoyre',
        'bein-venstre',
        'bein-hoyre',
        'fot-venstre',
        'fot-hoyre',
      ]);
      for (const d of r.deler) expect(sjekkManifold(d.mesh).lukket, `${m.id} ${d.id}`).toBe(true);
      const bunn = Math.min(...r.deler.map((d) => avgrensning(d.mesh).min[2]));
      expect(bunn).toBeCloseTo(0, 0);
      expect(r.kontroll.leddprofil?.id).toBe(FIGURLEDD_PROVE.id);
    }
  });

  it('høyre side er speilbildet av venstre', () => {
    const r = byggBuildforge(venn());
    const v = avgrensning(r.deler.find((d) => d.id === 'arm-venstre')!.mesh);
    const h = avgrensning(r.deler.find((d) => d.id === 'arm-hoyre')!.mesh);
    expect(h.min[0]).toBeCloseTo(-v.maks[0], 3);
    expect(h.maks[2]).toBeCloseTo(v.maks[2], 3);
    expect(volum(r.deler.find((d) => d.id === 'arm-hoyre')!.mesh)).toBeCloseTo(
      volum(r.deler.find((d) => d.id === 'arm-venstre')!.mesh),
      0,
    );
  });

  it('hver grunnmodell står fri av naboene', { timeout: 60_000 }, () => {
    // every base model at least once, against the widest neighbours
    for (const k of figurKropper)
      for (const m of grunnmodeller[k]) {
        const p = venn();
        const valg = { ...p.grunnmodeller, [k]: m.id } as Record<FigurKropp, string>;
        const r = byggBuildforge({
          ...p,
          grunnmodeller: valg,
          former: figurKropper.flatMap((kk) =>
            grunnmodeller[kk]
              .find((x) => x.id === valg[kk])!
              .former.map((f, i) => ({ ...f, id: `${kk}-${i}`, kropp: kk })),
          ),
        });
        expect(r.kontroll.status, `${k}=${m.id}: ${JSON.stringify(r.kontroll.funn)}`).toBe('gronn');
      }
  });

  it('en lengre kropp flytter hodet og armene med', () => {
    const a = lagSkjelett({
      hode: 'rund',
      kropp: 'rund',
      armer: 'tynne',
      hender: 'votter',
      bein: 'korte',
      fotter: 'stovler',
    })!;
    const b = lagSkjelett({
      hode: 'rund',
      kropp: 'paere',
      armer: 'tynne',
      hender: 'votter',
      bein: 'korte',
      fotter: 'stovler',
    })!;
    expect(b.origo.hode[2] - b.origo.kropp[2]).toBeGreaterThan(a.origo.hode[2] - a.origo.kropp[2]);
    expect(lagSkjelett({ ...a, hode: 'finnes-ikke' } as never)).toBeNull();
  });

  it('bein som krysser midten går inn i hverandre og blir røde', () => {
    const p = venn();
    p.former.push({
      ...form({ id: 'tykt' }),
      kropp: 'bein',
      type: 'kule',
      posisjon: [-4, 0, -8],
      mal: [12, 12, 12],
    });
    const r = byggBuildforge(p);
    const f = r.kontroll.funn.find((x) => x.regel === 'BF-KOLL-01');
    expect(f, JSON.stringify(r.kontroll.funn)).toBeDefined();
    expect(f!.objekter).toContain('tykt');
    expect(r.kontroll.status).toBe('rod');
  });

  it('en løs form og et ledd uten former blir røde', () => {
    const p = venn();
    p.former.push({ ...form({ id: 'los' }), kropp: 'hode', posisjon: [0, 0, 60], mal: [5, 5, 5] });
    const r = byggBuildforge(p);
    expect(r.kontroll.funn.find((x) => x.regel === 'BF-FESTE-01')?.objekter).toContain('los');

    const q = venn();
    // the hand moved away from the wrist: its socket is left alone
    for (const f of q.former)
      if (f.kropp === 'hender') f.posisjon = [f.posisjon[0], f.posisjon[1] - 20, f.posisjon[2]];
    const s = byggBuildforge(q);
    expect(s.kontroll.funn.some((x) => x.regel === 'BF-FESTE-02' || x.regel === 'BF-FESTE-01')).toBe(true);
    expect(s.kontroll.status).toBe('rod');

    const tom = venn();
    tom.former = tom.former.filter((f) => f.kropp !== 'fotter');
    expect(byggBuildforge(tom).kontroll.funn.some((x) => x.regel === 'BF-FIGUR-01')).toBe(true);
  });

  it('en ukjent grunnmodell eller leddprofil stopper byggingen', () => {
    const p = venn();
    expect(
      byggBuildforge({ ...p, grunnmodeller: { ...p.grunnmodeller, hode: 'ukjent' } }).kontroll.funn[0]!.regel,
    ).toBe('BF-DATA-01');
    expect(
      byggBuildforge({ ...p, profil: { id: 'figurledd-prove', versjon: '9' } }).kontroll.funn[0]!.regel,
    ).toBe('BF-PROFIL-01');
    // a figure shape on a clicker body is rejected
    expect(tolkParametre({ ...p, former: [{ ...p.former[0]!, kropp: 'topp' }] }).ok).toBe(false);
    // old clicker projects without `familie` are still clickers
    const gammel: Record<string, unknown> = { ...knapp() };
    delete gammel.familie;
    expect(tolkParametre(gammel).ok).toBe(true);
  });

  it('festepunktene på figuren gir former i delens egen ramme', () => {
    const p = venn();
    const punkter = festepunkter(p);
    const hode = punkter.find((f) => f.id === 'hode-midt')!;
    const [horn] = plasserDel(finnDel('horn')!, hode);
    expect(horn!.kropp).toBe('hode');
    // the head's frame starts at the neck, so the horn sits about a head above it
    expect(horn!.posisjon[2]).toBeGreaterThan(20);
    expect(horn!.posisjon[2]).toBeLessThan(35);
    const arm = punkter.find((f) => f.id === 'armer-utside')!;
    const [pigg] = plasserDel(finnDel('kjegle')!, arm);
    // pairs are not mirrored inside the segment
    expect(pigg!.speilet).toBe(false);
    const r = byggBuildforge({ ...p, former: [...p.former, ...plasserDel(finnDel('horn')!, hode)] });
    expect(r.kontroll.status, JSON.stringify(r.kontroll.funn)).toBe('gronn');
  });

  it('grønn figur gir én STL per del og en rapport med leddprofilen', async () => {
    const dok = nyttBuildforgeDokument('venn');
    const m = (await buildforgeKjerne.byggModell(dok)) as BuildforgeResultat;
    const r = buildforgeKjerne.eksport!(dok, m);
    expect(r.sperret).toBeUndefined();
    expect(r.stlPerDel).toBe(true);
    expect(r.merknad).toMatch(/Leddene er ikke fysisk testet/);
    const rapport = JSON.parse(r.vedlegg!.innhold);
    expect(rapport.familie).toBe('figur');
    expect(rapport.leddprofil).toMatchObject({ id: FIGURLEDD_PROVE.id, fysiskStatus: 'Ikke testet' });
    expect(rapport.deler).toHaveLength(10);
  });
});
