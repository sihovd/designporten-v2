import { describe, expect, it, vi } from 'vitest';
import {
  base64TilTekst,
  lagreEndringer,
  lesToken,
  normaliser,
  settTekst,
  sjekkTilgang,
  tekstTilBase64,
  tilJson,
  tolkAdresse,
} from './kjerne';

describe('adresser', () => {
  it('godtar sidetekster og produkter', () => {
    expect(tolkAdresse('sider/forside#snarveier.0.tekst')).toEqual({
      fil: 'src/content/sider/forside.json',
      sti: ['snarveier', '0', 'tekst'],
      navn: 'sidetekst «forside»',
    });
    expect(tolkAdresse('produkter/data/spiralvase#navn')?.fil).toBe(
      'src/content/produkter/data/spiralvase.json',
    );
  });

  it('avviser alt annet', () => {
    for (const a of [
      'sider/forside',
      'sider/../package#name',
      'butikk/innstillinger#betaling',
      'produkter/data/vase#',
      'sider/forside#a..b',
      'sider/forside#a#b',
      '../sider/forside#a',
    ]) {
      expect(tolkAdresse(a), a).toBeNull();
    }
  });
});

describe('tekst', () => {
  it('normaliserer linjer og avsnitt', () => {
    expect(normaliser('  Vi gir\n ideer   form ', 'linje')).toBe('Vi gir ideer form');
    expect(normaliser('Første\n\n\nAndre  avsnitt\nTredje', 'avsnitt')).toBe(
      'Første\n\nAndre avsnitt\n\nTredje',
    );
  });

  it('base64 tåler norske tegn', () => {
    const tekst = '{"tittel": "Små ærlige øyeblikk – «sitat»"}';
    expect(base64TilTekst(tekstTilBase64(tekst))).toBe(tekst);
  });
});

describe('settTekst', () => {
  const data = () => ({ helt: { tittel: 'Gammel' }, liste: [{ tekst: 'A' }], tall: 3 });

  it('erstatter en eksisterende tekst', () => {
    const d = data();
    expect(settTekst(d, ['liste', '0', 'tekst'], 'A', 'B', 'linje')).toBe('ok');
    expect(d.liste[0]!.tekst).toBe('B');
  });

  it('lar en tekst som er endret i /admin være', () => {
    const d = data();
    expect(settTekst(d, ['helt', 'tittel'], 'Noe annet', 'Ny', 'linje')).toBe('endret-andre-steder');
    expect(d.helt.tittel).toBe('Gammel');
  });

  it('lager aldri nye felt og rører ikke andre typer', () => {
    const d = data();
    expect(settTekst(d, ['helt', 'ingress'], '', 'Ny', 'linje')).toBe('finnes-ikke');
    expect(settTekst(d, ['tall'], '3', '4', 'linje')).toBe('finnes-ikke');
    expect(settTekst(d, ['mangler', 'x'], '', 'y', 'linje')).toBe('finnes-ikke');
    expect(d).toEqual(data());
  });
});

describe('token', () => {
  const lager = (verdi: string | null) => ({ getItem: () => verdi });
  it('leser GitHub-token fra /admin', () => {
    expect(lesToken(lager(JSON.stringify({ backendName: 'github', token: 'abc' })))).toBe('abc');
  });
  it('ingen innlogging gir ingenting', () => {
    expect(lesToken(lager(null))).toBeNull();
    expect(lesToken(lager('{}'))).toBeNull();
    expect(lesToken(lager('ikke json'))).toBeNull();
    expect(lesToken(lager(JSON.stringify({ backendName: 'local', token: 'x' })))).toBeNull();
    expect(lesToken(undefined)).toBeNull();
  });
});

const svar = (status: number, kropp: unknown = {}) =>
  new Response(JSON.stringify(kropp), { status, headers: { 'Content-Type': 'application/json' } });

describe('GitHub', () => {
  it('sjekker skrivetilgang', async () => {
    expect(await sjekkTilgang('t', async () => svar(200, { permissions: { push: true } }))).toBe(
      'kan-skrive',
    );
    expect(await sjekkTilgang('t', async () => svar(200, { permissions: { push: false } }))).toBe(
      'kan-ikke-skrive',
    );
    expect(await sjekkTilgang('t', async () => svar(401))).toBe('utlopt');
    expect(
      await sjekkTilgang('t', async () => {
        throw new TypeError('offline');
      }),
    ).toBe('nettfeil');
  });

  it('lagrer én commit per fil og hopper over felt endret i /admin', async () => {
    const forside = { helt: { tittel: 'Vi gir ideer form', ingress: 'Endret i admin' } };
    const henter = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (!init?.method) return svar(200, { sha: 'abc', content: tekstTilBase64(tilJson(forside)) });
      return svar(200, {});
    });
    const res = await lagreEndringer(
      'tok',
      [
        {
          adresse: 'sider/forside#helt.tittel',
          type: 'linje',
          original: 'Vi gir ideer form',
          ny: 'Vi gir ideer en form',
        },
        {
          adresse: 'sider/forside#helt.ingress',
          type: 'linje',
          original: 'Gammel ingress',
          ny: 'Ny ingress',
        },
      ],
      henter as unknown as typeof fetch,
    );
    expect(res.map((r) => r.status)).toEqual(['ok', 'endret-andre-steder']);
    const put = henter.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(put).toHaveLength(1);
    const [url, init] = put[0]!;
    expect(String(url)).toBe(
      'https://api.github.com/repos/sihovd/designporten-v2/contents/src/content/sider/forside.json',
    );
    const kropp = JSON.parse(String(init!.body)) as {
      message: string;
      sha: string;
      branch: string;
      content: string;
    };
    expect(kropp).toMatchObject({
      sha: 'abc',
      branch: 'main',
      message: 'Innhold: oppdaterer sidetekst «forside» fra siden',
    });
    expect(JSON.parse(base64TilTekst(kropp.content))).toEqual({
      helt: { tittel: 'Vi gir ideer en form', ingress: 'Endret i admin' },
    });
  });

  it('melder feil når GitHub avviser lagringen', async () => {
    const henter = async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method ? svar(409) : svar(200, { sha: 'a', content: tekstTilBase64('{"navn":"Vase"}') });
    const res = await lagreEndringer(
      't',
      [{ adresse: 'produkter/data/vase#navn', type: 'linje', original: 'Vase', ny: 'Ny vase' }],
      henter as typeof fetch,
    );
    expect(res).toEqual([
      {
        adresse: 'produkter/data/vase#navn',
        status: 'feil',
        melding: 'Filen ble endret samtidig. Prøv igjen.',
      },
    ]);
  });
});
