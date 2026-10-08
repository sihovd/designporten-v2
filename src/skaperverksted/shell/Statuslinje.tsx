import type { Arbeidsbenk } from '../core/arbeidsbenk';
import { brukUtdrag } from './bruk-benk';
import { mal } from './mal';
import { tall } from '../core/enheter';

export function Statuslinje({ benk }: { benk: Arbeidsbenk }) {
  const modell = brukUtdrag(benk, (t) => t.modell);
  const bygger = brukUtdrag(benk, (t) => t.bygger);
  const foreldet = brukUtdrag(benk, (t) => t.modellForeldet);
  const dok = brukUtdrag(benk, (t) => t.dok);
  const zoom = brukUtdrag(benk, (t) => t.utsnitt.zoom);
  const visning = brukUtdrag(benk, (t) => t.innstillinger.visning);
  // while 2D is edited the model is not rebuilt: show the size from the drawing and say what waits for 3D
  const venter3d = visning === '2d' && foreldet && !!benk.generator.forelopigMal;
  const m = venter3d ? null : modell ? mal(modell.deler) : null;
  const forelopig = venter3d ? benk.generator.forelopigMal!(dok) : null;
  const advarsler = venter3d ? [] : (modell?.advarsler.filter((a) => a.niva !== 'info') ?? []);
  return (
    <footer class="statuslinje">
      <span class="mono">
        {m ? (
          <>
            {tall(m.bredde)} × {tall(m.dybde)} × {tall(m.hoyde)} mm
          </>
        ) : forelopig ? (
          <>
            {tall(forelopig.bredde)} × {tall(forelopig.dybde)} × {tall(forelopig.hoyde)} mm
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
      {venter3d && (
        <span class="mono dempet venter3d">Deler, volum og merknader beregnes når du åpner 3D</span>
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
