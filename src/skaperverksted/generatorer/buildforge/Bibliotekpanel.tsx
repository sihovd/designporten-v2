/**
 * Left panel (handoff §4, §28–29). For the modular builder, two tabs: the
 * body-part library (cards with previews, category chips, search) and the
 * model as a tree from the Main Body with loose parts below. Inside a part
 * (Sub-part Mode): its shapes and details, and its connectors. For a
 * clicker: the shapes and details and the clicker's two bodies.
 *
 * A body part is attached by dragging it onto a connector in the 3D view,
 * or without dragging: choose it, then choose a connector from the list or
 * on the model. Shapes and details work the same with attachment points.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { Panel } from '../../shell/kontroller';
import { cssFarge } from '../../shell/tema';
import { bibliotek, festenavn, finnDel, passer, type Bibliotekdel } from './bibliotek';
import { startDra } from './dra';
import { festepunkter } from './feste';
import { finnKropp, forbindelseVed, koblingsnavn, koblingsvalg, komponenter, ledigPlass, tre } from './graf';
import { erstattKropp, festDel, gaInn, gaUt, kobleNyKroppOgVis, leggNyKroppLost } from './handlinger';
import { finnKroppsmal, kroppsbibliotek, type Kroppsmal } from './kroppsbibliotek';
import { ferdigMiniatyr, miniatyr } from './miniatyr';
import {
  familienavn,
  familieFor,
  GRENSER,
  formnavn,
  kategorier,
  kategorinavn,
  klikkerKropper,
  kroppnavn,
  tolkParametre,
  type BuildforgeParametre,
  type Form,
  type Kategori,
  type KlikkerKropp,
  type Modulkropp,
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

/** A preview of shapes, drawn once and cached (miniatyr.ts). Decorative: the card has the name. */
export function Miniatyr({
  nokkel,
  former,
  materiale,
}: {
  nokkel: string;
  former: Form[];
  materiale: string | ((f: Form) => string);
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, settUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const bakgrunn = cssFarge(ref.current, '--grafitt-2', '#2a282e');
    const klar = ferdigMiniatyr(nokkel, bakgrunn);
    if (klar) {
      settUrl(klar);
      return;
    }
    let aktiv = true;
    void miniatyr(nokkel, former, materiale, bakgrunn).then((u) => aktiv && settUrl(u));
    return () => {
      aktiv = false;
    };
  }, [nokkel]);
  return (
    <span class="bf-miniatyr" ref={ref} aria-hidden="true">
      {url && <img src={url} alt="" width={160} height={120} draggable={false} />}
    </span>
  );
}

const malFormer = (mal: Kroppsmal): Form[] =>
  mal.former.map((f, i) => ({ ...f, id: `${mal.id}-${i}`, kropp: mal.id }));

/** Hold still this long on a touch screen before a card can be dragged (ms). */
const LANGTRYKK = 350;

/**
 * A body part in the library. Mouse: press and drag it into the 3D view.
 * Touch: hold it, then drag (handoff §62). Click, tap, Enter: choose it,
 * then a connector in the list or on the model.
 */
function Kroppskort({ benk, mal, aktiv }: { benk: Arbeidsbenk; mal: Kroppsmal; aktiv: boolean }) {
  const ned = useRef<{ x: number; y: number; dratt: boolean } | null>(null);
  const tidsur = useRef(0);
  const former = useMemo(() => malFormer(mal), [mal]);
  const velg = () => {
    const erstatter = editor.t.erstatter;
    if (erstatter) {
      erstattKropp(benk, erstatter, mal.id);
      return;
    }
    editor.sett({ plassererKropp: aktiv ? null : mal.id });
  };
  const pekNed = (ev: PointerEvent) => {
    ned.current = { x: ev.clientX, y: ev.clientY, dratt: false };
    const el = ev.currentTarget as HTMLButtonElement;
    if (ev.pointerType === 'mouse') {
      if (ev.button === 0) startDra({ type: 'bibliotek', malId: mal.id }, ev, el);
      return;
    }
    // touch and pen: a long press arms the drag, and the page must not scroll from then on
    clearTimeout(tidsur.current);
    tidsur.current = window.setTimeout(() => {
      const n = ned.current;
      if (!n) return;
      n.dratt = true;
      el.classList.add('bf-holder');
      const stopp = (e: TouchEvent) => e.preventDefault();
      window.addEventListener('touchmove', stopp, { passive: false });
      const slutt = () => {
        el.classList.remove('bf-holder');
        window.removeEventListener('touchmove', stopp);
        window.removeEventListener('pointerup', slutt, true);
        window.removeEventListener('pointercancel', slutt, true);
      };
      window.addEventListener('pointerup', slutt, true);
      window.addEventListener('pointercancel', slutt, true);
      startDra({ type: 'bibliotek', malId: mal.id }, ev, el);
      benk.melde(`Dra ${mal.navn.toLowerCase()} til modellen.`);
    }, LANGTRYKK);
  };
  const pekFlytt = (ev: PointerEvent) => {
    const n = ned.current;
    if (n && !n.dratt && Math.hypot(ev.clientX - n.x, ev.clientY - n.y) > 8) clearTimeout(tidsur.current);
  };
  return (
    <li>
      <button
        type="button"
        class="bf-kort"
        aria-pressed={aktiv}
        aria-describedby={`bf-k-${mal.id}`}
        onPointerDown={pekNed}
        onPointerMove={pekFlytt}
        onPointerUp={() => clearTimeout(tidsur.current)}
        onPointerCancel={() => clearTimeout(tidsur.current)}
        onContextMenu={(ev) => ned.current?.dratt && ev.preventDefault()}
        onClick={(ev) => {
          // a drag ends with a click on the button too; only a click that stayed put chooses
          const n = ned.current;
          if (n?.dratt) return;
          if (ev.detail > 0 && n && Math.hypot(ev.clientX - n.x, ev.clientY - n.y) > 5) return;
          velg();
        }}
      >
        <Miniatyr nokkel={`kropp:${mal.id}@${mal.versjon}`} former={former} materiale={mal.farge} />
        <span class="bf-kort-navn">{mal.navn}</span>
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

/** Tabs at the top of a panel (WAI-ARIA tabs: arrow keys move between them). */
function Faner<T extends string>({
  etikett,
  faner,
  verdi,
  endre,
}: {
  etikett: string;
  faner: { id: T; navn: string }[];
  verdi: T;
  endre: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      class="bf-faner"
      role="tablist"
      aria-label={etikett}
      onKeyDown={(ev) => {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        ev.preventDefault();
        const i = faner.findIndex((f) => f.id === verdi);
        const neste = faner[(i + (ev.key === 'ArrowRight' ? 1 : faner.length - 1)) % faner.length]!;
        endre(neste.id);
        requestAnimationFrame(() =>
          ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus(),
        );
      }}
    >
      {faner.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          id={`bf-fane-${f.id}`}
          aria-selected={verdi === f.id}
          aria-controls={`bf-fanepanel-${f.id}`}
          tabIndex={verdi === f.id ? 0 : -1}
          onClick={() => endre(f.id)}
        >
          {f.navn}
        </button>
      ))}
    </div>
  );
}

/** The body-part library: category chips, a search field and cards with previews. */
function Kroppsbibliotek({ benk, p, e }: { benk: Arbeidsbenk; p: BuildforgeParametre; e: Editortilstand }) {
  const [kategori, settKategori] = useState<Kategori | 'alle'>('alle');
  const [sok, settSok] = useState('');
  const plasserer = e.plassererKropp ? finnKroppsmal(e.plassererKropp) : undefined;
  const erstatter = e.erstatter ? finnKropp(p, e.erstatter) : undefined;
  const q = sok.trim().toLowerCase();
  const synlige = kroppsbibliotek.filter(
    (m) =>
      (kategori === 'alle' || m.kategori === kategori) &&
      (!q || m.navn.toLowerCase().includes(q) || kategorinavn[m.kategori].toLowerCase().includes(q)),
  );
  const brukte = kategorier.filter((k) => kroppsbibliotek.some((m) => m.kategori === k));
  return (
    <div class="bf-bibliotekfane">
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
      <label class="bf-sok">
        <span class="visuelt-skjult">Søk i kroppsdeler</span>
        <input
          type="search"
          placeholder="Søk i kroppsdeler"
          value={sok}
          onInput={(ev) => settSok((ev.target as HTMLInputElement).value)}
        />
      </label>
      <div class="bf-brikker" role="group" aria-label="Vis kategori">
        {(['alle', ...brukte] as const).map((k) => (
          <button
            key={k}
            type="button"
            class="bf-chip"
            aria-pressed={kategori === k}
            onClick={() => settKategori(k)}
          >
            {k === 'alle' ? 'Alle' : kategorinavn[k]}
          </button>
        ))}
      </div>
      {plasserer && <Kroppsplassering benk={benk} p={p} e={e} mal={plasserer} />}
      {synlige.length ? (
        <ul class="bf-kort-rutenett" role="list" aria-label="Kroppsdeler">
          {synlige.map((m) => (
            <Kroppskort key={m.id} benk={benk} mal={m} aktiv={e.plassererKropp === m.id} />
          ))}
        </ul>
      ) : (
        <p class="merknad">Ingen kroppsdeler passer søket.</p>
      )}
      <p class="merknad">
        Dra en del til modellen, eller trykk på den og velg en kobling. På berøringsskjerm: hold på delen, så
        dra. Slipp på en del av samme slag for å bytte den ut.
      </p>
    </div>
  );
}

/** Inside a part: its connectors, and adding new ones (handoff §32–36). */
function Koblingsfane({ p, e, kropp }: { p: BuildforgeParametre; e: Editortilstand; kropp: Modulkropp }) {
  return (
    <div class="bf-bibliotekfane">
      <button
        type="button"
        class="kontroll-knapp bf-bred-knapp"
        aria-pressed={e.nyKobling}
        disabled={kropp.koblinger.length >= GRENSER.maksKoblinger}
        onClick={() => editor.sett({ nyKobling: !e.nyKobling, valgt: null, kobling: null })}
      >
        {e.nyKobling ? 'Avbryt ny kobling' : 'Legg til kobling'}
      </button>
      <p class="merknad">
        {e.nyKobling
          ? 'Klikk på delen der koblingen skal sitte. Den peker rett ut fra flaten.'
          : `En del kan ha opptil ${GRENSER.maksKoblinger} koblinger.`}
      </p>
      <ul class="bf-objekter" role="list" aria-label={`Koblinger på ${kropp.navn.toLowerCase()}`}>
        {kropp.koblinger.map((kb) => {
          const f = forbindelseVed(p, { kropp: kropp.id, kobling: kb.id });
          const annen = f ? (f.a.kropp === kropp.id ? f.b : f.a) : null;
          return (
            <li key={kb.id}>
              <button
                type="button"
                class="bf-objekt"
                aria-pressed={e.kobling === kb.id}
                onClick={() => editor.sett({ kobling: e.kobling === kb.id ? null : kb.id, valgt: null })}
              >
                <span>{kb.navn}</span>
                <span class="dempet">
                  {kb.kjonn === 'hann' ? 'Hann' : 'Hunn'} · {familienavn[kb.familie]} ·{' '}
                  {annen ? `koblet til ${finnKropp(p, annen.kropp)?.navn.toLowerCase()}` : 'ledig'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p class="merknad">
        Hann blir plugg eller kule, hunn blir hull eller sokkel. Geometrien lages bare der to deler er koblet
        sammen. Målene er prøveverdier som ikke er testprintet.
      </p>
    </div>
  );
}

function Modulpanel({ benk, p, e }: { benk: Arbeidsbenk; p: BuildforgeParametre; e: Editortilstand }) {
  const [delfane, settDelfane] = useState<'former' | 'koblinger'>('former');
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
        <Faner
          etikett={`Innhold i ${inne.navn.toLowerCase()}`}
          faner={[
            { id: 'former', navn: 'Former' },
            { id: 'koblinger', navn: `Koblinger (${inne.koblinger.length})` },
          ]}
          verdi={delfane}
          endre={settDelfane}
        />
        <div
          role="tabpanel"
          id={`bf-fanepanel-${delfane}`}
          aria-labelledby={`bf-fane-${delfane}`}
          class="bf-fanepanel"
        >
          {delfane === 'former' ? (
            <>
              <LeggTil benk={benk} p={p} e={e} bare={inne.id} />
              <Panel tittel={`Former i ${inne.navn.toLowerCase()}`}>
                <ul class="bf-objekter" role="list">
                  <Formliste former={former} e={e} />
                </ul>
                <p class="merknad">Former trekkes unna der leddene dreier og bøyer seg.</p>
              </Panel>
            </>
          ) : (
            <Koblingsfane p={p} e={e} kropp={inne} />
          )}
        </div>
        <button type="button" class="tekstknapp bf-panelfot" onClick={() => gaUt(benk)}>
          Gå ut av delen (Esc)
        </button>
      </div>
    );
  }
  return (
    <div class="bf-panel">
      <Faner
        etikett="Venstre panel"
        faner={[
          { id: 'bibliotek', navn: 'Bibliotek' },
          { id: 'modell', navn: 'Modell' },
        ]}
        verdi={e.fane}
        endre={(fane) => editor.sett({ fane })}
      />
      <div
        role="tabpanel"
        id={`bf-fanepanel-${e.fane}`}
        aria-labelledby={`bf-fane-${e.fane}`}
        class="bf-fanepanel"
      >
        {e.fane === 'bibliotek' ? (
          <Kroppsbibliotek benk={benk} p={p} e={e} />
        ) : (
          <Modelltre benk={benk} p={p} e={e} />
        )}
      </div>
      <button type="button" class="tekstknapp bf-panelfot" onClick={() => editor.sett({ startvelger: true })}>
        Start på nytt …
      </button>
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
