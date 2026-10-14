import { describe, expect, it } from 'vitest';
import { sideIder, sider } from './definisjon';
import { sidedata, sidetekst } from './index';
import { sidetekstSamling } from './admin';

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

  it('/admin får ett skjema per side med alle feltene', () => {
    const samling = sidetekstSamling();
    expect(samling.files.map((f) => f.name)).toEqual(sideIder);
    const forside = samling.files.find((f) => f.name === 'forside')!;
    expect(forside.file).toBe('src/content/sider/forside.json');
    expect(forside.fields.map((f) => f.name)).toEqual(Object.keys(sider.forside.felt));
    const snarveier = forside.fields.find((f) => f.name === 'snarveier')!;
    expect(snarveier).toMatchObject({ widget: 'list', min: 3, max: 3, allow_add: false });
  });
});
