import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { settFontHenter } from '../../geometri/tekst';
import { alleMaterialer, finnMateriale, materialer, visningsnavn } from '../../core/materialer';
import {
  filamenterForProsjekt,
  finnFilamenter,
  hentEgneFilamenter,
  hentGrupper,
  lagreEgetFilament,
  lagreGruppe,
  lastEgneFilamenter,
  produsenter,
  rensFilament,
  slettEgetFilament,
  slettGruppe,
  GENERISK_PRODUSENT,
} from './filamenter';
import { leggTilFarge, nyttSigngenDokument, palett, parametre, settPalett, lesInnSigngen } from './dokument';
import { byggSigngen, lastFonter } from './modell';
import { rensFarger } from './fargeprofiler';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

function lagring(): void {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const LILLA = {
  navn: 'Dyp lilla',
  type: 'PLA' as const,
  hex: '#5a2d91',
  produsent: 'Polymaker',
  serie: 'PolyTerra',
  amsPlass: 3,
};

describe('The filament registry', () => {
  beforeEach(lagring);
  afterEach(() => {
    for (const f of hentEgneFilamenter()) slettEgetFilament(f.id);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('starts with the catalogue, whose ids are unchanged', () => {
    expect(alleMaterialer().slice(0, materialer.length)).toEqual(materialer);
    expect(finnMateriale('pla-kritthvit').navn).toBe('Kritthvit');
    expect(materialer.every((m) => !m.egen && !m.produsent)).toBe(true);
  });

  it('saves your own filament with its details and makes it known', () => {
    const f = lagreEgetFilament({
      ...LILLA,
      sku: 'PM-1',
      spole: 'Spole 2',
      metadata: { notat: 'fra 2026' },
    })!;
    expect(f.id).toMatch(/^fil-/);
    expect(f).toMatchObject({
      produsent: 'Polymaker',
      serie: 'PolyTerra',
      amsPlass: 3,
      egen: true,
      hex: '#5a2d91',
    });
    expect(finnMateriale(f.id)).toEqual(f);
    expect(hentEgneFilamenter()).toEqual([f]);
    expect(rensFarger([f.id, 'finnes-ikke'])).toEqual([f.id]);
  });

  it('refuses a colour that is not a hex value or a filament with no name', () => {
    expect(lagreEgetFilament({ ...LILLA, hex: 'rød' })).toBeNull();
    expect(lagreEgetFilament({ ...LILLA, navn: '  ' })).toBeNull();
    expect(rensFilament({ id: 'x', navn: 'A', hex: '#fff' })).toBeNull();
    const r = rensFilament({ id: 'x', navn: 'A', hex: '#ABCDEF', amsPlass: 99 })!;
    expect(r.hex).toBe('#abcdef');
    expect(r.amsPlass).toBeUndefined();
  });

  it('edits a filament in place and deletes it', () => {
    const f = lagreEgetFilament(LILLA)!;
    const g = lagreEgetFilament({ ...LILLA, id: f.id, hex: '#112233', egetNavn: 'Hovedfargen' })!;
    expect(g.id).toBe(f.id);
    expect(hentEgneFilamenter()).toHaveLength(1);
    expect(visningsnavn(finnMateriale(f.id))).toBe('Hovedfargen');
    slettEgetFilament(f.id);
    expect(hentEgneFilamenter()).toHaveLength(0);
    expect(finnMateriale(f.id).id).toBe(materialer[0]!.id);
  });

  it('browses by manufacturer and searches over name, series and notes', () => {
    const f = lagreEgetFilament({ ...LILLA, metadata: { notat: 'blank overflate' } })!;
    expect(produsenter()[0]).toBe(GENERISK_PRODUSENT);
    expect(produsenter()).toContain('Polymaker');
    expect(finnFilamenter({ produsent: 'Polymaker' })).toEqual([f]);
    expect(finnFilamenter({ tekst: 'polyterra lilla' })).toEqual([f]);
    expect(finnFilamenter({ tekst: 'BLANK' })).toEqual([f]);
    expect(finnFilamenter({ type: 'PETG' }).every((m) => m.type === 'PETG')).toBe(true);
    expect(finnFilamenter({ tekst: 'sølv' }).map((m) => m.id)).toContain('silk-solv');
    expect(finnFilamenter({ tekst: 'finnes ikke her' })).toEqual([]);
  });

  it('keeps colour groups', () => {
    const g = lagreGruppe('Jul', ['pla-svart', 'pla-rust', 'pla-svart'])!;
    expect(g.farger).toEqual(['pla-svart', 'pla-rust']);
    expect(lagreGruppe('jul', ['pla-skog'])!.farger).toEqual(['pla-skog']);
    expect(hentGrupper()).toHaveLength(1);
    expect(lagreGruppe('   ', ['pla-skog'])).toBeNull();
    slettGruppe(hentGrupper()[0]!.id);
    expect(hentGrupper()).toEqual([]);
  });
});

describe('Filaments in the project', () => {
  beforeEach(lagring);
  afterEach(() => {
    for (const f of hentEgneFilamenter()) slettEgetFilament(f.id);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('a sign with a profile of any size uses the filaments as its colours', () => {
    const a = lagreEgetFilament(LILLA)!;
    const b = lagreEgetFilament({ ...LILLA, navn: 'Lys lilla', hex: '#c9a6f0' })!;
    const farger = ['pla-kritthvit', 'pla-svart', a.id, b.id, 'pla-rust', 'pla-skog'];
    const d = nyttSigngenDokument(farger);
    expect(palett(d)).toEqual(farger);
    expect(d.lag[0]!.omriss![0]!.materialId).toBe('pla-svart');
    // the project carries a copy of the own filaments it uses
    expect(parametre(d).filamenter).toEqual([a, b]);
  });

  it('carries only the own filaments in use, and drops them when they go', () => {
    const a = lagreEgetFilament(LILLA)!;
    let d = nyttSigngenDokument();
    expect(parametre(d).filamenter).toBeUndefined();
    d = leggTilFarge(d, a.id);
    expect(parametre(d).filamenter).toEqual([a]);
    d = settPalett(d, ['pla-kritthvit', 'pla-svart']);
    expect(parametre(d).filamenter).toBeUndefined();
    expect(filamenterForProsjekt(['pla-svart', a.id])).toEqual([a]);
  });

  it('opens on another computer: the project brings its filaments', () => {
    const a = lagreEgetFilament(LILLA)!;
    const d = leggTilFarge(nyttSigngenDokument(), a.id);
    const json = JSON.stringify(d);
    slettEgetFilament(a.id);
    expect(finnMateriale(a.id).id).not.toBe(a.id);
    lesInnSigngen(JSON.parse(json));
    expect(finnMateriale(a.id)).toMatchObject({ navn: 'Dyp lilla', hex: '#5a2d91', produsent: 'Polymaker' });
    lastEgneFilamenter();
  });

  it('the old projects load as they were (ids are the filament ids)', () => {
    const gammel = nyttSigngenDokument();
    const laget = JSON.parse(JSON.stringify({ ...gammel, parametre: { autoZ: true, lagHoyde: 0.2 } }));
    expect(lesInnSigngen(laget)).toBe(laget);
    expect(palett(laget)).toEqual(['pla-kritthvit', 'pla-grafitt']);
  });

  it('builds with a custom filament', async () => {
    const a = lagreEgetFilament(LILLA)!;
    const d = settPalett(nyttSigngenDokument(), [a.id, 'pla-svart']);
    await lastFonter(d);
    const r = await byggSigngen(d);
    expect(r.deler.length).toBeGreaterThan(0);
    expect(r.deler.some((x) => x.materialId === a.id)).toBe(true);
  });
});
