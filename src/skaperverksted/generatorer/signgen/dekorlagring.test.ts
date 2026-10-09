import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { settFontHenter } from '../../geometri/tekst';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { SvgKilde } from '../../core/dokument';
import plugin from './index';
import { leggTil } from './handlinger';
import { lastFonter } from './modell';
import { dekorlagringHinder, lagreValgteSomDekor } from './dekorlagring';
import { dekorValg, hentEgneDekor } from './dekor';

beforeAll(async () => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
  await lastFonter(plugin.nyttDokument());
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const rute = (x: number): SvgKilde => ({
  type: 'svg',
  stier: [`M${x} 0L${x + 10} 0L${x + 10} 10L${x} 10Z`],
  filnavn: 'rute',
  fyllregel: 'nonzero',
});

describe('Lagre dekorelement', () => {
  it('saves the selected vectors as one element with their colours', () => {
    const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
    const a = leggTil(benk, rute(0), { x: 0, y: 0 }, 'A')!;
    const b = leggTil(benk, rute(30), { x: 0, y: 0 }, 'B')!;
    benk.endre({
      navn: 'Egen farge',
      anvend: (d) => ({
        ...d,
        objekter: { ...d.objekter, [b.id]: { ...d.objekter[b.id]!, materialId: 'pla-roed' } },
      }),
    });
    benk.velg({ objekter: [a.id, b.id] });
    expect(dekorlagringHinder(benk.dok, [benk.dok.objekter[a.id]!, benk.dok.objekter[b.id]!])).toBeNull();
    const lagret = lagreValgteSomDekor(benk, 'To ruter')!;
    expect(lagret).not.toBeNull();
    // two colours (the layer's and the red one) kept as two groups, and it shows up under «Dine egne»
    expect(lagret.grupper?.length).toBe(2);
    expect(hentEgneDekor().map((d) => d.navn)).toContain('To ruter');
    expect(dekorValg(hentEgneDekor()).find((v) => v.navn === 'To ruter')?.egen).toBe(true);
    benk.avslutt();
  });

  it('says why nothing is saved', () => {
    const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
    expect(dekorlagringHinder(benk.dok, [])).toMatch(/Velg/);
    expect(lagreValgteSomDekor(benk, 'Tomt')).toBeNull();
    benk.avslutt();
  });
});
