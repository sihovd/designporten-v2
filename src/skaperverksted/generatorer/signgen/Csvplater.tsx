/**
 * Step 6 of the CSV workflow: the production plates. The generated signs
 * are sorted onto plates by the filaments they need, so a plate asks for as
 * few filament changes as possible. From here the user browses the plates,
 * sees which signs lie where and what each needs, opens one sign to edit it
 * (its own values are kept as overrides on the master), goes back to the
 * CSV, generates more rows, or downloads the files.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Dokument } from '../../core/dokument';
import type { Vec2 } from '../../core/geometri2d';
import { lastNed } from '../../core/lagring';
import { filnavn } from '../../eksport/tremf';
import type { ModellDel } from '../../geometri/mesh';
import { brukBenk } from '../../shell/bruk-benk';
import { Segment, TallFelt } from '../../shell/kontroller';
import { Ikon } from '../../shell/ikoner';
import { byggBatch, filamentkombinasjon, amsRekkefolge, type Utdeling, type Variant } from './batch';
import {
  bygSkilt,
  grunnskilt,
  lagProduksjonsplater,
  lesArbeid,
  profilkolonne,
  settProfilForRad,
  skiltinfo,
  tilbakestillOverstyring,
  tilbakestillSkilt,
  type Csvarbeid,
  type Produksjonsplate,
} from './csvflyt';
import { endreArbeid, gaTilSteg, startInstans } from './csvhandlinger';
import { Filamentchip } from './Csvfelles';
import { alleProfiler } from './batch';
import { byggSigngen, lastFonter } from './modell';
import { Platebrett, type Platesilt } from './Platebrett';
import { brukPlateflytt, settFlytt, utenFlytt } from './plateflytt';
import { feltrandFor, lagSilhuett, type Silhuett } from './silhuett';
import { plasseringsproblemer, SNAPGRENSER, lesSnap, type Snappunkt, type Snapoppsett } from './snapmotor';
import { endreSnapAvstandI, endreSnapI, snappunkterAv } from './snappunkter';
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

/** The contour of each sign, built once from its parts (and again when it has to reach farther). */
const silhuettFraVariant = new WeakMap<object, Silhuett>();

async function silhuettFor(v: Variant, felt: number): Promise<{ deler: ModellDel[]; silhuett: Silhuett }> {
  const deler = await delerFor(v);
  let silhuett = silhuettFraVariant.get(v.dok);
  if (!silhuett || silhuett.felt < felt) {
    silhuett = lagSilhuett(
      deler.map((d) => d.mesh),
      felt,
    );
    silhuettFraVariant.set(v.dok, silhuett);
  }
  return { deler, silhuett };
}

/** The snap points of a sign, read off its own geometry; kept while the list of points is the same. */
const punkterFraVariant = new WeakMap<object, { liste: readonly Snappunkt[]; punkter: Vec2[] }>();

function punkterFor(v: Variant, liste: readonly Snappunkt[]): Vec2[] {
  const c = punkterFraVariant.get(v.dok);
  if (c && c.liste === liste) return c.punkter;
  const punkter = snappunkterAv(v.dok, liste).map(({ x, y }) => ({ x, y }));
  punkterFraVariant.set(v.dok, { liste, punkter });
  return punkter;
}

/** The work and the master as they were, while only the placement on the plates differs. */
function useUtenPlateflytt(dok: Dokument, a: Csvarbeid | null): { dok: Dokument; a: Csvarbeid | null } {
  const forrige = useRef<{ nokler: unknown[]; dok: Dokument; a: Csvarbeid | null } | null>(null);
  const nokler = [
    ...Object.entries(dok)
      .filter(([k]) => k !== 'parametre')
      .map(([, v]) => v),
    ...Object.entries(dok.parametre)
      .filter(([k]) => k !== 'csvarbeid' && k !== 'snap')
      .map(([, v]) => v),
    ...Object.entries(a ?? {})
      .filter(([k]) => k !== 'plateflytt')
      .map(([, v]) => v),
  ];
  const f = forrige.current;
  if (f && f.nokler.length === nokler.length && f.nokler.every((v, i) => v === nokler[i])) return f;
  forrige.current = { nokler, dok, a };
  return forrige.current;
}

/**
 * One production plate as it will be printed: the real models of every sign on it, in their colours, seen
 * from above and to scale, with the CSV row number on each sign. Built from the same models that go into the
 * files. The signs can be moved (Edge Snap helps), and the placement shown is the one the files get.
 */
function Platekart({
  benk,
  plate,
  auto,
  vist,
  antall,
  utdeling,
  valgt,
  snap,
  snapPaa,
}: {
  benk: Arbeidsbenk;
  plate: { bredde: number; dybde: number };
  /** The plate as the automatic packing lays it out. */
  auto: Produksjonsplate;
  /** The plate with the user's moves applied. */
  vist: Produksjonsplate;
  antall: number;
  utdeling: Utdeling;
  valgt: number | null;
  /** The snap settings of the master. */
  snap: Snapoppsett;
  /** The engine's switch («Snap» in the workbench). */
  snapPaa: boolean;
}) {
  const [bygget, settBygget] = useState<{
    plate: Produksjonsplate;
    data: Map<number, { deler: ModellDel[]; silhuett: Silhuett }>;
  } | null>(null);
  const [ferdig, settFerdig] = useState(0);

  useEffect(() => {
    let aktiv = true;
    settFerdig(0);
    void (async () => {
      const data = new Map<number, { deler: ModellDel[]; silhuett: Silhuett }>();
      for (const [i, pl] of auto.plasseringer.entries()) {
        data.set(
          pl.variant.indeks,
          await silhuettFor(pl.variant, feltrandFor(snap.avstand, snap.fangavstand)),
        );
        if (!aktiv) return;
        settFerdig(i + 1);
        // let the browser paint and stay responsive between signs
        await new Promise((r) => setTimeout(r, 0));
      }
      if (aktiv) settBygget({ plate: auto, data });
    })();
    return () => {
      aktiv = false;
    };
  }, [auto, snap.avstand, snap.fangavstand]);

  const skilt = useMemo<Platesilt[]>(() => {
    if (bygget?.plate !== auto) return [];
    return vist.plasseringer.flatMap((pl) => {
      const d = bygget.data.get(pl.variant.indeks);
      return d
        ? [
            {
              id: pl.variant.indeks,
              deler: d.deler,
              silhuett: d.silhuett,
              boks: pl.variant.boks,
              punkter: punkterFor(pl.variant, snap.punktliste),
              dx: pl.dx,
              dy: pl.dy,
              etikett: String(pl.variant.indeks + 1),
            },
          ]
        : [];
    });
  }, [bygget, auto, vist, snap.punktliste]);

  const problemer = useMemo(() => {
    const p = plasseringsproblemer(skilt, plate);
    return { alle: new Set([...p.overlapper, ...p.utenfor]), ...p };
  }, [skilt, plate]);

  const onFlytt = useCallback(
    (id: number, dx: number, dy: number) => {
      const a0 = auto.plasseringer.find((pl) => pl.variant.indeks === id);
      if (!a0) return;
      endreArbeid(
        benk,
        `Flytt skilt ${id + 1}`,
        (x) => ({ ...x, plateflytt: settFlytt(x.plateflytt, id, dx, dy, a0.dx, a0.dy) }),
        `plateflytt-${id}`,
      );
    },
    [benk, auto],
  );
  // the one distance: the packing leaves it between the signs and to the plate edge, Edge Snap holds it between
  // contours. A new packing makes the moves on the old one meaningless, so they go in the same step.
  const endreAvstand = (avstand: number) => endreSnapAvstandI(benk, avstand);
  const endreFang = (fangavstand: number) => endreSnapI(benk, { fangavstand }, 'snap-fang');
  const onVelg = useCallback((id: number) => signtilstand(benk).sett({ csvrad: id }), [benk]);
  const melde = useCallback((tekst: string) => benk.melde(tekst), [benk]);

  const flyttede = vist.plasseringer.filter((pl, i) => {
    const a0 = auto.plasseringer[i];
    return a0 && (a0.dx !== pl.dx || a0.dy !== pl.dy);
  }).length;
  const navn = (rader: number[]) => rader.map((r) => r + 1).join(', ');

  return (
    <div class="batch-plate">
      <div class="platebrett-verktoy" role="group" aria-label="Plassering på plata">
        <button
          type="button"
          class="kontroll-knapp"
          aria-pressed={snapPaa}
          title="Snap: skiltene legger seg inntil konturen til skiltet ved siden av, og på snap-punkter. Samme bryter som i editoren. Hold Alt for å slå av mens du flytter."
          onClick={() => benk.settInnstillinger({ snap: !snapPaa })}
        >
          <Ikon id="snap-object" storrelse={18} />
          <span>Edge Snap {snapPaa ? 'på' : 'av'}</span>
        </button>
        <TallFelt
          etikett="Minsteavstand"
          verdi={snap.avstand}
          min={SNAPGRENSER.avstand.min}
          maks={SNAPGRENSER.avstand.maks}
          steg={0.5}
          desimaler={1}
          endre={endreAvstand}
        />
        <TallFelt
          etikett="Snapavstand"
          verdi={snap.fangavstand}
          min={SNAPGRENSER.fangavstand.min}
          maks={SNAPGRENSER.fangavstand.maks}
          steg={0.5}
          desimaler={1}
          endre={endreFang}
        />
        <button
          type="button"
          class="kontroll-knapp"
          disabled={flyttede === 0}
          onClick={() =>
            endreArbeid(benk, 'Tilbakestill plata', (x) => ({
              ...x,
              plateflytt: utenFlytt(
                x.plateflytt,
                auto.plasseringer.map((pl) => pl.variant.indeks),
              ),
            }))
          }
        >
          Tilbakestill plata
        </button>
      </div>
      {problemer.overlapper.length > 0 && (
        <p class="merknad" role="status">
          Skilt {navn(problemer.overlapper)} overlapper hverandre. Flytt dem fra hverandre før du laster ned.
        </p>
      )}
      {problemer.utenfor.length > 0 && (
        <p class="merknad" role="status">
          Skilt {navn(problemer.utenfor)} stikker utenfor byggeplata.
        </p>
      )}
      {bygget?.plate === auto ? (
        <Platebrett
          plate={plate}
          skilt={skilt}
          valgt={valgt}
          problemer={problemer.alle}
          snap={{
            paa: snapPaa,
            avstand: snap.avstand,
            fangavstand: snap.fangavstand,
            punkter: snap.punkter,
          }}
          nummer={auto.nummer}
          antallPlater={antall}
          merknad={
            utdeling === 'plate'
              ? ''
              : 'Med «Én per skilt» får hvert skilt sin egen fil, midt på plata; plasseringen her gjelder bare manifest.csv.'
          }
          melde={melde}
          onVelg={onVelg}
          onFlytt={onFlytt}
        />
      ) : (
        <p class="dempet" role="status">
          Bygger forhåndsvisning av plate {auto.nummer} … {ferdig} av {auto.plasseringer.length} skilt
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

/** Another colour profile for this one sign: the sign changes, the master and the other signs do not. */
function Skiltvalg({ benk, a, rad }: { benk: Arbeidsbenk; a: Csvarbeid; rad: number }) {
  const profiler = alleProfiler();
  const kol = profilkolonne(a);
  const naa = kol >= 0 ? (a.rader[rad]?.[kol] ?? '') : '';
  const liste = naa && !profiler.some((p) => p.navn.toLowerCase() === naa.toLowerCase()) ? [naa] : [];
  return (
    <label class="felt" for="csv-skiltprofil">
      <span>Fargeprofil for dette skiltet</span>
      <select
        id="csv-skiltprofil"
        value={naa}
        onChange={(e) =>
          endreArbeid(benk, 'Fargeprofil for ett skilt', (x) =>
            settProfilForRad(x, rad, (e.target as HTMLSelectElement).value),
          )
        }
      >
        <option value="">Som masteren</option>
        {[...liste, ...profiler.map((p) => p.navn)].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlaterSteg({ benk, tilStatus }: { benk: Arbeidsbenk; tilStatus: () => void }) {
  const t = brukBenk(benk);
  const st = brukSigntilstand(benk);
  const lest = lesArbeid(t.dok);
  const { dok: master, a } = useUtenPlateflytt(t.dok, lest);
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

  const snapoppsett = lesSnap(t.dok);
  const varianter = useMemo(() => (a && klar ? bygSkilt(master, a, a.generert) : []), [master, a, klar]);
  const oppsett = useMemo(() => {
    if (!a) return { plater: [] as Produksjonsplate[], feil: null as string | null };
    try {
      return {
        plater: lagProduksjonsplater(
          varianter,
          master.plate,
          snapoppsett.avstand,
          a.valg.sortering,
          a.valg.sorterKolonne,
        ),
        feil: null,
      };
    } catch (e) {
      return { plater: [] as Produksjonsplate[], feil: e instanceof Error ? e.message : String(e) };
    }
  }, [a, varianter, master.plate, snapoppsett.avstand]);
  const flytt = lest?.plateflytt;
  const autoplater = oppsett.plater;
  const plater = useMemo(() => brukPlateflytt(autoplater, flytt), [autoplater, flytt]);

  if (!a) return <p class="merknad">Importer en CSV-fil først.</p>;
  if (!a.generert.length) {
    return (
      <div class="csv-steginnhold">
        <p class="merknad">Ingen skilt er generert ennå. Trykk «Generer».</p>
        <div class="knapperad csv-fot">
          <button type="button" class="primar" onClick={tilStatus}>
            Til genereringen →
          </button>
        </div>
      </div>
    );
  }

  const plate = plater[Math.min(valgtPlate, plater.length - 1)];
  const autoplate = autoplater[Math.min(valgtPlate, autoplater.length - 1)];
  const valgtRad =
    st.csvrad !== null && plate?.plasseringer.some((pl) => pl.variant.indeks === st.csvrad)
      ? st.csvrad
      : (plate?.plasseringer[0]?.variant.indeks ?? null);
  const valgtSkilt = plate?.plasseringer.find((pl) => pl.variant.indeks === valgtRad)?.variant;
  const venter = a.valgte.filter((i) => !a.generert.includes(i)).length;
  const medProblem = varianter.filter((v) => v.problemer.length);
  const valg = (endring: Partial<Csvarbeid['valg']>) =>
    endreArbeid(
      benk,
      'CSV: plater',
      (x) => ({
        ...x,
        valg: { ...x.valg, ...endring },
        // another packing: the moves made on the old one no longer fit
        ...('sortering' in endring || 'sorterKolonne' in endring ? { plateflytt: {} } : {}),
      }),
      'csv-valg',
    );

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
        Skiltene er laget. De er sortert etter hvilke filamenter de trenger, så du bytter filament sjeldnere.
        Velg et skilt for å bytte fargeprofil eller åpne det i editoren. Det du endrer på ett skilt, gjelder
        bare det skiltet; masteren og de andre skiltene blir ikke berørt.
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
                {autoplate && (
                  <Platekart
                    benk={benk}
                    plate={master.plate}
                    auto={autoplate}
                    vist={plate}
                    antall={plater.length}
                    utdeling={utdeling}
                    valgt={valgtRad}
                    snap={snapoppsett}
                    snapPaa={t.innstillinger.snap}
                  />
                )}

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
                        <th scope="col">Dekor</th>
                        <th scope="col">Fargeprofil</th>
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
                          <td>{skiltinfo(a, t.dok, v.indeks).navn}</td>
                          <td>{skiltinfo(a, t.dok, v.indeks).dekor.join(', ') || '–'}</td>
                          <td>{skiltinfo(a, t.dok, v.indeks).profil || 'Som masteren'}</td>
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
              <Skiltvalg benk={benk} a={a} rad={valgtSkilt.indeks} />
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
        <button type="button" class="sekundar" onClick={() => gaTilSteg(benk, 'importer')}>
          ← Tilbake til CSV
        </button>
        <button type="button" class="sekundar" onClick={tilStatus}>
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
