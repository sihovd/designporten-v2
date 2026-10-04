/**
 * Left panel (handoff §4, §29). For the modular builder: the body-part
 * library, the model as a tree from the Main Body with loose parts below,
 * and, inside a part (Sub-part Mode), the shapes and details for it. For a
 * clicker: the shapes and details and the clicker's two bodies.
 *
 * A body part is attached by dragging it onto a connector in the 3D view,
 * or without dragging: choose it, then choose a connector from the list or
 * on the model. Shapes and details work the same with attachment points.
 */
import type { JSX } from 'preact';
import { useMemo, useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { Panel } from '../../shell/kontroller';
import { bibliotek, festenavn, finnDel, passer, type Bibliotekdel } from './bibliotek';
import { startDra } from './dra';
import { festepunkter } from './feste';
import { finnKropp, koblingsnavn, koblingsvalg, komponenter, ledigPlass, tre } from './graf';
import { erstattKropp, festDel, gaInn, gaUt, kobleNyKroppOgVis, leggNyKroppLost } from './handlinger';
import { finnKroppsmal, kroppsbibliotek, type Kroppsmal } from './kroppsbibliotek';
import {
  familieFor,
  formnavn,
  kategorier,
  kategorinavn,
  klikkerKropper,
  kroppnavn,
  tolkParametre,
  type BuildforgeParametre,
  type Form,
  type KlikkerKropp,
} from './parametre';
import { brukEditor, editor, type Editortilstand } from './tilstand';

/** The locked parts of each clicker body, listed so it is clear they exist and cannot be edited. */
const laast: Record<KlikkerKropp, string> = {
  topp: 'Kobling til bryteren',
  underdel: 'Bryterfeste',
};

function Delknapp({ d, aktiv }: { d: Bibliotekdel; aktiv: boolean }) {
  return (
    <li>
      <button
        type="button"
        class="bf-del"
        aria-pressed={aktiv}
        aria-describedby={`bf-del-${d.id}`}
        onClick={() => editor.sett({ plasserer: aktiv ? null : d.id, sikter: null })}
      >
        {d.navn}
      </button>
      <span id={`bf-del-${d.id}`} class="visuelt-skjult">
        {d.beskrivelse}
      </span>
    </li>
  );
}

/** Shapes and details, and where the chosen one can go (clicker, or inside a part). */
function LeggTil({
  benk,
  p,
  e,
  bare,
}: {
  benk: Arbeidsbenk;
  p: BuildforgeParametre;
  e: Editortilstand;
  bare?: string;
}) {
  const punkter = useMemo(() => festepunkter(p, bare), [p, bare]);
  const plasserer = e.plasserer ? finnDel(e.plasserer) : undefined;
  return (
    <Panel tittel={bare ? 'Former og detaljer' : 'Legg til'}>
      {(['Grunnformer', 'Detaljer'] as const).map((gruppe) => (
        <div key={gruppe}>
          <h3 class="bf-kropp-tittel">{gruppe}</h3>
          <ul class="bf-bibliotek" role="list">
            {bibliotek
              .filter((d) => d.gruppe === gruppe)
              .map((d) => (
                <Delknapp key={d.id} d={d} aktiv={e.plasserer === d.id} />
              ))}
          </ul>
        </div>
      ))}
      {plasserer && (
        <div class="bf-plassering" role="group" aria-label={`Fest ${plasserer.navn.toLowerCase()} på`}>
          <p class="bf-plassering-tekst">
            Fest <strong>{plasserer.navn.toLowerCase()}</strong> på et lilla punkt på modellen, eller velg
            her:
          </p>
          <div class="bf-punkter">
            {punkter.map((f) => {
              const ok = passer(plasserer, f);
              return (
                <button
                  key={f.id}
                  type="button"
                  class="kontroll-knapp"
                  disabled={!ok}
                  title={ok ? undefined : `${plasserer.navn} passer ikke her`}
                  onFocus={() => editor.sett({ sikter: ok ? f.id : null })}
                  onMouseEnter={() => editor.sett({ sikter: ok ? f.id : null })}
                  onMouseLeave={() => editor.sett({ sikter: null })}
                  onBlur={() => editor.sett({ sikter: null })}
                  onClick={() => festDel(benk, plasserer.id, f.id)}
                >
                  {festenavn(f.id, bare ? finnKropp(p, f.kropp)?.navn : undefined)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            class="kontroll-knapp"
            onClick={() => editor.sett({ plasserer: null, sikter: null })}
          >
            Avbryt
          </button>
        </div>
      )}
    </Panel>
  );
}

function Formliste({ former, e }: { former: Form[]; e: Editortilstand }) {
  return (
    <>
      {former.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            class={`bf-objekt${e.merket.includes(f.id) ? ' merket' : ''}`}
            aria-pressed={e.valgt === f.id}
            onClick={() => editor.sett({ valgt: e.valgt === f.id ? null : f.id })}
          >
            <span>{f.navn}</span>
            <span class="dempet">
              {formnavn[f.type]}
              {f.operasjon === 'trekk-fra' ? ', trekker fra' : ''}
              {f.speilet ? ', speilet' : ''}
            </span>
          </button>
        </li>
      ))}
    </>
  );
}

/**
 * A body part in the library. Mouse: press and drag it into the 3D view.
 * Click, tap, Enter: choose it, then a connector in the list or on the model.
 */
function Kroppsknapp({ benk, mal, aktiv }: { benk: Arbeidsbenk; mal: Kroppsmal; aktiv: boolean }) {
  const ned = useRef<{ x: number; y: number } | null>(null);
  const velg = () => {
    const erstatter = editor.t.erstatter;
    if (erstatter) {
      erstattKropp(benk, erstatter, mal.id);
      return;
    }
    editor.sett({ plassererKropp: aktiv ? null : mal.id });
  };
  const pekNed = (ev: PointerEvent) => {
    ned.current = { x: ev.clientX, y: ev.clientY };
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    startDra({ type: 'bibliotek', malId: mal.id }, ev, ev.currentTarget as HTMLButtonElement);
  };
  return (
    <li>
      <button
        type="button"
        class="bf-del bf-kroppsdel"
        aria-pressed={aktiv}
        aria-describedby={`bf-k-${mal.id}`}
        onPointerDown={pekNed}
        onClick={(ev) => {
          // a drag ends with a click on the button too; only a click that stayed put chooses
          const n = ned.current;
          if (ev.detail > 0 && n && Math.hypot(ev.clientX - n.x, ev.clientY - n.y) > 5) return;
          velg();
        }}
      >
        {mal.navn}
      </button>
      <span id={`bf-k-${mal.id}`} class="visuelt-skjult">
        {mal.beskrivelse}
      </span>
    </li>
  );
}

/** Where the chosen body part can go, without dragging. */
function Kroppsplassering({
  benk,
  p,
  e,
  mal,
}: {
  benk: Arbeidsbenk;
  p: BuildforgeParametre;
  e: Editortilstand;
  mal: Kroppsmal;
}) {
  const valg = useMemo(() => koblingsvalg(p, mal.koblinger), [p, mal]);
  const valgt = e.kropp ? finnKropp(p, e.kropp) : undefined;
  const ferdig = () => editor.sett({ plassererKropp: null });
  return (
    <div class="bf-plassering" role="group" aria-label={`Plasser ${mal.navn.toLowerCase()}`}>
      <p class="bf-plassering-tekst">
        Dra <strong>{mal.navn.toLowerCase()}</strong> til en kobling på modellen, eller velg her:
      </p>
      {valg.length ? (
        <div class="bf-punkter">
          {valg.map((v) => (
            <button
              key={`${v.mal.kropp}/${v.mal.kobling}`}
              type="button"
              class="kontroll-knapp"
              onClick={() => {
                if (kobleNyKroppOgVis(benk, mal.id, v.egne[0]!, v.mal)) ferdig();
              }}
            >
              {koblingsnavn(p, v.mal)}
            </button>
          ))}
        </div>
      ) : (
        <p class="merknad">Ingen ledige koblinger på modellen passer denne delen.</p>
      )}
      <button
        type="button"
        class="kontroll-knapp"
        onClick={() => {
          if (leggNyKroppLost(benk, mal.id, ledigPlass(p))) ferdig();
        }}
      >
        Legg løst på platen
      </button>
      {valgt && (
        <button
          type="button"
          class="kontroll-knapp"
          onClick={() => {
            if (erstattKropp(benk, valgt.id, mal.id)) ferdig();
          }}
        >
          Bytt ut {valgt.navn.toLowerCase()}
        </button>
      )}
      <button type="button" class="kontroll-knapp" onClick={ferdig}>
        Avbryt
      </button>
    </div>
  );
}

/** The model as a tree: the Main Body with everything on it, then loose groups. */
function Modelltre({ benk, p, e }: { benk: Arbeidsbenk; p: BuildforgeParametre; e: Editortilstand }) {
  const t = useMemo(() => tre(p), [p]);
  const grupper = useMemo(() => komponenter(p), [p]);
  const node = (id: string, anker: boolean): JSX.Element | null => {
    const k = finnKropp(p, id);
    if (!k) return null;
    const barn = t.barn.get(id) ?? [];
    const rot = id === p.rot;
    return (
      <li key={id}>
        <button
          type="button"
          class={`bf-objekt bf-node${rot ? ' bf-rot' : ''}`}
          aria-pressed={e.kropp === id}
          onClick={() => editor.sett({ kropp: e.kropp === id ? null : id, valgt: null, meny: null })}
          onDblClick={() => gaInn(benk, id)}
        >
          <span>
            {rot && <span aria-hidden="true">★ </span>}
            {k.navn}
          </span>
          <span class="dempet">
            {rot ? 'Hovedkropp' : anker ? 'Løs gruppe' : kategorinavn[k.kategori]}
            {k.speilet ? ', speilet' : ''}
          </span>
        </button>
        {barn.length > 0 && (
          <ul class="bf-tre" role="list">
            {barn.map((b) => node(b, false))}
          </ul>
        )}
      </li>
    );
  };
  const hoved = grupper[0]?.includes(p.rot ?? '') ? grupper[0] : undefined;
  const lose = grupper.filter((g) => g !== hoved);
  return (
    <Panel tittel="Modellen">
      <ul class="bf-tre bf-tre--rot" role="list" aria-label="Deler koblet til hovedkroppen">
        {hoved && node(p.rot!, true)}
      </ul>
      {lose.length > 0 && (
        <>
          <h3 class="bf-kropp-tittel">Løse deler</h3>
          <ul class="bf-tre bf-tre--rot" role="list" aria-label="Løse deler">
            {lose.map((g) => node(g[0]!, true))}
          </ul>
          <p class="merknad">
            Løse deler er ikke koblet til hovedkroppen. Dra dem til en kobling for å feste dem.
          </p>
        </>
      )}
      <p class="merknad">Dobbeltklikk en del for å jobbe inne i den. Hver del blir en egen fil.</p>
    </Panel>
  );
}

function Modulpanel({ benk, p, e }: { benk: Arbeidsbenk; p: BuildforgeParametre; e: Editortilstand }) {
  const inne = e.inne ? finnKropp(p, e.inne) : undefined;
  if (inne) {
    const former = p.former.filter((f) => f.kropp === inne.id);
    return (
      <div class="bf-panel">
        <nav class="bf-smuler" aria-label="Hvor du er">
          <ol>
            <li>
              <button type="button" class="bf-smule-knapp" onClick={() => gaUt(benk)}>
                Modellen
              </button>
            </li>
            <li aria-current="page">{inne.navn}</li>
          </ol>
        </nav>
        <button type="button" class="kontroll-knapp" onClick={() => gaUt(benk)}>
          Gå ut av delen (Esc)
        </button>
        <LeggTil benk={benk} p={p} e={e} bare={inne.id} />
        <Panel tittel={`Former i ${inne.navn.toLowerCase()}`}>
          <ul class="bf-objekter" role="list">
            <li>
              <span class="bf-laast">
                Koblinger ({inne.koblinger.length})<span class="mono">Låst</span>
              </span>
            </li>
            <Formliste former={former} e={e} />
          </ul>
          <p class="merknad">
            Koblingene får plugg eller hull når en del er koblet til. Former trekkes unna der leddet dreier.
          </p>
        </Panel>
      </div>
    );
  }
  const plasserer = e.plassererKropp ? finnKroppsmal(e.plassererKropp) : undefined;
  const erstatter = e.erstatter ? finnKropp(p, e.erstatter) : undefined;
  return (
    <div class="bf-panel">
      <button
        type="button"
        class="kontroll-knapp bf-nystart"
        onClick={() => editor.sett({ startvelger: true })}
      >
        Start på nytt …
      </button>
      <Panel tittel="Kroppsdeler">
        {erstatter && (
          <div class="bf-plassering" role="status">
            <p class="bf-plassering-tekst">
              Velg delen som skal erstatte <strong>{erstatter.navn.toLowerCase()}</strong>.
            </p>
            <button type="button" class="kontroll-knapp" onClick={() => editor.sett({ erstatter: null })}>
              Avbryt
            </button>
          </div>
        )}
        {kategorier.map((kat) => {
          const deler = kroppsbibliotek.filter((m) => m.kategori === kat);
          if (!deler.length) return null;
          return (
            <div key={kat}>
              <h3 class="bf-kropp-tittel">{kategorinavn[kat]}</h3>
              <ul class="bf-bibliotek" role="list">
                {deler.map((m) => (
                  <Kroppsknapp key={m.id} benk={benk} mal={m} aktiv={e.plassererKropp === m.id} />
                ))}
              </ul>
            </div>
          );
        })}
        {plasserer && <Kroppsplassering benk={benk} p={p} e={e} mal={plasserer} />}
        <p class="merknad">
          Dra en del til modellen. Den fester seg til nærmeste kobling som passer. Høyreklikk eller C mens du
          drar bytter kobling. Slipp på en del av samme slag, for eksempel en arm på en arm, for å bytte den
          ut.
        </p>
      </Panel>
      <Modelltre benk={benk} p={p} e={e} />
    </div>
  );
}

function Klikkerpanel({ benk, p, e }: { benk: Arbeidsbenk; p: BuildforgeParametre; e: Editortilstand }) {
  return (
    <div class="bf-panel">
      <button
        type="button"
        class="kontroll-knapp bf-nystart"
        onClick={() => editor.sett({ startvelger: true })}
      >
        Start på nytt …
      </button>
      <LeggTil benk={benk} p={p} e={e} />
      <Panel tittel="Deler i modellen">
        {klikkerKropper.map((k) => (
          <div key={k} class="bf-kropp">
            <h3 class="bf-kropp-tittel">{kroppnavn[k]}</h3>
            <ul class="bf-objekter" role="list">
              <li>
                <span class="bf-laast">
                  {laast[k]}
                  <span class="mono">Låst</span>
                </span>
              </li>
              <Formliste former={p.former.filter((f) => f.kropp === k)} e={e} />
            </ul>
          </div>
        ))}
        <p class="merknad">
          Bryteren er en innkjøpt del. Den vises bare som referanse og er ikke med i filene.
        </p>
      </Panel>
    </div>
  );
}

export function Bibliotekpanel({ benk }: { benk: Arbeidsbenk }) {
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const p = useMemo(() => {
    const t = tolkParametre(raw);
    return t.ok ? t.p : null;
  }, [raw]);
  const e = brukEditor();
  if (!p) return <p class="merknad">Prosjektet kunne ikke leses. Se kontrollen under modellen.</p>;
  return familieFor(p) === 'modul' ? (
    <Modulpanel benk={benk} p={p} e={e} />
  ) : (
    <Klikkerpanel benk={benk} p={p} e={e} />
  );
}
