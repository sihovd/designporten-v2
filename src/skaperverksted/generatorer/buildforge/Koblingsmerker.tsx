/**
 * Inside a part (Sub-part Mode, handoff §32–36), its connectors are shown
 * as points on the part: filled for male (plug or ball), a ring for female
 * (hole or socket), green when connected. Each point is a button: click or
 * Enter selects it for the properties panel; right-click or a long press
 * opens its radial menu. On the whole model the connectors stay hidden
 * except while dragging (handoff §51).
 */
import { useMemo, useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import { brukUtdrag } from '../../shell/bruk-benk';
import { brukKamera } from './Festeoverlegg';
import { finnKropp, forbindelseVed, koblingIVerden, koblingsnavn, plasser } from './graf';
import { familienavn, familieFor, kjonnnavn, tolkParametre } from './parametre';
import { brukEditor, editor } from './tilstand';

export function Koblingsmerker({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  const e = brukEditor();
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const langt = useRef(0);
  const punkter = useMemo(() => {
    const t = tolkParametre(raw);
    if (!t.ok || familieFor(t.p) !== 'modul' || !e.inne) return [];
    const k = finnKropp(t.p, e.inne);
    const pl = plasser(t.p).get(e.inne);
    if (!k || !pl) return [];
    return k.koblinger.map((kb) => {
      const f = forbindelseVed(t.p, { kropp: k.id, kobling: kb.id });
      const annen = f ? (f.a.kropp === k.id ? f.b : f.a) : null;
      return {
        kb,
        punkt: koblingIVerden(pl, kb).punkt,
        tekst: `${kb.navn}: ${kjonnnavn[kb.kjonn].toLowerCase()}, ${familienavn[kb.familie].toLowerCase()}, ${annen ? `koblet til ${koblingsnavn(t.p, annen).toLowerCase()}` : 'ledig'}`,
        koblet: !!annen,
      };
    });
  }, [raw, e.inne]);
  brukKamera(scene);
  if (!e.inne || e.dra) return null;
  const inne = e.inne;
  const meny = (ev: { clientX: number; clientY: number }, kobling: string) => {
    const r = scene.lerret.getBoundingClientRect();
    editor.sett({
      kobling,
      valgt: null,
      meny: { x: ev.clientX - r.left, y: ev.clientY - r.top, mal: { type: 'kobling', kropp: inne, kobling } },
    });
  };
  return (
    <div class="bf-overlegg" role="group" aria-label="Koblinger på delen">
      {punkter.map((x) => {
        const p = scene.prosjiser(x.punkt[0], x.punkt[1], x.punkt[2]);
        if (!p.synlig) return null;
        return (
          <button
            key={x.kb.id}
            type="button"
            class={`bf-koblingsmerke ${x.kb.kjonn}${x.koblet ? ' koblet' : ''}${x.kb.familie === 'kule' ? ' kule' : ''}`}
            style={{ left: `${p.x}px`, top: `${p.y}px` }}
            aria-pressed={e.kobling === x.kb.id}
            aria-label={x.tekst}
            title={x.tekst}
            onClick={() => editor.sett({ kobling: e.kobling === x.kb.id ? null : x.kb.id, valgt: null })}
            onContextMenu={(ev) => {
              ev.preventDefault();
              meny(ev, x.kb.id);
            }}
            onPointerDown={(ev) => {
              if (ev.pointerType !== 'touch') return;
              const { clientX, clientY } = ev;
              langt.current = window.setTimeout(() => meny({ clientX, clientY }, x.kb.id), 500);
            }}
            onPointerUp={() => clearTimeout(langt.current)}
            onPointerLeave={() => clearTimeout(langt.current)}
          />
        );
      })}
      {e.nyKobling && (
        <p class="bf-overlegg-hjelp" aria-live="polite">
          Klikk på delen der koblingen skal sitte. Esc avbryter.
        </p>
      )}
    </div>
  );
}
