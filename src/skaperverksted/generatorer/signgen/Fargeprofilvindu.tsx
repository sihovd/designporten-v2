/**
 * The start window and colour profile editor (Sivert, 2026-10-05): pick
 * the colours you have in the printer or can get, from ready-made
 * profiles or your own, add or remove colours (four by default), and save
 * the set as your own profile. Shown when a new sign starts, and from the
 * project inspector afterwards.
 */
import { useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { alleMaterialer, fargekode, finnMateriale } from '../../core/materialer';
import { Dialog } from '../../shell/Dialog';
import { brukBenk } from '../../shell/bruk-benk';
import {
  FERDIGE_PROFILER,
  hentEgneProfiler,
  lagreEgenProfil,
  slettEgenProfil,
  STANDARD_ANTALL_FARGER,
  STANDARD_PROFIL,
  type Fargeprofil,
} from './fargeprofiler';
import { nyttSigngenDokument, palett, settPalett, startErValgt } from './dokument';
import { signtilstand } from './tilstand';
import { lastEgneFilamenter } from './filamenter';
import { Filamentskjema, TOMT } from './Fargepanel';

function Fargerad({ farger }: { farger: string[] }) {
  return (
    <span class="profilfarger" aria-hidden="true">
      {farger.map((id) => (
        <span key={id} class="fargeprove" style={{ background: finnMateriale(id).hex }} />
      ))}
    </span>
  );
}

export function Fargeprofilvindu({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  useState(() => lastEgneFilamenter());
  const start = !startErValgt(t.dok);
  const [egne, settEgne] = useState<Fargeprofil[]>(() => hentEgneProfiler());
  const naa = start ? STANDARD_PROFIL.farger : palett(t.dok);
  const kjent = [...FERDIGE_PROFILER, ...egne].find((p) => p.farger.join() === naa.join());
  const [valgt, settValgt] = useState<string | null>(kjent?.id ?? null);
  const [farger, settFarger] = useState<string[]>(naa);
  const [navn, settNavn] = useState('');
  const [melding, settMelding] = useState<string | null>(null);
  const [nyttFilament, settNyttFilament] = useState(false);

  const velgProfil = (p: Fargeprofil) => {
    settValgt(p.id);
    settFarger(p.farger);
    settMelding(null);
  };
  const endreFarger = (f: string[]) => {
    settFarger(f);
    settValgt([...FERDIGE_PROFILER, ...egne].find((p) => p.farger.join() === f.join())?.id ?? null);
  };

  const bruk = () => {
    if (start) {
      // a fresh sign: start it in these colours (text first, base second)
      const ny = nyttSigngenDokument(farger);
      benk.lastInn({ ...ny, parametre: { ...ny.parametre, startvalgt: true } });
      benk.kommando('tilpass');
      benk.melde(
        `Skiltet bruker ${farger.length} farger: ${farger.map((id) => fargekode(finnMateriale(id))).join(', ')}.`,
      );
    } else {
      benk.endre({ navn: 'Fargeprofil', anvend: (d) => settPalett(d, farger) });
      benk.melde(
        'Fargeprofilen er oppdatert. Farger som ble tatt ut, er byttet med den nærmeste i profilen.',
      );
    }
    // «Fra CSV» was chosen on the start page: the batch window follows the new sign
    const csv = start && signtilstand(benk).t.startCsv;
    signtilstand(benk).sett({
      fargeprofil: false,
      startsteg: 'valg',
      startCsv: false,
      ...(csv ? { csv: 'importer' as const } : {}),
    });
  };
  const lukk = () => {
    // closing the colours at the start goes back to the start page; later it just closes
    signtilstand(benk).sett(
      start ? { fargeprofil: false, startsteg: 'valg', startCsv: false } : { fargeprofil: false },
    );
  };
  const lagre = () => {
    const n = navn.trim();
    if (!n) return;
    const p = lagreEgenProfil(n, farger);
    if (!p) {
      settMelding('Nettleseren ville ikke lagre profilen. Den virker likevel for dette skiltet.');
      return;
    }
    const liste = hentEgneProfiler();
    settEgne(liste);
    settValgt(liste.find((x) => x.navn === p.navn)?.id ?? null);
    settNavn('');
    settMelding(`«${p.navn}» er lagret i denne nettleseren.`);
  };

  const ledige = alleMaterialer().filter((m) => !farger.includes(m.id));
  const profilvalg = (p: Fargeprofil) => (
    <li key={p.id}>
      <label class={`profilvalg${valgt === p.id ? ' valgt' : ''}`}>
        <input type="radio" name="fargeprofil" checked={valgt === p.id} onChange={() => velgProfil(p)} />
        <span class="profilnavn">{p.navn}</span>
        <Fargerad farger={p.farger} />
        <span class="visuelt-skjult">: {p.farger.map((id) => finnMateriale(id).navn).join(', ')}</span>
      </label>
      {p.egen && (
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() => {
            slettEgenProfil(p.id);
            settEgne(hentEgneProfiler());
            if (valgt === p.id) settValgt(null);
          }}
        >
          Slett<span class="visuelt-skjult"> {p.navn}</span>
        </button>
      )}
    </li>
  );

  return (
    <Dialog tittel={start ? 'Velg fargene til skiltet' : 'Fargeprofil'} lukk={lukk} klasse="fargeprofil">
      <div class="fargeprofil-innhold">
        <p class="dempet">
          Velg fargene du har i printeren eller kan få tak i. Skiltet bruker bare disse, og du kan legge til
          flere når som helst. En profil har {STANDARD_ANTALL_FARGER} farger som standard.
        </p>
        <h3 id="ferdige-profiler">Ferdige profiler</h3>
        <ul class="profilliste" role="list" aria-labelledby="ferdige-profiler">
          {FERDIGE_PROFILER.map(profilvalg)}
        </ul>
        {egne.length > 0 && (
          <>
            <h3 id="egne-profiler">Mine profiler</h3>
            <ul class="profilliste" role="list" aria-labelledby="egne-profiler">
              {egne.map(profilvalg)}
            </ul>
          </>
        )}

        <h3 id="profilens-farger">Fargene i profilen ({farger.length})</h3>
        <ul class="profilfargeliste" role="list" aria-labelledby="profilens-farger">
          {farger.map((id, i) => {
            const m = finnMateriale(id);
            return (
              <li key={id}>
                <span class="mono filamentnr">{i + 1}</span>
                <span class="fargeprove" style={{ background: m.hex }} aria-hidden="true" />
                <span>
                  <span class="mono">{fargekode(m)}</span>{' '}
                  <span class="dempet">{m.produsent ? `${m.produsent} ${m.type}` : m.type}</span>
                </span>
                <button
                  type="button"
                  class="kontroll-knapp"
                  disabled={farger.length <= 1}
                  onClick={() => endreFarger(farger.filter((x) => x !== id))}
                >
                  Fjern<span class="visuelt-skjult"> {m.navn}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {ledige.length > 0 && (
          <label class="felt" for="profil-legg-til">
            <span>Legg til farge</span>
            <select
              id="profil-legg-til"
              value=""
              onChange={(e) => {
                const id = (e.target as HTMLSelectElement).value;
                if (id) endreFarger([...farger, id]);
              }}
            >
              <option value="">Velg fra katalogen …</option>
              {ledige.map((m) => (
                <option key={m.id} value={m.id}>
                  {fargekode(m)} ({m.produsent ? `${m.produsent} ${m.type}` : m.type})
                </option>
              ))}
            </select>
          </label>
        )}

        {nyttFilament ? (
          <Filamentskjema
            start={{ ...TOMT }}
            ferdig={(f, leggTil) => {
              settNyttFilament(false);
              if (f && leggTil && !farger.includes(f.id)) endreFarger([...farger, f.id]);
              if (f) settMelding(`Filamentet ${fargekode(f)} er lagret i denne nettleseren.`);
            }}
          />
        ) : (
          <button type="button" class="sekundar" onClick={() => settNyttFilament(true)}>
            + Nytt filament
          </button>
        )}

        <form
          class="profil-lagre"
          onSubmit={(e) => {
            e.preventDefault();
            lagre();
          }}
        >
          <label class="felt" for="profil-navn">
            <span>Lagre som min profil</span>
            <input
              id="profil-navn"
              type="text"
              maxLength={40}
              placeholder="Navn, for eksempel «AMS hjemme»"
              value={navn}
              onInput={(e) => settNavn((e.target as HTMLInputElement).value)}
            />
          </label>
          <button type="submit" class="sekundar" disabled={!navn.trim()}>
            Lagre profil
          </button>
        </form>
        {melding && (
          <p class="merknad" role="status">
            {melding}
          </p>
        )}
        <p class="merknad">
          Fargene kommer fra filamentregisteret. Startkatalogen er ikke bekreftet på lager ennå. Egne
          filamenter legger du til i Fargeprofil-panelet inne i verkstedet.
        </p>
        <div class="knapperad fargeprofil-fot">
          <button type="button" class="primar" onClick={bruk}>
            {start ? 'Start skiltet' : 'Bruk fargene'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
