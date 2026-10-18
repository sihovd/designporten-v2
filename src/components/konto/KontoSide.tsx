/**
 * «Min konto» (Sivert, 2026-10-16; stage B 2026-10-18): sign up, sign in and
 * forgotten password; for a member three parts, Mine tjenester (what the
 * server says they may use), Profil (name, address with its confirmation,
 * password, deleting the account) and Mine prosjekter (where projects live
 * today, and the signs published in the gallery). Links from e-mails land
 * here with the token after «#»; the page removes it from the address bar
 * and acts only when the visitor presses the button. Payment is shown as
 * prepared, not working: no provider is switched on.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { nettsti } from '@/lib/nettsti';
import {
  delteSkilt,
  huskDeling,
  IKKE_PA,
  konto,
  kontoMulig,
  KontoFeil,
  type DeltSkilt,
  type Kvote,
  type Medlem,
  type Prosjekt,
} from '@/lib/konto/api';
import {
  BETALINGSMERKNAD,
  betalingsmerke,
  betalingstekst,
  LEVERANDORER,
  PLANER,
  prisTekst,
  PROSJEKTAPPER,
  TJENESTER,
  type Plan,
  type TjenesteId,
} from '@/lib/konto/tjenester';
import './konto.css';

const MIN_PASSORD = 10;
const SIGN_FORGE = '/skaperverksted/signgen/';
/** Where each tool that stores projects on the account opens (`?prosjekt=<id>`). */
const VERKTOY: Record<string, string> = { signgen: SIGN_FORGE };
const dato = (v: string) => new Date(v).toLocaleDateString('nb-NO', { dateStyle: 'medium' });
const melding = (e: unknown) => (e instanceof Error ? e.message : 'Noe gikk galt.');

/** What a link from an e-mail asks for: «#bekreft=…», «#ny-epost=…» or «#nytt-passord=…». */
type Lenke = { handling: 'bekreft' | 'ny-epost' | 'nytt-passord'; token: string };

function lesLenke(): Lenke | null {
  const m = /^#(bekreft|ny-epost|nytt-passord)=([a-f0-9]{64})$/.exec(location.hash);
  if (!m) return null;
  // out of the address bar, history and anything the page loads later
  history.replaceState(null, '', location.pathname + location.search);
  return { handling: m[1] as Lenke['handling'], token: m[2] ?? '' };
}

function Felt({
  navn,
  etikett,
  type = 'text',
  autocomplete,
  hjelp,
  verdi,
  sett,
  minLength,
}: {
  navn: string;
  etikett: string;
  type?: string;
  autocomplete: string;
  hjelp?: string;
  verdi: string;
  sett: (v: string) => void;
  minLength?: number;
}) {
  return (
    <label class="konto__felt">
      <span>{etikett}</span>
      <input
        name={navn}
        type={type}
        autocomplete={autocomplete}
        required
        minLength={minLength}
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

/** A message under a form: an error is announced at once, the rest politely. */
function Beskjed({ tekst, feil = false }: { tekst: string | null; feil?: boolean }) {
  if (!tekst) return null;
  return feil ? (
    <p class="konto__feil" role="alert">
      {tekst}
    </p>
  ) : (
    <p class="konto__ok" role="status">
      {tekst}
    </p>
  );
}

/** A form whose button waits while it sends, and shows the answer or the error. */
function useSending() {
  const [sender, settSender] = useState(false);
  const [svar, settSvar] = useState<{ tekst: string; feil: boolean } | null>(null);
  const send = async (arbeid: () => Promise<string | null>) => {
    settSender(true);
    settSvar(null);
    try {
      const tekst = await arbeid();
      if (tekst) settSvar({ tekst, feil: false });
    } catch (e) {
      settSvar({ tekst: melding(e), feil: true });
    } finally {
      settSender(false);
    }
  };
  return { sender, svar, send, settSvar };
}

function Kort({
  id,
  tittel,
  children,
  fokus = false,
}: {
  id: string;
  tittel: string;
  children: ComponentChildren;
  fokus?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (fokus) ref.current?.focus();
  }, [fokus]);
  return (
    <section class="konto__kort" id={id} aria-labelledby={`${id}-tittel`}>
      <h2 id={`${id}-tittel`} ref={ref} tabIndex={fokus ? -1 : undefined}>
        {tittel}
      </h2>
      {children}
    </section>
  );
}

/** The action a link from an e-mail asked for, done only when the visitor presses the button. */
function Lenkehandling({
  lenke,
  ferdig,
  lukk,
}: {
  lenke: Lenke;
  ferdig: (handling: Lenke['handling']) => void;
  lukk: () => void;
}) {
  const { sender, svar, send } = useSending();
  const [passord, settPassord] = useState('');
  const [igjen, settIgjen] = useState('');
  const [utfort, settUtfort] = useState(false);

  const utfor = (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send(async () => {
      if (lenke.handling === 'bekreft') {
        const { epost } = await konto.bekreftEpost(lenke.token);
        settUtfort(true);
        ferdig('bekreft');
        return `E-postadressen ${epost} er bekreftet.`;
      }
      if (lenke.handling === 'ny-epost') {
        const { epost } = await konto.byttEpost(lenke.token);
        settUtfort(true);
        ferdig('ny-epost');
        return `Kontoen bruker nå ${epost}.`;
      }
      if (passord.length < MIN_PASSORD) throw new Error(`Passordet må ha minst ${MIN_PASSORD} tegn.`);
      if (passord !== igjen) throw new Error('Passordene er ikke like.');
      await konto.nyttPassord(lenke.token, passord);
      settUtfort(true);
      ferdig('nytt-passord');
      return 'Passordet er endret, og du er logget ut overalt. Logg inn med det nye passordet.';
    });
  };

  const tittel = {
    bekreft: 'Bekreft e-postadressen',
    'ny-epost': 'Bytt til den nye e-postadressen',
    'nytt-passord': 'Velg et nytt passord',
  }[lenke.handling];

  return (
    <Kort id="konto-lenke" tittel={tittel} fokus>
      {!utfort && (
        <form class="konto__skjema" onSubmit={utfor}>
          {lenke.handling === 'bekreft' && (
            <p>Trykk på knappen for å bekrefte at adressen lenken ble sendt til, er din.</p>
          )}
          {lenke.handling === 'ny-epost' && (
            <p>Trykk på knappen for å bruke den nye adressen på kontoen. Den gamle gjelder til da.</p>
          )}
          {lenke.handling === 'nytt-passord' && (
            <>
              <Felt
                navn="lenke-passord"
                etikett="Nytt passord"
                type="password"
                autocomplete="new-password"
                hjelp={`Minst ${MIN_PASSORD} tegn. Du blir logget ut på alle enheter.`}
                minLength={MIN_PASSORD}
                verdi={passord}
                sett={settPassord}
              />
              <Felt
                navn="lenke-passord-igjen"
                etikett="Skriv det en gang til"
                type="password"
                autocomplete="new-password"
                minLength={MIN_PASSORD}
                verdi={igjen}
                sett={settIgjen}
              />
            </>
          )}
          <div class="konto__knapper">
            <button type="submit" class="konto__knapp" disabled={sender}>
              {sender
                ? 'Vent litt …'
                : { bekreft: 'Bekreft', 'ny-epost': 'Bytt adresse', 'nytt-passord': 'Lagre passordet' }[
                    lenke.handling
                  ]}
            </button>
            <button type="button" class="konto__knapp konto__knapp--rolig" onClick={lukk}>
              Avbryt
            </button>
          </div>
        </form>
      )}
      <Beskjed tekst={svar?.tekst ?? null} feil={svar?.feil} />
      {utfort && (
        <button type="button" class="konto__knapp konto__knapp--rolig" onClick={lukk}>
          Lukk
        </button>
      )}
    </Kort>
  );
}

function Innlogging({ ferdig }: { ferdig: (m: Medlem, beskjed?: string) => void }) {
  const [modus, settModus] = useState<'inn' | 'ny' | 'glemt'>('inn');
  const [navn, settNavn] = useState('');
  const [epost, settEpost] = useState('');
  const [passord, settPassord] = useState('');
  const [vilkar, settVilkar] = useState(false);
  const { sender, svar, send, settSvar } = useSending();

  const bytt = (m: typeof modus) => {
    settModus(m);
    settSvar(null);
  };

  const sendSkjema = (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send(async () => {
      if (modus === 'glemt') return (await konto.glemtPassord(epost)).melding;
      if (modus === 'ny' && passord.length < MIN_PASSORD) {
        throw new Error(`Passordet må ha minst ${MIN_PASSORD} tegn.`);
      }
      if (modus === 'inn') {
        ferdig((await konto.loggInn(epost, passord)).medlem);
        return null;
      }
      const { medlem, bekreftelse } = await konto.registrer(navn, epost, passord, vilkar);
      ferdig(
        medlem,
        bekreftelse.sendt
          ? `Kontoen er laget. Vi har sendt en lenke til ${medlem.epost} for å bekrefte adressen.`
          : `Kontoen er laget, men lenken for å bekrefte adressen ble ikke sendt: ${bekreftelse.feil ?? 'ukjent feil'} Du kan prøve igjen under Profil.`,
      );
      return null;
    });
  };

  const tittel = { inn: 'Logg inn', ny: 'Lag en konto', glemt: 'Glemt passordet?' }[modus];
  return (
    <section class="konto__kort" aria-labelledby="konto-inn-tittel">
      <div class="konto__faner" role="group" aria-label="Logg inn eller lag konto">
        <button type="button" aria-pressed={modus === 'inn'} onClick={() => bytt('inn')}>
          Logg inn
        </button>
        <button type="button" aria-pressed={modus === 'ny'} onClick={() => bytt('ny')}>
          Lag konto
        </button>
      </div>
      <h2 id="konto-inn-tittel">{tittel}</h2>
      {modus === 'glemt' && (
        <p class="konto__dempet">
          Skriv e-postadressen til kontoen, så sender vi en lenke for å velge nytt passord. Lenken virker i én
          time.
        </p>
      )}
      <form class="konto__skjema" onSubmit={sendSkjema}>
        {modus === 'ny' && (
          <Felt
            navn="navn"
            etikett="Navn"
            autocomplete="name"
            hjelp="Vises ved skiltene du publiserer."
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
        {modus !== 'glemt' && (
          <Felt
            navn="passord"
            etikett="Passord"
            type="password"
            autocomplete={modus === 'inn' ? 'current-password' : 'new-password'}
            hjelp={modus === 'ny' ? `Minst ${MIN_PASSORD} tegn.` : undefined}
            verdi={passord}
            sett={settPassord}
          />
        )}
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
        <Beskjed tekst={svar?.tekst ?? null} feil={svar?.feil} />
        <div class="konto__knapper">
          <button type="submit" class="konto__knapp" disabled={sender}>
            {sender ? 'Vent litt …' : { inn: 'Logg inn', ny: 'Lag konto', glemt: 'Send lenke' }[modus]}
          </button>
          {modus === 'inn' && (
            <button type="button" class="konto__lenkeknapp" onClick={() => bytt('glemt')}>
              Glemt passordet?
            </button>
          )}
          {modus === 'glemt' && (
            <button type="button" class="konto__lenkeknapp" onClick={() => bytt('inn')}>
              Tilbake til innlogging
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

/** The packages with the price and quota set in Studio; the file's numbers until the server answers. */
function brukPlaner(): Record<string, Plan> {
  const [planer, settPlaner] = useState<Record<string, Plan>>(PLANER);
  useEffect(() => {
    if (!kontoMulig) return;
    konto
      .status()
      .then((s) => s.planer && settPlaner(s.planer))
      .catch(() => {});
  }, []);
  return planer;
}

/** Gratis konto and Skaper: what each gives and costs. Nothing can be bought yet. */
function Pakkeliste({ planer }: { planer: Record<string, Plan> }) {
  return (
    <ul class="konto__tjenester" role="list" aria-label="Pakker">
      {Object.entries(planer).map(([id, p]) => {
        const pris = prisTekst(p);
        const csv = p.tjenester.includes('csv') ? ' og CSV-batch' : '';
        return (
          <li key={id}>
            <span>
              <strong>{p.navn}</strong>
              <small>
                Plass til {p.prosjekter} prosjekter på kontoen{csv}.{pris ? ` ${pris}, inkl. mva.` : ''}
              </small>
              {pris && !p.kanKjopes && <small>Kan ikke kjøpes ennå.</small>}
            </span>
            <span class={`konto__merke ${pris ? '' : 'konto__merke--gratis'}`}>
              {pris ? `${p.pris?.maned} kr/mnd` : 'Gratis'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** What the services cost, for visitors who are not signed in. */
function Prisliste() {
  const planer = brukPlaner();
  return (
    <section class="konto__kort" aria-labelledby="konto-plan-tittel">
      <h2 id="konto-plan-tittel">Tjenester og pris</h2>
      <p class="konto__dempet">{BETALINGSMERKNAD}</p>
      <Pakkeliste planer={planer} />
      <ul class="konto__tjenester" role="list">
        {Object.entries(TJENESTER).map(([id, t]) => (
          <li key={id}>
            <span>
              <strong>{t.navn}</strong>
              <small>{t.beskrivelse}</small>
            </span>
            <span class={`konto__merke konto__merke--${betalingsmerke(t)}`}>{betalingstekst(t)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Mine tjenester: the access the server reports, with the reason when something is closed. */
function MineTjenester({ medlem }: { medlem: Medlem }) {
  const planer = brukPlaner();
  return (
    <Kort id="mine-tjenester" tittel="Mine tjenester">
      <p>
        Pakken din: <strong>{medlem.pakke.navn}</strong>, med plass til {medlem.pakke.prosjekter} prosjekter
        på kontoen. <span class="konto__dempet">{BETALINGSMERKNAD}</span>
      </p>
      <ul class="konto__tjenester" role="list">
        {(Object.keys(TJENESTER) as TjenesteId[]).map((id) => {
          const t = TJENESTER[id];
          const a = medlem.tilganger[id];
          return (
            <li key={id}>
              <span>
                <strong>{t.navn}</strong>
                <small>{t.beskrivelse}</small>
                {t.gratisperiode && <small>{t.gratisperiode.grunn}</small>}
                {a && !a.tilgang && <small class="konto__feil">{a.grunn}</small>}
                {Object.entries(t.funksjoner ?? {}).map(([fid, f]) => {
                  const fa = a?.funksjoner[fid];
                  return (
                    <small key={fid}>
                      {f.navn}: {fa?.tilgang ? 'ja' : `nei. ${fa?.grunn ?? ''}`}
                    </small>
                  );
                })}
              </span>
              <span class={`konto__merke konto__merke--${betalingsmerke(t)}`}>{betalingstekst(t)}</span>
              <span class={`konto__merke ${a?.tilgang ? 'konto__merke--ja' : 'konto__merke--nei'}`}>
                {a?.tilgang ? 'Tilgang' : 'Ikke tilgang'}
              </span>
            </li>
          );
        })}
      </ul>
      <h3 class="konto__undertittel">Pakker</h3>
      <Pakkeliste planer={planer} />
      {medlem.tilganger['sign-forge']?.tilgang && (
        <a class="konto__knapp konto__knapp--lenke" href={nettsti(SIGN_FORGE)}>
          Åpne Sign Forge
        </a>
      )}
      <p class="konto__dempet">
        Betaling med{' '}
        {Object.values(LEVERANDORER)
          .map((l) => l.navn)
          .join(' eller ')}{' '}
        er forberedt, men ikke slått på. Du blir aldri belastet uten å ha valgt det selv.
      </p>
    </Kort>
  );
}

function Epoststatus({ medlem }: { medlem: Medlem }) {
  const { sender, svar, send } = useSending();
  return (
    <div class="konto__blokk">
      <p>
        <span class="konto__dempet">E-post: </span>
        <strong class="konto__bryt">{medlem.epost}</strong>{' '}
        <span class={`konto__merke ${medlem.epostBekreftet ? 'konto__merke--ja' : 'konto__merke--nei'}`}>
          {medlem.epostBekreftet ? 'Bekreftet' : 'Ikke bekreftet'}
        </span>
      </p>
      {!medlem.epostBekreftet && (
        <>
          <p class="konto__dempet">
            Bekreft adressen med lenken vi sendte deg. Du kan bruke Sign Forge som før, men du må bekrefte
            adressen før du kan publisere skilt i galleriet.
          </p>
          <button
            type="button"
            class="konto__knapp konto__knapp--rolig"
            disabled={sender}
            onClick={() =>
              void send(async () => {
                await konto.sendBekreftelse();
                return `Vi har sendt en ny lenke til ${medlem.epost}. Den virker i et døgn.`;
              })
            }
          >
            {sender ? 'Sender …' : 'Send ny lenke'}
          </button>
          <Beskjed tekst={svar?.tekst ?? null} feil={svar?.feil} />
        </>
      )}
    </div>
  );
}

function Navneskjema({ medlem, endret }: { medlem: Medlem; endret: (m: Medlem) => void }) {
  const [navn, settNavn] = useState(medlem.navn);
  const { sender, svar, send } = useSending();
  return (
    <form
      class="konto__skjema"
      onSubmit={(e) => {
        e.preventDefault();
        void send(async () => {
          endret((await konto.profil(navn)).medlem);
          return 'Navnet er lagret.';
        });
      }}
    >
      <div class="konto__skjema konto__skjema--rad">
        <Felt
          navn="profil-navn"
          etikett="Navn ved skiltene dine"
          autocomplete="name"
          verdi={navn}
          sett={settNavn}
        />
        <button type="submit" class="konto__knapp" disabled={sender}>
          {sender ? 'Lagrer …' : 'Lagre navnet'}
        </button>
      </div>
      <Beskjed tekst={svar?.tekst ?? null} feil={svar?.feil} />
    </form>
  );
}

function EndreEpost({ medlem }: { medlem: Medlem }) {
  const [ny, settNy] = useState('');
  const [passord, settPassord] = useState('');
  const { sender, svar, send } = useSending();
  return (
    <details class="konto__utvid">
      <summary>Bytt e-postadresse</summary>
      <form
        class="konto__skjema"
        onSubmit={(e) => {
          e.preventDefault();
          void send(async () => {
            await konto.endreEpost(passord, ny);
            settPassord('');
            return `Vi har sendt en lenke til ${ny}. Åpne den for å bytte. Til da gjelder ${medlem.epost}.`;
          });
        }}
      >
        <Felt
          navn="ny-epost"
          etikett="Ny e-postadresse"
          type="email"
          autocomplete="email"
          verdi={ny}
          sett={settNy}
        />
        <Felt
          navn="ny-epost-passord"
          etikett="Passordet ditt"
          type="password"
          autocomplete="current-password"
          verdi={passord}
          sett={settPassord}
        />
        <Beskjed tekst={svar?.tekst ?? null} feil={svar?.feil} />
        <button type="submit" class="konto__knapp" disabled={sender}>
          {sender ? 'Sender …' : 'Send lenke til ny adresse'}
        </button>
      </form>
    </details>
  );
}

function EndrePassord({ endret }: { endret: (m: Medlem) => void }) {
  const [gammelt, settGammelt] = useState('');
  const [nytt, settNytt] = useState('');
  const { sender, svar, send } = useSending();
  return (
    <details class="konto__utvid">
      <summary>Bytt passord</summary>
      <form
        class="konto__skjema"
        onSubmit={(e) => {
          e.preventDefault();
          void send(async () => {
            if (nytt.length < MIN_PASSORD) throw new Error(`Passordet må ha minst ${MIN_PASSORD} tegn.`);
            endret((await konto.endrePassord(gammelt, nytt)).medlem);
            settGammelt('');
            settNytt('');
            return 'Passordet er byttet. Du er logget ut på alle andre enheter.';
          });
        }}
      >
        <Felt
          navn="passord-gammelt"
          etikett="Nåværende passord"
          type="password"
          autocomplete="current-password"
          verdi={gammelt}
          sett={settGammelt}
        />
        <Felt
          navn="passord-nytt"
          etikett="Nytt passord"
          type="password"
          autocomplete="new-password"
          hjelp={`Minst ${MIN_PASSORD} tegn. Andre enheter blir logget ut.`}
          minLength={MIN_PASSORD}
          verdi={nytt}
          sett={settNytt}
        />
        <Beskjed tekst={svar?.tekst ?? null} feil={svar?.feil} />
        <button type="submit" class="konto__knapp" disabled={sender}>
          {sender ? 'Lagrer …' : 'Bytt passord'}
        </button>
      </form>
    </details>
  );
}

/** Delete the account and its signs; the password confirms it. */
function SlettKonto({ utlogget }: { utlogget: () => void }) {
  const [passord, settPassord] = useState('');
  const { sender, svar, send } = useSending();
  return (
    <details class="konto__utvid">
      <summary>Slett kontoen</summary>
      <p class="konto__dempet">
        Kontoen, innloggingene og alle skiltene du har publisert med den, slettes for godt. Prosjektene i
        nettleseren din blir liggende.
      </p>
      <form
        class="konto__skjema konto__skjema--rad"
        onSubmit={(e) => {
          e.preventDefault();
          void send(async () => {
            await konto.slettKonto(passord);
            utlogget();
            return null;
          });
        }}
      >
        <Felt
          navn="slett-passord"
          etikett="Skriv passordet for å bekrefte"
          type="password"
          autocomplete="current-password"
          verdi={passord}
          sett={settPassord}
        />
        <button type="submit" class="konto__knapp konto__knapp--fare" disabled={sender}>
          {sender ? 'Sletter …' : 'Slett for godt'}
        </button>
      </form>
      <Beskjed tekst={svar?.tekst ?? null} feil={svar?.feil} />
    </details>
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
  return (
    <Kort id="profil" tittel="Profil">
      <p class="konto__dempet">Medlem siden {dato(medlem.opprettet)}</p>
      <Navneskjema medlem={medlem} endret={endret} />
      <Epoststatus medlem={medlem} />
      <EndreEpost medlem={medlem} />
      <EndrePassord endret={endret} />
      <SlettKonto utlogget={utlogget} />
    </Kort>
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
              <span class="konto__merke">Publisert</span> {dato(s.endret)}
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

/** Saved projects on the account: open in the tool, download as a file, delete. */
function Kontoprosjektliste({
  prosjekter,
  arbeider,
  lastNed,
  slett,
}: {
  prosjekter: Prosjekt[];
  arbeider: boolean;
  lastNed: (p: Prosjekt) => void;
  slett: (p: Prosjekt) => void;
}) {
  return (
    <ul class="konto__skilt" role="list">
      {prosjekter.map((p) => (
        <li key={p.id}>
          <span class="konto__skilttekst">
            <strong>{p.navn}</strong>
            <small>
              {PROSJEKTAPPER[p.app] ?? p.app} · endret {dato(p.endret)} ·{' '}
              {Math.max(1, Math.round(p.storrelse / 1000))} kB
            </small>
          </span>
          <span class="konto__knapper">
            {VERKTOY[p.app] && (
              <a
                class="konto__knapp konto__knapp--lenke"
                href={nettsti(`${VERKTOY[p.app]}?prosjekt=${encodeURIComponent(p.id)}`)}
              >
                Åpne<span class="visuelt-skjult"> {p.navn}</span>
              </a>
            )}
            <button
              type="button"
              class="konto__knapp konto__knapp--rolig"
              disabled={arbeider}
              onClick={() => lastNed(p)}
            >
              Last ned<span class="visuelt-skjult"> {p.navn}</span>
            </button>
            <button
              type="button"
              class="konto__knapp konto__knapp--rolig"
              disabled={arbeider}
              onClick={() => slett(p)}
            >
              Slett<span class="visuelt-skjult"> {p.navn}</span>
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A project's file name, close to what «Lagre som fil» in the tool gives (eksport/tremf.ts filnavn). */
const prosjektfil = (navn: string) =>
  `${
    navn
      .replace(/æ/gi, 'ae')
      .replace(/ø/gi, 'o')
      .replace(/å/gi, 'a')
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'prosjekt'
  }.skaperverksted.json`;

/**
 * Mine prosjekter: the projects saved on the account (the quota counts every
 * tool), and the signs published in the gallery. A project over the quota
 * (after a package ends) still opens, downloads and can be deleted.
 */
function MineProsjekter({ medlem }: { medlem: Medlem }) {
  const [skilt, settSkilt] = useState<DeltSkilt[] | null>(null);
  const [prosjekter, settProsjekter] = useState<{ prosjekter: Prosjekt[]; kvote: Kvote } | null>(null);
  const [arbeider, settArbeider] = useState(false);
  const [beskjed, settBeskjed] = useState<{ tekst: string; feil: boolean } | null>(null);

  useEffect(() => {
    konto
      .mineSkilt()
      .then((s) => settSkilt(s.skilt))
      .catch((e: unknown) => settBeskjed({ tekst: melding(e), feil: true }));
    konto
      .prosjekter()
      .then(settProsjekter)
      .catch((e: unknown) => settBeskjed({ tekst: melding(e), feil: true }));
  }, [medlem.id]);

  const slettSkilt = async (s: DeltSkilt) => {
    try {
      await konto.slettSkilt(s.id);
      settSkilt((l) => l?.filter((x) => x.id !== s.id) ?? null);
      settBeskjed({ tekst: `«${s.tittel}» er fjernet fra galleriet.`, feil: false });
    } catch (f) {
      settBeskjed({ tekst: melding(f), feil: true });
    }
  };

  const lastNedProsjekt = async (p: Prosjekt) => {
    settArbeider(true);
    try {
      const { prosjekt } = await konto.prosjekt(p.id);
      const blob = new Blob([JSON.stringify(prosjekt.dokument)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = prosjektfil(prosjekt.navn);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      settBeskjed({ tekst: `«${p.navn}» er lastet ned som fil.`, feil: false });
    } catch (f) {
      settBeskjed({ tekst: melding(f), feil: true });
    } finally {
      settArbeider(false);
    }
  };

  const slettProsjekt = async (p: Prosjekt) => {
    if (
      !confirm(
        `Slette «${p.navn}» fra kontoen for godt? En kopi som er åpen i en nettleser, eller som du har lastet ned, blir liggende.`,
      )
    )
      return;
    settArbeider(true);
    try {
      const { kvote } = await konto.slettProsjekt(p.id);
      settProsjekter((l) => (l ? { prosjekter: l.prosjekter.filter((x) => x.id !== p.id), kvote } : l));
      settBeskjed({ tekst: `«${p.navn}» er slettet fra kontoen.`, feil: false });
    } catch (f) {
      settBeskjed({ tekst: melding(f), feil: true });
    } finally {
      settArbeider(false);
    }
  };

  const kvote = prosjekter?.kvote;
  return (
    <Kort id="mine-prosjekter" tittel="Mine prosjekter">
      <p>
        Her ligger prosjektene du har lagret på kontoen med «Lagre på kontoen» i Fil-menyen i{' '}
        <a href={nettsti(SIGN_FORGE)}>Sign Forge</a>. Ingenting lastes opp fra nettleseren av seg selv.
      </p>
      {kvote && (
        <p>
          <strong>
            {kvote.brukt} av {kvote.maks} prosjekter
          </strong>{' '}
          <span class="konto__dempet">({kvote.pakkenavn}, alle verktøy sammen)</span>
          {kvote.brukt > kvote.maks && (
            <span class="konto__feil">
              {' '}
              Du har flere prosjekter enn pakken din gir plass til. Alle kan fortsatt åpnes, endres og lastes
              ned, men du kan ikke lagre nye før du er under grensen.
            </span>
          )}
          {kvote.brukt === kvote.maks && (
            <span class="konto__dempet"> Kontoen er full. Slett et prosjekt for å lagre et nytt.</span>
          )}
        </p>
      )}
      {!prosjekter && !beskjed && <p class="konto__dempet">Henter …</p>}
      {prosjekter?.prosjekter.length === 0 && (
        <p class="konto__dempet">Ingen prosjekter lagret på kontoen ennå.</p>
      )}
      {prosjekter && prosjekter.prosjekter.length > 0 && (
        <Kontoprosjektliste
          prosjekter={prosjekter.prosjekter}
          arbeider={arbeider}
          lastNed={(p) => void lastNedProsjekt(p)}
          slett={(p) => void slettProsjekt(p)}
        />
      )}
      <h3 class="konto__undertittel">Publisert i galleriet</h3>
      <p class="konto__dempet">
        Disse skiltene er offentlige i «Nylig laget». De er ikke private prosjekter, og de teller ikke med i
        prosjektene over.
      </p>
      {!skilt && !beskjed && <p class="konto__dempet">Henter …</p>}
      {skilt?.length === 0 && (
        <p class="konto__dempet">
          Ingen ennå. Velg «Publiser i galleriet» i Fil-menyen i Sign Forge mens du er logget inn.
        </p>
      )}
      {skilt && skilt.length > 0 && <Skiltliste skilt={skilt} slett={(s) => void slettSkilt(s)} />}
      <Beskjed tekst={beskjed?.tekst ?? null} feil={beskjed?.feil} />
    </Kort>
  );
}

/** Signs shared from this browser without an account before 17.10; the browser keeps the key to remove them. */
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
      <Beskjed tekst={feil} feil />
    </section>
  );
}

function Medlemsside({
  medlem,
  beskjed,
  endret,
  utlogget,
}: {
  medlem: Medlem;
  beskjed: string | null;
  endret: (m: Medlem) => void;
  utlogget: () => void;
}) {
  const [loggerUt, settLoggerUt] = useState(false);
  return (
    <>
      <section class="konto__kort konto__topp" aria-labelledby="konto-hei">
        <h2 id="konto-hei">Hei, {medlem.navn}</h2>
        <p class="konto__dempet">{medlem.epost}</p>
        <Beskjed tekst={beskjed} />
        <nav aria-label="Deler av Min konto">
          <ul class="konto__meny" role="list">
            <li>
              <a href="#mine-tjenester">Mine tjenester</a>
            </li>
            <li>
              <a href="#profil">Profil</a>
            </li>
            <li>
              <a href="#mine-prosjekter">Mine prosjekter</a>
            </li>
          </ul>
        </nav>
        <button
          type="button"
          class="konto__knapp konto__knapp--rolig"
          disabled={loggerUt}
          onClick={() => {
            settLoggerUt(true);
            void konto.loggUt().finally(utlogget);
          }}
        >
          {loggerUt ? 'Logger ut …' : 'Logg ut'}
        </button>
      </section>
      <MineTjenester medlem={medlem} />
      <Profil medlem={medlem} endret={endret} utlogget={utlogget} />
      <MineProsjekter medlem={medlem} />
    </>
  );
}

export default function KontoSide() {
  const [medlem, settMedlem] = useState<Medlem | null | undefined>(kontoMulig ? undefined : null);
  const [feil, settFeil] = useState<string | null>(kontoMulig ? null : IKKE_PA);
  const [lenke, settLenke] = useState<Lenke | null>(null);
  const [beskjed, settBeskjed] = useState<string | null>(null);
  // a new key starts the sign-in form over on «Logg inn» (after a new password)
  const [innloggingNr, settInnloggingNr] = useState(0);

  const hentMeg = () =>
    konto
      .meg()
      .then((s) => settMedlem(s.medlem))
      .catch((e: unknown) => {
        settMedlem(null);
        settFeil(melding(e));
      });

  useEffect(() => {
    settLenke(lesLenke());
    if (kontoMulig) void hentMeg();
    // a link opened while the page is already open only changes the «#» part
    const vedEndring = () => {
      const l = lesLenke();
      if (l) settLenke(l);
    };
    addEventListener('hashchange', vedEndring);
    return () => removeEventListener('hashchange', vedEndring);
  }, []);

  if (feil && !medlem) {
    return (
      <div class="konto">
        <p class="konto__kort" role="status">
          {feil}
        </p>
        <Prisliste />
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
      {lenke && (
        <Lenkehandling
          key={lenke.token}
          lenke={lenke}
          ferdig={(h) => {
            // a new password ends every sign-in, this one included
            if (h === 'nytt-passord') {
              settMedlem(null);
              settInnloggingNr((n) => n + 1);
            } else void hentMeg();
          }}
          lukk={() => settLenke(null)}
        />
      )}
      {medlem ? (
        <Medlemsside
          medlem={medlem}
          beskjed={beskjed}
          endret={settMedlem}
          utlogget={() => {
            settMedlem(null);
            settBeskjed(null);
          }}
        />
      ) : (
        <>
          <Innlogging
            key={innloggingNr}
            ferdig={(m, b) => {
              settMedlem(m);
              settBeskjed(b ?? null);
            }}
          />
          <Prisliste />
        </>
      )}
      <FraDenneNettleseren />
    </div>
  );
}
