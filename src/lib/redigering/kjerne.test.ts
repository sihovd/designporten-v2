import { describe, expect, it } from 'vitest';
import { normaliser } from './kjerne';

describe('tekst', () => {
  it('normaliserer linjer og avsnitt', () => {
    expect(normaliser('  Vi gir\n ideer   form ', 'linje')).toBe('Vi gir ideer form');
    expect(normaliser('Første\n\n\nAndre  avsnitt\nTredje', 'avsnitt')).toBe(
      'Første\n\nAndre avsnitt\n\nTredje',
    );
  });
});
