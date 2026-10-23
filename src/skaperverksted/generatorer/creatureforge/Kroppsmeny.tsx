/**
 * The bottom tab bar (handoff, UI_OG_IKONER.md): «Kropp» with round buttons
 * for the base shapes, and «Tekstur/Farge» and «Tilbehør» as planned tabs
 * that say so. Only one submenu is open at a time.
 *
 * A body part is dragged into the 3D view and attaches to the free snap
 * point the overlay highlights. Without dragging (keyboard, touch, a plain
 * click) the button opens a list of the free snap points that fit.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { delrekkefolge, grunnformer, type Deltype } from './grunnformer';
import { fest, leggTilForste, les } from './handlinger';
import { ledigeFor } from './plassering';
import { tilstand } from './tilstand';
import './creatureforge.css';

type Fane = 'kropp' | 'tekstur' | 'tilbehor';

const FANER: { id: Fane; navn: string; planlagt?: string }[] = [
  { id: 'kropp', navn: 'Kropp' },
  {
    id: 'tekstur',
    navn: 'Tekstur/Farge',
    planlagt: 'Tekstur og farge kommer i en senere fase. Fargen på hver del velges i Egenskaper så lenge.',
  },
  { id: 'tilbehor', navn: 'Tilbehør', planlagt: 'Tilbehør kommer i en senere fase.' },
];

/** How far the pointer must move before a press becomes a drag (px). */
const DRA_TERSKEL = 6;

export function Kroppsmeny({ benk }: { benk: Arbeidsbenk }) {
  const t = tilstand(benk);
  const p = brukUtdrag(benk, (s) => les(s.dok));
  const [fane, settFane] = useState<Fane>('kropp');
  const [festeFor, settFesteFor] = useState<Deltype | null>(null);
  const ignorerKlikk = useRef(false);
  const fanerRef = useRef<HTMLDivElement>(null);
  const tom = !p.deler?.length;

  const ledige = (type: Deltype) => (tom ? [] : ledigeFor(p, type));
  const kanBrukes = (type: Deltype): { ok: boolean; hvorfor?: string } => {
    if (type === 'hode') return tom ? { ok: true } : { ok: false, hvorfor: 'Figuren har allerede et hode.' };
    if (tom) return { ok: false, hvorfor: 'Start med et hode.' };
    return ledige(type).length ? { ok: true } : { ok: false, hvorfor: 'Ingen ledige punkter passer.' };
  };

  const velg = (type: Deltype) => {
    if (ignorerKlikk.current) {
      ignorerKlikk.current = false;
      return;
    }
    const k = kanBrukes(type);
    if (!k.ok) {
      benk.melde(k.hvorfor ?? null);
      return;
    }
    if (type === 'hode' && tom) {
      leggTilForste(benk, type);
      return;
    }
    settFesteFor(festeFor === type ? null : type);
  };

  const startDra = (e: PointerEvent, type: Deltype) => {
    if (e.button !== 0 || !kanBrukes(type).ok) return;
    const x0 = e.clientX,
      y0 = e.clientY;
    let drar = false;
    const flytt = (ev: PointerEvent) => {
      if (!drar && Math.hypot(ev.clientX - x0, ev.clientY - y0) > DRA_TERSKEL) {
        drar = true;
        settFesteFor(null);
      }
      if (drar) t.dra.value = { type, x: ev.clientX, y: ev.clientY, mal: t.dra.value?.mal ?? null };
    };
    const slutt = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', flytt);
      window.removeEventListener('pointerup', slutt);
      window.removeEventListener('pointercancel', slutt);
      if (!drar) return;
      ignorerKlikk.current = true;
      setTimeout(() => (ignorerKlikk.current = false), 0);
      const mal = t.dra.value?.mal ?? null;
      t.dra.value = null;
      if (ev.type === 'pointercancel') return;
      const overVisning = !!(
        document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      )?.closest('.visning3d');
      if (mal) fest(benk, type, mal);
      else if (tom && type === 'hode' && overVisning) leggTilForste(benk, type);
      else benk.melde(`Slipp ${grunnformer[type].navn.toLowerCase()} på et av de markerte punktene.`);
    };
    window.addEventListener('pointermove', flytt);
    window.addEventListener('pointerup', slutt);
    window.addEventListener('pointercancel', slutt);
  };

  // arrow keys between the tabs (WAI-ARIA tabs)
  const fanetast = (e: KeyboardEvent) => {
    const i = FANER.findIndex((f) => f.id === fane);
    const neste =
      e.key === 'ArrowRight'
        ? (i + 1) % FANER.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + FANER.length) % FANER.length
          : -1;
    if (neste < 0) return;
    e.preventDefault();
    settFane(FANER[neste]!.id);
    settFesteFor(null);
    fanerRef.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[neste]?.focus();
  };

  const aktiv = FANER.find((f) => f.id === fane)!;
  const dras = t.dra.value;

  return (
    <div class="cf-meny">
      {festeFor && (
        <Festeliste
          type={festeFor}
          valg={ledige(festeFor)}
          velg={(forelder) => {
            fest(benk, festeFor, forelder);
            settFesteFor(null);
          }}
          lukk={() => settFesteFor(null)}
        />
      )}
      <div class="cf-panel" role="tabpanel" id={`cf-fane-${fane}`} aria-labelledby={`cf-fanevalg-${fane}`}>
        {aktiv.planlagt ? (
          <p class="cf-planlagt">{aktiv.planlagt}</p>
        ) : (
          <div class="cf-runde-rad" role="group" aria-label="Kroppsdeler">
            {delrekkefolge.map((type) => {
              const g = grunnformer[type];
              const k = kanBrukes(type);
              return (
                <button
                  key={type}
                  type="button"
                  class={`cf-runde${dras?.type === type ? ' drar' : ''}`}
                  aria-disabled={!k.ok}
                  aria-expanded={type !== 'hode' ? festeFor === type : undefined}
                  title={
                    k.ok
                      ? `${g.navn}: ${type === 'hode' ? 'klikk for å legge til' : 'dra inn i visningen, eller klikk'}`
                      : k.hvorfor
                  }
                  onPointerDown={(e) => startDra(e, type)}
                  onClick={() => velg(type)}
                >
                  <span class="cf-runde-sirkel">{g.navn}</span>
                </button>
              );
            })}
            <p class="cf-planlagt kort">Hofte, armer, bein, hender, føtter og hale kommer i neste fase.</p>
          </div>
        )}
      </div>
      <div class="cf-faner" role="tablist" aria-label="Meny" ref={fanerRef} onKeyDown={fanetast}>
        {FANER.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            id={`cf-fanevalg-${f.id}`}
            aria-selected={f.id === fane}
            aria-controls={`cf-fane-${f.id}`}
            tabIndex={f.id === fane ? 0 : -1}
            class={f.planlagt ? 'planlagt' : undefined}
            onClick={() => {
              settFane(f.id);
              settFesteFor(null);
            }}
          >
            {f.navn}
            {f.planlagt && <span class="cf-kommer"> · kommer</span>}
          </button>
        ))}
      </div>
      {dras && (
        <div class="cf-drahint" style={{ left: `${dras.x}px`, top: `${dras.y}px` }} aria-hidden="true">
          {grunnformer[dras.type].navn}
          {dras.mal ? ' · slipp for å feste' : ''}
        </div>
      )}
    </div>
  );
}

function Festeliste({
  type,
  valg,
  velg,
  lukk,
}: {
  type: Deltype;
  valg: ReturnType<typeof ledigeFor>;
  velg: (forelder: (typeof valg)[number]['forelder']) => void;
  lukk: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [type]);
  const navn = grunnformer[type].navn.toLowerCase();
  return (
    <div
      class="cf-feste"
      role="group"
      aria-label={`Fest ${navn} på`}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          lukk();
        }
      }}
    >
      <p>Fest {navn} på:</p>
      {valg.map((v) => (
        <button key={`${v.forelder.del}/${v.forelder.punkt}`} type="button" onClick={() => velg(v.forelder)}>
          {v.navn}
        </button>
      ))}
      <button type="button" class="cf-avbryt" onClick={lukk}>
        Avbryt
      </button>
    </div>
  );
}
