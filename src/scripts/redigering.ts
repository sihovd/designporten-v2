/**
 * Starts inline text editing only for someone signed in to /admin in this
 * browser, and only on pages with editable texts. Everyone else loads nothing
 * more than this check.
 */
import { lesToken } from '@/lib/redigering/kjerne';

export function startRedigering() {
  if (!document.querySelector('[data-rediger]')) return;
  let lager: Storage | undefined;
  try {
    lager = window.localStorage;
  } catch {
    return;
  }
  const token = lesToken(lager);
  if (!token) return;
  void import('./redigeringsverktoy').then((m) => m.startVerktoy(token));
}
