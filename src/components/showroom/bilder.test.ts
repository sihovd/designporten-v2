import { describe, expect, it } from 'vitest';
import { finnBilde } from './bilder';
import { bakgrunner, utklippbilder } from '@/lib/ressurser';

describe('finnBilde', () => {
  it('finds registry images by key', () => {
    expect(finnBilde('bakgrunner.verksted')).toBe(bakgrunner.verksted);
    expect(finnBilde('utklippbilder.spiralvase')).toBe(utklippbilder.spiralvase);
  });

  it('returns undefined for unknown keys', () => {
    expect(finnBilde(undefined)).toBeUndefined();
    expect(finnBilde('bakgrunner')).toBeUndefined();
    expect(finnBilde('ukjent.x')).toBeUndefined();
    expect(finnBilde('bakgrunner.finnesikke')).toBeUndefined();
  });
});
