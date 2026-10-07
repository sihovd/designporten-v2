/**
 * Hover and focus hint for icon-only buttons. A short hover shows the name,
 * about three seconds of hover adds the description and shortcut. Keyboard
 * focus shows everything at once. The hint can be dismissed with Escape,
 * stays while the pointer is over it, and goes when the pointer leaves
 * (WCAG 1.4.13). Touch never shows it: the accessible name is on the button.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';

export const TIPS_NAVN_MS = 450;
export const TIPS_FULL_MS = 3000;

export interface TipsProps {
  navn: string;
  hjelp?: string;
  tast?: string;
  /** Where the hint appears relative to the button. */
  side?: 'hoyre' | 'under';
  /** Receives what the button needs: `aria-describedby`. */
  children: (p: { 'aria-describedby': string }) => ComponentChildren;
}

type Nivaa = 'skjult' | 'navn' | 'full';

export function Tips({ navn, hjelp, tast, side = 'hoyre', children }: TipsProps) {
  const id = useId();
  const [nivaa, settNivaa] = useState<Nivaa>('skjult');
  const [pos, settPos] = useState<{ x: number; y: number; fraHoyre: boolean }>({
    x: 0,
    y: 0,
    fraHoyre: false,
  });
  const rot = useRef<HTMLSpanElement>(null);
  const timere = useRef<number[]>([]);

  const stopp = () => {
    timere.current.forEach((t) => clearTimeout(t));
    timere.current = [];
  };
  const skjul = () => {
    stopp();
    settNivaa('skjult');
  };
  const plasser = () => {
    const r = rot.current?.getBoundingClientRect();
    if (!r) return;
    if (side === 'hoyre') {
      settPos({ x: r.right, y: r.top + r.height / 2, fraHoyre: false });
      return;
    }
    // near the right edge the hint grows leftwards instead of off the screen
    const fraHoyre = r.left + 260 > window.innerWidth;
    settPos({ x: fraHoyre ? r.right : r.left, y: r.bottom, fraHoyre });
  };
  useEffect(() => skjul, []);
  useEffect(() => {
    if (nivaa === 'skjult') return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skjul();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [nivaa]);

  const inn = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    stopp();
    timere.current = [
      window.setTimeout(() => {
        plasser();
        settNivaa('navn');
      }, TIPS_NAVN_MS),
      window.setTimeout(() => {
        plasser();
        settNivaa('full');
      }, TIPS_FULL_MS),
    ];
  };

  const beskrivelse = [hjelp, tast ? `Hurtigtast: ${tast}` : ''].filter(Boolean).join('. ');
  return (
    <span
      class="tips"
      ref={rot}
      onPointerEnter={inn}
      onPointerLeave={skjul}
      onPointerDown={skjul}
      onFocusIn={(e) => {
        if ((e.target as HTMLElement).matches?.(':focus-visible')) {
          plasser();
          settNivaa('full');
        }
      }}
      onFocusOut={skjul}
    >
      {children({ 'aria-describedby': id })}
      <span id={id} class="visuelt-skjult">
        {beskrivelse}
      </span>
      {nivaa !== 'skjult' && (
        <span
          class={`tipsboble ${side}${pos.fraHoyre ? ' fraHoyre' : ''}`}
          role="tooltip"
          aria-hidden="true"
          style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
        >
          <span class="tipsinnhold">
            <strong>
              {navn}
              {tast && <kbd>{tast}</kbd>}
            </strong>
            {nivaa === 'full' && hjelp && <span class="tipshjelp">{hjelp}</span>}
          </span>
        </span>
      )}
    </span>
  );
}
