/**
 * The Transform and Justér panels (Sign Forge): numbers for the selection's box, and align and
 * distribute against the selection, the plate or a guide line. The guide lines of the project are
 * listed here too, so they can be made, moved, locked and deleted without the mouse.
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel, Segment, TallFelt } from '../../shell/kontroller';
import { fordel, juster, plateboks, redigerbare, utvalgsboks } from './handlinger';
import {
  flyttHjelpelinjeTil,
  hjelpelinjerAv,
  laasHjelpelinje,
  leggTilHjelpelinjeI,
  slettHjelpelinjeI,
} from './hjelpelinjer';
import { justeringGjelder, type Justering, type Justeringsmal } from './justering';
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
      <label class="avkryssing">
        <input type="checkbox" checked={laas} onChange={() => settLaas(!laas)} /> Behold proporsjoner
      </label>
      {enkelt && (
        <TallFelt
          etikett="Rotasjon, transform"
          enhet="°"
          verdi={enkelt.transform.rotasjon}
          min={-360}
          maks={360}
          steg={15}
          endre={(v, k) => roterUtvalgTil(benk, v, k === 'pil' ? 'tf-rot' : undefined)}
        />
      )}
      <p class="merknad">
        Målene er for hele utvalget, målt rundt formen. Rotasjonen dreier objektet om midten.
      </p>
    </Panel>
  );
}

type Referanse = 'utvalg' | 'plate' | 'hjelpelinje';

const KNAPPER: [Justering, string][] = [
  ['venstre', 'Venstre'],
  ['midtX', 'Midt ↔'],
  ['hoyre', 'Høyre'],
  ['topp', 'Topp'],
  ['midtY', 'Midt ↕'],
  ['bunn', 'Bunn'],
];

export function Justerpanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const antall = redigerbare(benk).length;
  const guider = hjelpelinjerAv(t.dok);
  const valgtGuide = guider.find((g) => g.id === st.valgtGuide);
  const [ref, settRef] = useState<Referanse>('utvalg');
  // «Utvalget» needs two objects; «Hjelpelinje» needs a chosen guide. Fall back to the plate.
  const gjelder: Referanse =
    ref === 'hjelpelinje' && !valgtGuide ? 'plate' : ref === 'utvalg' && antall < 2 ? 'plate' : ref;
  const mal = (): Justeringsmal | undefined => {
    if (gjelder === 'plate') return { type: 'boks', boks: plateboks(t.dok) };
    if (gjelder === 'hjelpelinje' && valgtGuide)
      return { type: 'linje', akse: valgtGuide.akse, verdi: valgtGuide.verdi };
    return undefined;
  };
  const grenser = (akse: 'x' | 'y') => {
    if (gjelder === 'plate') {
      const p = plateboks(t.dok);
      return akse === 'x' ? { start: p.minX, slutt: p.maksX } : { start: p.minY, slutt: p.maksY };
    }
    if (gjelder === 'hjelpelinje') {
      // between the outermost guides that run across the axis
      const v = guider.filter((g) => g.akse === akse).map((g) => g.verdi);
      return v.length >= 2 ? { start: Math.min(...v), slutt: Math.max(...v) } : null;
    }
    return undefined;
  };
  const gx = grenser('x');
  const gy = grenser('y');
  const m = mal();
  return (
    <>
      <Panel tittel="Justér og fordel">
        <div class="felt" role="group" aria-label="Justér mot">
          <span>Mot</span>
          <Segment<Referanse>
            etikett="Justér mot"
            verdi={gjelder}
            valg={[
              { id: 'utvalg', navn: 'Utvalget' },
              { id: 'plate', navn: 'Plata' },
              { id: 'hjelpelinje', navn: 'Linje' },
            ]}
            endre={settRef}
          />
        </div>
        {gjelder === 'utvalg' && antall < 2 && (
          <p class="merknad">Velg to eller flere objekter for å justere dem mot hverandre.</p>
        )}
        {ref === 'hjelpelinje' && !valgtGuide && (
          <p class="merknad">Velg en hjelpelinje under (eller på lerretet) for å justere mot den.</p>
        )}
        <div class="justering" role="group" aria-label="Juster">
          {KNAPPER.map(([id, navn]) => (
            <button
              key={id}
              type="button"
              class="kontroll-knapp"
              disabled={!antall || (m ? !justeringGjelder(id, m) : antall < 2)}
              onClick={() => juster(benk, id, m)}
            >
              {navn}
            </button>
          ))}
        </div>
        <div class="knapperad">
          <button
            type="button"
            class="kontroll-knapp"
            disabled={gx === null || antall < (gx ? 2 : 3)}
            onClick={() => fordel(benk, 'x', gx ?? undefined)}
          >
            Fordel vannrett
          </button>
          <button
            type="button"
            class="kontroll-knapp"
            disabled={gy === null || antall < (gy ? 2 : 3)}
            onClick={() => fordel(benk, 'y', gy ?? undefined)}
          >
            Fordel loddrett
          </button>
        </div>
        <p class="merknad">
          {gjelder === 'plate'
            ? 'Fordeler mellom kantene på plata.'
            : gjelder === 'hjelpelinje'
              ? 'Fordeler mellom de to ytterste hjelpelinjene på hver akse.'
              : 'Fordeler mellom de ytterste objektene.'}
        </p>
      </Panel>
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
