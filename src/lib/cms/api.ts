import { nettsti } from '@/lib/nettsti';
export { harCmsMerke, sideSti } from './merke';
/**
 * Browser client for the Designporten CMS API (php/api/cms/index.php).
 * The CMS runs only on the PHP build (one.com); see docs/cms/README.md.
 */

export type Rolle = 'admin' | 'redaktor' | 'agent';
export type Felttype = 'linje' | 'avsnitt';

export interface Bruker {
  id: number;
  navn: string;
  epost: string | null;
  rolle: Rolle;
  rettigheter: string[];
  aktiv: boolean;
  nokkelStart: string | null;
  opprettet: string;
  sistInne: string | null;
}

export interface Felt {
  nokkel: string;
  type: Felttype;
  sider: string[];
  standard: string;
  publisert: string | null;
  utkast: string | null;
  versjon: number;
  endret: string | null;
  endretAv: string | null;
  publisertTid: string | null;
}

export interface Resultat {
  nokkel: string;
  status: 'ok' | 'konflikt' | 'ugyldig' | 'ingen-utkast';
  felt?: Felt;
  melding?: string;
}

export interface Revisjon {
  id: number;
  versjon: number;
  handling: string;
  verdi: string | null;
  av: string | null;
  tid: string;
}

export interface Forslag {
  id: number;
  nokkel: string;
  verdi: string;
  begrunnelse: string | null;
  kilde: string | null;
  av: string | null;
  status: 'venter' | 'godkjent' | 'avvist';
  opprettet: string;
  behandlet: string | null;
  behandletAv: string | null;
  felt: Felt | null;
}

export interface Hendelse {
  id: number;
  aktor: string | null;
  handling: string;
  mal: string | null;
  for: string | null;
  etter: string | null;
  resultat: string;
  tid: string;
}

/** What visitors and the editor see for a field: the draft (editor only), else published, else the code default. */
export const gjeldende = (f: Felt): string => f.publisert ?? f.standard;
export const visning = (f: Felt): string => f.utkast ?? gjeldende(f);

export class CmsFeil extends Error {
  constructor(
    melding: string,
    readonly status: number,
  ) {
    super(melding);
  }
}

let csrf = '';

async function kall<T>(
  r: string,
  valg: { metode?: 'GET' | 'POST'; kropp?: unknown; sok?: string } = {},
): Promise<T> {
  const metode = valg.metode ?? 'GET';
  let svar: Response;
  try {
    svar = await fetch(`${nettsti('/api/cms/')}?r=${r}${valg.sok ?? ''}`, {
      method: metode,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(valg.kropp !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(metode === 'POST' && csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: valg.kropp !== undefined ? JSON.stringify(valg.kropp) : undefined,
    });
  } catch {
    throw new CmsFeil('Fikk ikke kontakt med serveren.', 0);
  }
  const type = svar.headers.get('content-type') ?? '';
  if (!type.includes('application/json'))
    throw new CmsFeil('CMS-et finnes ikke på denne serveren.', svar.status);
  const data = (await svar.json()) as T & { feil?: string; csrf?: string };
  if (data.csrf) csrf = data.csrf;
  if (!svar.ok && svar.status !== 409)
    throw new CmsFeil(data.feil ?? `Serveren svarte ${svar.status}.`, svar.status);
  return data;
}

const post = <T>(r: string, kropp: unknown) => kall<T>(r, { metode: 'POST', kropp });
const s = encodeURIComponent;

export const cms = {
  status: () => kall<{ oppsett: boolean; harBrukere: boolean; felt?: number }>('status'),
  meg: () => kall<{ bruker: Bruker; csrf: string }>('meg'),
  oppsett: (d: { kode: string; epost: string; navn: string; passord: string }) =>
    post<{ bruker: Bruker }>('oppsett', d),
  loggInn: (epost: string, passord: string) => post<{ bruker: Bruker }>('logginn', { epost, passord }),
  loggUt: () => post<{ ok: true }>('loggut', {}),
  innhold: (side?: string) => kall<{ felt: Felt[] }>('innhold', { sok: side ? `&side=${s(side)}` : '' }),
  lagre: (endringer: { nokkel: string; verdi: string; versjon: number }[]) =>
    post<{ resultater: Resultat[] }>('lagre', { endringer }),
  publiser: (nokler: { nokkel: string; versjon: number }[]) =>
    post<{ resultater: Resultat[] }>('publiser', { nokler }),
  forkast: (nokler: { nokkel: string; versjon: number }[]) =>
    post<{ resultater: Resultat[] }>('forkast', { nokler }),
  historikk: (nokkel: string) =>
    kall<{ felt: Felt; revisjoner: Revisjon[] }>('historikk', { sok: `&nokkel=${s(nokkel)}` }),
  gjenopprett: (d: { revisjon?: number; standard?: boolean; nokkel?: string; versjon: number }) =>
    post<Resultat>('gjenopprett', d),
  forslag: () => kall<{ forslag: Forslag[] }>('forslag'),
  behandle: (id: number, beslutning: 'godkjenn' | 'avvis', publiser = false) =>
    post<{ status: string }>('behandle', { id, beslutning, publiser }),
  brukere: () => kall<{ brukere: Bruker[] }>('brukere'),
  bruker: (d: Record<string, unknown>) => post<{ bruker: Bruker; nokkel?: string }>('bruker', d),
  nyNokkel: (id: number) => post<{ bruker: Bruker; nokkel: string }>('ny-nokkel', { id }),
  passord: (gammelt: string, nytt: string) => post<{ ok: true }>('passord', { gammelt, nytt }),
  logg: () => kall<{ hendelser: Hendelse[] }>('logg'),
  eksportUrl: () => `${nettsti('/api/cms/')}?r=eksport`,
  importer: (data: unknown) => post<{ ok: true; antall: Record<string, number> }>('import', data),
};

/** The page and field a key points at, for people: «Forsiden · helt.tittel». */
export function feltnavn(nokkel: string, sider: Record<string, string>): string {
  const m = /^sider\/([a-z0-9-]+)#(.+)$/.exec(nokkel);
  if (!m) return nokkel;
  return `${sider[m[1]!] ?? m[1]} · ${m[2]}`;
}
