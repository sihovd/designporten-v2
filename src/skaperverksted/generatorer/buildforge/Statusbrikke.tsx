/**
 * Compact check status on the canvas for the modular builder (handoff §41):
 * «✓ Modell OK», «⚠ 2 problemer» or «● Kan ikke eksporteres». It opens the
 * findings; each finding points out the shapes it is about. The physical
 * status (not test-printed) is always said next to it, so green is never
 * read as printable.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { erBuildforgeResultat } from './bygg';
import { brukStatus, statusTekst } from './Inspektor';
import { Funnrad } from './Klikkbrett';
import { familieFor } from './parametre';
import { editor } from './tilstand';

export function Statusbrikke({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const status = brukStatus(benk);
  const m = erBuildforgeResultat(t.modell) ? t.modell : null;
  const funn = m?.kontroll.funn ?? [];
  const [vis, settVis] = useState(false);
  const [apen, settApen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const modul = familieFor(t.dok.parametre as { familie?: 'klikker' | 'modul' }) === 'modul';
  useEffect(() => settApen(null), [m]);
  useEffect(() => {
    if (!vis) return;
    const utenfor = (ev: PointerEvent) => {
      if (!ref.current?.contains(ev.target as Node)) settVis(false);
    };
    window.addEventListener('pointerdown', utenfor, true);
    return () => window.removeEventListener('pointerdown', utenfor, true);
  }, [vis]);
  if (!modul) return null;

  const problemer = funn.filter((f) => f.niva !== 'info').length;
  const tekst =
    status === 'beregner'
      ? 'Kontrollerer …'
      : status === 'rod'
        ? 'Kan ikke eksporteres'
        : status === 'gul'
          ? `${problemer} ${problemer === 1 ? 'problem' : 'problemer'}`
          : 'Modell OK';
  const symbol = status === 'beregner' ? '…' : status === 'rod' ? '●' : status === 'gul' ? '⚠' : '✓';
  return (
    <div
      ref={ref}
      class="bf-statusbrikke"
      data-status={status}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape' && vis) {
          ev.stopPropagation();
          settVis(false);
          ref.current?.querySelector<HTMLButtonElement>('#bf-kontroll')?.focus();
        }
      }}
    >
      <button
        type="button"
        id="bf-kontroll"
        class="bf-brikke"
        aria-expanded={vis}
        aria-controls="bf-funnliste"
        onClick={() => settVis(!vis)}
      >
        <span class="bf-brikke-symbol" aria-hidden="true">
          {symbol}
        </span>
        {tekst}
        <span class="visuelt-skjult"> (digital kontroll: {statusTekst[status].navn})</span>
      </button>
      {vis && (
        <div class="bf-statuskort" role="region" aria-label="Kontroll av modellen">
          <p class="bf-statuskort-linje">
            <strong>Digital kontroll: {statusTekst[status].navn}.</strong> {statusTekst[status].forklaring}
          </p>
          <ul id="bf-funnliste" class="bf-funnliste" role="list" aria-live="polite">
            {status === 'beregner' && <li class="bf-funn">Kontrollerer modellen …</li>}
            {status !== 'beregner' && !funn.length && (
              <li class="bf-funn info">Ingen problemer funnet for leddprofilene.</li>
            )}
            {status !== 'beregner' &&
              funn.map((f, i) => (
                <Funnrad
                  key={`${f.regel}-${i}`}
                  f={f}
                  valgt={apen === i}
                  velg={() => {
                    const ny = apen === i ? null : i;
                    settApen(ny);
                    editor.sett({ merket: ny === null ? [] : f.objekter });
                  }}
                />
              ))}
          </ul>
          <p class="bf-statuskort-fysisk">
            Fysisk: <strong>ikke testet</strong>. Ingen del er testprintet, så grønt betyr ikke at modellen er
            trygg eller garantert printbar.
          </p>
        </div>
      )}
    </div>
  );
}
