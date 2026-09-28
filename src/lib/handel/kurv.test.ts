import { beforeEach, describe, expect, it } from 'vitest';

// Minimal browser globals for the client-side cart.
const lager = new Map<string, string>();
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (k: string) => lager.get(k) ?? null,
      setItem: (k: string, v: string) => void lager.set(k, v),
    },
  }),
  CustomEvent: class extends Event {
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      super(type);
      this.detail = init?.detail;
    }
  },
});

const { antallVarer, delsum, hentKurv, leggTil, settAntall, tomKurv } = await import('./kurv');

describe('kurv', () => {
  beforeEach(() => tomKurv());

  it('merges identical choices and keeps different choices apart', () => {
    leggTil({ produktId: 'a', navn: 'A', antall: 1, enhetspris: null, valg: { farge: 'x' } });
    leggTil({ produktId: 'a', navn: 'A', antall: 2, enhetspris: null, valg: { farge: 'x' } });
    leggTil({ produktId: 'a', navn: 'A', antall: 1, enhetspris: null, valg: { farge: 'y' } });
    expect(hentKurv()).toHaveLength(2);
    expect(antallVarer()).toBe(4);
  });

  it('removes a line at zero and sums only priced lines', () => {
    leggTil({ produktId: 'a', navn: 'A', antall: 2, enhetspris: 1000, valg: {} });
    leggTil({ produktId: 'b', navn: 'B', antall: 1, enhetspris: null, valg: {} });
    expect(delsum()).toEqual({ ore: 2000, ukjent: 1 });
    settAntall(hentKurv()[1]!.nokkel, 0);
    expect(hentKurv()).toHaveLength(1);
  });
});
