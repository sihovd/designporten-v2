import { describe, expect, it } from 'vitest';
import {
  BAKGRUNNER,
  STANDARD_INNSTILLINGER,
  bakgrunnErLys,
  bakgrunnVariabler,
  bland,
  horisontFraFarge,
  lesInnstillinger,
} from './innstillinger';

describe('brukerinnstillinger', () => {
  it('faller tilbake til standard for tomt, ødelagt eller ukjent innhold', () => {
    expect(lesInnstillinger(null)).toEqual(STANDARD_INNSTILLINGER);
    expect(lesInnstillinger('{ikke json')).toEqual(STANDARD_INNSTILLINGER);
    expect(lesInnstillinger('{"tema":"rosa","bakgrunn":"finnes-ikke","egenFarge":"rød"}')).toEqual(
      STANDARD_INNSTILLINGER,
    );
  });

  it('leser gyldige valg', () => {
    const i = lesInnstillinger('{"tema":"mork","bakgrunn":"egen","egenFarge":"#112233"}');
    expect(i).toEqual({ tema: 'mork', bakgrunn: 'egen', egenFarge: '#112233' });
  });

  it('standardbakgrunnen gir ingen overstyring, de andre gir syv tokens', () => {
    expect(bakgrunnVariabler(STANDARD_INNSTILLINGER)).toBeNull();
    const v = bakgrunnVariabler({ ...STANDARD_INNSTILLINGER, bakgrunn: 'midnatt' })!;
    expect(Object.keys(v).sort()).toEqual([
      '--horisont-bunn',
      '--horisont-hoy',
      '--horisont-linje',
      '--horisont-pos',
      '--horisont-topp',
      '--plate-egen',
      '--plate-egen-2',
    ]);
  });

  it('en egen farge gir en gradient der horisonten har fargen selv', () => {
    const h = horisontFraFarge('#2f6fd0');
    expect(h.linje).toBe('#2f6fd0');
    expect(h.topp).not.toBe(h.linje);
    expect(bland('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('lyse bakgrunner får mørk skrift på lerretet, mørke ikke', () => {
    const lys = BAKGRUNNER.filter((b) => b.horisont && bakgrunnErLys(b.horisont)).map((b) => b.id);
    expect(lys).toEqual(['lysgra', 'hvit']);
    expect(bakgrunnErLys(horisontFraFarge('#ffffff'))).toBe(true);
    expect(bakgrunnErLys(horisontFraFarge('#2f6fd0'))).toBe(false);
  });
});
