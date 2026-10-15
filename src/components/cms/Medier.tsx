/**
 * The media library and the server check in /cms/ (CmsPanel.tsx). Pictures
 * are uploaded here or straight from the page («Bytt bilde»); they are
 * archived, never deleted, so published pages and old versions keep them.
 */
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { cms, type Drift, type Medium } from '@/lib/cms/api';
import { cmsEtikett } from '@/lib/cms/etiketter';

const feiltekst = (e: unknown) => (e instanceof Error ? e.message : 'Noe gikk galt.');

export const mb = (bytes: number) =>
  bytes < 0
    ? 'ingen grense'
    : `${(bytes / 1024 / 1024).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} MB`;

function Melding({ tekst, feil }: { tekst: string; feil?: boolean }) {
  return (
    <p class={feil ? 'cms__melding cms__melding--feil' : 'cms__melding'} role={feil ? 'alert' : 'status'}>
      {tekst}
    </p>
  );
}

function bruktTekst(m: Medium): string {
  const bruk = m.bruktPa ?? [];
  if (!bruk.length) return 'Ikke i bruk på sidene.';
  return `Brukt på: ${bruk
    .map((b) => {
      const navn = cmsEtikett(b.nokkel);
      const hvor = b.publisert ? (b.utkast ? 'publisert og utkast' : 'publisert') : 'utkast';
      return `${navn ? `${navn.side} › ${navn.felt}` : b.nokkel} (${hvor})`;
    })
    .join(', ')}.`;
}

function Bildekort({ m, endret }: { m: Medium; endret: (m: Medium) => void }) {
  const [apen, settApen] = useState(false);
  const [navn, settNavn] = useState(m.navn);
  const [alt, settAlt] = useState(m.alt);
  const [konsept, settKonsept] = useState(m.konsept);
  const [rettigheter, settRettigheter] = useState(m.rettigheter ?? '');
  const [melding, settMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);

  async function lagre(e: JSX.TargetedEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const { medium } = await cms.medium({ id: m.id, navn, alt, konsept, rettigheter });
      endret(medium);
      settMelding({ tekst: 'Lagret.' });
      settApen(false);
    } catch (f) {
      settMelding({ tekst: feiltekst(f), feil: true });
    }
  }

  async function arkiver(arkivert: boolean) {
    try {
      endret((await cms.medium({ id: m.id, arkivert })).medium);
    } catch (f) {
      settMelding({ tekst: feiltekst(f), feil: true });
    }
  }

  const id = `medium-${m.id}`;
  return (
    <li class="cms__bilde">
      <img
        src={m.miniatyr}
        alt=""
        width={240}
        height={Math.round((240 * m.hoyde) / m.bredde)}
        loading="lazy"
      />
      <div class="cms__bildetekst">
        <p id={id} class="cms__feltnavn">
          {m.navn}
          {m.konsept && <span class="cms__merke cms__merke--utkast">Konseptbilde</span>}
        </p>
        <p class="cms__dempet cms__liten">
          {m.originalBredde} × {m.originalHoyde} px · {mb(m.storrelse)}
        </p>
        {m.alt && <p class="cms__liten">Alt-tekst: {m.alt}</p>}
        <p class="cms__liten">{bruktTekst(m)}</p>
        <div class="cms__knapper">
          <button
            type="button"
            class="cms__lenkeknapp"
            aria-expanded={apen}
            aria-describedby={id}
            onClick={() => settApen(!apen)}
          >
            Endre
          </button>
          {m.status === 'aktiv' ? (
            <button
              type="button"
              class="cms__lenkeknapp"
              aria-describedby={id}
              onClick={() => void arkiver(true)}
            >
              Arkiver
            </button>
          ) : (
            <button
              type="button"
              class="cms__lenkeknapp"
              aria-describedby={id}
              onClick={() => void arkiver(false)}
            >
              Hent fram igjen
            </button>
          )}
        </div>
        {apen && (
          <form class="cms__bildeskjema" onSubmit={lagre}>
            <label class="cms__felt">
              <span>Navn</span>
              <input value={navn} required onInput={(e) => settNavn((e.target as HTMLInputElement).value)} />
            </label>
            <label class="cms__felt">
              <span>Hva viser bildet? (standard alt-tekst)</span>
              <textarea
                rows={2}
                value={alt}
                onInput={(e) => settAlt((e.target as HTMLTextAreaElement).value)}
              />
            </label>
            <label class="cms__felt">
              <span>Rettigheter og opphav</span>
              <input
                value={rettigheter}
                placeholder="For eksempel: eget foto, Sivert, 2026"
                onInput={(e) => settRettigheter((e.target as HTMLInputElement).value)}
              />
            </label>
            <label class="cms__avkryss">
              <input
                type="checkbox"
                checked={konsept}
                onChange={(e) => settKonsept((e.target as HTMLInputElement).checked)}
              />
              Konseptbilde (laget med KI; merkes «Konseptbilde» på siden)
            </label>
            <div class="cms__knapper">
              <button type="submit" class="cms__knapp cms__knapp--primar">
                Lagre
              </button>
              <button type="button" class="cms__knapp" onClick={() => settApen(false)}>
                Avbryt
              </button>
            </div>
          </form>
        )}
        {melding && <Melding {...melding} />}
      </div>
    </li>
  );
}

export function Medier() {
  const [medier, settMedier] = useState<Medium[] | null>(null);
  const [arkiverte, settArkiverte] = useState(false);
  const [maks, settMaks] = useState(0);
  const [sok, settSok] = useState('');
  const [laster, settLaster] = useState<{ navn: string; andel: number } | null>(null);
  const [melding, settMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);

  useEffect(() => {
    settMedier(null);
    cms
      .medier(arkiverte)
      .then((d) => {
        settMedier(d.medier);
        settMaks(d.maksOpplasting);
        if (!d.kanLageBilder)
          settMelding({
            tekst: 'Serveren mangler bildebehandling (GD), så bilder kan ikke lastes opp ennå.',
            feil: true,
          });
      })
      .catch((e) => settMelding({ tekst: feiltekst(e), feil: true }));
  }, [arkiverte]);

  async function lastOpp(e: JSX.TargetedEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const filer = [...(input.files ?? [])];
    input.value = '';
    const feil: string[] = [];
    let ok = 0;
    for (const f of filer) {
      settLaster({ navn: f.name, andel: 0 });
      try {
        const { medium, gjentatt } = await cms.lastOpp(f, (andel) => settLaster({ navn: f.name, andel }));
        if (gjentatt) feil.push(`${f.name} finnes allerede i biblioteket.`);
        else ok++;
        if (!arkiverte) settMedier((gamle) => [medium, ...(gamle ?? []).filter((x) => x.id !== medium.id)]);
      } catch (f2) {
        feil.push(`${f.name}: ${feiltekst(f2)}`);
      }
    }
    settLaster(null);
    settMelding({
      tekst: [ok ? `${ok} ${ok === 1 ? 'bilde' : 'bilder'} lastet opp.` : '', ...feil]
        .filter(Boolean)
        .join(' '),
      feil: feil.some((f) => !f.includes('finnes allerede')),
    });
  }

  const endret = (m: Medium) =>
    settMedier((gamle) =>
      (gamle ?? []).flatMap((x) =>
        x.id !== m.id ? [x] : (m.status === 'arkivert') === arkiverte ? [m] : [],
      ),
    );

  const ord = sok.trim().toLowerCase();
  const synlige = (medier ?? []).filter((m) => !ord || `${m.navn} ${m.alt}`.toLowerCase().includes(ord));

  return (
    <section aria-labelledby="cms-bilder">
      <h2 id="cms-bilder">Bilder</h2>
      <p class="cms__ingress">
        Last opp bilder her, eller bytt et bilde rett på siden med «Rediger innhold». JPEG, PNG og WebP,
        opptil {mb(maks)} per bilde. Serveren lager mindre versjoner og fjerner posisjon og annen
        kamerainformasjon fra bildene som vises. Arkiverte bilder forsvinner fra lista, men sider som bruker
        dem viser dem fortsatt.
      </p>
      <div class="cms__verktoy">
        <input
          id="cms-last-opp"
          class="cms__fil"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={lastOpp}
        />
        <label for="cms-last-opp" class="cms__knapp cms__knapp--primar">
          Last opp bilder
        </label>
        <label class="cms__felt cms__felt--sok">
          <span>Søk i bildene</span>
          <input type="search" value={sok} onInput={(e) => settSok((e.target as HTMLInputElement).value)} />
        </label>
        <label class="cms__avkryss">
          <input
            type="checkbox"
            checked={arkiverte}
            onChange={(e) => settArkiverte((e.target as HTMLInputElement).checked)}
          />
          Vis arkiverte
        </label>
      </div>
      {laster && (
        <p class="cms__melding" role="status">
          Laster opp {laster.navn} …{' '}
          <progress max={1} value={laster.andel} aria-label={`Opplasting av ${laster.navn}`} />
        </p>
      )}
      {melding && <Melding {...melding} />}
      {!medier ? (
        <p class="cms__dempet">Henter bildene …</p>
      ) : synlige.length === 0 ? (
        <p class="cms__dempet">
          {medier.length
            ? 'Ingen bilder passer søket.'
            : arkiverte
              ? 'Ingen arkiverte bilder.'
              : 'Ingen bilder ennå.'}
        </p>
      ) : (
        <ul class="cms__bilder">
          {synlige.map((m) => (
            <Bildekort key={`${m.id}-${m.status}`} m={m} endret={endret} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------ Server check

export function DriftStatus() {
  const [drift, settDrift] = useState<Drift | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  useEffect(() => {
    cms
      .drift()
      .then((d) => settDrift(d.drift))
      .catch((e) => settFeil(feiltekst(e)));
  }, []);
  if (feil) return <Melding tekst={feil} feil />;
  if (!drift) return <p class="cms__dempet">Sjekker serveren …</p>;

  const rader: [string, string, boolean | null][] = [
    ['PHP', drift.php, Number(drift.php.split('.')[0]) >= 8],
    [
      'Database',
      drift.database.ok ? `${drift.database.driver} ${drift.database.versjon ?? ''}` : 'Får ikke kontakt',
      drift.database.ok,
    ],
    ['Bildebehandling (GD)', drift.gd ? (drift.gdVersjon ?? 'ja') : 'Mangler', drift.gd],
    ['WebP', drift.webp ? 'Ja' : 'Nei (bruker JPEG)', drift.webp],
    ['AVIF', drift.avif ? 'Ja' : 'Nei', null],
    ['Imagick', drift.imagick ? 'Ja' : 'Nei', null],
    ['Bildeorientering (EXIF)', drift.exif ? 'Ja' : 'Nei (bilder fra mobil kan komme på siden)', drift.exif],
    ['Filtypekontroll (fileinfo)', drift.fileinfo ? 'Ja' : 'Nei', drift.fileinfo],
    ['Utgående HTTPS (curl)', drift.curl ? 'Ja' : 'Nei', drift.curl],
    ['Største opplasting', mb(drift.maksOpplasting), drift.maksOpplasting >= 8 * 1024 * 1024],
    ['upload_max_filesize', mb(drift.uploadMaxFilesize), null],
    ['post_max_size', mb(drift.postMaxSize), null],
    ['Minne for PHP', mb(drift.memoryLimit), drift.memoryLimit < 0 || drift.memoryLimit >= 128 * 1024 * 1024],
    ['Maks kjøretid', drift.maxExecutionTime ? `${drift.maxExecutionTime} sekunder` : 'ingen grense', null],
    ['Ledig plass', drift.ledigPlass === null ? 'Ukjent' : mb(drift.ledigPlass), null],
    ['Datamappen er skrivbar', drift.dataSkrivbar ? 'Ja' : 'Nei', drift.dataSkrivbar],
    ['Bildemappen er skrivbar', drift.medierSkrivbar ? 'Ja' : 'Nei', drift.medierSkrivbar],
    ['HTTPS', drift.https ? 'Ja' : 'Nei', drift.https],
    ['Webserver', drift.server || 'Ukjent', null],
    ['Noe er publisert fra CMS-et', drift.publisert ? 'Ja' : 'Nei ennå', null],
    ['Bilder i biblioteket', String(drift.antallMedier), null],
  ];
  return (
    <section aria-labelledby="cms-drift">
      <h2 id="cms-drift">Drift</h2>
      <p class="cms__ingress">
        Hva webhotellet støtter. Ingen passord eller nøkler vises her. Ta gjerne et skjermbilde og send det
        til utvikleren når noe er merket «Mangler».
      </p>
      <div class="cms__tabell cms__tabell--drift">
        <table>
          <thead>
            <tr>
              <th scope="col">Hva</th>
              <th scope="col">Status</th>
              <th scope="col">Vurdering</th>
            </tr>
          </thead>
          <tbody>
            {rader.map(([hva, status, ok]) => (
              <tr key={hva}>
                <th scope="row">{hva}</th>
                <td>{status}</td>
                <td>{ok === null ? 'Til informasjon' : ok ? 'OK' : 'Mangler'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
