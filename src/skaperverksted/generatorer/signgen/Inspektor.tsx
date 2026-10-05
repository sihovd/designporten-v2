/**
 * Signgen inspector: properties of the selection, the active layer (height,
 * colour, profile, Kontur, influences) and the project.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import {
  finnLag,
  type Dokument,
  type Lag,
  type LagPavirkning,
  type Objekt,
  type Omriss,
  type TekstKilde,
} from '../../core/dokument';
import {
  finnMateriale,
  materialer,
  materialtyper,
  standardPrinter,
  type Materialtype,
} from '../../core/materialer';
import { forhandsvalg, type ProfilType } from '../../core/profil';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel, Segment, TallFelt } from '../../shell/kontroller';
import { fonter } from '../../geometri/tekst';
import {
  parametre,
  oppdaterLag,
  oppdaterObjekter,
  flyttTilLag,
  fargeplasser,
  flyttOmriss,
  grupperTekst,
  losUtTekst,
  oppdaterOmriss,
  slettOmriss,
  ordne,
  stable,
  standardNavn,
} from './dokument';
import { lokalGeometri, MIN_OMRISSBREDDE, objektStorrelse } from './modell';
import { dupliserValgte, fordel, juster, slettValgte, valgte } from './handlinger';
import { brukSigntilstand, signtilstand } from './tilstand';
import { nyttOmrissI } from './Lagpanel';
import { Profilredigerer } from './Profilredigerer';
import { Batchdialog } from './Batch';
import { plangrenser } from '../../core/plangrenser';

const PROFILER: { id: Exclude<ProfilType, 'egendefinert'> | 'egendefinert'; navn: string }[] = [
  { id: 'rett', navn: 'Rett' },
  { id: 'konveks', navn: 'Bue' },
  { id: 'avrundet', navn: 'Avrundet kant' },
  { id: 'konkav', navn: 'Konkav' },
  { id: 'fas', navn: 'Knekk (fas)' },
  { id: 's-kurve', navn: 'S-kurve' },
  { id: 'trapp', navn: 'Trapp' },
  { id: 'egendefinert', navn: 'Egendefinert' },
];

function Materialvelger({ verdi, endre, id }: { verdi: string; endre: (id: string) => void; id: string }) {
  const typer = Object.keys(materialtyper) as Materialtype[];
  const m = finnMateriale(verdi);
  return (
    <label class="felt" for={id}>
      <span>Farge</span>
      <span class="materialvalg">
        <span class="fargeprove" style={{ background: m.hex }} aria-hidden="true" />
        <select id={id} value={verdi} onChange={(e) => endre((e.target as HTMLSelectElement).value)}>
          {typer.map((t) => (
            <optgroup key={t} label={t}>
              {materialer
                .filter((x) => x.type === t)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.navn}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </span>
    </label>
  );
}

// ---------- object ----------

/** Select value for «take the text out of its group». */
const EGET = '__eget-tekstlag';

function EttObjekt({ benk, o }: { benk: Arbeidsbenk; o: Objekt }) {
  const t = brukBenk(benk);
  const lagForObjekt = finnLag(t.dok, o.lagId);
  const iGruppe = !!lagForObjekt?.tekstlag && (t.dok.rekkefolge[o.lagId]?.length ?? 0) > 1;
  const tekstfelt = useRef<HTMLTextAreaElement>(null);
  const [laas, settLaas] = useState(true);
  useEffect(() => {
    const fokus = () => {
      tekstfelt.current?.focus();
      tekstfelt.current?.select();
    };
    window.addEventListener('signgen:rediger-tekst', fokus);
    return () => window.removeEventListener('signgen:rediger-tekst', fokus);
  }, []);
  const endre = (navn: string, fn: (o: Objekt) => Objekt, slaSammen?: string) =>
    benk.endre({ navn, slaSammen, anvend: (d) => oppdaterObjekter(d, [o.id], fn) });
  const str = objektStorrelse(o);
  const g = lokalGeometri(o.kilde);
  const lokalB = g ? g.boks.maksX - g.boks.minX : 1;
  const lokalH = g ? g.boks.maksY - g.boks.minY : 1;
  const settStr = (bredde: number | null, hoyde: number | null, kilde: 'skriv' | 'pil') => {
    let sx = bredde !== null ? bredde / Math.max(1e-6, str.bredde) : 1;
    let sy = hoyde !== null ? hoyde / Math.max(1e-6, str.hoyde) : 1;
    if (laas) {
      const s = bredde !== null ? sx : sy;
      sx = sy = s;
    }
    endre(
      'Endre størrelse',
      (x) =>
        x.kilde.type === 'form'
          ? {
              ...x,
              kilde: {
                ...x.kilde,
                bredde: Math.max(0.2, x.kilde.bredde * sx),
                hoyde: Math.max(0.2, x.kilde.hoyde * sy),
              },
            }
          : {
              ...x,
              transform: { ...x.transform, skalaX: x.transform.skalaX * sx, skalaY: x.transform.skalaY * sy },
            },
      kilde === 'pil' ? 'str-pil' : undefined,
    );
  };
  const tekst = o.kilde.type === 'tekst' ? o.kilde : null;
  const endreTekst = (navn: string, endring: Partial<TekstKilde>, slaSammen?: string) =>
    endre(
      navn,
      (x) => {
        const kilde = { ...(x.kilde as TekstKilde), ...endring };
        const autoNavn = x.navn === standardNavn(x.kilde);
        return { ...x, kilde, navn: autoNavn ? standardNavn(kilde) : x.navn };
      },
      slaSammen,
    );

  return (
    <>
      <Panel tittel={o.kilde.type === 'tekst' ? 'Tekst' : o.kilde.type === 'svg' ? 'SVG' : 'Form'}>
        {tekst && (
          <>
            <label class="felt stablet" for="signgen-tekst">
              <span>Tekst</span>
              <textarea
                id="signgen-tekst"
                ref={tekstfelt}
                rows={2}
                value={tekst.tekst}
                onInput={(e) =>
                  endreTekst(
                    'Skriv tekst',
                    { tekst: (e.target as HTMLTextAreaElement).value },
                    `tekst-${o.id}`,
                  )
                }
              />
            </label>
            <label class="felt" for="signgen-font">
              <span>Font</span>
              <select
                id="signgen-font"
                value={tekst.fontId}
                onChange={(e) => endreTekst('Bytt font', { fontId: (e.target as HTMLSelectElement).value })}
              >
                {fonter.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.navn} ({f.preg.toLowerCase()})
                  </option>
                ))}
              </select>
            </label>
            <TallFelt
              etikett="Skriftstørrelse"
              verdi={tekst.storrelse}
              min={1}
              maks={400}
              steg={0.5}
              endre={(v, k) =>
                endreTekst('Skriftstørrelse', { storrelse: v }, k === 'pil' ? 'str' : undefined)
              }
            />
            <TallFelt
              etikett="Sperring"
              enhet="%"
              verdi={tekst.sperring * 100}
              min={-20}
              maks={200}
              steg={1}
              desimaler={0}
              endre={(v) => endreTekst('Sperring', { sperring: v / 100 })}
            />
            {tekst.tekst.includes('\n') && (
              <TallFelt
                etikett="Linjeavstand"
                enhet="×"
                verdi={tekst.linjeavstand}
                min={0.6}
                maks={3}
                steg={0.05}
                desimaler={2}
                endre={(v) => endreTekst('Linjeavstand', { linjeavstand: v })}
              />
            )}
            <div class="felt">
              <span>Justering</span>
              <Segment
                etikett="Justering"
                valg={[
                  { id: 'venstre', navn: 'Venstre' },
                  { id: 'midt', navn: 'Midt' },
                  { id: 'hoyre', navn: 'Høyre' },
                ]}
                verdi={tekst.justering}
                endre={(j) => endreTekst('Justering', { justering: j })}
              />
            </div>
            {g && g.mangler.length > 0 && (
              <p class="merknad">
                Fonten har ikke {g.mangler.map((c) => `«${c}»`).join(', ')}. Velg en annen font.
              </p>
            )}
          </>
        )}
        {o.kilde.type === 'form' && o.kilde.form === 'rektangel' && (
          <TallFelt
            etikett="Hjørneradius"
            verdi={o.kilde.hjorneradius}
            min={0}
            maks={Math.min(o.kilde.bredde, o.kilde.hoyde) / 2}
            steg={0.5}
            endre={(v) =>
              endre('Hjørneradius', (x) => ({
                ...x,
                kilde: { ...x.kilde, hjorneradius: v } as typeof x.kilde,
              }))
            }
          />
        )}
        {o.kilde.type === 'form' && o.kilde.form === 'polygon' && (
          <TallFelt
            etikett="Antall sider"
            enhet=""
            verdi={o.kilde.sider}
            min={3}
            maks={64}
            steg={1}
            desimaler={0}
            endre={(v) =>
              endre('Antall sider', (x) => ({
                ...x,
                kilde: { ...x.kilde, sider: Math.round(v) } as typeof x.kilde,
              }))
            }
          />
        )}
        {o.kilde.type === 'form' && o.kilde.form === 'hull' && (
          <p class="merknad">Opphengshull går gjennom alle lagene i skiltet.</p>
        )}
        {o.kilde.type === 'svg' && <p class="merknad">Importert fra «{o.kilde.filnavn}».</p>}
      </Panel>

      <Panel tittel="Plassering og størrelse">
        <div class="feltpar">
          <TallFelt
            etikett="Posisjon X"
            kortEtikett="X"
            verdi={o.transform.x}
            steg={1}
            endre={(v, k) =>
              endre(
                'Flytt',
                (x) => ({ ...x, transform: { ...x.transform, x: v } }),
                k === 'pil' ? 'pos' : undefined,
              )
            }
          />
          <TallFelt
            etikett="Posisjon Y"
            kortEtikett="Y"
            verdi={o.transform.y}
            steg={1}
            endre={(v, k) =>
              endre(
                'Flytt',
                (x) => ({ ...x, transform: { ...x.transform, y: v } }),
                k === 'pil' ? 'pos' : undefined,
              )
            }
          />
          <TallFelt
            etikett="Bredde"
            kortEtikett="B"
            verdi={str.bredde}
            min={0.2}
            steg={1}
            endre={(v, k) => settStr(v, null, k)}
          />
          <TallFelt
            etikett="Høyde"
            kortEtikett="H"
            verdi={str.hoyde}
            min={0.2}
            steg={1}
            endre={(v, k) => settStr(null, v, k)}
          />
        </div>
        <label class="avkryssing">
          <input type="checkbox" checked={laas} onChange={() => settLaas(!laas)} /> Behold proporsjoner
        </label>
        <TallFelt
          etikett="Rotasjon"
          enhet="°"
          verdi={o.transform.rotasjon}
          min={-360}
          maks={360}
          steg={15}
          endre={(v, k) =>
            endre(
              'Roter',
              (x) => ({ ...x, transform: { ...x.transform, rotasjon: v } }),
              k === 'pil' ? 'rot' : undefined,
            )
          }
        />
        {(Math.abs(o.transform.skalaX - o.transform.skalaY) > 1e-6 || lokalB <= 0 || lokalH <= 0) &&
          o.kilde.type !== 'form' && (
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() =>
                endre('Tilbakestill skala', (x) => ({
                  ...x,
                  transform: { ...x.transform, skalaX: 1, skalaY: 1 },
                }))
              }
            >
              Tilbakestill skala
            </button>
          )}
      </Panel>

      <Panel tittel="Lag og rolle">
        <label class="felt" for="signgen-objektlag">
          <span>{o.kilde.type === 'tekst' ? 'Tekstlag' : 'Lag'}</span>
          <select
            id="signgen-objektlag"
            value={o.lagId}
            onChange={(e) => {
              const lag = (e.target as HTMLSelectElement).value;
              if (lag === EGET) {
                let ny: string | null = null;
                benk.endre({
                  navn: 'Løs ut av gruppen',
                  anvend: (d) => {
                    const r = losUtTekst(d, o.id);
                    ny = r.lagId;
                    return r.dok;
                  },
                });
                if (ny) benk.velg({ lag: ny });
                return;
              }
              benk.endre({ navn: 'Flytt til lag', anvend: (d) => flyttTilLag(d, [o.id], lag) });
              benk.velg({ lag });
            }}
          >
            {[...t.dok.lag]
              .reverse()
              // text lives in text layers, everything else in plain layers
              .filter((l) => l.id === o.lagId || !!l.tekstlag === (o.kilde.type === 'tekst'))
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.navn}
                  {l.tekstlag && l.id !== o.lagId ? ' (grupper med)' : ''}
                </option>
              ))}
            {o.kilde.type === 'tekst' && iGruppe && (
              <option value={EGET}>Eget tekstlag (løs ut av gruppen)</option>
            )}
          </select>
        </label>
        {o.kilde.type === 'tekst' && !lagForObjekt?.tekstlag && (
          <p class="merknad">
            Denne teksten ligger sammen med former (fra før tekstlagene). Velg et tekstlag for å gi den
            omriss.
          </p>
        )}
        {!(o.kilde.type === 'form' && o.kilde.form === 'hull') && (
          <div class="felt">
            <span>Rolle</span>
            <Segment
              etikett="Rolle i laget"
              valg={[
                { id: 'legg-til', navn: 'Legger til' },
                { id: 'trekk-fra', navn: 'Kutter' },
              ]}
              verdi={o.operasjon}
              endre={(op) =>
                endre(op === 'trekk-fra' ? 'Gjør til kutt' : 'Gjør til fyll', (x) => ({
                  ...x,
                  operasjon: op,
                }))
              }
            />
          </div>
        )}
        <div class="knapperad">
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => benk.endre({ navn: 'Legg fremst', anvend: (d) => ordne(d, o.id, 'fremst') })}
          >
            Fremst
          </button>
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => benk.endre({ navn: 'Legg bakerst', anvend: (d) => ordne(d, o.id, 'bakerst') })}
          >
            Bakerst
          </button>
          <button type="button" class="kontroll-knapp" onClick={() => dupliserValgte(benk)}>
            Dupliser
          </button>
          <button
            type="button"
            class="kontroll-knapp farlig"
            disabled={o.last}
            onClick={() => slettValgte(benk)}
          >
            Slett
          </button>
        </div>
        {tekst && (
          <label class="felt" for="signgen-felt">
            <span>Batchfelt</span>
            <input
              id="signgen-felt"
              type="text"
              placeholder="f.eks. navn"
              value={tekst.felt ?? ''}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9æøå_-]/g, '');
                endre('Batchfelt', (x) => ({
                  ...x,
                  kilde: { ...(x.kilde as TekstKilde), felt: v || undefined },
                }));
              }}
            />
          </label>
        )}
      </Panel>
    </>
  );
}

function FlereObjekter({ benk, antall }: { benk: Arbeidsbenk; antall: number }) {
  const t = brukBenk(benk);
  const tekster = valgte(benk).filter((o) => o.kilde.type === 'tekst');
  const kanGruppere =
    tekster.length >= 2 &&
    tekster.some((o) => finnLag(t.dok, o.lagId)?.tekstlag) &&
    new Set(tekster.map((o) => o.lagId)).size > 1;
  const grupper = () => {
    let lag: string | null = null;
    benk.endre({
      navn: 'Grupper tekst',
      anvend: (d) => {
        const r = grupperTekst(
          d,
          tekster.map((o) => o.id),
        );
        lag = r.lagId;
        return r.dok;
      },
    });
    if (lag) {
      benk.velg({ lag });
      benk.melde(
        `${tekster.length} tekster er gruppert i «${finnLag(benk.dok, lag)?.navn}» og deler omrissene der.`,
      );
    }
  };
  return (
    <Panel tittel={`${antall} objekter valgt`}>
      {kanGruppere && (
        <div class="knapperad">
          <button type="button" class="kontroll-knapp" onClick={grupper}>
            Grupper tekst
          </button>
          <p class="merknad">Grupperte tekster ligger i samme tekstlag og får felles omriss.</p>
        </div>
      )}
      <p class="tom-melding">Juster mot hverandre:</p>
      <div class="justering" role="group" aria-label="Juster">
        {(
          [
            ['venstre', 'Venstre'],
            ['midtX', 'Midt ↔'],
            ['hoyre', 'Høyre'],
            ['topp', 'Topp'],
            ['midtY', 'Midt ↕'],
            ['bunn', 'Bunn'],
          ] as const
        ).map(([id, navn]) => (
          <button key={id} type="button" class="kontroll-knapp" onClick={() => juster(benk, id)}>
            {navn}
          </button>
        ))}
      </div>
      <div class="knapperad">
        <button type="button" class="kontroll-knapp" onClick={() => fordel(benk, 'x')} disabled={antall < 3}>
          Fordel vannrett
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => fordel(benk, 'y')} disabled={antall < 3}>
          Fordel loddrett
        </button>
      </div>
      <div class="knapperad">
        <button type="button" class="kontroll-knapp" onClick={() => dupliserValgte(benk)}>
          Dupliser
        </button>
        <button type="button" class="kontroll-knapp farlig" onClick={() => slettValgte(benk)}>
          Slett
        </button>
      </div>
    </Panel>
  );
}

// ---------- layer ----------

function LagInspektor({ benk, lag }: { benk: Arbeidsbenk; lag: Lag }) {
  const t = brukBenk(benk);
  const [redigerProfil, settRedigerProfil] = useState(false);
  const auto = parametre(t.dok).autoZ;
  const endre = (navn: string, endring: Partial<Lag>, slaSammen?: string) =>
    benk.endre({ navn, slaSammen, anvend: (d) => oppdaterLag(d, lag.id, endring) });
  const andre = t.dok.lag.filter((l) => l.id !== lag.id);
  const settPavirkninger = (p: LagPavirkning[]) => endre('Endre påvirkning', { pavirkninger: p });

  return (
    <>
      <Panel tittel={`Lag: ${lag.navn}`}>
        <label class="felt" for="signgen-lagnavn">
          <span>Navn</span>
          <input
            id="signgen-lagnavn"
            type="text"
            value={lag.navn}
            onChange={(e) =>
              endre('Gi laget nytt navn', { navn: (e.target as HTMLInputElement).value.trim() || lag.navn })
            }
          />
        </label>
        {lag.tekstlag && (
          <div class="felt">
            <span>Teksten</span>
            <Segment
              etikett="Hvordan teksten vises"
              valg={[
                { id: 'normal', navn: 'Står opp' },
                { id: 'kutt', navn: 'Skåret ut' },
              ]}
              verdi={lag.tekstvisning ?? 'normal'}
              endre={(v) =>
                endre(v === 'kutt' ? 'Skjær ut teksten' : 'La teksten stå opp', { tekstvisning: v })
              }
            />
          </div>
        )}
        {lag.tekstlag && lag.tekstvisning === 'kutt' && (
          <p class="merknad">Teksten skjæres ut av omrissene, så det som ligger under, synes gjennom.</p>
        )}
        <Materialvelger
          id="signgen-lagfarge"
          verdi={lag.materialId}
          endre={(m) => endre('Bytt farge', { materialId: m })}
        />
        <TallFelt
          etikett={lag.tekstlag ? 'Teksthøyde' : 'Høyde (tykkelse)'}
          verdi={lag.hoyde}
          min={0.2}
          maks={100}
          steg={0.2}
          endre={(v, k) => endre('Lagets høyde', { hoyde: v }, k === 'pil' ? 'hoyde' : undefined)}
        />
        <TallFelt
          etikett="Starter på Z"
          verdi={lag.zBunn}
          min={0}
          maks={t.dok.plate.hoyde}
          steg={0.2}
          deaktivert={auto}
          endre={(v) => endre('Lagets Z', { zBunn: v })}
        />
        {auto && (
          <p class="merknad">
            Z følger lagrekkefølgen. Slå av «Stable lagene automatisk» under Prosjekt for å sette Z selv.
          </p>
        )}
      </Panel>

      <Panel tittel="Sideprofil">
        <label class="felt" for="signgen-profil">
          <span>Profil</span>
          <select
            id="signgen-profil"
            value={lag.profil.type}
            onChange={(e) => {
              const type = (e.target as HTMLSelectElement).value as ProfilType;
              if (type === 'egendefinert') {
                settRedigerProfil(true);
                endre('Egendefinert profil', {
                  profil: { ...lag.profil, type, bredde: lag.profil.bredde || 1.5 },
                });
                return;
              }
              endre('Bytt profil', {
                profil: forhandsvalg(type, lag.profil.bredde || 1.5, lag.profil.trinn || 3),
              });
            }}
          >
            {PROFILER.map((p) => (
              <option key={p.id} value={p.id}>
                {p.navn}
              </option>
            ))}
          </select>
        </label>
        {lag.profil.type !== 'rett' && (
          <>
            <TallFelt
              etikett="Profilbredde"
              verdi={lag.profil.bredde}
              min={0.1}
              maks={30}
              steg={0.1}
              endre={(v, k) =>
                endre(
                  'Profilbredde',
                  { profil: { ...lag.profil, bredde: v } },
                  k === 'pil' ? 'pb' : undefined,
                )
              }
            />
            {lag.profil.type === 'trapp' && (
              <TallFelt
                etikett="Trinn"
                enhet=""
                verdi={lag.profil.trinn}
                min={2}
                maks={12}
                desimaler={0}
                endre={(v) =>
                  endre('Antall trinn', { profil: forhandsvalg('trapp', lag.profil.bredde, Math.round(v)) })
                }
              />
            )}
            <button
              type="button"
              class="kontroll-knapp"
              aria-expanded={redigerProfil}
              onClick={() => settRedigerProfil(!redigerProfil)}
            >
              {redigerProfil ? 'Skjul kurven' : 'Rediger kurven'}
            </button>
            {redigerProfil && (
              <Profilredigerer
                profil={lag.profil}
                hoyde={lag.hoyde}
                farge={finnMateriale(lag.materialId).hex}
                endre={(p, s) => endre('Endre profil', { profil: p }, s)}
                ferdig={() => benk.historikk.avsluttSammenslaing()}
              />
            )}
            <p class="merknad">
              Profilen blir ekte geometri: 3D-visningen og filen viser det som blir printet, lag for lag.
            </p>
          </>
        )}
      </Panel>

      {lag.tekstlag && <OmrissInspektor benk={benk} lag={lag} />}

      {(!lag.tekstlag || lag.kontur.avstand !== 0 || lag.kontur.kunRing) && (
        <Panel tittel="Kontur">
          <TallFelt
            etikett="Forskyv omrisset"
            verdi={lag.kontur.avstand}
            min={-20}
            maks={40}
            steg={0.5}
            endre={(v, k) =>
              endre('Kontur', { kontur: { ...lag.kontur, avstand: v } }, k === 'pil' ? 'kontur' : undefined)
            }
          />
          <div class="felt">
            <span>Hjørner</span>
            <Segment
              etikett="Hjørner"
              valg={[
                { id: 'rund', navn: 'Runde' },
                { id: 'skarp', navn: 'Skarpe' },
                { id: 'faset', navn: 'Fasede' },
              ]}
              verdi={lag.kontur.hjorne}
              endre={(h) => endre('Konturhjørner', { kontur: { ...lag.kontur, hjorne: h } })}
            />
          </div>
          <label class="avkryssing">
            <input
              type="checkbox"
              checked={lag.kontur.kunRing}
              onChange={() =>
                endre('Kontur som ring', { kontur: { ...lag.kontur, kunRing: !lag.kontur.kunRing } })
              }
            />{' '}
            Bare en ring (omriss)
          </label>
          {lag.kontur.kunRing && (
            <TallFelt
              etikett="Ringbredde"
              verdi={lag.kontur.ringBredde}
              min={MIN_OMRISSBREDDE}
              maks={20}
              steg={0.2}
              endre={(v) => endre('Ringbredde', { kontur: { ...lag.kontur, ringBredde: v } })}
            />
          )}
        </Panel>
      )}

      <Panel
        tittel="Påvirkning fra andre lag"
        handling={
          andre.length > 0 && (
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() =>
                settPavirkninger([
                  ...lag.pavirkninger,
                  { kildeLagId: andre.at(-1)!.id, handling: 'kutt', avstand: 0.4 },
                ])
              }
            >
              + Legg til
            </button>
          )
        }
      >
        {lag.pavirkninger.length === 0 && (
          <p class="tom-melding">
            Omrisset til et annet lag kan legge til eller skjære ut fra dette laget, med en avstand.
          </p>
        )}
        {lag.pavirkninger.map((p, i) => {
          const oppdater = (e: Partial<LagPavirkning>) =>
            settPavirkninger(lag.pavirkninger.map((x, j) => (j === i ? { ...x, ...e } : x)));
          return (
            <div class="pavirkning" key={i}>
              <label class="felt" for={`pav-${i}`}>
                <span>Fra lag</span>
                <select
                  id={`pav-${i}`}
                  value={p.kildeLagId}
                  onChange={(e) => oppdater({ kildeLagId: (e.target as HTMLSelectElement).value })}
                >
                  {andre.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.navn}
                    </option>
                  ))}
                </select>
              </label>
              <div class="felt">
                <span>Virkning</span>
                <Segment
                  etikett="Virkning"
                  valg={[
                    { id: 'kutt', navn: 'Skjærer ut' },
                    { id: 'legg-til', navn: 'Legger til' },
                  ]}
                  verdi={p.handling}
                  endre={(h) => oppdater({ handling: h })}
                />
              </div>
              <TallFelt
                etikett="Avstand"
                verdi={p.avstand}
                min={-20}
                maks={40}
                steg={0.1}
                endre={(v) => oppdater({ avstand: v })}
              />
              <button
                type="button"
                class="kontroll-knapp farlig"
                onClick={() => settPavirkninger(lag.pavirkninger.filter((_, j) => j !== i))}
              >
                Fjern
              </button>
            </div>
          );
        })}
      </Panel>
    </>
  );
}

// ---------- outlines of a text layer ----------

function OmrissBlokk({ benk, lag, o, i }: { benk: Arbeidsbenk; lag: Lag; o: Omriss; i: number }) {
  const st = brukSigntilstand(benk);
  const antall = lag.omriss?.length ?? 0;
  const endre = (navn: string, endring: Partial<Omriss>, slaSammen?: string) =>
    benk.endre({ navn, slaSammen, anvend: (d) => oppdaterOmriss(d, lag.id, o.id, endring) });
  const id = (x: string) => `omriss-${o.id}-${x}`;
  return (
    <div
      class={`omrissblokk${st.omriss === o.id ? ' aktiv' : ''}`}
      onFocusCapture={() => signtilstand(benk).sett({ omriss: o.id })}
    >
      <label class="felt" for={id('navn')}>
        <span>Navn</span>
        <input
          id={id('navn')}
          type="text"
          value={o.navn}
          onChange={(e) =>
            endre('Gi omrisset nytt navn', { navn: (e.target as HTMLInputElement).value.trim() || o.navn })
          }
        />
      </label>
      <div class="felt">
        <span>Type</span>
        <Segment
          etikett={`Type for ${o.navn}`}
          valg={[
            { id: 'fyll', navn: 'Fyll' },
            { id: 'omriss', navn: 'Omriss' },
          ]}
          verdi={o.type}
          endre={(v) => endre(v === 'fyll' ? 'Fyll omrisset' : 'Gjør til omriss', { type: v })}
        />
      </div>
      <TallFelt
        etikett={o.type === 'fyll' ? 'Bredde' : 'Strekbredde'}
        verdi={o.bredde}
        min={MIN_OMRISSBREDDE}
        maks={40}
        steg={0.5}
        endre={(v, k) => endre('Omrissbredde', { bredde: v }, k === 'pil' ? `bredde-${o.id}` : undefined)}
      />
      <TallFelt
        etikett="Avstand innenfra"
        verdi={o.avstand}
        min={0}
        maks={20}
        steg={0.2}
        endre={(v, k) => endre('Omrissavstand', { avstand: v }, k === 'pil' ? `avstand-${o.id}` : undefined)}
      />
      <TallFelt
        etikett="Høyde"
        verdi={o.hoyde}
        min={0.2}
        maks={50}
        steg={0.2}
        endre={(v, k) => endre('Omrisshøyde', { hoyde: v }, k === 'pil' ? `hoyde-${o.id}` : undefined)}
      />
      <Materialvelger
        id={id('farge')}
        verdi={o.materialId}
        endre={(m) => endre('Bytt farge', { materialId: m })}
      />
      <div class="felt">
        <span>Hjørner</span>
        <Segment
          etikett={`Hjørner for ${o.navn}`}
          valg={[
            { id: 'rund', navn: 'Rund' },
            { id: 'skarp', navn: 'Skarp' },
            { id: 'faset', navn: 'Fas' },
          ]}
          verdi={o.hjorne}
          endre={(h) => endre('Omrisshjørner', { hjorne: h })}
        />
      </div>
      <div class="knapperad">
        <button
          type="button"
          class="kontroll-knapp"
          disabled={i === 0}
          onClick={() =>
            benk.endre({ navn: 'Flytt omriss innover', anvend: (d) => flyttOmriss(d, lag.id, o.id, -1) })
          }
        >
          Innover
        </button>
        <button
          type="button"
          class="kontroll-knapp"
          disabled={i >= antall - 1}
          onClick={() =>
            benk.endre({ navn: 'Flytt omriss utover', anvend: (d) => flyttOmriss(d, lag.id, o.id, 1) })
          }
        >
          Utover
        </button>
        <button
          type="button"
          class="kontroll-knapp farlig"
          onClick={() => {
            benk.endre({ navn: 'Slett omriss', anvend: (d) => slettOmriss(d, lag.id, o.id) });
            benk.melde(`«${o.navn}» er slettet. Angre med Ctrl+Z.`);
          }}
        >
          Slett
        </button>
      </div>
    </div>
  );
}

/**
 * Outlines around the text (Sivert, 2026-10-05): any number, each «fyll»
 * or «omriss», with its own width, gap, height and colour. They never
 * cover the text, and the text's height does not change theirs.
 */
function OmrissInspektor({ benk, lag }: { benk: Arbeidsbenk; lag: Lag }) {
  const omriss = lag.omriss ?? [];
  return (
    <Panel
      tittel="Omriss rundt teksten"
      handling={
        <button
          type="button"
          class="kontroll-knapp"
          disabled={lag.last}
          onClick={() => nyttOmrissI(benk, lag)}
        >
          + Legg til
        </button>
      }
    >
      {omriss.length === 0 && (
        <p class="tom-melding">
          Et omriss følger teksten med teksten i midten. Det dekker aldri selve teksten og har sin egen høyde
          og farge.
        </p>
      )}
      {omriss.map((o, i) => (
        <OmrissBlokk key={o.id} benk={benk} lag={lag} o={o} i={i} />
      ))}
      {omriss.length > 0 && (
        <p class="merknad">
          Innerst først. Omrissene starter på samme høyde som teksten. Grupperte tekster deler omrissene.
        </p>
      )}
    </Panel>
  );
}

// ---------- project ----------

function ProsjektInspektor({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const p = parametre(t.dok);
  const brukte = [...new Set(fargeplasser(t.dok).map((p) => p.materialId))].map(finnMateriale);
  const settParam = (navn: string, e: Partial<typeof p>) =>
    benk.endre({ navn, anvend: (d: Dokument) => stable({ ...d, parametre: { ...d.parametre, ...e } }) });
  return (
    <Panel tittel="Prosjekt">
      <dl class="fakta">
        <div>
          <dt>Byggeplate</dt>
          <dd class="mono">
            {t.dok.plate.bredde} × {t.dok.plate.dybde} × {t.dok.plate.hoyde} mm
          </dd>
        </div>
        <div>
          <dt>Farger i bruk</dt>
          <dd>{brukte.map((m) => m.navn).join(', ')}</dd>
        </div>
      </dl>
      {!standardPrinter.bekreftet && (
        <p class="merknad">Skriverprofil og farger er foreløpige og ikke bekreftet av Designporten.</p>
      )}
      <label class="avkryssing">
        <input
          type="checkbox"
          checked={p.autoZ}
          onChange={() => settParam('Automatisk stabling', { autoZ: !p.autoZ })}
        />{' '}
        Stable lagene automatisk
      </label>
      <TallFelt
        etikett="Printlaghøyde"
        verdi={p.lagHoyde}
        min={0.08}
        maks={0.4}
        steg={0.04}
        desimaler={2}
        endre={(v) => settParam('Printlaghøyde', { lagHoyde: v })}
      />
    </Panel>
  );
}

function BatchInngang({ benk }: { benk: Arbeidsbenk }) {
  const [apen, settApen] = useState(false);
  if (!plangrenser.csvBatch) return null;
  return (
    <Panel tittel="Mange skilt">
      <p class="tom-melding">
        Lag ett skilt per rad i en CSV-fil, for eksempel navneskilt til et arrangement.
      </p>
      <button type="button" class="kontroll-knapp" onClick={() => settApen(true)}>
        Lag skilt fra CSV …
      </button>
      {apen && <Batchdialog benk={benk} lukk={() => settApen(false)} />}
    </Panel>
  );
}

export function SigngenInspektor({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const valgte = t.utvalg.objekter.map((id) => t.dok.objekter[id]).filter((o): o is Objekt => !!o);
  const lag = t.utvalg.lag ? finnLag(t.dok, t.utvalg.lag) : undefined;
  if (valgte.length === 1) return <EttObjekt benk={benk} o={valgte[0]!} key={valgte[0]!.id} />;
  if (valgte.length > 1) return <FlereObjekter benk={benk} antall={valgte.length} />;
  return (
    <>
      {lag && <LagInspektor benk={benk} lag={lag} key={lag.id} />}
      <ProsjektInspektor benk={benk} />
      <BatchInngang benk={benk} />
    </>
  );
}
