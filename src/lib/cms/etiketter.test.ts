import { describe, expect, it } from 'vitest';
import { cmsEtikett } from './etiketter';

describe('cmsEtikett', () => {
  it('gir side og feltnavn fra definisjonen, også i lister', () => {
    expect(cmsEtikett('sider/forside#helt.tittel')).toEqual({
      side: 'Forsiden',
      sideId: 'forside',
      felt: 'Toppen av siden › Tittel',
    });
    expect(cmsEtikett('sider/bedrift#tjenester.liste.1.navn')?.felt).toBe('Tjenester › Tjeneste 2 › Navn');
  });

  it('gir null for nøkler utenfor sidetekstene', () => {
    expect(cmsEtikett('produkter/data/vase#navn')).toBeNull();
    expect(cmsEtikett('sider/finnesikke#a')).toBeNull();
  });

  it('faller tilbake til stien når feltet ikke finnes i definisjonen', () => {
    expect(cmsEtikett('sider/forside#ukjent.felt')?.felt).toBe('ukjent.felt');
  });
});
