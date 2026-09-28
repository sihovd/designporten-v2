import type { Arbeidsbenk } from '../core/arbeidsbenk';
import { brukUtdrag } from './bruk-benk';
import { mal } from './mal';
import { tall } from '../core/enheter';

export function Statuslinje({ benk }: { benk: Arbeidsbenk }) {
  const modell = brukUtdrag(benk, (t) => t.modell);
  const bygger = brukUtdrag(benk, (t) => t.bygger);
  const zoom = brukUtdrag(benk, (t) => t.utsnitt.zoom);
  const visning = brukUtdrag(benk, (t) => t.innstillinger.visning);
  const m = modell ? mal(modell.deler) : null;
  const advarsler = modell?.advarsler.filter((a) => a.niva !== 'info') ?? [];
  return (
    <footer class="statuslinje">
      <span class="mono">
        {m ? (
          <>
            {tall(m.bredde)} × {tall(m.dybde)} × {tall(m.hoyde)} mm
          </>
        ) : (
          'Ingen modell ennå'
        )}
      </span>
      {m && <span class="mono">{m.deler === 1 ? '1 del' : `${m.deler} deler`}</span>}
      {m && (
        <span class="mono">
          {benk.generator.delerOverlapper ? 'opptil ' : ''}
          {tall(m.volum / 1000, 1)} cm³ massivt
        </span>
      )}
      {visning === '2d' && <span class="mono">{Math.round(zoom * 100)} %</span>}
      <span class="mono" aria-hidden={!bygger}>
        {bygger ? 'Bygger modell …' : ''}
      </span>
      {advarsler.length > 0 && (
        <details class="statusvarsel">
          <summary class="mono">
            {advarsler.length === 1 ? '1 merknad' : `${advarsler.length} merknader`}
          </summary>
          <ul class="merknader statusliste">
            {advarsler.map((a, i) => (
              <li key={i} class={a.niva}>
                {a.tekst}
              </li>
            ))}
          </ul>
        </details>
      )}
    </footer>
  );
}
