/**
 * What the modular builder shows over the 3D view: the hint while dragging
 * (what letting go will do, which connector is used, «Bytt kobling» for
 * touch and keyboard), the radial menu (handoff §37) and where
 * you are when working inside a part (handoff §25).
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { nesteKobling } from './dra';
import { finnKobling, finnKropp, forbindelseTilForelder, forbindelseVed } from './graf';
import {
  byttKjonn,
  dupliserForm,
  dupliserKropp,
  endreForm,
  gaInn,
  gaUt,
  koblFraKobling,
  koblFraKropp,
  settKoblingsfamilie,
  settLeddtype,
  slettFlere,
  slettForm,
  slettKobling,
  slettKropp,
  speilFlere,
  speilKropp,
  visBibliotek,
  visEgenskaper,
} from './handlinger';
import { familieFor, kategorinavn, tolkParametre, type BuildforgeParametre } from './parametre';
import { brukEditor, editor, type Menymal, type Verktoy } from './tilstand';

function Drahint() {
  const e = brukEditor();
  const d = e.dra;
  if (!d) return null;
  return (
    <div class={`bf-drahint bf-drahint--${d.type}`} role="status" aria-live="polite">
      <span>{d.tekst}</span>
      {d.antall > 1 && (
        <>
          <span class="dempet">
            Kobling {d.indeks} av {d.antall}
          </span>
          <button
            type="button"
            class="kontroll-knapp"
            aria-keyshortcuts="C"
            // keep the press from ending the drag
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => nesteKobling()}
          >
            Bytt kobling <kbd>C</kbd>
          </button>
        </>
      )}
    </div>
  );
}

interface Menyvalg {
  navn: string;
  tast?: string;
  av?: boolean;
  forklaring?: string;
  /** Red text: removes something. */
  farlig?: boolean;
  gjor: () => void;
}

/** The choices for what the menu was opened on (handoff §37). Save Part waits for accounts (§65). */
function menyvalg(
  benk: Arbeidsbenk,
  p: BuildforgeParametre,
  mal: Menymal,
): { tittel: string; under?: string; valg: Menyvalg[] } | null {
  const e = editor.t;
  if (mal.type === 'kropp') {
    const k = finnKropp(p, mal.id);
    if (!k) return null;
    const rot = k.id === p.rot;
    const f = forbindelseTilForelder(p, k.id);
    const fam = f ? finnKobling(p, f.a)?.familie : undefined;
    return {
      tittel: k.navn,
      under: rot ? 'Hovedkropp' : kategorinavn[k.kategori],
      valg: [
        { navn: 'Rediger', tast: 'Enter', gjor: () => gaInn(benk, k.id) },
        { navn: 'Bytt ut', gjor: () => editor.sett({ erstatter: k.id, plassererKropp: null }) },
        { navn: 'Speil', gjor: () => speilKropp(benk, k.id) },
        { navn: 'Dupliser', tast: 'Ctrl+D', gjor: () => dupliserKropp(benk, k.id) },
        ...(f
          ? [
              {
                navn: fam === 'kule' ? 'Gjør til pluggledd' : 'Gjør til kuleledd',
                gjor: () => settLeddtype(benk, f.id, fam === 'kule' ? 'svivel' : 'kule'),
              },
              { navn: 'Koble fra', gjor: () => koblFraKropp(benk, k.id) },
            ]
          : []),
        { navn: 'Egenskaper', gjor: () => visEgenskaper(benk) },
        {
          navn: 'Slett',
          tast: 'Delete',
          av: rot,
          farlig: true,
          forklaring: rot ? 'Hovedkroppen kan ikke slettes, bare byttes ut' : undefined,
          gjor: () => slettKropp(benk, k.id),
        },
      ],
    };
  }
  if (mal.type === 'flere') {
    const ider = mal.ider.filter((id) => finnKropp(p, id));
    return {
      tittel: `${ider.length} deler valgt`,
      valg: [
        { navn: 'Speil alle', gjor: () => speilFlere(benk, ider) },
        { navn: 'Fjern valget', gjor: () => editor.sett({ flere: [], kropp: null }) },
        { navn: 'Slett', tast: 'Delete', farlig: true, gjor: () => slettFlere(benk, ider) },
      ],
    };
  }
  if (mal.type === 'form') {
    const f = p.former.find((x) => x.id === mal.id);
    if (!f) return null;
    const verktoy = (v: Verktoy) => () => editor.sett({ valgt: f.id, verktoy: v });
    return {
      tittel: f.navn,
      valg: [
        { navn: 'Flytt', tast: 'G', gjor: verktoy('flytt') },
        { navn: 'Roter', tast: 'R', gjor: verktoy('roter') },
        { navn: 'Skaler', tast: 'S', gjor: verktoy('skaler') },
        { navn: 'Dupliser', tast: 'Ctrl+D', gjor: () => dupliserForm(benk, f.id) },
        {
          navn: f.speilet ? 'Slå av speiling' : 'Speil på begge sider',
          gjor: () =>
            endreForm(benk, f.id, f.speilet ? 'Slå av speiling' : 'Slå på speiling', (x) => ({
              ...x,
              speilet: !f.speilet,
            })),
        },
        { navn: 'Egenskaper', gjor: () => (editor.sett({ valgt: f.id }), visEgenskaper(benk)) },
        { navn: 'Slett', tast: 'Delete', farlig: true, gjor: () => slettForm(benk, f.id) },
      ],
    };
  }
  if (mal.type === 'kobling') {
    const ende = { kropp: mal.kropp, kobling: mal.kobling };
    const kb = finnKobling(p, ende);
    if (!kb) return null;
    const f = forbindelseVed(p, ende);
    const annen = f ? (f.a.kropp === mal.kropp ? f.b : f.a) : null;
    return {
      tittel: kb.navn,
      valg: [
        {
          navn: kb.kjonn === 'hann' ? 'Gjør til hunn' : 'Gjør til hann',
          gjor: () => byttKjonn(benk, ende),
        },
        f
          ? {
              navn: kb.familie === 'kule' ? 'Gjør til pluggledd' : 'Gjør til kuleledd',
              gjor: () => settLeddtype(benk, f.id, kb.familie === 'kule' ? 'svivel' : 'kule'),
            }
          : {
              navn: kb.familie === 'kule' ? 'Gjør til pluggledd' : 'Gjør til kuleledd',
              gjor: () => settKoblingsfamilie(benk, ende, kb.familie === 'kule' ? 'svivel' : 'kule'),
            },
        ...(annen ? [{ navn: 'Koble fra', gjor: () => koblFraKobling(benk, ende) }] : []),
        { navn: 'Egenskaper', gjor: () => (editor.sett({ kobling: kb.id }), visEgenskaper(benk)) },
        { navn: 'Slett', farlig: true, gjor: () => slettKobling(benk, ende) },
      ],
    };
  }
  // empty canvas
  if (e.inne) {
    const k = finnKropp(p, e.inne);
    return {
      tittel: k?.navn ?? 'Delen',
      valg: [
        { navn: 'Gå ut', tast: 'Esc', gjor: () => gaUt(benk) },
        { navn: 'Legg til form', gjor: () => visBibliotek(benk) },
        {
          navn: 'Ny kobling',
          gjor: () => {
            editor.sett({ nyKobling: true, valgt: null, kobling: null });
            benk.melde('Klikk på delen der koblingen skal sitte. Esc avbryter.');
          },
        },
        {
          navn: e.skjulAndre ? 'Vis resten' : 'Skjul resten',
          gjor: () => editor.sett({ skjulAndre: !e.skjulAndre }),
        },
        { navn: 'Tilpass visning', tast: '0', gjor: () => benk.kommando('tilpass') },
      ],
    };
  }
  return {
    tittel: 'Modellen',
    valg: [
      { navn: 'Legg til del', gjor: () => visBibliotek(benk) },
      { navn: 'Vis modelltreet', gjor: () => visBibliotek(benk, 'modell') },
      { navn: 'Tilpass visning', tast: '0', gjor: () => benk.kommando('tilpass') },
      { navn: 'Egenskaper', gjor: () => visEgenskaper(benk) },
      { navn: 'Start på nytt', gjor: () => editor.sett({ startvelger: true }) },
    ],
  };
}

/**
 * Radial menu (handoff §37): the choices sit in a ring around where it was
 * opened, so the hand barely moves. Arrow keys go round the ring, Enter
 * chooses, Esc or a click outside closes it and focus goes back.
 */
function Radialmeny({ benk }: { benk: Arbeidsbenk }) {
  const e = brukEditor();
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const ref = useRef<HTMLDivElement>(null);
  const meny = e.meny;
  const t = tolkParametre(raw);
  const p = t.ok ? t.p : null;
  const innhold = p && meny ? menyvalg(benk, p, meny.mal) : null;

  useEffect(() => {
    if (!meny) return;
    const forrige = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const utenfor = (ev: PointerEvent) => {
      if (!ref.current?.contains(ev.target as Node)) editor.sett({ meny: null });
    };
    window.addEventListener('pointerdown', utenfor, true);
    return () => {
      window.removeEventListener('pointerdown', utenfor, true);
      if (ref.current?.contains(document.activeElement) || document.activeElement === document.body)
        forrige?.focus?.();
    };
  }, [meny]);

  if (!meny || !innhold) return null;
  const { tittel, under, valg } = innhold;
  const n = valg.length;
  const R = n <= 4 ? 96 : n <= 6 ? 116 : 128;
  // keep the whole ring inside the view
  const flate = ref.current?.parentElement ?? null;
  const W = flate?.clientWidth ?? 10_000,
    H = flate?.clientHeight ?? 10_000;
  const kant = R + 56;
  const x = Math.max(kant, Math.min(W - kant, meny.x));
  const y = Math.max(R + 32, Math.min(H - R - 32, meny.y));
  const lukk = () => editor.sett({ meny: null });
  const tast = (ev: KeyboardEvent) => {
    const knapper = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
    ];
    const i = knapper.indexOf(document.activeElement as HTMLButtonElement);
    const m = knapper.length;
    const ga = (j: number) => {
      ev.preventDefault();
      knapper[((j % m) + m) % m]?.focus();
    };
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      lukk();
    } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ga(i + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') ga(i - 1);
    else if (ev.key === 'Home') ga(0);
    else if (ev.key === 'End') ga(m - 1);
    else if (ev.key === 'Tab') lukk();
  };
  return (
    <div
      ref={ref}
      class="bf-radial"
      role="menu"
      aria-label={`Valg for ${tittel}`}
      style={{ left: `${x}px`, top: `${y}px`, '--r': `${R}px` }}
      onKeyDown={tast}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      <p class="bf-radial-midt" aria-hidden="true">
        <span>
          {tittel}
          {under && <small>{under}</small>}
        </span>
      </p>
      {valg.map((v, i) => {
        // first choice at the top, then clockwise
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return (
          <button
            key={v.navn}
            type="button"
            role="menuitem"
            class={`bf-radial-valg${v.farlig ? ' farlig' : ''}`}
            style={{ '--x': `${Math.cos(a) * R}px`, '--y': `${Math.sin(a) * R}px`, '--i': i }}
            disabled={v.av}
            title={v.forklaring ?? (v.tast ? `${v.navn} (${v.tast})` : undefined)}
            aria-keyshortcuts={v.tast && v.tast.length <= 6 ? v.tast.replace('Ctrl+', 'Control+') : undefined}
            onClick={() => {
              lukk();
              v.gjor();
            }}
          >
            {v.navn}
          </button>
        );
      })}
    </div>
  );
}

function Hvorduer({ benk }: { benk: Arbeidsbenk }) {
  const e = brukEditor();
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  if (!e.inne && !e.erstatter) return null;
  const t = tolkParametre(raw);
  if (!t.ok) return null;
  if (e.erstatter) {
    const k = finnKropp(t.p, e.erstatter);
    return k ? (
      <div class="bf-smulestripe bf-smulestripe--bunn" role="status">
        <span>
          Velg en kroppsdel i biblioteket for å bytte ut {k.navn.toLowerCase()}, eller dra en del hit.
        </span>
        <button type="button" class="kontroll-knapp" onClick={() => editor.sett({ erstatter: null })}>
          Avbryt
        </button>
      </div>
    ) : null;
  }
  const k = finnKropp(t.p, e.inne!);
  if (!k) return null;
  return (
    <div class="bf-smulestripe">
      <nav aria-label="Hvor du er i modellen">
        <ol>
          <li>
            <button type="button" class="bf-smule-knapp" onClick={() => gaUt(benk)}>
              Modellen
            </button>
          </li>
          <li aria-current="page">{k.navn}</li>
        </ol>
      </nav>
      <button type="button" class="kontroll-knapp" onClick={() => gaUt(benk)}>
        Gå ut <kbd>Esc</kbd>
      </button>
    </div>
  );
}

export function Lerretsoverlegg({ benk }: { benk: Arbeidsbenk }) {
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  if (familieFor(raw as { familie?: 'klikker' | 'modul' }) !== 'modul') return null;
  return (
    <>
      <Hvorduer benk={benk} />
      <Drahint />
      <Radialmeny benk={benk} />
    </>
  );
}
