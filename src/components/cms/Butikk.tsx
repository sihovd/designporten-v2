/**
 * Studio → Butikk og betaling (Sivert 2026-11-09: «vi må ha alt i cms
 * funksjonen»). Products (status, price, text surcharge, name, texts), the
 * card payment switch and shipping, and the paid orders Stripe reports.
 * Every save is used on the site at once (php/api/cms/_handel.php). Stripe
 * keys are never shown or typed here: they live in api/stripe/konfig.php.
 * Pictures, colours, materials, sizes and new products are still edited in
 * the product administration (/admin) and need a new build.
 */
import { useEffect, useState } from 'preact/hooks';
import { nettsti } from '@/lib/nettsti';
import {
  cms,
  type Butikkinnstillinger,
  type Butikkoversikt,
  type Butikkprodukt,
  type Fraktvalg,
  type Ordre,
} from '@/lib/cms/api';
import { formaterKroner } from '@/lib/handel/kurv';

type Visning = 'produkter' | 'betaling' | 'ordrer';
type Produktrad = Butikkoversikt['produkter'][number];
type Melding = { feil: boolean; tekst: string } | null;

const dato = (v: string | null) =>
  v ? new Date(v).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const feiltekst = (e: unknown, standard: string) => (e instanceof Error ? e.message : standard);

/** «149» → 14900. Empty → null. Anything else (decimals, letters) → NaN. */
export function kronerTilOre(v: string): number | null {
  const t = v.trim().replace(/\s/g, '');
  if (t === '') return null;
  return /^\d{1,7}$/.test(t) ? Number(t) * 100 : NaN;
}
const oreTilKroner = (ore: number | null | undefined) => (ore == null ? '' : String(Math.round(ore / 100)));

function Meldingslinje({ melding }: { melding: Melding }) {
  if (!melding) return null;
  return (
    <p
      class={`cms__melding ${melding.feil ? 'cms__melding--feil' : ''}`}
      role={melding.feil ? 'alert' : 'status'}
    >
      {melding.tekst}
    </p>
  );
}

function Kronefelt({
  navn,
  verdi,
  sett,
  hjelp,
}: {
  navn: string;
  verdi: string;
  sett: (v: string) => void;
  hjelp?: string;
}) {
  return (
    <label class="cms__felt">
      {navn}
      <span class="cms__tallfelt">
        <input
          type="text"
          inputMode="numeric"
          autocomplete="off"
          pattern="[0-9 ]*"
          value={verdi}
          onInput={(e) => sett((e.target as HTMLInputElement).value)}
        />
        <span class="cms__dempet">kr inkl. mva</span>
      </span>
      {hjelp && <span class="cms__dempet butikk__hjelp">{hjelp}</span>}
    </label>
  );
}

// ---------------------------------------------------------------- Products

function Produktskjema({
  rad,
  lagret,
  lukk,
}: {
  rad: Produktrad;
  lagret: (b: Butikkoversikt) => void;
  lukk: () => void;
}) {
  const start: Butikkprodukt = rad.studio ?? rad.bygget;
  const [status, settStatus] = useState(start.status);
  const [pris, settPris] = useState(oreTilKroner(start.prisOre));
  const [tillegg, settTillegg] = useState(oreTilKroner(start.tilleggOre));
  const [navn, settNavn] = useState(start.navn);
  const [kort, settKort] = useState(start.kortBeskrivelse);
  const [beskrivelse, settBeskrivelse] = useState(start.beskrivelse);
  const [melding, settMelding] = useState<Melding>(null);
  const [lagrer, settLagrer] = useState(false);

  const prisOre = kronerTilOre(pris);
  const tilleggOre = kronerTilOre(tillegg);

  async function send(verdi: Butikkprodukt | null) {
    settLagrer(true);
    settMelding(null);
    try {
      const svar = await cms.butikkProdukt(rad.id, rad.versjon, verdi);
      lagret(svar.butikk);
      if (!verdi) {
        const b = rad.bygget;
        settStatus(b.status);
        settPris(oreTilKroner(b.prisOre));
        settTillegg(oreTilKroner(b.tilleggOre));
        settNavn(b.navn);
        settKort(b.kortBeskrivelse);
        settBeskrivelse(b.beskrivelse);
      }
      settMelding({
        feil: false,
        tekst: verdi
          ? 'Lagret. Endringen gjelder på nettsiden nå.'
          : 'Tilbakestilt til verdiene fra nettsidebygget.',
      });
    } catch (e) {
      settMelding({ feil: true, tekst: feiltekst(e, 'Kunne ikke lagre produktet.') });
    } finally {
      settLagrer(false);
    }
  }

  function lagre(e: Event) {
    e.preventDefault();
    if (Number.isNaN(prisOre))
      return settMelding({ feil: true, tekst: 'Skriv prisen i hele kroner, for eksempel 249.' });
    if (rad.bygget.egenTekst && Number.isNaN(tilleggOre))
      return settMelding({ feil: true, tekst: 'Skriv tillegget for egen tekst i hele kroner.' });
    void send({
      status,
      prisOre,
      ...(rad.bygget.egenTekst ? { tilleggOre } : {}),
      navn,
      kortBeskrivelse: kort,
      beskrivelse,
    });
  }

  const id = `produkt-${rad.id}`;
  return (
    <form class="butikk__skjema" onSubmit={lagre} aria-label={`Rediger ${rad.bygget.navn}`}>
      <fieldset class="butikk__valg">
        <legend>Status</legend>
        <label>
          <input
            type="radio"
            name={`${id}-status`}
            checked={status === 'bekreftet'}
            onChange={() => settStatus('bekreftet')}
          />{' '}
          Klar for salg
        </label>
        <label>
          <input
            type="radio"
            name={`${id}-status`}
            checked={status === 'plassholder'}
            onChange={() => settStatus('plassholder')}
          />{' '}
          Plassholder (merkes tydelig, kan bare sendes som forespørsel)
        </label>
      </fieldset>
      <div class="cms__pakkefelt">
        <Kronefelt
          navn="Pris"
          verdi={pris}
          sett={settPris}
          hjelp="Tomt felt betyr at prisen ikke er fastsatt. Hele kroner."
        />
        {rad.bygget.egenTekst && (
          <Kronefelt
            navn="Tillegg for egen tekst"
            verdi={tillegg}
            sett={settTillegg}
            hjelp="Tomt felt: varer med egen tekst får ingen pris og sendes som forespørsel."
          />
        )}
      </div>
      {status === 'bekreftet' && prisOre === null && (
        <p class="cms__dempet">
          Uten pris kan varen ikke betales med kort. Kunden kan sende den som forespørsel.
        </p>
      )}
      <label class="cms__felt">
        Navn
        <input
          value={navn}
          maxLength={80}
          required
          onInput={(e) => settNavn((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="cms__felt">
        Kort beskrivelse <span class="cms__dempet">({kort.length}/160, vises på kort og i søk)</span>
        <input
          value={kort}
          maxLength={160}
          required
          onInput={(e) => settKort((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="cms__felt">
        Beskrivelse <span class="cms__dempet">(produktsiden, tom linje mellom avsnitt)</span>
        <textarea
          rows={6}
          value={beskrivelse}
          required
          onInput={(e) => settBeskrivelse((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <Meldingslinje melding={melding} />
      <div class="cms__knapper">
        <button type="submit" class="cms__knapp cms__knapp--primar" disabled={lagrer}>
          {lagrer ? 'Lagrer …' : 'Lagre og bruk på nettsiden'}
        </button>
        <button type="button" class="cms__knapp" onClick={lukk}>
          Lukk
        </button>
        {rad.studio && (
          <button type="button" class="cms__lenkeknapp" disabled={lagrer} onClick={() => void send(null)}>
            Tilbakestill til nettsidebygget
          </button>
        )}
      </div>
    </form>
  );
}

function Produkter({ data, lagret }: { data: Butikkoversikt; lagret: (b: Butikkoversikt) => void }) {
  const [apen, settApen] = useState<string | null>(null);
  return (
    <ul class="cms__liste">
      {data.produkter.map((rad) => {
        const p = rad.studio ?? rad.bygget;
        const klar = p.status === 'bekreftet';
        return (
          <li key={rad.id} class={`cms__rad ${klar && p.prisOre !== null ? 'cms__rad--publisert' : ''}`}>
            <div class="butikk__produkt">
              {rad.bygget.bilde && (
                <img
                  class="cms__miniatyr"
                  src={rad.bygget.bilde}
                  alt=""
                  width={56}
                  height={56}
                  loading="lazy"
                />
              )}
              <div class="butikk__produkttekst">
                <div class="cms__radhode">
                  <span class="cms__feltnavn">{p.navn}</span>
                  <span>
                    <span class={`cms__merke ${klar ? 'cms__merke--publisert' : ''}`}>
                      {klar ? 'Klar for salg' : 'Plassholder'}
                    </span>{' '}
                    {rad.studio && <span class="cms__merke cms__merke--utkast">Endret i Studio</span>}
                  </span>
                </div>
                <p class="cms__dempet">
                  {rad.bygget.kategori} ·{' '}
                  {p.prisOre !== null ? formaterKroner(p.prisOre) : 'Pris ikke fastsatt'}
                  {rad.bygget.egenTekst &&
                    ` · egen tekst ${p.tilleggOre != null ? `+${formaterKroner(p.tilleggOre)}` : 'uten pris'}`}
                  {rad.endret && ` · endret ${dato(rad.endret)}${rad.endretAv ? ` av ${rad.endretAv}` : ''}`}
                </p>
              </div>
              {apen !== rad.id && (
                <button type="button" class="cms__knapp" onClick={() => settApen(rad.id)}>
                  Rediger<span class="visuelt-skjult"> {p.navn}</span>
                </button>
              )}
            </div>
            {apen === rad.id && (
              <Produktskjema key={rad.id} rad={rad} lagret={lagret} lukk={() => settApen(null)} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- Payment and shipping

type Fraktrad = { navn: string; pris: string; min: string; maks: string };
const tilRad = (f: Fraktvalg): Fraktrad => ({
  navn: f.navn,
  pris: oreTilKroner(f.prisOre),
  min: f.dagerMin == null ? '' : String(f.dagerMin),
  maks: f.dagerMaks == null ? '' : String(f.dagerMaks),
});

function Betaling({ data, lagret }: { data: Butikkoversikt; lagret: (b: Butikkoversikt) => void }) {
  const i = data.innstillinger;
  const start: Butikkinnstillinger = i.studio ?? i.bygget;
  const [betaling, settBetaling] = useState(start.betaling);
  const [frakt, settFrakt] = useState<Fraktrad[]>(start.frakt.map(tilRad));
  const [melding, settMelding] = useState<Melding>(null);
  const [lagrer, settLagrer] = useState(false);

  const endre = (n: number, felt: keyof Fraktrad, v: string) =>
    settFrakt((f) => f.map((r, j) => (j === n ? { ...r, [felt]: v } : r)));

  async function send(verdi: Butikkinnstillinger | null) {
    settLagrer(true);
    settMelding(null);
    try {
      const svar = await cms.butikkInnstillinger(i.versjon, verdi);
      lagret(svar.butikk);
      const ny = svar.butikk.innstillinger;
      const s = ny.studio ?? ny.bygget;
      settBetaling(s.betaling);
      settFrakt(s.frakt.map(tilRad));
      settMelding({
        feil: false,
        tekst: verdi ? 'Lagret. Gjelder i kassen nå.' : 'Tilbakestilt til nettsidebygget.',
      });
    } catch (e) {
      settMelding({ feil: true, tekst: feiltekst(e, 'Kunne ikke lagre.') });
    } finally {
      settLagrer(false);
    }
  }

  function lagre(e: Event) {
    e.preventDefault();
    const dager = (v: string) => (v.trim() === '' ? null : /^\d{1,2}$/.test(v.trim()) ? Number(v) : NaN);
    const ut: Fraktvalg[] = [];
    for (const [n, r] of frakt.entries()) {
      const pris = kronerTilOre(r.pris);
      const min = dager(r.min);
      const maks = dager(r.maks);
      if (pris === null || Number.isNaN(pris))
        return settMelding({
          feil: true,
          tekst: `Skriv prisen for fraktvalg ${n + 1} i hele kroner (0 for gratis).`,
        });
      if (Number.isNaN(min) || Number.isNaN(maks))
        return settMelding({
          feil: true,
          tekst: `Skriv leveringstiden for fraktvalg ${n + 1} som hele dager.`,
        });
      ut.push({ navn: r.navn, prisOre: pris, dagerMin: min, dagerMaks: maks });
    }
    void send({ betaling, frakt: ut });
  }

  return (
    <form onSubmit={lagre} aria-label="Kortbetaling og frakt">
      <section class="studio__panel">
        <h2>Kortbetaling</h2>
        <label class="butikk__bryter">
          <input
            type="checkbox"
            checked={betaling}
            onChange={(e) => settBetaling((e.target as HTMLInputElement).checked)}
          />
          <span>Ta imot kortbetaling med Stripe Checkout</span>
        </label>
        <p class="cms__dempet">
          Kunden betaler på Stripes egen side. Kortbetaling åpner bare når bryteren er på, Stripe er koblet
          til og minst ett fraktvalg finnes, og bare for varer som er klare for salg og har pris.
          Stripe-nøklene skrives aldri her: de ligger i api/stripe/konfig.php på serveren.
        </p>
      </section>

      <section class="studio__panel">
        <h2>Frakt</h2>
        <p class="cms__dempet">Vises i Stripe Checkout. Høyst fem valg. Prisene er hele kroner inkl. mva.</p>
        {frakt.length === 0 && <p>Ingen fraktvalg ennå. Kortbetaling åpner ikke uten frakt.</p>}
        <ol class="cms__liste">
          {frakt.map((r, n) => (
            <li class="cms__rad" key={n}>
              <fieldset class="butikk__frakt">
                <legend>Fraktvalg {n + 1}</legend>
                <label class="cms__felt butikk__fraktnavn">
                  Navn i kassen
                  <input
                    value={r.navn}
                    maxLength={80}
                    required
                    placeholder="For eksempel: Posten, liten pakke"
                    onInput={(e) => endre(n, 'navn', (e.target as HTMLInputElement).value)}
                  />
                </label>
                <Kronefelt navn="Pris" verdi={r.pris} sett={(v) => endre(n, 'pris', v)} />
                <label class="cms__felt">
                  Levering fra
                  <span class="cms__tallfelt">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.min}
                      onInput={(e) => endre(n, 'min', (e.target as HTMLInputElement).value)}
                    />
                    <span class="cms__dempet">virkedager</span>
                  </span>
                </label>
                <label class="cms__felt">
                  til
                  <span class="cms__tallfelt">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.maks}
                      onInput={(e) => endre(n, 'maks', (e.target as HTMLInputElement).value)}
                    />
                    <span class="cms__dempet">virkedager</span>
                  </span>
                </label>
              </fieldset>
              <button
                type="button"
                class="cms__lenkeknapp"
                onClick={() => settFrakt((f) => f.filter((_, j) => j !== n))}
              >
                Fjern fraktvalg {n + 1}
              </button>
            </li>
          ))}
        </ol>
        {frakt.length < 5 && (
          <button
            type="button"
            class="cms__knapp"
            onClick={() => settFrakt((f) => [...f, { navn: '', pris: '', min: '', maks: '' }])}
          >
            + Legg til fraktvalg
          </button>
        )}
      </section>
      <Meldingslinje melding={melding} />
      <div class="cms__knapper">
        <button type="submit" class="cms__knapp cms__knapp--primar" disabled={lagrer}>
          {lagrer ? 'Lagrer …' : 'Lagre og bruk i kassen'}
        </button>
        {i.studio && (
          <button type="button" class="cms__lenkeknapp" disabled={lagrer} onClick={() => void send(null)}>
            Tilbakestill til nettsidebygget
          </button>
        )}
      </div>
      {i.endret && (
        <p class="cms__dempet">
          Sist endret {dato(i.endret)}
          {i.endretAv ? ` av ${i.endretAv}` : ''}.
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- Orders

function Ordrekort({
  ordre,
  leveringer,
  oppdatert,
}: {
  ordre: Ordre;
  leveringer: Record<string, string>;
  oppdatert: (o: Ordre) => void;
}) {
  const [notat, settNotat] = useState(ordre.notat ?? '');
  const [melding, settMelding] = useState<Melding>(null);
  const [opptatt, settOpptatt] = useState(false);

  async function gjor(handling: () => Promise<{ ordre: Ordre }>, ok: string) {
    settOpptatt(true);
    settMelding(null);
    try {
      oppdatert((await handling()).ordre);
      settMelding({ feil: false, tekst: ok });
    } catch (e) {
      settMelding({ feil: true, tekst: feiltekst(e, 'Kunne ikke lagre ordren.') });
    } finally {
      settOpptatt(false);
    }
  }

  const stripe = ordre.betalingId
    ? `https://dashboard.stripe.com/${ordre.modus === 'test' ? 'test/' : ''}payments/${ordre.betalingId}`
    : null;
  return (
    <li class={`cms__rad ${ordre.levering === 'ny' ? 'cms__rad--utkast' : ''}`}>
      <div class="cms__radhode">
        <span class="cms__feltnavn">
          {ordre.referanse} · {ordre.navn}
        </span>
        <span>
          {ordre.modus === 'test' && <span class="cms__merke">Testbetaling</span>}{' '}
          <span class="cms__merke cms__merke--publisert">Betalt</span>
        </span>
      </div>
      <p class="cms__dempet">
        {dato(ordre.opprettet)} · {ordre.totalOre !== null ? formaterKroner(ordre.totalOre) : 'beløp ukjent'}
        {ordre.fraktOre !== null && ` (frakt ${formaterKroner(ordre.fraktOre)})`}
      </p>
      {!ordre.varslet && (
        <p class="cms__melding cms__melding--feil">
          E-posten om denne ordren er ikke sendt.{' '}
          <button
            type="button"
            class="cms__lenkeknapp"
            disabled={opptatt}
            onClick={() => void gjor(() => cms.ordreVarsle(ordre.id), 'E-posten er sendt.')}
          >
            Send på nytt
          </button>
        </p>
      )}
      <details class="butikk__detaljer">
        <summary>Varer, kunde og levering</summary>
        <ul>
          {(ordre.linjer ?? []).map((l, n) => (
            <li key={n}>
              {l.antall} × {l.navn} · {formaterKroner(l.belopOre)}
            </li>
          ))}
          {ordre.linjer === null && <li>Varelinjene kunne ikke hentes. Se betalingen i Stripe.</li>}
        </ul>
        <dl class="studio__fakta">
          <div>
            <dt>E-post</dt>
            <dd>{ordre.epost || '–'}</dd>
          </div>
          <div>
            <dt>Telefon</dt>
            <dd>{ordre.telefon || '–'}</dd>
          </div>
          <div>
            <dt>Leveringsadresse</dt>
            <dd class="butikk__adresse">{ordre.adresse || '–'}</dd>
          </div>
          {ordre.melding && (
            <div>
              <dt>Melding</dt>
              <dd class="butikk__adresse">{ordre.melding}</dd>
            </div>
          )}
        </dl>
        <label class="cms__felt">
          Internt notat
          <textarea
            rows={3}
            value={notat}
            onInput={(e) => settNotat((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        <button
          type="button"
          class="cms__knapp"
          disabled={opptatt}
          onClick={() => void gjor(() => cms.ordre({ id: ordre.id, notat }), 'Notatet er lagret.')}
        >
          Lagre notat
        </button>
        {stripe && (
          <p>
            <a href={stripe} target="_blank" rel="noopener noreferrer">
              Åpne betalingen i Stripe ↗
            </a>{' '}
            <span class="cms__dempet">(refusjon gjøres der)</span>
          </p>
        )}
      </details>
      <label class="cms__felt butikk__levering">
        Levering
        <select
          value={ordre.levering}
          disabled={opptatt}
          onChange={(e) =>
            void gjor(
              () => cms.ordre({ id: ordre.id, levering: (e.target as HTMLSelectElement).value }),
              'Leveringsstatusen er lagret.',
            )
          }
        >
          {Object.entries(leveringer).map(([verdi, navn]) => (
            <option key={verdi} value={verdi}>
              {navn}
            </option>
          ))}
        </select>
      </label>
      <Meldingslinje melding={melding} />
    </li>
  );
}

function Ordrer() {
  const [data, settData] = useState<{ ordrer: Ordre[]; leveringer: Record<string, string> } | null>(null);
  const [feil, settFeil] = useState('');
  useEffect(() => {
    cms
      .ordrer()
      .then(settData)
      .catch((e) => settFeil(feiltekst(e, 'Kunne ikke hente ordrene.')));
  }, []);
  if (feil) return <p role="alert">{feil}</p>;
  if (!data) return <p role="status">Henter ordrene …</p>;
  if (!data.ordrer.length)
    return (
      <p class="studio__tomtilstand">
        Ingen betalte ordrer ennå. Når en kunde betaler med kort, lagrer Stripe-varselet (webhooken) ordren
        her.
      </p>
    );
  return (
    <ul class="cms__liste">
      {data.ordrer.map((o) => (
        <Ordrekort
          key={o.id}
          ordre={o}
          leveringer={data.leveringer}
          oppdatert={(ny) => settData({ ...data, ordrer: data.ordrer.map((x) => (x.id === ny.id ? ny : x)) })}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- The tab

export default function Butikk() {
  const [data, settData] = useState<Butikkoversikt | null>(null);
  const [feil, settFeil] = useState('');
  const [visning, settVisning] = useState<Visning>('produkter');
  useEffect(() => {
    cms
      .butikk()
      .then((d) => settData(d.butikk))
      .catch((e) => settFeil(feiltekst(e, 'Kunne ikke hente butikken.')));
  }, []);
  if (feil) return <p role="alert">{feil}</p>;
  if (!data) return <p role="status">Henter butikken fra CMS-databasen …</p>;

  const innst = data.innstillinger.studio ?? data.innstillinger.bygget;
  const klare = data.produkter.filter((r) => {
    const p = r.studio ?? r.bygget;
    return p.status === 'bekreftet' && p.prisOre !== null;
  }).length;
  const faner: [Visning, string][] = [
    ['produkter', `Produkter (${data.produkter.length})`],
    ['betaling', 'Kortbetaling og frakt'],
    ['ordrer', `Ordrer${data.nyeOrdrer ? ` (${data.nyeOrdrer} nye)` : ''}`],
  ];
  return (
    <>
      <section class="studio__panel">
        <h2>Status for kassen</h2>
        <dl class="studio__fakta">
          <div>
            <dt>Kortbetaling</dt>
            <dd>{data.kasse.aktiv ? 'Åpen for kunder' : `Stengt: ${data.kasse.grunn ?? ''}`}</dd>
          </div>
          <div>
            <dt>Bryteren</dt>
            <dd>{innst.betaling ? 'På' : 'Av'}</dd>
          </div>
          <div>
            <dt>Stripe</dt>
            <dd>
              {data.stripe.tilkoblet
                ? `Koblet til (${data.stripe.modus === 'live' ? 'ekte betalinger' : 'testmodus'})${data.stripe.webhook ? '' : ', men webhook-hemmeligheten mangler'}`
                : `Ikke koblet til. ${data.stripe.grunn ?? ''}`}
            </dd>
          </div>
          <div>
            <dt>Fraktvalg</dt>
            <dd>{innst.frakt.length}</dd>
          </div>
          <div>
            <dt>Klare for salg med pris</dt>
            <dd>
              {klare} av {data.produkter.length}
            </dd>
          </div>
        </dl>
      </section>

      <nav class="cms__faner" aria-label="Butikken">
        {faner.map(([id, navn]) => (
          <button
            key={id}
            type="button"
            class="cms__fane"
            aria-current={visning === id ? 'page' : undefined}
            onClick={() => settVisning(id)}
          >
            {navn}
          </button>
        ))}
      </nav>

      <div class="butikk__innhold">
        {visning === 'produkter' && (
          <>
            <p class="cms__dempet">
              Status, pris, navn og tekster lagres her og gjelder på nettsiden med en gang. Bilder, farger,
              materialer, mål og nye produkter endres fortsatt i{' '}
              <a href={nettsti('/admin/')} target="_blank" rel="noopener">
                produktadministrasjonen ↗
              </a>{' '}
              og krever en ny publisering av nettsiden.
            </p>
            <Produkter data={data} lagret={settData} />
          </>
        )}
        {visning === 'betaling' && <Betaling data={data} lagret={settData} />}
        {visning === 'ordrer' && <Ordrer />}
      </div>
    </>
  );
}
