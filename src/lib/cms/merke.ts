/** Small helpers every page may load, kept apart from the CMS client so visitors don't download it. */

/** Readable marker set by the server at sign-in (no secret). Lets pages skip the API for visitors. */
export const harCmsMerke = (kaker: string): boolean => /(?:^|;\s*)dp_cms=1(?:;|$)/.test(kaker);

/** Page path without the site's base, as the field list stores it. */
export function sideSti(pathname: string, base: string): string {
  const rot = base.endsWith('/') ? base : `${base}/`;
  const sti = pathname.startsWith(rot) ? `/${pathname.slice(rot.length)}` : pathname;
  return sti.endsWith('/') ? sti : `${sti}/`;
}
