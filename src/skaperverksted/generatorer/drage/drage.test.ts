import { describe, expect, it } from 'vitest';
import { avgrensning, sjekkManifold, volum } from '../../geometri/mesh';
import { minsteAvstand } from './testgeometri';
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

describe('handlinger', () => {
  it('endrer parametre gjennom historikken og kan angres', async () => {
    const { Arbeidsbenk } = await import('../../core/arbeidsbenk');
    const { endreDrage, parametre } = await import('./handlinger');
    const benk = new Arbeidsbenk(
      { ...dragePlugin, ui: { Inspektor: () => null } },
      dragePlugin.nyttDokument(),
    );
    endreDrage(benk, 'Vinger: Store', (p) => ({ ...p, vinger: 'store' }));
    expect(parametre(benk).vinger).toBe('store');
    // A change that only produces invalid values is clamped, not stored raw.
    endreDrage(benk, 'Endre lengde', (p) => ({ ...p, lengde: 5000 }));
    expect(parametre(benk).lengde).toBe(LENGDE_MAKS);
    benk.angre();
    benk.angre();
    expect(parametre(benk)).toEqual(standardParametre);
    benk.avslutt();
  });

  it('bestilling beskriver valgene uten pris', async () => {
    const dok = dragePlugin.nyttDokument();
    const modell = await dragePlugin.byggModell(dok);
    const b = dragePlugin.bestilling!(dok, modell);
    expect(b.produktId).toBe('skaperverksted-drage');
    expect(b.valg.Lengde).toBe('160 mm');
    expect(b.valg.Vinger).toBe('Små');
    expect(JSON.stringify(b)).not.toMatch(/\bkr\b|pris|nok/i);
  });
});
