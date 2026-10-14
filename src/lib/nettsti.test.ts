import { describe, expect, it } from 'vitest';
import { medBase } from './nettsti';

describe('subdirectory URLs', () => {
  it('preserves root deployment, external URLs and anchors', () => {
    for (const sti of ['/', '/kontakt/', '#skjema', 'https://example.com', '//example.com']) {
      expect(medBase(sti, '/')).toBe(sti);
    }
    expect(medBase('#skjema', '/designporten-test/')).toBe('#skjema');
    expect(medBase('https://example.com', '/designporten-test/')).toBe('https://example.com');
  });
  it('prefixes routes, queries and assets exactly once', () => {
    for (const sti of ['/', '/api/foresporsel/', '/brand/logo.svg', '/spesialdesign/?start=del#skjema']) {
      const resultat = `/designporten-test${sti}`;
      expect(medBase(sti, '/designporten-test/')).toBe(resultat);
      expect(medBase(resultat, '/designporten-test/')).toBe(resultat);
    }
  });
});
