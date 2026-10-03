import { describe, expect, it } from 'vitest';
import { erOffentlig } from './typer';

describe('Inspirasjon access', () => {
  const naa = new Date('2026-10-02');

  it('shows public entries', () => {
    expect(erOffentlig({ tilgang: 'offentlig' }, naa)).toBe(true);
    expect(erOffentlig({}, naa)).toBe(true);
  });

  it('keeps members-first entries out until they open to everyone', () => {
    expect(erOffentlig({ tilgang: 'medlemmer-forst' }, naa)).toBe(false);
    expect(erOffentlig({ tilgang: 'medlemmer-forst', offentligFra: new Date('2026-11-01') }, naa)).toBe(
      false,
    );
    expect(erOffentlig({ tilgang: 'medlemmer-forst', offentligFra: new Date('2026-10-01') }, naa)).toBe(true);
  });
});
