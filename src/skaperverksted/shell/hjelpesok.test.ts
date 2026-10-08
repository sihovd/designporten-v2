import { describe, expect, it } from 'vitest';
import { HJELPEEMNER } from '../generatorer/signgen/hjelpeemner';
import { sokHjelp } from './hjelpesok';

describe('hjelpesøket', () => {
  it('finner et svar på ord i spørsmålet først', () => {
    expect(sokHjelp(HJELPEEMNER, 'hull')[0]!.sporsmal).toContain('hull');
  });

  it('finner også på ord som bare står i svaret eller i ekstraordene', () => {
    expect(sokHjelp(HJELPEEMNER, 'nøkkelring').map((e) => e.sporsmal)).toContain(
      'Lage hull til oppheng eller nøkkelring',
    );
    expect(sokHjelp(HJELPEEMNER, 'panorere').length).toBeGreaterThan(0);
  });

  it('krever at alle ordene treffer, og begynnelsen av et ord holder', () => {
    expect(sokHjelp(HJELPEEMNER, 'byggep').length).toBeGreaterThan(0);
    expect(sokHjelp(HJELPEEMNER, 'hull blablabla')).toEqual([]);
  });

  it('gir ingenting for tomt søk, og begrenser antallet', () => {
    expect(sokHjelp(HJELPEEMNER, '   ')).toEqual([]);
    expect(sokHjelp(HJELPEEMNER, 'a', 3).length).toBeLessThanOrEqual(3);
  });

  it('har ingen tomme eller doble spørsmål', () => {
    const q = HJELPEEMNER.map((e) => e.sporsmal);
    expect(new Set(q).size).toBe(q.length);
    expect(HJELPEEMNER.every((e) => e.sporsmal.trim() && e.svar.trim())).toBe(true);
  });
});
