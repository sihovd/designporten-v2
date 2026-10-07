/**
 * Step 1 and 2 of the CSV workflow: read the file and see its columns and
 * rows, choose the master row, then connect each column to what it controls
 * (a text, a decoration, a colour, a colour profile). Nothing is generated.
 */
import { useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument, Objekt, SvgKilde, TekstKilde } from '../../core/dokument';
import { brukBenk } from '../../shell/bruk-benk';
import { fargeplasser, feltNavn, feltObjekter, oppdaterObjekter } from './dokument';
import { feltnavnFraKolonne, lesArbeid, nyeFelt, type Csvarbeid } from './csvflyt';
import { endreArbeid, gaTilSteg, lesInnCsv, tilMaster } from './csvhandlinger';
import { dekodKobling, kodeKobling } from './Csvfelles';
import { erProfilkolonne } from './batch';

const FORHANDS = 6;

// ---------- 1. import ----------

export function ImportSteg({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const a = lesArbeid(t.dok);
  const fil = useRef<HTMLInputElement>(null);
  const [lim, settLim] = useState('');
  const [feil, settFeil] = useState<string | null>(null);
  const [venter, settVenter] = useState<{ tekst: string; kilde: string } | null>(null);
  const nullstiller = !!a && (a.generert.length > 0 || Object.keys(a.overstyringer).length > 0);

  const les = (tekst: string, kilde: string, bekreftet = false) => {
    if (nullstiller && !bekreftet) {
      settVenter({ tekst, kilde });
      return;
    }
    settVenter(null);
    settFeil(lesInnCsv(benk, tekst, kilde));
  };

  return (
    <div class="csv-steginnhold">
      <p class="dempet">
        Hver rad i CSV-filen blir ett skilt, bygget fra en master du tegner selv. Først leser vi filen.
        Ingenting lages før du trykker «Generer».
      </p>

      <div class="knapperad">
        <button type="button" class="sekundar" onClick={() => fil.current?.click()}>
          Velg CSV-fil
        </button>
        {a && <span class="dempet">{a.kilde}</span>}
      </div>
      <input
        ref={fil}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        hidden
        onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          (e.target as HTMLInputElement).value = '';
          if (!f) return;
          if (f.size > 2 * 1024 * 1024) {
            settFeil('CSV-filen er større enn 2 MB.');
            return;
          }
          les(await f.text(), f.name);
        }}
      />
      <label class="felt stablet" for="csv-lim">
        <span>Eller lim inn (første linje er kolonnenavn)</span>
        <textarea
          id="csv-lim"
          rows={4}
          placeholder={'Navn;Rolle;Fargeprofil\nOla Nordmann;Designer;Standard\nKari Nordmann;Leder;Natur'}
          value={lim}
          onInput={(e) => settLim((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <div class="knapperad">
        <button
          type="button"
          class="kontroll-knapp"
          disabled={!lim.trim()}
          onClick={() => les(lim, 'innlimt tekst')}
        >
          Les inn teksten
        </button>
      </div>
      {feil && (
        <p class="merknad" role="alert">
          {feil}
        </p>
      )}
      {venter && (
        <div class="csv-bekreft" role="alertdialog" aria-label="Bytt CSV-fil">
          <p>
            Du har allerede generert skilt eller gitt skilt egne verdier. Leser du inn en ny fil, nullstilles
            utvalget, de genererte skiltene og de egne verdiene. Masteren beholdes.
          </p>
          <div class="knapperad">
            <button
              type="button"
              class="farlig kontroll-knapp"
              onClick={() => les(venter.tekst, venter.kilde, true)}
            >
              Les inn og nullstill
            </button>
            <button type="button" class="kontroll-knapp" onClick={() => settVenter(null)}>
              Behold den gamle
            </button>
          </div>
        </div>
      )}

      {a && <Innlest a={a} benk={benk} />}
    </div>
  );
}

function Innlest({ a, benk }: { a: Csvarbeid; benk: Arbeidsbenk }) {
  return (
    <>
      <h3>Kolonner og rader</h3>
      <p role="status">
        {a.rader.length} rader og {a.kolonner.length} kolonner er lest fra {a.kilde}.
      </p>
      <div class="batch-tabell" tabIndex={0} role="region" aria-label="De første radene i CSV-filen">
        <table>
          <thead>
            <tr>
              <th scope="col">Rad</th>
              {a.kolonner.map((k, i) => (
                <th scope="col" key={i}>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.rader.slice(0, FORHANDS).map((r, i) => (
              <tr key={i} class={i === a.masterRad ? 'master' : ''}>
                <td class="mono">{i + 1}</td>
                {a.kolonner.map((_, j) => (
                  <td key={j}>{r[j]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.rader.length > FORHANDS && (
        <p class="dempet">
          Viser de {FORHANDS} første av {a.rader.length} radene.
        </p>
      )}

      <h3>Masteren</h3>
      <p class="dempet">
        Raden du velger som eksempel legges inn på masteren, så du ser hvordan et skilt ser ut mens du tegner.
        Alle de andre radene bruker samme master.
      </p>
      <label class="felt" for="csv-masterrad">
        <span>Eksempelrad</span>
        <select
          id="csv-masterrad"
          value={a.masterRad}
          onChange={(e) =>
            endreArbeid(benk, 'Velg masterrad', (x) => ({
              ...x,
              masterRad: Number((e.target as HTMLSelectElement).value),
            }))
          }
        >
          {a.rader.map((r, i) => (
            <option key={i} value={i}>
              Rad {i + 1}: {r.find((c) => c.trim()) ?? '(tom)'}
              {i === 0 ? ' (første rad)' : ''}
            </option>
          ))}
        </select>
      </label>
      <div class="knapperad csv-fot">
        <button type="button" class="primar" onClick={() => gaTilSteg(benk, 'koble')}>
          Koble kolonnene →
        </button>
      </div>
    </>
  );
}

// ---------- 2. map the columns ----------

function ledigFeltnavn(dok: Dokument, grunn = 'navn'): string {
  const brukt = new Set(feltObjekter(dok).map((o) => feltNavn(o)));
  if (!brukt.has(grunn)) return grunn;
  let i = 2;
  while (brukt.has(`${grunn}${i}`)) i++;
  return `${grunn}${i}`;
}

/** The texts and decorations on the master, and which of them are fields (a column fills a field). */
function Feltliste({ benk, dok }: { benk: Arbeidsbenk; dok: Dokument }) {
  const felter = Object.values(dok.objekter).filter(
    (o) => o.kilde.type === 'tekst' || o.kilde.type === 'svg',
  );
  const settFelt = (o: Objekt, felt: string | undefined) =>
    benk.endre({
      navn: 'Batchfelt',
      anvend: (d) =>
        oppdaterObjekter(d, [o.id], (x) => ({
          ...x,
          kilde: { ...(x.kilde as TekstKilde | SvgKilde), felt },
        })),
    });
  if (!felter.length)
    return <p class="merknad">Masteren har ingen tekst ennå. Kolonnene lager tekstene for deg.</p>;
  return (
    <ul class="batch-felt">
      {felter.map((o) => {
        const k = o.kilde as TekstKilde | SvgKilde;
        const dekor = k.type === 'svg';
        return (
          <li key={o.id}>
            <span class="batch-felt-tekst">
              {dekor ? `Dekor «${o.navn.slice(0, 30)}»` : `«${(k as TekstKilde).tekst.slice(0, 40)}»`}
            </span>
            {k.felt ? (
              <>
                <span class="mono">felt: {k.felt}</span>
                <button type="button" class="kontroll-knapp" onClick={() => settFelt(o, undefined)}>
                  Fjern felt
                </button>
              </>
            ) : (
              <button
                type="button"
                class="kontroll-knapp"
                onClick={() => settFelt(o, ledigFeltnavn(dok, dekor ? 'dekor' : 'navn'))}
              >
                Gjør til felt
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Valgliste({ dok, a, i }: { dok: Dokument; a: Csvarbeid; i: number }) {
  const felt = feltObjekter(dok);
  const feltnavn = [...new Set(felt.map((o) => feltNavn(o)!))];
  const ny = feltnavnFraKolonne(a.kolonner[i] ?? '');
  const naa = a.kobling[i] ?? { type: 'ingen' as const };
  const kode = kodeKobling(naa);
  const kjente = new Set(['ingen', 'profil', ...feltnavn.map((f) => `felt:${f}`)]);
  const plasser = fargeplasser(dok);
  const erDekor = (f: string) =>
    felt.some((o) => feltNavn(o) === f && o.kilde.type === 'svg') &&
    !felt.some((o) => feltNavn(o) === f && o.kilde.type === 'tekst');
  return (
    <>
      <option value="ingen">Ikke i bruk</option>
      {feltnavn.map((f) => (
        <option key={f} value={`felt:${f}`}>
          {erDekor(f) ? `Dekor i feltet «${f}»` : `Tekst i feltet «${f}»`}
        </option>
      ))}
      {ny && !feltnavn.includes(ny) && <option value={`felt:${ny}`}>Ny tekst på masteren: «{ny}»</option>}
      {plasser.map((p) => (
        <option key={p.id} value={`farge:${p.id}`}>
          Farge på «{p.navn}»
        </option>
      ))}
      <option value="profil">Fargeprofil (navnet på profilen)</option>
      {!kjente.has(kode) && !plasser.some((p) => kode === `farge:${p.id}`) && kode !== `felt:${ny}` && (
        <option value={kode}>Finnes ikke lenger på masteren</option>
      )}
    </>
  );
}

function hjelpFor(a: Csvarbeid, i: number, dok: Dokument): string | null {
  const k = a.kobling[i];
  if (!k) return null;
  if (k.type === 'profil')
    return 'Fargene på masteren byttes mot fargene i profilen, i samme rekkefølge. Profilen må finnes under Fargeprofil.';
  if (k.type === 'farge') return 'Cellen er navnet på et filament, som «Lilla» eller «Svart PETG».';
  if (k.type === 'felt') {
    const finnes = feltObjekter(dok).some((o) => feltNavn(o) === k.felt);
    return finnes ? null : 'Lages som en ny tekst på masteren.';
  }
  return null;
}

export function KobleSteg({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const a = lesArbeid(t.dok);
  const [opptatt, settOpptatt] = useState(false);
  if (!a) return <p class="merknad">Importer en CSV-fil først.</p>;
  const mangler = nyeFelt(t.dok, a.kobling);
  const mapperNoe = a.kobling.some((k) => k.type !== 'ingen');
  const design = a.steg !== 'koble';
  const rad = a.rader[a.masterRad] ?? [];
  const lag = async () => {
    settOpptatt(true);
    try {
      await tilMaster(benk);
    } finally {
      settOpptatt(false);
    }
  };
  return (
    <div class="csv-steginnhold">
      <p class="dempet csv-intro">
        Si hva hver kolonne styrer. En tekstkolonne fyller en tekst på masteren, en fargekolonne gir et lag
        eller et omriss et filament, og en fargeprofilkolonne gir hele skiltet et annet sett filamenter.
      </p>
      <div class="batch-tabell csv-kobletabell" tabIndex={0} role="region" aria-label="Kolonnene i CSV-filen">
        <table>
          <thead>
            <tr>
              <th scope="col">Kolonne</th>
              <th scope="col" class="csv-eksempel">
                Rad {a.masterRad + 1}
              </th>
              <th scope="col">Styrer</th>
            </tr>
          </thead>
          <tbody>
            {a.kolonner.map((k, i) => {
              const hjelp = hjelpFor(a, i, t.dok);
              return (
                <tr key={`${k}-${i}`}>
                  <th scope="row" class="mono">
                    {k}
                    {erProfilkolonne(k) ? (
                      <span class="visuelt-skjult"> (ser ut som en fargeprofil)</span>
                    ) : null}
                  </th>
                  <td>{rad[i]}</td>
                  <td>
                    <select
                      id={`csv-kol-${i}`}
                      aria-label={`Hva kolonnen «${k}» styrer`}
                      value={kodeKobling(a.kobling[i] ?? { type: 'ingen' })}
                      onChange={(e) => {
                        const ny = dekodKobling((e.target as HTMLSelectElement).value);
                        endreArbeid(benk, 'Koble kolonne', (x) => ({
                          ...x,
                          kobling: x.kobling.map((m, j) => (j === i ? ny : m)),
                        }));
                      }}
                    >
                      <Valgliste dok={t.dok} a={a} i={i} />
                    </select>
                    {hjelp && <small class="dempet csv-hjelp">{hjelp}</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Felt på masteren</h3>
      <Feltliste benk={benk} dok={t.dok} />
      {!mapperNoe && <p class="merknad">Koble minst én kolonne for å gå videre.</p>}
      {mangler.length > 0 && (
        <p class="dempet">
          Disse tekstene lages på masteren, med innholdet fra rad {a.masterRad + 1}:{' '}
          {mangler.map((m) => `«${m}»`).join(', ')}.
        </p>
      )}
      <div class="knapperad csv-fot">
        <button type="button" class="sekundar" onClick={() => gaTilSteg(benk, 'importer')}>
          ← Importer
        </button>
        {design && mangler.length === 0 ? (
          <button type="button" class="primar" onClick={() => gaTilSteg(benk, 'master', true)}>
            Tilbake til masteren →
          </button>
        ) : (
          <button type="button" class="primar" disabled={!mapperNoe || opptatt} onClick={() => void lag()}>
            {design ? 'Legg inn manglende felt →' : `Lag masteren fra rad ${a.masterRad + 1} →`}
          </button>
        )}
      </div>
    </div>
  );
}
