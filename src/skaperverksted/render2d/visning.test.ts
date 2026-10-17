import { arbeidsomraade, begrensUtsnitt, lagVisning, LINJAL } from './visning';

const plate = { bredde: 256, dybde: 256 };
const B = 1000;
const H = 700;

describe('The table stays on the print bed', () => {
  it('reaches half a bed beyond each side, and further only to keep a drawing reachable', () => {
    expect(arbeidsomraade(plate)).toEqual({ minX: -256, maksX: 256, minY: -256, maksY: 256 });
    const r = arbeidsomraade(plate, { minX: -300, maksX: 10, minY: -5, maksY: 5 });
    expect(r.minX).toBe(-300);
    expect(r.maksX).toBe(256);
  });

  it('cannot be moved so far that the view leaves the table', () => {
    const r = arbeidsomraade(plate);
    const u = begrensUtsnitt({ zoom: 1, senterX: 5000, senterY: -5000 }, B, H, r);
    const v = lagVisning(u, B, H);
    const venstre = v.tilModell({ x: LINJAL, y: H }).x;
    const hoyre = v.tilModell({ x: B, y: LINJAL }).x;
    expect(hoyre).toBeCloseTo(r.maksX, 6);
    expect(venstre).toBeGreaterThan(r.minX);
    expect(v.tilModell({ x: B, y: H }).y).toBeCloseTo(r.minY, 6);
  });

  it('cannot be zoomed out beyond the whole table, which then stays centred', () => {
    const r = arbeidsomraade(plate);
    const u = begrensUtsnitt({ zoom: 0.05, senterX: 90, senterY: 90 }, B, H, r);
    expect(u.zoom).toBeGreaterThan(0.05);
    const v = lagVisning(u, B, H);
    const synligH = v.tilModell({ x: LINJAL, y: LINJAL }).y - v.tilModell({ x: B, y: H }).y;
    expect(synligH).toBeCloseTo(r.maksY - r.minY, 6);
    expect(u.senterY).toBeCloseTo(0, 6);
  });

  it('leaves a view that is on the table alone', () => {
    const u = { zoom: 2, senterX: 10, senterY: -20 };
    expect(begrensUtsnitt(u, B, H, arbeidsomraade(plate))).toEqual(u);
  });
});
