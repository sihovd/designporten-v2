/**
 * The Transform and Hjelpelinjer panels (Sign Forge): numbers for the selection's box, and the guide
 * lines of the project, listed so they can be made, moved, locked and deleted without the mouse.
 * Align and distribute moved to the context bar (Kontekstlinje.tsx) on 2026-10-08.
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel, TallFelt } from '../../shell/kontroller';
import { Ikon } from '../../shell/ikoner';
import { redigerbare, utvalgsboks } from './handlinger';
import {
  flyttHjelpelinjeTil,
  hjelpelinjerAv,
  laasHjelpelinje,
  leggTilHjelpelinjeI,
  slettHjelpelinjeI,
} from './hjelpelinjer';
import { brukSigntilstand, signtilstand } from './tilstand';
import { flyttUtvalgTil, roterUtvalgTil, skalerUtvalgTil } from './transformer';

export function Transformpanel({ benk }: { benk: Arbeidsbenk }) {
  brukBenk(benk);
  const [laas, settLaas] = useState(true);
  const obj = redigerbare(benk);
  const b = utvalgsboks(obj);
  if (!b) return <p class="dempet panel-tom">Velg ett eller flere objekter for å se mål og plassering.</p>;
  const bredde = b.maksX - b.minX;
  const hoyde = b.maksY - b.minY;
  const enkelt = obj.length === 1 ? obj[0]! : null;
  return (
    <Panel tittel={enkelt ? enkelt.navn : `${obj.length} objekter`}>
      <div class="feltpar">
        <TallFelt
          etikett="Midtpunkt X"
          kortEtikett="X"
          verdi={(b.minX + b.maksX) / 2}
          steg={1}
          endre={(v, k) => flyttUtvalgTil(benk, v, undefined, k === 'pil' ? 'tf-x' : undefined)}
        />
        <TallFelt
          etikett="Midtpunkt Y"
          kortEtikett="Y"
          verdi={(b.minY + b.maksY) / 2}
          steg={1}
          endre={(v, k) => flyttUtvalgTil(benk, undefined, v, k === 'pil' ? 'tf-y' : undefined)}
        />
        <TallFelt
          etikett="Total bredde"
          kortEtikett="B"
          verdi={bredde}
          min={0.2}
          steg={1}
          endre={(v, k) => skalerUtvalgTil(benk, v, null, laas, k === 'pil' ? 'tf-b' : undefined)}
        />
        <TallFelt
          etikett="Total høyde"
          kortEtikett="H"
          verdi={hoyde}
          min={0.2}
          steg={1}
          endre={(v, k) => skalerUtvalgTil(benk, null, v, laas, k === 'pil' ? 'tf-h' : undefined)}
        />
      </div>
      <div class="transform-rad">
        {enkelt && (
          <TallFelt
            etikett="Rotasjon, transform"
            kortEtikett="↻"
            enhet="°"
            verdi={enkelt.transform.rotasjon}
            min={-360}
            maks={360}
            steg={15}
            endre={(v, k) => roterUtvalgTil(benk, v, k === 'pil' ? 'tf-rot' : undefined)}
          />
        )}
        <button
          type="button"
          class="minibryter las"
          aria-pressed={laas}
          title="Behold proporsjoner"
          onClick={() => settLaas(!laas)}
        >
          <Ikon id={laas ? 'lock' : 'unlock'} storrelse={16} />
          <span class="visuelt-skjult">Behold proporsjoner</span>
        </button>
      </div>
    </Panel>
  );
}

export function Hjelpelinjepanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const guider = hjelpelinjerAv(t.dok);
  return (
    <>
      <Panel
        tittel="Hjelpelinjer"
        handling={
          <button
            type="button"
            class="kontroll-knapp"
            aria-pressed={t.innstillinger.hjelpelinjer}
            onClick={() => benk.settInnstillinger({ hjelpelinjer: !t.innstillinger.hjelpelinjer })}
          >
            {t.innstillinger.hjelpelinjer ? 'Skjul' : 'Vis'}
          </button>
        }
      >
        <div class="knapperad">
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => signtilstand(benk).sett({ valgtGuide: leggTilHjelpelinjeI(benk, 'x', 0).id })}
          >
            + Loddrett
          </button>
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => signtilstand(benk).sett({ valgtGuide: leggTilHjelpelinjeI(benk, 'y', 0).id })}
          >
            + Vannrett
          </button>
        </div>
        {guider.length === 0 ? (
          <p class="merknad">
            Ingen hjelpelinjer ennå. Dra ut fra linjalen på lerretet, eller legg til en her.
          </p>
        ) : (
          <ul class="guideliste" role="list">
            {guider.map((g) => (
              <li key={g.id} class={g.id === st.valgtGuide ? 'valgt' : ''}>
                <button
                  type="button"
                  class="guidenavn"
                  aria-pressed={g.id === st.valgtGuide}
                  onClick={() => signtilstand(benk).sett({ valgtGuide: g.id })}
                >
                  {g.akse === 'x' ? 'Loddrett' : 'Vannrett'}
                </button>
                <TallFelt
                  etikett={`${g.akse === 'x' ? 'Loddrett' : 'Vannrett'} hjelpelinje, posisjon`}
                  kortEtikett={g.akse === 'x' ? 'X' : 'Y'}
                  verdi={g.verdi}
                  steg={1}
                  deaktivert={!!g.last}
                  endre={(v, k) => flyttHjelpelinjeTil(benk, g.id, v, k === 'pil' ? 'guide-pil' : undefined)}
                />
                <button
                  type="button"
                  class="minibryter"
                  aria-pressed={!!g.last}
                  title={g.last ? 'Lås opp' : 'Lås'}
                  onClick={() => laasHjelpelinje(benk, g.id, !g.last)}
                >
                  {g.last ? 'Låst' : 'Lås'}
                  <span class="visuelt-skjult"> hjelpelinjen</span>
                </button>
                <button
                  type="button"
                  class="minibryter"
                  disabled={!!g.last}
                  title="Slett"
                  onClick={() => {
                    slettHjelpelinjeI(benk, g.id);
                    if (st.valgtGuide === g.id) signtilstand(benk).sett({ valgtGuide: null });
                  }}
                >
                  Slett<span class="visuelt-skjult"> hjelpelinjen</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
