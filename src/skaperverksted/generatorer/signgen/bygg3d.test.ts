import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import { settFontHenter } from '../../geometri/tekst';
import plugin from './index';
import { forelopigMal, lastFonter } from './modell';
import { leggTilObjekt, nyForm, nyttObjekt } from './dokument';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

const venta = (ms: number) => new Promise((klar) => setTimeout(klar, ms));

describe('3D-modellen bygges først når 3D åpnes', () => {
  it('bygger ikke mens 2D redigeres, og bygger med fremdrift når 3D åpnes', async () => {
    const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
    await lastFonter(benk.dok);
    await venta(900);
    expect(benk.tilstand.modell).toBeNull();
    expect(benk.tilstand.modellForeldet).toBe(true);

    const lag = benk.dok.lag[0]!.id;
    benk.lastInn(leggTilObjekt(benk.dok, nyttObjekt(lag, nyForm('rektangel', 10, 10), { x: 0, y: 0 })));
    await venta(900);
    expect(benk.tilstand.modell).toBeNull();
    expect(benk.tilstand.bygger).toBe(false);

    const fremdrift: number[] = [];
    benk.lytt((t) => {
      if (t.byggFremdrift !== null) fremdrift.push(t.byggFremdrift);
    });
    benk.settInnstillinger({ visning: '3d' });
    expect(benk.tilstand.bygger).toBe(true);
    for (let i = 0; i < 100 && benk.tilstand.bygger; i++) await venta(50);
    expect(benk.tilstand.bygger).toBe(false);
    expect(benk.tilstand.modell?.deler.length).toBeGreaterThan(0);
    expect(benk.tilstand.modellForeldet).toBe(false);
    expect(fremdrift.length).toBeGreaterThan(2);
    expect(fremdrift).toEqual([...fremdrift].sort((a, b) => a - b));
    expect(Math.max(...fremdrift)).toBe(1);

    // back in 2D an edit leaves the model alone and only marks it as old
    benk.settInnstillinger({ visning: '2d' });
    const modell = benk.tilstand.modell;
    benk.lastInn(leggTilObjekt(benk.dok, nyttObjekt(lag, nyForm('ellipse', 6, 6), { x: 20, y: 0 })));
    await venta(900);
    expect(benk.tilstand.modell).toBe(modell);
    expect(benk.tilstand.modellForeldet).toBe(true);
    benk.avslutt();
  });

  it('gir størrelsen uten å bygge', async () => {
    const dok = plugin.nyttDokument();
    await lastFonter(dok);
    const m = forelopigMal(dok)!;
    expect(m.bredde).toBeGreaterThan(20);
    expect(m.hoyde).toBeGreaterThan(0);
  });
});
