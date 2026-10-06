import { describe, expect, it } from 'vitest';
import { settMinimert, finnGruppe, type Romspek } from './modell';
import { EGENDEFINERT, lesLager, panelReduser, skrivLager, standardLager, type RomKontekst } from './lager';

class Minne implements Storage {
  private d = new Map<string, string>();
  get length() {
    return this.d.size;
  }
  clear() {
    this.d.clear();
  }
  getItem(k: string) {
    return this.d.get(k) ?? null;
  }
  key(i: number) {
    return [...this.d.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.d.delete(k);
  }
  setItem(k: string, v: string) {
    this.d.set(k, v);
  }
}

const rom: Romspek[] = [
  {
    id: 'enkel',
    navn: 'Enkel',
    grupper: [
      { paneler: ['lag'], side: 'venstre' },
      { paneler: ['egenskaper'], side: 'hoyre' },
    ],
  },
  { id: 'design', navn: 'Design', grupper: [{ paneler: ['lag', 'egenskaper'], side: 'hoyre' }] },
];
const k: RomKontekst = { paneler: [{ id: 'lag' }, { id: 'egenskaper' }], rom };

describe('panellager', () => {
  it('starter i første arbeidsrom', () => {
    const l = standardLager(k);
    expect(l.rom).toBe('enkel');
    expect(l.oppsett.grupper).toHaveLength(2);
  });

  it('en manuell endring gjør arbeidsrommet egendefinert, en rolig endring gjør ikke det', () => {
    const l = standardLager(k);
    const g = finnGruppe(l.oppsett, 'lag')!;
    const rolig = panelReduser(l, { t: 'endre', f: (o) => settMinimert(o, g.id, true), rolig: true }, k);
    expect(rolig.rom).toBe('enkel');
    const endret = panelReduser(l, { t: 'endre', f: (o) => settMinimert(o, g.id, true) }, k);
    expect(endret.rom).toBe(EGENDEFINERT);
    expect(endret.egendefinert).toBe(endret.oppsett);
    expect(panelReduser(endret, { t: 'rom', id: 'design' }, k).oppsett.grupper).toHaveLength(1);
    expect(
      panelReduser(panelReduser(endret, { t: 'rom', id: 'design' }, k), { t: 'rom', id: EGENDEFINERT }, k)
        .oppsett,
    ).toBe(endret.oppsett);
  });

  it('lagrer, bruker og sletter egne arbeidsrom, men ikke med navn som er tatt', () => {
    let l = standardLager(k);
    l = panelReduser(l, { t: 'rom', id: 'design' }, k);
    l = panelReduser(l, { t: 'lagre', navn: 'Mitt' }, k);
    expect(l.rom).toBe('eget:Mitt');
    expect(panelReduser(l, { t: 'lagre', navn: 'design' }, k)).toBe(l);
    const tilbake = panelReduser(
      panelReduser(l, { t: 'rom', id: 'enkel' }, k),
      { t: 'rom', id: 'eget:Mitt' },
      k,
    );
    expect(tilbake.oppsett.grupper).toHaveLength(1);
    const slettet = panelReduser(l, { t: 'slett', navn: 'Mitt' }, k);
    expect(slettet.egne).toEqual([]);
    expect(slettet.rom).toBe(EGENDEFINERT);
  });

  it('tilbakestiller til beskrivelsen', () => {
    const l = standardLager(k);
    const endret = panelReduser(l, { t: 'endre', f: (o) => ({ ...o, grupper: [] }) }, k);
    const tilbake = panelReduser(endret, { t: 'tilbakestill' }, k);
    expect(tilbake.rom).toBe('enkel');
    expect(tilbake.oppsett.grupper).toHaveLength(2);
  });

  it('lagres og leses tilbake, og tåler ødelagt lager', () => {
    const lagring = new Minne();
    let l = panelReduser(standardLager(k), { t: 'rom', id: 'design' }, k);
    l = panelReduser(l, { t: 'lagre', navn: 'Mitt' }, k);
    skrivLager('signgen', l, lagring);
    expect(lesLager('signgen', k, lagring)).toEqual(l);
    lagring.setItem('dp-verksted:paneler:signgen', '{ikke json');
    expect(lesLager('signgen', k, lagring).rom).toBe('enkel');
    lagring.setItem(
      'dp-verksted:paneler:signgen',
      JSON.stringify({ versjon: 1, rom: 'borte', oppsett: 5, egne: 'x' }),
    );
    expect(lesLager('signgen', k, lagring).oppsett.grupper).toHaveLength(2);
    expect(lesLager('signgen', k, null).rom).toBe('enkel');
  });
});
