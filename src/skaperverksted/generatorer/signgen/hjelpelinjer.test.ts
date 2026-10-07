import { describe, expect, it } from 'vitest';
import { tomtDokument } from '../../core/dokument';
import {
  hjelpelinjerAv,
  leggTilHjelpelinje,
  narmesteHjelpelinje,
  nyHjelpelinje,
  oppdaterHjelpelinje,
  slettAlleHjelpelinjer,
  slettHjelpelinje,
} from './hjelpelinjer';

const dok = () =>
  tomtDokument('signgen', 'Test', { bredde: 100, dybde: 50, hoyde: 100, printerProfilId: 'x' });

describe('hjelpelinjer', () => {
  it('gamle prosjekter uten hjelpelinjer har en tom liste', () => {
    expect(hjelpelinjerAv(dok())).toEqual([]);
  });

  it('legger til, flytter, låser og sletter uten å endre originalen', () => {
    const a = dok();
    const g = nyHjelpelinje('x', 12.3456);
    expect(g.verdi).toBe(12.35);
    const b = leggTilHjelpelinje(a, g);
    expect(hjelpelinjerAv(a)).toHaveLength(0);
    expect(hjelpelinjerAv(b)).toHaveLength(1);
    const c = oppdaterHjelpelinje(b, g.id, { verdi: 20, last: true });
    expect(hjelpelinjerAv(c)[0]).toMatchObject({ verdi: 20, last: true });
    expect(hjelpelinjerAv(slettHjelpelinje(c, g.id))).toEqual([]);
  });

  it('«slett alle» lar låste linjer stå', () => {
    let d = dok();
    d = leggTilHjelpelinje(d, { id: 'a', akse: 'x', verdi: 1 });
    d = leggTilHjelpelinje(d, { id: 'b', akse: 'y', verdi: 2, last: true });
    expect(hjelpelinjerAv(slettAlleHjelpelinjer(d)).map((g) => g.id)).toEqual(['b']);
  });

  it('finner nærmeste linje innenfor toleransen og hopper over låste', () => {
    const linjer = [
      { id: 'a', akse: 'x' as const, verdi: 10 },
      { id: 'b', akse: 'x' as const, verdi: 12, last: true },
      { id: 'c', akse: 'y' as const, verdi: 30 },
    ];
    expect(narmesteHjelpelinje(linjer, { x: 11.5, y: 0 }, 2)?.id).toBe('a');
    expect(narmesteHjelpelinje(linjer, { x: 11.5, y: 0 }, 2, true)?.id).toBe('b');
    expect(narmesteHjelpelinje(linjer, { x: 50, y: 0 }, 2)).toBeNull();
    expect(narmesteHjelpelinje(linjer, { x: 0, y: 29 }, 2)?.id).toBe('c');
  });
});
