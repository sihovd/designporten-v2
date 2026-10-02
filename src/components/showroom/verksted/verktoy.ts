/**
 * The four Forge tools as the showroom presents them (design revision
 * 2026-10-02, §11): the registered generators in their order, followed by
 * Clicker Forge, which is planned and has no tool yet. A planned tool has no
 * link and no preview; it is shown as planned, never as working.
 */
import { katalog } from '@/skaperverksted/generatorer';

export type Forhandsvisning = 'signgen' | 'lampe' | 'drage';

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

const forhandsvisbare = new Set<string>(['signgen', 'lampe', 'drage']);

export const verktoy: Verktoy[] = [
  ...katalog.map((g) => ({
    id: g.id,
    navn: g.navn,
    undertittel: g.undertittel,
    beskrivelse: g.beskrivelse,
    status: g.status,
    href: `/skaperverksted/${g.id}/`,
    forhandsvisning: forhandsvisbare.has(g.id) ? (g.id as Forhandsvisning) : undefined,
  })),
  {
    id: 'clicker',
    navn: 'Clicker Forge',
    undertittel: 'Planlagt verktøy',
    beskrivelse: 'Det neste verktøyet i Skaperverkstedet. Det er ikke klart ennå.',
    status: 'planlagt',
  },
];
