/**
 * What the site's services cost: one list shared with the PHP API
 * (php/api/konto/tjenester.json), so the editor and the server agree. Nothing
 * costs anything yet; CSV batch will become a paid service later (Sivert,
 * 2026-10-16). No prices exist, so none are shown.
 */
import data from '../../../php/api/konto/tjenester.json';

export type Betaling = 'gratis' | 'gratis-inntil-videre' | 'betalt';
export type TjenesteId = keyof typeof data.tjenester;

export interface Tjeneste {
  navn: string;
  betaling: Betaling;
  beskrivelse: string;
}

export const TJENESTER = data.tjenester as Record<TjenesteId, Tjeneste>;
export const LEVERANDORER = data.leverandorer as Record<'stripe' | 'vipps', { navn: string; aktiv: boolean }>;
export const BETALINGSMERKNAD = data.merknad;

export const BETALINGSTEKST: Record<Betaling, string> = {
  gratis: 'Gratis',
  'gratis-inntil-videre': 'Gratis inntil videre',
  betalt: 'Betalt',
};

/** A service anyone can use without paying (free, or free for now). */
export const erApen = (id: TjenesteId): boolean => TJENESTER[id].betaling !== 'betalt';
