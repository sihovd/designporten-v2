import { nettsti } from '@/lib/nettsti';
export { harCmsMerke, sideSti } from './merke';
/**
 * Browser client for the Designporten CMS API (php/api/cms/index.php).
 * The CMS runs only on the PHP build (one.com); see docs/cms/README.md.
 */

export type Rolle = 'admin' | 'redaktor' | 'agent';
export type Felttype = 'linje' | 'avsnitt' | 'bilde';

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
  /** Image fields only: the published and draft picture, ready to show. */
  bilder?: { publisert: Bildeinfo | null; utkast: Bildeinfo | null };
}

/** The stored value of an image field. `medium: null` is the picture the page was built with. */
export interface Bildeverdi {
  medium: number | null;
  alt?: string;
  dekorativ?: boolean;
  fokus?: string;
  fokusMobil?: string | null;
}

/** An image field value resolved to files (from the server). */
export interface Bildeinfo {
  medium: number;
  src: string;
  srcset: string;
  miniatyr: string;
  bredde: number;
  hoyde: number;
  konsept: boolean;
  navn: string;
  alt: string;
  dekorativ: boolean;
  fokus: string;
  fokusMobil: string | null;
}

/** The picture a page was built with (an image field's `standard`, as JSON). */
export interface Byggbilde {
  src: string;
  alt: string;
  bredde: number | null;
  hoyde: number | null;
  konsept: boolean;
}

export interface Bruk {
  nokkel: string;
  publisert: boolean;
  utkast: boolean;
}

export interface Medium {
  id: number;
  navn: string;
  alt: string;
  konsept: boolean;
  rettigheter: string | null;
  status: 'aktiv' | 'arkivert';
  mime: string;
  bredde: number;
  hoyde: number;
  originalBredde: number;
  originalHoyde: number;
  storrelse: number;
  src: string;
  miniatyr: string;
  srcset: string;
  opprettet: string;
  bruktPa?: Bruk[];
}

export interface Drift {
  php: string;
  pdoMysql: boolean;
  database: { ok: boolean; driver?: string; versjon?: string };
  gd: boolean;
  gdVersjon: string | null;
  webp: boolean;
  avif: boolean;
  imagick: boolean;
  exif: boolean;
  fileinfo: boolean;
  curl: boolean;
  opensslHttps: boolean;
  uploadMaxFilesize: number;
  postMaxSize: number;
  memoryLimit: number;
  maxExecutionTime: number;
  maksOpplasting: number;
  ledigPlass: number | null;
  dataSkrivbar: boolean;
  medierSkrivbar: boolean;
  https: boolean;
  server: string;
  publisert: boolean;
  antallMedier: number;
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
  bilde?: Bildeinfo | null;
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
/** An image field's value for «the picture the page was built with». */
export const BYGGET = '{"medium":null}';
export const gjeldende = (f: Felt): string => f.publisert ?? (f.type === 'bilde' ? BYGGET : f.standard);
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

/** Upload one picture with progress (fetch cannot report upload progress). */
function lastOpp(
  fil: File,
  framdrift?: (andel: number) => void,
): Promise<{ medium: Medium; gjentatt: boolean }> {
  return new Promise((ferdig, feilet) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${nettsti('/api/cms/')}?r=last-opp`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) framdrift?.(e.loaded / e.total);
    };
    xhr.onerror = () => feilet(new CmsFeil('Fikk ikke kontakt med serveren.', 0));
    xhr.onload = () => {
      let data: { medium?: Medium; gjentatt?: boolean; feil?: string } = {};
      try {
        data = JSON.parse(xhr.responseText) as typeof data;
      } catch {
        feilet(
          new CmsFeil(
            xhr.status === 413 ? 'Filen er større enn serveren tillater.' : `Serveren svarte ${xhr.status}.`,
            xhr.status,
          ),
        );
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.medium)
        ferdig({ medium: data.medium, gjentatt: Boolean(data.gjentatt) });
      else feilet(new CmsFeil(data.feil ?? `Serveren svarte ${xhr.status}.`, xhr.status));
    };
    const skjema = new FormData();
    skjema.append('fil', fil);
    xhr.send(skjema);
  });
}
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
  medier: (arkiverte = false) =>
    kall<{ medier: Medium[]; maksOpplasting: number; kanLageBilder: boolean }>('medier', {
      sok: arkiverte ? '&arkiverte=1' : '',
    }),
  lastOpp,
  medium: (d: {
    id: number;
    navn?: string;
    alt?: string;
    konsept?: boolean;
    rettigheter?: string;
    arkivert?: boolean;
  }) => post<{ medium: Medium }>('medium', d),
  drift: () => kall<{ drift: Drift }>('drift'),
  eksportUrl: () => `${nettsti('/api/cms/')}?r=eksport`,
  importer: (data: unknown) => post<{ ok: true; antall: Record<string, number> }>('import', data),
};

/** The page and field a key points at, for people: «Forsiden · helt.tittel». */
export function feltnavn(nokkel: string, sider: Record<string, string>): string {
  const m = /^sider\/([a-z0-9-]+)#(.+)$/.exec(nokkel);
  if (!m) return nokkel;
  return `${sider[m[1]!] ?? m[1]} · ${m[2]}`;
}

/** Read an image field value (stored as JSON). Anything unreadable counts as «as built». */
export function lesBildeverdi(verdi: string | null): Bildeverdi | null {
  if (verdi === null) return null;
  try {
    const d = JSON.parse(verdi) as Bildeverdi;
    return d && typeof d === 'object' && 'medium' in d ? d : { medium: null };
  } catch {
    return { medium: null };
  }
}

export function lesByggbilde(standard: string): Byggbilde | null {
  try {
    const d = JSON.parse(standard) as Byggbilde;
    return d && typeof d.src === 'string' ? d : null;
  } catch {
    return null;
  }
}
