import { describe, expect, it } from 'vitest';
import {
  apnePanel,
  byggOppsett,
  dokkGrupper,
  erApen,
  finnGruppe,
  flyttGruppeTilDokk,
  flyttGruppeTilFlyt,
  klemFlyt,
  losneFane,
  loft,
  lukkPanel,
  normaliser,
  settAktiv,
  settDokkB,
  settFlyt,
  settMinimert,
  slaaSammen,
  type Romspek,
} from './modell';

const paneler = [
  { id: 'lag' },
  { id: 'egenskaper' },
  { id: 'historikk', flytB: 260, flytH: 300 },
  { id: 'produksjon' },
];
const rom: Romspek = {
  id: 'design',
  navn: 'Design',
  grupper: [
    { paneler: ['lag'], side: 'venstre' },
    { paneler: ['egenskaper'], side: 'hoyre' },
    { paneler: ['historikk'], flyt: { x: 50, y: 60 } },
  ],
};
const ids = paneler.map((p) => p.id);

describe('byggOppsett', () => {
  it('plasserer paneler etter beskrivelsen og lukker resten', () => {
    const o = byggOppsett(rom, paneler);
    expect(o.grupper).toHaveLength(3);
    expect(dokkGrupper(o, 'venstre').map((g) => g.paneler)).toEqual([['lag']]);
    expect(finnGruppe(o, 'historikk')?.plass).toEqual({ type: 'flyt', x: 50, y: 60, b: 260, h: 300 });
    expect(o.lukket).toEqual(['produksjon']);
  });

  it('hopper over ukjente paneler og panel som står to ganger', () => {
    const o = byggOppsett(
      {
        id: 'x',
        navn: 'X',
        grupper: [{ paneler: ['finnes-ikke', 'lag'] }, { paneler: ['lag', 'egenskaper'] }],
      },
      paneler,
    );
    expect(o.grupper.map((g) => g.paneler)).toEqual([['lag'], ['egenskaper']]);
  });
});

describe('endringer', () => {
  const o = byggOppsett(rom, paneler);

  it('lukker og åpner et panel igjen', () => {
    const lukket = lukkPanel(o, 'lag');
    expect(erApen(lukket, 'lag')).toBe(false);
    expect(lukket.lukket).toContain('lag');
    const apnet = apnePanel(lukket, 'lag', { type: 'dokk', side: 'hoyre' });
    expect(erApen(apnet, 'lag')).toBe(true);
    expect(apnet.lukket).not.toContain('lag');
    expect(finnGruppe(apnet, 'lag')?.plass).toEqual({ type: 'dokk', side: 'hoyre' });
  });

  it('slår sammen til faner og løsner en fane igjen', () => {
    const lag = finnGruppe(o, 'lag')!;
    const egen = finnGruppe(o, 'egenskaper')!;
    const faner = slaaSammen(o, egen.id, lag.id);
    expect(finnGruppe(faner, 'lag')?.paneler).toEqual(['lag', 'egenskaper']);
    expect(finnGruppe(faner, 'lag')?.aktiv).toBe('egenskaper');
    expect(faner.grupper).toHaveLength(2);
    const los = losneFane(faner, 'egenskaper')!;
    expect(finnGruppe(los.oppsett, 'lag')?.paneler).toEqual(['lag']);
    expect(finnGruppe(los.oppsett, 'egenskaper')?.id).toBe(los.gruppeId);
    expect(los.oppsett.grupper).toHaveLength(3);
  });

  it('løsner ikke en enkeltstående fane', () => {
    const g = finnGruppe(o, 'lag')!;
    expect(losneFane(o, 'lag')).toEqual({ oppsett: o, gruppeId: g.id });
  });

  it('setter en gruppe inn i dokken på riktig plass', () => {
    const hist = finnGruppe(o, 'historikk')!;
    const forst = flyttGruppeTilDokk(o, hist.id, 'hoyre', 0);
    expect(dokkGrupper(forst, 'hoyre').map((g) => g.paneler[0])).toEqual(['historikk', 'egenskaper']);
    const sist = flyttGruppeTilDokk(o, hist.id, 'hoyre');
    expect(dokkGrupper(sist, 'hoyre').map((g) => g.paneler[0])).toEqual(['egenskaper', 'historikk']);
    const tom = flyttGruppeTilDokk(o, hist.id, 'venstre', 5);
    expect(dokkGrupper(tom, 'venstre').map((g) => g.paneler[0])).toEqual(['lag', 'historikk']);
  });

  it('flytter en dokket gruppe ut som flytende og løfter den øverst', () => {
    const lag = finnGruppe(o, 'lag')!;
    const flyt = flyttGruppeTilFlyt(o, lag.id, { x: 10, y: 20 });
    expect(flyt.grupper.at(-1)?.id).toBe(lag.id);
    expect(flyt.grupper.at(-1)?.plass).toEqual({ type: 'flyt', x: 10, y: 20, b: 320, h: 360 });
    const hist = finnGruppe(o, 'historikk')!;
    expect(loft(flyt, hist.id).grupper.at(-1)?.id).toBe(hist.id);
  });

  it('minimerer, bytter fane og endrer størrelser innenfor grensene', () => {
    const lag = finnGruppe(o, 'lag')!;
    expect(finnGruppe(settMinimert(o, lag.id, true), 'lag')?.minimert).toBe(true);
    expect(settAktiv(o, lag.id, 'finnes-ikke')).toBe(o);
    expect(settDokkB(o, 'venstre', 10).dokkB.venstre).toBe(220);
    expect(settDokkB(o, 'venstre', 9999).dokkB.venstre).toBe(560);
    const hist = finnGruppe(o, 'historikk')!;
    const st = settFlyt(o, hist.id, { b: 20, h: 20 });
    expect(finnGruppe(st, 'historikk')?.plass).toMatchObject({ b: 200, h: 120 });
    expect(settFlyt(o, lag.id, { x: 5 })).toBe(o);
  });

  it('holder flytende paneler inne i arbeidsflaten', () => {
    expect(klemFlyt({ x: 2000, y: 2000, b: 320, h: 360 }, 800, 600)).toMatchObject({ x: 680, y: 566 });
    expect(klemFlyt({ x: -50, y: -9, b: 900, h: 900 }, 400, 300)).toEqual({ x: 0, y: 0, b: 392, h: 292 });
  });
});

describe('normaliser', () => {
  const reserve = byggOppsett(rom, paneler);

  it('gir reserven når innholdet er ubrukelig', () => {
    expect(normaliser(null, ids, reserve)).toBe(reserve);
    expect(normaliser({ versjon: 7 }, ids, reserve)).toBe(reserve);
    expect(normaliser('tull', ids, reserve)).toBe(reserve);
  });

  it('fjerner ukjente paneler og reparerer verdier', () => {
    const o = normaliser(
      {
        versjon: 1,
        grupper: [
          {
            id: 'a',
            paneler: ['lag', 'borte'],
            aktiv: 'borte',
            plass: { type: 'flyt', x: 'x', y: 5, b: 1, h: 1 },
          },
          { id: 'a', paneler: ['lag', 'egenskaper'], plass: { type: 'dokk', side: 'venstre' } },
          { paneler: ['borte'] },
        ],
        dokkB: { venstre: 5, hoyre: 'bred' },
        lukket: ['historikk', 'borte'],
      },
      ids,
      reserve,
    );
    expect(o.grupper.map((g) => g.paneler)).toEqual([['lag'], ['egenskaper']]);
    expect(o.grupper[0]!.aktiv).toBe('lag');
    expect(o.grupper[0]!.plass).toEqual({ type: 'flyt', x: 40, y: 5, b: 200, h: 120 });
    expect(new Set(o.grupper.map((g) => g.id)).size).toBe(2);
    expect(o.dokkB).toEqual({ venstre: 220, hoyre: 296 });
    expect(o.lukket).toContain('historikk');
  });

  it('legger nye paneler dit reserven har dem', () => {
    const gammel = {
      ...reserve,
      grupper: reserve.grupper.filter((g) => !g.paneler.includes('historikk')),
      lukket: [],
    };
    const o = normaliser(gammel, ids, reserve);
    expect(finnGruppe(o, 'historikk')?.plass.type).toBe('flyt');
    expect(o.lukket).toEqual(['produksjon']);
  });
});
