/**
 * Human names for CMS fields, from the page-text definitions:
 * «sider/forside#snarveier.0.tittel» → «Snarveier 1 › Tittel».
 */
import { sider, type Felt, type SideId } from '@/lib/sidetekster/definisjon';

export function feltEtikett(felt: Record<string, Felt>, sti: string[]): string | null {
  const deler: string[] = [];
  let naa: Record<string, Felt> | undefined = felt;
  for (let i = 0; i < sti.length; i++) {
    const f: Felt | undefined = naa?.[sti[i]!];
    if (!f) return null;
    if (f.type === 'tekst') {
      deler.push(f.etikett);
      return i === sti.length - 1 ? deler.join(' › ') : null;
    }
    if (f.type === 'gruppe') {
      deler.push(f.etikett);
      naa = f.felt;
    } else {
      const nr = Number(sti[++i]);
      if (!Number.isInteger(nr)) return null;
      deler.push(`${f.entall} ${nr + 1}`);
      naa = f.felt;
    }
  }
  return null;
}

/** Page name and field name for a CMS key, or null for keys outside the page texts. */
export function cmsEtikett(nokkel: string): { side: string; sideId: string; felt: string } | null {
  const m = /^sider\/([a-z0-9-]+)#(.+)$/.exec(nokkel);
  if (!m || !(m[1]! in sider)) return null;
  const side = sider[m[1] as SideId];
  return { side: side.etikett, sideId: m[1]!, felt: feltEtikett(side.felt, m[2]!.split('.')) ?? m[2]! };
}
