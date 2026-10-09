/**
 * Step 1 and 2 of the CSV workflow: read the file and see its columns and
 * rows, choose the master row, then connect each column to what it controls
 * (a text, a decoration, a colour, a colour profile). Nothing is generated.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument, Objekt, SvgKilde, TekstKilde } from '../../core/dokument';
import { brukBenk } from '../../shell/bruk-benk';
import { Segment } from '../../shell/kontroller';
import { fargeplasser, feltNavn, feltObjekter, oppdaterObjekter } from './dokument';
import {
  antallOverstyringer,
  dekornavn,
  feltnavnFraKolonne,
  fjernEgenKolonne,
  inverter,
  leggTilEgenKolonne,
  lesArbeid,
  nyeFeltFor,
  sett,
  settCelle,
  settKolonne,
  synligeRader,
  velgKolonner,
  velgOmrade,
  type Csvarbeid,
  type Egenkolonne,
  type Radvisning,
} from './csvflyt';
import { endreArbeid, gaTilSteg, lesInnCsv, tilMaster } from './csvhandlinger';
import { dekodKobling, kodeKobling } from './Csvfelles';
import { alleProfiler, erProfilkolonne } from './batch';

const VISNINGER: { id: Radvisning; navn: string }[] = [
  { id: 'alle', navn: 'Alle' },
  { id: 'valgte', navn: 'Valgte' },
  { id: 'ikke-valgte', navn: 'Ikke valgte' },
];

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

const RADER_PER_SIDE = 100;

/**
 * The table of the file: every cell can be changed, a box on each column heading takes the column
 * forward (or leaves it out), and a box on each row does the same for the row. Only what is ticked
 * goes on to Koble and the signs (Sivert, 2026-10-08, §11).
 */
function Innlest({ a, benk }: { a: Csvarbeid; benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const [sok, settSok] = useState('');
  const [visning, settVisning] = useState<Radvisning>('alle');
  const [antall, settAntall] = useState(RADER_PER_SIDE);
  const [redigerer, settRedigerer] = useState<{ rad: number; kol: number } | null>(null);
  const anker = useRef<number | null>(null);
  const alleRader = useRef<HTMLInputElement>(null);
  const alleKol = useRef<HTMLInputElement>(null);

  const valgte = useMemo(() => new Set(a.valgte), [a.valgte]);
  const kolonnerMed = useMemo(() => new Set(a.valgteKolonner), [a.valgteKolonner]);
  const vises = useMemo(() => synligeRader(a, { sok, visning }, valgte), [a, sok, visning, valgte]);
  const antallValgteSynlige = vises.filter((i) => valgte.has(i)).length;
  useEffect(() => {
    if (alleRader.current)
      alleRader.current.indeterminate = antallValgteSynlige > 0 && antallValgteSynlige < vises.length;
  }, [antallValgteSynlige, vises.length]);
  useEffect(() => {
    if (alleKol.current)
      alleKol.current.indeterminate = kolonnerMed.size > 0 && kolonnerMed.size < a.kolonner.length;
  }, [kolonnerMed.size, a.kolonner.length]);

  const sattValgte = (liste: number[]) =>
    endreArbeid(benk, 'Velg rader', (x) => ({ ...x, valgte: liste }), 'csv-rader');
  const velgKol = (kolonner: number[], paa: boolean) =>
    endreArbeid(benk, 'Velg kolonner', (x) => velgKolonner(x, t.dok, kolonner, paa));

  const klikk = (i: number, e: MouseEvent) => {
    const paa = (e.target as HTMLInputElement).checked;
    if (e.shiftKey && anker.current !== null) sattValgte(velgOmrade(valgte, vises, anker.current, i, paa));
    else sattValgte(sett(valgte, [i], paa));
    anker.current = i;
  };

  const synlige = vises.slice(0, antall);
  const forstNavn = (r: string[]) =>
    r.find((c, j) => kolonnerMed.has(j) && c.trim()) ?? r.find((c) => c.trim()) ?? 'tom';
  const endreCelle = (rad: number, kol: number, verdi: string) => {
    if ((a.rader[rad]?.[kol] ?? '') !== verdi)
      endreArbeid(benk, 'Endre celle', (x) => settCelle(x, rad, kol, verdi), 'csv-celle');
  };

  return (
    <>
      <h3>Velg kolonner og rader</h3>
      <p role="status">
        {a.rader.length} rader og {a.kolonner.length} kolonner er lest fra {a.kilde}.
      </p>
      <p class="dempet">
        Kryss av kolonnene og radene som skal være med videre. Klikk på en celle for å rette den. Skift-klikk
        velger et område av rader.
      </p>
      <div class="csv-verktoylinje">
        <label class="felt" for="csv-sok">
          <span>Søk i radene</span>
          <input
            id="csv-sok"
            type="search"
            value={sok}
            placeholder="Navn, rolle, profil …"
            onInput={(e) => {
              settSok((e.target as HTMLInputElement).value);
              settAntall(RADER_PER_SIDE);
            }}
          />
        </label>
        <div class="felt">
          <span>Vis</span>
          <Segment
            etikett="Vis rader"
            valg={VISNINGER}
            verdi={visning}
            endre={(v) => {
              settVisning(v);
              settAntall(RADER_PER_SIDE);
            }}
          />
        </div>
      </div>
      <div class="knapperad csv-valgknapper">
        <button type="button" class="kontroll-knapp" onClick={() => sattValgte(sett(valgte, vises, true))}>
          Velg alle
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => sattValgte(sett(valgte, vises, false))}>
          Velg ingen
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => sattValgte(inverter(valgte, vises))}>
          Snu utvalget
        </button>
        <span class="dempet" role="status">
          {a.valgte.length} av {a.rader.length} rader valgt · {kolonnerMed.size} av {a.kolonner.length}{' '}
          kolonner med · viser {vises.length}
        </span>
      </div>

      <div class="batch-tabell csv-radtabell" tabIndex={0} role="region" aria-label="Radene i CSV-filen">
        <table>
          <thead>
            <tr>
              <th scope="col" class="csv-velg">
                <input
                  ref={alleRader}
                  type="checkbox"
                  aria-label="Velg alle radene du ser"
                  checked={vises.length > 0 && antallValgteSynlige === vises.length}
                  disabled={vises.length === 0}
                  onClick={(e) => sattValgte(sett(valgte, vises, (e.target as HTMLInputElement).checked))}
                />
              </th>
              <th scope="col">Rad</th>
              {a.kolonner.map((k, i) => (
                <th scope="col" key={i} class={kolonnerMed.has(i) ? '' : 'av'}>
                  <label class="csv-kolonnehode">
                    <input
                      type="checkbox"
                      aria-label={`Ta med kolonnen ${k}`}
                      checked={kolonnerMed.has(i)}
                      onChange={(e) => velgKol([i], (e.target as HTMLInputElement).checked)}
                    />
                    <span>{k}</span>
                  </label>
                </th>
              ))}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {synlige.map((i) => {
              const r = a.rader[i]!;
              const status = [
                a.generert.includes(i) ? 'Generert' : '',
                antallOverstyringer(a, i) ? `${antallOverstyringer(a, i)} egne verdier` : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <tr key={i} class={valgte.has(i) ? 'valgt' : ''}>
                  <td class="csv-velg">
                    <input
                      type="checkbox"
                      aria-label={`Velg rad ${i + 1}: ${forstNavn(r)}`}
                      checked={valgte.has(i)}
                      onClick={(e) => klikk(i, e as unknown as MouseEvent)}
                    />
                  </td>
                  <td class="mono">{i + 1}</td>
                  {a.kolonner.map((k, j) => {
                    const verdi = r[j] ?? '';
                    const na = redigerer?.rad === i && redigerer.kol === j;
                    return (
                      <td key={j} class={`csv-celle${kolonnerMed.has(j) ? '' : ' av'}`}>
                        {na ? (
                          <input
                            class="csv-celleinput"
                            aria-label={`${k}, rad ${i + 1}`}
                            defaultValue={verdi}
                            ref={(el) => el?.focus()}
                            onBlur={(e) => {
                              endreCelle(i, j, (e.target as HTMLInputElement).value);
                              settRedigerer(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                settRedigerer(null);
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            class="csv-cellevisning"
                            aria-label={`Rett ${k}, rad ${i + 1}: ${verdi || 'tom'}`}
                            onClick={() => settRedigerer({ rad: i, kol: j })}
                          >
                            {verdi || <span class="dempet">(tom)</span>}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {vises.length === 0 && <p class="merknad">Ingen rader passer med søket og filteret.</p>}
      </div>
      {vises.length > antall && (
        <div class="knapperad">
          <button type="button" class="kontroll-knapp" onClick={() => settAntall(antall + RADER_PER_SIDE)}>
            Vis {Math.min(RADER_PER_SIDE, vises.length - antall)} rader til
          </button>
          <span class="dempet">
            Viser {antall} av {vises.length} rader.
          </span>
        </div>
      )}
      <div class="knapperad">
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() =>
            velgKol(
              a.kolonner.map((_, i) => i),
              kolonnerMed.size < a.kolonner.length,
            )
          }
        >
          {kolonnerMed.size < a.kolonner.length ? 'Ta med alle kolonnene' : 'Ta ikke med noen kolonner'}
        </button>
      </div>

      <div class="knapperad csv-fot">
        <button
          type="button"
          class="primar"
          disabled={a.valgte.length === 0 || kolonnerMed.size === 0}
          onClick={() => gaTilSteg(benk, 'koble')}
        >
          Koble kolonnene →
        </button>
      </div>
      {(a.valgte.length === 0 || kolonnerMed.size === 0) && (
        <p class="merknad">Velg minst én kolonne og én rad for å gå videre.</p>
      )}
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
      {ny && !feltnavn.includes(ny) && (
        <option value={`felt:${ny}`}>
          {a.egne[i] === 'dekor' ? `Nytt dekorfelt på masteren: «${ny}»` : `Ny tekst på masteren: «${ny}»`}
        </option>
      )}
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
    if (finnes) return null;
    return a.egne[i] === 'dekor'
      ? 'Masteren får ett dekor fra raden du velger, og de andre radene bytter det ut med sitt eget.'
      : 'Lages som en ny tekst på masteren.';
  }
  return null;
}

/** Add a column of our own: a decoration or a colour profile per row. */
function NyKolonne({ benk, lukk }: { benk: Arbeidsbenk; lukk: () => void }) {
  const [navn, settNavn] = useState('');
  const [type, settType] = useState<Egenkolonne>('dekor');
  const legg = (e: Event) => {
    e.preventDefault();
    const standard = type === 'dekor' ? 'Dekor' : 'Fargeprofil';
    endreArbeid(benk, 'Ny kolonne', (x) => leggTilEgenKolonne(x, navn || standard, type));
    benk.melde(
      `Kolonnen «${navn || standard}» er lagt til. Velg ${type === 'dekor' ? 'dekor' : 'fargeprofil'} for hver rad under.`,
    );
    lukk();
  };
  return (
    <form class="csv-nykolonne" aria-label="Ny egendefinert kolonne" onSubmit={legg}>
      <div class="felt">
        <span>Hva skal kolonnen styre?</span>
        <Segment
          etikett="Type kolonne"
          valg={[
            { id: 'dekor', navn: 'Dekor' },
            { id: 'profil', navn: 'Fargeprofil' },
          ]}
          verdi={type}
          endre={settType}
        />
      </div>
      <label class="felt" for="csv-nykol-navn">
        <span>Navn på kolonnen</span>
        <input
          id="csv-nykol-navn"
          type="text"
          value={navn}
          placeholder={type === 'dekor' ? 'Dekor' : 'Fargeprofil'}
          onInput={(e) => settNavn((e.target as HTMLInputElement).value)}
        />
      </label>
      <p class="dempet csv-hjelp">
        {type === 'dekor'
          ? 'Hver rad får sitt eget dekor fra dekorgalleriet, for eksempel katt, hund eller rakett. Masteren får ett dekor som de andre bytter plass med.'
          : 'Hver rad får sin egen fargeprofil. Farge 1 i profilen tar plassen til farge 1 på masteren, farge 2 til farge 2, og så videre.'}
      </p>
      <div class="knapperad">
        <button type="submit" class="primar">
          Legg til kolonnen
        </button>
        <button type="button" class="kontroll-knapp" onClick={lukk}>
          Avbryt
        </button>
      </div>
    </form>
  );
}

/** One value per chosen row for each column of our own: a decoration from the gallery or a colour profile. */
function Verdiertabell({ benk, a, kolonner }: { benk: Arbeidsbenk; a: Csvarbeid; kolonner: number[] }) {
  const [antall, settAntall] = useState(RADER_PER_SIDE);
  const profiler = useMemo(() => alleProfiler(), []);
  const dekor = useMemo(() => dekornavn(), []);
  const rader = a.valgte;
  const valgFor = (kol: number) => (a.egne[kol] === 'dekor' ? dekor : profiler.map((p) => p.navn));
  const tomtNavn = (kol: number) => (a.egne[kol] === 'dekor' ? 'Ingen dekor' : 'Ingen profil (som masteren)');
  const celle = (kol: number, rad: number) => {
    const v = a.rader[rad]?.[kol] ?? '';
    const liste = valgFor(kol);
    // a value from the file that is not in the list is kept and shown as it is
    return v && !liste.some((x) => x.toLowerCase() === v.toLowerCase()) ? [...liste, v] : liste;
  };
  const sattCelle = (rad: number, kol: number, v: string) =>
    endreArbeid(benk, 'Velg verdi for rad', (x) => settCelle(x, rad, kol, v), `csv-celle-${rad}-${kol}`);
  const synlige = rader.slice(0, antall);
  return (
    <>
      <h3>Verdier per rad</h3>
      <p class="dempet">
        Velg for hver rad. Med «Alle valgte rader» setter du samme verdi på alle først, og endrer unntakene
        etterpå. Verdiene gjelder bare radene; masteren blir ikke endret.
      </p>
      <div
        class="batch-tabell csv-verdier"
        tabIndex={0}
        role="region"
        aria-label="Dekor og fargeprofil per rad"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Rad</th>
              {kolonner.map((k) => (
                <th scope="col" key={k}>
                  {a.kolonner[k]}
                </th>
              ))}
            </tr>
            <tr class="csv-alle-rad">
              <th scope="row">Alle valgte rader</th>
              {kolonner.map((k) => (
                <td key={k}>
                  <select
                    aria-label={`Sett ${a.kolonner[k]} for alle valgte rader`}
                    value=""
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (!v) return;
                      endreArbeid(benk, 'Sett verdi for alle rader', (x) =>
                        settKolonne(x, k, v === '__ingen' ? '' : v, x.valgte),
                      );
                    }}
                  >
                    <option value="">Velg …</option>
                    <option value="__ingen">{tomtNavn(k)}</option>
                    {valgFor(k).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {synlige.map((r) => (
              <tr key={r}>
                <th scope="row">
                  <span class="mono">{r + 1}</span>{' '}
                  {a.rader[r]?.find((c, j) => a.valgteKolonner.includes(j) && !a.egne[j] && c.trim()) ?? ''}
                </th>
                {kolonner.map((k) => (
                  <td key={k}>
                    <select
                      aria-label={`${a.kolonner[k]} for rad ${r + 1}`}
                      value={a.rader[r]?.[k] ?? ''}
                      onChange={(e) => sattCelle(r, k, (e.target as HTMLSelectElement).value)}
                    >
                      <option value="">{tomtNavn(k)}</option>
                      {celle(k, r).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rader.length > antall && (
        <div class="knapperad">
          <button type="button" class="kontroll-knapp" onClick={() => settAntall(antall + RADER_PER_SIDE)}>
            Vis flere rader
          </button>
          <span class="dempet">
            Viser {antall} av {rader.length} rader.
          </span>
        </div>
      )}
    </>
  );
}

export function KobleSteg({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const a = lesArbeid(t.dok);
  const [opptatt, settOpptatt] = useState(false);
  const [ny, settNy] = useState(false);
  if (!a) return <p class="merknad">Importer en CSV-fil først.</p>;
  const mangler = nyeFeltFor(t.dok, a);
  const mapperNoe = a.kobling.some((k) => k.type !== 'ingen');
  const design = a.steg !== 'koble';
  const rad = a.rader[a.masterRad] ?? [];
  const kolonner = a.valgteKolonner;
  const egneKolonner = kolonner.filter((i) => a.egne[i]);
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
        Si hva hver kolonne styrer. Det gjelder automatisk alle radene du valgte. En tekstkolonne fyller en
        tekst på masteren, en fargekolonne gir et lag eller et omriss et filament, og en fargeprofilkolonne
        gir hele skiltet et annet sett filamenter.
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
            {kolonner.map((i) => {
              const k = a.kolonner[i] ?? '';
              const hjelp = hjelpFor(a, i, t.dok);
              return (
                <tr key={`${k}-${i}`}>
                  <th scope="row" class="mono">
                    {k}
                    {erProfilkolonne(k) ? (
                      <span class="visuelt-skjult"> (ser ut som en fargeprofil)</span>
                    ) : null}
                    {a.egne[i] && <span class="csv-merke"> egen</span>}
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
                    {a.egne[i] && (
                      <button
                        type="button"
                        class="kontroll-knapp"
                        onClick={() => endreArbeid(benk, 'Fjern kolonne', (x) => fjernEgenKolonne(x, i))}
                      >
                        Fjern kolonnen<span class="visuelt-skjult"> {k}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ny ? (
        <NyKolonne benk={benk} lukk={() => settNy(false)} />
      ) : (
        <div class="knapperad">
          <button type="button" class="kontroll-knapp" onClick={() => settNy(true)}>
            + Legg til egendefinert kolonne
          </button>
        </div>
      )}

      {egneKolonner.length > 0 && <Verdiertabell benk={benk} a={a} kolonner={egneKolonner} />}

      <h3>Masteren</h3>
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
          {a.valgte.map((i) => (
            <option key={i} value={i}>
              Rad {i + 1}: {a.rader[i]?.find((c, j) => kolonner.includes(j) && c.trim()) ?? '(tom)'}
            </option>
          ))}
          {!a.valgte.includes(a.masterRad) && (
            <option value={a.masterRad}>Rad {a.masterRad + 1} (ikke valgt)</option>
          )}
        </select>
      </label>
      <p class="dempet">
        Eksempelraden legges inn på masteren, så du ser hvordan et skilt ser ut mens du tegner. Alle de andre
        radene bruker samme master.
      </p>

      <h3>Felt på masteren</h3>
      <Feltliste benk={benk} dok={t.dok} />
      {!mapperNoe && <p class="merknad">Koble minst én kolonne for å gå videre.</p>}
      {mangler.length > 0 && (
        <p class="dempet">
          Disse feltene lages på masteren, med innholdet fra rad {a.masterRad + 1}:{' '}
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
