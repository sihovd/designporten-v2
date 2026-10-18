/**
 * What the site's services cost: one list shared with the PHP API
 * (php/api/konto/tjenester.json), so the editor and the server agree. Nothing
 * costs anything yet. CSV batch belongs to a paid package, but is open to
 * everyone in a free period until payment is ready: an explicit exception
 * (`gratisperiode`, Sivert 2026-10-18). No prices exist, so none are shown.
 */
import data from '../../../php/api/konto/tjenester.json';

export type Betaling = 'gratis' | 'gratis-inntil-videre' | 'betalt';
export type TjenesteId = keyof typeof data.tjenester;

export interface Tjeneste {
  navn: string;
  betaling: Betaling;
  beskrivelse: string;
  /** Features the server checks one by one (for example publishing in the gallery). */
  funksjoner?: Record<string, { navn: string; krever: string[] }>;
  /** A paid service open to everyone for now (until payment is ready). */
  gratisperiode?: Gratisperiode;
}

export interface Gratisperiode {
  apenFor: 'alle';
  til: string;
  grunn: string;
}

/** A package: how many projects the account keeps, and which paid services it opens. */
export interface Plan {
  navn: string;
  prosjekter: number;
  tjenester: string[];
}

export const TJENESTER = data.tjenester as Record<TjenesteId, Tjeneste>;
export const LEVERANDORER = data.leverandorer as Record<'stripe' | 'vipps', { navn: string; aktiv: boolean }>;
export const BETALINGSMERKNAD = data.merknad;
export const PLANER = data.planer as Record<string, Plan>;
/** The tools whose projects can be saved on the account. */
export const PROSJEKTAPPER = data.prosjektapper as Record<string, string>;

export const BETALINGSTEKST: Record<Betaling, string> = {
  gratis: 'Gratis',
  'gratis-inntil-videre': 'Gratis inntil videre',
  betalt: 'Betalt',
};

/** A service anyone can use without paying (free, free for now, or a paid one in its free period). */
export const erApen = (id: TjenesteId): boolean =>
  TJENESTER[id].betaling !== 'betalt' || TJENESTER[id].gratisperiode?.apenFor === 'alle';

/** What a service costs, as shown: a paid one in its free period reads «Gratis inntil videre». */
export function betalingstekst(t: { betaling: Betaling; gratisperiode?: Gratisperiode }): string {
  return t.gratisperiode ? BETALINGSTEKST['gratis-inntil-videre'] : BETALINGSTEKST[t.betaling];
}

/** The badge class for a service: a paid one in its free period looks free for now. */
export const betalingsmerke = (t: { betaling: Betaling; gratisperiode?: Gratisperiode }): Betaling =>
  t.gratisperiode ? 'gratis-inntil-videre' : t.betaling;
