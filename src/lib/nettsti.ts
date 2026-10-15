/** App-local URLs. Leave external URLs and fragments alone; never prefix twice. */
export function medBase(sti: string, base: string): string {
  if (!sti.startsWith('/') || sti.startsWith('//') || base === '/') return sti;
  const rot = base.replace(/\/$/, '');
  if (sti === rot || sti.startsWith(`${rot}/`)) return sti;
  return `${rot}${sti}`;
}

export const nettsti = (sti: string): string => medBase(sti, import.meta.env.BASE_URL);
export const testmiljo = import.meta.env.PUBLIC_DP_TEST === 'true';
export const phpmiljo = import.meta.env.PUBLIC_DP_PHP === 'true';

/** A subdirectory shares its origin with production, but must not share carts/designs. */
export const lagernokkel = (nokkel: string): string =>
  import.meta.env.BASE_URL === '/' ? nokkel : `${import.meta.env.BASE_URL}:${nokkel}`;
