import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tilJson } from '../../core/dokument';
import { nyttSigngenDokument, parametre, settPalett } from './dokument';
import {
  brukMal,
  hentEgneMaler,
  innebygdeMaler,
  lagreMal,
  malopphavAv,
  MAKS_MALER,
  nyMalFraDokument,
  rensMal,
  slettMal,
  STANDARD_LISENS,
} from './maler';

function lagring(): void {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('Templates', () => {
  beforeEach(lagring);
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('keeps ownership, licence, price, credit and rights, privately by default', () => {
    const m = nyMalFraDokument(nyttSigngenDokument(), { navn: '  Min mal ' });
    expect(m).toMatchObject({
      navn: 'Min mal',
      synlighet: 'privat',
      lisens: STANDARD_LISENS,
      pris: null,
      skaper: '',
      kreditering: '',
      bruksrettigheter: '',
    });
    const k = nyMalFraDokument(
      nyttSigngenDokument(),
      {
        navn: 'Salg',
        synlighet: 'kommersiell',
        skaper: 'Sivert',
        pris: { belop: 49, valuta: 'NOK' },
        lisens: 'Kun utskrift',
      },
      'mal-1',
    );
    expect(k).toMatchObject({ eier: 'Sivert', pris: { belop: 49, valuta: 'NOK' }, lisens: 'Kun utskrift' });
    // a price only belongs to a commercial template
    expect(
      nyMalFraDokument(nyttSigngenDokument(), {
        navn: 'Gratis',
        synlighet: 'gratis',
        pris: { belop: 5, valuta: 'NOK' },
      }).pris,
    ).toBeNull();
  });

  it('a template is a copy: changing the sign afterwards does not change it', () => {
    const d = nyttSigngenDokument();
    const m = nyMalFraDokument(d, { navn: 'Kopi' });
    const for_ = tilJson(m.dokument);
    settPalett(d, ['pla-svart', 'pla-rust']);
    d.lag[0]!.navn = 'Endret';
    expect(tilJson(m.dokument)).toBe(for_);
    expect(m.dokument).not.toBe(d);
    expect(m.dokument.lag[0]).not.toBe(d.lag[0]);
  });

  it('using a template makes a new project and leaves the template alone', () => {
    const m = nyMalFraDokument(
      nyttSigngenDokument(),
      { navn: 'Dør', skaper: 'Sivert', kreditering: 'Design: Sivert' },
      'mal-d',
    );
    const for_ = JSON.stringify(m);
    const p = brukMal(m);
    expect(p.id).not.toBe(m.dokument.id);
    expect(p.navn).toBe('Dør');
    expect(parametre(p).startvalgt).toBe(true);
    expect(malopphavAv(p)).toMatchObject({ malId: 'mal-d', skaper: 'Sivert', kreditering: 'Design: Sivert' });
    p.lag[0]!.navn = 'Rotet i';
    p.objekter[Object.keys(p.objekter)[0]!]!.navn = 'Rotet i';
    expect(JSON.stringify(m)).toBe(for_);
    // a template made from a project that came from a template does not inherit the source
    expect(malopphavAv(nyMalFraDokument(p, { navn: 'Neste' }).dokument)).toBeNull();
  });

  it('stores templates in the browser, replaces by id and deletes', () => {
    const a = nyMalFraDokument(nyttSigngenDokument(), { navn: 'A' }, 'a');
    expect(lagreMal(a)).toEqual({ ok: true });
    expect(lagreMal({ ...a, navn: 'A2' })).toEqual({ ok: true });
    expect(hentEgneMaler().map((m) => m.navn)).toEqual(['A2']);
    slettMal('a');
    expect(hentEgneMaler()).toEqual([]);
  });

  it('says why a template cannot be saved', () => {
    const d = nyttSigngenDokument();
    for (let i = 0; i < MAKS_MALER; i++)
      expect(lagreMal(nyMalFraDokument(d, { navn: `M${i}` }, `m${i}`)).ok).toBe(true);
    expect(lagreMal(nyMalFraDokument(d, { navn: 'En for mye' }, 'ekstra'))).toEqual({
      ok: false,
      feil: 'full',
    });
    const stor = nyMalFraDokument(d, { navn: 'Stor', beskrivelse: 'x' });
    stor.dokument.parametre = { ...stor.dokument.parametre, fyll: 'x'.repeat(1_100_000) };
    slettMal('m0');
    expect(lagreMal(stor)).toEqual({ ok: false, feil: 'for-stor' });
  });

  it('ignores broken stored templates', () => {
    localStorage.setItem(
      'designporten:signgen:maler',
      JSON.stringify([{ id: 'x' }, null, 7, { id: 'y', navn: 'Y', dokument: { nei: 1 } }]),
    );
    expect(hentEgneMaler()).toEqual([]);
    expect(rensMal(nyMalFraDokument(nyttSigngenDokument(), { navn: 'Gyldig' }, 'g'))).not.toBeNull();
  });

  it('ships a starting template that opens without the start window', () => {
    const [m] = innebygdeMaler();
    expect(m).toMatchObject({ innebygd: true, eier: 'Designporten', pris: null });
    expect(parametre(brukMal(m!)).startvalgt).toBe(true);
  });
});
