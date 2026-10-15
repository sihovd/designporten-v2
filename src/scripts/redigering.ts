/**
 * Starts inline text editing only for someone signed in in this browser, and
 * only on pages with editable texts: the CMS editor when signed in to /cms/
 * (PHP build), otherwise the GitHub editor when signed in to /admin. Everyone
 * else loads nothing more than this check.
 */
import { harCmsMerke } from '@/lib/cms/merke';
import { phpmiljo } from '@/lib/nettsti';
import { lesToken } from '@/lib/redigering/kjerne';

export function startRedigering() {
  if (!document.querySelector('[data-rediger]')) return;
  // On the PHP build the CMS is the source of truth for page texts (docs/cms/README.md).
  if (phpmiljo && harCmsMerke(document.cookie)) {
    void import('./cmsverktoy').then((m) => m.startCmsVerktoy());
    return;
  }
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
