import { describe, expect, it } from 'vitest';
import { begrensUtsnitt, erStyreflate, lagVisning } from './visning';

const plate = { minX: -128, minY: -128, maksX: 128, maksY: 128 };

describe('begrensUtsnitt', () => {
  it('lets the view move freely while the plate is in sight', () => {
    const u = { zoom: 1, senterX: 40, senterY: -30 };
    expect(begrensUtsnitt(u, 1000, 800, plate)).toEqual(u);
  });

  it('stops panning before the plate leaves the screen', () => {
    const u = begrensUtsnitt({ zoom: 1, senterX: 100000, senterY: -100000 }, 1000, 800, plate);
    const v = lagVisning(u, 1000, 800);
    // the plate's right and bottom edges are still inside the canvas
    expect(v.tilSkjerm({ x: plate.maksX, y: 0 }).x).toBeGreaterThan(0);
    expect(v.tilSkjerm({ x: 0, y: plate.minY }).y).toBeLessThan(800);
    expect(u.senterX).toBeLessThan(1000);
  });

  it('stops zooming out while the plate still fills about a third of the view', () => {
    const u = begrensUtsnitt({ zoom: 0.05, senterX: 0, senterY: 0 }, 1000, 800, plate);
    const v = lagVisning(u, 1000, 800);
    const plateHoyde = v.tilSkjerm({ x: 0, y: plate.minY }).y - v.tilSkjerm({ x: 0, y: plate.maksY }).y;
    expect(plateHoyde).toBeCloseTo((800 - 22) * 0.3, 0);
    // at the limit, turning the wheel further leaves the view as it was (no creeping)
    const videre = begrensUtsnitt({ zoom: u.zoom * 0.8, senterX: 30, senterY: 30 }, 1000, 800, plate, u);
    expect(videre).toBe(u);
  });

  it('allows less overshoot when zoomed in', () => {
    const ut = begrensUtsnitt({ zoom: 0.8, senterX: 1e6, senterY: 0 }, 1000, 800, plate);
    const inn = begrensUtsnitt({ zoom: 4, senterX: 1e6, senterY: 0 }, 1000, 800, plate);
    expect(inn.senterX).toBeLessThan(ut.senterX);
    expect(inn.senterX).toBeGreaterThan(plate.maksX);
  });
});

describe('erStyreflate', () => {
  it('reads a sideways or fine-grained wheel event as two fingers on a trackpad', () => {
    expect(erStyreflate({ deltaX: 3, deltaY: 0, deltaMode: 0 })).toBe(true);
    expect(erStyreflate({ deltaX: 0, deltaY: 4, deltaMode: 0, wheelDeltaY: -12 })).toBe(true);
    expect(erStyreflate({ deltaX: 0, deltaY: 2.5, deltaMode: 0 })).toBe(true);
  });

  it('reads notches as a mouse wheel', () => {
    expect(erStyreflate({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120 })).toBe(false);
    expect(erStyreflate({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(false);
    expect(erStyreflate({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toBe(false);
  });
});
