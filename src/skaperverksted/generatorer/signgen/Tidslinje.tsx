/**
 * The history as a slim timeline along the bottom (Sivert, 2026-10-08, after Fusion 360): one small icon
 * per step, the current one marked, steps that were undone dimmed. Clicking a step goes back (or forward)
 * to it, the same as undo and redo. It is not a parametric history: earlier steps cannot be edited.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukBenk } from '../../shell/bruk-benk';
import { Ikon, type IkonId } from '../../shell/ikoner';

const REGLER: [RegExp, IkonId][] = [
  [/lås opp/i, 'unlock'],
  [/lås/i, 'lock'],
  [/slett|fjern/i, 'delete'],
  [/dupliser|kopi/i, 'duplicate'],
  [/grupper|løs ut/i, 'group'],
  [/omriss|underlag/i, 'text-outline'],
  [/hull|øye/i, 'hole'],
  [/rektangel|ellipse|trekant|polygon|form/i, 'shapes'],
  [/svg|vektor|dekor|pynt/i, 'svg-import'],
  [/penn|kurve|bane|punkt|paint|strøk|bredde/i, 'pen'],
  [/farge|fyll|kutt/i, 'color'],
  [/tekst|font|bokstav|skrift|navn/i, 'text'],
  [/flytt|roter|skal|størrelse|juster|fordel|midt|plassér|posisjon/i, 'transform'],
  [/profil|høyde|printlag|stabling|byggeplate/i, 'adjustments'],
  [/lag/i, 'layers'],
];

/** A small icon that hints at what a step did, from its name. */
export function ikonForTrinn(navn: string): IkonId {
  for (const [regel, ikon] of REGLER) if (regel.test(navn)) return ikon;
  return 'edit-point';
}

export function Tidslinje({ benk }: { benk: Arbeidsbenk }) {
  brukBenk(benk); // re-render on every change
  const { angre, gjorOm } = benk.historikk.trinn;
  const naaRef = useRef<HTMLButtonElement>(null);
  const rad = useRef<HTMLOListElement>(null);
  const til = (n: number) => {
    for (let i = 0; i < Math.abs(n); i++) {
      if (n < 0) benk.angre();
      else benk.gjorOm();
    }
  };
  // keep the current step in view while the strip grows
  useEffect(() => {
    const k = naaRef.current;
    const r = rad.current;
    if (!k || !r) return;
    r.scrollLeft = Math.max(0, k.offsetLeft - r.clientWidth + k.offsetWidth + 24);
  }, [angre.length, gjorOm.length]);
  const naa = angre.at(-1);
  return (
    <div class="tidslinje" role="region" aria-label="Historikk">
      <span class="tidslinje-tittel">
        <Ikon id="history" storrelse={16} />
        <span class="tidslinje-naa" aria-live="polite">
          {angre.length === 0 && gjorOm.length === 0 ? 'Ingen endringer ennå' : (naa ?? 'Utgangspunkt')}
        </span>
      </span>
      <ol class="tidslinje-rad" ref={rad} aria-label="Endringer, eldst først">
        <li>
          <button
            type="button"
            class="tidstrinn start"
            aria-current={angre.length === 0 ? 'step' : undefined}
            disabled={angre.length === 0}
            title="Utgangspunkt"
            onClick={() => til(-angre.length)}
            ref={angre.length === 0 ? naaRef : undefined}
          >
            <span class="tidspunkt" aria-hidden="true" />
            <span class="visuelt-skjult">Utgangspunkt</span>
          </button>
        </li>
        {angre.map((navn, i) => {
          const er = i === angre.length - 1;
          return (
            <li key={`a${i}`}>
              <button
                type="button"
                class="tidstrinn"
                aria-current={er ? 'step' : undefined}
                title={navn}
                ref={er ? naaRef : undefined}
                onClick={() => til(i + 1 - angre.length)}
              >
                <Ikon id={ikonForTrinn(navn)} storrelse={16} />
                <span class="visuelt-skjult">Gå til «{navn}»</span>
              </button>
            </li>
          );
        })}
        {gjorOm.map((navn, i) => (
          <li key={`g${i}`}>
            <button
              type="button"
              class="tidstrinn gjort-om"
              title={`${navn} (gjort om)`}
              onClick={() => til(i + 1)}
            >
              <Ikon id={ikonForTrinn(navn)} storrelse={16} />
              <span class="visuelt-skjult">Gjør om til «{navn}»</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
