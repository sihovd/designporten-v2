/**
 * The Snap panel of Sign Forge (Sivert, 2026-10-10): the settings of the snap engine, which are saved in the
 * master and so follow every sign the CSV makes from it, and the snap points of the master. A point is put on
 * the whole sign or on one object, at one of nine places of its box, and follows that geometry from then on:
 * when a CSV row makes the text longer, the point is still on the same place of the text.
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel, TallFelt } from '../../shell/kontroller';
import { SNAPGRENSER, lesSnap, type Snappunkt } from './snapmotor';
import {
  PUNKTPLASSER,
  endreSnapAvstandI,
  endreSnapI,
  leggTilSnappunktI,
  plassNavn,
  slettSnappunktI,
  snappunktPosisjon,
} from './snappunkter';
import { tall } from '../../core/enheter';

const malNavn = (benk: Arbeidsbenk, mal: Snappunkt['mal']) =>
  mal === 'skilt' ? 'Hele skiltet' : (benk.dok.objekter[mal]?.navn ?? 'Finnes ikke lenger');

export function Snappanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const snap = lesSnap(t.dok);
  const valgte = t.utvalg.objekter.flatMap((id) => (t.dok.objekter[id] ? [t.dok.objekter[id]] : []));
  const [mal, settMal] = useState<'skilt' | string>('skilt');
  const [plass, settPlass] = useState(4);
  // the target is the chosen object when there is one, otherwise the whole sign
  const gyldigMal = mal === 'skilt' || t.dok.objekter[mal] ? mal : 'skilt';
  return (
    <>
      <Panel
        tittel="Snapinnstillinger"
        handling={
          <button
            type="button"
            class="kontroll-knapp"
            aria-pressed={t.innstillinger.snap}
            title="Samme bryter som Snap i verktøylinjen. Hold Alt for å slå av midlertidig mens du flytter."
            onClick={() => benk.settInnstillinger({ snap: !t.innstillinger.snap })}
          >
            {t.innstillinger.snap ? 'På' : 'Av'}
          </button>
        }
      >
        <TallFelt
          etikett="Snapavstand"
          verdi={snap.fangavstand}
          min={SNAPGRENSER.fangavstand.min}
          maks={SNAPGRENSER.fangavstand.maks}
          steg={0.5}
          desimaler={1}
          endre={(v) => endreSnapI(benk, { fangavstand: v }, 'snap-fang')}
        />
        <TallFelt
          etikett="Avstand mellom objekter"
          verdi={snap.avstand}
          min={SNAPGRENSER.avstand.min}
          maks={SNAPGRENSER.avstand.maks}
          steg={0.5}
          desimaler={1}
          endre={(v) => endreSnapAvstandI(benk, v)}
        />
        <div class="knapperad">
          <button
            type="button"
            class="kontroll-knapp"
            aria-pressed={snap.konturer}
            onClick={() => endreSnapI(benk, { konturer: !snap.konturer })}
          >
            Konturer
          </button>
          <button
            type="button"
            class="kontroll-knapp"
            aria-pressed={snap.punkter}
            onClick={() => endreSnapI(benk, { punkter: !snap.punkter })}
          >
            Snap-punkter
          </button>
        </div>
        <p class="merknad">
          Innstillingene ligger i masteren og følger alle skilt CSV lager av den. «Avstand mellom objekter» er
          også mellomrommet mellom skiltene på byggeplata. «Konturer» holder objektene denne avstanden fra
          konturen til de andre; det er av som standard.
        </p>
      </Panel>
      <Panel tittel="Snap-punkter">
        <fieldset class="felt snappunkt-ny">
          <legend>Nytt punkt</legend>
          <label class="felt" for="snappunkt-mal">
            <span>Sitter på</span>
            <select
              id="snappunkt-mal"
              value={gyldigMal}
              onChange={(e) => settMal((e.target as HTMLSelectElement).value)}
            >
              <option value="skilt">Hele skiltet</option>
              {valgte.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.navn}
                </option>
              ))}
            </select>
          </label>
          <div class="snappunkt-rute" role="radiogroup" aria-label="Plass på boksen">
            {PUNKTPLASSER.map((p, i) => (
              <button
                key={p.navn}
                type="button"
                role="radio"
                class="snappunkt-valg"
                aria-checked={plass === i}
                aria-label={p.navn}
                title={p.navn}
                onClick={() => settPlass(i)}
              >
                <span aria-hidden="true">{plass === i ? '◆' : '◇'}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => {
              const p = PUNKTPLASSER[plass]!;
              leggTilSnappunktI(benk, gyldigMal, p.u, p.v);
              benk.melde(`Snap-punkt lagt til: ${malNavn(benk, gyldigMal)}, ${p.navn.toLowerCase()}.`);
            }}
          >
            Legg til snap-punkt
          </button>
          {valgte.length === 0 && (
            <p class="merknad">Velg et objekt for å sette punktet på det i stedet for på hele skiltet.</p>
          )}
        </fieldset>
        {snap.punktliste.length === 0 ? (
          <p class="merknad">Ingen snap-punkter ennå. Punktene ligger på geometrien og følger den.</p>
        ) : (
          <ul class="guideliste" role="list">
            {snap.punktliste.map((p) => {
              const pos = snappunktPosisjon(t.dok, p);
              return (
                <li key={p.id}>
                  <span class="guidenavn">
                    {p.navn}: {malNavn(benk, p.mal)}, {plassNavn(p.u, p.v).toLowerCase()}
                    {pos ? ` (${tall(pos.x)}, ${tall(pos.y)} mm)` : ' (finnes ikke lenger)'}
                  </span>
                  <button type="button" class="minibryter" onClick={() => slettSnappunktI(benk, p.id)}>
                    Slett<span class="visuelt-skjult"> {p.navn}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
