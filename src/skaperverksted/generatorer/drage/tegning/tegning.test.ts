import { describe, expect, it } from 'vitest';
import { sjekkManifold } from '../../../geometri/mesh';
import type { Skall } from '../bibliotek';
import { drageKjerne } from '../kjerne';
import { standardParametre } from '../parametre';
import { minsteAvstand } from '../testgeometri';
import { byggTegning } from './bygg';
import { lagOppsett, lagSti, plasserMesh, segmentSkall, tilVerden, vedLengde } from './geometri';
import { modusFor, tegningFra } from './handlinger';
import { lesTegning, profilVerdi, standardTegning, type Tegning, type V2 } from './modell';
import {
  forenkle,
  fraKlassisk,
  leggTilPigg,
  settInnPunkt,
  settProfilpunkt,
  slettPunkt,
  snu,
  tegnRygg,
} from './operasjoner';

const rett = (lengde: number): Tegning => ({
  ...standardTegning(),
  rygg: [
    [lengde / 2, 0],
    [0, 0],
    [-lengde / 2, 0],
  ],
});

/** A spine that turns 45° over a short stretch. */
const sving = (): Tegning => ({
  ...standardTegning(),
  rygg: [
    [90, 0],
    [0, 0],
    [-30, 25],
    [-60, 60],
  ],
});

/** A hairpin: far too sharp to print. */
const harnal = (): Tegning => ({
  ...standardTegning(),
  rygg: [
    [90, 0],
    [-20, 0],
    [-20, 40],
    [60, 40],
  ],
});

const avstand = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('ryggen', () => {
  it('går gjennom punktene som er tegnet', () => {
    const t = standardTegning();
    const sti = lagSti(t.rygg);
    for (const p of t.rygg) expect(Math.min(...sti.punkter.map((q) => avstand(p, q)))).toBeLessThan(1e-6);
    expect(vedLengde(sti, 0).p).toEqual(t.rygg[0]);
    expect(avstand(vedLengde(sti, sti.L).p, t.rygg.at(-1)!)).toBeLessThan(1e-6);
  });

  it('profilen glir mellom punktene og er flat utenfor endene', () => {
    const p = [
      { t: 0.2, verdi: 10 },
      { t: 0.6, verdi: 30 },
    ];
    expect(profilVerdi(p, 0)).toBe(10);
    expect(profilVerdi(p, 0.4)).toBeCloseTo(20);
    expect(profilVerdi(p, 1)).toBe(30);
  });
});

describe('oppsett', () => {
  it('standarddragen har hode, kropp og hale uten feil', () => {
    const o = lagOppsett(standardTegning());
    expect(o.segmenter.length).toBeGreaterThanOrEqual(6);
    expect(o.segmenter[0]!.rolle).toBe('hode');
    expect(o.segmenter.at(-1)!.haleX).toBeDefined();
    expect(o.ledd).toHaveLength(o.segmenter.length - 1);
    expect(o.funn.filter((f) => f.niva === 'feil')).toEqual([]);
  });

  it('spalten i sokkelen vender dit armen ligger i printen', () => {
    const o = lagOppsett(sving());
    for (const l of o.ledd) {
      const foran = o.segmenter[l.indeks - 1]!;
      expect(foran.del.sokkel!.retning).toBeCloseTo(Math.PI + l.boy);
    }
    expect(Math.max(...o.ledd.map((l) => Math.abs(l.boy)))).toBeGreaterThan(0.3);
  });

  it('tappen står midt i sokkelen til delen foran, også i svinger', () => {
    for (const t of [standardTegning(), sving(), rett(200)]) {
      const o = lagOppsett(t);
      for (let i = 1; i < o.segmenter.length; i++) {
        const foran = o.segmenter[i - 1]!;
        const bak = o.segmenter[i]!;
        const sokkel = tilVerden(foran.T, [foran.del.sokkel!.jx, 0]);
        const tapp = tilVerden(bak.T, [bak.del.tapp!.jx, 0]);
        expect(avstand(sokkel, tapp)).toBeLessThan(1e-6);
        expect(avstand(sokkel, o.ledd[i - 1]!.p)).toBeLessThan(1e-6);
      }
    }
  });

  it('nesen og halespissen havner der ryggen begynner og slutter', () => {
    const t = standardTegning();
    const o = lagOppsett(t);
    const hode = o.segmenter[0]!;
    const hale = o.segmenter.at(-1)!;
    expect(avstand(tilVerden(hode.T, [hode.neseX!, 0]), t.rygg[0]!)).toBeLessThan(1e-6);
    expect(avstand(tilVerden(hale.T, [hale.haleX!, 0]), t.rygg.at(-1)!)).toBeLessThan(0.01);
  });

  it('mellomrommet vokser i svingen og er minst på rett rygg', () => {
    const r = lagOppsett(rett(180));
    for (const s of r.segmenter.slice(1)) expect(s.gap).toBeCloseTo(r.mal.mellomrom);
    const b = lagOppsett(sving());
    expect(Math.max(...b.segmenter.map((s) => s.gap))).toBeGreaterThan(b.mal.mellomrom + 0.5);
    expect(b.funn.filter((f) => f.niva === 'feil')).toEqual([]);
  });

  it('for krapp bøy og for kort rygg blir feil som peker på stedet', () => {
    const krapp = lagOppsett(harnal());
    const feil = krapp.funn.filter((f) => f.niva === 'feil');
    expect(feil.some((f) => f.ledd !== undefined)).toBe(true);
    expect(krapp.ledd.filter((l) => l.forSkarp).length).toBeGreaterThan(0);
    const kort = lagOppsett(rett(30));
    expect(kort.segmenter).toEqual([]);
    expect(kort.funn[0]!.tekst).toMatch(/minst \d+ mm/);
  });

  it('valgt antall deler holdes innenfor det ryggen har plass til', () => {
    const o = lagOppsett({ ...rett(180), antallDeler: 5 });
    expect(o.segmenter).toHaveLength(5);
    const mange = lagOppsett({ ...rett(120), antallDeler: 24 });
    expect(mange.segmenter.length).toBe(mange.maksDeler);
    expect(mange.funn.some((f) => /plass til/.test(f.tekst))).toBe(true);
  });

  it('en for smal tegnet bredde gjøres bred nok til leddet', () => {
    const t = { ...rett(180), bredde: [{ t: 0, verdi: 6 }] };
    const o = lagOppsett(t);
    expect(o.segmenter.every((s) => s.breddeOkt)).toBe(true);
    expect(o.funn.some((f) => /bredere/.test(f.tekst))).toBe(true);
  });

  it('pigger havner på delen de ligger på, én per del', () => {
    const t = { ...rett(180), elementer: [] as Tegning['elementer'] };
    const o0 = lagOppsett(t);
    const midt = (o0.segmenter[2]!.s0 + o0.segmenter[2]!.s1) / 2 / o0.L;
    const a = leggTilPigg(t, midt, 'runde');
    if ('grunn' in a) throw new Error(a.grunn);
    const b = leggTilPigg(a.tegning, midt, 'spisse');
    expect('grunn' in b).toBe(true);
    const o = lagOppsett(a.tegning);
    expect(o.segmenter[2]!.pigg).toBe('runde');
  });
});

describe('bygg', () => {
  it('standarddragen bygges uten feil, med én del per stykke og farge', () => {
    const r = byggTegning(standardTegning(), standardParametre);
    expect(r.advarsler.filter((a) => a.niva === 'feil')).toEqual([]);
    const stykker = new Set(r.deler.map((d) => d.id.split('-')[1]));
    expect(stykker.size).toBe(r.oppsett.segmenter.length);
    for (const d of r.deler) expect(d.mesh.indekser.length).toBeGreaterThan(0);
    expect(r.advarsler.some((a) => /prøveprofil/.test(a.tekst))).toBe(true);
  });

  it('skallene er lukkede', () => {
    const t = standardTegning();
    const o = lagOppsett(t);
    for (const seg of o.segmenter)
      for (const s of segmentSkall(t, seg, o.mal)) {
        const m = sjekkManifold(s.mesh);
        expect(m.lukket, `${seg.navn} ${s.type}`).toBe(true);
      }
  });

  it('delene som beveger seg har klaring i den tegnede stillingen', () => {
    for (const t of [standardTegning(), sving()]) {
      const o = lagOppsett(t);
      const verden = o.segmenter.map((seg): Skall[] =>
        segmentSkall(t, seg, o.mal).map((s) => ({ ...s, mesh: plasserMesh(s.mesh, seg.T) })),
      );
      for (let i = 0; i < verden.length; i++)
        for (let j = i + 1; j < Math.min(verden.length, i + 3); j++) {
          const r = minsteAvstand(verden[i]!, verden[j]!, o.mal.klaring * 2);
          expect(r.inni, `del ${i} og ${j} overlapper`).toBe(false);
          expect(r.avstand, `klaring mellom del ${i} og ${j}`).toBeGreaterThanOrEqual(o.mal.klaring * 0.95);
        }
    }
  });

  it('er deterministisk', () => {
    const a = byggTegning(standardTegning(), standardParametre);
    const b = byggTegning(standardTegning(), standardParametre);
    expect(a.deler.map((d) => [d.id, Array.from(d.mesh.posisjoner.slice(0, 30))])).toEqual(
      b.deler.map((d) => [d.id, Array.from(d.mesh.posisjoner.slice(0, 30))]),
    );
  });

  it('kryssende rygg gir feil', () => {
    const t: Tegning = {
      ...standardTegning(),
      rygg: [
        [60, 0],
        [-40, 0],
        [-40, 40],
        [10, 40],
        [10, -40],
      ],
    };
    const r = byggTegning(t, standardParametre);
    expect(r.advarsler.some((a) => a.niva === 'feil')).toBe(true);
  });
});

describe('innlesing', () => {
  it('reparerer ødelagte verdier og sier fra', () => {
    const r = lesTegning({
      rygg: [[1, 2]],
      bredde: [{ t: 2, verdi: 900 }, { t: 'x' }],
      hode: { form: 'firkant', horn: 'lange' },
      hale: 'pisk',
      antallDeler: 99,
      elementer: [
        { id: 'a', t: 0.5, form: 'spisse' },
        { id: 'a', t: 0.6, form: 'ukjent' },
        { t: Number.NaN },
      ],
    });
    expect(r.problemer.length).toBe(1);
    expect(r.tegning.rygg).toEqual(standardTegning().rygg);
    expect(r.tegning.bredde).toEqual([{ t: 1, verdi: 80 }]);
    expect(r.tegning.hode).toEqual({ form: 'rund', horn: 'lange', oyne: 'store' });
    expect(r.tegning.hale).toBe('spade');
    expect(r.tegning.antallDeler).toBe(24);
    expect(r.tegning.elementer.map((e) => [e.id, e.form])).toEqual([
      ['a', 'spisse'],
      ['ax', 'spisse'],
    ]);
  });

  it('en gyldig tegning leses inn uendret', () => {
    const t = standardTegning();
    expect(lesTegning(JSON.parse(JSON.stringify(t)))).toEqual({ tegning: t, problemer: [] });
  });
});

describe('operasjoner', () => {
  it('frihåndsstrek blir få punkter, og en kort strek avvises', () => {
    const strek: V2[] = Array.from({ length: 200 }, (_, i) => [100 - i, 20 * Math.sin(i / 30)]);
    const r = tegnRygg(standardTegning(), strek);
    if ('grunn' in r) throw new Error(r.grunn);
    expect(r.tegning.rygg.length).toBeGreaterThanOrEqual(3);
    expect(r.tegning.rygg.length).toBeLessThanOrEqual(14);
    expect(r.tegning.rygg[0]).toEqual([100, 0]);
    expect(
      'grunn' in
        tegnRygg(standardTegning(), [
          [0, 0],
          [5, 0],
        ]),
    ).toBe(true);
    expect(
      forenkle(
        [
          [0, 0],
          [1, 0.1],
          [2, 0],
        ],
        1,
      ),
    ).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });

  it('nytt ryggpunkt settes inn i riktig rekkefølge, og ryggen beholder to punkter', () => {
    const t = rett(160);
    const r = settInnPunkt(t, [40, 3]);
    expect(r.i).toBe(1);
    expect(r.tegning.rygg[1]).toEqual([40, 3]);
    expect(slettPunkt(slettPunkt(t, 0), 0).rygg).toHaveLength(2);
  });

  it('profilpunkt holder seg mellom naboene og innenfor grensene', () => {
    const t = standardTegning();
    const u = settProfilpunkt(t, 'bredde', 1, { t: 0.99, verdi: 500 });
    expect(u.bredde[1]!.t).toBeLessThan(t.bredde[2]!.t);
    expect(u.bredde[1]!.verdi).toBe(80);
  });

  it('snu bytter nese og hale og tar bredde og pigger med', () => {
    const t = standardTegning();
    const s = snu(t);
    expect(s.rygg[0]).toEqual(t.rygg.at(-1));
    expect(s.bredde[0]!.verdi).toBe(t.bredde.at(-1)!.verdi);
    expect(s.elementer[0]!.t).toBeCloseTo(1 - t.elementer[0]!.t);
    expect(snu(s).rygg).toEqual(t.rygg);
    expect(snu(s).bredde.map((b) => b.verdi)).toEqual(t.bredde.map((b) => b.verdi));
  });

  it('en drage fra delvelgeren tar med hode, horn, øyne, hale og pigger', () => {
    const t = fraKlassisk({
      ...standardParametre,
      hode: 'lang',
      horn: 'ingen',
      hale: 'kolle',
      pigger: 'plater',
    });
    expect(t.hode.form).toBe('lang');
    expect(t.hale).toBe('kolle');
    expect(t.elementer.every((e) => e.form === 'plater')).toBe(true);
    expect(fraKlassisk({ ...standardParametre, pigger: 'ingen' }).elementer).toEqual([]);
  });
});

describe('plugin', () => {
  it('en ny drage tegnes, og en drage fra delvelgeren åpnes som før', async () => {
    const dok = drageKjerne.nyttDokument();
    expect(modusFor(dok.parametre)).toBe('tegning');
    const r = await drageKjerne.byggModell(dok);
    expect(r.deler.length).toBeGreaterThan(6);
    expect(r.deler.every((d) => d.id.startsWith('tegnet-'))).toBe(true);
    const { modus: _m, tegning: _t, ...klassisk } = dok.parametre;
    expect(modusFor(klassisk)).toBe('klassisk');
    const k = await drageKjerne.byggModell({ ...dok, parametre: klassisk });
    expect(k.deler.every((d) => d.id.startsWith('drage-'))).toBe(true);
    expect(drageKjerne.eksport!({ ...dok, parametre: klassisk }, k)).toEqual({});
  });

  it('lesInn reparerer tegningen, og eksporten stoppes ved feil', async () => {
    const dok = drageKjerne.nyttDokument();
    const odelagt = { ...dok, parametre: { ...dok.parametre, tegning: { rygg: 'nei', hale: 'kolle' } } };
    const inn = drageKjerne.lesInn!(odelagt);
    expect(tegningFra(inn.parametre).tegning.hale).toBe('kolle');
    expect(tegningFra(inn.parametre).tegning.rygg).toEqual(standardTegning().rygg);
    expect(drageKjerne.lesInn!(inn)).toBe(inn);

    const ok = await drageKjerne.byggModell(dok);
    const regler = drageKjerne.eksport!(dok, ok);
    expect(regler.stlPerDel).toBe(true);
    expect(regler.sperret).toBeUndefined();
    expect(regler.merknad).toMatch(/prøveprint/);

    const krapp = { ...dok, parametre: { ...dok.parametre, tegning: harnal() } };
    const feil = await drageKjerne.byggModell(krapp);
    expect(drageKjerne.eksport!(krapp, feil).sperret).toMatch(/stoppet/);
  });

  it('bestilling beskriver den tegnede dragen uten pris', async () => {
    const dok = drageKjerne.nyttDokument();
    const b = drageKjerne.bestilling!(dok, await drageKjerne.byggModell(dok));
    expect(b.valg.Modell).toMatch(/Tegnet drage/);
    expect(b.valg.Deler).toMatch(/\d+ deler, \d+ ledd/);
    expect(JSON.stringify(b)).not.toMatch(/\bkr\b|pris|nok/i);
  });
});
