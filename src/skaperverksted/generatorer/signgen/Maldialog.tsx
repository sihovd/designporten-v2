/**
 * Templates in the editor (Sivert, 2026-10-06, §22): the library to start
 * from («Fra mal»), and the window that saves the open sign as a template
 * with its ownership fields. Templates stay in this browser; sharing and
 * selling are not open yet, and the window says so.
 */
import { useEffect, useState } from 'preact/hooks';
import { konto, kontoMulig, type DeltSkilt } from '@/lib/konto/api';
import { DELT_LISENS, hentDeltMal } from './deling';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { Dialog } from '../../shell/Dialog';
import { Ikon } from '../../shell/ikoner';
import { brukBenk } from '../../shell/bruk-benk';
import { palett, startErValgt } from './dokument';
import { finnMateriale } from '../../core/materialer';
import {
  brukMal,
  hentEgneMaler,
  innebygdeMaler,
  lagreMal,
  nyMalFraDokument,
  slettMal,
  STANDARD_LISENS,
  SYNLIGHETER,
  type Mal,
  type Malfeil,
  type Malsynlighet,
} from './maler';
import { lesInnSigngen } from './dokument';
import { signtilstand } from './tilstand';
import { apneCsv } from './csvhandlinger';
import { plangrenser } from '../../core/plangrenser';

const FEILTEKST: Record<Malfeil, string> = {
  full: 'Du har 30 maler, som er det mest nettleseren tar. Slett en for å lagre en ny.',
  'for-stor': 'Malen er for stor til å lagres i nettleseren.',
  lagring: 'Nettleseren ville ikke lagre malen.',
};

function Fargeprover({ mal }: { mal: Mal }) {
  const farger = palett(mal.dokument);
  return (
    <span class="profilfarger" aria-hidden="true">
      {farger.map((id) => (
        <span key={id} class="fargeprove" style={{ background: finnMateriale(id).hex }} />
      ))}
    </span>
  );
}

/**
 * Start a new project from a template, after asking when the open sign would be lost. Returns
 * false when the user said no.
 */
export function startFraMal(benk: Arbeidsbenk, mal: Mal): boolean {
  if (
    startErValgt(benk.tilstand.dok) &&
    !confirm(
      'Starte et nytt prosjekt fra malen? Det du har nå, blir borte hvis du ikke har lagret det som fil.',
    )
  )
    return false;
  const dok = lesInnSigngen(brukMal(mal));
  benk.lastInn(dok);
  benk.settUtsnitt({ zoom: 1, senterX: 0, senterY: 0 });
  benk.kommando('tilpass');
  signtilstand(benk).sett({ malvindu: null, startsteg: 'valg' });
  benk.melde(`Nytt prosjekt fra malen «${mal.navn}». Malen er ikke endret.`);
  return true;
}

/** Signs others have made (the public gallery), newest first, to start from. */
function Fellesmaler({ benk }: { benk: Arbeidsbenk }) {
  const [skilt, settSkilt] = useState<DeltSkilt[] | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const [henter, settHenter] = useState<string | null>(null);
  useEffect(() => {
    konto
      .skilt(24)
      .then((s) => settSkilt(s.skilt))
      .catch((e: unknown) => settFeil(e instanceof Error ? e.message : 'Galleriet kunne ikke hentes.'));
  }, []);
  const bruk = async (s: DeltSkilt) => {
    settHenter(s.id);
    try {
      startFraMal(benk, await hentDeltMal(s.id));
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Skiltet kunne ikke åpnes.');
    } finally {
      settHenter(null);
    }
  };
  return (
    <>
      <h3 class="underoverskrift" id="maler-felles">
        Nylig laget av andre
      </h3>
      {feil && (
        <p class="dempet" role="status">
          {feil}
        </p>
      )}
      {!feil && !skilt && (
        <p class="dempet" role="status">
          Henter skilt …
        </p>
      )}
      {skilt && skilt.length === 0 && <p class="dempet">Ingen skilt er delt ennå.</p>}
      {skilt && skilt.length > 0 && (
        <ul class="malliste" role="list" aria-labelledby="maler-felles">
          {skilt.map((s) => (
            <li key={s.id}>
              {s.bilde ? (
                <img class="fellesmal-bilde" src={s.bilde} alt="" width="56" height="40" loading="lazy" />
              ) : (
                <span class="fellesmal-bilde" aria-hidden="true" />
              )}
              <span class="fp-tekst">
                <strong>{s.tittel}</strong>
                <span class="dempet fp-linje">
                  {s.skaper} · {DELT_LISENS}
                </span>
              </span>
              <span class="fp-knapper">
                <button type="button" class="primar" disabled={henter !== null} onClick={() => void bruk(s)}>
                  {henter === s.id ? 'Åpner …' : 'Bruk malen'}
                  <span class="visuelt-skjult"> {s.tittel}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Choose a template and start a new project from it. */
export function Malbibliotek({ benk }: { benk: Arbeidsbenk }) {
  const [egne, settEgne] = useState(() => hentEgneMaler());
  const lukk = () => signtilstand(benk).sett({ malvindu: null });
  const bruk = (mal: Mal) => void startFraMal(benk, mal);
  const liste = (maler: Mal[], overskrift: string, id: string, kanSlette: boolean) => (
    <>
      <h3 class="underoverskrift" id={id}>
        {overskrift}
      </h3>
      {maler.length === 0 ? (
        <p class="dempet">Ingen ennå. Lagre et skilt som mal fra Fil-menyen.</p>
      ) : (
        <ul class="malliste" role="list" aria-labelledby={id}>
          {maler.map((m) => (
            <li key={m.id}>
              <span class="fp-tekst">
                <strong>{m.navn}</strong>
                {m.beskrivelse && <span class="dempet">{m.beskrivelse}</span>}
                <span class="dempet fp-linje">
                  {SYNLIGHETER.find((s) => s.id === m.synlighet)?.navn} · {m.skaper || 'Ukjent skaper'} ·{' '}
                  {m.lisens}
                </span>
              </span>
              <Fargeprover mal={m} />
              <span class="fp-knapper">
                <button type="button" class="primar" onClick={() => bruk(m)}>
                  Bruk malen<span class="visuelt-skjult"> {m.navn}</span>
                </button>
                {kanSlette && (
                  <button
                    type="button"
                    class="kontroll-knapp"
                    onClick={() => {
                      slettMal(m.id);
                      settEgne(hentEgneMaler());
                    }}
                  >
                    Slett<span class="visuelt-skjult"> malen {m.navn}</span>
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  return (
    <Dialog tittel="Fra mal" lukk={lukk} klasse="malbibliotek">
      <div class="malvindu-innhold">
        <p class="dempet">En mal er et skilt du starter fra. Du får en kopi, og malen blir som den var.</p>
        {liste(innebygdeMaler(), 'Fra Designporten', 'maler-innebygde', false)}
        {liste(egne, 'Mine maler', 'maler-egne', true)}
        {kontoMulig && <Fellesmaler benk={benk} />}
        <p class="merknad">
          Mine maler lagres i denne nettleseren.
          {kontoMulig
            ? ' Skilt som skaperne selv publiserer i «Nylig laget», kan brukes av andre.'
            : ' Deling og salg av maler er ikke åpnet ennå.'}
        </p>
      </div>
    </Dialog>
  );
}

/** Save the open sign as a template, with who made it, who owns it and on what terms it may be used. */
export function LagreSomMal({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const [navn, settNavn] = useState(t.dok.navn);
  const [beskrivelse, settBeskrivelse] = useState('');
  const [synlighet, settSynlighet] = useState<Malsynlighet>('privat');
  const [skaper, settSkaper] = useState('');
  const [eier, settEier] = useState('');
  const [lisens, settLisens] = useState(STANDARD_LISENS);
  const [pris, settPris] = useState('');
  const [kreditering, settKreditering] = useState('');
  const [rettigheter, settRettigheter] = useState('');
  const [feil, settFeil] = useState<string | null>(null);
  const [lagret, settLagret] = useState<string | null>(null);
  const lukk = () => signtilstand(benk).sett({ malvindu: null });

  const lagre = (e: Event) => {
    e.preventDefault();
    const n = navn.trim();
    if (!n) {
      settFeil('Malen trenger et navn.');
      return;
    }
    const belop = pris.trim() === '' ? null : Number(pris.replace(',', '.'));
    if (synlighet === 'kommersiell' && belop !== null && (!Number.isFinite(belop) || belop < 0)) {
      settFeil('Prisen må være et tall som ikke er negativt.');
      return;
    }
    const mal = nyMalFraDokument(t.dok, {
      navn: n,
      beskrivelse,
      synlighet,
      skaper,
      eier: eier || skaper,
      lisens,
      pris: belop === null ? null : { belop, valuta: 'NOK' },
      kreditering,
      bruksrettigheter: rettigheter,
    });
    const r = lagreMal(mal);
    if (!r.ok) {
      settFeil(FEILTEKST[r.feil]);
      return;
    }
    settFeil(null);
    settLagret(`«${mal.navn}» er lagret som mal i denne nettleseren.`);
    benk.melde(`«${mal.navn}» er lagret som mal.`);
  };

  return (
    <Dialog tittel="Lagre som mal" lukk={lukk} klasse="lagre-mal">
      <form class="malvindu-innhold" onSubmit={lagre}>
        <label class="felt">
          <span>Navn</span>
          <input
            type="text"
            maxLength={80}
            value={navn}
            required
            onInput={(e) => settNavn((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="felt">
          <span>Beskrivelse</span>
          <input
            type="text"
            maxLength={400}
            value={beskrivelse}
            onInput={(e) => settBeskrivelse((e.target as HTMLInputElement).value)}
          />
        </label>
        <fieldset class="malfelt">
          <legend>Hvem kan bruke malen</legend>
          {SYNLIGHETER.map((s) => (
            <label key={s.id} class="avkryssing">
              <input
                type="radio"
                name="mal-synlighet"
                checked={synlighet === s.id}
                onChange={() => settSynlighet(s.id)}
              />
              <span>
                {s.navn}
                <span class="dempet"> {s.hjelp}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label class="felt">
          <span>Skaper</span>
          <input
            type="text"
            maxLength={80}
            value={skaper}
            placeholder="Hvem laget designet"
            onInput={(e) => settSkaper((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="felt">
          <span>Eier</span>
          <input
            type="text"
            maxLength={80}
            value={eier}
            placeholder="Hvem eier rettighetene (som skaper hvis tomt)"
            onInput={(e) => settEier((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="felt">
          <span>Lisens</span>
          <input
            type="text"
            maxLength={200}
            value={lisens}
            onInput={(e) => settLisens((e.target as HTMLInputElement).value)}
          />
        </label>
        {synlighet === 'kommersiell' && (
          <label class="felt">
            <span>Pris (NOK)</span>
            <input
              type="text"
              inputMode="decimal"
              value={pris}
              onInput={(e) => settPris((e.target as HTMLInputElement).value)}
            />
          </label>
        )}
        <label class="felt">
          <span>Kreditering</span>
          <input
            type="text"
            maxLength={200}
            value={kreditering}
            placeholder="Hvordan skaperen skal krediteres"
            onInput={(e) => settKreditering((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="felt">
          <span>Bruksrettigheter</span>
          <input
            type="text"
            maxLength={400}
            value={rettigheter}
            placeholder="For eksempel om utskrifter kan selges"
            onInput={(e) => settRettigheter((e.target as HTMLInputElement).value)}
          />
        </label>
        {feil && (
          <p class="merknad" role="alert">
            {feil}
          </p>
        )}
        {lagret && (
          <p class="merknad" role="status">
            {lagret}
          </p>
        )}
        <div class="knapperad">
          <button type="submit" class="primar">
            Lagre som mal
          </button>
          <button type="button" class="sekundar" onClick={lukk}>
            {lagret ? 'Lukk' : 'Avbryt'}
          </button>
        </div>
        <p class="merknad">
          Malen lagres i denne nettleseren og er din. Deling og salg av maler er ikke åpnet ennå, så valget
          over og prisen er bare forberedt. Skiltet du har åpent, blir ikke endret.
        </p>
      </form>
    </Dialog>
  );
}

/** Fil-menu entries: save as template, and start a new project from one. */
export function Filvalg({ benk }: { benk: Arbeidsbenk }) {
  const lukkMeny = (e: Event) => (e.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
  return (
    <>
      <button
        type="button"
        role="menuitem"
        class="med-ikon"
        onClick={(e) => {
          lukkMeny(e);
          signtilstand(benk).sett({ malvindu: 'lagre' });
        }}
      >
        <Ikon id="save-template" storrelse={16} />
        Lagre som mal …
      </button>
      <button
        type="button"
        role="menuitem"
        class="med-ikon"
        onClick={(e) => {
          lukkMeny(e);
          signtilstand(benk).sett({ malvindu: 'bibliotek' });
        }}
      >
        <Ikon id="templates" storrelse={16} />
        Nytt prosjekt fra mal …
      </button>
      {kontoMulig && (
        <button
          type="button"
          role="menuitem"
          class="med-ikon"
          onClick={(e) => {
            lukkMeny(e);
            signtilstand(benk).sett({ malvindu: 'publiser' });
          }}
        >
          <Ikon id="share-template" storrelse={16} />
          Publiser i galleriet …
        </button>
      )}
      {plangrenser.csvBatch && (
        <button
          type="button"
          role="menuitem"
          class="med-ikon"
          onClick={(e) => {
            lukkMeny(e);
            apneCsv(benk);
          }}
        >
          <Ikon id="csv" storrelse={16} />
          Lag skilt fra CSV …
        </button>
      )}
    </>
  );
}
