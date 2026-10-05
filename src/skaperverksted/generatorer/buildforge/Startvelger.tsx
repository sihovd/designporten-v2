/**
 * «La oss bygge en …» (handoff §3): a small carousel over the canvas, not a
 * dialog in front of it. Each start gives exactly one part, the Main Body,
 * shown with a preview drawn from its own shapes; the user builds the rest
 * from the library. The clicker templates follow at the end. Opens by
 * itself for a new document (no start chosen yet) and from «Start på nytt».
 * Arrow keys move between the cards, Esc closes.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import { brukUtdrag } from '../../shell/bruk-benk';
import { startmaler } from './bibliotek';
import { Miniatyr } from './Bibliotekpanel';
import { velgMal, velgStart } from './handlinger';
import { finnKroppsmal, starter } from './kroppsbibliotek';
import { tolkParametre, type Form } from './parametre';
import { brukEditor, editor } from './tilstand';

/** Documents where the user closed the picker without choosing; it does not come back by itself. */
const avvist = new Set<string>();

interface Kort {
  id: string;
  navn: string;
  beskrivelse: string;
  gruppe: 'modul' | 'klikker';
  former: Form[];
  materiale: string | ((f: Form) => string);
  velg: () => void;
}

export function Startvelger({ benk }: { benk: Arbeidsbenk }) {
  const e = brukEditor();
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const dokId = brukUtdrag(benk, (t) => t.dok.id);
  const [, settN] = useState(0);
  const rad = useRef<HTMLUListElement>(null);
  const t = tolkParametre(raw);
  const ny = t.ok && t.p.mal === 'ny' && !avvist.has(dokId);
  const apen = e.startvelger || ny;

  const kort = useMemo<Kort[]>(
    () => [
      ...starter.flatMap((s) => {
        const mal = finnKroppsmal(s.kropp);
        if (!mal) return [];
        return [
          {
            id: s.id,
            navn: s.navn,
            beskrivelse: s.beskrivelse,
            gruppe: 'modul' as const,
            former: mal.former.map((f, i) => ({ ...f, id: `${mal.id}-${i}`, kropp: mal.id })),
            materiale: mal.farge,
            velg: () => velgStart(benk, s.id),
          },
        ];
      }),
      ...startmaler.map((m) => {
        const p = m.parametre();
        return {
          id: `klikker-${m.id}`,
          navn: m.navn,
          beskrivelse: m.beskrivelse,
          gruppe: 'klikker' as const,
          former: p.former,
          materiale: (f: Form) => p.farger[f.kropp as 'topp' | 'underdel'] ?? 'pla-grafitt',
          velg: () => {
            editor.sett({ startvelger: false, kropp: null, inne: null });
            velgMal(benk, m.id);
          },
        };
      }),
    ],
    [benk],
  );

  useEffect(() => {
    if (!apen) return;
    const id = requestAnimationFrame(() => rad.current?.querySelector<HTMLButtonElement>('button')?.focus());
    return () => cancelAnimationFrame(id);
  }, [apen]);

  if (!apen) return null;

  const lukk = () => {
    avvist.add(dokId);
    editor.sett({ startvelger: false });
    settN((x) => x + 1);
  };
  const bla = (retning: number) => {
    const r = rad.current;
    if (r) r.scrollBy({ left: retning * r.clientWidth * 0.8, behavior: 'smooth' });
  };
  const tast = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      lukk();
      return;
    }
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const knapper = [...(rad.current?.querySelectorAll<HTMLButtonElement>('.bf-start') ?? [])];
    const i = knapper.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    ev.preventDefault();
    const neste = knapper[Math.max(0, Math.min(knapper.length - 1, i + (ev.key === 'ArrowRight' ? 1 : -1)))];
    neste?.focus();
    neste?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <section class="bf-startvelger" aria-labelledby="bf-start-tittel" onKeyDown={tast}>
      <header class="bf-start-hode">
        <h2 id="bf-start-tittel">La oss bygge en …</h2>
        <p class="bf-start-ingress">Velg hovedkroppen. Resten drar du på fra biblioteket.</p>
        <div class="bf-start-bla" role="group" aria-label="Bla i startene">
          <button type="button" class="kontroll-knapp" onClick={() => bla(-1)}>
            <span aria-hidden="true">‹</span>
            <span class="visuelt-skjult">Forrige</span>
          </button>
          <button type="button" class="kontroll-knapp" onClick={() => bla(1)}>
            <span aria-hidden="true">›</span>
            <span class="visuelt-skjult">Neste</span>
          </button>
          <button type="button" class="kontroll-knapp" onClick={lukk}>
            Lukk
          </button>
        </div>
      </header>
      <ul class="bf-starter" role="list" ref={rad}>
        {kort.map((k, i) => (
          <li
            key={k.id}
            class={k.gruppe === 'klikker' && kort[i - 1]?.gruppe === 'modul' ? 'bf-start-skille' : ''}
          >
            <button
              type="button"
              class="bf-start"
              aria-describedby={`bf-start-${k.id}`}
              onClick={() => {
                avvist.add(dokId);
                k.velg();
              }}
            >
              <Miniatyr nokkel={`start:${k.id}`} former={k.former} materiale={k.materiale} />
              <strong>
                <span>{k.navn}</span>
                {k.gruppe === 'klikker' && (
                  <span class="bf-start-merke">
                    <span class="visuelt-skjult">, </span>Klikker
                  </span>
                )}
              </strong>
            </button>
            <span id={`bf-start-${k.id}`} class="visuelt-skjult">
              {k.beskrivelse}
            </span>
          </li>
        ))}
      </ul>
      <p class="merknad">Å starte på nytt erstatter modellen. Angre henter den tilbake.</p>
    </section>
  );
}
