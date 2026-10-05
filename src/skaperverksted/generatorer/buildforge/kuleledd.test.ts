import { describe, expect, it } from 'vitest';
import { sjekkManifold, volum } from '../../geometri/mesh';
import { byggBuildforge } from './bygg';
import {
  byttKjonn,
  forbindelserAv,
  forbindelseVed,
  leggTilKobling,
  leggTilOgKoble,
  plasser,
  settBoy,
  settLeddtype,
  slettKobling,
  finnKobling,
  koblingIVerden,
  finnKropp,
} from './graf';
import { finnKroppsmal, lagKropp, modulprosjekt } from './kroppsbibliotek';
import { KULELEDD_PROVE, kuleMesh, kulemal, sjekkKuleprofil, sokkelMesh } from './ledd';
import { tolkParametre, type BuildforgeParametre } from './parametre';

/** A human body with a round head on the neck, as a ball joint when `kule`. */
function medHode(kule: boolean) {
  let p = modulprosjekt('menneske');
  const rot = p.rot!;
  const hode = lagKropp(finnKroppsmal('hode-rund')!);
  const r = leggTilOgKoble(p, hode, 'hals', { kropp: rot, kobling: 'hals' });
  if (!r.ok) throw new Error(r.grunn);
  p = r.p;
  const f = forbindelserAv(p)[0]!;
  if (kule) p = settLeddtype(p, f.id, 'kule');
  return { p, rot, hode: hode.kropp.id, f: f.id };
}

const tekst = (p: BuildforgeParametre) => {
  const r = byggBuildforge(p);
  return {
    r,
    t: `${r.kontroll.status}: ${r.kontroll.funn.map((f) => `${f.regel} ${f.tittel}`).join(' | ')}`,
  };
};

describe('kuleledd', () => {
  it('prøveprofilen henger sammen, og kula er større enn åpningen', () => {
    expect(sjekkKuleprofil(KULELEDD_PROVE)).toEqual([]);
    expect(KULELEDD_PROVE.fysiskStatus).toBe('ikke-testet');
    const k = kulemal(KULELEDD_PROVE);
    expect(KULELEDD_PROVE.maal.apningDiameter.verdi / 2).toBeLessThan(k.kuleRadius);
    expect(k.grenseBoy).toBeGreaterThan(k.maksBoy);
    expect(
      sjekkKuleprofil({
        ...KULELEDD_PROVE,
        maal: { ...KULELEDD_PROVE.maal, maksBoy: { ...KULELEDD_PROVE.maal.maksBoy, verdi: 40 } },
      }),
    ).not.toEqual([]);
  });

  it('kule og sokkel er lukkede skall med positivt volum', () => {
    const k = kulemal(KULELEDD_PROVE);
    for (const m of [kuleMesh(k), sokkelMesh(k)]) {
      expect(sjekkManifold(m).lukket).toBe(true);
      expect(volum(m)).toBeGreaterThan(0);
    }
  });

  it('bytter leddtype på en forbindelse og bygger grønt med kule og sokkel', { timeout: 30_000 }, () => {
    const { p, f } = medHode(true);
    const fb = forbindelserAv(p).find((x) => x.id === f)!;
    expect(finnKobling(p, fb.a)!.familie).toBe('kule');
    expect(finnKobling(p, fb.b)!.familie).toBe('kule');
    expect(p.kuleprofil).toEqual({ id: KULELEDD_PROVE.id, versjon: KULELEDD_PROVE.versjon });
    expect(tolkParametre(p).ok).toBe(true);
    const { r, t } = tekst(p);
    expect(r.kontroll.status, t).toBe('gronn');
    expect(r.kontroll.kuleprofil?.id).toBe(KULELEDD_PROVE.id);
    for (const d of r.deler) expect(sjekkManifold(d.mesh).lukket, d.navn).toBe(true);
  });

  it('bøyer hodet om kulas senter, innenfor største bøy', { timeout: 30_000 }, () => {
    const { p, hode, f, rot } = medHode(true);
    const rett = plasser(p).get(hode)!;
    const q = settBoy(p, f, 20, 0);
    const boyd = plasser(q).get(hode)!;
    // the head turned 20° (the angle between its z axes)
    const cos = rett.m[2]! * boyd.m[2]! + rett.m[5]! * boyd.m[5]! + rett.m[8]! * boyd.m[8]!;
    expect((Math.acos(Math.min(1, cos)) * 180) / Math.PI).toBeCloseTo(20, 3);
    // the connector points still meet, offset only by the ball's turn
    const rk = finnKropp(q, rot)!.koblinger.find((x) => x.id === 'hals')!;
    expect(koblingIVerden(plasser(q).get(rot)!, rk).punkt).toBeDefined();
    const { r, t } = tekst(q);
    expect(r.kontroll.status, t).not.toBe('rod');
    // clamped to the profile's largest bend
    expect(forbindelserAv(settBoy(p, f, 80, 0))[0]!.boy).toBe(kulemal(KULELEDD_PROVE).maksBoy);
  });

  it('en lagret bøy over grensen gir rødt', () => {
    const { p, f } = medHode(true);
    const q = {
      ...p,
      forbindelser: forbindelserAv(p).map((x) => (x.id === f ? { ...x, boy: 60 } : x)),
    };
    expect(tekst(q).r.kontroll.funn.some((x) => x.regel === 'BF-KULE-01')).toBe(true);
  });

  it('en ny del fra biblioteket tar leddtypen den møter', () => {
    let p = modulprosjekt('menneske');
    const rot = p.rot!;
    const r0 = leggTilKobling(p, rot, {
      kjonn: 'hann',
      familie: 'kule',
      posisjon: [0, 0, 60],
      akse: [0, 0, 1],
    });
    expect(r0.ok).toBe(true);
    if (!r0.ok) return;
    p = r0.p;
    expect(p.kuleprofil?.id).toBe(KULELEDD_PROVE.id);
    const hode = lagKropp(finnKroppsmal('hode-rund')!);
    const r = leggTilOgKoble(p, hode, 'hals', { kropp: rot, kobling: r0.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(finnKobling(r.p, { kropp: hode.kropp.id, kobling: 'hals' })!.familie).toBe('kule');
  });

  it('bytter kjønn ved å koble fra først, og sletter en kobling uten å røre andre deler', () => {
    const { p, rot, hode } = medHode(false);
    const r = byttKjonn(p, { kropp: rot, kobling: 'hals' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(forbindelseVed(r.p, { kropp: rot, kobling: 'hals' })).toBeUndefined();
    // the head is untouched
    expect(finnKropp(r.p, hode)!.koblinger).toEqual(finnKropp(p, hode)!.koblinger);
    const s = slettKobling(p, { kropp: rot, kobling: 'hals' });
    expect(s.ok && finnKropp(s.p, rot)!.koblinger.some((x) => x.id === 'hals')).toBe(false);
    expect(s.ok && finnKropp(s.p, hode)).toBeTruthy();
  });
});
