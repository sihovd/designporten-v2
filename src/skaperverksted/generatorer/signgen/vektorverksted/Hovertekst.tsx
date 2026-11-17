/**
 * Hover text for icon buttons in Vectorium (Sivert, 2026-11-11: «ha kun
 * ikoner synlig. tekst kommer i hover. så det ikke tar noe stor plass»).
 *
 * Any element with `data-tips` inside the root shows its text in a small
 * label while the mouse is over it or it has keyboard focus. The label is
 * fixed to the window, so the scrolling panel and the tool bar never clip it.
 * Touch shows nothing: the buttons keep their accessible names.
 */
import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';

interface Tips {
  tekst: string;
  x: number;
  y: number;
  under: boolean;
}

const MARG = 8;

function plassering(el: Element, tekst: string): Tips {
  const r = el.getBoundingClientRect();
  // above the button when there is room, otherwise below it
  const under = r.top < 44;
  const halv = Math.min(160, tekst.length * 3.6 + 12);
  const x = Math.min(window.innerWidth - MARG - halv, Math.max(MARG + halv, r.left + r.width / 2));
  return { tekst, x, y: under ? r.bottom + 8 : r.top - 8, under };
}

export function Hovertekst({ rot }: { rot: RefObject<HTMLElement> }) {
  const [tips, settTips] = useState<Tips | null>(null);

  useEffect(() => {
    const el = rot.current;
    if (!el) return;
    const finn = (t: EventTarget | null) =>
      t instanceof Element ? (t.closest('[data-tips]') as HTMLElement | null) : null;
    const vis = (m: HTMLElement | null) => {
      const tekst = m?.dataset.tips;
      settTips(m && tekst ? plassering(m, tekst) : null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      vis(finn(e.target));
    };
    const ut = (e: PointerEvent) => {
      if (finn(e.relatedTarget) !== finn(e.target)) vis(finn(e.relatedTarget));
    };
    const fokus = (e: FocusEvent) => {
      const m = finn(e.target);
      if (m?.matches(':focus-visible')) vis(m);
    };
    const skjul = () => settTips(null);
    el.addEventListener('pointerover', over);
    el.addEventListener('pointerout', ut);
    el.addEventListener('focusin', fokus);
    el.addEventListener('focusout', skjul);
    el.addEventListener('pointerdown', skjul);
    window.addEventListener('scroll', skjul, true);
    return () => {
      el.removeEventListener('pointerover', over);
      el.removeEventListener('pointerout', ut);
      el.removeEventListener('focusin', fokus);
      el.removeEventListener('focusout', skjul);
      el.removeEventListener('pointerdown', skjul);
      window.removeEventListener('scroll', skjul, true);
    };
  }, [rot]);

  if (!tips) return null;
  return (
    <div
      class={tips.under ? 'vv-tips vv-tips-under' : 'vv-tips'}
      role="tooltip"
      style={{ left: `${tips.x}px`, top: `${tips.y}px` }}
    >
      {tips.tekst}
    </div>
  );
}
