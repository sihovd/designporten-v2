/** The Pattern tool's choices in the context bar (Sivert, 2026-10-08, §8). */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Segment, TallFelt } from '../../shell/kontroller';
import { lagMonster, monsterKilder, mulligeBaner } from './monster';
import { MAKS_KOPIER, type Monstervalg } from './monstervalg';
import { brukSigntilstand, signtilstand } from './tilstand';

export function Monstervalgbar({ benk }: { benk: Arbeidsbenk }) {
  const st = brukSigntilstand(benk);
  const t = brukBenk(benk);
  const v = st.monster;
  const sett = (d: Partial<Monstervalg>) => signtilstand(benk).sett({ monster: { ...v, ...d } });
  const kilder = monsterKilder(benk, v);
  const baner = mulligeBaner(t.dok, kilder);
  if (!kilder.length && v.modus === 'retning' && !t.utvalg.objekter.length)
    return (
      <span class="kontekst-hint">Velg vektorene som skal gjentas, så kommer valgene for mønsteret her.</span>
    );
  return (
    <>
      <Segment<Monstervalg['modus']>
        etikett="Mønsteret går"
        valg={[
          { id: 'retning', navn: 'I en retning' },
          { id: 'bane', navn: 'Langs en bane' },
        ]}
        verdi={v.modus}
        endre={(modus) => sett({ modus })}
      />
      <TallFelt
        etikett="Antall kopier"
        kortEtikett="Antall"
        enhet=""
        desimaler={0}
        verdi={v.antall}
        min={1}
        maks={MAKS_KOPIER}
        steg={1}
        endre={(x) => sett({ antall: Math.round(x) })}
      />
      <TallFelt
        etikett={v.modus === 'bane' ? 'Avstand langs banen (0 fordeler jevnt)' : 'Avstand mellom kopiene'}
        kortEtikett="Avstand"
        verdi={v.avstand}
        min={v.modus === 'bane' ? 0 : -500}
        maks={500}
        steg={1}
        endre={(x) => sett({ avstand: x })}
      />
      {v.modus === 'retning' ? (
        <TallFelt
          etikett="Retning"
          kortEtikett="Retning"
          enhet="°"
          desimaler={0}
          verdi={v.vinkel}
          min={-360}
          maks={360}
          steg={5}
          endre={(x) => sett({ vinkel: x })}
        />
      ) : (
        <>
          <label class="kontekst-lag">
            <span>Bane</span>
            <select
              aria-label="Banen kopiene følger"
              value={v.baneId ?? ''}
              onChange={(e) => sett({ baneId: (e.target as HTMLSelectElement).value || null })}
            >
              <option value="">Velg …</option>
              {baner.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.navn}
                </option>
              ))}
            </select>
          </label>
          <label class="kontekst-avkryssing">
            <input
              type="checkbox"
              checked={v.folgBane}
              onChange={(e) => sett({ folgBane: (e.target as HTMLInputElement).checked })}
            />
            <span>Følg banen</span>
          </label>
        </>
      )}
      <TallFelt
        etikett="Rotasjon for hver kopi"
        kortEtikett="Dreining"
        enhet="°"
        desimaler={0}
        verdi={v.rotasjon}
        min={-360}
        maks={360}
        steg={5}
        endre={(x) => sett({ rotasjon: x })}
      />
      <button
        type="button"
        class="primar"
        disabled={!kilder.length || (v.modus === 'bane' && !v.baneId)}
        onClick={() => {
          if (lagMonster(benk, v)) signtilstand(benk).sett({ verktoy: 'velg' });
        }}
      >
        Lag mønster
      </button>
      <button type="button" class="sekundar" onClick={() => signtilstand(benk).sett({ verktoy: 'velg' })}>
        Avbryt
      </button>
    </>
  );
}
