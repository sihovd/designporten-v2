/** «Innstillinger» in the workshop bar: colour mode and editor background. Per user, not per project. */
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { Ikon } from './ikoner';
import { useLukkMeny } from './lukk-meny';
import {
  BAKGRUNNER,
  bakgrunnErLys,
  brukInnstillinger,
  gyldigHex,
  horisontFraFarge,
  settInnstillinger,
  type Bakgrunn,
  type Temavalg,
} from './innstillinger';
import type { Horisont } from './tema';

const TEMAER: [Temavalg, string][] = [
  ['standard', 'Standard'],
  ['lys', 'Lys'],
  ['mork', 'Mørk'],
];

function prove(h: Horisont | null): string {
  if (!h) return 'repeating-linear-gradient(45deg, var(--panel-2) 0 6px, var(--panel) 6px 12px)';
  return `linear-gradient(180deg, ${h.topp} 0%, ${h.hoy} 40%, ${h.linje} 62%, ${h.bunn} 100%)`;
}

export function Innstillingsmeny({ children }: { children?: ComponentChildren }) {
  const rot = useRef<HTMLDetailsElement>(null);
  useLukkMeny(rot);
  const inn = brukInnstillinger();
  const egen: Bakgrunn = { id: 'egen', navn: 'Egen farge', horisont: horisontFraFarge(inn.egenFarge) };
  return (
    <details class="filmeny innstillinger" ref={rot}>
      <summary class="med-ikon fil-sammendrag">
        <Ikon id="settings" storrelse={16} />
        <span class="fil-tekst">Innstillinger</span>
      </summary>
      <div class="meny innstillingsmeny">
        <p class="meny-overskrift">Utseende</p>
        <div class="valgrad" role="radiogroup" aria-label="Lys eller mørk modus">
          {TEMAER.map(([id, navn]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={inn.tema === id}
              onClick={() => settInnstillinger({ tema: id })}
            >
              {navn}
            </button>
          ))}
        </div>
        <p class="meny-overskrift">Bakgrunn i editoren</p>
        <div class="bakgrunnsvalg" role="radiogroup" aria-label="Bakgrunn i editoren">
          {[...BAKGRUNNER, egen].map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              class="bakgrunnsknapp"
              aria-checked={inn.bakgrunn === b.id}
              aria-label={b.navn}
              title={b.navn}
              style={{ background: prove(b.horisont) }}
              onClick={() => settInnstillinger({ bakgrunn: b.id })}
            />
          ))}
        </div>
        <label class="egenfarge">
          <span>Egen farge</span>
          <input
            type="color"
            value={inn.egenFarge}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              if (gyldigHex(v)) settInnstillinger({ bakgrunn: 'egen', egenFarge: v });
            }}
          />
        </label>
        {inn.bakgrunn === 'egen' && bakgrunnErLys(egen.horisont!) && (
          <p class="meny-merknad">Lys bakgrunn: linjer og tekst på lerretet blir mørke.</p>
        )}
        <p class="meny-overskrift">Måleenheter</p>
        <p class="meny-merknad">Millimeter (metrisk). Flere enheter er ikke laget ennå.</p>
        {children}
        <p class="meny-merknad">Disse valgene gjelder deg i denne nettleseren, ikke selve prosjektet.</p>
      </div>
    </details>
  );
}
