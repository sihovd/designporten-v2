import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tomtDokument } from './dokument';
import { autolagre, hentAutolagret, merkBrukt, ryddGjestelagring } from './lagring';

const DAG = 24 * 60 * 60 * 1000;
const NA = Date.UTC(2026, 9, 7);

function lagring(): Map<string, string> {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  return data;
}

const dok = () =>
  tomtDokument('signgen', 'Mitt skilt', { bredde: 256, dybde: 256, hoyde: 250, printerProfilId: 'x' });

describe('Guest storage: one project, deleted after a month unused', () => {
  let data: Map<string, string>;
  beforeEach(() => {
    data = lagring();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('does nothing when nothing is saved', () => {
    expect(ryddGjestelagring('signgen', 30, NA)).toEqual({ utfall: 'ingen', dagerUbrukt: 0 });
  });

  it('keeps a project used within the limit and renews its time', () => {
    autolagre(dok());
    merkBrukt('signgen', NA - 20 * DAG);
    expect(ryddGjestelagring('signgen', 30, NA)).toEqual({ utfall: 'beholdt', dagerUbrukt: 20 });
    expect(Number(data.get('dp-verksted:signgen:sist-brukt'))).toBe(NA);
    // renewed: ten days later it is only ten days old
    expect(ryddGjestelagring('signgen', 30, NA + 10 * DAG).dagerUbrukt).toBe(10);
    expect(hentAutolagret('signgen')).not.toBeNull();
  });

  it('deletes a project that has not been opened for more than the limit', () => {
    autolagre(dok());
    merkBrukt('signgen', NA - 31 * DAG);
    expect(ryddGjestelagring('signgen', 30, NA)).toEqual({ utfall: 'slettet', dagerUbrukt: 31 });
    expect(hentAutolagret('signgen')).toBeNull();
    expect(data.has('dp-verksted:signgen:sist-brukt')).toBe(false);
  });

  it('exactly at the limit is kept', () => {
    autolagre(dok());
    merkBrukt('signgen', NA - 30 * DAG);
    expect(ryddGjestelagring('signgen', 30, NA).utfall).toBe('beholdt');
  });

  it('never deletes because of a missing, broken or future time', () => {
    autolagre(dok());
    data.delete('dp-verksted:signgen:sist-brukt');
    expect(ryddGjestelagring('signgen', 30, NA).utfall).toBe('beholdt');
    data.set('dp-verksted:signgen:sist-brukt', 'ikke et tall');
    expect(ryddGjestelagring('signgen', 30, NA).utfall).toBe('beholdt');
    data.set('dp-verksted:signgen:sist-brukt', String(NA + 400 * DAG));
    expect(ryddGjestelagring('signgen', 30, NA).utfall).toBe('beholdt');
    expect(hentAutolagret('signgen')).not.toBeNull();
  });

  it('an autosave counts as use, and other tools are left alone', () => {
    autolagre(dok());
    expect(Number(data.get('dp-verksted:signgen:sist-brukt'))).toBeGreaterThan(0);
    data.set('dp-verksted:lampe', data.get('dp-verksted:signgen')!);
    data.set('dp-verksted:lampe:sist-brukt', String(NA - 90 * DAG));
    merkBrukt('signgen', NA - 31 * DAG);
    ryddGjestelagring('signgen', 30, NA);
    expect(data.has('dp-verksted:lampe')).toBe(true);
  });

  it('survives storage that throws', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('nei');
      },
      setItem: () => {
        throw new Error('nei');
      },
      removeItem: () => {
        throw new Error('nei');
      },
    };
    expect(ryddGjestelagring('signgen', 30, NA)).toEqual({ utfall: 'ingen', dagerUbrukt: 0 });
  });
});
