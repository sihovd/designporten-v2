/** The help search: which short answers match what was typed. Pure, so it can be tested. */
import type { Hjelpeemne } from '../core/generator';

const normaliser = (s: string) => s.toLowerCase().replace(/[«»"'.,;:!?()]/g, ' ');

/** Topics that contain every word typed (start of word is enough), best matches in the question first. */
export function sokHjelp(emner: Hjelpeemne[], tekst: string, maks = 6): Hjelpeemne[] {
  const ord = normaliser(tekst).split(/\s+/).filter(Boolean);
  if (!ord.length) return [];
  const treff: { e: Hjelpeemne; poeng: number }[] = [];
  for (const e of emner) {
    const sporsmal = normaliser(e.sporsmal);
    const alt = `${sporsmal} ${normaliser(e.svar)} ${normaliser(e.ord ?? '')}`;
    let poeng = 0;
    let alle = true;
    for (const o of ord) {
      const iSporsmal = sporsmal.split(/\s+/).some((x) => x.startsWith(o));
      const iAlt = alt.split(/\s+/).some((x) => x.startsWith(o));
      if (!iAlt) {
        alle = false;
        break;
      }
      poeng += iSporsmal ? 2 : 1;
    }
    if (alle) treff.push({ e, poeng });
  }
  return treff
    .sort((a, b) => b.poeng - a.poeng)
    .slice(0, maks)
    .map((t) => t.e);
}
