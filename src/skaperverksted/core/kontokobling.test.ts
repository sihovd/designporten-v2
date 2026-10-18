import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tomtDokument } from './dokument';
import { glemKontoprosjekt, harUlagret, hentKobling, settKobling } from './kontokobling';
import { hentReserve, leggTilSide } from './lagring';
import { betalingstekst, erApen, PLANER, PROSJEKTAPPER, TJENESTER } from '@/lib/konto/tjenester';

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

describe('Projects on the account: the link in the browser', () => {
  beforeEach(() => void lagring());
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('a project not saved on the account has no link and counts as unsaved', () => {
    const d = dok();
    expect(hentKobling(d)).toBeNull();
    expect(harUlagret(d)).toBe(true);
  });

  it('remembers the account project and revision per document, and sees later changes', () => {
    const d = dok();
    settKobling(d, { id: 'a'.repeat(16), app: 'signgen', revisjon: 3 });
    expect(hentKobling(d)).toMatchObject({ id: 'a'.repeat(16), revisjon: 3 });
    expect(harUlagret(d)).toBe(false);
    const endret = { ...d, meta: { ...d.meta, endret: new Date(Date.now() + 1000).toISOString() } };
    expect(harUlagret(endret)).toBe(true);
    // another document (another project in the browser) is not linked
    expect(hentKobling(dok())).toBeNull();
  });

  it('a link made in another tool does not apply', () => {
    const d = dok();
    settKobling(d, { id: 'b'.repeat(16), app: 'lampe', revisjon: 1 });
    expect(hentKobling(d)).toBeNull();
  });

  it('forgets every link to a deleted account project', () => {
    const d = dok();
    settKobling(d, { id: 'c'.repeat(16), app: 'signgen', revisjon: 1 });
    glemKontoprosjekt('c'.repeat(16));
    expect(hentKobling(d)).toBeNull();
  });

  it('puts work aside before another project is opened in its place', () => {
    expect(leggTilSide('signgen', '{"navn":"Lokalt"}')).toBe(true);
    expect(hentReserve('signgen')).toBe('{"navn":"Lokalt"}');
  });

  it('tolerates storage being unavailable', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    const d = dok();
    expect(() => settKobling(d, { id: 'd'.repeat(16), app: 'signgen', revisjon: 1 })).not.toThrow();
    expect(hentKobling(d)).toBeNull();
  });
});

describe('Services and packages (tjenester.json)', () => {
  it('CSV belongs to a paid package but stays open to everyone in the free period', () => {
    expect(TJENESTER.csv.betaling).toBe('betalt');
    expect(TJENESTER.csv.gratisperiode?.apenFor).toBe('alle');
    expect(erApen('csv')).toBe(true);
    expect(betalingstekst(TJENESTER.csv)).toBe('Gratis inntil videre');
  });

  it('a paid service without a free period is closed', () => {
    expect(betalingstekst({ betaling: 'betalt' })).toBe('Betalt');
  });

  it('the free account keeps five projects, and Sign Forge stores them', () => {
    expect(PLANER.gratis?.prosjekter).toBe(5);
    expect(PLANER.skaper?.prosjekter).toBe(50);
    expect(PLANER.skaper?.tjenester).toEqual(['csv']);
    expect(PROSJEKTAPPER.signgen).toBe('Sign Forge');
  });
});
