/**
 * Dragging in Sign Forge stays light (Sivert, 2026-11-10): the layers are settled when a drag ends, not
 * on every frame; outlines round text wait for the drag; boxes and holes do not join the whole sign.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument } from '../../core/dokument';
import { areal, regionBoks, unionAlle } from '../../geometri/polygon';
import { settFontHenter } from '../../geometri/tekst';
import plugin from './index';
import {
  leggTilLag,
  leggTilObjekt,
  nyForm,
  nyTekst,
  nyttLag,
  nyttObjekt,
  oppdaterObjekter,
} from './dokument';
import { erOye, lagRegion, lastFonter, modellBoks, omrissRegioner, verdensRegion } from './modell';

beforeAll(() => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
});

const venta = (ms: number) => new Promise((klar) => setTimeout(klar, ms));

/** A start sign with a second text in the text layer and a plate under it. */
async function skilt(): Promise<{ dok: Dokument; tekstId: string; lagId: string; plateLag: string }> {
  let d = plugin.nyttDokument();
  const tekstlag = d.lag[0]!;
  const plate = nyttLag('Plate', 'pla-grafitt', 2);
  d = leggTilLag(d, plate);
  d = { ...d, lag: [plate, ...d.lag.filter((l) => l.id !== plate.id)] };
  d = leggTilObjekt(d, nyttObjekt(plate.id, nyForm('rektangel', 140, 60), {}, 'Plate'));
  const ekstra = nyttObjekt(tekstlag.id, nyTekst('Hei', 8), { x: 0, y: 14 });
  d = leggTilObjekt(d, ekstra);
  await lastFonter(d);
  return { dok: d, tekstId: ekstra.id, lagId: tekstlag.id, plateLag: plate.id };
}

const flytt = (benk: Arbeidsbenk, id: string, x: number, y: number) =>
  benk.endre({
    navn: 'Flytt',
    slaSammen: 'flytt-dra',
    dra: true,
    anvend: (d) => oppdaterObjekter(d, [id], (o) => ({ ...o, transform: { ...o.transform, x, y } })),
  });

describe('Sign Forge: dra uten å regne hele skiltet på hvert bilde', () => {
  it('legger lagene på plass først når draget slippes, og angre går tilbake i ett steg', async () => {
    const { dok, tekstId } = await skilt();
    const benk = new Arbeidsbenk(plugin, dok);
    const normaliser = vi.spyOn(plugin, 'normaliser');
    const underveis = vi.spyOn(plugin, 'underveis');
    for (let i = 1; i <= 5; i++) flytt(benk, tekstId, i * 4, 14);
    expect(normaliser).not.toHaveBeenCalled();
    expect(underveis).toHaveBeenCalledWith(true);
    expect(benk.tilstand.drar).toBe(true);

    benk.avsluttSammenslaing();
    expect(normaliser).toHaveBeenCalledTimes(1);
    expect(underveis).toHaveBeenLastCalledWith(false);
    expect(benk.tilstand.drar).toBe(false);
    expect(benk.dok.objekter[tekstId]!.transform.x).toBe(20);

    benk.angre();
    expect(benk.dok.objekter[tekstId]!.transform.x).toBe(0);
    benk.gjorOm();
    expect(benk.dok.objekter[tekstId]!.transform.x).toBe(20);
    normaliser.mockRestore();
    underveis.mockRestore();
    benk.avslutt();
  });

  it('legger lagene på plass også når pekeren står stille en liten stund', async () => {
    const { dok, tekstId, lagId, plateLag } = await skilt();
    const benk = new Arbeidsbenk(plugin, dok);
    const zFor = benk.dok.lag.find((l) => l.id === lagId)!.zBunn;
    expect(zFor).toBeGreaterThan(0); // the text rests on the plate
    // drag the whole text layer off the plate: it should end up on the build plate
    const ider = benk.dok.rekkefolge[lagId]!;
    benk.endre({
      navn: 'Flytt',
      slaSammen: 'flytt-dra',
      dra: true,
      anvend: (d) =>
        oppdaterObjekter(d, ider, (o) => ({ ...o, transform: { ...o.transform, x: o.transform.x + 200 } })),
    });
    expect(benk.dok.lag.find((l) => l.id === lagId)!.zBunn).toBe(zFor);
    await venta(400);
    expect(benk.dok.lag.find((l) => l.id === lagId)!.zBunn).toBe(0);
    expect(benk.dok.lag.find((l) => l.id === plateLag)!.zBunn).toBe(0);
    void tekstId;
    benk.avslutt();
  });

  it('beholder omrisset rundt teksten mens den dras, og regner det ut på nytt når draget slutter', async () => {
    const { dok, tekstId, lagId } = await skilt();
    const benk = new Arbeidsbenk(plugin, dok);
    const for_ = omrissRegioner(benk.dok, lagId)!;
    flytt(benk, tekstId, 0, 40);
    const under = omrissRegioner(benk.dok, lagId)!;
    expect([...under.values()][0]).toBe([...for_.values()][0]);
    benk.avsluttSammenslaing();
    const etter = omrissRegioner(benk.dok, lagId)!;
    expect([...etter.values()][0]).not.toBe([...for_.values()][0]);
    expect(regionBoks([...etter.values()][0]!).maksY).toBeGreaterThan(
      regionBoks([...for_.values()][0]!).maksY + 20,
    );
    benk.avslutt();
  });

  it('en glidebryter (uten dra) får omrisset med en gang', async () => {
    const { dok, lagId } = await skilt();
    const benk = new Arbeidsbenk(plugin, dok);
    const lag = benk.dok.lag.find((l) => l.id === lagId)!;
    const for_ = areal([...omrissRegioner(benk.dok, lagId)!.values()][0]!);
    benk.endre({
      navn: 'Omriss: bredde',
      slaSammen: 'omriss-bredde',
      anvend: (d) => ({
        ...d,
        lag: d.lag.map((l) =>
          l.id === lag.id ? { ...l, omriss: l.omriss!.map((o) => ({ ...o, bredde: o.bredde + 2 })) } : l,
        ),
      }),
    });
    expect(areal([...omrissRegioner(benk.dok, lagId)!.values()][0]!)).toBeGreaterThan(for_);
    benk.avslutt();
  });
});

describe('Sign Forge: geometri uten å slå sammen hele skiltet', () => {
  it('slår bare sammen objekter i et lag som når hverandre, med samme resultat', async () => {
    let d = plugin.nyttDokument();
    const lag = nyttLag('Former', 'pla-grafitt', 2);
    d = leggTilLag(d, lag);
    const a = nyttObjekt(lag.id, nyForm('rektangel', 10, 10), { x: -40 });
    const b = nyttObjekt(lag.id, nyForm('ellipse', 12, 12), { x: 40 });
    const c = nyttObjekt(lag.id, nyForm('rektangel', 10, 10), { x: 45 }); // overlaps b
    for (const o of [a, b, c]) d = leggTilObjekt(d, o);
    await lastFonter(d);
    const r = lagRegion(d, lag.id)!;
    const fasit = unionAlle([a, b, c].map((o) => verdensRegion(o)!));
    expect(areal(r)).toBeCloseTo(areal(fasit), 3);
    expect(r).toHaveLength(2);
    expect(regionBoks(r)).toEqual(regionBoks(fasit));
  });

  it('gir samme boks for skiltet og samme hull/øye-valg som før', async () => {
    const { dok, lagId } = await skilt();
    let d = dok;
    const hull = nyttObjekt(lagId, nyForm('hull', 4, 4), { x: -60, y: 0 });
    const oye = nyttObjekt(lagId, nyForm('hull', 4, 4), { x: -90, y: 0 });
    d = leggTilObjekt(leggTilObjekt(d, hull), oye);
    expect(erOye(d, hull.id)).toBe(false);
    expect(erOye(d, oye.id)).toBe(true);
    const boks = modellBoks(d)!;
    expect(boks.minX).toBeCloseTo(-70, 1);
    expect(boks.maksX).toBeCloseTo(70, 1);
  });
});
