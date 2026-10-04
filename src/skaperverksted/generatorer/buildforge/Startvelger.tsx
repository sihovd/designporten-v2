/**
 * «La oss bygge en …» (handoff §3). Each start gives exactly one part, the
 * Main Body, and the user builds the rest from the library. The clicker
 * family is offered too, with its templates. Opens by itself for a new
 * document (no start chosen yet) and from «Start på nytt».
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { Dialog } from '../../shell/Dialog';
import { startmaler } from './bibliotek';
import { velgMal, velgStart } from './handlinger';
import { finnKroppsmal, starter } from './kroppsbibliotek';
import { tolkParametre } from './parametre';
import { brukEditor, editor } from './tilstand';

/** Documents where the user closed the picker without choosing; it does not come back by itself. */
const avvist = new Set<string>();

export function Startvelger({ benk }: { benk: Arbeidsbenk }) {
  const e = brukEditor();
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const dokId = brukUtdrag(benk, (t) => t.dok.id);
  const [, settN] = useState(0);
  const t = tolkParametre(raw);
  const ny = t.ok && t.p.mal === 'ny' && !avvist.has(dokId);
  if (!e.startvelger && !ny) return null;

  const lukk = () => {
    avvist.add(dokId);
    editor.sett({ startvelger: false });
    settN((x) => x + 1);
  };

  return (
    <Dialog tittel="La oss bygge en …" lukk={lukk} klasse="bf-startvelger">
      <div class="bf-start-innhold">
        <p class="bf-start-ingress">
          Velg en hovedkropp. Du bygger resten selv ved å dra kroppsdeler fra biblioteket til den.
        </p>
        <ul class="bf-starter" role="list">
          {starter.map((s) => {
            const mal = finnKroppsmal(s.kropp);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  class="bf-start"
                  onClick={() => {
                    avvist.add(dokId);
                    velgStart(benk, s.id);
                  }}
                >
                  <strong>{s.navn}</strong>
                  <span>{s.beskrivelse}</span>
                  {mal && <span class="dempet">Starter med: {mal.navn.toLowerCase()}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <h3 class="bf-kropp-tittel">Eller lag en klikker</h3>
        <p class="merknad">En figur som sitter på en tastaturbryter og klikker når du trykker på den.</p>
        <ul class="bf-starter bf-starter--sma" role="list">
          {startmaler.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                class="bf-start"
                onClick={() => {
                  avvist.add(dokId);
                  editor.sett({ startvelger: false, kropp: null, inne: null });
                  velgMal(benk, m.id);
                }}
              >
                <strong>{m.navn}</strong>
                <span>{m.beskrivelse}</span>
              </button>
            </li>
          ))}
        </ul>
        <p class="merknad">Å starte på nytt erstatter modellen. Angre henter den tilbake.</p>
      </div>
    </Dialog>
  );
}
