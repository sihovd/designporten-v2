/**
 * Price of one configured product. No pricing rules are invented: the price
 * is the product's own price plus the custom-text surcharge the product
 * declares. When any part is not set, the result is null (no price shown).
 */

export interface ValgteValg {
  farge: string;
  materiale: string;
  tekst?: string;
}

interface Prisgrunnlag {
  prisOre: number | null;
  egenTekst: { maksTegn: number; tilleggOre: number | null } | null;
}

export function harTekst(valg: Partial<ValgteValg>): boolean {
  return (valg.tekst ?? '').trim().length > 0;
}

export function beregnPris(p: Prisgrunnlag, valg: Partial<ValgteValg>): number | null {
  if (p.prisOre === null) return null;
  if (p.egenTekst && harTekst(valg)) {
    return p.egenTekst.tilleggOre === null ? null : p.prisOre + p.egenTekst.tilleggOre;
  }
  return p.prisOre;
}

/** The choices as a Record for the cart line (empty text is left out). */
export function valgTilPoster(valg: ValgteValg): Record<string, string> {
  const ut: Record<string, string> = { farge: valg.farge, materiale: valg.materiale };
  if (harTekst(valg)) ut.tekst = valg.tekst!.trim();
  return ut;
}
