import { describe, expect, it } from 'vitest';
import { avgrensning, sjekkManifold, volum, type Mesh } from '../../geometri/mesh';
import { tomtDokument } from '../../core/dokument';
import { utviklingsbibliotek } from './utviklingsbibliotek';
import type { Skall } from './bibliotek';
import { byggDrage, soneFor } from './bygg';
import { hulromRadius, klaringFor, kontrollerLedd, leddMal, tappRadius } from './ledd';
import { tappOgArm } from './ledd-geometri';
import {
  katalog,
  lesParametre,
  standardParametre,
  LENGDE_MAKS,
  LENGDE_MIN,
  type DrageParametre,
} from './parametre';
import { lagSkjelett } from './skjelett';
import { drageKjerne as dragePlugin } from './kjerne';

type V = [number, number, number];

function punkt(m: Mesh, i: number): V {
  return [m.posisjoner[i * 3]!, m.posisjoner[i * 3 + 1]!, m.posisjoner[i * 3 + 2]!];
}

function sub(a: V, b: V): V {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: V, b: V): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V, b: V): V {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Closest distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
function avstandTrekant(p: V, a: V, b: V, c: V): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  const naer = (q: V) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const langs = (o: V, v: V, t: number): V => [o[0] + v[0] * t, o[1] + v[1] * t, o[2] + v[2] * t];
  if (d1 <= 0 && d2 <= 0) return naer(a);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return naer(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return naer(langs(a, ab, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return naer(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return naer(langs(a, ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return naer(langs(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return naer([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

/** Ray-parity inside test against a closed mesh (skewed ray avoids edges). */
function inni(p: V, m: Mesh): boolean {
  const dir: V = [0.5773, 0.5779, 0.5769];
  let treff = 0;
  const t = m.indekser;
  for (let i = 0; i < t.length; i += 3) {
    const a = punkt(m, t[i]!);
    const b = punkt(m, t[i + 1]!);
    const c = punkt(m, t[i + 2]!);
    const e1 = sub(b, a);
    const e2 = sub(c, a);
    const h = cross(dir, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const s = sub(p, a);
    const u = f * dot(s, h);
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1);
    const v = f * dot(dir, q);
    if (v < 0 || u + v > 1) continue;
    if (f * dot(e2, q) > 1e-9) treff++;
  }
  return treff % 2 === 1;
}

const bokser = new WeakMap<Mesh, ReturnType<typeof avgrensning>>();
function iBoks(p: V, m: Mesh, margin: number): boolean {
  let b = bokser.get(m);
  if (!b) {
    b = avgrensning(m);
    bokser.set(m, b);
  }
  return [0, 1, 2].every((k) => p[k]! >= b.min[k]! - margin && p[k]! <= b.maks[k]! + margin);
}

/** Smallest gap between two articulated pieces (vertex to surface, both ways). */
function minsteAvstand(a: Skall[], b: Skall[], margin: number): { avstand: number; inni: boolean } {
  let avstand = Infinity;
  let inne = false;
  for (const [fra, til] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const s of fra) {
      const n = s.mesh.posisjoner.length / 3;
      for (let i = 0; i < n; i++) {
        const p = punkt(s.mesh, i);
        for (const t of til) {
          if (!iBoks(p, t.mesh, margin)) continue;
          if (inni(p, t.mesh)) inne = true;
          const ix = t.mesh.indekser;
          for (let k = 0; k < ix.length; k += 3) {
            avstand = Math.min(
              avstand,
              avstandTrekant(p, punkt(t.mesh, ix[k]!), punkt(t.mesh, ix[k + 1]!), punkt(t.mesh, ix[k + 2]!)),
            );
          }
        }
      }
    }
  }
  return { avstand, inni: inne };
}

function alleSkall(p: DrageParametre): Skall[] {
  const sk = lagSkjelett(p);
  const skall = [...utviklingsbibliotek.byggDeler(sk, p)];
  for (const d of sk.deler) {
    if (!d.tapp) continue;
    for (const mesh of tappOgArm(d.tapp.jx, d.tapp.tilX, sk.mal))
      skall.push({ mesh, type: 'ledd', del: d.indeks });
  }
  return skall;
}

function sjekkKlaring(p: DrageParametre): void {
  const skall = alleSkall(p);
  const mal = leddMal(p.lengde);
  const perDel = new Map<number, Skall[]>();
  for (const s of skall) perDel.set(s.del, [...(perDel.get(s.del) ?? []), s]);
  const ider = [...perDel.keys()];
  for (let i = 0; i < ider.length; i++) {
    for (let j = i + 1; j < ider.length; j++) {
      const r = minsteAvstand(perDel.get(ider[i]!)!, perDel.get(ider[j]!)!, mal.klaring * 2);
      expect(r.inni, `del ${ider[i]} og ${ider[j]} overlapper`).toBe(false);
      expect(r.avstand, `klaring mellom del ${ider[i]} og ${ider[j]}`).toBeGreaterThanOrEqual(
        mal.klaring * 0.95,
      );
    }
  }
}

const mange: Partial<DrageParametre>[] = [
  {},
  { kropp: 'slank', hode: 'lang', horn: 'buede', pigger: 'plater', vinger: 'flaggermus', hale: 'spiss' },
  { kropp: 'lang', hode: 'bred', horn: 'lange', pigger: 'runde', vinger: 'store', hale: 'kolle' },
  {
    vinger: 'ingen',
    horn: 'ingen',
    pigger: 'ingen',
    detaljer: { oyne: 'sovende', bein: false, klor: false, vingeribber: false },
  },
];

describe('leddstandard', () => {
  it('klaringen vokser med størrelsen innenfor grensene', () => {
    expect(klaringFor(LENGDE_MIN)).toBeGreaterThanOrEqual(0.35);
    expect(klaringFor(LENGDE_MAKS)).toBeLessThanOrEqual(0.6);
    expect(klaringFor(200)).toBeGreaterThan(klaringFor(120));
  });

  it('holder sine egne krav i hele størrelsesområdet', () => {
    for (let l = LENGDE_MIN; l <= LENGDE_MAKS; l += 10) {
      const m = leddMal(l);
      expect(kontrollerLedd(m).feil).toEqual([]);
      // 45° faces: horizontal gap √2 × clearance gives the clearance normal to them.
      expect(hulromRadius(m, m.h / 2) - tappRadius(m, m.h / 2)).toBeCloseTo(m.klaring * Math.SQRT2);
      expect(m.hulromHoyde - m.h).toBeCloseTo(m.klaring);
      expect(m.bevegelse).toBeGreaterThan((20 * Math.PI) / 180);
    }
  });
});

describe('skjelett', () => {
  it('treffer valgt lengde og har ledd mellom alle deler', () => {
    for (const kropp of ['lubben', 'slank', 'lang'] as const) {
      for (const lengde of [LENGDE_MIN, 160, LENGDE_MAKS]) {
        const sk = lagSkjelett({ ...standardParametre, kropp, lengde });
        expect(sk.neseX - sk.haleX).toBeCloseTo(lengde, 1);
        expect(sk.deler[0]!.rolle).toBe('hode');
        sk.deler.forEach((d, i) => {
          expect(!!d.sokkel).toBe(i < sk.deler.length - 1);
          expect(!!d.tapp).toBe(i > 0);
        });
        expect(sk.deler.length).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

describe('byggDrage', () => {
  it('alle skall er lukkede og vender utover', () => {
    for (const valg of mange) {
      const p = lesParametre({ ...standardParametre, ...valg });
      for (const s of alleSkall(p)) {
        const m = sjekkManifold(s.mesh);
        expect(m, `${s.type} i del ${s.del}`).toEqual({ lukket: true, aapneKanter: 0, feilKanter: 0 });
        expect(volum(s.mesh), `${s.type} i del ${s.del}`).toBeGreaterThan(0);
        expect(avgrensning(s.mesh).min[2]).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });

  it('delene som beveger seg har klaring i utskriftsstillingen', () => {
    for (const valg of mange) sjekkKlaring(lesParametre({ ...standardParametre, ...valg }));
    sjekkKlaring(lesParametre({ ...standardParametre, lengde: LENGDE_MIN }));
    sjekkKlaring(lesParametre({ ...standardParametre, ...mange[2], lengde: LENGDE_MAKS }));
  }, 120_000);

  it('gir én del per ledd og farge, sentrert og innenfor platen', () => {
    const r = byggDrage(standardParametre, utviklingsbibliotek);
    const sk = r.info.skjelett;
    expect(new Set(r.deler.map((d) => d.id.split('-')[1])).size).toBe(sk.deler.length);
    for (const d of r.deler) expect(sjekkManifold(d.mesh).lukket).toBe(true);
    const [x, y] = r.info.storrelse;
    expect(x).toBeCloseTo(160, 0);
    expect(x).toBeLessThanOrEqual(256);
    expect(y).toBeLessThanOrEqual(256);
    expect(r.advarsler.some((a) => a.niva === 'info')).toBe(true);
    expect(r.advarsler.filter((a) => a.niva !== 'info')).toEqual([]);
    expect(r.info.materialer.sort()).toEqual(Object.values(standardParametre.farger).sort());
  });

  it('er deterministisk', () => {
    const a = byggDrage(standardParametre, utviklingsbibliotek);
    const b = byggDrage(standardParametre, utviklingsbibliotek);
    expect(a.deler.map((d) => Array.from(d.mesh.posisjoner.slice(0, 30)))).toEqual(
      b.deler.map((d) => Array.from(d.mesh.posisjoner.slice(0, 30))),
    );
  });

  it('bygger alle varianter i katalogen', () => {
    const kategorier = ['kropp', 'hode', 'horn', 'pigger', 'hale', 'vinger', 'monster'] as const;
    for (const k of kategorier) {
      for (const v of katalog[k]) {
        const r = byggDrage(lesParametre({ ...standardParametre, [k]: v.id }), utviklingsbibliotek);
        expect(r.deler.length).toBeGreaterThan(0);
        expect(r.advarsler.filter((a) => a.niva === 'feil')).toEqual([]);
      }
    }
  });

  it('fargemønster styrer sonene', () => {
    const sk = lagSkjelett(standardParametre);
    const hode = sk.deler[0]!;
    const kropp2 = sk.deler[2]!;
    expect(soneFor('pigg', kropp2, 'rygg')).toBe('aksent');
    expect(soneFor('pigg', kropp2, 'ensfarget')).toBe('kropp');
    expect(soneFor('kropp', kropp2, 'striper')).toBe('aksent');
    expect(soneFor('kropp', hode, 'striper')).toBe('kropp');
    expect(soneFor('oye', hode, 'ensfarget')).toBe('oyne');
  });
});

describe('parametre', () => {
  it('fyller inn standardverdier og håndhever grensene', () => {
    expect(lesParametre(undefined)).toEqual(standardParametre);
    const p = lesParametre({
      lengde: 9999,
      hode: 'ukjent',
      farger: { kropp: 'finnes-ikke' },
      detaljer: { bein: false },
    });
    expect(p.lengde).toBe(LENGDE_MAKS);
    expect(p.hode).toBe(standardParametre.hode);
    expect(p.farger.kropp).toBe(standardParametre.farger.kropp);
    expect(p.detaljer.bein).toBe(false);
    expect(lesParametre({ lengde: 10 }).lengde).toBe(LENGDE_MIN);
    expect(lesParametre({ lengde: Number.NaN }).lengde).toBe(standardParametre.lengde);
  });
});

describe('plugin', () => {
  it('lager et dokument og bygger det', async () => {
    const dok = dragePlugin.nyttDokument();
    expect(dok.generator).toBe('drage');
    expect(lesParametre(dok.parametre)).toEqual(standardParametre);
    const r = await dragePlugin.byggModell(dok);
    expect(r.deler.length).toBeGreaterThan(10);
    const tomt = await dragePlugin.byggModell(tomtDokument('drage', 'x', dok.plate));
    expect(tomt.deler.length).toBeGreaterThan(0);
  });
});
