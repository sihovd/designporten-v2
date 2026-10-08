import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * A `<details>` menu closes when the pointer goes down outside it (on the canvas or any other
 * control) or when Escape is pressed, so it never needs a second click on its own button.
 */
export function useLukkMeny(rot: RefObject<HTMLDetailsElement>): void {
  useEffect(() => {
    const el = rot.current;
    if (!el) return;
    const utenfor = (e: Event) => {
      if (el.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) {
        el.open = false;
        el.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', utenfor, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', utenfor, true);
      document.removeEventListener('keydown', esc);
    };
  }, [rot]);
}
