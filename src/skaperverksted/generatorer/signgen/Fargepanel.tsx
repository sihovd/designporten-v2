/**
 * The Fargeprofil panel (Sivert, 2026-10-06, §16 to §19): the project's
 * colour profile, the filament registry (browse by manufacturer, search,
 * add your own), colour groups, and ready-made and own profiles. A colour in
 * the project is always one of the filaments in this profile.
 *
 * Filaments added here live in this browser and are copied into the project
 * when it uses them, so the project opens with the same colours elsewhere.
 */
import { useMemo, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import {
  alleMaterialer,
  finnMateriale,
  materialtyper,
  fargekode,
  visningsnavn,
  type Materiale,
  type Materialtype,
} from '../../core/materialer';
import { brukBenk } from '../../shell/bruk-benk';
import { Ikon } from '../../shell/ikoner';
import { Samlingsvelger } from './Fargesamlinger';
import { lagreSamlingFarger } from './fargesamlinger';
import { palett, settPalett, synkFilamenter } from './dokument';
import {
  FERDIGE_PROFILER,
  hentEgneProfiler,
  lagreEgenProfil,
  slettEgenProfil,
  type Fargeprofil,
} from './fargeprofiler';
import {
  finnFilamenter,
  filamentInfo,
  filamentLinje,
  hentGrupper,
  KJENTE_PRODUSENTER,
  lagreEgetFilament,
  lagreGruppe,
  lastEgneFilamenter,
  MAKS_AMS_PLASS,
  produsenter,
  slettEgetFilament,
  slettGruppe,
  type Fargegruppe,
} from './filamenter';
import { fargeplasser } from './dokument';

const TYPER = Object.keys(materialtyper) as Materialtype[];

function Prover({ farger }: { farger: readonly string[] }) {
  return (
    <span class="profilfarger" aria-hidden="true">
      {farger.map((id) => (
        <span key={id} class="fargeprove" style={{ background: finnMateriale(id).hex }} />
      ))}
    </span>
  );
}

export interface Skjema {
  id?: string;
  produsent: string;
  serie: string;
  navn: string;
  hex: string;
  type: Materialtype;
  sku: string;
  egetNavn: string;
  spole: string;
  amsPlass: string;
  notat: string;
}

export const TOMT: Skjema = {
  produsent: '',
  serie: '',
  navn: '',
  hex: '#883dff',
  type: 'PLA',
  sku: '',
  egetNavn: '',
  spole: '',
  amsPlass: '',
  notat: '',
};

function tilSkjema(m: Materiale): Skjema {
  return {
    id: m.id,
    produsent: m.produsent ?? '',
    serie: m.serie ?? '',
    navn: m.navn,
    hex: m.hex,
    type: m.type,
    sku: m.sku ?? '',
    egetNavn: m.egetNavn ?? '',
    spole: m.spole ?? '',
    amsPlass: m.amsPlass ? String(m.amsPlass) : '',
    notat: m.metadata?.notat ?? '',
  };
}

/** Add or edit one of your own filaments. */
export function Filamentskjema({
  start,
  ferdig,
}: {
  start: Skjema;
  ferdig: (lagret: Materiale | null, leggTil: boolean) => void;
}) {
  const [s, sett] = useState<Skjema>(start);
  const [leggTil, settLeggTil] = useState(!start.id);
  const [feil, settFeil] = useState<string | null>(null);
  const felt = (navn: keyof Skjema) => (e: Event) =>
    sett({ ...s, [navn]: (e.target as HTMLInputElement | HTMLSelectElement).value });
  const lagre = (e: Event) => {
    e.preventDefault();
    if (!s.navn.trim()) {
      settFeil('Fargen trenger et navn.');
      return;
    }
    const f = lagreEgetFilament({
      id: s.id,
      navn: s.navn,
      type: s.type,
      hex: s.hex,
      produsent: s.produsent,
      serie: s.serie,
      sku: s.sku,
      egetNavn: s.egetNavn,
      spole: s.spole,
      amsPlass: s.amsPlass ? Number(s.amsPlass) : undefined,
      metadata: s.notat.trim() ? { notat: s.notat } : undefined,
    });
    if (!f) {
      settFeil('Nettleseren ville ikke lagre filamentet. Sjekk fargen og at det er plass.');
      return;
    }
    ferdig(f, leggTil);
  };
  return (
    <form
      class="filamentskjema"
      onSubmit={lagre}
      aria-label={start.id ? 'Rediger filament' : 'Nytt filament'}
    >
      <label class="felt">
        <span>Produsent</span>
        <input
          type="text"
          list="filament-produsenter"
          value={s.produsent}
          maxLength={60}
          onInput={felt('produsent')}
        />
        <datalist id="filament-produsenter">
          {KJENTE_PRODUSENTER.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <label class="felt">
        <span>Produktserie</span>
        <input
          type="text"
          value={s.serie}
          maxLength={60}
          placeholder="for eksempel PLA Basic"
          onInput={felt('serie')}
        />
      </label>
      <label class="felt">
        <span>Fargenavn (vises bare når du holder over fargen)</span>
        <input type="text" value={s.navn} maxLength={60} required onInput={felt('navn')} />
      </label>
      <label class="felt">
        <span>Visningsfarge</span>
        <span class="materialvalg">
          <input type="color" value={s.hex} onInput={felt('hex')} />
          <span class="mono dempet">{s.hex}</span>
        </span>
      </label>
      <label class="felt">
        <span>Materiale</span>
        <select value={s.type} onChange={felt('type')}>
          {TYPER.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label class="felt">
        <span>Varenummer (SKU)</span>
        <input type="text" value={s.sku} maxLength={40} onInput={felt('sku')} />
      </label>
      <label class="felt">
        <span>Eget navn</span>
        <input type="text" value={s.egetNavn} maxLength={60} onInput={felt('egetNavn')} />
      </label>
      <label class="felt">
        <span>Spole</span>
        <input
          type="text"
          value={s.spole}
          maxLength={60}
          placeholder="for eksempel Spole 3"
          onInput={felt('spole')}
        />
      </label>
      <label class="felt">
        <span>AMS-plass</span>
        <input
          type="number"
          min={1}
          max={MAKS_AMS_PLASS}
          step={1}
          value={s.amsPlass}
          onInput={felt('amsPlass')}
        />
      </label>
      <label class="felt">
        <span>Notat</span>
        <input type="text" value={s.notat} maxLength={200} onInput={felt('notat')} />
      </label>
      <label class="avkryssing">
        <input
          type="checkbox"
          checked={leggTil}
          onChange={(e) => settLeggTil((e.target as HTMLInputElement).checked)}
        />
        Legg til i fargeprofilen
      </label>
      {feil && (
        <p class="merknad" role="alert">
          {feil}
        </p>
      )}
      <div class="knapperad">
        <button type="submit" class="primar">
          {start.id ? 'Lagre endringene' : 'Lagre filament'}
        </button>
        <button type="button" class="sekundar" onClick={() => ferdig(null, false)}>
          Avbryt
        </button>
      </div>
      <p class="merknad">
        Visningsfargen er din egen tilnærming til filamentet. Designporten har ikke produktdata fra
        produsentene.
      </p>
    </form>
  );
}

export function Fargepanel({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const [versjon, settVersjon] = useState(0);
  const ny = () => settVersjon((v) => v + 1);
  // the stored filaments are made known the first time the panel is drawn
  useMemo(() => lastEgneFilamenter(), []);
  const profil = palett(t.dok);
  const brukt = new Set(fargeplasser(t.dok).map((p) => p.materialId));
  const [tekst, settTekst] = useState('');
  const [produsent, settProdusent] = useState('');
  const [type, settType] = useState<Materialtype | ''>('');
  const [skjema, settSkjema] = useState<Skjema | null>(null);
  const [gruppenavn, settGruppenavn] = useState('');
  const [melding, settMelding] = useState<string | null>(null);
  const [valgtFarge, settValgtFarge] = useState<number | null>(null);
  const [lager, settLager] = useState(false);
  const [utvalg, settUtvalg] = useState<string[]>([]);
  const [lagNavn, settLagNavn] = useState('');
  const [lagSok, settLagSok] = useState('');

  void versjon;
  const alle = alleMaterialer();
  const treff = finnFilamenter({ tekst, produsent, type }, alle);
  const egneProfiler = hentEgneProfiler();
  const grupper = hentGrupper();

  const bruk = (farger: string[], navn = 'Fargeprofil') => {
    benk.endre({ navn, anvend: (d) => settPalett(d, farger) });
  };
  const leggTil = (id: string) => {
    if (!profil.includes(id)) bruk([...profil, id], 'Legg til farge i profilen');
  };
  const fjern = (id: string) => {
    if (profil.length <= 1) return;
    bruk(
      profil.filter((x) => x !== id),
      'Fjern farge fra profilen',
    );
    if (brukt.has(id))
      settMelding('Fargen var i bruk. Det som brukte den, har fått den nærmeste i profilen.');
  };
  const flytt = (i: number, d: -1 | 1) => {
    const f = [...profil];
    const j = i + d;
    if (j < 0 || j >= f.length) return;
    [f[i], f[j]] = [f[j]!, f[i]!];
    bruk(f, 'Flytt farge i profilen');
  };

  const profilknapp = (p: Fargeprofil) => {
    const er = p.farger.join() === profil.join();
    return (
      <li key={p.id} class="fp-profil-rad">
        <button
          type="button"
          class={`fp-profil${er ? ' valgt' : ''}`}
          aria-pressed={er}
          title={`${p.navn}: ${p.farger.map((id) => fargekode(finnMateriale(id))).join(', ')}`}
          onClick={() => bruk(p.farger)}
        >
          <Prover farger={p.farger} />
          <span class="fp-profilnavn">{p.navn}</span>
        </button>
        {p.egen && (
          <button
            type="button"
            class="fp-slett"
            aria-label={`Slett profilen ${p.navn}`}
            title="Slett profilen"
            onClick={() => {
              slettEgenProfil(p.id);
              ny();
            }}
          >
            ×
          </button>
        )}
      </li>
    );
  };

  const apneLager = () => {
    settUtvalg([...profil]);
    settLagNavn('');
    settLagSok('');
    settLager(true);
  };
  const veksleUtvalg = (id: string) =>
    settUtvalg(utvalg.includes(id) ? utvalg.filter((x) => x !== id) : [...utvalg, id]);
  const lagProfil = (e: Event) => {
    e.preventDefault();
    if (!lagNavn.trim() || utvalg.length === 0) return;
    const p = lagreEgenProfil(lagNavn, utvalg);
    if (!p) {
      settMelding('Nettleseren ville ikke lagre profilen.');
      return;
    }
    bruk(p.farger, 'Bruk ny fargeprofil');
    settMelding(`«${p.navn}» er laget og brukt i prosjektet. Den ligger i denne nettleseren.`);
    settLager(false);
    ny();
  };

  if (skjema)
    return (
      <div class="fargepanel">
        <Filamentskjema
          key={skjema.id ?? 'ny'}
          start={skjema}
          ferdig={(f, leggTilIProfil) => {
            settSkjema(null);
            if (!f) return;
            ny();
            // the project's copy of the filament follows the registry; a new filament may join the profile
            if (leggTilIProfil && !profil.includes(f.id))
              bruk([...profil, f.id], 'Legg til farge i profilen');
            else benk.endre({ navn: 'Oppdater filament', anvend: synkFilamenter });
            settMelding(`Filamentet ${fargekode(f)} er lagret i denne nettleseren.`);
          }}
        />
      </div>
    );

  const valgtM =
    valgtFarge !== null && valgtFarge < profil.length ? finnMateriale(profil[valgtFarge]!) : null;
  const lagTreff = finnFilamenter({ tekst: lagSok }, alle);

  return (
    <div class="fargepanel">
      <h3 class="underoverskrift" id="fp-aktiv">
        Fargene i prosjektet ({profil.length})
      </h3>
      <ol class="profilfargeliste fp-ruter" aria-labelledby="fp-aktiv">
        {profil.map((id, i) => {
          const m = finnMateriale(id);
          return (
            <li key={id}>
              <button
                type="button"
                class={`fp-rute${valgtFarge === i ? ' valgt' : ''}`}
                style={{ background: m.hex }}
                aria-pressed={valgtFarge === i}
                aria-label={`Farge ${i + 1}: ${fargekode(m)}, ${m.type}${brukt.has(id) ? ', i bruk' : ''}`}
                title={`${i + 1}. ${filamentLinje(m)}${brukt.has(id) ? ' · i bruk' : ''}`}
                onClick={() => settValgtFarge(valgtFarge === i ? null : i)}
              >
                <span class="fp-nr" aria-hidden="true">
                  {i + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {valgtM && valgtFarge !== null && (
        <div class="fp-detalj" role="group" aria-label={`Valgt farge ${valgtFarge + 1}`}>
          <span class="mono">{fargekode(valgtM)}</span>
          <span class="dempet fp-linje" title={filamentLinje(valgtM)}>
            {filamentInfo(valgtM)}
          </span>
          <span class="fp-knapper">
            <button
              type="button"
              class="kontroll-knapp"
              disabled={valgtFarge === 0}
              aria-label={`Flytt farge ${valgtFarge + 1} mot start`}
              title="Flytt mot start"
              onClick={() => {
                flytt(valgtFarge, -1);
                settValgtFarge(valgtFarge - 1);
              }}
            >
              ←
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={valgtFarge === profil.length - 1}
              aria-label={`Flytt farge ${valgtFarge + 1} mot slutt`}
              title="Flytt mot slutt"
              onClick={() => {
                flytt(valgtFarge, 1);
                settValgtFarge(valgtFarge + 1);
              }}
            >
              →
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              disabled={profil.length <= 1}
              aria-label={`Fjern farge ${valgtFarge + 1} fra profilen`}
              onClick={() => {
                fjern(profil[valgtFarge]!);
                settValgtFarge(null);
              }}
            >
              Fjern
            </button>
          </span>
        </div>
      )}
      {melding && (
        <p class="merknad" role="status">
          {melding}
        </p>
      )}

      <h3 class="underoverskrift" id="fp-profiler">
        Profiler
      </h3>
      <ul class="fp-profiler" role="list" aria-labelledby="fp-profiler">
        {FERDIGE_PROFILER.map(profilknapp)}
        {egneProfiler.map(profilknapp)}
        <li>
          <button
            type="button"
            class="fp-pluss"
            aria-expanded={lager}
            aria-label="Ny profil"
            title="Lag en ny profil"
            onClick={() => (lager ? settLager(false) : apneLager())}
          >
            +
          </button>
        </li>
      </ul>
      {lager && (
        <form class="fp-lager" onSubmit={lagProfil} aria-label="Lag profil">
          <input
            type="search"
            aria-label="Søk etter farge"
            placeholder="Søk etter farge"
            value={lagSok}
            onInput={(e) => settLagSok((e.target as HTMLInputElement).value)}
          />
          <div class="fp-rutenett" role="group" aria-label="Velg fargene til profilen">
            {lagTreff.map((m) => {
              const plass = utvalg.indexOf(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  class={`fp-rute${plass >= 0 ? ' valgt' : ''}`}
                  style={{ background: m.hex }}
                  aria-pressed={plass >= 0}
                  aria-label={`${fargekode(m)}, ${m.type}`}
                  title={filamentLinje(m)}
                  onClick={() => veksleUtvalg(m.id)}
                >
                  {plass >= 0 && (
                    <span class="fp-nr" aria-hidden="true">
                      {plass + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {lagTreff.length === 0 && <p class="merknad">Ingen farger passer.</p>}
          <label class="felt stablet">
            <span>Navn på profilen</span>
            <input
              type="text"
              maxLength={40}
              placeholder="for eksempel «AMS hjemme»"
              value={lagNavn}
              onInput={(e) => settLagNavn((e.target as HTMLInputElement).value)}
            />
          </label>
          <div class="knapperad">
            <button type="submit" class="primar" disabled={!lagNavn.trim() || utvalg.length === 0}>
              Lag profil
            </button>
            <span class="dempet" role="status">
              {utvalg.length} valgt
            </span>
            <button type="button" class="sekundar" onClick={() => settLager(false)}>
              Avbryt
            </button>
          </div>
        </form>
      )}

      <h3 class="underoverskrift" id="fp-samlinger">
        Fargesamlinger
      </h3>
      <Samlingsvelger
        kompakt
        bruk={(ider, navn) => {
          lagreSamlingFarger(ider);
          bruk(ider, `Fargesamling ${navn}`);
          settMelding(
            `«${navn}» er lagt inn som fargene i prosjektet. Farger som var i bruk, er byttet med den nærmeste i samlingen.`,
          );
        }}
      />

      <details class="fp-avansert">
        <summary>Avansert</summary>
        <h3 class="underoverskrift" id="fp-grupper">
          Fargegrupper
        </h3>
        {grupper.length === 0 ? (
          <p class="dempet">
            En gruppe er et sett filamenter du ofte bruker sammen. Lagre fargene over som en gruppe.
          </p>
        ) : (
          <ul class="profilliste" role="list" aria-labelledby="fp-grupper">
            {grupper.map((g: Fargegruppe) => (
              <li key={g.id}>
                <span class="profilvalg">
                  <span class="profilnavn">{g.navn}</span>
                  <Prover farger={g.farger.filter((id) => alle.some((m) => m.id === id))} />
                </span>
                <button
                  type="button"
                  class="kontroll-knapp"
                  onClick={() =>
                    bruk(
                      [...new Set([...profil, ...g.farger.filter((id) => alle.some((m) => m.id === id))])],
                      'Legg til gruppe',
                    )
                  }
                >
                  Legg til<span class="visuelt-skjult"> gruppen {g.navn}</span>
                </button>
                <button
                  type="button"
                  class="kontroll-knapp"
                  onClick={() => {
                    slettGruppe(g.id);
                    ny();
                  }}
                >
                  Slett<span class="visuelt-skjult"> gruppen {g.navn}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          class="profil-lagre"
          onSubmit={(e) => {
            e.preventDefault();
            const g = lagreGruppe(gruppenavn, profil);
            settMelding(g ? `Gruppen «${g.navn}» er lagret.` : 'Gruppen ble ikke lagret.');
            if (g) settGruppenavn('');
            ny();
          }}
        >
          <label class="felt">
            <span>Lagre fargene som gruppe</span>
            <input
              type="text"
              maxLength={40}
              placeholder="for eksempel «Jul»"
              value={gruppenavn}
              onInput={(e) => settGruppenavn((e.target as HTMLInputElement).value)}
            />
          </label>
          <button type="submit" class="sekundar" disabled={!gruppenavn.trim()}>
            Lagre gruppe
          </button>
        </form>

        <h3 class="underoverskrift" id="fp-register">
          Filamentregister
        </h3>
        <div class="registerfilter">
          <label class="felt">
            <span>Søk</span>
            <input
              type="search"
              value={tekst}
              placeholder="navn, produsent, serie, varenummer"
              onInput={(e) => settTekst((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="felt">
            <span>Produsent</span>
            <select value={produsent} onChange={(e) => settProdusent((e.target as HTMLSelectElement).value)}>
              <option value="">Alle</option>
              {produsenter(alle).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label class="felt">
            <span>Materiale</span>
            <select
              value={type}
              onChange={(e) => settType((e.target as HTMLSelectElement).value as Materialtype | '')}
            >
              <option value="">Alle</option>
              {TYPER.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p class="merknad" role="status">
          {treff.length === 0 ? 'Ingen filamenter passer.' : `${treff.length} av ${alle.length} filamenter.`}
        </p>
        <ul class="registerliste" role="list" aria-labelledby="fp-register">
          {treff.map((m) => {
            const i = profil.includes(m.id);
            return (
              <li key={m.id}>
                <span class="fargeprove stor" style={{ background: m.hex }} aria-hidden="true" />
                <span class="fp-tekst">
                  <span class="mono">{fargekode(m)}</span>
                  <span class="dempet fp-linje" title={filamentLinje(m)}>
                    {filamentInfo(m)}
                  </span>
                </span>
                <span class="fp-knapper">
                  <button type="button" class="kontroll-knapp" disabled={i} onClick={() => leggTil(m.id)}>
                    {i ? 'I profilen' : 'Legg til'}
                    <span class="visuelt-skjult"> {visningsnavn(m)}</span>
                  </button>
                  {m.egen && (
                    <>
                      <button
                        type="button"
                        class="kontroll-knapp"
                        aria-label={`Rediger ${visningsnavn(m)}`}
                        onClick={() => settSkjema(tilSkjema(m))}
                      >
                        <Ikon id="pen" storrelse={14} />
                      </button>
                      <button
                        type="button"
                        class="kontroll-knapp"
                        disabled={brukt.has(m.id) || i}
                        aria-label={`Slett ${visningsnavn(m)} fra registeret`}
                        onClick={() => {
                          slettEgetFilament(m.id);
                          ny();
                        }}
                      >
                        Slett
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <button type="button" class="sekundar" onClick={() => settSkjema({ ...TOMT })}>
          + Nytt filament
        </button>
        <p class="merknad">
          Startkatalogen er foreløpig og ikke bekreftet på lager. Egne filamenter lagres i denne nettleseren
          og følger prosjektet.
        </p>
      </details>
    </div>
  );
}
