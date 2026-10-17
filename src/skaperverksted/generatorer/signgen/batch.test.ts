import { skiltMedPlate } from './testskilt';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { settFontHenter } from '../../geometri/tekst';
import type { Dokument, TekstKilde } from '../../core/dokument';
import { oppdaterObjekter } from './dokument';
import { lastFonter } from './modell';
import {
  byggBatch,
  finnFarge,
  foreslaKobling,
  fordelPaPlater,
  lagVarianter,
  manifest,
  organiser,
  tolkCsv,
  type Variant,
} from './batch';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

function master(): Dokument {
  const d = skiltMedPlate();
  const tekst = Object.values(d.objekter).find((o) => o.kilde.type === 'tekst')!;
  return oppdaterObjekter(d, [tekst.id], (o) => ({
    ...o,
    kilde: { ...(o.kilde as TekstKilde), felt: 'navn' },
  }));
}

describe('CSV parsing', () => {
  it('detects semicolons, quotes, BOM and blank lines', () => {
    const c = tolkCsv('﻿navn;farge\r\n"Ola; Nordmann";Lilla\r\n\r\n"Kari ""K"" Hansen";cyan\n');
    expect(c.kolonner).toEqual(['navn', 'farge']);
    expect(c.rader).toEqual([
      ['Ola; Nordmann', 'Lilla'],
      ['Kari "K" Hansen', 'cyan'],
    ]);
  });

  it('detects commas and tabs and pads short rows', () => {
    expect(tolkCsv('a,b\n1').rader).toEqual([['1', '']]);
    expect(tolkCsv('a\tb\n1\t2').rader).toEqual([['1', '2']]);
  });

  it('maps colour names and ids', () => {
    expect(finnFarge('Lilla')).toBe('pla-lilla');
    expect(finnFarge('pla-cyan')).toBe('pla-cyan');
    expect(finnFarge('Svart PETG')).toBe('petg-svart');
    expect(finnFarge('turkis-glitter')).toBeNull();
  });
});

describe('Variants', () => {
  beforeAll(async () => {
    await lastFonter(master());
  });

  it('suggests mapping from column names', () => {
    const m = master();
    const k = foreslaKobling(tolkCsv('Navn;Tekst;annet\nx;y;z'), m);
    expect(k[0]).toEqual({ type: 'felt', felt: 'navn' });
    expect(k[1]).toMatchObject({ type: 'farge' });
    expect(k[2]).toEqual({ type: 'ingen' });
  });

  it('fills fields, applies colours and flags overflow and unknown colours', () => {
    const m = master();
    const csv = tolkCsv(
      'navn;Tekst\nOla;Lilla\nEt veldig langt navn som ikke får plass;Cyan\nKari;Neonoransje',
    );
    // a plate of fixed size cannot take the long name (a plate that grows is tested in csvlayout.test.ts)
    const v = lagVarianter(m, csv, foreslaKobling(csv, m), { tilpassSkilt: false });
    expect(v).toHaveLength(3);
    const tekst = (d: Dokument) =>
      (Object.values(d.objekter).find((o) => o.kilde.type === 'tekst')!.kilde as TekstKilde).tekst;
    expect(tekst(v[0]!.dok)).toBe('Ola');
    expect(v[0]!.problemer).toEqual([]);
    expect(v[0]!.farger).toContain('pla-lilla');
    expect(v[1]!.problemer.join()).toMatch(/for lang/);
    expect(v[2]!.problemer.join()).toMatch(/ukjent farge/);
    // the master is untouched
    expect(tekst(m)).toBe('Designporten');
  });
});

function falsk(indeks: number, b: number, h: number, farger = 'a', navn = `n${indeks}`): Variant {
  return {
    indeks,
    verdier: [navn],
    dok: master(),
    farger,
    problemer: [],
    boks: { minX: -b / 2, minY: -h / 2, maksX: b / 2, maksY: h / 2 },
  };
}

describe('Organisation and plates', () => {
  it('sorts alphabetically and groups by colour combination', () => {
    const v = [
      falsk(0, 10, 10, 'a', 'Øystein'),
      falsk(1, 10, 10, 'b', 'Anne'),
      falsk(2, 10, 10, 'a', 'Bjørn'),
    ];
    expect(organiser(v, 'alfabet', 'ingen')[0]!.map((x) => x.verdier[0])).toEqual([
      'Anne',
      'Bjørn',
      'Øystein',
    ]);
    const g = organiser(v, 'csv', 'farger');
    expect(g.map((x) => x.map((y) => y.indeks))).toEqual([[0, 2], [1]]);
  });

  it('packs signs in rows without overlap and inside the plate', () => {
    const plate = { bredde: 100, dybde: 100 };
    const v = Array.from({ length: 10 }, (_, i) => falsk(i, 40, 20));
    const plater = fordelPaPlater([v], plate, 5);
    // 2 per row (5+40+5+40 ≤ 95), 3 rows (5+20+5+20+5+20 ≤ 95) = 6 per plate
    expect(plater.map((p) => p.plasseringer.length)).toEqual([6, 4]);
    for (const p of plater) {
      const bokser = p.plasseringer.map((pl) => ({
        minX: pl.variant.boks.minX + pl.dx,
        maksX: pl.variant.boks.maksX + pl.dx,
        minY: pl.variant.boks.minY + pl.dy,
        maksY: pl.variant.boks.maksY + pl.dy,
      }));
      for (const b of bokser) {
        expect(b.minX).toBeGreaterThanOrEqual(-50 + 5 - 1e-9);
        expect(b.maksX).toBeLessThanOrEqual(50 - 5 + 1e-9);
        expect(b.minY).toBeGreaterThanOrEqual(-50 + 5 - 1e-9);
        expect(b.maksY).toBeLessThanOrEqual(50 - 5 + 1e-9);
      }
      for (let i = 0; i < bokser.length; i++)
        for (let j = i + 1; j < bokser.length; j++) {
          const a = bokser[i]!,
            b = bokser[j]!;
          const overlapp = a.minX < b.maksX && b.minX < a.maksX && a.minY < b.maksY && b.minY < a.maksY;
          expect(overlapp).toBe(false);
        }
    }
  });

  it('starts each colour group on a new plate and rejects oversized signs', () => {
    const plate = { bredde: 100, dybde: 100 };
    expect(fordelPaPlater([[falsk(0, 10, 10)], [falsk(1, 10, 10)]], plate)).toHaveLength(2);
    expect(() => fordelPaPlater([[falsk(0, 95, 10)]], plate)).toThrow(/større enn byggeplaten/);
  });

  it('writes a manifest with quoting', () => {
    const plater = fordelPaPlater([[falsk(0, 10, 10, 'pla-lilla+pla-cyan', 'Ola; N')]], {
      bredde: 100,
      dybde: 100,
    });
    const m = manifest(plater, ['navn'], () => 'fil.3mf');
    expect(m.split('\r\n')).toEqual([
      'fil;plate;rad;farger;filamenter;overstyringer;navn',
      'fil.3mf;1;1;Lilla + Cyan;pla-cyan + pla-lilla;0;"Ola; N"',
    ]);
  });
});

describe('Batch output', () => {
  it('writes one 3MF per plate with one build item per sign, plus a manifest', async () => {
    const m = master();
    const csv = tolkCsv('navn\nOla\nKari\nPer');
    const v = lagVarianter(m, csv, foreslaKobling(csv, m));
    const plater = fordelPaPlater(organiser(v, 'csv', 'ingen'), m.plate);
    const r = await byggBatch(plater, csv.kolonner, 'Navneskilt', 'plate');
    expect(r.feil).toEqual([]);
    const zip = unzipSync(r.zip);
    expect(Object.keys(zip).sort()).toEqual(['manifest.csv', 'navneskilt-plate-01.3mf']);
    const modell = strFromU8(unzipSync(zip['navneskilt-plate-01.3mf']!)['3D/3dmodel.model']!);
    expect(modell.match(/<item /g)).toHaveLength(3);
    expect(strFromU8(zip['manifest.csv']!)).toContain('navneskilt-plate-01.3mf;1;3;');
  });

  it('writes one 3MF per variant when asked', async () => {
    const m = master();
    const csv = tolkCsv('navn\nOla\nKåre');
    const v = lagVarianter(m, csv, foreslaKobling(csv, m));
    const r = await byggBatch(fordelPaPlater([v], m.plate), csv.kolonner, 'Navneskilt', 'variant');
    expect(r.filer.sort()).toEqual(['manifest.csv', 'navneskilt-01-ola.3mf', 'navneskilt-02-kare.3mf']);
  });
});
