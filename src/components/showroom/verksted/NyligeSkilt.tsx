/**
 * «Nylig laget»: the signs people have recently made in Sign Forge, as a
 * slider (Sivert, 2026-10-16). Every sign that is downloaded or ordered is
 * shared here, and each one opens in Sign Forge as a template.
 *
 * The slider is a scroll-snapping row: it moves by swiping, the arrow
 * buttons or the keyboard, never by itself. Reduced motion scrolls without
 * smoothing. Real signs only; when there are none (or accounts are not
 * switched on, as on the preview host) it says so and links to Sign Forge.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { nettsti } from '@/lib/nettsti';
import { konto, kontoMulig, type DeltSkilt } from '@/lib/konto/api';
import './nylige-skilt.css';

const tid = new Intl.RelativeTimeFormat('nb-NO', { numeric: 'auto' });

/** «i dag», «i går», «for 3 dager siden», … */
function nar(iso: string): string {
  const dager = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (dager > -7) return tid.format(dager, 'day');
  if (dager > -60) return tid.format(Math.round(dager / 7), 'week');
  return tid.format(Math.round(dager / 30), 'month');
}

export default function NyligeSkilt({ antall = 16 }: { antall?: number }) {
  const [skilt, settSkilt] = useState<DeltSkilt[] | null>(kontoMulig ? null : []);
  const spor = useRef<HTMLUListElement>(null);
  const [kant, settKant] = useState({ start: true, slutt: true });

  useEffect(() => {
    if (!kontoMulig) return;
    konto
      .skilt(antall)
      .then((s) => settSkilt(s.skilt))
      .catch(() => settSkilt([]));
  }, [antall]);

  const malKant = () => {
    const el = spor.current;
    if (!el) return;
    settKant({ start: el.scrollLeft < 4, slutt: el.scrollLeft + el.clientWidth > el.scrollWidth - 4 });
  };
  useEffect(() => {
    malKant();
    const el = spor.current;
    if (!el) return;
    const ro = new ResizeObserver(malKant);
    ro.observe(el);
    return () => ro.disconnect();
  }, [skilt]);

  const bla = (retning: 1 | -1) => {
    const el = spor.current;
    if (!el) return;
    const rolig = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: retning * el.clientWidth * 0.85, behavior: rolig ? 'auto' : 'smooth' });
  };

  const lenkeTilVerktoy = nettsti('/skaperverksted/signgen/');

  if (skilt && skilt.length === 0) {
    return (
      <div class="nylige nylige--tom">
        <p>
          Ingen skilt er publisert ennå. Skilt som skaperne selv publiserer fra Sign Forge, dukker opp her, og
          andre kan bruke dem som mal.
        </p>
        <a class="nylige__lenke" href={lenkeTilVerktoy}>
          Lag et skilt i Sign Forge →
        </a>
      </div>
    );
  }

  return (
    <div class="nylige" aria-busy={skilt === null}>
      <div class="nylige__knapper">
        <button
          type="button"
          class="nylige__pil"
          onClick={() => bla(-1)}
          disabled={kant.start}
          aria-label="Forrige skilt"
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          class="nylige__pil"
          onClick={() => bla(1)}
          disabled={kant.slutt}
          aria-label="Neste skilt"
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <ul
        class="nylige__spor"
        ref={spor}
        onScroll={malKant}
        role="list"
        aria-label="Nylig laget i Sign Forge"
      >
        {skilt === null
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} class="nylige__kort nylige__kort--venter" aria-hidden="true">
                <span class="nylige__bilde" />
                <span class="nylige__tekst">Henter skilt …</span>
              </li>
            ))
          : skilt.map((s) => (
              <li key={s.id} class="nylige__kort">
                <span class="nylige__bilde">
                  {s.bilde ? (
                    <img src={s.bilde} alt={`Skiltet «${s.tittel}» sett ovenfra`} loading="lazy" />
                  ) : (
                    <span class="nylige__utenbilde">Uten forhåndsbilde</span>
                  )}
                </span>
                <span class="nylige__tekst">
                  <strong class="nylige__tittel">{s.tittel}</strong>
                  <span class="nylige__meta">
                    {s.skaper} · {nar(s.endret)}
                    {s.gangerBrukt > 0 &&
                      ` · brukt som mal ${s.gangerBrukt} ${s.gangerBrukt === 1 ? 'gang' : 'ganger'}`}
                  </span>
                </span>
                <a class="nylige__lenke" href={`${lenkeTilVerktoy}?mal=${encodeURIComponent(s.id)}`}>
                  Bruk som mal<span class="visuelt-skjult">: {s.tittel}</span> →
                </a>
              </li>
            ))}
      </ul>
    </div>
  );
}
