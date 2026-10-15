/** A small search field for help: short, concrete answers to «how do I …». */
import { useId, useRef, useState } from 'preact/hooks';
import type { Hjelpeemne } from '../core/generator';
import { Ikon } from './ikoner';
import { sokHjelp } from './hjelpesok';

export function Hjelpesok({ emner, klasse = '' }: { emner: Hjelpeemne[]; klasse?: string }) {
  const [tekst, settTekst] = useState('');
  const [apen, settApen] = useState(false);
  const rot = useRef<HTMLDivElement>(null);
  const id = useId();
  const treff = sokHjelp(emner, tekst);
  const vis = apen && tekst.trim().length > 0;
  return (
    <div
      ref={rot}
      class={`hjelpesok ${klasse}`}
      role="search"
      onFocusOut={(e) => {
        if (!rot.current?.contains(e.relatedTarget as Node | null)) settApen(false);
      }}
    >
      <label class="hjelpesok-felt">
        <Ikon id="search" storrelse={16} />
        <span class="visuelt-skjult">Søk i hjelp</span>
        <input
          type="search"
          placeholder="Søk i hjelp"
          autoComplete="off"
          value={tekst}
          aria-controls={`${id}-treff`}
          onInput={(e) => {
            settTekst((e.target as HTMLInputElement).value);
            settApen(true);
          }}
          onFocus={() => settApen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (tekst) {
                e.stopPropagation();
                settTekst('');
              }
              settApen(false);
            }
          }}
        />
      </label>
      <div class="hjelpesok-treff" id={`${id}-treff`} hidden={!vis} aria-live="polite">
        {vis &&
          (treff.length ? (
            <ul role="list">
              {treff.map((e) => (
                <li key={e.sporsmal}>
                  <strong>{e.sporsmal}</strong>
                  <span>{e.svar}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="hjelpesok-tomt">Ingen treff. Prøv et annet ord.</p>
          ))}
      </div>
    </div>
  );
}
