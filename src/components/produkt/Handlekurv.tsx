/**
 * Cart page island. Shows the lines kept in the browser (src/lib/handel/kurv.ts),
 * lets the visitor change quantities, and sends the cart through the active
 * CommerceProvider. With the «forespørsel» provider no payment is taken, and
 * the page says so before, during and after sending.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { erDesignlinje, type Bestillingssvar, type Designvedlegg } from '@/lib/handel/bestilling';
import {
  antallVarer,
  delsum,
  formaterKroner,
  hentKurv,
  lyttPaKurv,
  settAntall,
  tomKurv,
  type KurvLinje,
} from '@/lib/handel/kurv';
import { aktivLeverandor } from '@/lib/handel/leverandor';
import type { ProduktVisning } from '@/lib/handel/visning';
import { hentDesign } from '@/skaperverksted/core/lagring';
import './handlekurv.css';

interface Props {
  produkter: Record<string, ProduktVisning>;
}

type Sendt = { referanse: string; kanal: 'epost' | 'fil'; linjer: KurvLinje[] };

function valgTekst(l: KurvLinje, p: ProduktVisning | undefined): string {
  if (erDesignlinje(l))
    return Object.entries(l.valg)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
  const farge = p?.farger.find((f) => f.id === l.valg.farge)?.navn ?? l.valg.farge;
  return [
    farge && `Farge: ${farge}`,
    l.valg.materiale && `Materiale: ${l.valg.materiale}`,
    l.valg.tekst && `Tekst: «${l.valg.tekst}»`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function Handlekurv({ produkter }: Props) {
  const leverandor = aktivLeverandor;
  const [linjer, settLinjer] = useState<KurvLinje[] | null>(null);
  const [sender, settSender] = useState(false);
  const [feil, settFeil] = useState<string | null>(null);
  const [feltfeil, settFeltfeil] = useState<Record<string, string>>({});
  const [sendt, settSendt] = useState<Sendt | null>(null);

  useEffect(() => {
    settLinjer(hentKurv());
    return lyttPaKurv(settLinjer);
  }, []);

  // Designs from Skaperverksted live in this browser's storage (skaperverksted/core/lagring.ts).
  const design = useMemo(() => {
    const ut: Record<string, Designvedlegg | null> = {};
    for (const l of linjer ?? []) {
      if (!l.designId) continue;
      const d = hentDesign(l.designId);
      ut[l.nokkel] = d
        ? { id: d.id, generator: d.generator, navn: d.navn, sammendrag: d.sammendrag, dokument: d.dokument }
        : null;
    }
    return ut;
  }, [linjer]);
  const ukjente = useMemo(
    () => (linjer ?? []).filter((l) => (erDesignlinje(l) ? !design[l.nokkel] : !produkter[l.produktId])),
    [linjer, produkter, design],
  );

  async function send(e: Event) {
    e.preventDefault();
    if (!linjer?.length || sender) return;
    const skjema = e.currentTarget as HTMLFormElement;
    const f = new FormData(skjema);
    settSender(true);
    settFeil(null);
    settFeltfeil({});
    const svar: Bestillingssvar = await leverandor.sendBestilling({
      navn: String(f.get('navn') ?? ''),
      epost: String(f.get('epost') ?? ''),
      telefon: String(f.get('telefon') ?? ''),
      melding: String(f.get('melding') ?? ''),
      nettside: String(f.get('nettside') ?? ''),
      linjer: linjer.map((l) => ({
        produktId: l.produktId,
        navn: l.navn,
        antall: l.antall,
        valg: l.valg,
        design: design[l.nokkel] ?? undefined,
      })),
    });
    settSender(false);
    if (svar.ok) {
      settSendt({ referanse: svar.referanse, kanal: svar.kanal, linjer });
      tomKurv();
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => document.getElementById('kvittering')?.focus());
    } else {
      settFeil(svar.grunn);
      settFeltfeil(svar.felt ?? {});
      requestAnimationFrame(() => document.getElementById('bestillingsfeil')?.focus());
    }
  }

  if (sendt) {
    return (
      <section class="kurv__kvittering" id="kvittering" tabIndex={-1} aria-labelledby="kvittering-tittel">
        <p class="mono">Referanse {sendt.referanse}</p>
        <h2 id="kvittering-tittel">Takk, forespørselen er sendt.</h2>
        <p>
          Vi har fått handlekurven din. Ingen betaling er tatt. Vi svarer deg på e-post, og ingenting blir
          laget før du har avtalt det med oss.
        </p>
        {sendt.kanal === 'fil' && (
          <p class="kurv__utvikling">
            Utviklingsmodus: e-post er ikke satt opp, så forespørselen ble lagret på serveren i stedet for å
            bli sendt.
          </p>
        )}
        <ul class="kurv__sendt">
          {sendt.linjer.map((l) => (
            <li key={l.nokkel}>
              {l.antall} × {l.navn}
              <span class="mono"> {valgTekst(l, produkter[l.produktId])}</span>
            </li>
          ))}
        </ul>
        <a href="/produkter/">Tilbake til produktene</a>
      </section>
    );
  }

  if (linjer === null) {
    return <p class="kurv__laster mono">Henter handlekurven …</p>;
  }

  if (linjer.length === 0) {
    return (
      <section class="kurv__tom">
        <h2>Handlekurven er tom.</h2>
        <p>Finn noe blant produktene, eller lag noe eget i Skaperverksted.</p>
        <p class="kurv__tom-lenker">
          <a href="/produkter/">Se produktene</a>
          <a href="/skaperverksted/">Gå til Skaperverksted</a>
        </p>
      </section>
    );
  }

  const designlinjer = linjer.filter((l) => erDesignlinje(l));
  const { ore, ukjent } = delsum(linjer.filter((l) => !erDesignlinje(l)));
  const antallDesign = antallVarer(designlinjer);
  const n = antallVarer(linjer);

  return (
    <div class="kurv">
      <section class="kurv__linjer" aria-labelledby="kurv-varer">
        <h2 id="kurv-varer" class="visuelt-skjult">
          Varer
        </h2>
        <ul>
          {linjer.map((l) => {
            const erDesign = erDesignlinje(l);
            const p = erDesign ? undefined : produkter[l.produktId];
            const pris = erDesign ? null : l.enhetspris;
            const manglerDesign = erDesign && !design[l.nokkel];
            return (
              <li class="kurvlinje" key={l.nokkel}>
                <div class="kurvlinje__bilde">
                  {p && (
                    <img src={p.bilde.src} alt="" width={74} height={74} loading="lazy" decoding="async" />
                  )}
                </div>
                <div class="kurvlinje__tekst">
                  {p ? <a href={p.href}>{l.navn}</a> : <span>{l.navn}</span>}
                  <span class="kurvlinje__valg">{valgTekst(l, p)}</span>
                  {p?.status === 'plassholder' && <span class="kurvlinje__status mono">Plassholder</span>}
                  {erDesign && <span class="kurvlinje__kilde mono">Laget i Skaperverksted</span>}
                  {!erDesign && !p && (
                    <span class="kurvlinje__feil">Finnes ikke lenger. Fjern varen for å sende.</span>
                  )}
                  {manglerDesign && (
                    <span class="kurvlinje__feil">
                      Designet finnes ikke lenger i denne nettleseren. Fjern linjen og legg det inn på nytt
                      fra Skaperverksted.
                    </span>
                  )}
                </div>
                <div class="kurvlinje__antall" role="group" aria-label={`Antall ${l.navn}`}>
                  <button type="button" onClick={() => settAntall(l.nokkel, l.antall - 1)}>
                    <span aria-hidden="true">−</span>
                    <span class="visuelt-skjult">Én færre</span>
                  </button>
                  <span class="tall" aria-live="polite">
                    {l.antall}
                  </span>
                  <button
                    type="button"
                    onClick={() => settAntall(l.nokkel, l.antall + 1)}
                    disabled={l.antall >= 999}
                  >
                    <span aria-hidden="true">+</span>
                    <span class="visuelt-skjult">Én til</span>
                  </button>
                </div>
                <div class="kurvlinje__pris">
                  {erDesign ? (
                    <span class="kurvlinje__ingenpris">Pris avtales</span>
                  ) : pris !== null ? (
                    <span class="tall">{formaterKroner(pris * l.antall)}</span>
                  ) : (
                    <span class="kurvlinje__ingenpris">Pris ikke fastsatt</span>
                  )}
                  <button class="kurvlinje__fjern" type="button" onClick={() => settAntall(l.nokkel, 0)}>
                    Fjern<span class="visuelt-skjult"> {l.navn}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <aside class="kurv__oppsummering" aria-labelledby="kurv-oppsummering">
        <h2 id="kurv-oppsummering">Oppsummering</h2>
        <dl>
          <div>
            <dt>Varer</dt>
            <dd class="tall">{n}</dd>
          </div>
          {ore > 0 && (
            <div>
              <dt>Sum for varer med pris</dt>
              <dd class="tall">{formaterKroner(ore)}</dd>
            </div>
          )}
          {antallDesign > 0 && (
            <div>
              <dt>Design, pris avtales</dt>
              <dd class="tall">{antallDesign}</dd>
            </div>
          )}
          {ukjent > 0 && (
            <div>
              <dt>Uten fastsatt pris</dt>
              <dd class="tall">
                {ukjent} {ukjent === 1 ? 'vare' : 'varer'}
              </dd>
            </div>
          )}
        </dl>
        {!leverandor.tarBetalt && (
          <p class="kurv__ingenbetaling">
            <strong>Ingen betaling tas her.</strong> Handlekurven sendes til oss som en forespørsel. Pris,
            frakt og levering avtaler du med oss før noe blir laget.
          </p>
        )}

        <form class="kurv__skjema" onSubmit={send} noValidate={false}>
          <h3>Dine opplysninger</h3>
          {feil && (
            <p class="kurv__feil" id="bestillingsfeil" tabIndex={-1} role="alert">
              {feil}
            </p>
          )}
          <label>
            <span>Navn</span>
            <input
              name="navn"
              autocomplete="name"
              required
              minLength={2}
              maxLength={120}
              aria-invalid={!!feltfeil.navn}
            />
            {feltfeil.navn && <span class="kurv__feltfeil">{feltfeil.navn}</span>}
          </label>
          <label>
            <span>E-post</span>
            <input
              name="epost"
              type="email"
              autocomplete="email"
              required
              maxLength={200}
              aria-invalid={!!feltfeil.epost}
            />
            {feltfeil.epost && <span class="kurv__feltfeil">{feltfeil.epost}</span>}
          </label>
          <label>
            <span>
              Telefon <small>(valgfritt)</small>
            </span>
            <input name="telefon" type="tel" autocomplete="tel" maxLength={40} />
          </label>
          <label>
            <span>
              Melding <small>(valgfritt)</small>
            </span>
            <textarea
              name="melding"
              rows={4}
              maxLength={4000}
              placeholder="For eksempel når du trenger det, eller spørsmål om farger og mål."
            />
          </label>
          <label class="kurv__honning" aria-hidden="true">
            Nettside
            <input name="nettside" tabIndex={-1} autocomplete="off" />
          </label>
          <button class="kurv__send" type="submit" disabled={sender || ukjente.length > 0}>
            {sender ? 'Sender …' : leverandor.sendeTekst}
          </button>
          <p class="kurv__hjelp">
            Vi bruker opplysningene bare til å svare på forespørselen. <a href="/personvern/">Personvern</a>
          </p>
        </form>
      </aside>
    </div>
  );
}
