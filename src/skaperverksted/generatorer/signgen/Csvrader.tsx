/**
 * Step 4 and 5 of the CSV workflow: choose which rows become signs (an
 * overview with checkboxes, search and filters), then check everything and
 * press «Generer». Only the chosen rows are built, and only when the
 * checks pass.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Segment } from '../../shell/kontroller';
import { lastFonter } from './modell';
import {
  antallOverstyringer,
  bygSkilt,
  generer,
  inverter,
  lesArbeid,
  sett,
  synligeRader,
  valider,
  velgOmrade,
  type Csvarbeid,
  type Radvisning,
} from './csvflyt';
import { endreArbeid, gaTilSteg } from './csvhandlinger';
import { signtilstand } from './tilstand';

// ---------- 4. choose rows ----------

const VISNINGER: { id: Radvisning; navn: string }[] = [
  { id: 'alle', navn: 'Alle' },
  { id: 'valgte', navn: 'Valgte' },
  { id: 'ikke-valgte', navn: 'Ikke valgte' },
  { id: 'problemer', navn: 'Problemer' },
];

export function RaderSteg({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const a = lesArbeid(t.dok);
  const [sok, settSok] = useState('');
  const [visning, settVisning] = useState<Radvisning>('alle');
  const [problemer, settProblemer] = useState<Map<number, string[]> | null>(null);
  const [sjekker, settSjekker] = useState(false);
  const anker = useRef<number | null>(null);
  const alle = useRef<HTMLInputElement>(null);

  const valgte = useMemo(() => new Set(a?.valgte ?? []), [a?.valgte]);
  const problemRader = useMemo(() => (problemer ? new Set(problemer.keys()) : undefined), [problemer]);
  const vises = useMemo(
    () => (a ? synligeRader(a, { sok, visning }, valgte, problemRader) : []),
    [a, sok, visning, valgte, problemRader],
  );

  const antallValgteSynlige = vises.filter((i) => valgte.has(i)).length;
  useEffect(() => {
    if (alle.current)
      alle.current.indeterminate = antallValgteSynlige > 0 && antallValgteSynlige < vises.length;
  }, [antallValgteSynlige, vises.length]);

  if (!a) return <p class="merknad">Importer en CSV-fil først.</p>;

  const sattValgte = (liste: number[]) =>
    endreArbeid(benk, 'Velg rader', (x) => ({ ...x, valgte: liste }), 'csv-rader');

  const sjekk = async () => {
    settSjekker(true);
    try {
      await lastFonter(t.dok);
      const v = bygSkilt(
        t.dok,
        a,
        a.rader.map((_, i) => i),
      );
      settProblemer(new Map(v.filter((x) => x.problemer.length).map((x) => [x.indeks, x.problemer])));
      benk.melde(`${v.filter((x) => x.problemer.length).length} av ${v.length} rader har problemer.`);
    } finally {
      settSjekker(false);
    }
  };

  const klikk = (i: number, e: MouseEvent) => {
    const paa = (e.target as HTMLInputElement).checked;
    if (e.shiftKey && anker.current !== null) sattValgte(velgOmrade(valgte, vises, anker.current, i, paa));
    else sattValgte(sett(valgte, [i], paa));
    anker.current = i;
  };

  return (
    <div class="csv-steginnhold">
      <p class="dempet csv-intro">
        Velg hvilke rader som skal bli skilt. Skift-klikk velger et område. Søk og filter styrer hva du ser,
        og «Velg alle», «Velg ingen» og «Snu» gjelder bare radene du ser.
      </p>
      <div class="csv-verktoylinje">
        <label class="felt" for="csv-sok">
          <span>Søk i radene</span>
          <input
            id="csv-sok"
            type="search"
            value={sok}
            placeholder="Navn, rolle, profil …"
            onInput={(e) => settSok((e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="felt">
          <span>Vis</span>
          <Segment etikett="Vis rader" valg={VISNINGER} verdi={visning} endre={settVisning} />
        </div>
      </div>
      <div class="knapperad csv-valgknapper">
        <button type="button" class="kontroll-knapp" onClick={() => sattValgte(sett(valgte, vises, true))}>
          Velg alle
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => sattValgte(sett(valgte, vises, false))}>
          Velg ingen
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => sattValgte(inverter(valgte, vises))}>
          Snu utvalget
        </button>
        <button type="button" class="kontroll-knapp" disabled={sjekker} onClick={() => void sjekk()}>
          {sjekker ? 'Sjekker …' : problemer ? 'Sjekk radene på nytt' : 'Sjekk radene for problemer'}
        </button>
        <span class="dempet" role="status">
          {a.valgte.length} av {a.rader.length} rader valgt · viser {vises.length}
        </span>
      </div>

      <div class="batch-tabell csv-radtabell" tabIndex={0} role="region" aria-label="Radene i CSV-filen">
        <table>
          <thead>
            <tr>
              <th scope="col" class="csv-velg">
                <input
                  ref={alle}
                  type="checkbox"
                  aria-label="Velg alle radene du ser"
                  checked={vises.length > 0 && antallValgteSynlige === vises.length}
                  disabled={vises.length === 0}
                  onClick={(e) => sattValgte(sett(valgte, vises, (e.target as HTMLInputElement).checked))}
                />
              </th>
              <th scope="col">Rad</th>
              {a.kolonner.map((k, i) => (
                <th scope="col" key={i}>
                  {k}
                </th>
              ))}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {vises.map((i) => {
              const r = a.rader[i]!;
              const p = problemer?.get(i);
              const status = [
                a.generert.includes(i) ? 'Generert' : '',
                antallOverstyringer(a, i) ? `${antallOverstyringer(a, i)} egne verdier` : '',
                p ? p.join('; ') : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <tr key={i} class={`${p ? 'problem' : ''}${valgte.has(i) ? ' valgt' : ''}`}>
                  <td class="csv-velg">
                    <input
                      type="checkbox"
                      aria-label={`Velg rad ${i + 1}: ${r.find((c) => c.trim()) ?? 'tom'}`}
                      checked={valgte.has(i)}
                      onClick={(e) => klikk(i, e as unknown as MouseEvent)}
                    />
                  </td>
                  <td class="mono">{i + 1}</td>
                  {a.kolonner.map((_, j) => (
                    <td key={j}>{r[j]}</td>
                  ))}
                  <td>{status || (problemer ? 'OK' : '')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {vises.length === 0 && <p class="merknad">Ingen rader passer med søket og filteret.</p>}
      </div>

      <div class="knapperad csv-fot">
        <button type="button" class="sekundar" onClick={() => gaTilSteg(benk, 'master')}>
          ← Masteren
        </button>
        <button
          type="button"
          class="primar"
          disabled={a.valgte.length === 0}
          onClick={() => gaTilSteg(benk, 'generer', true)}
        >
          Valider og generer {a.valgte.length} →
        </button>
      </div>
    </div>
  );
}

// ---------- 5. validate and generate ----------

export function GenererSteg({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const a = lesArbeid(t.dok);
  const [klar, settKlar] = useState(false);
  useEffect(() => {
    let aktiv = true;
    settKlar(false);
    void lastFonter(t.dok).then(() => aktiv && settKlar(true));
    return () => {
      aktiv = false;
    };
  }, [t.dok]);

  const varianter = useMemo(() => (a && klar ? bygSkilt(t.dok, a, a.valgte) : []), [t.dok, a, klar]);
  const sjekk = useMemo(() => (a && klar ? valider(t.dok, a, varianter) : null), [t.dok, a, klar, varianter]);

  if (!a) return <p class="merknad">Importer en CSV-fil først.</p>;

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
    endreArbeid(benk, 'Generer skilt', (x) => ({ ...generer(x, x.valgte), steg: 'plater' }));
    signtilstand(benk).sett({ csv: 'plater', csvrad: null });
    benk.melde(`${a.valgte.length} skilt er generert.`);
  };

  return (
    <div class="csv-steginnhold">
      <p class="dempet csv-intro">
        Her sjekkes alt før noe lages. «Generer» er av til alle kontrollene er i orden. Selve skiltene lages
        av masteren og radene, og følger masteren hvis du endrer den senere.
      </p>

      <h3>Kontroller</h3>
      {!sjekk ? (
        <p role="status">Laster fonter og sjekker radene …</p>
      ) : (
        <ul class="csv-kontroller">
          {sjekk.kontroller.map((k) => (
            <li key={k.id} class={k.ok ? 'ok' : 'feil'}>
              <span class="csv-kontroll-merke" aria-hidden="true">
                {k.ok ? '✓' : '✗'}
              </span>
              <span>
                <span class="visuelt-skjult">{k.ok ? 'I orden: ' : 'Må rettes: '}</span>
                {k.tekst}
                {!k.ok && k.detalj && <small class="dempet csv-hjelp">{k.detalj}</small>}
              </span>
            </li>
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
            <button type="button" class="kontroll-knapp" onClick={() => gaTilSteg(benk, 'rader')}>
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
        <button type="button" class="sekundar" onClick={() => gaTilSteg(benk, 'rader')}>
          ← Radene
        </button>
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
