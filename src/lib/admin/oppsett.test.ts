import { describe, expect, it } from 'vitest';
import { lagOppsett } from './oppsett';

interface FeltKonfig {
  name: string;
  widget?: string;
  default?: string;
  fields?: FeltKonfig[];
  options?: { label: string; value: string }[];
}

interface SamlingKonfig {
  name: string;
  folder?: string;
  format?: string;
  files?: { file: string; fields: FeltKonfig[] }[];
  fields?: FeltKonfig[];
}

const samlinger = () => lagOppsett([]).collections as unknown as SamlingKonfig[];

describe('CMS-oppsett', () => {
  it('viser produksjonsdomenet som forhåndsvisning og tilbyr redigerbare sidebilder', () => {
    const oppsett = lagOppsett([]);
    const bilder = samlinger().find((samling) => samling.name === 'nettsidebilder');
    const sidebilder = bilder?.files?.[0];

    expect(oppsett.site_url).toBe('https://designporten.no');
    expect(sidebilder?.file).toBe('src/content/sider/bilder.json');
    expect(sidebilder?.fields.map((felt) => felt.name)).toEqual([
      'forside',
      'spesialdesign',
      'bedrift',
      'omHistorie',
    ]);
    for (const side of sidebilder?.fields ?? []) {
      expect(side.fields?.find((felt) => felt.name === 'fil')?.widget).toBe('image');
      expect(side.fields?.find((felt) => felt.name === 'alt')?.widget).toBe('string');
    }
  });

  it('eksponerer inspirasjonsartiklene med trygge plassholderstandarder og prosessbilder', () => {
    const artikler = samlinger().find((samling) => samling.name === 'inspirasjon');
    const felter = artikler?.fields ?? [];
    const status = felter.find((felt) => felt.name === 'status');
    const bilde = felter.find((felt) => felt.name === 'bilde');
    const stadier = felter.find((felt) => felt.name === 'stadier');

    expect(artikler).toMatchObject({
      folder: 'src/content/inspirasjon/data',
      format: 'frontmatter',
      fields: expect.any(Array),
    });
    expect(status).toMatchObject({ default: 'plassholder' });
    expect(bilde?.options?.map((valg) => valg.value)).toContain('bakgrunner.samarbeid');
    expect(stadier?.fields?.find((felt) => felt.name === 'bilde')?.widget).toBe('select');
  });
});
