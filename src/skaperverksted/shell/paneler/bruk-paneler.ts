/** Preact binding for the panel layout: reducer, storage and where a closed panel reopens. */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import type { GeneratorUi } from '../../core/generator';
import { byggOppsett, finnGruppe, type Plassering } from './modell';
import {
  lesLager,
  panelReduser,
  skrivLager,
  type PanelHandling,
  type PanelLager,
  type RomKontekst,
} from './lager';

export function brukPaneler(generatorId: string, ui: GeneratorUi, smal: boolean) {
  const kontekst = useMemo<RomKontekst>(
    () => ({
      paneler: (ui.Paneler ?? []).map((p) => ({ id: p.id, flytB: p.flytB, flytH: p.flytH })),
      rom: ui.Arbeidsrom ?? [],
      smal,
    }),
    [ui, smal],
  );
  const k = useRef(kontekst);
  k.current = kontekst;
  const [lager, send] = useReducer<PanelLager, PanelHandling, null>(
    (l, h) => panelReduser(l, h, k.current),
    null,
    () => lesLager(generatorId, kontekst),
  );
  const harPaneler = !!ui.Paneler?.length;
  const sist = useRef(lager);
  sist.current = lager;
  useEffect(() => {
    if (!harPaneler) return;
    const id = setTimeout(() => skrivLager(generatorId, lager), 300);
    return () => clearTimeout(id);
  }, [generatorId, lager, harPaneler]);
  // a reload right after a change must not lose it
  useEffect(() => {
    if (!harPaneler) return;
    const skriv = () => skrivLager(generatorId, sist.current);
    window.addEventListener('pagehide', skriv);
    return () => window.removeEventListener('pagehide', skriv);
  }, [generatorId, harPaneler]);

  /** Where a closed panel comes back: where the first workspace that has it puts it, else the right dock. */
  const standardPlass = useCallback((panelId: string): Plassering => {
    for (const r of k.current.rom) {
      const g = finnGruppe(byggOppsett(r, k.current.paneler, k.current.smal), panelId);
      if (g) return g.plass;
    }
    return { type: 'dokk', side: 'hoyre' };
  }, []);

  return { lager, send, standardPlass, kontekst };
}
