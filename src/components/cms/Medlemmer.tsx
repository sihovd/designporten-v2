/**
 * The member register and the public sign gallery, for administrators
 * (Sivert, 2026-10-16): who has an account, their plan and payment state,
 * and the shared signs, each of which can be hidden from the gallery.
 * Stage B (2026-10-18): whether the address is confirmed, suspend and
 * reactivate (which ends every sign-in), an exception per member for a
 * service or feature, and on a test build the captured e-mails.
 * Packages (2026-10-18, Sivert: «enkelt å endre i cms»): quota and price
 * per package, stored on the server in place of tjenester.json's numbers.
 */
import { useEffect, useState } from 'preact/hooks';
import { cmsCsrf } from '@/lib/cms/api';
import { konto, type DeltSkilt, type Medlem } from '@/lib/konto/api';
import { BETALINGSMERKNAD, betalingstekst, PLANER, TJENESTER, type Plan } from '@/lib/konto/tjenester';

type Rad = Medlem & {
  antallSkilt: number;
  antallProsjekter: number;
  aktiv: boolean;
  unntak: Record<string, 'ja' | 'nei'>;
};
type Testpost = { til: string; emne: string; tekst: string; tid: string };

const dato = (v: string | null) =>
  v ? new Date(v).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const BETALINGSSTATUS: Record<Medlem['betaling']['status'], string> = {
  ingen: 'Ingen betaling',
  aktiv: 'Betalt',
  utlopt: 'Utløpt',
  avbrutt: 'Avbrutt',
};

/** One package: projects, and for a paid one the price. Saved on the server, used at once. */
function Pakkeskjema({
  id,
  plan,
  lagret,
}: {
  id: string;
  plan: Plan;
  lagret: (p: Record<string, Plan>) => void;
}) {
  const [prosjekter, settProsjekter] = useState(String(plan.prosjekter));
  const [maned, settManed] = useState(String(plan.pris?.maned ?? ''));
  const [ar, settAr] = useState(String(plan.pris?.ar ?? ''));
  const [melding, settMelding] = useState<{ feil: boolean; tekst: string } | null>(null);
  const [lagrer, settLagrer] = useState(false);
  const tall = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

  const lagre = async (e: Event) => {
    e.preventDefault();
    settLagrer(true);
    try {
      const svar = await konto.admin.plan(
        {
          id,
          prosjekter: tall(prosjekter),
          prisManed: plan.pris ? tall(maned) : null,
          prisAr: plan.pris ? tall(ar) : null,
        },
        cmsCsrf(),
      );
      // the numbers as the server stored them
      const ny = svar.planer[id];
      if (ny) {
        settProsjekter(String(ny.prosjekter));
        settManed(String(ny.pris?.maned ?? ''));
        settAr(String(ny.pris?.ar ?? ''));
      }
      lagret(svar.planer);
      settMelding({ feil: false, tekst: `${plan.navn} er lagret og gjelder nå.` });
    } catch (feil) {
      settMelding({ feil: true, tekst: feil instanceof Error ? feil.message : 'Kunne ikke lagre pakken.' });
    } finally {
      settLagrer(false);
    }
  };

  const felt = (navn: string, verdi: string, sett: (v: string) => void, enhet: string) => (
    <label class="cms__felt">
      {navn}
      <span class="cms__tallfelt">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          required
          value={verdi}
          onInput={(e) => sett((e.target as HTMLInputElement).value)}
        />
        <span class="cms__dempet">{enhet}</span>
      </span>
    </label>
  );

  return (
    <li class="cms__rad">
      <form onSubmit={(e) => void lagre(e)} aria-label={`Pakken ${plan.navn}`}>
        <div class="cms__radhode">
          <span class="cms__feltnavn">{plan.navn}</span>
          <span class="cms__merke">
            {plan.pris ? (plan.kanKjopes ? 'Kan kjøpes' : 'Kan ikke kjøpes ennå') : 'Gratis'}
          </span>
        </div>
        <div class="cms__pakkefelt">
          {felt('Prosjekter på kontoen', prosjekter, settProsjekter, 'stk.')}
          {plan.pris && felt('Pris per måned', maned, settManed, 'kr inkl. mva')}
          {plan.pris && felt('Pris per år', ar, settAr, 'kr inkl. mva')}
        </div>
        {plan.endret && (
          <p class="cms__dempet">
            Sist endret {dato(plan.endret)}
            {plan.endretAv ? ` av ${plan.endretAv}` : ''}.
          </p>
        )}
        {melding && (
          <p
            class={`cms__melding ${melding.feil ? 'cms__melding--feil' : ''}`}
            role={melding.feil ? 'alert' : 'status'}
          >
            {melding.tekst}
          </p>
        )}
        <button type="submit" class="cms__knapp cms__knapp--primar" disabled={lagrer}>
          {lagrer ? 'Lagrer …' : 'Lagre'}
          <span class="visuelt-skjult"> {plan.navn}</span>
        </button>
      </form>
    </li>
  );
}

/** Pakker og priser: what each package gives and costs; read by the server on every request. */
function Pakker() {
  const [planer, settPlaner] = useState<Record<string, Plan> | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  useEffect(() => {
    konto.admin
      .planer()
      .then((s) => settPlaner(s.planer))
      .catch((e: unknown) => settFeil(e instanceof Error ? e.message : 'Kunne ikke hente pakkene.'));
  }, []);
  return (
    <section aria-labelledby="cms-pakker">
      <h2 id="cms-pakker">Pakker og priser</h2>
      <p class="cms__dempet">
        Endringer gjelder med en gang: kvoten for prosjekter på kontoen og prisen som vises på Min konto.
        Ingen betaling er slått på, så pakken kan ikke kjøpes ennå.
      </p>
      {feil && (
        <p class="cms__melding cms__melding--feil" role="alert">
          {feil}
        </p>
      )}
      {!planer && !feil && <p class="cms__dempet">Henter …</p>}
      <ul class="cms__liste">
        {Object.entries(planer ?? {}).map(([id, p]) => (
          <Pakkeskjema key={id} id={id} plan={p} lagret={settPlaner} />
        ))}
      </ul>
    </section>
  );
}

export function Medlemmer() {
  const [register, settRegister] = useState<{
    medlemmer: Rad[];
    antall: number;
    gjesteskilt: number;
    tilgangsnokler: string[];
  } | null>(null);
  const [testpost, settTestpost] = useState<Testpost[] | null>(null);
  const [beskjed, settBeskjed] = useState<string | null>(null);
  const [skilt, settSkilt] = useState<DeltSkilt[] | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const [sok, settSok] = useState('');

  const hent = () =>
    Promise.all([konto.admin.medlemmer(), konto.admin.skilt()])
      .then(([m, s]) => {
        settRegister(m);
        settSkilt(s.skilt);
      })
      .catch((e: unknown) => settFeil(e instanceof Error ? e.message : 'Kunne ikke hente registeret.'));
  useEffect(() => {
    void hent();
    // only a test build answers; elsewhere the section stays away
    konto.admin
      .testpost()
      .then((t) => settTestpost(t.eposter))
      .catch(() => settTestpost(null));
  }, []);

  const settStatus = async (m: Rad) => {
    const ny = m.status === 'aktiv' ? 'suspendert' : 'aktiv';
    try {
      await konto.admin.status(m.id, ny, cmsCsrf());
      settBeskjed(
        ny === 'suspendert'
          ? `${m.navn} er suspendert og logget ut overalt.`
          : `${m.navn} er aktiv igjen og må logge inn på nytt.`,
      );
      await hent();
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Kunne ikke endre statusen.');
    }
  };

  const settUnntak = async (m: Rad, nokkel: string, verdi: string) => {
    try {
      await konto.admin.tilgang(m.id, nokkel, verdi === 'ja' || verdi === 'nei' ? verdi : null, cmsCsrf());
      settBeskjed(`Tilgangen for ${m.navn} er lagret.`);
      await hent();
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Kunne ikke endre tilgangen.');
    }
  };

  const skjul = async (s: DeltSkilt) => {
    try {
      await konto.admin.skjul(s.id, !s.skjult, cmsCsrf());
      await hent();
    } catch (e) {
      settFeil(e instanceof Error ? e.message : 'Kunne ikke endre skiltet.');
    }
  };

  const filter = sok.trim().toLowerCase();
  const synlige = (register?.medlemmer ?? []).filter(
    (m) => !filter || m.navn.toLowerCase().includes(filter) || m.epost.includes(filter),
  );

  return (
    <>
      <Pakker />
      <section aria-labelledby="cms-medlemmer">
        <h2 id="cms-medlemmer">Medlemsregister</h2>
        <p class="cms__dempet">
          {register
            ? `${register.antall} ${register.antall === 1 ? 'medlem' : 'medlemmer'} · ${register.gjesteskilt} skilt delt uten konto. `
            : ''}
          {BETALINGSMERKNAD}{' '}
          {Object.values(TJENESTER)
            .map((t) => `${t.navn}: ${betalingstekst(t).toLowerCase()}`)
            .join(' · ')}
          .
        </p>
        {feil && (
          <p class="cms__melding cms__melding--feil" role="alert">
            {feil}
          </p>
        )}
        {beskjed && (
          <p class="cms__melding" role="status">
            {beskjed}
          </p>
        )}
        <label class="cms__felt cms__felt--sok">
          Søk etter navn eller e-post
          <input type="search" value={sok} onInput={(e) => settSok((e.target as HTMLInputElement).value)} />
        </label>
        {!register && !feil && <p class="cms__dempet">Henter …</p>}
        {register && synlige.length === 0 && <p class="cms__dempet">Ingen medlemmer ennå.</p>}
        <ul class="cms__liste">
          {synlige.map((m) => (
            <li key={m.id} class="cms__rad">
              <div class="cms__radhode">
                <span class="cms__feltnavn">
                  {m.navn} <span class="cms__dempet">· {m.epost}</span>
                </span>
                <span class={`cms__merke ${m.status === 'aktiv' ? '' : 'cms__merke--utkast'}`}>
                  {PLANER[m.plan]?.navn ?? m.plan} · {BETALINGSSTATUS[m.betaling.status]}
                  {m.status === 'suspendert' && ' · suspendert'}
                </span>
              </div>
              <p class="cms__dempet">
                Medlem siden {dato(m.opprettet)} · sist innlogget {dato(m.sistInne)} · {m.antallSkilt} delte
                skilt · {m.antallProsjekter} av {m.pakke?.prosjekter ?? '?'} prosjekter på kontoen · e-post{' '}
                {m.epostBekreftet ? `bekreftet ${dato(m.epostBekreftet)}` : 'ikke bekreftet'}
                {m.betaling.leverandor && ` · betaler med ${m.betaling.leverandor}`}
                {m.betaling.betaltTil && ` · betalt til ${dato(m.betaling.betaltTil)}`}
              </p>
              <details>
                <summary>
                  Tilganger og status<span class="visuelt-skjult"> for {m.navn}</span>
                </summary>
                {(register?.tilgangsnokler ?? []).map((nokkel) => (
                  <label key={nokkel} class="cms__felt">
                    {nokkel}
                    <select
                      value={m.unntak[nokkel] ?? ''}
                      onChange={(e) => void settUnntak(m, nokkel, (e.target as HTMLSelectElement).value)}
                    >
                      <option value="">Standard</option>
                      <option value="nei">Stengt for dette medlemmet</option>
                      <option value="ja">Åpnet uten betaling</option>
                    </select>
                  </label>
                ))}
                <button type="button" class="cms__knapp" onClick={() => void settStatus(m)}>
                  {m.status === 'aktiv' ? 'Suspender' : 'Aktiver igjen'}
                  <span class="visuelt-skjult"> {m.navn}</span>
                </button>
              </details>
            </li>
          ))}
        </ul>
      </section>

      {testpost && (
        <section aria-labelledby="cms-testpost">
          <h2 id="cms-testpost">Fanget e-post (testbygg)</h2>
          <p class="cms__dempet">
            Testbygget sender ingen e-post. Det kontoen ville sendt, står her, nyeste først. Lenkene virker på
            dette testbygget.
          </p>
          {testpost.length === 0 && <p class="cms__dempet">Ingen e-post ennå.</p>}
          <ul class="cms__liste">
            {testpost.map((e) => (
              <li key={e.tid + e.til + e.emne} class="cms__rad">
                <div class="cms__radhode">
                  <span class="cms__feltnavn">{e.emne}</span>
                  <span class="cms__dempet">
                    til {e.til} · {dato(e.tid)}
                  </span>
                </div>
                <pre class="cms__epost">{e.tekst}</pre>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cms-skiltgalleri">
        <h2 id="cms-skiltgalleri">Skiltgalleriet «Nylig laget»</h2>
        <p class="cms__dempet">
          Skilt som medlemmer selv har publisert fra Sign Forge (og skilt som ble delt automatisk før 17.
          oktober 2026). Skjul et skilt som ikke skal vises offentlig; det kan vises igjen senere.
        </p>
        {skilt?.length === 0 && <p class="cms__dempet">Ingen skilt er delt ennå.</p>}
        <ul class="cms__liste">
          {(skilt ?? []).map((s) => (
            <li key={s.id} class={`cms__rad ${s.skjult ? 'cms__rad--utkast' : ''}`}>
              <div class="cms__radhode">
                <span class="cms__feltnavn">
                  {s.bilde && !s.skjult && (
                    <img class="cms__skiltbilde" src={s.bilde} alt="" width="48" height="36" />
                  )}
                  {s.tittel} <span class="cms__dempet">· {s.skaper}</span>
                </span>
                <span class={`cms__merke ${s.skjult ? 'cms__merke--utkast' : 'cms__merke--publisert'}`}>
                  {s.skjult ? 'Skjult' : 'Vises'}
                </span>
              </div>
              <p class="cms__dempet">
                Delt {dato(s.opprettet)} · endret {dato(s.endret)} · brukt som mal {s.gangerBrukt} ganger
              </p>
              <button type="button" class="cms__knapp" onClick={() => void skjul(s)}>
                {s.skjult ? 'Vis i galleriet' : 'Skjul fra galleriet'}
                <span class="visuelt-skjult"> {s.tittel}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
