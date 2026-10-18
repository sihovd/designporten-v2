/**
 * The public sign gallery (Sivert, 2026-10-16): every sign that is
 * downloaded or put in the cart is shared in «Nylig laget» on the site, and
 * anyone can start a new sign from it as a template. Only the open sign is
 * shared, never the CSV rows (they are often people's names).
 *
 * Works only where the account API runs (the PHP build with the database
 * switched on); elsewhere nothing is sent and the editor does not mention it.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { tilJson, type Dokument } from '../../core/dokument';
import { delteSkilt, huskDeling, konto, KontoFeil, kontoMulig } from '@/lib/konto/api';
import { forhandsbilde } from './forhandsbilde';
import { nyMalFraDokument, rensMal, type Mal } from './maler';

/** Shared signs have no licence terms yet; Sivert decides them. */
export const DELT_LISENS = 'Ikke avklart ennå';

export const DELINGSMERKNAD =
  'Når du laster ned skiltet eller legger det i handlekurven, deles det i «Nylig laget» på Designporten, og andre kan bruke det som mal. Teksten på skiltet vises, så tenk over navn og adresser.';

/** A short fingerprint of the design, so an unchanged sign is not sent twice. */
function utgave(dok: Dokument): string {
  const s = tilJson({ ...dok, meta: { opprettet: '', endret: '' } });
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}

const sistDelt = new Map<string, string>();

/**
 * Share the open sign in the gallery, or update the copy this browser
 * shared before. Quietly does nothing where accounts are not switched on.
 */
export async function delSkilt(benk: Arbeidsbenk): Promise<void> {
  if (!kontoMulig) return;
  const dok = benk.tilstand.dok;
  const versjon = utgave(dok);
  const tidligere = delteSkilt()[dok.id];
  if (sistDelt.get(dok.id) === versjon) return;
  const mal = nyMalFraDokument(dok, { navn: dok.navn, synlighet: 'gratis', lisens: DELT_LISENS });
  let bilde: string | null = null;
  try {
    bilde = forhandsbilde(dok);
  } catch {
    /* no picture: the sign is shared without one */
  }
  try {
    let svar;
    try {
      svar = await konto.del(
        mal,
        bilde,
        tidligere ? { id: tidligere.id, nokkel: tidligere.nokkel } : undefined,
      );
    } catch (e) {
      // removed from the gallery since, or shared from another browser: share it as a new sign
      if (!tidligere || !(e instanceof KontoFeil) || (e.status !== 403 && e.status !== 404)) throw e;
      svar = await konto.del(mal, bilde);
    }
    sistDelt.set(dok.id, versjon);
    huskDeling(dok.id, {
      id: svar.id,
      nokkel: svar.nokkel ?? tidligere?.nokkel ?? '',
      tittel: dok.navn,
      delt: new Date().toISOString(),
    });
    benk.melde(svar.ny ? 'Skiltet er delt i «Nylig laget».' : 'Skiltet er oppdatert i «Nylig laget».');
  } catch (e) {
    if (e instanceof KontoFeil && e.status === 503) return;
    benk.melde(`Skiltet ble ikke delt i galleriet: ${e instanceof Error ? e.message : 'ukjent feil'}`);
  }
}

/** A sign from the gallery as a template to start from. */
export async function hentDeltMal(id: string): Promise<Mal> {
  const svar = await konto.bruk(id);
  const mal = rensMal({ ...(svar.mal as object), id: `delt-${id}` });
  if (!mal) throw new Error('Skiltet kunne ikke åpnes.');
  return { ...mal, skaper: svar.skaper, eier: svar.skaper };
}
