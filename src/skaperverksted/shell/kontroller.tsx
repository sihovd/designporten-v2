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
import { Ikon, type IkonId } from './ikoner';

/**
 * Scrubber: how many pixels of dragging change the value by one `steg`. The ruler uses the same scale,
 * so a tick every `SKRUBB_PX_PER_STEG` pixels is one `steg` and the marker follows the pointer.
 */
const SKRUBB_PX_PER_STEG = 8;
/** Ticks: a small one every step, a large one every fifth. */
const SKRUBB_STOR = SKRUBB_PX_PER_STEG * 5;
/** The marker never sits closer to the ends than this (px); the scale scrolls instead. */
const SKRUBB_KANT = 6;

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
  // The ruler is a window onto the number line: `vinduStart` is the value at its left edge, so the
  // marker always sits where the current value is on the ruler, also after the mouse button is released.
  const pp = SKRUBB_PX_PER_STEG / steg;
  const [bredde, settBredde] = useState(100);
  const [vinduStart, settVinduStart] = useState(() => verdi - bredde / 2 / pp);
  const skala = useRef<HTMLSpanElement>(null);
  const felt = useRef<HTMLInputElement>(null);
  const dratt = useRef(false);
  const vinduStartRef = useRef(0);
  useEffect(() => {
    if (!redigerer) settTekst(tall(verdi, desimaler));
  }, [verdi, desimaler, redigerer]);
  useEffect(() => {
    const w = skala.current?.offsetWidth;
    if (w && w !== bredde) settBredde(w);
  }, [skrubber, redigerer]);
  // a value that leaves the window (typed, arrow keys, undo) brings the window along, centred on it
  useEffect(() => {
    if (skrubber) return;
    const x = (verdi - vinduStart) * pp;
    if (x < SKRUBB_KANT || x > bredde - SKRUBB_KANT) settVinduStart(verdi - bredde / 2 / pp);
  }, [verdi, bredde, pp, skrubber, vinduStart]);

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
    vinduStartRef.current = vinduStart;
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
        // keep the marker on the ruler: past the ends the scale scrolls under it
        const x = (v - vinduStartRef.current) * pp;
        if (x < SKRUBB_KANT) vinduStartRef.current = v - SKRUBB_KANT / pp;
        else if (x > bredde - SKRUBB_KANT) vinduStartRef.current = v - (bredde - SKRUBB_KANT) / pp;
        settVinduStart(vinduStartRef.current);
        settTekst(tall(v, desimaler));
        if (v !== siste) {
          siste = v;
          endre(v, 'pil');
        }
      },
      slutt: () => {
        settSkrubber(false);
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
            ref={skala}
            class={`skrubber${skrubber ? ' drar' : ''}`}
            aria-hidden="true"
            style={{
              '--sm': `${((((-vinduStart * pp) % SKRUBB_STOR) + SKRUBB_STOR) % SKRUBB_STOR).toFixed(2)}px`,
              '--sn': `${((((-vinduStart * pp) % SKRUBB_PX_PER_STEG) + SKRUBB_PX_PER_STEG) % SKRUBB_PX_PER_STEG).toFixed(2)}px`,
            }}
            onPointerDown={skrubb}
            onClick={(e) => {
              e.preventDefault();
              if (!dratt.current) felt.current?.focus();
            }}
          >
            <span class="skala" />
            <span
              class="pil"
              style={{
                left: `${Math.min(bredde - 5, Math.max(5, (verdi - vinduStart) * pp)).toFixed(1)}px`,
              }}
            />
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
  valg: { id: T; navn: string; ikon?: IkonId }[];
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
          title={v.ikon ? v.navn : undefined}
          class={v.ikon ? 'segment-ikon' : undefined}
          onClick={() => endre(v.id)}
        >
          {v.ikon ? (
            <>
              <Ikon id={v.ikon} storrelse={18} />
              <span class="visuelt-skjult">{v.navn}</span>
            </>
          ) : (
            v.navn
          )}
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
