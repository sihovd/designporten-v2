import { describe, expect, it } from 'vitest';
import { sideIder } from './definisjon';
import { sidedata, sidetekst } from './index';

describe('sidetekster', () => {
  it.each(sideIder)('«%s» har en gyldig innholdsfil', (id) => {
    expect(() => sidedata(id)).not.toThrow();
  });

  it('leser tekst og gir redigeringsadresse', () => {
    const t = sidetekst('forside');
    expect(t('helt.tittel')).toBe('Vi gir ideer form');
    expect(t('snarveier.1.tittel')).toBe('Skaperverksted');
    expect(t.r('helt.tittel')).toEqual({ 'data-rediger': 'sider/forside#helt.tittel' });
    expect(t.r('helt.ingress', 'avsnitt')['data-rediger-type']).toBe('avsnitt');
    expect(t.kilde('helt')).toBe('sider/forside#helt');
    expect(t.antall('snarveier')).toBe(3);
  });

  it('stopper bygget ved en feilstavet sti', () => {
    const t = sidetekst('om');
    expect(() => t('topp.titel')).toThrow(/finnes ikke/);
    expect(() => t.r('topp')).toThrow(/finnes ikke/);
  });
});
