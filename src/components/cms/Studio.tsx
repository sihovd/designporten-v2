import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { nettsti, testmiljo } from '@/lib/nettsti';
import { cms, type Bruker, type StudioOversikt } from '@/lib/cms/api';

export type StudioFane =
  | 'oversikt'
  | 'innhold'
  | 'blogg'
  | 'bilder'
  | 'forslag'
  | 'brukere'
  | 'logg'
  | 'kopi'
  | 'drift'
  | 'konto'
  | 'butikk';
const NAVN: Record<StudioFane, string> = {
  oversikt: 'Oversikt',
  innhold: 'Sider og innhold',
  blogg: 'Blogg og inspirasjon',
  bilder: 'Mediebibliotek',
  forslag: 'Forslag til godkjenning',
  brukere: 'Brukere og tilgang',
  logg: 'Aktivitetslogg',
  kopi: 'Sikkerhetskopi',
  drift: 'Drift og sikkerhet',
  konto: 'Kontoen din',
  butikk: 'Butikk og betaling',
};
const dato = (v: string) => new Date(v).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });

export function StudioSkall({
  bruker,
  fane,
  bytt,
  children,
}: {
  bruker: Bruker;
  fane: StudioFane;
  bytt: (f: StudioFane) => void;
  children: ComponentChildren;
}) {
  const [meny, settMeny] = useState(false);
  const grupper: { navn: string; faner: StudioFane[] }[] = [
    { navn: 'Arbeidsrom', faner: ['oversikt', 'innhold', 'blogg', 'bilder', 'forslag'] },
    { navn: 'Butikken', faner: ['butikk'] },
    {
      navn: 'Kontrollrom',
      faner: [
        ...(bruker.rolle === 'admin' ? (['drift', 'kopi', 'brukere'] as StudioFane[]) : []),
        'logg',
        'konto',
      ],
    },
  ];
  function velg(id: StudioFane) {
    bytt(id);
    settMeny(false);
  }
  return (
    <div class="studio">
      <header class="studio__topplinje">
        <a class="studio__logo" href={nettsti('/')} aria-label="Designporten, til nettstedet">
          <img src={nettsti('/brand/designporten-merke.svg')} width="40" height="40" alt="" />
          <span>
            Designporten<small>STUDIO</small>
          </span>
        </a>
        <div class="studio__toppinfo">
          {testmiljo && <strong class="studio__status">Testmiljø</strong>}
          <span>
            Arbeidsrom <span aria-hidden="true"> / </span> <strong>{NAVN[fane]}</strong>
          </span>
          <a href={nettsti('/')} target="_blank" rel="noopener">
            Se nettstedet ↗
          </a>
        </div>
        <button
          type="button"
          class="cms__knapp studio__menyknapp"
          aria-expanded={meny}
          aria-controls="studio-meny"
          onClick={() => settMeny(!meny)}
        >
          {meny ? 'Lukk meny' : 'Meny'}
        </button>
      </header>
      <aside class={`studio__sidemeny ${meny ? 'studio__sidemeny--apen' : ''}`} id="studio-meny">
        <div class="studio__arbeidsrom">
          <span class="studio__monogram">dp</span>
          <div>
            <strong>Mitt kreative verksted</strong>
            <small>designporten.no</small>
          </div>
        </div>
        <nav aria-label="CMS">
          {grupper.map((g) => (
            <div key={g.navn} class="studio__navgruppe">
              <p>{g.navn}</p>
              {g.faner.map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-current={fane === id ? 'page' : undefined}
                  onClick={() => velg(id)}
                >
                  <span aria-hidden="true" class="studio__navmerke">
                    {id === 'oversikt'
                      ? '◈'
                      : id === 'blogg'
                        ? '✎'
                        : id === 'bilder'
                          ? '▧'
                          : id === 'butikk'
                            ? '◇'
                            : '·'}
                  </span>
                  {NAVN[id]}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div class="studio__person">
          <span>
            {bruker.navn
              .split(/\s+/)
              .map((v) => v[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div>
            <strong>{bruker.navn}</strong>
            <small>{bruker.rolle === 'admin' ? 'Administrator' : 'Redaktør'}</small>
          </div>
        </div>
      </aside>
      <div class="studio__arbeidsflate" aria-label={NAVN[fane]}>
        <div class="studio__sidehode">
          <p>Ditt kreative kontrollrom</p>
          <h1>{NAVN[fane]}</h1>
        </div>
        <div class="cms">{children}</div>
        <footer class="studio__fot">Designporten Studio · fra idé til virkelighet</footer>
      </div>
    </div>
  );
}

export function StudioOversiktSide({ bruker, bytt }: { bruker: Bruker; bytt: (f: StudioFane) => void }) {
  const [dager, settDager] = useState(30);
  const [data, settData] = useState<StudioOversikt | null>(null);
  const [feil, settFeil] = useState('');
  const [oppdater, settOppdater] = useState(0);
  const [gjenbygger, settGjenbygger] = useState(false);
  const [gjenbyggFeil, settGjenbyggFeil] = useState('');
  useEffect(() => {
    let aktiv = true;
    settData(null);
    settFeil('');
    cms
      .oversikt(dager)
      .then((d) => {
        if (aktiv) settData(d.oversikt);
      })
      .catch((e) => {
        if (aktiv) settFeil(e instanceof Error ? e.message : 'Kunne ikke hente oversikten.');
      });
    return () => {
      aktiv = false;
    };
  }, [dager, oppdater]);
  if (feil)
    return (
      <div role="alert">
        <p>{feil}</p>
        <button class="cms__knapp" onClick={() => settOppdater((v) => v + 1)}>
          Prøv igjen
        </button>
      </div>
    );
  if (!data) return <p role="status">Henter oversikten fra CMS-databasen …</p>;
  const kart = new Map(data.aktivitet.map((v) => [v.dag, v.antall]));
  const slutt = new Date(data.malt.slice(0, 10) + 'T00:00:00Z');
  const punkter = Array.from({ length: dager }, (_, i) => {
    const d = new Date(slutt);
    d.setUTCDate(d.getUTCDate() - dager + 1 + i);
    const dag = d.toISOString().slice(0, 10);
    return { dag, antall: kart.get(dag) ?? 0 };
  });
  const maks = Math.max(1, ...punkter.map((v) => v.antall));
  const sum = punkter.reduce((s, p) => s + p.antall, 0);
  const linje = punkter
    .map((p, i) => `${(i / (dager - 1)) * 600},${150 - (p.antall / maks) * 130}`)
    .join(' ');
  return (
    <>
      <div class="studio__velkomstlinje">
        <div>
          <h2>Hei, {bruker.navn.split(' ')[0]}. Klar for å skape?</h2>
          <p>Her er pulsen på innholdet ditt. Tallene kommer fra ditt eget CMS.</p>
        </div>
        <label class="studio__periode">
          Periode
          <select value={dager} onChange={(e) => settDager(Number(e.currentTarget.value))}>
            <option value="7">Siste 7 dager</option>
            <option value="30">Siste 30 dager</option>
            <option value="90">Siste 90 dager</option>
          </select>
        </label>
      </div>
      <div class="studio__velkomstrutenett">
        <section class="studio__portal">
          <img src={nettsti('/cms/studio-portal.webp')} width="1200" height="800" alt="" />
          <div>
            <p>Ditt kreative univers</p>
            <h2>
              Gode ideer fortjener
              <br />å bli virkelighet.
            </h2>
            <p>Oppdater en side, del en historie eller finn det rette bildet.</p>
            <button class="cms__knapp" onClick={() => bytt('innhold')}>
              Rediger nettstedet ↗
            </button>
          </div>
          <small>Konseptbilde</small>
        </section>
        <section class="studio__panel">
          <h2>Litt å ta tak i</h2>
          <button class="studio__oppgave" onClick={() => bytt('innhold')}>
            <strong>{data.felt.utkast} sidefelt i utkast</strong>
            <span>Se hva som venter på publisering ↗</span>
          </button>
          <button class="studio__oppgave" onClick={() => bytt('blogg')}>
            <strong>
              {data.innlegg.utkast} {data.innlegg.utkast === 1 ? 'historie' : 'historier'} i arbeid
            </strong>
            <span>Fortsett der du slapp ↗</span>
          </button>
          <button class="studio__oppgave" onClick={() => bytt('forslag')}>
            <strong>{data.forslag} forslag til godkjenning</strong>
            <span>Du bestemmer hva som publiseres ↗</span>
          </button>
        </section>
      </div>
      <div class="studio__tallrutenett">
        {[
          ['Publiserte sidefelt', data.felt.publisert, `av ${data.felt.totalt} redigerbare felt`],
          ['Publiserte historier', data.innlegg.publisert, `${data.innlegg.totalt} innlegg totalt`],
          ['Bilder i biblioteket', data.medier, 'aktive bilder, uten arkiverte'],
          ['CMS-hendelser', sum, `registrert siste ${dager} dager`],
        ].map(([navn, tall, forklaring]) => (
          <section class="studio__panel studio__tall" key={navn}>
            <h2>{navn}</h2>
            <strong>{tall}</strong>
            <p>{forklaring}</p>
          </section>
        ))}
      </div>
      <div class="studio__toruter">
        <section class="studio__panel">
          <h2>Det skjer i verkstedet</h2>
          <p class="studio__dempet">Registrert CMS-aktivitet · {dager} dager · UTC</p>
          <svg
            class="studio__kurve"
            viewBox="0 0 600 170"
            role="img"
            aria-label={`${sum} CMS-hendelser siste ${dager} dager. Detaljer finnes i tabellen nedenfor.`}
          >
            <path d="M0 20H600 M0 85H600 M0 150H600" fill="none" stroke="currentColor" opacity=".1" />
            <polyline
              points={linje}
              fill="none"
              stroke="#883dff"
              stroke-width="3"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="studio__grafinfo">
            <span>{punkter[0]?.dag}</span>
            <span>0–{maks} hendelser per dag</span>
            <span>{punkter.at(-1)?.dag}</span>
          </div>
          <details>
            <summary>Se tallene bak kurven</summary>
            <div class="studio__tabellramme">
              <table>
                <caption>CMS-hendelser per dag (UTC)</caption>
                <thead>
                  <tr>
                    <th>Dato</th>
                    <th>Antall</th>
                  </tr>
                </thead>
                <tbody>
                  {punkter.map((p) => (
                    <tr key={p.dag}>
                      <td>{p.dag}</td>
                      <td>{p.antall}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section class="studio__panel">
          <h2>Siste aktivitet</h2>
          {data.hendelser.length ? (
            <ol class="studio__aktiviteter">
              {data.hendelser.slice(0, 5).map((h) => (
                <li key={h.id}>
                  <strong>{h.handling.replaceAll('.', ' › ')}</strong>
                  <time dateTime={h.tid}>{dato(h.tid)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p>Ingen aktivitet i perioden ennå.</p>
          )}
          <button class="cms__lenkeknapp" onClick={() => bytt('logg')}>
            Åpne aktivitetsloggen
          </button>
        </section>
      </div>
      <div class="studio__toruter">
        <section class="studio__panel">
          <h2>Et trygt verksted i bakgrunnen</h2>
          {data.teknisk ? (
            <>
              <dl class="studio__fakta">
                <div>
                  <dt>Database</dt>
                  <dd>Kontakt bekreftet</dd>
                </div>
                <div>
                  <dt>Innholdsmappe</dt>
                  <dd>{data.teknisk.dataSkrivbar ? 'Kan lagre filer' : 'Kan ikke lagre – se Drift'}</dd>
                </div>
                <div>
                  <dt>Publiserte sidetekster</dt>
                  <dd>
                    {data.teknisk.publisert ? 'Offentlig visning er klar' : 'Ingen publisert visning ennå'}
                  </dd>
                </div>
              </dl>
              {!data.teknisk.publisert && data.felt.publisert > 0 && (
                <div class="cms__melding" role="alert">
                  <p>Publiserte tekster finnes i databasen, men filen som viser dem på nettsiden mangler.</p>
                  <button
                    class="cms__knapp"
                    disabled={gjenbygger}
                    onClick={async () => {
                      settGjenbygger(true);
                      settGjenbyggFeil('');
                      try {
                        await cms.gjenbyggVisning();
                        settOppdater((v) => v + 1);
                      } catch (e) {
                        settGjenbyggFeil(
                          e instanceof Error ? e.message : 'Kunne ikke gjenopprette visningen.',
                        );
                      } finally {
                        settGjenbygger(false);
                      }
                    }}
                  >
                    {gjenbygger ? 'Gjenoppretter …' : 'Gjenopprett publisert visning'}
                  </button>
                  {gjenbyggFeil && <p role="alert">{gjenbyggFeil}</p>}
                </div>
              )}
              <button class="cms__lenkeknapp" onClick={() => bytt('drift')}>
                Åpne driftskontroll
              </button>
            </>
          ) : (
            <p>Tekniske kontroller er tilgjengelige for administrator.</p>
          )}
          <p class="studio__kildetekst">Øyeblikkskontroll, ikke historisk oppetidsmåling.</p>
        </section>
        <section class="studio__panel">
          <h2>Statistikk med tydelig kilde</h2>
          <dl class="studio__fakta">
            <div>
              <dt>Besøk og konvertering</dt>
              <dd>Ikke tilkoblet</dd>
            </div>
            <div>
              <dt>Salg og ordre</dt>
              <dd>Ikke tilkoblet</dd>
            </div>
            <div>
              <dt>Overvåket sikkerhetskopi</dt>
              <dd>Ikke tilkoblet</dd>
            </div>
          </dl>
          <p class="studio__dempet">
            Disse tallene vises først når en reell datakilde er integrert. Innholdsaktivitet er ikke
            besøkstall eller omsetning.
          </p>
        </section>
      </div>
      <p class="studio__kildetekst">
        Kilde: {data.kilde}. Hentet {dato(data.malt)}. Null betyr ingen registrerte hendelser; «ikke
        tilkoblet» betyr at datakilden mangler.
      </p>
    </>
  );
}

export function StudioButikk() {
  return (
    <section class="studio__panel">
      <h2>Butikken bygges videre i egne moduler</h2>
      <p>
        Produktinnholdet ligger fortsatt i den eksisterende produktadministrasjonen. Denne Studio-leveransen
        flytter ikke varer, lager eller ordre til en ny handelsmotor.
      </p>
      <a class="cms__knapp cms__knapp--primar" href={nettsti('/admin/')} target="_blank" rel="noopener">
        Åpne eksisterende produktadministrasjon ↗
      </a>
      <p class="studio__dempet">
        Den bruker GitHub-innlogging. Vipps, Stripe, ordrestyring og lager er ikke koblet til Studio ennå.
        Ingen reelle betalinger kan aktiveres fra denne siden.
      </p>
    </section>
  );
}
