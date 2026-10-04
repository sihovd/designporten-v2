/**
 * Bottom tray: «Prøv klikk» and the check results (handoff §4 and §9).
 * The click preview moves the top through the travel; it is only a
 * picture, the collision check runs on the model in every build. Each
 * finding is a button that points out the shapes it is about.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { tall } from '../../core/enheter';
import { reduserBevegelse } from '../../shell/tema';
import { brukBenk } from '../../shell/bruk-benk';
import { erBuildforgeResultat, evidensTekst, type Funn } from './bygg';
import { brukStatus, statusTekst } from './Inspektor';
import { familieFor } from './parametre';
import { MX_PROVE } from './profil';
import { brukEditor, editor } from './tilstand';

const VANDRING = MX_PROVE.bryter.vandring.verdi;

/** Press and release once. Reduced motion shows the bottom position briefly, without movement. */
export function spillKlikk(): () => void {
  if (reduserBevegelse()) {
    editor.sett({ trykk: VANDRING });
    const id = setTimeout(() => editor.sett({ trykk: 0 }), 700);
    return () => clearTimeout(id);
  }
  const start = performance.now();
  const varighet = 700;
  let id = 0;
  const steg = (na: number) => {
    const t = Math.min(1, (na - start) / varighet);
    // down in the first 40 %, hold, back up in the last 40 %
    const s = t < 0.4 ? t / 0.4 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    editor.sett({ trykk: Math.round(VANDRING * s * 100) / 100 });
    if (t < 1) id = requestAnimationFrame(steg);
  };
  id = requestAnimationFrame(steg);
  return () => cancelAnimationFrame(id);
}

function Funnrad({ f, valgt, velg }: { f: Funn; valgt: boolean; velg: () => void }) {
  return (
    <li class={`bf-funn ${f.niva}`}>
      <button type="button" aria-expanded={valgt} onClick={velg}>
        <span class="bf-funn-symbol" aria-hidden="true">
          {f.niva === 'feil' ? '×' : f.niva === 'advarsel' ? '!' : 'i'}
        </span>
        <span class="visuelt-skjult">
          {f.niva === 'feil' ? 'Feil: ' : f.niva === 'advarsel' ? 'Vurder: ' : 'Info: '}
        </span>
        {f.tittel}
      </button>
      {valgt && (
        <div class="bf-funn-detalj">
          <p>{f.arsak}</p>
          <p>{f.konsekvens}</p>
          <p>
            <strong>Slik retter du:</strong> {f.forslag}
          </p>
          <p class="dempet mono">
            {f.regel} · {evidensTekst[f.evidens]}
          </p>
        </div>
      )}
    </li>
  );
}

export function Klikkbrett({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const e = brukEditor();
  const status = brukStatus(benk);
  const m = erBuildforgeResultat(t.modell) ? t.modell : null;
  const funn = m?.kontroll.funn ?? [];
  const [apen, settApen] = useState<number | null>(null);
  const [vis, settVis] = useState(false);
  const stopp = useRef<(() => void) | null>(null);
  const antallFeil = funn.filter((f) => f.niva === 'feil').length;
  const p = t.dok.parametre as { familie?: 'klikker' | 'figur' };
  const klikker = familieFor(p) === 'klikker';

  useEffect(() => () => stopp.current?.(), []);
  // open the list by itself when something must be fixed
  useEffect(() => {
    if (status === 'rod') settVis(true);
  }, [status]);
  useEffect(() => settApen(null), [m]);

  const st = statusTekst[status];
  return (
    <div class="bf-brett">
      {klikker && (
        <div class="bf-klikk" role="group" aria-label="Prøv klikk">
          <label class="bf-trykk">
            <span>Prøv klikk</span>
            <input
              type="range"
              min={0}
              max={VANDRING}
              step={0.1}
              value={e.trykk}
              aria-valuetext={`${tall(e.trykk)} av ${tall(VANDRING)} millimeter nede`}
              onInput={(ev) => editor.sett({ trykk: Number((ev.target as HTMLInputElement).value) })}
            />
            <span class="mono bf-trykk-verdi" aria-hidden="true">
              {tall(e.trykk)} / {tall(VANDRING)} mm
            </span>
          </label>
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => {
              stopp.current?.();
              stopp.current = spillKlikk();
            }}
          >
            Klikk
          </button>
        </div>
      )}
      <div class="bf-kontroll">
        <button
          type="button"
          id="bf-kontroll"
          class="bf-kontroll-oppsummering"
          data-status={status}
          aria-expanded={vis}
          aria-controls="bf-funnliste"
          onClick={() => settVis(!vis)}
        >
          <span class="bf-status-symbol" aria-hidden="true">
            {st.symbol}
          </span>
          <span>
            Kontroll: <strong>{st.navn}</strong>
            {status !== 'beregner' &&
              ` · ${funn.length ? `${funn.length} ${funn.length === 1 ? 'merknad' : 'merknader'}` : 'ingen merknader'}`}
            {antallFeil > 0 && status !== 'beregner' && `, ${antallFeil} må rettes`}
          </span>
        </button>
        {vis && (
          <ul id="bf-funnliste" class="bf-funnliste" role="list" aria-live="polite">
            {status === 'beregner' && <li class="bf-funn">Kontrollerer modellen …</li>}
            {status !== 'beregner' && !funn.length && (
              <li class="bf-funn info">
                Ingen problemer funnet for {klikker ? 'prøveprofilen' : 'leddprofilen'}.
              </li>
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
                    editor.sett({
                      merket: ny === null ? [] : f.objekter,
                      valgt: ny === null ? editor.t.valgt : (f.objekter[0] ?? null),
                    });
                  }}
                />
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
