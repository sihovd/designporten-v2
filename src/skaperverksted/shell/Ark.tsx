/** Bottom sheet for panels below 1024 px. One at a time; half or full height. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export function Ark({
  tittel,
  lukk,
  children,
}: {
  tittel: string;
  lukk: () => void;
  children: ComponentChildren;
}) {
  const [hel, settHel] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') lukk();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <section class={`ark${hel ? ' hel' : ''}`} aria-label={tittel} ref={ref} tabIndex={-1}>
      <header class="ark-hode">
        <button type="button" class="ark-hank" aria-expanded={hel} onClick={() => settHel(!hel)}>
          <span class="visuelt-skjult">{hel ? 'Gjør arket mindre' : 'Gjør arket større'}</span>
        </button>
        <h2>{tittel}</h2>
        <button type="button" class="ikonknapp" onClick={lukk}>
          Lukk
        </button>
      </header>
      <div class="ark-innhold">{children}</div>
    </section>
  );
}
