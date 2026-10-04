/**
 * Left panel: start templates, the figure's base models, the parts library
 * and the model's parts by body (handoff §4). A part is attached by
 * dragging it onto an attachment point in the 3D view, or without
 * dragging: choose the part, then choose an attachment point from the list
 * (or on the model) and it is placed.
 */
import { useMemo } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { Panel, Segment } from '../../shell/kontroller';
import { bibliotek, festenavn, finnDel, passer, startmaler, type Bibliotekdel } from './bibliotek';
import { festepunkter } from './feste';
import { grunnmodeller } from './figur';
import { festDel, velgGrunnmodell, velgMal } from './handlinger';
import {
  erPar,
  familieFor,
  figurKropper,
  formnavn,
  kropperFor,
  kroppnavn,
  tolkParametre,
  type Familie,
  type Kropp,
} from './parametre';
import { brukEditor, editor } from './tilstand';

export const DRA_TYPE = 'application/x-buildforge-del';

const familienavn: Record<Familie, string> = { klikker: 'Klikkere', figur: 'Figurer' };

/** The locked parts of each body, listed so it is clear they exist and cannot be edited. */
const laast: Record<Kropp, string> = {
  topp: 'Kobling til bryteren',
  underdel: 'Bryterfeste',
  hode: 'Leddhull mot kroppen',
  kropp: 'Plugger for hode, armer og bein',
  armer: 'Leddhull mot kroppen, plugg for hånden',
  hender: 'Leddhull mot armen',
  bein: 'Leddhull mot kroppen, plugg for foten',
  fotter: 'Leddhull mot beinet',
};

function Delknapp({ benk, d, aktiv }: { benk: Arbeidsbenk; d: Bibliotekdel; aktiv: boolean }) {
  return (
    <li>
      <button
        type="button"
        class="bf-del"
        draggable
        aria-pressed={aktiv}
        aria-describedby={`bf-del-${d.id}`}
        onClick={() => editor.sett({ plasserer: aktiv ? null : d.id, sikter: null })}
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
  );
}

export function Bibliotekpanel({ benk }: { benk: Arbeidsbenk }) {
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const t = tolkParametre(raw);
  const p = t.ok ? t.p : null;
  const familie = p ? familieFor(p) : 'klikker';
  const e = brukEditor();
  const punkter = useMemo(() => (p ? festepunkter(p) : []), [raw]);
  const plasserer = e.plasserer ? finnDel(e.plasserer) : undefined;

  return (
    <div class="bf-panel">
      <Panel tittel="Start fra en mal">
        {(['klikker', 'figur'] as Familie[]).map((f) => (
          <div key={f} class="bf-malgruppe">
            <h3 class="bf-kropp-tittel">{familienavn[f]}</h3>
            <div class="bf-maler" role="group" aria-label={`Startmaler: ${familienavn[f].toLowerCase()}`}>
              {startmaler
                .filter((m) => m.familie === f)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    class="bf-mal"
                    aria-pressed={p?.mal === m.id && familie === f}
                    onClick={() => velgMal(benk, m.id)}
                  >
                    <strong>{m.navn}</strong>
                    <span>{m.beskrivelse}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
        <p class="merknad">Å bytte mal erstatter modellen. Angre henter den tilbake.</p>
      </Panel>

      {p && familie === 'figur' && (
        <Panel tittel="Grunnmodeller">
          {figurKropper.map((k) => (
            <div key={k} class="bf-grunnmodell">
              <h3 class="bf-kropp-tittel">{kroppnavn[k]}</h3>
              <Segment<string>
                etikett={`Grunnmodell for ${kroppnavn[k].toLowerCase()}`}
                valg={grunnmodeller[k].map((m) => ({ id: m.id, navn: m.navn }))}
                verdi={p.grunnmodeller?.[k] ?? ''}
                endre={(id) => velgGrunnmodell(benk, k, id)}
              />
            </div>
          ))}
          <p class="merknad">
            Hver del mellom leddene har sitt eget lag med former. Det du har lagt til selv, blir værende når
            du bytter grunnmodell.
          </p>
        </Panel>
      )}

      <Panel tittel="Legg til">
        {(['Grunnformer', 'Detaljer'] as const).map((gruppe) => (
          <div key={gruppe}>
            <h3 class="bf-kropp-tittel">{gruppe}</h3>
            <ul class="bf-bibliotek" role="list">
              {bibliotek
                .filter((d) => d.gruppe === gruppe)
                .map((d) => (
                  <Delknapp key={d.id} benk={benk} d={d} aktiv={e.plasserer === d.id} />
                ))}
            </ul>
          </div>
        ))}
        {plasserer && (
          <div class="bf-plassering" role="group" aria-label={`Fest ${plasserer.navn.toLowerCase()} på`}>
            <p class="bf-plassering-tekst">
              Fest <strong>{plasserer.navn.toLowerCase()}</strong> på et lilla punkt på modellen, eller velg
              her:
            </p>
            <div class="bf-punkter">
              {punkter.map((f) => {
                const ok = passer(plasserer, f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    class="kontroll-knapp"
                    disabled={!ok}
                    title={ok ? undefined : `${plasserer.navn} passer ikke her`}
                    onFocus={() => editor.sett({ sikter: ok ? f.id : null })}
                    onMouseEnter={() => editor.sett({ sikter: ok ? f.id : null })}
                    onMouseLeave={() => editor.sett({ sikter: null })}
                    onBlur={() => editor.sett({ sikter: null })}
                    onClick={() => festDel(benk, plasserer.id, f.id)}
                  >
                    {festenavn(f.id)}
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
        {kropperFor[familie].map((k) => (
          <div key={k} class="bf-kropp">
            <h3 class="bf-kropp-tittel">
              {kroppnavn[k]}
              {erPar(k) && <span class="dempet"> · begge sider er like</span>}
            </h3>
            <ul class="bf-objekter" role="list">
              <li>
                <span class="bf-laast">
                  {laast[k]}
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
          {familie === 'klikker'
            ? 'Bryteren er en innkjøpt del. Den vises bare som referanse og er ikke med i filene.'
            : 'Leddene er plugger som dreier i et hull. Hver del blir en egen fil, og du setter figuren sammen etter utskrift.'}
        </p>
      </Panel>
    </div>
  );
}
