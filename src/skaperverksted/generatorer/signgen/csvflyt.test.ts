import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { skiltMedPlate } from './testskilt';
import { settFontHenter } from '../../geometri/tekst';
import type { Dokument, TekstKilde } from '../../core/dokument';
import { feltNavn, feltObjekter, nyttSigngenDokument, oppdaterObjekter, palett } from './dokument';
import { lastFonter } from './modell';
import {
  byggBatch,
  filamentkombinasjon,
  fordelPaPlater,
  foreslaKobling,
  lagVarianter,
  organiser,
  tolkCsv,
  type Variant,
} from './batch';
import {
  antallOverstyringer,
  bygSkilt,
  generer,
  grunnskilt,
  inverter,
  klargjorMaster,
  lagProduksjonsplater,
  lagreRedigertSkilt,
  lesArbeid,
  nyeFelt,
  nyttArbeid,
  rentDokument,
  sett,
  settArbeid,
  synligeRader,
  tilbakestillOverstyring,
  tilbakestillSkilt,
  ukjenteProfiler,
  valider,
  velgOmrade,
} from './csvflyt';
import {
  brukOverstyringer,
  finnOverstyringer,
  foreldreloseOverstyringer,
  overstyringsnokkel,
  visVerdi,
} from './overstyring';
import { tilTremfSamlinger } from '../../eksport/tremf';
import type { Fargeprofil } from './fargeprofiler';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

const PROFILER: Fargeprofil[] = [
  { id: 'corporate', navn: 'Corporate', farger: ['pla-signal', 'pla-svart'], egen: true },
  { id: 'autumn', navn: 'Autumn', farger: ['pla-rust', 'pla-kritthvit'], egen: true },
];

/** A master with a name field, a plate and a text layer. */
function master(): Dokument {
  const d = skiltMedPlate();
  const t = Object.values(d.objekter).find((o) => o.kilde.type === 'tekst')!;
  return oppdaterObjekter(d, [t.id], (o) => ({ ...o, kilde: { ...(o.kilde as TekstKilde), felt: 'navn' } }));
}

const teksten = (d: Dokument) =>
  (Object.values(d.objekter).find((o) => o.kilde.type === 'tekst')!.kilde as TekstKilde).tekst;

describe('Colour profile column (§27, §34)', () => {
  beforeAll(async () => {
    await lastFonter(master());
  });

  it('is suggested for a column called Fargeprofil', () => {
    const csv = tolkCsv('Navn;Rolle;Fargeprofil\nSivert;Designer;Corporate');
    const k = foreslaKobling(csv, master());
    expect(k[0]).toEqual({ type: 'felt', felt: 'navn' });
    expect(k[2]).toEqual({ type: 'profil' });
  });

  it('puts the profile colours in the master palette order and flags unknown profiles', () => {
    const m = master();
    const csv = tolkCsv('navn;profil\nSivert;Corporate\nMarie;autumn\nDavid;Blue');
    const v = lagVarianter(m, csv, foreslaKobling(csv, m), { profiler: PROFILER });
    const grunn = palett(m);
    expect(grunn.length).toBeGreaterThanOrEqual(2);
    expect(palett(v[0]!.dok)).toEqual(['pla-signal', 'pla-svart']);
    expect(v[0]!.farger.split('+')).toEqual(expect.arrayContaining(['pla-signal']));
    expect(palett(v[1]!.dok)).toEqual(['pla-rust', 'pla-kritthvit']);
    expect(v[2]!.problemer.join()).toMatch(/ukjent fargeprofil «Blue»/);
    // a layer colour column still wins over the profile
    const csv2 = tolkCsv('navn;profil;Tekst\nSivert;Corporate;Lilla');
    const w = lagVarianter(m, csv2, foreslaKobling(csv2, m), { profiler: PROFILER });
    expect(w[0]!.farger).toContain('pla-lilla');
  });

  it('lists the profile names that do not exist', () => {
    const a = nyttArbeid(tolkCsv('navn;profil\nA;Corporate\nB;Blue\nC;Blue'), 'test.csv', master());
    expect(ukjenteProfiler(a, [0, 1, 2], PROFILER)).toEqual(['Blue']);
    expect(ukjenteProfiler(a, [0], PROFILER)).toEqual([]);
  });
});

describe('The master from the first row (§25)', () => {
  beforeAll(async () => {
    await lastFonter(nyttSigngenDokument());
  });

  it('makes a field per text column, reuses the start text, and fills the master row', async () => {
    const start = nyttSigngenDokument();
    const csv = tolkCsv('Navn,Rolle,Fargeprofil\nSivert,Designer,Corporate\nMarie,Leder,Autumn');
    const a = nyttArbeid(csv, 'folk.csv', start);
    expect(a.kobling).toEqual([
      { type: 'felt', felt: 'navn' },
      { type: 'felt', felt: 'rolle' },
      { type: 'profil' },
    ]);
    expect(nyeFelt(start, a.kobling)).toEqual(['navn', 'rolle']);
    const m = await klargjorMaster(start, a);
    const felt = feltObjekter(m);
    expect(felt.map((o) => feltNavn(o)).sort()).toEqual(['navn', 'rolle']);
    // the start text became the first field, the second is stacked under it
    expect(Object.values(m.objekter).filter((o) => o.kilde.type === 'tekst')).toHaveLength(2);
    const nav = felt.find((o) => feltNavn(o) === 'navn')!;
    const rol = felt.find((o) => feltNavn(o) === 'rolle')!;
    expect((nav.kilde as TekstKilde).tekst).toBe('Sivert');
    expect((rol.kilde as TekstKilde).tekst).toBe('Designer');
    expect(rol.transform.y).toBeLessThan(nav.transform.y);
    expect(lesArbeid(m)).toEqual(a);
  });

  it('uses another row as the master when asked', async () => {
    const start = nyttSigngenDokument();
    const a = { ...nyttArbeid(tolkCsv('navn\nOla\nKari'), 'x.csv', start), masterRad: 1 };
    const m = await klargjorMaster(start, a);
    expect(teksten(m)).toBe('Kari');
  });
});

describe('Reading the columns (§24, §27)', () => {
  it('leaves empty columns and vector columns unconnected, and the rest become text fields', () => {
    const start = nyttSigngenDokument();
    const csv = tolkCsv('Navn;Logo;Tom;Fargeprofil;Rolle\nA;x.svg;;Natur;Designer');
    const a = nyttArbeid(csv, 'x.csv', start);
    expect(a.kobling.map((k) => k.type)).toEqual(['felt', 'ingen', 'ingen', 'profil', 'felt']);
    expect(a.valgte).toEqual([0]);
    expect(a.generert).toEqual([]);
    expect(a.steg).toBe('koble');
  });

  it('ignores damaged work in a project and fills in what is missing', () => {
    const d = nyttSigngenDokument();
    expect(lesArbeid(d)).toBeNull();
    expect(lesArbeid({ ...d, parametre: { ...d.parametre, csvarbeid: { versjon: 2 } } })).toBeNull();
    const a = nyttArbeid(tolkCsv('navn\nA\nB'), 'x.csv', d);
    const eldre = { ...a, valg: undefined, steg: undefined, masterRad: 99 } as unknown as typeof a;
    const l = lesArbeid(settArbeid(d, eldre))!;
    expect(l.masterRad).toBe(1);
    expect(l.steg).toBe('koble');
    expect(l.valg.plateavstand).toBe(5);
    expect(settArbeid(settArbeid(d, a), null).parametre).not.toHaveProperty('csvarbeid');
  });
});

describe('Choosing rows (§28)', () => {
  const a = nyttArbeid(
    tolkCsv('navn;rolle\nOla;Designer\nKari;Leder\nPer;Deltaker\nÅse;Leder'),
    't.csv',
    master(),
  );

  it('searches over all cells, ignoring case and accents', () => {
    const alle = new Set([0, 1, 2, 3]);
    expect(synligeRader(a, { sok: 'leder', visning: 'alle' }, alle)).toEqual([1, 3]);
    expect(synligeRader(a, { sok: 'ase', visning: 'alle' }, alle)).toEqual([3]);
    expect(synligeRader(a, { sok: 'kari leder', visning: 'alle' }, alle)).toEqual([1]);
  });

  it('filters on chosen, not chosen and problems', () => {
    const valgte = new Set([0, 2]);
    expect(synligeRader(a, { sok: '', visning: 'valgte' }, valgte)).toEqual([0, 2]);
    expect(synligeRader(a, { sok: '', visning: 'ikke-valgte' }, valgte)).toEqual([1, 3]);
    expect(synligeRader(a, { sok: '', visning: 'problemer' }, valgte, new Set([3]))).toEqual([3]);
  });

  it('selects all, none and inverts only what is shown', () => {
    const vises = [1, 3];
    expect(sett(new Set([0]), vises, true)).toEqual([0, 1, 3]);
    expect(sett(new Set([0, 1, 3]), vises, false)).toEqual([0]);
    expect(inverter(new Set([0, 1]), vises)).toEqual([0, 3]);
  });

  it('selects a range with shift in the order shown', () => {
    const vises = [3, 1, 2, 0];
    expect(velgOmrade(new Set(), vises, 3, 2, true)).toEqual([1, 2, 3]);
    expect(velgOmrade(new Set([0, 1, 2, 3]), vises, 1, 0, false)).toEqual([3]);
  });
});

describe('Validation before «Generer» (§29)', () => {
  beforeAll(async () => {
    await lastFonter(master());
  });

  it('passes with a good master, mapping and rows, and blocks on problems', () => {
    const m = master();
    const csv = tolkCsv('navn\nOla\nEt veldig langt navn som ikke får plass\nKari');
    const a = nyttArbeid(csv, 'x.csv', m);
    const v = bygSkilt(m, a, a.valgte, { profiler: PROFILER });
    const r = valider(m, a, v, PROFILER);
    expect(r.klar).toBe(false);
    expect(r.problemrader).toEqual([1]);
    expect(r.kontroller.find((k) => k.id === 'rader')!.ok).toBe(false);
    const b = { ...a, valgte: [0, 2] };
    const ok = valider(m, b, bygSkilt(m, b, b.valgte, { profiler: PROFILER }), PROFILER);
    expect(ok.klar).toBe(true);
  });

  it('blocks when nothing is chosen, nothing is connected, a field is gone or a profile is unknown', () => {
    const m = master();
    const a = nyttArbeid(tolkCsv('navn;profil\nOla;Blue'), 'x.csv', m);
    const tom = { ...a, valgte: [] as number[] };
    expect(valider(m, tom, [], PROFILER).kontroller.find((k) => k.id === 'valgte')!.ok).toBe(false);
    expect(valider(m, a, [], PROFILER).kontroller.find((k) => k.id === 'profiler')!.ok).toBe(false);
    const utenKobling = { ...a, kobling: a.kobling.map(() => ({ type: 'ingen' as const })) };
    expect(valider(m, utenKobling, [], PROFILER).kontroller.find((k) => k.id === 'kobling')!.ok).toBe(false);
    const borte = { ...a, kobling: [{ type: 'felt' as const, felt: 'finnes-ikke' }, ...a.kobling.slice(1)] };
    expect(valider(m, borte, [], PROFILER).kontroller.find((k) => k.id === 'felt')!.ok).toBe(false);
    const dobbelt = {
      ...a,
      kobling: [
        { type: 'felt' as const, felt: 'navn' },
        { type: 'felt' as const, felt: 'navn' },
      ],
    };
    expect(valider(m, dobbelt, [], PROFILER).kontroller.find((k) => k.id === 'felt')!.ok).toBe(false);
  });

  it('generation adds rows and keeps those made before', () => {
    const a = nyttArbeid(tolkCsv('navn\nA\nB\nC'), 'x.csv', master());
    const en = generer(a, [0, 2]);
    expect(en.generert).toEqual([0, 2]);
    expect(generer(en, [1, 2]).generert).toEqual([0, 1, 2]);
  });
});

describe('Overrides on a generated sign (§30, §31)', () => {
  beforeAll(async () => {
    await lastFonter(master());
  });

  function oppsett() {
    const m = master();
    const csv = tolkCsv('navn\nOla\nKari');
    const a = generer(nyttArbeid(csv, 'x.csv', m), [0, 1]);
    const med = settArbeid(m, a);
    return { m: med, a };
  }

  it('keeps a changed property as an override on that sign only', () => {
    const { m, a } = oppsett();
    const grunn = grunnskilt(m, a, 1)!.dok;
    const navn = feltObjekter(grunn)[0]!;
    const redigert = oppdaterObjekter(grunn, [navn.id], (o) => ({
      ...o,
      transform: { ...o.transform, x: o.transform.x - 3 },
      kilde: { ...(o.kilde as TekstKilde), storrelse: 9 },
    }));
    const { arbeid, avvik } = lagreRedigertSkilt(a, 1, grunn, redigert);
    expect(avvik.utenfor).toEqual([]);
    expect(Object.keys(arbeid.overstyringer[1]!).sort()).toEqual(
      [`objekt:${navn.id}:storrelse`, `objekt:${navn.id}:x`].sort(),
    );
    expect(arbeid.overstyringer[0]).toBeUndefined();
    const bygd = bygSkilt(m, arbeid, [0, 1]);
    const n1 = feltObjekter(bygd[1]!.dok)[0]!;
    expect(n1.transform.x).toBeCloseTo(navn.transform.x - 3);
    expect((n1.kilde as TekstKilde).storrelse).toBe(9);
    expect(bygd[1]!.overstyrt).toHaveLength(2);
    // the other sign is as the master has it
    expect((feltObjekter(bygd[0]!.dok)[0]!.kilde as TekstKilde).storrelse).toBe(
      (navn.kilde as TekstKilde).storrelse,
    );
  });

  it('still follows the master in everything it has no override for', () => {
    const { m, a } = oppsett();
    const grunn = grunnskilt(m, a, 1)!.dok;
    const navn = feltObjekter(grunn)[0]!;
    const redigert = oppdaterObjekter(grunn, [navn.id], (o) => ({
      ...o,
      transform: { ...o.transform, x: o.transform.x + 2 },
    }));
    const { arbeid } = lagreRedigertSkilt(a, 1, grunn, redigert);
    // the master changes the font size and the colour of the text layer
    const lagId = navn.lagId;
    const nyMaster = settArbeid(
      {
        ...oppdaterObjekter(m, [navn.id], (o) => ({
          ...o,
          kilde: { ...(o.kilde as TekstKilde), storrelse: 11 },
        })),
        lag: m.lag.map((l) => (l.id === lagId ? { ...l, materialId: 'pla-lilla' } : l)),
      },
      arbeid,
    );
    const s = bygSkilt(nyMaster, arbeid, [1])[0]!;
    const n = feltObjekter(s.dok)[0]!;
    expect((n.kilde as TekstKilde).storrelse).toBe(11);
    expect(n.transform.x).toBeCloseTo(navn.transform.x + 2);
    expect(s.dok.lag.find((l) => l.id === lagId)!.materialId).toBe('pla-lilla');
  });

  it('resets one value or the whole sign', () => {
    const { m, a } = oppsett();
    const grunn = grunnskilt(m, a, 0)!.dok;
    const navn = feltObjekter(grunn)[0]!;
    const redigert = oppdaterObjekter(grunn, [navn.id], (o) => ({
      ...o,
      transform: { ...o.transform, x: 4, y: 5 },
    }));
    const { arbeid } = lagreRedigertSkilt(a, 0, grunn, redigert);
    expect(antallOverstyringer(arbeid, 0)).toBe(2);
    const en = tilbakestillOverstyring(arbeid, 0, `objekt:${navn.id}:x`);
    expect(antallOverstyringer(en, 0)).toBe(1);
    const ingen = tilbakestillSkilt(arbeid, 0);
    expect(antallOverstyringer(ingen, 0)).toBe(0);
    expect(ingen.overstyringer[0]).toBeUndefined();
    const gjen = bygSkilt(m, ingen, [0])[0]!;
    expect(feltObjekter(gjen.dok)[0]!.transform.x).toBeCloseTo(navn.transform.x);
  });

  it('keeps a changed layer colour and outline height as overrides', () => {
    const m = nyttSigngenDokument();
    const a = generer(nyttArbeid(tolkCsv('navn\nA'), 'x.csv', m), [0]);
    const lag = m.lag[0]!;
    const omriss = lag.omriss![0]!;
    const redigert: Dokument = {
      ...m,
      lag: m.lag.map((l) => ({
        ...l,
        materialId: 'pla-lilla',
        omriss: l.omriss!.map((o) => ({ ...o, hoyde: 3.5, materialId: 'pla-cyan' })),
      })),
    };
    const avvik = finnOverstyringer(m, redigert).overstyringer;
    expect(avvik[overstyringsnokkel({ mal: 'lag', id: lag.id, egenskap: 'materialId' })]!.verdi).toBe(
      'pla-lilla',
    );
    expect(avvik[overstyringsnokkel({ mal: 'omriss', id: omriss.id, egenskap: 'hoyde' })]!.verdi).toBe(3.5);
    const brukt = brukOverstyringer(m, avvik);
    expect(brukt.lag[0]!.omriss![0]!.hoyde).toBe(3.5);
    expect(brukt.lag[0]!.materialId).toBe('pla-lilla');
    expect(a.generert).toEqual([0]);
  });

  it('says what cannot be kept as an override', () => {
    const { m, a } = oppsett();
    const grunn = grunnskilt(m, a, 0)!.dok;
    const navn = feltObjekter(grunn)[0]!;
    const skrevet = oppdaterObjekter(grunn, [navn.id], (o) => ({
      ...o,
      kilde: { ...(o.kilde as TekstKilde), tekst: 'Noe annet' },
    }));
    expect(finnOverstyringer(grunn, skrevet).utenfor.join()).toMatch(/CSV/);
    const slettet = {
      ...grunn,
      objekter: Object.fromEntries(Object.entries(grunn.objekter).filter(([id]) => id !== navn.id)),
    };
    expect(finnOverstyringer(grunn, slettet).utenfor.join()).toMatch(/masteren/);
  });

  it('reports overrides whose target the master has lost, and formats values', () => {
    const { m } = oppsett();
    const ov = {
      'objekt:borte:x': { mal: 'objekt' as const, id: 'borte', egenskap: 'x', verdi: 1 },
    };
    expect(foreldreloseOverstyringer(m, ov)).toHaveLength(1);
    expect(visVerdi({ mal: 'objekt', egenskap: 'x' }, 47)).toBe('47 mm');
    expect(visVerdi({ mal: 'objekt', egenskap: 'synlig' }, false)).toBe('skjult');
    expect(visVerdi({ mal: 'lag', egenskap: 'materialId' }, 'pla-lilla')).toMatch(/Lilla/);
  });

  it('builds signs without the CSV work riding along', () => {
    const { m, a } = oppsett();
    const s = bygSkilt(m, a, [0])[0]!;
    expect((s.dok.parametre as Record<string, unknown>).csvarbeid).toBeUndefined();
    expect(rentDokument(m).parametre).not.toHaveProperty('csvarbeid');
  });
});

function skilt(indeks: number, farger: string): Variant {
  const m = master();
  return {
    indeks,
    verdier: [`Skilt ${indeks}`],
    dok: m,
    farger,
    problemer: [],
    boks: { minX: -20, minY: -10, maksX: 20, maksY: 10 },
  };
}

describe('Production plates by filament combination (§33)', () => {
  const HVIT = 'pla-kritthvit';
  const SVART = 'pla-svart';
  const ROD = 'pla-signal';
  const BLA = 'pla-cyan';

  it('uses the actual filament ids, not the order or the look', () => {
    expect(filamentkombinasjon({ farger: `${SVART}+${HVIT}+${HVIT}` })).toEqual([HVIT, SVART].sort());
    const v = [skilt(0, `${HVIT}+${SVART}`), skilt(1, `${SVART}+${HVIT}`), skilt(2, `${HVIT}+${BLA}`)];
    const g = organiser(v, 'csv', 'farger');
    expect(g.map((x) => x.map((y) => y.indeks))).toEqual([[0, 1], [2]]);
  });

  it('puts 20 white/black/red signs and 12 white/black/blue signs on different plates', () => {
    const v = [
      ...Array.from({ length: 20 }, (_, i) =>
        skilt(i, i % 2 ? `${ROD}+${HVIT}+${SVART}` : `${HVIT}+${SVART}+${ROD}`),
      ),
      ...Array.from({ length: 12 }, (_, i) => skilt(20 + i, `${HVIT}+${SVART}+${BLA}`)),
    ];
    const plater = lagProduksjonsplater(v, { bredde: 256, dybde: 256 }, 5);
    const rod = plater.filter((p) => p.kombinasjon.includes(ROD));
    const bla = plater.filter((p) => p.kombinasjon.includes(BLA));
    expect(rod.reduce((n, p) => n + p.plasseringer.length, 0)).toBe(20);
    expect(bla.reduce((n, p) => n + p.plasseringer.length, 0)).toBe(12);
    expect(rod.some((p) => bla.includes(p))).toBe(false);
    for (const p of plater) {
      for (const pl of p.plasseringer)
        expect(filamentkombinasjon(pl.variant)).toEqual([...p.kombinasjon].sort());
    }
    // the larger combination comes first, and plates are numbered in order
    expect(plater[0]!.kombinasjon).toContain(ROD);
    expect(plater.map((p) => p.nummer)).toEqual(plater.map((_, i) => i + 1));
  });

  it('writes the same filament slots on every plate with the same combination, and keeps parts and colours apart', async () => {
    const m = master();
    const csv = tolkCsv('navn\nOla\nKari');
    const v = lagVarianter(m, csv, foreslaKobling(csv, m));
    // the second sign lists its colours the other way round
    const omvendt = { ...v[1]!, farger: v[1]!.farger.split('+').reverse().join('+') };
    const plater = lagProduksjonsplater([v[0]!, omvendt], m.plate, 5);
    expect(plater).toHaveLength(1);
    const r = await byggBatch(plater, csv.kolonner, 'Plater', 'plate');
    const zip = unzipSync(r.zip);
    const tremf = unzipSync(zip['plater-plate-01.3mf']!);
    const modell = strFromU8(tremf['3D/3dmodel.model']!);
    // each part is its own object with its colour: not one flattened mesh
    expect(
      modell.match(/<object id="\d+" name="[^"]*" type="model" pid="1"/g)!.length,
    ).toBeGreaterThanOrEqual(4);
    expect(modell.match(/<base name=/g)!.length).toBeGreaterThanOrEqual(2);
    expect(modell).toContain('name="Filamenter"');
    const innst = strFromU8(tremf['Metadata/model_settings.config']!);
    expect(innst).toContain('key="extruder"');
    expect(strFromU8(zip['manifest.csv']!)).toMatch(/filamenter;overstyringer/);
  });

  it('gives a fixed slot order when asked, whatever order the parts come in', () => {
    const del = (id: string, materialId: string) => ({
      id,
      navn: id,
      materialId,
      mesh: {
        posisjoner: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indekser: new Uint32Array([0, 1, 2]),
      },
    });
    const a = tilTremfSamlinger([{ navn: 'a', deler: [del('1', SVART), del('2', HVIT)] }], {
      tittel: 'a',
      filamentrekkefolge: [HVIT, SVART],
    });
    const b = tilTremfSamlinger([{ navn: 'b', deler: [del('1', HVIT), del('2', SVART)] }], {
      tittel: 'b',
      filamentrekkefolge: [HVIT, SVART],
    });
    const slots = (u: Uint8Array) =>
      [
        ...strFromU8(unzipSync(u)['Metadata/model_settings.config']!).matchAll(
          /key="extruder" value="(\d)"/g,
        ),
      ].map((x) => x[1]);
    const baser = (u: Uint8Array) =>
      [...strFromU8(unzipSync(u)['3D/3dmodel.model']!).matchAll(/<base name="([^"]+)"/g)].map((x) => x[1]);
    expect(baser(a)).toEqual(baser(b));
    expect(slots(a).slice(1)).toEqual(['2', '1']);
    expect(slots(b).slice(1)).toEqual(['1', '2']);
  });
});

describe('Packing keeps working with plates tagged by combination', () => {
  it('fits each group on its own plates', () => {
    const v = [skilt(0, 'pla-kritthvit'), skilt(1, 'pla-svart')];
    const plater = fordelPaPlater(organiser(v, 'csv', 'farger'), { bredde: 100, dybde: 100 }, 5);
    expect(plater).toHaveLength(2);
  });
});
