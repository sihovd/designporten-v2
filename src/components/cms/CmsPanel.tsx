import { nettsti, phpmiljo } from '@/lib/nettsti';
/**
 * The CMS at /cms/: sign-in and first-time setup, all page texts with draft,
 * publish and history, the queue of agent proposals, users and agent keys,
 * the audit log and backup. Content lives in the database on the web host,
 * not in GitHub (docs/cms/README.md). Runs only on the PHP build.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  cms,
  CmsFeil,
  gjeldende,
  lesBildeverdi,
  lesByggbilde,
  type Bildeinfo,
  type Bruker,
  type Felt,
  type Forslag,
  type Hendelse,
  type Resultat,
  type Revisjon,
} from '@/lib/cms/api';
import { cmsEtikett } from '@/lib/cms/etiketter';
import { DriftStatus, Medier } from './Medier';
import { StudioSkall, StudioOversiktSide, StudioButikk, type StudioFane } from './Studio';
import Blogg from './Blogg';
import './cms.css';
import './studio.css';

type Fane = StudioFane;

const tid = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : '';

const feiltekst = (e: unknown) => (e instanceof Error ? e.message : 'Noe gikk galt.');

const ROLLER: Record<string, string> = { admin: 'Administrator', redaktor: 'Redaktør', agent: 'Agent' };
const RETTIGHETER: Record<string, string> = {
  forslag: 'Foreslå tekster',
  utkast: 'Lagre utkast',
  publiser: 'Publisere',
};
const HANDLINGER: Record<string, string> = {
  utkast: 'Utkast lagret',
  publisert: 'Publisert',
  forkastet: 'Utkast forkastet',
  gjenopprettet: 'Gjenopprettet som utkast',
};

function Melding({ tekst, feil }: { tekst: string | null; feil?: boolean }) {
  return (
    <p class={feil ? 'cms__melding cms__melding--feil' : 'cms__melding'} role={feil ? 'alert' : 'status'}>
      {tekst}
    </p>
  );
}

function Skjemafelt(p: {
  etikett: string;
  type?: string;
  verdi: string;
  sett: (v: string) => void;
  auto?: string;
}) {
  return (
    <label class="cms__felt">
      <span>{p.etikett}</span>
      <input
        type={p.type ?? 'text'}
        value={p.verdi}
        autoComplete={p.auto}
        required
        onInput={(e) => p.sett((e.target as HTMLInputElement).value)}
      />
    </label>
  );
}

// ------------------------------------------------------------ Sign-in and setup

function Inngang({ harBrukere, ferdig }: { harBrukere: boolean; ferdig: (b: Bruker) => void }) {
  const [epost, settEpost] = useState('');
  const [passord, settPassord] = useState('');
  const [navn, settNavn] = useState('');
  const [kode, settKode] = useState('');
  const [feil, settFeil] = useState<string | null>(null);
  const [sender, settSender] = useState(false);

  async function send(e: JSX.TargetedEvent<HTMLFormElement>) {
    e.preventDefault();
    settSender(true);
    settFeil(null);
    try {
      const svar = harBrukere
        ? await cms.loggInn(epost, passord)
        : await cms.oppsett({ kode, epost, navn, passord });
      ferdig(svar.bruker);
    } catch (f) {
      settFeil(feiltekst(f));
    }
    settSender(false);
  }

  return (
    <form class="cms__inngang" onSubmit={send}>
      <h2>{harBrukere ? 'Logg inn' : 'Opprett den første administratoren'}</h2>
      {!harBrukere && (
        <p>
          Oppsettkoden står i <code>api/cms/konfig.php</code> på webhotellet. Den trengs bare denne ene
          gangen.
        </p>
      )}
      {!harBrukere && <Skjemafelt etikett="Oppsettkode" verdi={kode} sett={settKode} auto="off" />}
      {!harBrukere && <Skjemafelt etikett="Navn" verdi={navn} sett={settNavn} auto="name" />}
      <Skjemafelt etikett="E-post" type="email" verdi={epost} sett={settEpost} auto="username" />
      <Skjemafelt
        etikett={harBrukere ? 'Passord' : 'Passord (minst 12 tegn)'}
        type="password"
        verdi={passord}
        sett={settPassord}
        auto={harBrukere ? 'current-password' : 'new-password'}
      />
      <button class="cms__knapp cms__knapp--primar" type="submit" disabled={sender}>
        {sender ? 'Vent litt …' : harBrukere ? 'Logg inn' : 'Opprett og logg inn'}
      </button>
      {feil && <Melding tekst={feil} feil />}
    </form>
  );
}

// ------------------------------------------------------------ Content

/** A small picture for an image field value: the library picture, or the one the page was built with. */
function Miniatyr({ felt, verdi, info }: { felt: Felt; verdi: string | null; info?: Bildeinfo | null }) {
  const v = lesBildeverdi(verdi);
  const bygget = lesByggbilde(felt.standard);
  const src = v?.medium != null ? info?.miniatyr : bygget?.src;
  const tekst =
    v?.medium != null
      ? `${info?.navn ?? 'Bilde'}${info?.dekorativ ? ' (pynt)' : info?.alt ? `: ${info.alt}` : ''}`
      : `Bildet siden ble laget med${bygget?.konsept ? ' (konseptbilde)' : ''}`;
  return (
    <figure class="cms__miniatyr">
      {src && <img src={src} alt="" loading="lazy" />}
      <figcaption class="cms__liten">{tekst}</figcaption>
    </figure>
  );
}

function Historikk({ felt, ferdig }: { felt: Felt; ferdig: (r: Resultat) => void }) {
  const [revisjoner, settRevisjoner] = useState<Revisjon[] | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  useEffect(() => {
    cms
      .historikk(felt.nokkel)
      .then((d) => settRevisjoner(d.revisjoner))
      .catch((e) => settFeil(feiltekst(e)));
  }, [felt.nokkel, felt.versjon]);

  const bruk = async (v: { revisjon?: number; standard?: boolean }) => {
    try {
      ferdig(await cms.gjenopprett({ ...v, nokkel: felt.nokkel, versjon: felt.versjon }));
    } catch (e) {
      settFeil(feiltekst(e));
    }
  };

  if (feil) return <Melding tekst={feil} feil />;
  if (!revisjoner) return <p class="cms__dempet">Henter historikken …</p>;
  const bilde = felt.type === 'bilde';
  return (
    <ol class="cms__historikk">
      <li>
        <strong>{bilde ? 'Bildet siden ble laget med' : 'Standardtekst fra koden'}</strong>
        {bilde ? <Miniatyr felt={felt} verdi={null} /> : <p>{felt.standard}</p>}
        <button type="button" class="cms__lenkeknapp" onClick={() => void bruk({ standard: true })}>
          Bruk denne som utkast
        </button>
      </li>
      {revisjoner.map((r) => (
        <li key={r.id}>
          <strong>
            {HANDLINGER[r.handling] ?? r.handling} · {tid(r.tid)}
            {r.av && ` · ${r.av}`}
          </strong>
          {r.verdi !== null && (
            <>
              {bilde ? <Miniatyr felt={felt} verdi={r.verdi} info={r.bilde} /> : <p>{r.verdi}</p>}
              <button type="button" class="cms__lenkeknapp" onClick={() => void bruk({ revisjon: r.id })}>
                Bruk denne som utkast
              </button>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

function Feltrad({
  felt,
  kanPublisere,
  oppdater,
}: {
  felt: Felt;
  kanPublisere: boolean;
  oppdater: (r: Resultat[]) => void;
}) {
  const [redigerer, settRedigerer] = useState(false);
  const [tekst, settTekst] = useState('');
  const [visHistorikk, settVisHistorikk] = useState(false);
  const [feil, settFeil] = useState<string | null>(null);
  const navn = cmsEtikett(felt.nokkel);
  const status = felt.utkast !== null ? 'utkast' : felt.publisert !== null ? 'publisert' : 'standard';

  async function kjor(arbeid: () => Promise<Resultat[]>) {
    settFeil(null);
    try {
      const r = await arbeid();
      oppdater(r);
      const problem = r.find((x) => x.status !== 'ok');
      if (problem)
        settFeil(problem.melding ?? 'Noen andre endret teksten i mellomtiden. Se den nye versjonen.');
      else settRedigerer(false);
    } catch (e) {
      settFeil(feiltekst(e));
    }
  }

  const id = `felt-${felt.nokkel.replace(/[^a-z0-9]/gi, '-')}`;
  if (felt.type === 'bilde')
    return (
      <li class={`cms__rad cms__rad--${status}`}>
        <div class="cms__radhode">
          <span id={id} class="cms__feltnavn">
            {navn?.felt ?? felt.nokkel}
          </span>
          <span class={`cms__merke cms__merke--${status}`}>
            {status === 'utkast' ? 'Utkast' : status === 'publisert' ? 'Publisert' : 'Standard'}
          </span>
        </div>
        <div class="cms__bilderad">
          {felt.utkast !== null && (
            <div>
              <p class="cms__dempet cms__liten">Utkast:</p>
              <Miniatyr felt={felt} verdi={felt.utkast} info={felt.bilder?.utkast} />
            </div>
          )}
          <div>
            {felt.utkast !== null && <p class="cms__dempet cms__liten">Publisert nå:</p>}
            <Miniatyr felt={felt} verdi={felt.publisert} info={felt.bilder?.publisert} />
          </div>
        </div>
        {felt.endret && (
          <p class="cms__dempet cms__liten">
            Sist endret {tid(felt.endret)}
            {felt.endretAv && ` av ${felt.endretAv}`}
          </p>
        )}
        <div class="cms__knapper">
          <a class="cms__lenkeknapp" href={nettsti(felt.sider[0] ?? '/')} aria-describedby={id}>
            Bytt på siden
          </a>
          {felt.utkast !== null && kanPublisere && (
            <button
              type="button"
              class="cms__lenkeknapp"
              onClick={() =>
                void kjor(
                  async () =>
                    (await cms.publiser([{ nokkel: felt.nokkel, versjon: felt.versjon }])).resultater,
                )
              }
            >
              Publiser
            </button>
          )}
          {felt.utkast !== null && (
            <button
              type="button"
              class="cms__lenkeknapp"
              onClick={() =>
                void kjor(
                  async () =>
                    (await cms.forkast([{ nokkel: felt.nokkel, versjon: felt.versjon }])).resultater,
                )
              }
            >
              Forkast utkast
            </button>
          )}
          <button
            type="button"
            class="cms__lenkeknapp"
            aria-expanded={visHistorikk}
            onClick={() => settVisHistorikk(!visHistorikk)}
          >
            Historikk
          </button>
        </div>
        {feil && <Melding tekst={feil} feil />}
        {visHistorikk && <Historikk felt={felt} ferdig={(r) => void kjor(async () => [r])} />}
      </li>
    );
  return (
    <li class={`cms__rad cms__rad--${status}`}>
      <div class="cms__radhode">
        <span id={id} class="cms__feltnavn">
          {navn?.felt ?? felt.nokkel}
        </span>
        <span class={`cms__merke cms__merke--${status}`}>
          {status === 'utkast' ? 'Utkast' : status === 'publisert' ? 'Publisert' : 'Standard'}
        </span>
      </div>
      {redigerer ? (
        <div class="cms__rediger">
          <textarea
            aria-labelledby={id}
            rows={felt.type === 'avsnitt' ? 6 : 2}
            value={tekst}
            onInput={(e) => settTekst((e.target as HTMLTextAreaElement).value)}
          />
          <div class="cms__knapper">
            <button
              type="button"
              class="cms__knapp cms__knapp--primar"
              disabled={!tekst.trim()}
              onClick={() =>
                void kjor(
                  async () =>
                    (await cms.lagre([{ nokkel: felt.nokkel, verdi: tekst, versjon: felt.versjon }]))
                      .resultater,
                )
              }
            >
              Lagre utkast
            </button>
            <button type="button" class="cms__knapp" onClick={() => settRedigerer(false)}>
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <>
          {felt.utkast !== null && <p class="cms__tekst">{felt.utkast}</p>}
          <p class={felt.utkast !== null ? 'cms__tekst cms__tekst--gammel' : 'cms__tekst'}>
            {felt.utkast !== null && <span class="cms__dempet">Publisert nå: </span>}
            {gjeldende(felt)}
          </p>
          {felt.endret && (
            <p class="cms__dempet cms__liten">
              Sist endret {tid(felt.endret)}
              {felt.endretAv && ` av ${felt.endretAv}`}
            </p>
          )}
          <div class="cms__knapper">
            <button
              type="button"
              class="cms__lenkeknapp"
              onClick={() => {
                settTekst(felt.utkast ?? gjeldende(felt));
                settRedigerer(true);
              }}
            >
              Endre
            </button>
            {felt.utkast !== null && kanPublisere && (
              <button
                type="button"
                class="cms__lenkeknapp"
                onClick={() =>
                  void kjor(
                    async () =>
                      (await cms.publiser([{ nokkel: felt.nokkel, versjon: felt.versjon }])).resultater,
                  )
                }
              >
                Publiser
              </button>
            )}
            {felt.utkast !== null && (
              <button
                type="button"
                class="cms__lenkeknapp"
                onClick={() =>
                  void kjor(
                    async () =>
                      (await cms.forkast([{ nokkel: felt.nokkel, versjon: felt.versjon }])).resultater,
                  )
                }
              >
                Forkast utkast
              </button>
            )}
            <button
              type="button"
              class="cms__lenkeknapp"
              aria-expanded={visHistorikk}
              onClick={() => settVisHistorikk(!visHistorikk)}
            >
              Historikk
            </button>
          </div>
        </>
      )}
      {feil && <Melding tekst={feil} feil />}
      {visHistorikk && !redigerer && <Historikk felt={felt} ferdig={(r) => void kjor(async () => [r])} />}
    </li>
  );
}

function Innhold({ bruker }: { bruker: Bruker }) {
  const [felt, settFelt] = useState<Felt[] | null>(null);
  const [sok, settSok] = useState('');
  const [bareUtkast, settBareUtkast] = useState(false);
  const [melding, settMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const kanPublisere = bruker.rolle !== 'agent' || bruker.rettigheter.includes('publiser');

  useEffect(() => {
    cms
      .innhold()
      .then((d) => settFelt(d.felt))
      .catch((e) => settMelding({ tekst: feiltekst(e), feil: true }));
  }, []);

  const oppdater = (resultater: Resultat[]) =>
    settFelt((gamle) => {
      if (!gamle) return gamle;
      const nye = new Map(resultater.filter((r) => r.felt).map((r) => [r.nokkel, r.felt!]));
      return gamle.map((f) => nye.get(f.nokkel) ?? f);
    });

  const grupper = useMemo(() => {
    const ord = sok.trim().toLowerCase();
    const ut = new Map<string, { side: string; sti: string; felt: Felt[] }>();
    for (const f of felt ?? []) {
      if (bareUtkast && f.utkast === null) continue;
      const navn = cmsEtikett(f.nokkel);
      const tekst = (
        f.type === 'bilde'
          ? `${navn?.side} ${navn?.felt} bilde ${f.bilder?.utkast?.alt ?? ''} ${f.bilder?.publisert?.alt ?? ''}`
          : `${navn?.side} ${navn?.felt} ${f.utkast ?? ''} ${gjeldende(f)}`
      ).toLowerCase();
      if (ord && !tekst.includes(ord)) continue;
      const nokkel = navn?.sideId ?? 'annet';
      if (!ut.has(nokkel)) ut.set(nokkel, { side: navn?.side ?? 'Annet', sti: f.sider[0] ?? '/', felt: [] });
      ut.get(nokkel)!.felt.push(f);
    }
    return [...ut.values()];
  }, [felt, sok, bareUtkast]);

  const utkast = (felt ?? []).filter((f) => f.utkast !== null);

  async function publiserAlle() {
    try {
      const { resultater } = await cms.publiser(
        utkast.map((f) => ({ nokkel: f.nokkel, versjon: f.versjon })),
      );
      oppdater(resultater);
      const ok = resultater.filter((r) => r.status === 'ok').length;
      const ikke = resultater.length - ok;
      settMelding({
        tekst: `${ok} ${ok === 1 ? 'endring' : 'endringer'} publisert.${ikke ? ` ${ikke} ble endret av andre i mellomtiden og ble ikke publisert.` : ''}`,
        feil: ikke > 0,
      });
    } catch (e) {
      settMelding({ tekst: feiltekst(e), feil: true });
    }
  }

  if (!felt) return melding ? <Melding {...melding} /> : <p class="cms__dempet">Henter innholdet …</p>;
  return (
    <section aria-labelledby="cms-innhold">
      <h2 id="cms-innhold">Tekster og bilder på sidene</h2>
      <p class="cms__ingress">
        Endringer lagres som utkast. Besøkende ser dem først når du publiserer, og da med en gang, uten ny
        opplasting. Du kan også endre tekster og bytte bilder rett på sidene: åpne en side mens du er logget
        inn, og trykk «Rediger innhold».
      </p>
      <div class="cms__verktoy">
        <label class="cms__felt cms__felt--sok">
          <span>Søk i tekster og bilder</span>
          <input type="search" value={sok} onInput={(e) => settSok((e.target as HTMLInputElement).value)} />
        </label>
        <label class="cms__avkryss">
          <input
            type="checkbox"
            checked={bareUtkast}
            onChange={(e) => settBareUtkast((e.target as HTMLInputElement).checked)}
          />
          Bare utkast ({utkast.length})
        </label>
        {kanPublisere && utkast.length > 0 && (
          <button type="button" class="cms__knapp cms__knapp--primar" onClick={() => void publiserAlle()}>
            Publiser alle utkast ({utkast.length})
          </button>
        )}
      </div>
      {melding && <Melding {...melding} />}
      {grupper.length === 0 && <p class="cms__dempet">Ingenting passer.</p>}
      {grupper.map((g) => (
        <section key={g.side} class="cms__gruppe" aria-label={g.side}>
          <h3>
            {g.side}{' '}
            <a class="cms__liten" href={nettsti(g.sti)}>
              Åpne siden
            </a>
          </h3>
          <ul class="cms__liste">
            {g.felt.map((f) => (
              <Feltrad key={f.nokkel} felt={f} kanPublisere={kanPublisere} oppdater={oppdater} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

// ------------------------------------------------------------ Proposals

function Forslagsliste({ bruker }: { bruker: Bruker }) {
  const [liste, settListe] = useState<Forslag[] | null>(null);
  const [melding, settMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const hent = () =>
    cms
      .forslag()
      .then((d) => settListe(d.forslag))
      .catch((e) => settMelding({ tekst: feiltekst(e), feil: true }));
  useEffect(() => void hent(), []);

  async function behandle(f: Forslag, beslutning: 'godkjenn' | 'avvis', publiser = false) {
    try {
      await cms.behandle(f.id, beslutning, publiser);
      settMelding({
        tekst:
          beslutning === 'avvis'
            ? 'Forslaget er avvist.'
            : publiser
              ? 'Forslaget er godkjent og publisert.'
              : 'Forslaget er lagret som utkast.',
      });
      await hent();
    } catch (e) {
      settMelding({ tekst: feiltekst(e), feil: true });
    }
  }

  const kanBehandle = bruker.rolle !== 'agent';
  return (
    <section aria-labelledby="cms-forslag">
      <h2 id="cms-forslag">Forslag fra agenter</h2>
      <p class="cms__ingress">
        Agenter kan foreslå tekster gjennom API-et. Ingenting blir synlig før en redaktør godkjenner og
        publiserer.
      </p>
      {melding && <Melding {...melding} />}
      {!liste ? (
        <p class="cms__dempet">Henter forslag …</p>
      ) : liste.length === 0 ? (
        <p class="cms__dempet">Ingen forslag ennå.</p>
      ) : (
        <ul class="cms__liste">
          {liste.map((f) => {
            const navn = cmsEtikett(f.nokkel);
            return (
              <li key={f.id} class={`cms__rad cms__rad--${f.status === 'venter' ? 'utkast' : 'standard'}`}>
                <div class="cms__radhode">
                  <span class="cms__feltnavn">{navn ? `${navn.side} › ${navn.felt}` : f.nokkel}</span>
                  <span class={`cms__merke cms__merke--${f.status === 'venter' ? 'utkast' : 'standard'}`}>
                    {f.status === 'venter' ? 'Venter' : f.status === 'godkjent' ? 'Godkjent' : 'Avvist'}
                  </span>
                </div>
                <dl class="cms__sammenlign">
                  <div>
                    <dt>Nå</dt>
                    <dd>{f.felt ? gjeldende(f.felt) : '–'}</dd>
                  </div>
                  <div>
                    <dt>Forslag</dt>
                    <dd>{f.verdi}</dd>
                  </div>
                </dl>
                <p class="cms__dempet cms__liten">
                  {f.av} · {tid(f.opprettet)}
                  {f.kilde && ` · kilde: ${f.kilde}`}
                  {f.begrunnelse && ` · «${f.begrunnelse}»`}
                  {f.behandletAv && ` · behandlet av ${f.behandletAv} ${tid(f.behandlet)}`}
                </p>
                {kanBehandle && f.status === 'venter' && (
                  <div class="cms__knapper">
                    <button
                      type="button"
                      class="cms__lenkeknapp"
                      onClick={() => void behandle(f, 'godkjenn')}
                    >
                      Godkjenn som utkast
                    </button>
                    <button
                      type="button"
                      class="cms__lenkeknapp"
                      onClick={() => void behandle(f, 'godkjenn', true)}
                    >
                      Godkjenn og publiser
                    </button>
                    <button type="button" class="cms__lenkeknapp" onClick={() => void behandle(f, 'avvis')}>
                      Avvis
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------ Users

function Brukere({ meg }: { meg: Bruker }) {
  const [liste, settListe] = useState<Bruker[] | null>(null);
  const [melding, settMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const [nokkel, settNokkel] = useState<{ navn: string; nokkel: string } | null>(null);
  const [rolle, settRolle] = useState<'redaktor' | 'admin' | 'agent'>('redaktor');
  const [navn, settNavn] = useState('');
  const [epost, settEpost] = useState('');
  const [passord, settPassord] = useState('');
  const [rett, settRett] = useState<string[]>(['forslag']);

  const hent = () =>
    cms
      .brukere()
      .then((d) => settListe(d.brukere))
      .catch((e) => settMelding({ tekst: feiltekst(e), feil: true }));
  useEffect(() => void hent(), []);

  async function opprett(e: JSX.TargetedEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const svar = await cms.bruker(
        rolle === 'agent' ? { navn, rolle, rettigheter: rett } : { navn, rolle, epost, passord },
      );
      if (svar.nokkel) settNokkel({ navn, nokkel: svar.nokkel });
      settMelding({ tekst: `${navn} er lagt til.` });
      settNavn('');
      settEpost('');
      settPassord('');
      await hent();
    } catch (f) {
      settMelding({ tekst: feiltekst(f), feil: true });
    }
  }

  async function endre(b: Bruker, data: Record<string, unknown>) {
    try {
      await cms.bruker({ id: b.id, ...data });
      await hent();
    } catch (f) {
      settMelding({ tekst: feiltekst(f), feil: true });
    }
  }

  async function nyNokkel(b: Bruker) {
    try {
      const svar = await cms.nyNokkel(b.id);
      settNokkel({ navn: b.navn, nokkel: svar.nokkel });
      await hent();
    } catch (f) {
      settMelding({ tekst: feiltekst(f), feil: true });
    }
  }

  return (
    <section aria-labelledby="cms-brukere">
      <h2 id="cms-brukere">Brukere og agenter</h2>
      {melding && <Melding {...melding} />}
      {nokkel && (
        <div class="cms__nokkel" role="status">
          <p>
            <strong>API-nøkkelen til {nokkel.navn}.</strong> Den vises bare nå. Kopier den til agenten, og
            send den som <code>Authorization: Bearer …</code>.
          </p>
          <code class="cms__nokkeltekst">{nokkel.nokkel}</code>
          <button type="button" class="cms__lenkeknapp" onClick={() => settNokkel(null)}>
            Jeg har kopiert den
          </button>
        </div>
      )}
      <ul class="cms__liste">
        {(liste ?? []).map((b) => (
          <li key={b.id} class="cms__rad">
            <div class="cms__radhode">
              <span class="cms__feltnavn">
                {b.navn} {b.epost && <span class="cms__dempet">· {b.epost}</span>}
              </span>
              <span class={`cms__merke ${b.aktiv ? '' : 'cms__merke--utkast'}`}>
                {ROLLER[b.rolle]}
                {!b.aktiv && ' · sperret'}
              </span>
            </div>
            {b.rolle === 'agent' && (
              <fieldset class="cms__rettigheter">
                <legend>Kan</legend>
                {Object.entries(RETTIGHETER).map(([id, tekst]) => (
                  <label key={id} class="cms__avkryss">
                    <input
                      type="checkbox"
                      checked={b.rettigheter.includes(id)}
                      onChange={(e) =>
                        void endre(b, {
                          rettigheter: (e.target as HTMLInputElement).checked
                            ? [...b.rettigheter, id]
                            : b.rettigheter.filter((r) => r !== id),
                        })
                      }
                    />
                    {tekst}
                  </label>
                ))}
              </fieldset>
            )}
            <p class="cms__dempet cms__liten">
              {b.rolle === 'agent'
                ? `Nøkkel ${b.nokkelStart}…`
                : `Sist innlogget ${tid(b.sistInne) || 'aldri'}`}
            </p>
            <div class="cms__knapper">
              {b.rolle === 'agent' && (
                <button type="button" class="cms__lenkeknapp" onClick={() => void nyNokkel(b)}>
                  Lag ny nøkkel
                </button>
              )}
              {b.id !== meg.id && (
                <button
                  type="button"
                  class="cms__lenkeknapp"
                  onClick={() => void endre(b, { aktiv: !b.aktiv })}
                >
                  {b.aktiv ? 'Sperr' : 'Åpne igjen'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form class="cms__ny" onSubmit={opprett}>
        <h3>Legg til</h3>
        <label class="cms__felt">
          <span>Rolle</span>
          <select
            value={rolle}
            onChange={(e) => settRolle((e.target as HTMLSelectElement).value as typeof rolle)}
          >
            <option value="redaktor">Redaktør: endrer og publiserer tekster</option>
            <option value="admin">Administrator: alt, også brukere og sikkerhetskopi</option>
            <option value="agent">Agent: API-nøkkel med valgte rettigheter</option>
          </select>
        </label>
        <Skjemafelt etikett="Navn" verdi={navn} sett={settNavn} auto="off" />
        {rolle === 'agent' ? (
          <fieldset class="cms__rettigheter">
            <legend>Agenten kan</legend>
            {Object.entries(RETTIGHETER).map(([id, tekst]) => (
              <label key={id} class="cms__avkryss">
                <input
                  type="checkbox"
                  checked={rett.includes(id)}
                  onChange={(e) =>
                    settRett(
                      (e.target as HTMLInputElement).checked ? [...rett, id] : rett.filter((r) => r !== id),
                    )
                  }
                />
                {tekst}
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <Skjemafelt etikett="E-post" type="email" verdi={epost} sett={settEpost} auto="off" />
            <Skjemafelt
              etikett="Første passord (minst 12 tegn)"
              type="password"
              verdi={passord}
              sett={settPassord}
              auto="new-password"
            />
          </>
        )}
        <button type="submit" class="cms__knapp cms__knapp--primar">
          Legg til
        </button>
      </form>
    </section>
  );
}

// ------------------------------------------------------------ Log, backup, account

function Logg() {
  const [liste, settListe] = useState<Hendelse[] | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  useEffect(() => {
    cms
      .logg()
      .then((d) => settListe(d.hendelser))
      .catch((e) => settFeil(feiltekst(e)));
  }, []);
  return (
    <section aria-labelledby="cms-logg">
      <h2 id="cms-logg">Logg</h2>
      <p class="cms__ingress">Alt som er gjort i CMS-et, også det som ble nektet. De siste 300 hendelsene.</p>
      {feil && <Melding tekst={feil} feil />}
      <div class="cms__tabell">
        <table>
          <thead>
            <tr>
              <th scope="col">Når</th>
              <th scope="col">Hvem</th>
              <th scope="col">Hva</th>
              <th scope="col">Felt</th>
              <th scope="col">Før → etter</th>
            </tr>
          </thead>
          <tbody>
            {(liste ?? []).map((h) => (
              <tr key={h.id} class={h.resultat !== 'ok' ? 'cms__avvist' : undefined}>
                <td>{tid(h.tid)}</td>
                <td>{h.aktor ?? '–'}</td>
                <td>
                  {h.handling}
                  {h.resultat !== 'ok' && ` (${h.resultat})`}
                </td>
                <td>{h.mal ?? ''}</td>
                <td>
                  {h.for ?? ''}
                  {(h.for || h.etter) && ' → '}
                  {h.etter ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Sikkerhetskopi() {
  const [melding, settMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  async function gjenopprett(e: JSX.TargetedEvent<HTMLInputElement>) {
    const fil = (e.target as HTMLInputElement).files?.[0];
    if (!fil) return;
    if (
      !window.confirm(
        'Alt innhold, all historikk og alle forslag erstattes med innholdet i filen. Fortsette?',
      )
    )
      return;
    try {
      const svar = await cms.importer(JSON.parse(await fil.text()));
      settMelding({ tekst: `Gjenopprettet ${svar.antall.cms_innhold ?? 0} tekster med historikk.` });
    } catch (f) {
      settMelding({
        tekst: f instanceof SyntaxError ? 'Filen er ikke gyldig JSON.' : feiltekst(f),
        feil: true,
      });
    }
  }
  return (
    <section aria-labelledby="cms-kopi">
      <h2 id="cms-kopi">Sikkerhetskopi</h2>
      <p class="cms__ingress">
        Last ned alt innholdet i CMS-et som én fil: tekster, utkast, historikk, forslag, logg og brukere. Ta
        en kopi før store endringer. Databasen tas også med i one.com sin egen sikkerhetskopi.
      </p>
      <p>
        <a class="cms__knapp cms__knapp--primar" href={cms.eksportUrl()} download>
          Last ned sikkerhetskopi
        </a>
      </p>
      <label class="cms__felt">
        <span>Gjenopprett fra fil (brukere beholdes som de er)</span>
        <input type="file" accept="application/json,.json" onChange={gjenopprett} />
      </label>
      {melding && <Melding {...melding} />}
    </section>
  );
}

function Konto({ bruker, loggUt }: { bruker: Bruker; loggUt: () => void }) {
  const [gammelt, settGammelt] = useState('');
  const [nytt, settNytt] = useState('');
  const [melding, settMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  async function bytt(e: JSX.TargetedEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await cms.passord(gammelt, nytt);
      settMelding({ tekst: 'Passordet er byttet.' });
      settGammelt('');
      settNytt('');
    } catch (f) {
      settMelding({ tekst: feiltekst(f), feil: true });
    }
  }
  return (
    <section aria-labelledby="cms-konto">
      <h2 id="cms-konto">Kontoen din</h2>
      <p>
        {bruker.navn} · {bruker.epost} · {ROLLER[bruker.rolle]}
      </p>
      <form class="cms__ny" onSubmit={bytt}>
        <h3>Bytt passord</h3>
        <Skjemafelt
          etikett="Nåværende passord"
          type="password"
          verdi={gammelt}
          sett={settGammelt}
          auto="current-password"
        />
        <Skjemafelt
          etikett="Nytt passord (minst 12 tegn)"
          type="password"
          verdi={nytt}
          sett={settNytt}
          auto="new-password"
        />
        <button type="submit" class="cms__knapp cms__knapp--primar">
          Bytt passord
        </button>
        {melding && <Melding {...melding} />}
      </form>
      <p>
        <button type="button" class="cms__knapp" onClick={loggUt}>
          Logg ut
        </button>
      </p>
    </section>
  );
}

// ------------------------------------------------------------ Shell

type Tilstand =
  | { type: 'laster' }
  | { type: 'mangler'; grunn: string }
  | { type: 'inngang'; harBrukere: boolean }
  | { type: 'inne'; bruker: Bruker };

export default function CmsPanel() {
  const [tilstand, settTilstand] = useState<Tilstand>({ type: 'laster' });
  const [fane, settFane] = useState<Fane>('oversikt');
  const [ulagret, settUlagret] = useState(false);
  function byttFane(ny: Fane) {
    if (ny === fane) return;
    if (ulagret && !window.confirm('Du har ulagrede endringer i innlegget. Vil du forlate redaktøren?'))
      return;
    settFane(ny);
    settUlagret(false);
  }

  useEffect(() => {
    if (!phpmiljo) {
      settTilstand({
        type: 'mangler',
        grunn: 'CMS-et kjører på webhotellet (one.com). Denne versjonen av siden har det ikke.',
      });
      return;
    }
    (async () => {
      try {
        const status = await cms.status();
        if (!status.oppsett) {
          settTilstand({
            type: 'mangler',
            grunn: 'CMS-et er ikke slått på ennå: api/cms/konfig.php mangler på webhotellet.',
          });
          return;
        }
        try {
          settTilstand({ type: 'inne', bruker: (await cms.meg()).bruker });
        } catch (e) {
          if (e instanceof CmsFeil && e.status === 401)
            settTilstand({ type: 'inngang', harBrukere: status.harBrukere });
          else throw e;
        }
      } catch (e) {
        settTilstand({ type: 'mangler', grunn: feiltekst(e) });
      }
    })();
  }, []);

  async function loggUt() {
    try {
      await cms.loggUt();
    } finally {
      settTilstand({ type: 'inngang', harBrukere: true });
    }
  }

  if (tilstand.type === 'laster')
    return (
      <div class="studio__inngang cms">
        <h1>Designporten Studio</h1>
        <p role="status">Kobler til CMS-et …</p>
      </div>
    );
  if (tilstand.type === 'mangler')
    return (
      <div class="studio__inngang cms">
        <h1>Designporten Studio</h1>
        <Melding tekst={tilstand.grunn} />
      </div>
    );
  if (tilstand.type === 'inngang')
    return (
      <div class="studio__inngang cms">
        <img src={nettsti('/brand/designporten-merke.svg')} alt="Designporten" width="56" height="56" />
        <h1>Velkommen til Studio</h1>
        <Inngang
          harBrukere={tilstand.harBrukere}
          ferdig={(bruker) => settTilstand({ type: 'inne', bruker })}
        />
      </div>
    );

  const { bruker } = tilstand;
  return (
    <StudioSkall bruker={bruker} fane={fane} bytt={byttFane}>
      {fane === 'oversikt' && <StudioOversiktSide bruker={bruker} bytt={byttFane} />}
      {fane === 'blogg' && <Blogg bruker={bruker} ulagretEndret={settUlagret} />}
      {fane === 'butikk' && <StudioButikk />}
      {fane === 'innhold' && <Innhold bruker={bruker} />}
      {fane === 'bilder' && <Medier />}
      {fane === 'drift' && <DriftStatus />}
      {fane === 'forslag' && <Forslagsliste bruker={bruker} />}
      {fane === 'brukere' && <Brukere meg={bruker} />}
      {fane === 'logg' && <Logg />}
      {fane === 'kopi' && <Sikkerhetskopi />}
      {fane === 'konto' && <Konto bruker={bruker} loggUt={() => void loggUt()} />}
    </StudioSkall>
  );
}
