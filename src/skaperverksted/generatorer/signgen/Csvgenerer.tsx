/**
 * The Generer tab (Sivert, 2026-10-08, §11). Before anything is made it is a short status: how many rows,
 * how many designs, and what is missing. Pressing «Generer» makes the signs and only then shows them on
 * the build plates (Csvplater.tsx). The plates are not a step of their own before generating.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { lastFonter } from './modell';
import { bygSkilt, generer, genererstatus, lesArbeid, valider, type Csvarbeid } from './csvflyt';
import { endreArbeid, gaTilSteg } from './csvhandlinger';
import { PlaterSteg } from './Csvplater';
import { signtilstand } from './tilstand';

/** The tab: the status before generating, then the plates once there are generated signs. */
export function GenererSteg({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const a = lesArbeid(t.dok);
  const [status, settStatus] = useState(!a || a.generert.length === 0);
  if (!a) return <p class="merknad">Importer en CSV-fil først.</p>;
  if (status || a.generert.length === 0) {
    return (
      <Genererstatusvisning
        benk={benk}
        a={a}
        ferdig={() => settStatus(false)}
        tilPlatene={() => settStatus(false)}
      />
    );
  }
  return <PlaterSteg benk={benk} tilStatus={() => settStatus(true)} />;
}

function Genererstatusvisning({
  benk,
  a,
  ferdig,
  tilPlatene,
}: {
  benk: Arbeidsbenk;
  a: Csvarbeid;
  /** The signs are made: show them. */
  ferdig: () => void;
  tilPlatene: () => void;
}) {
  const t = brukBenk(benk);
  const [klar, settKlar] = useState(false);
  useEffect(() => {
    let aktiv = true;
    settKlar(false);
    void lastFonter(t.dok).then(() => aktiv && settKlar(true));
    return () => {
      aktiv = false;
    };
  }, [t.dok]);

  const varianter = useMemo(() => (klar ? bygSkilt(t.dok, a, a.valgte) : []), [t.dok, a, klar]);
  const sjekk = useMemo(() => (klar ? valider(t.dok, a, varianter) : null), [t.dok, a, klar, varianter]);
  const status = genererstatus(t.dok, a, sjekk);

  const fraFor = a.valgte.filter((i) => a.generert.includes(i)).length;
  const fjern = (rader: number[]) =>
    endreArbeid(benk, 'Fjern rader fra utvalget', (x) => ({
      ...x,
      valgte: x.valgte.filter((i) => !rader.includes(i)),
    }));
  const valg = (endring: Partial<Csvarbeid['valg']>) =>
    endreArbeid(benk, 'CSV: valg', (x) => ({ ...x, valg: { ...x.valg, ...endring } }), 'csv-valg');

  const kjor = () => {
    if (!sjekk?.klar) return;
    endreArbeid(benk, 'Generer skilt', (x) => ({ ...generer(x, x.valgte), steg: 'generer' }));
    signtilstand(benk).sett({ csv: 'generer', csvrad: null });
    benk.melde(`${a.valgte.length} skilt er generert.`);
    ferdig();
  };

  return (
    <div class="csv-steginnhold">
      <p class="dempet csv-intro">
        Her ser du hva som lages. Skiltene lages av masteren og radene, og vises på byggeplatene når du
        trykker «Generer».
      </p>

      <ul class="csv-status" aria-label="Status før generering">
        <li>
          <strong>{status.rader}</strong> {status.rader === 1 ? 'rad valgt' : 'rader valgt'}
        </li>
        <li>
          <strong>{status.design}</strong> {status.design === 1 ? 'design' : 'design'}
          <small class="dempet"> (dekor og fargeprofil)</small>
        </li>
        <li class={!sjekk ? '' : status.mangler.length ? 'feil' : 'ok'}>
          {!sjekk ? (
            <span role="status">Sjekker radene …</span>
          ) : status.mangler.length ? (
            <>
              <strong>{status.mangler.length}</strong>{' '}
              {status.mangler.length === 1 ? 'ting mangler' : 'ting mangler'}
            </>
          ) : (
            <strong>Klar til å generere</strong>
          )}
        </li>
      </ul>

      {sjekk && status.mangler.length > 0 && (
        <ul class="csv-mangler" aria-label="Det som mangler">
          {status.mangler.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {sjekk && sjekk.problemrader.length > 0 && (
        <>
          <h3>Rader med problemer</h3>
          <div class="batch-tabell" tabIndex={0} role="region" aria-label="Rader med problemer">
            <table>
              <thead>
                <tr>
                  <th scope="col">Rad</th>
                  <th scope="col">Innhold</th>
                  <th scope="col">Problem</th>
                  <th scope="col">
                    <span class="visuelt-skjult">Handling</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {varianter
                  .filter((v) => v.problemer.length)
                  .map((v) => (
                    <tr key={v.indeks} class="problem">
                      <td class="mono">{v.indeks + 1}</td>
                      <td>{v.verdier.filter(Boolean).join(' · ')}</td>
                      <td>{v.problemer.join('; ')}</td>
                      <td>
                        <button type="button" class="kontroll-knapp" onClick={() => fjern([v.indeks])}>
                          Fjern fra utvalget<span class="visuelt-skjult"> rad {v.indeks + 1}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div class="knapperad">
            <button type="button" class="kontroll-knapp" onClick={() => fjern(sjekk.problemrader)}>
              Fjern alle {sjekk.problemrader.length} fra utvalget
            </button>
            <button type="button" class="kontroll-knapp" onClick={() => gaTilSteg(benk, 'master')}>
              Rett på masteren
            </button>
            <button type="button" class="kontroll-knapp" onClick={() => gaTilSteg(benk, 'importer')}>
              Rett i radene
            </button>
          </div>
        </>
      )}

      <h3>Innstillinger</h3>
      <label class="csv-avkryss">
        <input
          type="checkbox"
          checked={a.valg.holdAvstand}
          onChange={() => valg({ holdAvstand: !a.valg.holdAvstand })}
        />{' '}
        Hold avstanden mellom tekstene som hører sammen lik på alle skilt
      </label>
      <label class="csv-avkryss">
        <input
          type="checkbox"
          checked={a.valg.holdHull}
          onChange={() => valg({ holdHull: !a.valg.holdHull })}
        />{' '}
        Hold hull og øyne like langt fra navnet på alle skilt
      </label>

      <div class="knapperad csv-fot">
        <button type="button" class="sekundar" onClick={() => gaTilSteg(benk, 'koble')}>
          ← Koble
        </button>
        {a.generert.length > 0 && (
          <button type="button" class="sekundar" onClick={tilPlatene}>
            Til platene
          </button>
        )}
        <button type="button" class="primar" disabled={!sjekk?.klar} onClick={kjor}>
          Generer {a.valgte.length} skilt
        </button>
      </div>
      {fraFor > 0 && sjekk?.klar && (
        <p class="dempet">
          {fraFor} av disse er generert fra før og beholder sine egne verdier. De andre{' '}
          {a.valgte.length - fraFor} lages nå.
        </p>
      )}
    </div>
  );
}
