/** Modal built on <dialog>: focus trapping, Esc and focus return come from the platform. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export function Dialog({
  tittel,
  lukk,
  children,
  klasse = '',
}: {
  tittel: string;
  lukk: () => void;
  children: ComponentChildren;
  klasse?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    const forrige = document.activeElement as HTMLElement | null;
    d.showModal();
    const vedLukk = () => lukk();
    d.addEventListener('close', vedLukk);
    return () => {
      d.removeEventListener('close', vedLukk);
      if (d.open) d.close();
      forrige?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class={`verksted-dialog ${klasse}`}
      aria-labelledby="dialog-tittel"
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div class="dialog-innhold">
        <header class="dialog-hode">
          <h2 id="dialog-tittel">{tittel}</h2>
          <button type="button" class="ikonknapp" onClick={() => ref.current?.close()}>
            Lukk
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
