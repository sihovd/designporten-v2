/**
 * Inline text editing on the pages: the part that does not touch the page.
 * Editing itself is Studio's (the CMS on one.com, src/scripts/cmsverktoy.ts);
 * the old editor that saved to GitHub through /admin was removed on
 * 2026-11-11, when everything moved into Studio.
 */

export type Felttype = 'linje' | 'avsnitt';

/**
 * The text an element holds, as it is stored: one line with single spaces, or
 * paragraphs separated by a blank line.
 */
export function normaliser(tekst: string, type: Felttype): string {
  if (type === 'linje') return tekst.replace(/\s+/g, ' ').trim();
  return tekst
    .split(/\n\s*\n|\n/)
    .map((a) => a.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}
