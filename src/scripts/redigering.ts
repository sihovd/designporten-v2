/**
 * Starts inline text editing only for someone signed in to Studio (/cms/) in
 * this browser, and only on pages with editable texts. Everyone else loads
 * nothing more than this check.
 */
import { harCmsMerke } from '@/lib/cms/merke';
import { phpmiljo } from '@/lib/nettsti';

export function startRedigering() {
  if (!document.querySelector('[data-rediger]')) return;
  // The CMS is the source of truth for page texts (docs/cms/README.md).
  if (phpmiljo && harCmsMerke(document.cookie)) void import('./cmsverktoy').then((m) => m.startCmsVerktoy());
}
