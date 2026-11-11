/**
 * Vectorium (first called Vektorverksted) inside Sign Forge (Sivert, 2026-11-11: «dette programmet
 * skal inn i designporten.no»). The «Bilde» button opens it over the whole
 * editor; «Legg på skiltet» sends the SVG through the ordinary SVG import, so
 * a result with several parts opens the part picker. The converter is loaded
 * the first time the window opens, not with the editor. Esc does not close
 * the window (it clears selections inside the converter), so work is not lost
 * by accident; «Lukk» does.
 */
import type { ComponentType } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { behandleSvg } from './handlinger';
import { lesSvgDeler, SvgFeil } from './svgimport';
import { signtilstand } from './tilstand';

type VerkstedProps = {
  ferdig?: (svg: string, navn: string) => void;
  lukk?: () => void;
};

const lastVerksted = () =>
  Promise.all([
    import('./vektorverksted/Vektorverksted'),
    import('./vektorverksted/vektorverksted.css'),
  ]).then(([m]) => m.Vektorverksted as ComponentType<VerkstedProps>);

export function Vektorverkstedvindu({ benk }: { benk: Arbeidsbenk }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [Verksted, settVerksted] = useState<ComponentType<VerkstedProps> | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const lukk = () => signtilstand(benk).sett({ vektorverksted: false });

  useEffect(() => {
    const d = ref.current!;
    const forrige = document.activeElement as HTMLElement | null;
    d.showModal();
    const avbryt = (e: Event) => e.preventDefault();
    d.addEventListener('cancel', avbryt);
    let aktiv = true;
    lastVerksted().then(
      (k) => aktiv && settVerksted(() => k),
      () => aktiv && settFeil('Vectorium kunne ikke lastes. Sjekk nettet og prøv igjen.'),
    );
    return () => {
      aktiv = false;
      d.removeEventListener('cancel', avbryt);
      if (d.open) d.close();
      forrige?.focus?.();
    };
  }, []);

  const ferdig = (svg: string, navn: string) => {
    try {
      const deler = lesSvgDeler(svg, `${navn || 'Bilde'}.svg`);
      lukk();
      behandleSvg(benk, deler, 'pynt', 'skilt');
    } catch (e) {
      settFeil(e instanceof SvgFeil ? e.message : 'Vektoren kunne ikke legges på skiltet.');
    }
  };

  return (
    <dialog ref={ref} class="vektorverksted-vindu" aria-label="Vectorium">
      {feil && (
        <p class="vektorverksted-feil" role="alert">
          {feil}{' '}
          <button type="button" class="ikonknapp" onClick={() => settFeil(null)}>
            OK
          </button>
        </p>
      )}
      {Verksted ? (
        <Verksted ferdig={ferdig} lukk={lukk} />
      ) : (
        !feil && (
          <p class="vektorverksted-laster" role="status">
            Laster Vectorium …
          </p>
        )
      )}
      {!Verksted && feil && (
        <button type="button" class="ikonknapp vektorverksted-lukk" onClick={lukk}>
          Lukk
        </button>
      )}
    </dialog>
  );
}
