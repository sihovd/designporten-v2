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
import {
  finnKobling,
  finnKropp,
  forbindelseTilForelder,
  forbindelseVed,
  koblingsnavn,
  kuleMaksBoy,
} from './graf';
import {
  byttKjonn,
  giKoblingNavn,
  koblFraKobling,
  settBoy,
  settKoblingsfamilie,
  settLeddtype,
  slettKobling,
  dupliserForm,
  dupliserKropp,
  endre,
  endreForm,
  flyttForm,
  gaInn,
  giKroppNavn,
  koblFraKropp,
  settFarge,
  settVri,
  skalerForm,
  slettForm,
  slettKropp,
  speilKropp,
} from './handlinger';
import {
  familienavn,
  familieFor,
  formnavn,
  koblingsfamilier,
  GRENSER,
  kategorinavn,
  kjonnnavn,
  klikkerKropper,
  kroppBestemt,
  kroppnavn,
  operasjonnavn,
  revisjon,
  tolkParametre,
  type BuildforgeParametre,
  type Form,
  type Kjonn,
  type KlikkerKropp,
  type Koblingsfamilie,
  type Modulkropp,
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

const kroppForklaring: Record<KlikkerKropp, string> = {
  topp: 'Topp (beveger seg)',
  underdel: 'Underdel (står stille)',
};

function Formpanel({
  benk,
  f,
  p,
  avansert,
}: {
  benk: Arbeidsbenk;
  f: Form;
  p: BuildforgeParametre;
  avansert: boolean;
}) {
  const modul = familieFor(p) === 'modul';
  const del = modul ? finnKropp(p, f.kropp) : undefined;
  const klikkerKropp = f.kropp as KlikkerKropp;
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
      {del ? (
        <>
          <p class="bf-tilhorighet">
            Hører til <strong>{del.navn.toLowerCase()}</strong> og følger delen når den flyttes.
          </p>
          <Materialvalg
            etikett={`Farge på ${del.navn.toLowerCase()}`}
            verdi={del.farge}
            endre={(id) => settFarge(benk, del.id, id)}
          />
        </>
      ) : (
        <>
          <p class="bf-tilhorighet">
            Hører til <strong>{kroppBestemt[klikkerKropp]}</strong>
            {f.kropp === 'topp' ? ' og beveger seg med klikket.' : ' og står stille.'}
          </p>
          <Materialvalg
            etikett={`Farge på ${kroppBestemt[klikkerKropp]}`}
            verdi={p.farger[klikkerKropp] ?? ''}
            endre={(id) => settFarge(benk, f.kropp, id)}
          />
        </>
      )}

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

      <p class="merknad">Du kan også dra i håndtakene på modellen: G flytter, R roterer og S skalerer.</p>
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
          {(f.type === 'sylinder' || f.type === 'kjegle') && (
            <>
              <TallFelt
                etikett={f.type === 'kjegle' ? 'Diameter nederst' : 'Diameter'}
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
              etikett={f.type === 'kjegle' ? 'Avrunding av spissen' : 'Avrunding'}
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
          {!modul && (
            <label class="felt">
              <span>Hører til</span>
              <select
                value={f.kropp}
                onChange={(e) => {
                  const kropp = (e.target as HTMLSelectElement).value as KlikkerKropp;
                  sett(`Flytt til ${kroppBestemt[kropp]}`, (x) => ({ ...x, kropp }));
                }}
              >
                {klikkerKropper.map((k) => (
                  <option key={k} value={k}>
                    {kroppForklaring[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
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

/** A slider with its value, for turning and bending joints; dragging is one undo step per joint. */
function Skyver({
  etikett,
  verdi,
  min,
  maks,
  steg = 1,
  enhet = '°',
  endre: sett,
}: {
  etikett: string;
  verdi: number;
  min: number;
  maks: number;
  steg?: number;
  enhet?: string;
  endre: (v: number) => void;
}) {
  const id = useId();
  return (
    <div class="bf-skyver">
      <label for={id}>
        <span>{etikett}</span>
        <span class="mono">
          {tall(verdi, 0)}
          {enhet}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={maks}
        step={steg}
        value={verdi}
        aria-valuetext={`${tall(verdi, 0)} grader`}
        onInput={(e) => sett(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}

/** The joint a part hangs on: its type, and how it is turned and bent (handoff §32–36). */
function Leddpanel({ benk, k, p }: { benk: Arbeidsbenk; k: Modulkropp; p: BuildforgeParametre }) {
  const f = forbindelseTilForelder(p, k.id);
  if (!f) return null;
  const egen = f.a.kropp === k.id ? f.a : f.b;
  const kb = finnKobling(p, egen);
  const forelder = finnKropp(p, f.a.kropp === k.id ? f.b.kropp : f.a.kropp);
  const fam = kb?.familie ?? 'svivel';
  const fortegn = f.b.kropp === k.id ? 1 : -1;
  const maks = kuleMaksBoy(p);
  return (
    <Panel tittel="Ledd">
      <p class="bf-tilhorighet">
        Henger på <strong>{forelder?.navn.toLowerCase()}</strong>.
      </p>
      <Segment<Koblingsfamilie>
        etikett="Leddtype"
        valg={koblingsfamilier.map((id) => ({ id, navn: familienavn[id] }))}
        verdi={fam}
        endre={(v) => settLeddtype(benk, f.id, v)}
      />
      <p class="merknad">
        {fam === 'kule'
          ? 'Kule i sokkel: kan vris og bøyes. Kula klikkes inn i sokkelen.'
          : 'Plugg i hull: kan vris om aksen.'}
      </p>
      <Skyver
        etikett="Vri"
        verdi={fortegn * f.vri}
        min={-180}
        maks={180}
        endre={(v) => settVri(benk, f.id, fortegn * v, `vri-${f.id}`)}
      />
      {fam === 'kule' && (
        <>
          <Skyver
            etikett="Bøy"
            verdi={f.boy ?? 0}
            min={0}
            maks={maks}
            endre={(v) => settBoy(benk, f.id, v, f.boyRetning ?? 0, `boy-${f.id}`)}
          />
          <Skyver
            etikett="Bøyeretning"
            verdi={f.boyRetning ?? 0}
            min={-180}
            maks={180}
            steg={5}
            endre={(v) => settBoy(benk, f.id, f.boy ?? 0, v, `boy-${f.id}`)}
          />
          <p class="merknad">Leddet er tegnet for opptil {maks}° bøy. Målene er prøveverdier.</p>
        </>
      )}
    </Panel>
  );
}

/** A connector selected inside a part (handoff §34–36). */
function Koblingspanel({
  benk,
  k,
  p,
  id,
}: {
  benk: Arbeidsbenk;
  k: Modulkropp;
  p: BuildforgeParametre;
  id: string;
}) {
  const navnId = useId();
  const kb = k.koblinger.find((x) => x.id === id);
  if (!kb) return null;
  const ende = { kropp: k.id, kobling: kb.id };
  const f = forbindelseVed(p, ende);
  const annen = f ? (f.a.kropp === k.id ? f.b : f.a) : null;
  return (
    <Panel
      tittel="Kobling"
      handling={
        <button type="button" class="tekstknapp" onClick={() => editor.sett({ kobling: null })}>
          Lukk
        </button>
      }
    >
      <label class="felt" for={navnId}>
        <span>Navn</span>
        <input
          id={navnId}
          type="text"
          value={kb.navn}
          maxLength={40}
          onChange={(e) => {
            const navn = (e.target as HTMLInputElement).value.trim();
            if (navn) giKoblingNavn(benk, ende, navn);
          }}
        />
      </label>
      <p class="bf-tilhorighet">
        {annen ? (
          <>
            Koblet til <strong>{koblingsnavn(p, annen).toLowerCase()}</strong>.
          </>
        ) : (
          'Ledig. Dra en del hit for å koble den på.'
        )}
      </p>
      <Segment<Kjonn>
        etikett="Hann eller hunn"
        valg={[
          { id: 'hann', navn: 'Hann' },
          { id: 'hunn', navn: 'Hunn' },
        ]}
        verdi={kb.kjonn}
        endre={(v) => v !== kb.kjonn && byttKjonn(benk, ende)}
      />
      <p class="merknad">
        {kb.kjonn === 'hann' ? 'Hann blir plugg eller kule.' : 'Hunn blir hull eller sokkel.'} Å bytte bryter
        en forbindelse, men den andre delen endres aldri.
      </p>
      <Segment<Koblingsfamilie>
        etikett="Leddtype"
        valg={koblingsfamilier.map((x) => ({ id: x, navn: familienavn[x] }))}
        verdi={kb.familie}
        endre={(v) => (f ? settLeddtype(benk, f.id, v) : settKoblingsfamilie(benk, ende, v))}
      />
      <div class="knapperad">
        {annen && (
          <button type="button" class="kontroll-knapp" onClick={() => koblFraKobling(benk, ende)}>
            Koble fra
          </button>
        )}
        <button type="button" class="kontroll-knapp farlig" onClick={() => slettKobling(benk, ende)}>
          Slett kobling
        </button>
      </div>
    </Panel>
  );
}

/** The selected part of a modular model: name, colour, connectors, turn at the joint and actions. */
function Kroppspanel({ benk, k, p }: { benk: Arbeidsbenk; k: Modulkropp; p: BuildforgeParametre }) {
  const navnId = useId();
  const forelder = forbindelseTilForelder(p, k.id);
  const rot = k.id === p.rot;
  return (
    <Panel
      tittel={rot ? 'Hovedkropp' : kategorinavn[k.kategori]}
      handling={
        <button type="button" class="tekstknapp" onClick={() => editor.sett({ kropp: null })}>
          Lukk
        </button>
      }
    >
      <label class="felt" for={navnId}>
        <span>Navn</span>
        <input
          id={navnId}
          type="text"
          value={k.navn}
          maxLength={60}
          onChange={(e) => {
            const navn = (e.target as HTMLInputElement).value.trim();
            if (navn) giKroppNavn(benk, k.id, navn);
          }}
        />
      </label>
      <Materialvalg etikett="Farge" verdi={k.farge} endre={(id) => settFarge(benk, k.id, id)} />
      <h3 class="bf-underoverskrift">Koblinger</h3>
      <ul class="bf-koblinger" role="list">
        {k.koblinger.map((kb) => {
          const f = forbindelseVed(p, { kropp: k.id, kobling: kb.id });
          const annen = f ? (f.a.kropp === k.id ? f.b : f.a) : null;
          return (
            <li key={kb.id}>
              <span>{kb.navn}</span>
              <span class="dempet">
                {kjonnnavn[kb.kjonn]} · {familienavn[kb.familie]} ·{' '}
                {annen ? `koblet til ${koblingsnavn(p, annen).toLowerCase()}` : 'ledig'}
              </span>
            </li>
          );
        })}
      </ul>
      <p class="merknad">
        Plugg, hull, kule og sokkel lages bare der to deler er koblet sammen. Målene er prøveverdier som ikke
        er testprintet. Gå inn i delen for å endre koblingene.
      </p>
      <div class="knapperad">
        <button type="button" class="kontroll-knapp" onClick={() => gaInn(benk, k.id)}>
          Rediger
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => editor.sett({ erstatter: k.id })}>
          Bytt ut
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => speilKropp(benk, k.id)}>
          Speil
        </button>
        <button
          type="button"
          class="kontroll-knapp"
          disabled={!forelder}
          onClick={() => koblFraKropp(benk, k.id)}
        >
          Koble fra
        </button>
        <button type="button" class="kontroll-knapp" onClick={() => dupliserKropp(benk, k.id)}>
          Dupliser
        </button>
        <button
          type="button"
          class="kontroll-knapp"
          disabled={rot}
          title={rot ? 'Hovedkroppen kan ikke slettes, bare byttes ut' : undefined}
          onClick={() => slettKropp(benk, k.id)}
        >
          Slett
        </button>
      </div>
      <p class="merknad">Speil, flytt og drei tar med alt som henger på delen.</p>
    </Panel>
  );
}

function Maalrad({ m }: { m: Maal }) {
  const enhet = m.navn.includes('mm³') ? '' : m.navn.includes('grader') ? '°' : ' mm';
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
  const kropp = p && e.kropp && !e.inne ? finnKropp(p, e.kropp) : undefined;
  const inne = p && e.inne ? finnKropp(p, e.inne) : undefined;
  const modul = !!p && familieFor(p) === 'modul';
  const avansert = e.modus === 'avansert';
  const m = erBuildforgeResultat(t.modell) ? t.modell : null;
  const profil = m?.kontroll.profil;
  const leddprofil = m?.kontroll.leddprofil;
  const kuleprofil = m?.kontroll.kuleprofil;
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
      {!modul && (
        <Panel tittel="Kontroll">
          <Statuskort benk={benk} />
        </Panel>
      )}

      {valgt && p && <Formpanel benk={benk} f={valgt} p={p} avansert={avansert} />}

      {!valgt && kropp && p && <Kroppspanel benk={benk} k={kropp} p={p} />}
      {!valgt && kropp && p && <Leddpanel benk={benk} k={kropp} p={p} />}

      {!valgt && inne && p && e.kobling && <Koblingspanel benk={benk} k={inne} p={p} id={e.kobling} />}

      {!valgt && !kropp && !inne && p && modul && (
        <Panel tittel={e.flere.length > 1 ? `${e.flere.length} deler valgt` : 'Modellen'}>
          <p class="merknad">
            {e.flere.length > 1
              ? 'Høyreklikk en av dem for å speile eller slette alle. Esc fjerner valget.'
              : `${p.kropper!.length} ${p.kropper!.length === 1 ? 'del' : 'deler'}. Hver del printes i én farge. Velg en del for å endre fargen, leddet eller bytte den ut.`}
          </p>
        </Panel>
      )}

      {!valgt && inne && p && !e.kobling && (
        <Panel tittel={inne.navn}>
          <p class="merknad">
            Velg en form for å endre den, eller et punkt på delen for å endre en kobling. Høyreklikk for flere
            valg.
          </p>
          <Materialvalg etikett="Farge" verdi={inne.farge} endre={(id) => settFarge(benk, inne.id, id)} />
          <Avkryssing
            etikett="Skjul resten av modellen"
            verdi={e.skjulAndre}
            endre={(v) => editor.sett({ skjulAndre: v })}
          />
        </Panel>
      )}

      {!valgt && p && familieFor(p) === 'klikker' && (
        <Panel tittel="Farger">
          {klikkerKropper.map((k) => (
            <Materialvalg
              key={k}
              etikett={kroppnavn[k]}
              verdi={p.farger[k] ?? ''}
              endre={(id) => settFarge(benk, k, id)}
            />
          ))}
          <p class="merknad">
            Hver del printes i én farge. Velg en form i listen eller på modellen for å endre den.
          </p>
        </Panel>
      )}

      {avansert && p && familieFor(p) === 'klikker' && (
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

      {leddprofil && (
        <Panel tittel="Leddprofil">
          <p class="bf-profilnavn">
            {leddprofil.navn} <span class="mono">v{leddprofil.versjon}</span>
          </p>
          <p class="merknad">{leddprofil.merknad}</p>
          {avansert ? (
            <dl class="fakta bf-maal">
              {Object.values(leddprofil.maal).map((x) => (
                <Maalrad key={x.navn} m={x} />
              ))}
            </dl>
          ) : (
            <p class="merknad">Se alle målene og hvor sikre de er i Avansert.</p>
          )}
        </Panel>
      )}

      {kuleprofil && (
        <Panel tittel="Kuleleddprofil">
          <p class="bf-profilnavn">
            {kuleprofil.navn} <span class="mono">v{kuleprofil.versjon}</span>
          </p>
          <p class="merknad">{kuleprofil.merknad}</p>
          {avansert ? (
            <dl class="fakta bf-maal">
              {Object.values(kuleprofil.maal).map((x) => (
                <Maalrad key={x.navn} m={x} />
              ))}
            </dl>
          ) : (
            <p class="merknad">Se alle målene og hvor sikre de er i Avansert.</p>
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
