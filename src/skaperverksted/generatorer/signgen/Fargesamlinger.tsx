/**
 * Colour collections (Sivert, 2026-10-16): about a hundred ready-made sets of colours that go together,
 * browsable by group, and «Lag samling»: pick a number of colours with a colour picker, name them and
 * save the set. Used in the start window and in the Fargeprofil panel; the caller decides what choosing a
 * collection does.
 */
import { useId, useState } from 'preact/hooks';
import {
  MAKS_SAMLINGSFARGER,
  MIN_SAMLINGSFARGER,
  SAMLINGER,
  SAMLINGSGRUPPER,
  fargenavn,
  filamenterForSamling,
  lagEgenSamling,
  type Fargesamling,
} from './fargesamlinger';

const START_FARGER = ['#f4f6f8', '#2f4858', '#86a5b8', '#d9a441'];

export function Samlingsvelger({
  bruk,
  valgt = null,
  kompakt = false,
}: {
  /** The collection was chosen (or made): its filament ids and its name. */
  bruk: (ider: string[], navn: string, lagret: boolean) => void;
  /** Id of the collection in use, if any. */
  valgt?: string | null;
  kompakt?: boolean;
}) {
  const id = useId();
  const [gruppe, settGruppe] = useState<string>('Alle');
  const [apen, settApen] = useState(false);
  const [antall, settAntall] = useState(START_FARGER.length);
  const [farger, settFarger] = useState<string[]>(START_FARGER);
  const [navn, settNavn] = useState('');
  const [melding, settMelding] = useState<string | null>(null);
  const liste = gruppe === 'Alle' ? SAMLINGER : SAMLINGER.filter((s) => s.gruppe === gruppe);

  const velg = (s: Fargesamling) => {
    bruk(filamenterForSamling(s.farger), s.navn, false);
  };
  const settAntallFarger = (n: number) => {
    const ant = Math.min(
      MAKS_SAMLINGSFARGER,
      Math.max(MIN_SAMLINGSFARGER, Math.round(n) || MIN_SAMLINGSFARGER),
    );
    settAntall(ant);
    // new slots get a colour that goes with the last one, so the set is never left with a black hole
    settFarger((f) => Array.from({ length: ant }, (_, i) => f[i] ?? START_FARGER[i % START_FARGER.length]!));
  };
  const lag = (e: Event) => {
    e.preventDefault();
    const r = lagEgenSamling(navn, farger);
    if (!r) {
      settMelding('Gi samlingen et navn og velg minst to farger.');
      return;
    }
    settMelding(
      r.lagret
        ? `«${navn.trim()}» er laget og lagret i «Mine profiler» i denne nettleseren.`
        : `«${navn.trim()}» er laget, men nettleseren ville ikke lagre den. Den virker likevel nå.`,
    );
    bruk(r.ider, navn.trim(), r.lagret);
    settNavn('');
  };

  return (
    <div class={`samlinger${kompakt ? ' kompakt' : ''}`}>
      <div class="samlingfilter" role="group" aria-label="Vis fargesamlinger">
        {['Alle', ...SAMLINGSGRUPPER].map((g) => (
          <button
            key={g}
            type="button"
            class={`kontroll-knapp${gruppe === g ? ' valgt' : ''}`}
            aria-pressed={gruppe === g}
            onClick={() => settGruppe(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <p class="dempet" role="status">
        {liste.length} samlinger. Trykk på en for å bruke den; den kan finjusteres etterpå.
      </p>
      <ul class="samlingrutenett" role="list">
        {liste.map((s) => {
          return (
            <li key={s.id}>
              <button
                type="button"
                class={`samlingskort${valgt === s.id ? ' valgt' : ''}`}
                aria-pressed={valgt === s.id}
                onClick={() => velg(s)}
                title={s.farger.map((h) => `${h.toUpperCase()} ${fargenavn(h).toLowerCase()}`).join(', ')}
              >
                <span class="samlingfarger" aria-hidden="true">
                  {s.farger.map((h) => (
                    <span key={h} style={{ background: h }} />
                  ))}
                </span>
                <span class="samlingnavn">{s.navn}</span>
                <span class="visuelt-skjult">
                  : {s.farger.map((h) => `${h.toUpperCase()} ${fargenavn(h).toLowerCase()}`).join(', ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <details
        class="samlinglag"
        open={apen}
        onToggle={(e) => settApen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>Lag din egen samling</summary>
        <form onSubmit={lag} aria-label="Lag samling">
          <label class="felt" for={`${id}-antall`}>
            <span>Antall farger</span>
            <input
              id={`${id}-antall`}
              type="number"
              min={MIN_SAMLINGSFARGER}
              max={MAKS_SAMLINGSFARGER}
              step={1}
              value={antall}
              onInput={(e) => settAntallFarger(Number((e.target as HTMLInputElement).value))}
            />
          </label>
          <ul class="samlingvelgere" role="list">
            {farger.map((h, i) => (
              <li key={i}>
                <input
                  type="color"
                  value={h}
                  aria-label={`Farge ${i + 1}, ${h.toUpperCase()}, ${fargenavn(h).toLowerCase()}`}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    settFarger((f) => f.map((x, j) => (j === i ? v : x)));
                  }}
                />
                <span class="mono">{h.toUpperCase()}</span>
              </li>
            ))}
          </ul>
          <label class="felt stablet" for={`${id}-navn`}>
            <span>Navn på samlingen</span>
            <input
              id={`${id}-navn`}
              type="text"
              maxLength={40}
              placeholder="for eksempel «Bursdag»"
              value={navn}
              onInput={(e) => settNavn((e.target as HTMLInputElement).value)}
            />
          </label>
          <button type="submit" class="primar" disabled={!navn.trim()}>
            Lag samling
          </button>
          {melding && (
            <p class="merknad" role="status">
              {melding}
            </p>
          )}
        </form>
      </details>
    </div>
  );
}
