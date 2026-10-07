import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import { settFontHenter } from '../../geometri/tekst';
import plugin from './index';
import { leggTilObjekt, nyForm, nyttObjekt } from './dokument';
import { utvalgsboks, valgte } from './handlinger';
import { flyttUtvalgTil, roterUtvalgTil, skalerUtvalgTil } from './transformer';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

function benkMedTo() {
  const benk = new Arbeidsbenk(plugin, plugin.nyttDokument());
  const lag = benk.dok.lag[0]!.id;
  let d = benk.dok;
  const a = nyttObjekt(lag, nyForm('rektangel', 10, 20), { x: -20, y: 0 }, 'A');
  const b = nyttObjekt(lag, nyForm('rektangel', 10, 20), { x: 20, y: 0 }, 'B');
  d = leggTilObjekt(leggTilObjekt(d, a), b);
  benk.lastInn(d);
  benk.velg({ objekter: [a.id, b.id], lag });
  return { benk, a, b };
}

describe('transformasjon fra tall', () => {
  it('flytter utvalgets midtpunkt', () => {
    const { benk } = benkMedTo();
    flyttUtvalgTil(benk, 5, 10);
    const b = utvalgsboks(valgte(benk))!;
    expect((b.minX + b.maksX) / 2).toBeCloseTo(5);
    expect((b.minY + b.maksY) / 2).toBeCloseTo(10);
  });

  it('skalerer gruppen om midten med like proporsjoner', () => {
    const { benk, a } = benkMedTo();
    const f = utvalgsboks(valgte(benk))!;
    const bredde0 = f.maksX - f.minX;
    skalerUtvalgTil(benk, bredde0 * 2, null, true);
    const e = utvalgsboks(valgte(benk))!;
    expect(e.maksX - e.minX).toBeCloseTo(bredde0 * 2);
    expect(e.maksY - e.minY).toBeCloseTo((f.maksY - f.minY) * 2);
    expect((e.minX + e.maksX) / 2).toBeCloseTo(0);
    const a1 = benk.dok.objekter[a.id]!;
    expect(a1.transform.x).toBeCloseTo(-40);
  });

  it('en roterende gruppe skaleres bare jevnt', () => {
    const { benk } = benkMedTo();
    benk.velg({ objekter: [benk.tilstand.utvalg.objekter[0]!] });
    roterUtvalgTil(benk, 30);
    const o = valgte(benk)[0]!;
    expect(o.transform.rotasjon).toBeCloseTo(30);
    const b0 = utvalgsboks([o])!;
    skalerUtvalgTil(benk, (b0.maksX - b0.minX) * 2, null, false);
    const b1 = utvalgsboks(valgte(benk))!;
    expect((b1.maksY - b1.minY) / (b0.maksY - b0.minY)).toBeCloseTo(2, 3);
  });
});
