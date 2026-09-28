/**
 * CSV batch dialog (spec: Signgen "Batch (CSV)"): fields on the master
 * sign, CSV import, column mapping, per-row preview with problems,
 * organisation, plate layout and a zip of 3MF files with a manifest.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument, Objekt, TekstKilde } from '../../core/dokument';
import { lastNed } from '../../core/lagring';
import { finnMateriale } from '../../core/materialer';
import { filnavn } from '../../eksport/tremf';
import { brukBenk } from '../../shell/bruk-benk';
import { Dialog } from '../../shell/Dialog';
import { Segment, TallFelt } from '../../shell/kontroller';
import { feltObjekter, oppdaterObjekter } from './dokument';
import { lastFonter } from './modell';
import {
  byggBatch,
  foreslaKobling,
  fordelPaPlater,
  lagVarianter,
  organiser,
  tolkCsv,
  type Byggeplate,
  type Csv,
  type Gruppering,
  type Kolonnemal,
  type Sortering,
  type Utdeling,
} from './batch';

const MAKS_RADER = 500;

function kodeKobling(k: Kolonnemal): string {
  return k.type === 'felt' ? `felt:${k.felt}` : k.type === 'farge' ? `farge:${k.lagId}` : 'ingen';
}

function dekodKobling(s: string): Kolonnemal {
  const [type, verdi] = s.split(':', 2) as [string, string];
  if (type === 'felt') return { type: 'felt', felt: verdi };
  if (type === 'farge') return { type: 'farge', lagId: verdi };
  return { type: 'ingen' };
}

function ledigFeltnavn(dok: Dokument): string {
  const brukt = new Set(feltObjekter(dok).map((o) => (o.kilde as TekstKilde).felt));
  if (!brukt.has('navn')) return 'navn';
  let i = 2;
  while (brukt.has(`felt${i}`)) i++;
  return `felt${i}`;
}

function Feltliste({ benk, dok }: { benk: Arbeidsbenk; dok: Dokument }) {
  const tekster = Object.values(dok.objekter).filter((o) => o.kilde.type === 'tekst');
  const settFelt = (o: Objekt, felt: string | undefined) =>
    benk.endre({
      navn: 'Batchfelt',
      anvend: (d) =>
        oppdaterObjekter(d, [o.id], (x) => ({ ...x, kilde: { ...(x.kilde as TekstKilde), felt } })),
    });
  if (!tekster.length) {
    return <p class="merknad">Skiltet har ingen tekst ennå. Legg til en tekst med Tekst-verktøyet først.</p>;
  }
  return (
    <ul class="batch-felt">
      {tekster.map((o) => {
        const k = o.kilde as TekstKilde;
        return (
          <li key={o.id}>
            <span class="batch-felt-tekst">«{k.tekst.slice(0, 40)}»</span>
            {k.felt ? (
              <>
                <span class="mono">felt: {k.felt}</span>
                <button type="button" class="kontroll-knapp" onClick={() => settFelt(o, undefined)}>
                  Fjern felt
                </button>
              </>
            ) : (
              <button type="button" class="kontroll-knapp" onClick={() => settFelt(o, ledigFeltnavn(dok))}>
                Gjør til felt
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Platekart({ plate, plater }: { plate: { bredde: number; dybde: number }; plater: Byggeplate[] }) {
  const [valgt, settValgt] = useState(0);
  const p = plater[Math.min(valgt, plater.length - 1)];
  if (!p) return null;
  const b = plate.bredde,
    d = plate.dybde;
  return (
    <figure class="batch-plate">
      {plater.length > 1 && (
        <div class="knapperad">
          {plater.map((x, i) => (
            <button
              key={x.nummer}
              type="button"
              class="kontroll-knapp"
              aria-pressed={i === valgt}
              onClick={() => settValgt(i)}
            >
              Plate {x.nummer}
            </button>
          ))}
        </div>
      )}
      <svg
        viewBox={`${-b / 2} ${-d / 2} ${b} ${d}`}
        role="img"
        aria-label={`Plate ${p.nummer}: ${p.plasseringer.length} skilt`}
      >
        <rect x={-b / 2} y={-d / 2} width={b} height={d} class="batch-plateflate" />
        {p.plasseringer.map((pl) => {
          const bx = pl.variant.boks;
          const x = bx.minX + pl.dx;
          const y = -(bx.maksY + pl.dy);
          const w = bx.maksX - bx.minX;
          const h = bx.maksY - bx.minY;
          const farger = pl.variant.farger.split('+');
          const bunn = finnMateriale(farger[0] ?? '').hex;
          const topp = finnMateriale(farger[farger.length - 1] ?? '').hex;
          return (
            <g key={pl.variant.indeks}>
              <rect x={x} y={y} width={w} height={h} rx={2} fill={bunn} class="batch-skilt" />
              <circle
                cx={x + w / 2}
                cy={y + h / 2}
                r={Math.min(w, h) * 0.28}
                fill={topp}
                class="batch-skilt"
              />
              <text x={x + w / 2} y={y + h / 2} class="batch-nummer">
                {pl.variant.indeks + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption class="dempet">
        Plate {p.nummer} av {plater.length}: {p.plasseringer.length} skilt. Tallene er radnumre i CSV-filen,
        og prikken viser fargen på det øverste laget.
      </figcaption>
    </figure>
  );
}

export function Batchdialog({ benk, lukk }: { benk: Arbeidsbenk; lukk: () => void }) {
  const t = brukBenk(benk);
  const dok = t.dok;
  const [fonterKlare, settFonterKlare] = useState(false);
  const [csv, settCsv] = useState<Csv | null>(null);
  const [kilde, settKilde] = useState('');
  const [lim, settLim] = useState('');
  const [kobling, settKobling] = useState<Kolonnemal[]>([]);
  const [sortering, settSortering] = useState<Sortering>('csv');
  const [sorterKolonne, settSorterKolonne] = useState(0);
  const [gruppering, settGruppering] = useState<Gruppering>('ingen');
  const [avstand, settAvstand] = useState(5);
  const [utdeling, settUtdeling] = useState<Utdeling>('plate');
  const [hoppOver, settHoppOver] = useState(true);
  const [arbeid, settArbeid] = useState<{ ferdig: number; totalt: number } | null>(null);
  const [resultat, settResultat] = useState<string | null>(null);
  const fil = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let aktiv = true;
    void lastFonter(dok).then(() => aktiv && settFonterKlare(true));
    return () => {
      aktiv = false;
    };
  }, [dok]);

  const felt = feltObjekter(dok);
  const feltNokkel = [...new Set(felt.map((o) => (o.kilde as TekstKilde).felt!))].sort().join('|');
  // fields added or removed after the CSV was read: re-suggest unmapped columns, drop stale ones
  useEffect(() => {
    if (!csv) return;
    const forslag = foreslaKobling(csv, dok);
    const finnes = new Set(feltNokkel.split('|'));
    settKobling((gammel) =>
      gammel.map((k, i) => {
        if (k.type === 'felt' && !finnes.has(k.felt)) return { type: 'ingen' };
        if (k.type === 'ingen' && forslag[i]?.type === 'felt') return forslag[i]!;
        return k;
      }),
    );
  }, [feltNokkel]);
  const bruk = (tekst: string, navn: string) => {
    const c = tolkCsv(tekst);
    settResultat(null);
    if (!c.kolonner.length || !c.rader.length) {
      settCsv(null);
      benk.melde('Fant ingen rader. Første linje må være kolonnenavn, og hver rad ett skilt.');
      return;
    }
    if (c.rader.length > MAKS_RADER) {
      benk.melde(
        `Filen har ${c.rader.length} rader. Batch tar opptil ${MAKS_RADER} om gangen; del filen opp.`,
      );
      return;
    }
    settCsv(c);
    settKilde(navn);
    settKobling(foreslaKobling(c, dok));
    settSorterKolonne(0);
    benk.melde(`${c.rader.length} rader lest fra ${navn}.`);
  };

  const varianter = useMemo(
    () => (csv && fonterKlare ? lagVarianter(dok, csv, kobling) : []),
    [csv, kobling, dok, fonterKlare],
  );
  const medProblemer = varianter.filter((v) => v.problemer.length).length;
  const aktuelle = hoppOver ? varianter.filter((v) => !v.problemer.length) : varianter;
  const oppsett = useMemo(() => {
    try {
      const grupper = organiser(aktuelle, sortering, gruppering, sorterKolonne);
      return { plater: fordelPaPlater(grupper, dok.plate, avstand), feil: null };
    } catch (e) {
      return { plater: [] as Byggeplate[], feil: e instanceof Error ? e.message : String(e) };
    }
  }, [aktuelle, sortering, gruppering, sorterKolonne, avstand, dok.plate]);
  const brukerFelt = kobling.some((k) => k.type === 'felt');

  const lag = async () => {
    if (!csv) return;
    settResultat(null);
    settArbeid({ ferdig: 0, totalt: aktuelle.length });
    try {
      const r = await byggBatch(oppsett.plater, csv.kolonner, dok.navn, utdeling, (ferdig, totalt) =>
        settArbeid({ ferdig, totalt }),
      );
      const zipnavn = filnavn(`${dok.navn}-batch`, '3mf').replace(/\.3mf$/, '.zip');
      lastNed(r.zip, zipnavn, 'application/zip');
      const tekst = `${zipnavn} er lastet ned med ${r.filer.length - 1} 3MF-filer og manifest.csv.`;
      settResultat(r.feil.length ? `${tekst} Merk: ${r.feil.join(' ')}` : tekst);
      benk.melde(tekst);
    } finally {
      settArbeid(null);
    }
  };

  return (
    <Dialog tittel="Lag skilt fra CSV" lukk={lukk} klasse="batch">
      <div class="batch-innhold">
        <p class="dempet">
          Hver rad i CSV-filen blir ett skilt basert på designet ditt. Kolonnene fyller tekstfeltene og kan
          styre fargen på et lag.
        </p>

        <h3>1. Felt på skiltet</h3>
        <Feltliste benk={benk} dok={dok} />
        {!felt.length && (
          <p class="merknad">
            Gjør minst én tekst til et felt. Feltet får innholdet fra en kolonne i CSV-filen.
          </p>
        )}

        <h3>2. CSV-fil</h3>
        <div class="knapperad">
          <button type="button" class="sekundar" onClick={() => fil.current?.click()}>
            Velg CSV-fil
          </button>
          {kilde && <span class="dempet">{kilde}</span>}
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
              benk.melde('CSV-filen er større enn 2 MB.');
              return;
            }
            bruk(await f.text(), f.name);
          }}
        />
        <label class="felt stablet" for="batch-lim">
          <span>Eller lim inn (første linje er kolonnenavn)</span>
          <textarea
            id="batch-lim"
            rows={4}
            placeholder={'navn;farge\nOla Nordmann;Lilla\nKari Nordmann;Cyan'}
            value={lim}
            onInput={(e) => settLim((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        <button
          type="button"
          class="kontroll-knapp"
          disabled={!lim.trim()}
          onClick={() => bruk(lim, 'innlimt tekst')}
        >
          Bruk teksten
        </button>

        {csv && (
          <>
            <h3>3. Kolonner</h3>
            <div class="batch-kobling">
              {csv.kolonner.map((k, i) => (
                <label class="felt" key={`${k}-${i}`} for={`batch-kol-${i}`}>
                  <span class="mono">{k}</span>
                  <select
                    id={`batch-kol-${i}`}
                    value={kodeKobling(kobling[i] ?? { type: 'ingen' })}
                    onChange={(e) => {
                      const ny = [...kobling];
                      ny[i] = dekodKobling((e.target as HTMLSelectElement).value);
                      settKobling(ny);
                    }}
                  >
                    <option value="ingen">Ikke i bruk</option>
                    {[...new Set(felt.map((o) => (o.kilde as TekstKilde).felt!))].map((f) => (
                      <option key={f} value={`felt:${f}`}>
                        Tekst i feltet «{f}»
                      </option>
                    ))}
                    {dok.lag.map((l) => (
                      <option key={l.id} value={`farge:${l.id}`}>
                        Farge på laget «{l.navn}»
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {kobling.some((k) => k.type === 'farge') && (
              <p class="dempet">
                Fargekolonner bruker fargenavn som «Lilla», «Kritthvit» eller «Svart PETG».
              </p>
            )}

            <h3>4. Forhåndsvisning</h3>
            {!fonterKlare ? (
              <p role="status">Laster fonter …</p>
            ) : (
              <>
                <p role="status">
                  {varianter.length} skilt
                  {medProblemer > 0 ? `, ${medProblemer} med problemer` : ', ingen problemer'}.
                  {!brukerFelt && ' Ingen kolonne fyller et felt, så alle skiltene blir like.'}
                </p>
                <div class="batch-tabell" tabIndex={0} role="region" aria-label="Rader i CSV-filen">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Rad</th>
                        {csv.kolonner.map((k, i) => (
                          <th scope="col" key={i}>
                            {k}
                          </th>
                        ))}
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {varianter.map((v) => (
                        <tr key={v.indeks} class={v.problemer.length ? 'problem' : ''}>
                          <td class="mono">{v.indeks + 1}</td>
                          {v.verdier.map((x, i) => (
                            <td key={i}>{x}</td>
                          ))}
                          <td>{v.problemer.length ? v.problemer.join('; ') : 'OK'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {medProblemer > 0 && (
                  <label class="avkryssing">
                    <input type="checkbox" checked={hoppOver} onChange={() => settHoppOver(!hoppOver)} /> Hopp
                    over rader med problemer
                  </label>
                )}

                <h3>5. Byggeplater</h3>
                <div class="batch-organisering">
                  <div class="felt">
                    <span>Rekkefølge</span>
                    <Segment
                      etikett="Rekkefølge"
                      valg={[
                        { id: 'csv', navn: 'Som i filen' },
                        { id: 'alfabet', navn: 'Alfabetisk' },
                      ]}
                      verdi={sortering}
                      endre={settSortering}
                    />
                  </div>
                  {sortering === 'alfabet' && (
                    <label class="felt" for="batch-sorter">
                      <span>Sorter etter</span>
                      <select
                        id="batch-sorter"
                        value={sorterKolonne}
                        onChange={(e) => settSorterKolonne(Number((e.target as HTMLSelectElement).value))}
                      >
                        {csv.kolonner.map((k, i) => (
                          <option key={i} value={i}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div class="felt">
                    <span>Grupper</span>
                    <Segment
                      etikett="Grupper"
                      valg={[
                        { id: 'ingen', navn: 'Nei' },
                        { id: 'farger', navn: 'Etter farger' },
                      ]}
                      verdi={gruppering}
                      endre={settGruppering}
                    />
                  </div>
                  <TallFelt
                    etikett="Avstand"
                    verdi={avstand}
                    min={2}
                    maks={30}
                    steg={1}
                    desimaler={0}
                    endre={settAvstand}
                  />
                  <div class="felt">
                    <span>Filer</span>
                    <Segment
                      etikett="Filer"
                      valg={[
                        { id: 'plate', navn: 'Én per plate' },
                        { id: 'variant', navn: 'Én per skilt' },
                      ]}
                      verdi={utdeling}
                      endre={settUtdeling}
                    />
                  </div>
                </div>
                {gruppering === 'farger' && (
                  <p class="dempet">
                    Hver fargekombinasjon starter på en ny plate, så du bytter farger sjeldnere.
                  </p>
                )}
                {oppsett.feil ? (
                  <p class="merknad">{oppsett.feil}</p>
                ) : (
                  aktuelle.length > 0 && <Platekart plate={dok.plate} plater={oppsett.plater} />
                )}

                <h3>6. Last ned</h3>
                <p class="dempet">
                  Du får en ZIP med {utdeling === 'plate' ? 'én 3MF per byggeplate' : 'én 3MF per skilt'} og
                  en manifest.csv som viser hvilket skilt som ligger hvor.
                </p>
                <div class="knapperad">
                  <button
                    type="button"
                    class="primar"
                    disabled={!!arbeid || !!oppsett.feil || aktuelle.length === 0}
                    onClick={() => void lag()}
                  >
                    {arbeid
                      ? `Bygger ${arbeid.ferdig} av ${arbeid.totalt} …`
                      : `Lag ${aktuelle.length} skilt`}
                  </button>
                </div>
                {arbeid && <progress max={arbeid.totalt} value={arbeid.ferdig} aria-label="Fremdrift" />}
                {resultat && <p role="status">{resultat}</p>}
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
