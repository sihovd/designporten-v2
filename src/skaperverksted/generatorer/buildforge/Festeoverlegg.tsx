/**
 * Attachment points on the 3D view while a part is being placed (handoff
 * §4). Each compatible point is a real button at its projected position:
 * click it, or Tab to it and press Enter. Points
 * the part does not fit are not offered. The ghost preview is drawn by the
 * scene (tre.ts) for the point under the pointer or focus.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import { brukUtdrag } from '../../shell/bruk-benk';
import { festenavn, finnDel, passer } from './bibliotek';
import { festepunkter } from './feste';
import { koblingIVerden, koblingsnavn, koblingsvalg, plasser } from './graf';
import { festDel, kobleNyKroppOgVis } from './handlinger';
import { finnKroppsmal } from './kroppsbibliotek';
import { familieFor, tolkParametre } from './parametre';
import { brukEditor, editor } from './tilstand';

/** Re-render when the camera or the view size changes (the view renders on demand). */
export function brukKamera(scene: Scene3d): void {
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
    if (!t.ok || !del) return [];
    // inside a part, only that part's points
    const bare = familieFor(t.p) === 'modul' ? (e.inne ?? undefined) : undefined;
    return festepunkter(t.p, bare).filter((f) => passer(del, f));
  }, [raw, del, e.inne]);
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
            onClick={() => festDel(benk, del.id, f.id)}
          />
        );
      })}
      <p class="bf-overlegg-hjelp" aria-hidden="true">
        Klikk på et lilla punkt. Esc avbryter.
      </p>
    </div>
  );
}

/**
 * Free connectors a chosen body part fits, as buttons on the 3D view
 * (handoff §8 without dragging: tap, click or keyboard).
 */
export function Koblingsoverlegg({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  const e = brukEditor();
  const raw = brukUtdrag(benk, (t) => t.dok.parametre);
  const mal = e.plassererKropp ? finnKroppsmal(e.plassererKropp) : undefined;
  const punkter = useMemo(() => {
    const t = tolkParametre(raw);
    if (!t.ok || !mal || familieFor(t.p) !== 'modul') return [];
    const pl = plasser(t.p);
    return koblingsvalg(t.p, mal.koblinger).flatMap((v) => {
      const k = t.p.kropper!.find((x) => x.id === v.mal.kropp);
      const kb = k?.koblinger.find((x) => x.id === v.mal.kobling);
      const plk = pl.get(v.mal.kropp);
      if (!kb || !plk) return [];
      return [{ ...v, navn: koblingsnavn(t.p, v.mal), punkt: koblingIVerden(plk, kb).punkt }];
    });
  }, [raw, mal]);
  brukKamera(scene);

  useEffect(() => {
    if (!mal) return;
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') editor.sett({ plassererKropp: null });
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [mal]);

  if (!mal || e.inne) return null;
  return (
    <div class="bf-overlegg" role="group" aria-label={`Koblinger for ${mal.navn.toLowerCase()}`}>
      {punkter.map((v) => {
        const s = scene.prosjiser(v.punkt[0], v.punkt[1], v.punkt[2]);
        if (!s.synlig) return null;
        return (
          <button
            key={`${v.mal.kropp}/${v.mal.kobling}`}
            type="button"
            class="bf-festepunkt bf-koblingspunkt"
            style={{ left: `${s.x}px`, top: `${s.y}px` }}
            aria-label={`Fest ${mal.navn.toLowerCase()} på ${v.navn.toLowerCase()}`}
            title={v.navn}
            onClick={() => {
              if (kobleNyKroppOgVis(benk, mal.id, v.egne[0]!, v.mal)) editor.sett({ plassererKropp: null });
            }}
          />
        );
      })}
      <p class="bf-overlegg-hjelp" aria-hidden="true">
        Klikk på en kobling for å feste {mal.navn.toLowerCase()}. Esc avbryter.
      </p>
    </div>
  );
}
