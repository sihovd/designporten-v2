import { bakgrunner, utklippbilder, type Bilde } from '@/lib/ressurser';

/** Looks up a registry image by key, for example `bakgrunner.verksted` or `utklippbilder.spiralvase`. */
export function finnBilde(nokkel: string | undefined): Bilde | undefined {
  if (!nokkel) return undefined;
  const [gruppe, navn] = nokkel.split('.');
  if (!navn) return undefined;
  if (gruppe === 'bakgrunner') return (bakgrunner as Record<string, Bilde>)[navn];
  if (gruppe === 'utklippbilder') return (utklippbilder as Record<string, Bilde>)[navn];
  return undefined;
}
