import { describe, expect, it } from 'vitest';
import { brukNettsidebilde, nettsidebilder } from './nettsidebilder';
import { bakgrunner } from './ressurser';

describe('nettsidebilder', () => {
  it('beholder merkede konseptbilder inntil ekte bilder lastes opp', () => {
    expect(nettsidebilder.forside.bilde).toBe(bakgrunner.verksted);
    expect(nettsidebilder.spesialdesign.bilde).toBe(bakgrunner.samarbeid);
    expect(nettsidebilder.omHistorie).toBe(bakgrunner.samarbeid);
  });

  it('bruker bare lokale mediebilder som publiserte sidebilder', () => {
    expect(
      brukNettsidebilde(
        { fil: '/opplastet/verksted.webp', alt: 'Skriver på verkstedbord', fokus: '50% 40%' },
        bakgrunner.verksted,
      ),
    ).toMatchObject({ src: '/opplastet/verksted.webp', alt: 'Skriver på verkstedbord', konsept: false });
    expect(() =>
      brukNettsidebilde(
        { fil: 'https://example.com/bilde.webp', alt: 'Bilde', fokus: '50% 50%' },
        bakgrunner.verksted,
      ),
    ).toThrow(/mediebiblioteket/);
  });
});
