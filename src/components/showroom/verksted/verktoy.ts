import { nettsti } from '@/lib/nettsti';
/**
 * The Forge tools as the showroom presents them (design revision
 * 2026-10-02, §11): the registered generators in their order. Clicker Forge,
 * shown as planned until 2026-10-03, became BuildForge's first product family
 * (decision log 2026-10-03). A planned tool has no link and no preview; it is
 * shown as planned, never as working.
 */
import { katalog } from '@/skaperverksted/generatorer';

export type Forhandsvisning = 'signgen' | 'lampe' | 'drage' | 'buildforge';

export interface Verktoy {
  id: string;
  navn: string;
  undertittel: string;
  beskrivelse: string;
  status: 'tilgjengelig' | 'under-utvikling' | 'planlagt';
  /** Link to the tool; planned tools have none. */
  href?: string;
  forhandsvisning?: Forhandsvisning;
}

const forhandsvisbare = new Set<string>(['signgen', 'lampe', 'drage', 'buildforge']);

export const verktoy: Verktoy[] = [
  ...katalog.map((g) => ({
    id: g.id,
    navn: g.navn,
    undertittel: g.undertittel,
    beskrivelse: g.beskrivelse,
    status: g.status,
    href: nettsti(`/skaperverksted/${g.id}/`),
    forhandsvisning: forhandsvisbare.has(g.id) ? (g.id as Forhandsvisning) : undefined,
  })),
];
