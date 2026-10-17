/**
 * «Min konto» (Sivert, 2026-10-16): sign up, sign in, the plan and what the
 * services cost (everything free for now), the member's shared signs, and
 * the signs shared from this browser without an account. Payment is shown
 * as prepared, not working: no provider is switched on.
 */
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { nettsti } from '@/lib/nettsti';
import {
  delteSkilt,
  huskDeling,
  IKKE_PA,
  konto,
  kontoMulig,
  KontoFeil,
  type DeltSkilt,
  type Medlem,
} from '@/lib/konto/api';
import { BETALINGSMERKNAD, BETALINGSTEKST, LEVERANDORER, TJENESTER } from '@/lib/konto/tjenester';
import './konto.css';

const MIN_PASSORD = 10;
const dato = (v: string) => new Date(v).toLocaleDateString('nb-NO', { dateStyle: 'medium' });
const melding = (e: unknown) => (e instanceof Error ? e.message : 'Noe gikk galt.');

function Felt({
  navn,
  etikett,
  type = 'text',
  autocomplete,
  hjelp,
  verdi,
  sett,
}: {
  navn: string;
  etikett: string;
  type?: string;
  autocomplete: string;
  hjelp?: string;
  verdi: string;
  sett: (v: string) => void;
}) {
  return (
    <label class="konto__felt">
      <span>{etikett}</span>
      <input
        name={navn}
        type={type}
        autocomplete={autocomplete}
        required
        value={verdi}
        onInput={(e) => sett((e.target as HTMLInputElement).value)}
        aria-describedby={hjelp ? `${navn}-hjelp` : undefined}
      />
      {hjelp && (
        <small id={`${navn}-hjelp`} class="konto__hjelp">
          {hjelp}
        </small>
      )}
    </label>
  );
}

function Innlogging({ ferdig }: { ferdig: (m: Medlem) => void }) {
  const [modus, settModus] = useState<'inn' | 'ny'>('inn');
  const [navn, settNavn] = useState('');
  const [epost, settEpost] = useState('');
  const [passord, settPassord] = useState('');
  const [vilkar, settVilkar] = useState(false);
  const [feil, settFeil] = useState<string | null>(null);
  const [sender, settSender] = useState(false);

  const send = async (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault();
    settFeil(null);
    if (modus === 'ny' && passord.length < MIN_PASSORD) {
      settFeil(`Passordet må ha minst ${MIN_PASSORD} tegn.`);
      return;
    }
    settSender(true);
    try {
      const svar =
        modus === 'inn'
          ? await konto.loggInn(epost, passord)
          : await konto.registrer(navn, epost, passord, vilkar);
      ferdig(svar.medlem);
    } catch (f) {
      settFeil(melding(f));
    } finally {
      settSender(false);
    }
  };

  return (
    <section class="konto__kort" aria-labelledby="konto-inn-tittel">
      <div class="konto__faner" role="group" aria-label="Logg inn eller lag konto">
        <button type="button" aria-pressed={modus === 'inn'} onClick={() => settModus('inn')}>
          Logg inn
        </button>
        <button type="button" aria-pressed={modus === 'ny'} onClick={() => settModus('ny')}>
          Lag konto
        </button>
      </div>
      <h2 id="konto-inn-tittel">{modus === 'inn' ? 'Logg inn' : 'Lag en konto'}</h2>
      <form class="konto__skjema" onSubmit={(e) => void send(e)}>
        {modus === 'ny' && (
          <Felt
            navn="navn"
            etikett="Navn"
            autocomplete="name"
            hjelp="Vises ved skiltene du deler."
            verdi={navn}
            sett={settNavn}
          />
        )}
        <Felt
          navn="epost"
          etikett="E-post"
          type="email"
          autocomplete="email"
          verdi={epost}
          sett={settEpost}
        />
        <Felt
          navn="passord"
          etikett="Passord"
          type="password"
          autocomplete={modus === 'inn' ? 'current-password' : 'new-password'}
          hjelp={modus === 'ny' ? `Minst ${MIN_PASSORD} tegn.` : undefined}
          verdi={passord}
          sett={settPassord}
        />
        {modus === 'ny' && (
          <label class="konto__avkrysning">
            <input
              type="checkbox"
              required
              checked={vilkar}
              onChange={(e) => settVilkar((e.target as HTMLInputElement).checked)}
            />
            <span>
              Jeg godtar <a href={nettsti('/vilkar/')}>vilkårene</a> og har lest om{' '}
              <a href={nettsti('/personvern/')}>personvern</a>. Skiltene mine er private til jeg selv velger
              «Publiser i galleriet» i Sign Forge.
            </span>
          </label>
        )}
        {feil && (
          <p class="konto__feil" role="alert">
            {feil}
          </p>
        )}
        <button type="submit" class="konto__knapp" disabled={sender}>
          {sender ? 'Vent litt …' : modus === 'inn' ? 'Logg inn' : 'Lag konto'}
        </button>
      </form>
    </section>
  );
}

function Skiltliste({ skilt, slett }: { skilt: DeltSkilt[]; slett: (s: DeltSkilt) => void }) {
  return (
    <ul class="konto__skilt" role="list">
      {skilt.map((s) => (
        <li key={s.id}>
          <span class="konto__miniatyr">{s.bilde && <img src={s.bilde} alt="" loading="lazy" />}</span>
          <span class="konto__skilttekst">
            <strong>{s.tittel}</strong>
            <small>
              Delt {dato(s.endret)}
              {s.gangerBrukt > 0 &&
                ` · brukt som mal ${s.gangerBrukt} ${s.gangerBrukt === 1 ? 'gang' : 'ganger'}`}
            </small>
          </span>
          <button type="button" class="konto__knapp konto__knapp--rolig" onClick={() => slett(s)}>
            Fjern<span class="visuelt-skjult"> {s.tittel}</span> fra galleriet
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Signs shared from this browser without an account; the browser keeps the key to remove them. */
function FraDenneNettleseren() {
  const [delte, settDelte] = useState(() => delteSkilt());
  const [feil, settFeil] = useState<string | null>(null);
  const liste = Object.entries(delte);
  if (!liste.length) return null;
  const fjern = async (prosjekt: string, id: string, nokkel: string) => {
    settFeil(null);
    try {
      await konto.slettSkilt(id, nokkel);
    } catch (e) {
      if (!(e instanceof KontoFeil && e.status === 404)) {
        settFeil(melding(e));
        return;
      }
    }
    huskDeling(prosjekt, null);
    settDelte(delteSkilt());
  };
  return (
    <section class="konto__kort" aria-labelledby="konto-nettleser-tittel">
      <h2 id="konto-nettleser-tittel">Delt fra denne nettleseren</h2>
      <p class="konto__dempet">
        Disse skiltene ble delt fra denne nettleseren. Du kan fjerne dem fra galleriet herfra.
      </p>
      <ul class="konto__skilt" role="list">
        {liste.map(([prosjekt, d]) => (
          <li key={d.id}>
            <span class="konto__skilttekst">
              <strong>{d.tittel}</strong>
              <small>Delt {dato(d.delt)}</small>
            </span>
            <button
              type="button"
              class="konto__knapp konto__knapp--rolig"
              onClick={() => void fjern(prosjekt, d.id, d.nokkel)}
            >
              Fjern<span class="visuelt-skjult"> {d.tittel}</span> fra galleriet
            </button>
          </li>
        ))}
      </ul>
      {feil && (
        <p class="konto__feil" role="alert">
          {feil}
        </p>
      )}
    </section>
  );
}

function Tjenester({ medlem }: { medlem: Medlem | null }) {
  return (
    <section class="konto__kort" aria-labelledby="konto-plan-tittel">
      <h2 id="konto-plan-tittel">Plan og betaling</h2>
      {medlem && (
        <p>
          Planen din: <strong>{medlem.plan === 'gratis' ? 'Gratis' : medlem.plan}</strong>
        </p>
      )}
      <p class="konto__dempet">{BETALINGSMERKNAD}</p>
      <ul class="konto__tjenester" role="list">
        {Object.entries(TJENESTER).map(([id, t]) => (
          <li key={id}>
            <span>
              <strong>{t.navn}</strong>
              <small>{t.beskrivelse}</small>
            </span>
            <span class={`konto__merke konto__merke--${t.betaling}`}>{BETALINGSTEKST[t.betaling]}</span>
          </li>
        ))}
      </ul>
      <p class="konto__dempet">
        Betaling med{' '}
        {Object.values(LEVERANDORER)
          .map((l) => l.navn)
          .join(' eller ')}{' '}
        er forberedt, men ikke slått på. Du blir aldri belastet uten å ha valgt det selv.
      </p>
    </section>
  );
}

function Profil({
  medlem,
  endret,
  utlogget,
}: {
  medlem: Medlem;
  endret: (m: Medlem) => void;
  utlogget: () => void;
}) {
  const [navn, settNavn] = useState(medlem.navn);
  const [skilt, settSkilt] = useState<DeltSkilt[] | null>(null);
  const [beskjed, settBeskjed] = useState<string | null>(null);

  useEffect(() => {
    konto
      .mineSkilt()
      .then((s) => settSkilt(s.skilt))
      .catch((e: unknown) => settBeskjed(melding(e)));
  }, [medlem.id]);

  const lagre = async (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      endret((await konto.profil(navn)).medlem);
      settBeskjed('Navnet er lagret.');
    } catch (f) {
      settBeskjed(melding(f));
    }
  };
  const slettSkilt = async (s: DeltSkilt) => {
    try {
      await konto.slettSkilt(s.id);
      settSkilt((l) => l?.filter((x) => x.id !== s.id) ?? null);
      settBeskjed(`«${s.tittel}» er fjernet fra galleriet.`);
    } catch (f) {
      settBeskjed(melding(f));
    }
  };

  return (
    <>
      <section class="konto__kort" aria-labelledby="konto-profil-tittel">
        <h2 id="konto-profil-tittel">Hei, {medlem.navn}</h2>
        <p class="konto__dempet">
          {medlem.epost} · medlem siden {dato(medlem.opprettet)}
        </p>
        <form class="konto__skjema konto__skjema--rad" onSubmit={(e) => void lagre(e)}>
          <Felt
            navn="profil-navn"
            etikett="Navn ved skiltene dine"
            autocomplete="name"
            verdi={navn}
            sett={settNavn}
          />
          <button type="submit" class="konto__knapp">
            Lagre navnet
          </button>
        </form>
        {beskjed && (
          <p class="konto__dempet" role="status">
            {beskjed}
          </p>
        )}
        <button
          type="button"
          class="konto__knapp konto__knapp--rolig"
          onClick={() => void konto.loggUt().finally(utlogget)}
        >
          Logg ut
        </button>
      </section>

      <section class="konto__kort" aria-labelledby="konto-skilt-tittel">
        <h2 id="konto-skilt-tittel">Skiltene dine</h2>
        {!skilt && <p class="konto__dempet">Henter …</p>}
        {skilt?.length === 0 && (
          <p class="konto__dempet">
            Ingen ennå. Velg «Publiser i galleriet» i Fil-menyen i{' '}
            <a href={nettsti('/skaperverksted/signgen/')}>Sign Forge</a> mens du er logget inn, så kommer
            skiltet her.
          </p>
        )}
        {skilt && skilt.length > 0 && <Skiltliste skilt={skilt} slett={(s) => void slettSkilt(s)} />}
      </section>
    </>
  );
}

/** Delete the account and its signs; the password confirms it. */
function SlettKonto({ utlogget }: { utlogget: () => void }) {
  const [slettApen, settSlettApen] = useState(false);
  const [passord, settPassord] = useState('');
  const [feil, settFeil] = useState<string | null>(null);
  const slettKonto = async (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await konto.slettKonto(passord);
      utlogget();
    } catch (f) {
      settFeil(melding(f));
    }
  };

  return (
    <section class="konto__kort" aria-labelledby="konto-slett-tittel">
      <h2 id="konto-slett-tittel">Slett kontoen</h2>
      <p class="konto__dempet">Kontoen og alle skiltene du har publisert med den, slettes for godt.</p>
      {!slettApen ? (
        <button type="button" class="konto__knapp konto__knapp--fare" onClick={() => settSlettApen(true)}>
          Slett kontoen …
        </button>
      ) : (
        <form class="konto__skjema konto__skjema--rad" onSubmit={(e) => void slettKonto(e)}>
          <Felt
            navn="slett-passord"
            etikett="Skriv passordet for å bekrefte"
            type="password"
            autocomplete="current-password"
            verdi={passord}
            sett={settPassord}
          />
          <button type="submit" class="konto__knapp konto__knapp--fare">
            Slett for godt
          </button>
        </form>
      )}
      {feil && (
        <p class="konto__feil" role="alert">
          {feil}
        </p>
      )}
    </section>
  );
}

export default function KontoSide() {
  const [medlem, settMedlem] = useState<Medlem | null | undefined>(kontoMulig ? undefined : null);
  const [feil, settFeil] = useState<string | null>(kontoMulig ? null : IKKE_PA);

  useEffect(() => {
    if (!kontoMulig) return;
    konto
      .meg()
      .then((s) => settMedlem(s.medlem))
      .catch((e: unknown) => {
        settMedlem(null);
        settFeil(melding(e));
      });
  }, []);

  if (feil && !medlem) {
    return (
      <div class="konto">
        <p class="konto__kort" role="status">
          {feil}
        </p>
        <Tjenester medlem={null} />
      </div>
    );
  }
  if (medlem === undefined)
    return (
      <p class="konto" role="status">
        Henter kontoen …
      </p>
    );
  return (
    <div class="konto">
      {medlem ? (
        <Profil medlem={medlem} endret={settMedlem} utlogget={() => settMedlem(null)} />
      ) : (
        <Innlogging ferdig={settMedlem} />
      )}
      <Tjenester medlem={medlem} />
      <FraDenneNettleseren />
      {medlem && <SlettKonto utlogget={() => settMedlem(null)} />}
    </div>
  );
}
