import { tynnesteVegg } from './kontroll';
import { lagRutenett, marsjer } from './marsj';
import type { Felt } from './sdf';

const mesh = (f: Felt) =>
  marsjer(lagRutenett({ min: [-12, -12, -12], maks: [12, 12, 12] }, 0.3, 2_000_000), f);
/** A 20 mm cube (a bound, exact enough for the sign). */
const boks: Felt = (x, y, z) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) - 10;

describe('Creature Forge: tynne vegger', () => {
  test('en kile spissere enn 45° er en knivkant', () => {
    // a 20° wedge: between z = 0 and a plane tilted 20° from it, inside a box
    const v = (20 * Math.PI) / 180;
    const kile: Felt = (x, y, z) => Math.max(boks(x, y, z), -z, z * Math.cos(v) - x * Math.sin(v));
    const t = tynnesteVegg(mesh(kile), kile, [0, 0, 0], 30, 1.2);
    expect(t).not.toBeNull();
  });

  test('en plate på 0,6 mm er tynn', () => {
    const plate: Felt = (x, y, z) => Math.max(boks(x, y, z), Math.abs(z) - 0.3);
    expect(tynnesteVegg(mesh(plate), plate, [0, 0, 0], 30, 1.2)?.tykkelse).toBeLessThan(1);
  });

  test('vanlige hjørner og en 60° kile er ikke tynne', () => {
    expect(tynnesteVegg(mesh(boks), boks, [0, 0, 0], 30, 1.2)).toBeNull();
    const v = (60 * Math.PI) / 180;
    const kile: Felt = (x, y, z) => Math.max(boks(x, y, z), -z, z * Math.cos(v) - x * Math.sin(v));
    expect(tynnesteVegg(mesh(kile), kile, [0, 0, 0], 30, 1.2)).toBeNull();
  });
});
