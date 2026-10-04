/**
 * What the modular builder shows over the 3D view: the hint while dragging
 * (what letting go will do, which connector is used, «Bytt kobling» for
 * touch and keyboard), the context menu on a part (handoff §18) and where
 * you are when working inside a part (handoff §25).
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { nesteKobling } from './dra';
import { finnKropp, forbindelseTilForelder } from './graf';
import { dupliserKropp, gaInn, gaUt, koblFraKropp, slettKropp, speilKropp } from './handlinger';
import { familieFor, tolkParametre } from './parametre';
import { brukEditor, editor } from './tilstand';

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

function Kontekstmeny({ benk }: { benk: Arbeidsbenk }) {
  const e = brukEditor();
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const ref = useRef<HTMLDivElement>(null);
  const meny = e.meny;
  const t = tolkParametre(raw);
  const p = t.ok ? t.p : null;
  const k = p && meny ? finnKropp(p, meny.kropp) : undefined;

  useEffect(() => {
    if (!meny) return;
    const forrige = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const utenfor = (ev: PointerEvent) => {
      if (!ref.current?.contains(ev.target as Node)) editor.sett({ meny: null });
    };
    window.addEventListener('pointerdown', utenfor, true);
    return () => {
      window.removeEventListener('pointerdown', utenfor, true);
      if (ref.current?.contains(document.activeElement)) forrige?.focus?.();
    };
  }, [meny?.kropp, meny?.x, meny?.y]);

  if (!meny || !p || !k) return null;
  const rot = k.id === p.rot;
  const koblet = !!forbindelseTilForelder(p, k.id);
  const lukk = () => editor.sett({ meny: null });
  const valg: { navn: string; tast?: string; av?: boolean; gjor: () => void }[] = [
    { navn: 'Gå inn', tast: 'Enter', gjor: () => gaInn(benk, k.id) },
    { navn: 'Bytt ut', gjor: () => editor.sett({ erstatter: k.id, plassererKropp: null }) },
    { navn: 'Speil', gjor: () => speilKropp(benk, k.id) },
    { navn: 'Koble fra', av: !koblet, gjor: () => koblFraKropp(benk, k.id) },
    { navn: 'Dupliser', tast: 'Ctrl+D', gjor: () => dupliserKropp(benk, k.id) },
    { navn: 'Slett', tast: 'Delete', av: rot, gjor: () => slettKropp(benk, k.id) },
  ];
  const tast = (ev: KeyboardEvent) => {
    const knapper = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = knapper.indexOf(document.activeElement as HTMLButtonElement);
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      lukk();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const n = knapper.length;
      knapper[(i + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n]?.focus();
    } else if (ev.key === 'Tab') lukk();
  };
  return (
    <div
      ref={ref}
      class="bf-meny"
      role="menu"
      aria-label={`Valg for ${k.navn.toLowerCase()}`}
      style={{ left: `${meny.x}px`, top: `${meny.y}px` }}
      onKeyDown={tast}
    >
      <p class="bf-meny-tittel" aria-hidden="true">
        {k.navn}
        {rot ? ' (hovedkropp)' : ''}
      </p>
      {valg.map((v) => (
        <button
          key={v.navn}
          type="button"
          role="menuitem"
          disabled={v.av}
          title={v.navn === 'Slett' && rot ? 'Hovedkroppen kan ikke slettes, bare byttes ut' : undefined}
          onClick={() => {
            lukk();
            v.gjor();
          }}
        >
          <span>{v.navn}</span>
          {v.tast && <kbd>{v.tast}</kbd>}
        </button>
      ))}
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
      <Kontekstmeny benk={benk} />
    </>
  );
}
