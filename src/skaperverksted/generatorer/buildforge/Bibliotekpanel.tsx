/**
 * Left panel: start templates, the parts library and the model's parts by
 * body (handoff §4). A part is attached by dragging it onto an attachment
 * point in the 3D view, or without dragging: choose the part, then choose
 * an attachment point from the list (or on the model) and it is placed.
 */
import { useMemo } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { Panel } from '../../shell/kontroller';
import { bibliotek, festenavn, finnDel, startmaler, type FestepunktId } from './bibliotek';
import { festepunkter } from './feste';
import { festDel, velgMal } from './handlinger';
import { formnavn, kroppnavn, tolkParametre, type Kropp } from './parametre';
import { brukEditor, editor } from './tilstand';

export const DRA_TYPE = 'application/x-buildforge-del';

export function Bibliotekpanel({ benk }: { benk: Arbeidsbenk }) {
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const t = tolkParametre(raw);
  const p = t.ok ? t.p : null;
  const e = brukEditor();
  const punkter = useMemo(() => (p ? festepunkter(p) : []), [raw]);
  const plasserer = e.plasserer ? finnDel(e.plasserer) : undefined;

  return (
    <div class="bf-panel">
      <Panel tittel="Start fra en mal">
        <div class="bf-maler" role="group" aria-label="Startmaler">
          {startmaler.map((m) => (
            <button
              key={m.id}
              type="button"
              class="bf-mal"
              aria-pressed={p?.mal === m.id}
              onClick={() => velgMal(benk, m.id)}
            >
              <strong>{m.navn}</strong>
              <span>{m.beskrivelse}</span>
            </button>
          ))}
        </div>
        <p class="merknad">Å bytte mal erstatter modellen. Angre henter den tilbake.</p>
      </Panel>

      <Panel tittel="Legg til">
        <ul class="bf-bibliotek" role="list">
          {bibliotek.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                class="bf-del"
                draggable
                aria-pressed={e.plasserer === d.id}
                aria-describedby={`bf-del-${d.id}`}
                onClick={() => editor.sett({ plasserer: e.plasserer === d.id ? null : d.id, sikter: null })}
                onDragStart={(ev) => {
                  ev.dataTransfer?.setData(DRA_TYPE, d.id);
                  ev.dataTransfer?.setData('text/plain', d.navn);
                  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
                  editor.sett({ plasserer: d.id, sikter: null });
                }}
                onDragEnd={(ev) => {
                  if (ev.dataTransfer?.dropEffect === 'none' && editor.t.plasserer)
                    benk.melde('Slipp delen på et av de lilla festepunktene, eller velg et punkt i listen.');
                }}
              >
                {d.navn}
              </button>
              <span id={`bf-del-${d.id}`} class="visuelt-skjult">
                {d.beskrivelse}
              </span>
            </li>
          ))}
        </ul>
        {plasserer && (
          <div class="bf-plassering" role="group" aria-label={`Fest ${plasserer.navn.toLowerCase()} på`}>
            <p class="bf-plassering-tekst">
              Fest <strong>{plasserer.navn.toLowerCase()}</strong> på et lilla punkt på modellen, eller velg
              her:
            </p>
            <div class="bf-punkter">
              {punkter.map((f) => {
                const passer = plasserer.passer.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    class="kontroll-knapp"
                    disabled={!passer}
                    title={passer ? undefined : `${plasserer.navn} passer ikke her`}
                    onFocus={() => editor.sett({ sikter: passer ? f.id : null })}
                    onMouseEnter={() => editor.sett({ sikter: passer ? f.id : null })}
                    onMouseLeave={() => editor.sett({ sikter: null })}
                    onBlur={() => editor.sett({ sikter: null })}
                    onClick={() => festDel(benk, plasserer.id, f.id as FestepunktId)}
                  >
                    {festenavn[f.id]}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() => editor.sett({ plasserer: null, sikter: null })}
            >
              Avbryt
            </button>
          </div>
        )}
      </Panel>

      <Panel tittel="Deler i modellen">
        {(['topp', 'underdel'] as Kropp[]).map((k) => (
          <div key={k} class="bf-kropp">
            <h3 class="bf-kropp-tittel">{kroppnavn[k]}</h3>
            <ul class="bf-objekter" role="list">
              <li>
                <span class="bf-laast">
                  {k === 'topp' ? 'Kobling til bryteren' : 'Bryterfeste'}
                  <span class="mono">Låst</span>
                </span>
              </li>
              {(p?.former ?? [])
                .filter((f) => f.kropp === k)
                .map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      class={`bf-objekt${e.merket.includes(f.id) ? ' merket' : ''}`}
                      aria-pressed={e.valgt === f.id}
                      onClick={() => editor.sett({ valgt: e.valgt === f.id ? null : f.id })}
                    >
                      <span>{f.navn}</span>
                      <span class="dempet">
                        {formnavn[f.type]}
                        {f.operasjon === 'trekk-fra' ? ', trekker fra' : ''}
                        {f.speilet ? ', speilet' : ''}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
        <p class="merknad">
          Bryteren er en innkjøpt del. Den vises bare som referanse og er ikke med i filene.
        </p>
      </Panel>
    </div>
  );
}
