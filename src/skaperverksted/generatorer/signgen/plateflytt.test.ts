import type { Byggeplate } from './batch';
import { brukPlateflytt, settFlytt, utenFlytt } from './plateflytt';

describe('Offsets from the automatic packing', () => {
  const v = (indeks: number) => ({ indeks }) as never;
  const plater: Byggeplate[] = [
    {
      nummer: 1,
      plasseringer: [
        { variant: v(0), dx: 1, dy: 2 },
        { variant: v(1), dx: 10, dy: 20 },
      ],
    },
  ];

  it('adds the offset of a sign to its placement and leaves the others', () => {
    const ut = brukPlateflytt(plater, { 1: { dx: 3, dy: -4 } });
    expect(ut[0]!.plasseringer.map((p) => [p.dx, p.dy])).toEqual([
      [1, 2],
      [13, 16],
    ]);
    expect(brukPlateflytt(plater, {})).toBe(plater);
  });

  it('stores a move as an offset, and drops it when the sign is back where the packing put it', () => {
    const f = settFlytt({}, 1, 13, 16, 10, 20);
    expect(f).toEqual({ 1: { dx: 3, dy: -4 } });
    expect(settFlytt(f, 1, 10, 20, 10, 20)).toEqual({});
    expect(utenFlytt(f, [1])).toEqual({});
  });
});
