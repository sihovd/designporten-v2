/**
 * BuildForge inspector: Enkel/Avansert on the same project, the check
 * status, the selected shape and the profile facts (handoff §4 and §9).
 * Enkel hides tools, never project data: a shape with settings Enkel cannot
 * show says so and keeps them.
 */
import { useId } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { mm, tall } from '../../core/enheter';
import { finnMateriale, materialer, materialtyper, type Materialtype } from '../../core/materialer';
import { brukBenk } from '../../shell/bruk-benk';
import { Panel, Segment, TallFelt } from '../../shell/kontroller';
import { erBuildforgeResultat, type Digitalstatus } from './bygg';
import { dupliserForm, endre, endreForm, flyttForm, skalerForm, slettForm } from './handlinger';
import {
  formnavn,
  GRENSER,
  kroppnavn,
  operasjonnavn,
  revisjon,
  tolkParametre,
  type Form,
  type Kropp,
  type Operasjon,
} from './parametre';
import { sikkerhetTekst, type Maal } from './profil';
import { brukEditor, editor } from './tilstand';
import './buildforge.css';

export const statusTekst: Record<
  Digitalstatus | 'beregner',
  { navn: string; symbol: string; forklaring: string }
> = {
  gronn: { navn: 'Grønn', symbol: '✓', forklaring: 'Kontrollene for prøveprofilen er bestått.' },
  gul: { navn: 'Gul', symbol: '!', forklaring: 'Noe bør vurderes. Prototypen kan likevel eksporteres.' },
  rod: { navn: 'Rød', symbol: '×', forklaring: 'Noe må rettes før filene kan lastes ned.' },
  beregner: { navn: 'Beregner', symbol: '…', forklaring: 'Modellen er endret og kontrolleres på nytt.' },
};

/** Digital status for the current project, grey while the shown result belongs to an older revision. */
export function brukStatus(benk: Arbeidsbenk): Digitalstatus | 'beregner' {
  const t = brukBenk(benk);
  const m = t.modell;
  if (t.bygger || !erBuildforgeResultat(m) || m.kontroll.revisjon !== revisjon(t.dok.parametre))
    return 'beregner';
  return m.kontroll.status;
}

function Materialvalg({
  etikett,
  verdi,
  endre: sett,
}: {
  etikett: string;
  verdi: string;
  endre: (id: string) => void;
}) {
  const id = useId();
  const typer = Object.keys(materialtyper) as Materialtype[];
  return (
    <label class="felt" for={id}>
      <span>{etikett}</span>
      <span class="materialvalg">
        <span class="fargeprove" style={{ background: finnMateriale(verdi).hex }} aria-hidden="true" />
        <select id={id} value={verdi} onChange={(e) => sett((e.target as HTMLSelectElement).value)}>
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

function Avkryssing({
  etikett,
  verdi,
  endre: sett,
}: {
  etikett: string;
  verdi: boolean;
  endre: (v: boolean) => void;
}) {
  return (
    <label class="avkryssing">
      <input type="checkbox" checked={verdi} onChange={(e) => sett((e.target as HTMLInputElement).checked)} />
      {etikett}
    </label>
  );
}

function Statuskort({ benk }: { benk: Arbeidsbenk }) {
  const s = brukStatus(benk);
  const st = statusTekst[s];
  return (
    <div class="bf-status" data-status={s}>
      <p class="bf-status-linje">
        <span class="bf-status-symbol" aria-hidden="true">
          {st.symbol}
        </span>
        <span>
          Digital kontroll: <strong>{st.navn}</strong>
        </span>
      </p>
      <p class="bf-status-forklaring">{st.forklaring}</p>
      <p class="bf-status-linje fysisk">
        <span class="bf-status-symbol" aria-hidden="true">
          ○
        </span>
        <span>
          Fysisk profil: <strong>Ikke testet</strong>
        </span>
      </p>
      <p class="bf-status-forklaring">
        Ingen del er testprintet ennå. Grønn betyr at modellen består kontrollene på skjermen, ikke at den er
        trygg eller garantert printbar.
      </p>
      <button
        type="button"
        class="kontroll-knapp"
        onClick={() => {
          void benk.bygg();
          document.getElementById('bf-kontroll')?.focus();
        }}
      >
        Kontroller modell
      </button>
    </div>
  );
}

function Flyttknapper({ benk, f, steg }: { benk: Arbeidsbenk; f: Form; steg: number }) {
  const knapp = (navn: string, d: [number, number, number]) => (
    <button type="button" class="kontroll-knapp" onClick={() => flyttForm(benk, f.id, d)}>
      {navn}
    </button>
  );
  return (
    <div class="bf-flytt" role="group" aria-label={`Flytt ${steg} mm`}>
      {knapp('Venstre', [-steg, 0, 0])}
      {knapp('Opp', [0, 0, steg])}
      {knapp('Høyre', [steg, 0, 0])}
      {knapp('Fram', [0, -steg, 0])}
      {knapp('Ned', [0, 0, -steg])}
      {knapp('Bak', [0, steg, 0])}
    </div>
  );
}

function Formpanel({ benk, f, avansert }: { benk: Arbeidsbenk; f: Form; avansert: boolean }) {
  const navnId = useId();
  const sett = (navn: string, g: (x: Form) => Form, slaSammen?: string) =>
    endreForm(benk, f.id, navn, g, slaSammen);
  const kilde = (k: 'skriv' | 'pil', n: string) => (k === 'pil' ? `${n}-${f.id}` : undefined);
  const skjultIEnkel =
    !avansert && (f.operasjon !== 'smelt' || f.rotasjon.some((v) => v !== 0) || f.type === 'boks');
  const hovedmal = f.mal[0];

  return (
    <Panel
      tittel={formnavn[f.type]}
      handling={
        <button type="button" class="tekstknapp" onClick={() => editor.sett({ valgt: null })}>
          Lukk
        </button>
      }
    >
      <label class="felt" for={navnId}>
        <span>Navn</span>
        <input
          id={navnId}
          type="text"
          value={f.navn}
          maxLength={60}
          onChange={(e) => {
            const navn = (e.target as HTMLInputElement).value.trim() || formnavn[f.type];
            sett('Gi nytt navn', (x) => ({ ...x, navn }));
          }}
        />
      </label>
      <p class="bf-tilhorighet">
        Hører til <strong>{kroppnavn[f.kropp].toLowerCase()}en</strong>
        {f.kropp === 'topp' ? ' og beveger seg med klikket.' : ' og står stille.'}
      </p>

      {!avansert && (
        <>
          <TallFelt
            etikett={f.type === 'boks' ? 'Bredde' : 'Diameter'}
            verdi={hovedmal}
            min={GRENSER.mal.min}
            maks={GRENSER.mal.maks}
            endre={(v, k) => skalerForm(benk, f.id, v / hovedmal, kilde(k, 'skaler'))}
          />
          <div class="knapperad">
            <button type="button" class="kontroll-knapp" onClick={() => skalerForm(benk, f.id, 0.9)}>
              Mindre
            </button>
            <button type="button" class="kontroll-knapp" onClick={() => skalerForm(benk, f.id, 1.1)}>
              Større
            </button>
          </div>
          <h3 class="bf-underoverskrift">Flytt</h3>
          <Flyttknapper benk={benk} f={f} steg={2} />
        </>
      )}

      <Avkryssing
        etikett="Lik på begge sider (speilet)"
        verdi={f.speilet}
        endre={(v) => sett(v ? 'Slå på speiling' : 'Slå av speiling', (x) => ({ ...x, speilet: v }))}
      />

      {skjultIEnkel && <p class="merknad">Flere innstillinger i Avansert.</p>}

      {avansert && (
        <>
          <h3 class="bf-underoverskrift">Posisjon</h3>
          <div class="feltpar tre">
            {(['X', 'Y', 'Z'] as const).map((a, i) => (
              <TallFelt
                key={a}
                etikett={`Posisjon ${a}`}
                kortEtikett={a}
                verdi={f.posisjon[i]!}
                min={GRENSER.posisjon.min}
                maks={GRENSER.posisjon.maks}
                endre={(v, k) =>
                  sett(
                    'Flytt form',
                    (x) => {
                      const pos = [...x.posisjon] as Form['posisjon'];
                      pos[i] = v;
                      return { ...x, posisjon: pos };
                    },
                    kilde(k, 'pos'),
                  )
                }
              />
            ))}
          </div>
          <h3 class="bf-underoverskrift">Rotasjon</h3>
          <div class="feltpar tre">
            {(['X', 'Y', 'Z'] as const).map((a, i) => (
              <TallFelt
                key={a}
                etikett={`Rotasjon om ${a}`}
                kortEtikett={a}
                enhet="°"
                desimaler={0}
                steg={5}
                verdi={f.rotasjon[i]!}
                min={-360}
                maks={360}
                endre={(v, k) =>
                  sett(
                    'Roter form',
                    (x) => {
                      const r = [...x.rotasjon] as Form['rotasjon'];
                      r[i] = v;
                      return { ...x, rotasjon: r };
                    },
                    kilde(k, 'rot'),
                  )
                }
              />
            ))}
          </div>
          <h3 class="bf-underoverskrift">Mål</h3>
          {f.type === 'kule' && (
            <TallFelt
              etikett="Diameter"
              verdi={f.mal[0]}
              min={GRENSER.mal.min}
              maks={GRENSER.mal.maks}
              endre={(v, k) => sett('Endre diameter', (x) => ({ ...x, mal: [v, v, v] }), kilde(k, 'mal'))}
            />
          )}
          {f.type === 'boks' &&
            (['Bredde', 'Dybde', 'Høyde'] as const).map((n, i) => (
              <TallFelt
                key={n}
                etikett={n}
                verdi={f.mal[i]!}
                min={GRENSER.mal.min}
                maks={GRENSER.mal.maks}
                endre={(v, k) =>
                  sett(
                    `Endre ${n.toLowerCase()}`,
                    (x) => {
                      const m = [...x.mal] as Form['mal'];
                      m[i] = v;
                      return { ...x, mal: m };
                    },
                    kilde(k, `mal${i}`),
                  )
                }
              />
            ))}
          {f.type === 'sylinder' && (
            <>
              <TallFelt
                etikett="Diameter"
                verdi={f.mal[0]}
                min={GRENSER.mal.min}
                maks={GRENSER.mal.maks}
                endre={(v, k) =>
                  sett('Endre diameter', (x) => ({ ...x, mal: [v, v, x.mal[2]] }), kilde(k, 'mal0'))
                }
              />
              <TallFelt
                etikett="Høyde"
                verdi={f.mal[2]}
                min={GRENSER.mal.min}
                maks={GRENSER.mal.maks}
                endre={(v, k) =>
                  sett('Endre høyde', (x) => ({ ...x, mal: [x.mal[0], x.mal[1], v] }), kilde(k, 'mal2'))
                }
              />
            </>
          )}
          {f.type !== 'kule' && (
            <TallFelt
              etikett="Avrunding"
              verdi={f.avrunding}
              min={GRENSER.avrunding.min}
              maks={GRENSER.avrunding.maks}
              steg={0.5}
              endre={(v, k) => sett('Endre avrunding', (x) => ({ ...x, avrunding: v }), kilde(k, 'avr'))}
            />
          )}
          <h3 class="bf-underoverskrift">Sammenføyning</h3>
          <Segment<Operasjon>
            etikett="Hvordan formen føyes til"
            valg={(Object.keys(operasjonnavn) as Operasjon[]).map((id) => ({
              id,
              navn: id === 'smelt' ? 'Smelt' : id === 'legg-til' ? 'Skarp' : 'Trekk fra',
            }))}
            verdi={f.operasjon}
            endre={(v) => sett(operasjonnavn[v], (x) => ({ ...x, operasjon: v }))}
          />
          <p class="merknad">{operasjonnavn[f.operasjon]}. Formene brukes i rekkefølgen i listen.</p>
          {f.operasjon === 'smelt' && (
            <TallFelt
              etikett="Smelteradius"
              verdi={f.smelting}
              min={GRENSER.smelting.min}
              maks={GRENSER.smelting.maks}
              steg={0.5}
              endre={(v, k) => sett('Endre smelting', (x) => ({ ...x, smelting: v }), kilde(k, 'smelt'))}
            />
          )}
          <label class="felt">
            <span>Hører til</span>
            <select
              value={f.kropp}
              onChange={(e) => {
                const kropp = (e.target as HTMLSelectElement).value as Kropp;
                sett(`Flytt til ${kroppnavn[kropp].toLowerCase()}en`, (x) => ({ ...x, kropp }));
              }}
            >
              <option value="topp">Topp (beveger seg)</option>
              <option value="underdel">Underdel (står stille)</option>
            </select>
          </label>
          <div class="knapperad">
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() =>
                endre(benk, 'Flytt tidligere i rekkefølgen', (p) => {
                  const i = p.former.findIndex((x) => x.id === f.id);
                  if (i <= 0) return p;
                  const former = [...p.former];
                  [former[i - 1], former[i]] = [former[i]!, former[i - 1]!];
                  return { ...p, former };
                })
              }
            >
              Tidligere
            </button>
            <button
              type="button"
              class="kontroll-knapp"
              onClick={() =>
                endre(benk, 'Flytt senere i rekkefølgen', (p) => {
                  const i = p.former.findIndex((x) => x.id === f.id);
                  if (i < 0 || i >= p.former.length - 1) return p;
                  const former = [...p.former];
                  [former[i + 1], former[i]] = [former[i]!, former[i + 1]!];
                  return { ...p, former };
                })
              }
            >
              Senere
            </button>
          </div>
        </>
      )}

      <div class="knapperad">
        <button type="button" class="kontroll-knapp" onClick={() => dupliserForm(benk, f.id)}>
          Dupliser
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => slettForm(benk, f.id)}>
          Slett
        </button>
      </div>
    </Panel>
  );
}

function Maalrad({ m }: { m: Maal }) {
  const enhet = m.navn.includes('mm³') ? '' : ' mm';
  return (
    <div>
      <dt>{m.navn.replace(' (mm³)', '')}</dt>
      <dd>
        <span class="mono">
          {m.navn.includes('mm³') ? `${tall(m.verdi / 1000)} cm³` : `${tall(m.verdi, 2)}${enhet}`}
        </span>{' '}
        <span class={`bf-sikkerhet ${m.sikkerhet}`}>{sikkerhetTekst[m.sikkerhet]}</span>
      </dd>
    </div>
  );
}

export function BuildforgeInspektor({ benk }: { benk: Arbeidsbenk }) {
  const t = brukBenk(benk);
  const e = brukEditor();
  const tolk = tolkParametre(t.dok.parametre);
  const p = tolk.ok ? tolk.p : null;
  const valgt = p?.former.find((f) => f.id === e.valgt);
  const avansert = e.modus === 'avansert';
  const m = erBuildforgeResultat(t.modell) ? t.modell : null;
  const profil = m?.kontroll.profil;
  const topp = m?.kontroll.kropper.find((k) => k.kropp === 'topp');

  return (
    <div class="bf-inspektor">
      <Panel tittel="Modus">
        <Segment<'enkel' | 'avansert'>
          etikett="Modus"
          valg={[
            { id: 'enkel', navn: 'Enkel' },
            { id: 'avansert', navn: 'Avansert' },
          ]}
          verdi={e.modus}
          endre={(v) => editor.sett({ modus: v })}
        />
        <p class="merknad">Begge viser samme modell. Ingenting går tapt når du bytter.</p>
      </Panel>
      <Panel tittel="Kontroll">
        <Statuskort benk={benk} />
      </Panel>

      {valgt && <Formpanel benk={benk} f={valgt} avansert={avansert} />}

      {!valgt && p && (
        <Panel tittel="Farger">
          <Materialvalg
            etikett="Topp"
            verdi={p.farger.topp}
            endre={(id) =>
              endre(benk, 'Endre farge på toppen', (q) => ({ ...q, farger: { ...q.farger, topp: id } }))
            }
          />
          <Materialvalg
            etikett="Underdel"
            verdi={p.farger.underdel}
            endre={(id) =>
              endre(benk, 'Endre farge på underdelen', (q) => ({
                ...q,
                farger: { ...q.farger, underdel: id },
              }))
            }
          />
          <p class="merknad">Velg en form i listen eller på modellen for å endre den.</p>
        </Panel>
      )}

      {avansert && (
        <Panel tittel="Hjelpelag">
          <Avkryssing
            etikett="Vis bryteren"
            verdi={e.visBryter}
            endre={(v) => editor.sett({ visBryter: v })}
          />
          <Avkryssing
            etikett="Vis låste soner"
            verdi={e.visLaast}
            endre={(v) => editor.sett({ visLaast: v })}
          />
          <Avkryssing
            etikett="Vis toppen helt nede"
            verdi={e.visVolum}
            endre={(v) => editor.sett({ visVolum: v })}
          />
          {topp && (
            <dl class="fakta bf-fakta">
              <div>
                <dt>Toppens volum</dt>
                <dd class="mono">{tall(topp.volum / 1000)} cm³ massivt</dd>
              </div>
              <div>
                <dt>Tyngdepunkt</dt>
                <dd class="mono">{mm(Math.hypot(topp.tyngdepunkt[0], topp.tyngdepunkt[1]))} fra midten</dd>
              </div>
            </dl>
          )}
        </Panel>
      )}

      {profil && (
        <Panel tittel="Mekanikkprofil">
          <p class="bf-profilnavn">
            {profil.navn} <span class="mono">v{profil.versjon}</span>
          </p>
          <p class="merknad">{profil.merknad}</p>
          {avansert ? (
            <dl class="fakta bf-maal">
              {[
                ...Object.values(profil.bryter),
                ...Object.values(profil.topp),
                profil.klaring,
                ...Object.values(profil.grenser),
              ].map((x) => (
                <Maalrad key={x.navn} m={x} />
              ))}
            </dl>
          ) : (
            <p class="merknad">Se alle målene og hvor sikre de er i Avansert.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
