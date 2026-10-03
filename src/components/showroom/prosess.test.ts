import { describe, expect, it } from 'vitest';
import { andelForSteg, fyllForAndel, stegForFyll } from './prosess';

describe('process timeline', () => {
  it('rests at both ends of the track', () => {
    expect(fyllForAndel(0)).toBe(0);
    expect(fyllForAndel(0.03)).toBe(0);
    expect(fyllForAndel(0.95)).toBe(1);
    expect(fyllForAndel(1)).toBe(1);
  });

  it('activates a step only when the line reaches its point', () => {
    const n = 6;
    // Points at 0, 0.2, 0.4, 0.6, 0.8, 1.
    expect(stegForFyll(0, n)).toBe(0);
    expect(stegForFyll(0.199, n)).toBe(0);
    expect(stegForFyll(0.2, n)).toBe(1);
    expect(stegForFyll(0.79, n)).toBe(3);
    expect(stegForFyll(0.999, n)).toBe(4);
    expect(stegForFyll(1, n)).toBe(5);
  });

  it('scrolls to a position where the chosen step is active', () => {
    for (const n of [5, 6]) {
      for (let i = 0; i < n; i++) {
        expect(stegForFyll(fyllForAndel(andelForSteg(i, n)), n)).toBe(i);
      }
    }
  });
});
