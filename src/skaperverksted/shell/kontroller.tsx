/**
 * Shared inspector controls. Number fields take millimetres with decimal
 * comma and simple arithmetic («40+2,5», «3*12», «10 cm»), commit on Enter
 * or blur, step with the arrow keys (Shift = ×10) and say plainly when an
 * input is not understood.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { klem, tall, tolkLengde } from '../core/enheter';
import { startDra } from './paneler/dra';

/** Scrubber: how many pixels of dragging change the value by one `steg`. */
const SKRUBB_PX_PER_STEG = 8;

export interface TallFeltProps {
  etikett: string;
  /** Visually hidden label (the grid shows a short one, e.g. «X»). */
  kortEtikett?: string;
  verdi: number;
  enhet?: string;
  min?: number;
  maks?: number;
  steg?: number;
  desimaler?: number;
  deaktivert?: boolean;
  /** `pil` = came from arrow keys (merge into one undo step). */
  endre: (v: number, kilde: 'skriv' | 'pil') => void;
}

export function TallFelt({
  etikett,
  kortEtikett,
  verdi,
  enhet = 'mm',
  min = -Infinity,
  maks = Infinity,
  steg = 1,
  desimaler = 1,
  deaktivert,
  endre,
}: TallFeltProps) {
  const id = useId();
  const [tekst, settTekst] = useState(tall(verdi, desimaler));
  const [redigerer, settRedigerer] = useState(false);
  const [ugyldig, settUgyldig] = useState(false);
  const [skrubber, settSkrubber] = useState(false);
  const [skalaX, settSkalaX] = useState(0);
  const felt = useRef<HTMLInputElement>(null);
  const dratt = useRef(false);
  useEffect(() => {
    if (!redigerer) settTekst(tall(verdi, desimaler));
  }, [verdi, desimaler, redigerer]);

  const bekreft = () => {
    const v = enhet === 'mm' ? tolkLengde(tekst) : tolkLengde(tekst.replace(/[°%]/g, ''));
    if (v === null) {
      settUgyldig(true);
      return;
    }
    settUgyldig(false);
    const k = klem(v, min, maks);
    settTekst(tall(k, desimaler));
    if (Math.abs(k - verdi) > 1e-9) endre(k, 'skriv');
  };

  /** Drag the scale along the field's bottom edge to change the value (Shift: fine steps). */
  const skrubb = (e: PointerEvent) => {
    if (e.button !== 0) return;
    dratt.current = false;
    const v0 = verdi;
    const faktor = 10 ** desimaler;
    let siste = v0;
    startDra(e, {
      terskel: 3,
      start: () => {
        dratt.current = true;
        settSkrubber(true);
      },
      flytt: (dx, _dy, ev) => {
        const perPx = (steg / SKRUBB_PX_PER_STEG) * (ev.shiftKey ? 0.1 : 1);
        const v = klem(Math.round((v0 + dx * perPx) * faktor) / faktor, min, maks);
        settSkalaX(dx);
        settTekst(tall(v, desimaler));
        if (v !== siste) {
          siste = v;
          endre(v, 'pil');
        }
      },
      slutt: () => {
        settSkrubber(false);
        settSkalaX(0);
      },
    });
  };

  return (
    <label class="felt" for={id}>
      <span>
        {kortEtikett ? (
          <>
            <span aria-hidden="true">{kortEtikett}</span>
            <span class="visuelt-skjult">{etikett}</span>
          </>
        ) : (
          etikett
        )}
      </span>
      <span class="tallfelt">
        <input
          id={id}
          ref={felt}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellcheck={false}
          value={tekst}
          disabled={deaktivert}
          aria-invalid={ugyldig}
          aria-describedby={ugyldig ? `${id}-feil` : undefined}
          onFocus={(e) => {
            settRedigerer(true);
            (e.target as HTMLInputElement).select();
          }}
          onInput={(e) => settTekst((e.target as HTMLInputElement).value)}
          onBlur={() => {
            bekreft();
            settRedigerer(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              bekreft();
              (e.target as HTMLInputElement).select();
            } else if (e.key === 'Escape') {
              settTekst(tall(verdi, desimaler));
              settUgyldig(false);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const d = (e.key === 'ArrowUp' ? 1 : -1) * steg * (e.shiftKey ? 10 : 1);
              const k = klem(Math.round((verdi + d) * 1e6) / 1e6, min, maks);
              settTekst(tall(k, desimaler));
              endre(k, 'pil');
            }
          }}
        />
        {enhet && (
          <span class="enhet" aria-hidden="true">
            {enhet}
          </span>
        )}
        {!deaktivert && (
          <span
            class={`skrubber${skrubber ? ' drar' : ''}`}
            aria-hidden="true"
            onPointerDown={skrubb}
            onClick={(e) => {
              e.preventDefault();
              if (!dratt.current) felt.current?.focus();
            }}
          >
            <span class="skala" />
            <span class="pil" style={{ left: `clamp(5px, calc(50% + ${skalaX}px), calc(100% - 5px))` }} />
          </span>
        )}
      </span>
      {ugyldig && (
        <span id={`${id}-feil`} class="visuelt-skjult" role="alert">
          «{tekst}» ble ikke forstått. Skriv et tall, for eksempel 12,5.
        </span>
      )}
    </label>
  );
}

export function Felt({ etikett, children }: { etikett: string; children: ComponentChildren }) {
  const id = useId();
  return (
    <div class="felt" role="group" aria-labelledby={id}>
      <span id={id}>{etikett}</span>
      <div>{children}</div>
    </div>
  );
}

export function Segment<T extends string>({
  etikett,
  valg,
  verdi,
  endre,
}: {
  etikett: string;
  valg: { id: T; navn: string }[];
  verdi: T;
  endre: (v: T) => void;
}) {
  return (
    <div class="segment" role="radiogroup" aria-label={etikett}>
      {valg.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={v.id === verdi}
          onClick={() => endre(v.id)}
        >
          {v.navn}
        </button>
      ))}
    </div>
  );
}

export function Panel({
  tittel,
  handling,
  children,
}: {
  tittel: string;
  handling?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="panel" aria-label={tittel}>
      <h2 class="panel-tittel">
        <span>{tittel}</span>
        {handling}
      </h2>
      {children}
    </section>
  );
}
