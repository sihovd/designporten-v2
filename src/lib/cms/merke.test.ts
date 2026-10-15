import { describe, expect, it } from 'vitest';
import { harCmsMerke, sideSti } from './merke';

describe('CMS-merket', () => {
  it('finner dp_cms=1 blant andre informasjonskapsler, og bare den', () => {
    expect(harCmsMerke('a=1; dp_cms=1; b=2')).toBe(true);
    expect(harCmsMerke('dp_cms=1')).toBe(true);
    expect(harCmsMerke('dp_cms=')).toBe(false);
    expect(harCmsMerke('x_dp_cms=1')).toBe(false);
    expect(harCmsMerke('')).toBe(false);
  });
});

describe('sideSti', () => {
  it('fjerner basen og gir alltid skråstrek til slutt', () => {
    expect(sideSti('/', '/')).toBe('/');
    expect(sideSti('/om/', '/')).toBe('/om/');
    expect(sideSti('/designporten-test/om/', '/designporten-test/')).toBe('/om/');
    expect(sideSti('/designporten-test/', '/designporten-test')).toBe('/');
    expect(sideSti('/om', '/')).toBe('/om/');
  });
});
