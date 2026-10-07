/**
 * Step 6 of the CSV workflow: the production plates. The generated signs
 * are sorted onto plates by the filaments they need, so a plate asks for as
 * few filament changes as possible. From here the user browses the plates,
 * sees which signs lie where and what each needs, opens one sign to edit it
 * (its own values are kept as overrides on the master), goes back to the
 * CSV, generates more rows, or downloads the files.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { lastNed } from '../../core/lagring';
import { filnavn } from '../../eksport/tremf';
import type { ModellDel } from '../../geometri/mesh';
import { brukBenk } from '../../shell/bruk-benk';
import { Segment, TallFelt } from '../../shell/kontroller';
import { Plateforhandsvisning, type Plateetikett } from '../../shell/Plateforhandsvisning';
import {
  byggBatch,
  forskyvMesh,
  filamentkombinasjon,
  amsRekkefolge,
  type Utdeling,
  type Variant,
} from './batch';
import {
  bygSkilt,
  grunnskilt,
  lagProduksjonsplater,
  lesArbeid,
  tilbakestillOverstyring,
  tilbakestillSkilt,
  type Csvarbeid,
  type Produksjonsplate,
} from './csvflyt';
import { endreArbeid, gaTilSteg, startInstans } from './csvhandlinger';
import { Filamentchip } from './Csvfelles';
import { byggSigngen, lastFonter } from './modell';
import { foreldreloseOverstyringer, lesVerdi, overstyringsetikett, visVerdi } from './overstyring';
import { signtilstand, brukSigntilstand } from './tilstand';

/** Built models by sign, so a plate that is shown again is not built again. */
const modellFraVariant = new WeakMap<object, ModellDel[]>();

async function delerFor(v: Variant): Promise<ModellDel[]> {
  let d = modellFraVariant.get(v.dok);
  if (!d) {
    d = (await byggSigngen(v.dok)).deler;
    modellFraVariant.set(v.dok, d);
  }
  return d;
}

/**
 * One production plate as it will be printed: the real models of every
 * sign on it, in their colours, seen from above and to scale, with the CSV
 * row number on each sign. Built from the same models that go into the files.
 */
function Platekart({
  plate,
  p,
  antall,
  utdeling,
}: {
  plate: { bredde: number; dybde: number };
  p: Produksjonsplate;
  antall: number;
  utdeling: Utdeling;
}) {
  const [bygget, settBygget] = useState<{ plate: Produksjonsplate; deler: ModellDel[] } | null>(null);
  const [ferdig, settFerdig] = useState(0);

  useEffect(() => {
    let aktiv = true;
    settFerdig(0);
    void (async () => {
      const alle: ModellDel[] = [];
      for (const [i, pl] of p.plasseringer.entries()) {
        const deler = await delerFor(pl.variant);
        if (!aktiv) return;
        for (const d of deler) {
          alle.push({ ...d, id: `${pl.variant.indeks}-${d.id}`, mesh: forskyvMesh(d.mesh, pl.dx, pl.dy) });
        }
        settFerdig(i + 1);
        // let the browser paint and stay responsive between signs
        await new Promise((r) => setTimeout(r, 0));
      }
      if (aktiv) settBygget({ plate: p, deler: alle });
    })();
    return () => {
      aktiv = false;
    };
  }, [p]);

  const etiketter: Plateetikett[] = p.plasseringer.map((pl) => ({
    // top-left corner of the sign, where outlines are empty rather than over the letters
    x: pl.variant.boks.minX + pl.dx + 0.5,
    y: pl.variant.boks.maksY + pl.dy - 0.5,
    tekst: String(pl.variant.indeks + 1),
  }));
  return (
    <div class="batch-plate">
      {bygget?.plate === p ? (
        <Plateforhandsvisning
          deler={bygget.deler}
          plate={plate}
          etiketter={etiketter}
          beskrivelse={`Plate ${p.nummer} av ${antall}: ${p.plasseringer.length} skilt, sett ovenfra og i skala. Tallene er radnumre i CSV-filen. ${
            utdeling === 'plate'
              ? 'Slik ligger skiltene i 3MF-filen for plata.'
              : 'Med «Én per skilt» får hvert skilt sin egen fil, midt på plata; dette er bare plasseringen i manifest.csv.'
          }`}
        />
      ) : (
        <p class="dempet" role="status">
          Bygger forhåndsvisning av plate {p.nummer} … {ferdig} av {p.plasseringer.length} skilt
        </p>
      )}
    </div>
  );
}

const first = (v: Variant) => v.verdier.find((x) => x.trim()) ?? `Rad ${v.indeks + 1}`;

/** The values one sign has of its own, next to what the master says now. */
function Egneverdier({ benk, a, rad }: { benk: Arbeidsbenk; a: Csvarbeid; rad: number }) {
  const t = brukBenk(benk);
  const ov = a.overstyringer[rad];
  const grunn = useMemo(() => grunnskilt(t.dok, a, rad)?.dok, [t.dok, a, rad]);
  const liste = Object.entries(ov ?? {});
  if (!grunn) return null;
  if (!liste.length) {
    return <p class="dempet">Dette skiltet følger masteren i alt. Ingen egne verdier.</p>;
  }
  const foreldrelose = new Set(
    foreldreloseOverstyringer(grunn, ov).map((o) => `${o.mal}:${o.id}:${o.egenskap}`),
  );
  return (
    <>
      <ul class="csv-egne">
        {liste.map(([nokkel, o]) => (
          <li key={nokkel} class="overstyrt">
            <span class="csv-egne-navn">
              <span class="csv-merke">Egen verdi</span> {overstyringsetikett(grunn, o)}
            </span>
            <span class="csv-egne-verdi">
              {foreldrelose.has(nokkel) ? (
                'finnes ikke lenger på masteren'
              ) : (
                <>
                  Master: {visVerdi(o, lesVerdi(grunn, o.mal, o.id, o.egenskap))} · Her:{' '}
                  <strong>{visVerdi(o, o.verdi)}</strong>
                </>
              )}
            </span>
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() =>
                endreArbeid(benk, 'Tilbakestill til master', (x) => tilbakestillOverstyring(x, rad, nokkel))
              }
            >
              Tilbakestill til master
              <span class="visuelt-skjult">: {overstyringsetikett(grunn, o)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        class="kontroll-knapp"
        onClick={() => endreArbeid(benk, 'Tilbakestill skiltet til master', (x) => tilbakestillSkilt(x, rad))}
      >
        Tilbakestill hele skiltet til master
      </button>
    </>
  );
}

export function PlaterSteg({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const a = lesArbeid(t.dok);
  const [klar, settKlar] = useState(false);
  const [valgtPlate, settValgtPlate] = useState(0);
  const [utdeling, settUtdeling] = useState<Utdeling>('plate');
  const [arbeid, settArbeid] = useState<{ ferdig: number; totalt: number } | null>(null);
  const [resultat, settResultat] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    settKlar(false);
    void lastFonter(t.dok).then(() => aktiv && settKlar(true));
    return () => {
      aktiv = false;
    };
  }, [t.dok]);

  const varianter = useMemo(() => (a && klar ? bygSkilt(t.dok, a, a.generert) : []), [t.dok, a, klar]);
  const oppsett = useMemo(() => {
    if (!a) return { plater: [] as Produksjonsplate[], feil: null as string | null };
    try {
      return {
        plater: lagProduksjonsplater(
          varianter,
          t.dok.plate,
          a.valg.plateavstand,
          a.valg.sortering,
          a.valg.sorterKolonne,
        ),
        feil: null,
      };
    } catch (e) {
      return { plater: [] as Produksjonsplate[], feil: e instanceof Error ? e.message : String(e) };
    }
  }, [a, varianter, t.dok.plate]);

  if (!a) return <p class="merknad">Importer en CSV-fil først.</p>;
  if (!a.generert.length) {
    return (
      <div class="csv-steginnhold">
        <p class="merknad">Ingen skilt er generert ennå. Velg rader og trykk «Generer».</p>
        <div class="knapperad csv-fot">
          <button type="button" class="primar" onClick={() => gaTilSteg(benk, 'rader')}>
            Velg rader →
          </button>
        </div>
      </div>
    );
  }

  const plater = oppsett.plater;
  const plate = plater[Math.min(valgtPlate, plater.length - 1)];
  const valgtRad =
    st.csvrad !== null && plate?.plasseringer.some((pl) => pl.variant.indeks === st.csvrad)
      ? st.csvrad
      : (plate?.plasseringer[0]?.variant.indeks ?? null);
  const valgtSkilt = plate?.plasseringer.find((pl) => pl.variant.indeks === valgtRad)?.variant;
  const venter = a.valgte.filter((i) => !a.generert.includes(i)).length;
  const medProblem = varianter.filter((v) => v.problemer.length);
  const valg = (endring: Partial<Csvarbeid['valg']>) =>
    endreArbeid(benk, 'CSV: plater', (x) => ({ ...x, valg: { ...x.valg, ...endring } }), 'csv-valg');

  const lag = async () => {
    settResultat(null);
    settArbeid({ ferdig: 0, totalt: varianter.length });
    try {
      const r = await byggBatch(plater, a.kolonner, t.dok.navn, utdeling, (ferdig, totalt) =>
        settArbeid({ ferdig, totalt }),
      );
      const zipnavn = filnavn(`${t.dok.navn}-batch`, '3mf').replace(/\.3mf$/, '.zip');
      lastNed(r.zip, zipnavn, 'application/zip');
      const tekst = `${zipnavn} er lastet ned med ${r.filer.length - 1} 3MF-filer og manifest.csv.`;
      settResultat(r.feil.length ? `${tekst} Merk: ${r.feil.join(' ')}` : tekst);
      benk.melde(tekst);
    } finally {
      settArbeid(null);
    }
  };

  return (
    <div class="csv-steginnhold">
      <p class="dempet csv-intro">
        Skiltene er sortert etter hvilke filamenter de trenger, så du bytter filament sjeldnere. Plater med
        samme kombinasjon bruker samme plasser i printeren.
      </p>

      {!klar ? (
        <p role="status">Laster fonter og bygger skiltene …</p>
      ) : oppsett.feil ? (
        <p class="merknad" role="alert">
          {oppsett.feil} Gjør skiltet mindre på masteren, eller bruk en større byggeplate.
        </p>
      ) : (
        <>
          <p role="status">
            {varianter.length} skilt på {plater.length} {plater.length === 1 ? 'plate' : 'plater'}
            {medProblem.length ? `, ${medProblem.length} med problemer` : ', ingen problemer'}.
          </p>

          <div class="csv-plater">
            <ul class="csv-platevalg" aria-label="Produksjonsplater">
              {plater.map((p, i) => {
                const antallOv = p.plasseringer.filter((pl) => pl.variant.overstyrt?.length).length;
                const feil = p.plasseringer.filter((pl) => pl.variant.problemer.length).length;
                return (
                  <li key={p.nummer}>
                    <button
                      type="button"
                      class="csv-platekort"
                      aria-pressed={plate === p}
                      onClick={() => settValgtPlate(i)}
                    >
                      <strong>Plate {p.nummer}</strong>
                      <span class="dempet">{p.plasseringer.length} skilt</span>
                      <span class="csv-filamenter">
                        {p.kombinasjon.map((id) => (
                          <Filamentchip key={id} id={id} />
                        ))}
                      </span>
                      {antallOv > 0 && <span class="csv-merke">{antallOv} med egne verdier</span>}
                      {feil > 0 && <span class="csv-merke feil">{feil} med problemer</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            {plate && (
              <div class="csv-plateinnhold">
                <h3>
                  Plate {plate.nummer}: {plate.kombinasjon.length} filamenter
                </h3>
                <p class="csv-filamenter">
                  {amsRekkefolge(plate.kombinasjon).map((id) => (
                    <Filamentchip key={id} id={id} />
                  ))}
                </p>
                <Platekart plate={t.dok.plate} p={plate} antall={plater.length} utdeling={utdeling} />

                <div
                  class="batch-tabell"
                  tabIndex={0}
                  role="region"
                  aria-label={`Skiltene på plate ${plate.nummer}`}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Rad</th>
                        <th scope="col">Skilt</th>
                        <th scope="col">Filamenter</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span class="visuelt-skjult">Åpne</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {plate.plasseringer.map(({ variant: v }) => (
                        <tr
                          key={v.indeks}
                          class={`${v.problemer.length ? 'problem' : ''}${v.indeks === valgtRad ? ' valgt' : ''}`}
                        >
                          <td class="mono">{v.indeks + 1}</td>
                          <td>{first(v)}</td>
                          <td>{filamentkombinasjon(v).length}</td>
                          <td>
                            {[
                              v.overstyrt?.length ? `${v.overstyrt.length} egne verdier` : '',
                              v.problemer.join('; '),
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'OK'}
                          </td>
                          <td>
                            <button
                              type="button"
                              class="kontroll-knapp"
                              aria-pressed={v.indeks === valgtRad}
                              onClick={() => signtilstand(benk).sett({ csvrad: v.indeks })}
                            >
                              Vis<span class="visuelt-skjult"> skilt {v.indeks + 1}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {valgtSkilt && (
            <section class="csv-skilt" aria-label={`Skilt ${valgtSkilt.indeks + 1}`}>
              <h3>
                Skilt {valgtSkilt.indeks + 1}: {first(valgtSkilt)}
              </h3>
              <p class="csv-filamenter">
                {amsRekkefolge(filamentkombinasjon(valgtSkilt)).map((id) => (
                  <Filamentchip key={id} id={id} />
                ))}
              </p>
              {valgtSkilt.problemer.length > 0 && (
                <p class="merknad" role="alert">
                  {valgtSkilt.problemer.join('; ')}
                </p>
              )}
              <Egneverdier benk={benk} a={a} rad={valgtSkilt.indeks} />
              <div class="knapperad">
                <button
                  type="button"
                  class="sekundar"
                  onClick={() => void startInstans(benk, valgtSkilt.indeks)}
                >
                  Rediger dette skiltet
                </button>
                <span class="dempet">
                  Det du endrer, gjelder bare dette skiltet. Resten følger masteren, også når du endrer den
                  senere.
                </span>
              </div>
            </section>
          )}

          <h3>Plater og filer</h3>
          <div class="batch-organisering">
            <div class="felt">
              <span>Rekkefølge</span>
              <Segment
                etikett="Rekkefølge"
                valg={[
                  { id: 'csv', navn: 'Som i filen' },
                  { id: 'alfabet', navn: 'Alfabetisk' },
                ]}
                verdi={a.valg.sortering}
                endre={(sortering) => valg({ sortering })}
              />
            </div>
            {a.valg.sortering === 'alfabet' && (
              <label class="felt" for="csv-sorter">
                <span>Sorter etter</span>
                <select
                  id="csv-sorter"
                  value={a.valg.sorterKolonne}
                  onChange={(e) => valg({ sorterKolonne: Number((e.target as HTMLSelectElement).value) })}
                >
                  {a.kolonner.map((k, i) => (
                    <option key={i} value={i}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <TallFelt
              etikett="Avstand"
              verdi={a.valg.plateavstand}
              min={2}
              maks={30}
              steg={1}
              desimaler={0}
              endre={(plateavstand) => valg({ plateavstand })}
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
          <p class="dempet">
            Du får en ZIP med {utdeling === 'plate' ? 'én 3MF per byggeplate' : 'én 3MF per skilt'} og en
            manifest.csv som viser hvilket skilt som ligger hvor og hvilke filamenter det trenger. Hver del
            beholder sin farge og sitt eget objekt i 3MF-filen.
          </p>
        </>
      )}

      <div class="knapperad csv-fot">
        <button type="button" class="sekundar" onClick={() => gaTilSteg(benk, 'rader')}>
          ← Tilbake til CSV
        </button>
        <button type="button" class="sekundar" onClick={() => gaTilSteg(benk, 'rader')}>
          Generer flere rader{venter > 0 ? ` (${venter} valgt, ikke generert)` : ''}
        </button>
        <button
          type="button"
          class="primar"
          disabled={!!arbeid || !klar || !!oppsett.feil || varianter.length === 0}
          onClick={() => void lag()}
        >
          {arbeid ? `Bygger ${arbeid.ferdig} av ${arbeid.totalt} …` : `Last ned ${varianter.length} skilt`}
        </button>
      </div>
      {arbeid && <progress max={arbeid.totalt} value={arbeid.ferdig} aria-label="Fremdrift" />}
      {resultat && <p role="status">{resultat}</p>}
    </div>
  );
}
