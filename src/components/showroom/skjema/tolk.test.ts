import { describe, expect, it } from 'vitest';
import { tolkSkjema } from './tolk';

function skjema(felt: Record<string, string>, filer: File[] = []): FormData {
  const d = new FormData();
  for (const [k, v] of Object.entries(felt)) d.set(k, v);
  for (const f of filer) d.append('filer', f);
  return d;
}

const gyldig = {
  skjema: 'ide',
  beskrivelse: 'En holder til stiklinger',
  navn: 'Kari',
  epost: 'kari@example.no',
};

describe('tolkSkjema', () => {
  it('requires description, name and a valid e-mail', async () => {
    const r = await tolkSkjema(skjema({ skjema: 'ide', epost: 'feil' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.feil).sort()).toEqual(['beskrivelse', 'epost', 'navn']);
  });

  it('builds an idea submission with the chosen start and quantity', async () => {
    const r = await tolkSkjema(
      skjema({
        ...gyldig,
        start: 'del',
        antall: '2–10',
        kundetype: 'bedrift',
        firma: 'Firma AS',
        ingenHast: 'ja',
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const felt = Object.fromEntries(r.innsending.felter);
    expect(r.innsending.type).toBe('ide');
    expect(r.innsending.svarTil).toBe('kari@example.no');
    expect(felt['Utgangspunkt']).toBe('Jeg trenger en del');
    expect(felt['Antall']).toBe('2–10');
    expect(felt['Til når?']).toBe('Ingen hast');
    expect(felt['Privat eller bedrift']).toBe('Bedrift: Firma AS');
    expect(r.honningkrukke).toBe(false);
  });

  it('ignores unknown select values', async () => {
    const r = await tolkSkjema(skjema({ ...gyldig, start: 'hacket', antall: '9999' }));
    if (!r.ok) throw new Error('forventet ok');
    const felt = Object.fromEntries(r.innsending.felter);
    expect(felt['Utgangspunkt']).toBe('');
    expect(felt['Antall']).toBe('');
  });

  it('accepts allowed files and rejects others', async () => {
    const stl = new File([new Uint8Array([1, 2, 3])], 'del.stl');
    const ok = await tolkSkjema(skjema(gyldig, [stl]));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.innsending.vedlegg?.[0]?.filnavn).toBe('del.stl');

    const exe = new File([new Uint8Array([1])], 'virus.exe');
    const nei = await tolkSkjema(skjema(gyldig, [exe]));
    expect(nei.ok).toBe(false);
    if (!nei.ok) expect(nei.feil.filer).toContain('virus.exe');
  });

  it('flags the honeypot and handles the contact form', async () => {
    const r = await tolkSkjema(skjema({ ...gyldig, skjema: 'kontakt', nettside: 'http://spam' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.honningkrukke).toBe(true);
      expect(r.innsending.type).toBe('kontakt');
      expect(r.innsending.emne).toBe('Melding fra Kari');
    }
  });
});
