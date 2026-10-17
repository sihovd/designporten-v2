/**
 * The public sign gallery «Nylig laget». A sign is private until its maker,
 * signed in, chooses «Publiser i galleriet» (Sivert, 2026-10-17): nothing is
 * shared on download or in the cart. Anyone can start a new sign from a
 * published one as a template. Only the open sign is published, never the
 * CSV rows (they are often people's names).
 *
 * Works only where the account API runs (the PHP build with accounts
 * switched on); elsewhere the editor does not offer it.
 */
import type { Dokument } from '../../core/dokument';
import { delteSkilt, huskDeling, konto, KontoFeil, type DelingIDenneNettleseren } from '@/lib/konto/api';
import { forhandsbilde } from './forhandsbilde';
import { nyMalFraDokument, rensMal, type Mal } from './maler';

/** Published signs have no licence terms yet; Sivert decides them. */
export const DELT_LISENS = 'Ikke avklart ennå';

/** Where this browser published the project before, if it did. */
export function tidligerePublisert(dok: Dokument): DelingIDenneNettleseren | null {
  return delteSkilt()[dok.id] ?? null;
}

/** The preview the gallery will show, or null when there is nothing to draw. */
export function publiseringsbilde(dok: Dokument): string | null {
  try {
    return forhandsbilde(dok);
  } catch {
    return null;
  }
}

/**
 * Publish the open sign in the gallery, or update the copy this browser
 * published before. Needs a signed-in member (the server says 401 otherwise).
 */
export async function publiserSkilt(dok: Dokument): Promise<{ ny: boolean }> {
  const tidligere = tidligerePublisert(dok);
  const mal = nyMalFraDokument(dok, { navn: dok.navn, synlighet: 'gratis', lisens: DELT_LISENS });
  const bilde = publiseringsbilde(dok);
  let svar;
  try {
    svar = await konto.del(
      mal,
      bilde,
      tidligere ? { id: tidligere.id, nokkel: tidligere.nokkel } : undefined,
    );
  } catch (e) {
    // removed from the gallery since, or published by someone else in this browser: publish it as a new sign
    if (!tidligere || !(e instanceof KontoFeil) || (e.status !== 403 && e.status !== 404)) throw e;
    svar = await konto.del(mal, bilde);
  }
  huskDeling(dok.id, {
    id: svar.id,
    nokkel: svar.nokkel ?? tidligere?.nokkel ?? '',
    tittel: dok.navn,
    delt: new Date().toISOString(),
  });
  return { ny: svar.ny };
}

/** Take the project's published copy down again. */
export async function fjernFraGalleriet(dok: Dokument): Promise<void> {
  const tidligere = tidligerePublisert(dok);
  if (!tidligere) return;
  try {
    await konto.slettSkilt(tidligere.id, tidligere.nokkel || undefined);
  } catch (e) {
    if (!(e instanceof KontoFeil && e.status === 404)) throw e;
  }
  huskDeling(dok.id, null);
}

/** A sign from the gallery as a template to start from. */
export async function hentDeltMal(id: string): Promise<Mal> {
  const svar = await konto.bruk(id);
  const mal = rensMal({ ...(svar.mal as object), id: `delt-${id}` });
  if (!mal) throw new Error('Skiltet kunne ikke åpnes.');
  return { ...mal, skaper: svar.skaper, eier: svar.skaper };
}
