import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { areal, regionFraRinger, trianguler, trianguleringVaktet, type Flate, type Region } from './polygon';
import { ekstruder, triangulerSikkert } from './ekstruder';
import { sjekkManifold } from './mesh';
import { lastFont, settFontHenter, tekstTilRinger } from './tekst';
import type { Profil } from '../core/profil';

/**
 * Sign Forge stood still on «Bygger 3D-modellen … 45 %» (Sivert, 2026-11-09): clipper2-ts' triangulator
 * looped for ever on one step face of Pacifico «Sivert Hovde» (8 mm, sharp corners, a few tenths of a millimetre inset).
 * The guard in polygon.ts stops that loop. Each test checks the guard first, so a missing guard fails the
 * test instead of hanging the run.
 */

let tekst: Region;

beforeAll(async () => {
  settFontHenter(async (fil) => {
    const b = await readFile(path.resolve('public/skaperverksted/fonter', fil));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
  const font = await lastFont('pacifico-400');
  const r = tekstTilRinger(font, {
    type: 'tekst',
    tekst: 'Sivert Hovde',
    fontId: 'pacifico-400',
    storrelse: 8,
    sperring: 0,
    linjeavstand: 1.2,
    justering: 'midt',
  });
  tekst = regionFraRinger(r.ringer, 'nonzero');
});

const flateAreal = (f: Flate) => areal([f]);
const trekantAreal = (t: { x: number; y: number }[][]) =>
  t.reduce(
    (s, [p, q, r]) => s + Math.abs((q!.x - p!.x) * (r!.y - p!.y) - (q!.y - p!.y) * (r!.x - p!.x)) / 2,
    0,
  );

describe('triangulering som går i ring', () => {
  it('vakten er på plass i trianguleringsbiblioteket', () => {
    expect(trianguleringVaktet).toBe(true);
  });

  it('stopper løkka på formen som hang, og earcut tar over', async () => {
    expect(trianguleringVaktet).toBe(true);
    const f = JSON.parse(
      await readFile(path.resolve('src/skaperverksted/geometri/testdata/triangulering-slynge.json'), 'utf8'),
    ) as Flate;
    const t0 = performance.now();
    expect(trianguler(f, true)).toBeNull();
    expect(trianguler(f, false)).toBeNull();
    const tris = triangulerSikkert(f);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(trekantAreal(tris)).toBeCloseTo(flateAreal(f), 4);
  });

  it('bygger laget med sideprofil ferdig og lukket', () => {
    expect(trianguleringVaktet).toBe(true);
    // two slabs, inset 0.40 mm and then 0.41 mm (round corners): the step face between them looped
    const profil: Profil = {
      type: 'egendefinert',
      bredde: 0.41,
      trinn: 3,
      punkter: [
        { u: 0.4 / 0.41, t: 0 },
        { u: 0.4 / 0.41, t: 0.5 },
        { u: 1, t: 0.5 },
        { u: 1, t: 1 },
      ],
    };
    const e = ekstruder(tekst, 0, 0.4, profil, 0.2, 'rund');
    expect(e.forbrukt).toBe(false);
    expect(sjekkManifold(e.mesh)).toEqual({ lukket: true, aapneKanter: 0, feilKanter: 0 });
    expect(e.toppZ).toBeCloseTo(0.4, 6);
  });
});
