/**
 * Attachment points on the 3D view while a part is being placed (handoff
 * §4). Each compatible point is a real button at its projected position:
 * drop a dragged part on it, click it, or Tab to it and press Enter. Points
 * the part does not fit are not offered. The ghost preview is drawn by the
 * scene (tre.ts) for the point under the pointer or focus.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import { brukUtdrag } from '../../shell/bruk-benk';
import { festenavn, finnDel, passer } from './bibliotek';
import { DRA_TYPE } from './Bibliotekpanel';
import { festepunkter } from './feste';
import { festDel } from './handlinger';
import { tolkParametre } from './parametre';
import { brukEditor, editor } from './tilstand';

/** Re-render when the camera or the view size changes (the view renders on demand). */
function brukKamera(scene: Scene3d): void {
  const [, settN] = useState(0);
  useEffect(() => {
    let forrige = '';
    let id = 0;
    const sjekk = () => {
      const c = scene.camera;
      c.updateMatrixWorld();
      const nokkel = `${scene.lerret.clientWidth}x${scene.lerret.clientHeight}|${c.matrixWorld.elements.map((v) => v.toFixed(3)).join(',')}|${c.projectionMatrix.elements[0]!.toFixed(4)}`;
      if (nokkel !== forrige) {
        forrige = nokkel;
        settN((x) => x + 1);
      }
      id = requestAnimationFrame(sjekk);
    };
    id = requestAnimationFrame(sjekk);
    return () => cancelAnimationFrame(id);
  }, [scene]);
}

export function Festeoverlegg({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  const e = brukEditor();
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const del = e.plasserer ? finnDel(e.plasserer) : undefined;
  const punkter = useMemo(() => {
    const t = tolkParametre(raw);
    return t.ok && del ? festepunkter(t.p).filter((f) => passer(del, f.id)) : [];
  }, [raw, del]);
  brukKamera(scene);

  useEffect(() => {
    if (!del) return;
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') editor.sett({ plasserer: null, sikter: null });
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [del]);

  if (!del) return null;
  return (
    <div class="bf-overlegg" role="group" aria-label={`Festepunkter for ${del.navn.toLowerCase()}`}>
      {punkter.map((f) => {
        // the top is drawn pressed during «Prøv klikk», so its points follow
        const z = f.id.startsWith('topp-') ? f.punkt[2] - e.trykk : f.punkt[2];
        const p = scene.prosjiser(f.punkt[0], f.punkt[1], z);
        if (!p.synlig) return null;
        return (
          <button
            key={f.id}
            type="button"
            class={`bf-festepunkt${e.sikter === f.id ? ' sikter' : ''}`}
            style={{ left: `${p.x}px`, top: `${p.y}px` }}
            aria-label={`Fest ${del.navn.toLowerCase()} på ${festenavn(f.id).toLowerCase()}`}
            title={festenavn(f.id)}
            onMouseEnter={() => editor.sett({ sikter: f.id })}
            onMouseLeave={() => editor.sett({ sikter: null })}
            onFocus={() => editor.sett({ sikter: f.id })}
            onBlur={() => editor.sett({ sikter: null })}
            onDragOver={(ev) => {
              ev.preventDefault();
              if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
              if (editor.t.sikter !== f.id) editor.sett({ sikter: f.id });
            }}
            onDragLeave={() => editor.sett({ sikter: null })}
            onDrop={(ev) => {
              ev.preventDefault();
              const id = ev.dataTransfer?.getData(DRA_TYPE) || del.id;
              festDel(benk, id, f.id);
            }}
            onClick={() => festDel(benk, del.id, f.id)}
          />
        );
      })}
      <p class="bf-overlegg-hjelp" aria-hidden="true">
        Slipp eller klikk på et lilla punkt. Esc avbryter.
      </p>
    </div>
  );
}
