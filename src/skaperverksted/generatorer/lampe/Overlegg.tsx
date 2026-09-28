/**
 * Direct manipulation on the 3D lamp (spec: "drag the top edge to change
 * height, drag a silhouette point to change the profile, drag around the
 * lamp to twist the pattern").
 *
 * The overlay draws the silhouette in the plane through the lamp's axis
 * that faces the camera, so every handle sits on the real outline. Drags
 * are raycast into that plane, so a handle follows the pointer exactly in
 * millimetres. Every handle is also a keyboard slider. The drawing is
 * functional measurement geometry (D-3).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import { mm, tall } from '../../core/enheter';
import { brukUtdrag } from '../../shell/bruk-benk';
import { lagForm } from './form';
import { ankerRadius, endreLampe, flyttAnker } from './handlinger';
import { GRENSER, normaliser } from './parametre';

type Grep = { type: 'anker'; i: number } | { type: 'hoyde' } | { type: 'vri'; x0: number; v0: number };

/** Re-render when the camera or the view size changes (the view renders on demand). */
function brukKamera(scene: Scene3d): number {
  const [n, settN] = useState(0);
  useEffect(() => {
    let forrige = '';
    let id = 0;
    const sjekk = () => {
      const c = scene.camera;
      c.updateMatrixWorld();
      const e = c.matrixWorld.elements;
      const p = c.projectionMatrix.elements;
      const nokkel = `${scene.lerret.clientWidth}x${scene.lerret.clientHeight}|${e.map((v) => v.toFixed(3)).join(',')}|${p[0]!.toFixed(4)},${p[5]!.toFixed(4)},${p[8]!.toFixed(4)}`;
      if (nokkel !== forrige) {
        forrige = nokkel;
        settN((x) => x + 1);
      }
      id = requestAnimationFrame(sjekk);
    };
    id = requestAnimationFrame(sjekk);
    return () => cancelAnimationFrame(id);
  }, [scene]);
  return n;
}

export function LampeOverlegg({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  const svg = useRef<SVGSVGElement>(null);
  const parametre = brukUtdrag(benk, (t) => t.dok.parametre);
  const p = useMemo(() => normaliser(parametre), [parametre]);
  const form = useMemo(() => lagForm(p), [p]);
  brukKamera(scene);
  const [grep, settGrep] = useState<Grep | null>(null);
  const [fokus, settFokus] = useState<string | null>(null);

  // Horizontal direction that points to the right on screen: the silhouette plane.
  const e = scene.camera.matrixWorld.elements;
  let dx = e[0]!;
  let dy = e[1]!;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const pr = (r: number, z: number) => scene.prosjiser(r * dx, r * dy, z);

  const kurve: string[] = [];
  let maksR = 0;
  for (let k = 0; k <= 48; k++) {
    const t = k / 48;
    const r = form.radius(t);
    maksR = Math.max(maksR, r + (p.monster.type === 'fasetter' ? 0 : p.monster.dybde));
    const q = pr(r, t * p.hoyde);
    kurve.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`);
  }

  // Height ruler on the left of the lamp.
  const rLinjal = -(maksR + 14);
  // Keep the ruler and its handle on screen when the lamp fills a narrow view.
  const bunnL = pr(rLinjal, 0);
  const toppL = pr(rLinjal, p.hoyde);
  const inn = Math.max(0, 28 - Math.min(bunnL.x, toppL.x));
  bunnL.x += inn;
  toppL.x += inn;

  // Twist guide: one rib's path round the lamp, on the side facing the camera.
  const vri = p.monster.type !== 'glatt' && p.monster.type !== 'bolger';
  const vriSti: string[] = [];
  if (vri) {
    const fram = Math.atan2(e[9]!, e[8]!); // horizontal direction towards the camera
    const n = p.monster.antall;
    const theta0 = Math.round((fram * n) / (2 * Math.PI)) * ((2 * Math.PI) / n);
    const v = (p.vridning * Math.PI) / 180;
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      const th = theta0 + v * t;
      const r = form.ytre(th, t) + 0.6;
      const q = scene.prosjiser(r * Math.cos(th), r * Math.sin(th), t * p.hoyde);
      vriSti.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`);
    }
  }
  const vriGrep = pr(0, p.hoyde + Math.max(10, p.hoyde * 0.08));

  const tilPlan = (ev: PointerEvent): { r: number; z: number } | null => {
    const b = svg.current!.getBoundingClientRect();
    const straale = scene.straale(ev.clientX - b.left, ev.clientY - b.top);
    const T = scene.three;
    const plan = new T.Plane(new T.Vector3(dy, -dx, 0), 0);
    const punkt = straale.ray.intersectPlane(plan, new T.Vector3());
    if (!punkt) return null;
    return { r: punkt.x * dx + punkt.y * dy, z: punkt.z };
  };

  const start = (g: Grep) => (ev: PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    svg.current?.setPointerCapture(ev.pointerId);
    scene.settKameraStyring(false);
    settGrep(g);
  };
  const flytt = (ev: PointerEvent) => {
    if (!grep) return;
    if (grep.type === 'vri') {
      const v = Math.round(grep.v0 + (ev.clientX - grep.x0) * 1.5);
      endreLampe(benk, 'Vri mønsteret', () => ({ vridning: v }), 'lampe-vri');
      return;
    }
    const q = tilPlan(ev);
    if (!q) return;
    if (grep.type === 'hoyde') {
      endreLampe(benk, 'Endre høyde', () => ({ hoyde: Math.round(q.z) }), 'lampe-hoyde');
    } else {
      const i = grep.i;
      endreLampe(benk, 'Form silhuetten', (x) => flyttAnker(x, i, Math.abs(q.r), q.z), `lampe-anker-${i}`);
    }
  };
  const slutt = () => {
    if (!grep) return;
    settGrep(null);
    scene.settKameraStyring(true);
    benk.historikk.avsluttSammenslaing();
  };

  const tast = (id: string, ev: KeyboardEvent, handling: (steg: number, akse: 'x' | 'y') => void) => {
    const s = ev.shiftKey ? 10 : 1;
    const k: Record<string, [number, 'x' | 'y']> = {
      ArrowRight: [s, 'x'],
      ArrowLeft: [-s, 'x'],
      ArrowUp: [s, 'y'],
      ArrowDown: [-s, 'y'],
    };
    const v = k[ev.key];
    if (!v) return;
    ev.preventDefault();
    ev.stopPropagation();
    handling(v[0], v[1]);
    settFokus(id);
  };

  const ankere = p.silhuett.map((a, i) => ({ i, r: ankerRadius(p, i), z: a.t * p.hoyde }));
  const etikett = grep
    ? grep.type === 'hoyde'
      ? mm(p.hoyde, 0)
      : grep.type === 'vri'
        ? `${tall(p.vridning, 0)}°`
        : `Ø ${tall(ankere[grep.i]!.r * 2, 0)} mm · ${tall(ankere[grep.i]!.z, 0)} mm opp`
    : null;

  return (
    <svg
      ref={svg}
      class={`lampe-overlegg${grep ? ' drar' : ''}`}
      aria-label="Håndtak for lampens form"
      role="group"
      onPointerMove={flytt}
      onPointerUp={slutt}
      onPointerCancel={slutt}
      onBlur={() => settFokus(null)}
    >
      <polyline class="lampe-silhuett" points={kurve.join(' ')} />
      {vri && <polyline class="lampe-vrisporet" points={vriSti.join(' ')} />}

      <line class="lampe-linjal" x1={bunnL.x} y1={bunnL.y} x2={toppL.x} y2={toppL.y} />
      <line class="lampe-linjal" x1={bunnL.x - 5} y1={bunnL.y} x2={bunnL.x + 5} y2={bunnL.y} />
      <text
        class="lampe-maletall"
        x={(bunnL.x + toppL.x) / 2 + (inn ? 8 : -8)}
        y={(bunnL.y + toppL.y) / 2}
        text-anchor={inn ? 'start' : 'end'}
      >
        {mm(p.hoyde, 0)}
      </text>

      <g
        class={`lampe-grep hoyde${fokus === 'hoyde' ? ' fokus' : ''}`}
        tabindex={0}
        role="slider"
        aria-label="Høyde"
        aria-valuemin={GRENSER.hoyde.min}
        aria-valuemax={GRENSER.hoyde.maks}
        aria-valuenow={p.hoyde}
        aria-valuetext={mm(p.hoyde, 0)}
        aria-orientation="vertical"
        onPointerDown={start({ type: 'hoyde' })}
        onKeyDown={(ev) =>
          tast('hoyde', ev, (s, akse) => {
            if (akse === 'y')
              endreLampe(benk, 'Endre høyde', (x) => ({ hoyde: x.hoyde + s }), 'lampe-hoyde-tast');
          })
        }
      >
        <circle cx={toppL.x} cy={toppL.y} r={16} class="treff" />
        <rect x={toppL.x - 7} y={toppL.y - 7} width={14} height={14} class="merke" />
      </g>

      {ankere.map((a) => {
        const q = pr(a.r, a.z);
        const ende = a.i === 0 || a.i === ankere.length - 1;
        const navn =
          a.i === 0
            ? 'Diameter nederst'
            : a.i === ankere.length - 1
              ? 'Diameter øverst'
              : `Silhuettpunkt ${a.i}`;
        return (
          <g
            key={a.i}
            class={`lampe-grep anker${fokus === `a${a.i}` ? ' fokus' : ''}`}
            tabindex={0}
            role="slider"
            aria-label={navn}
            aria-valuemin={GRENSER.diameter.min}
            aria-valuemax={GRENSER.diameter.maks}
            aria-valuenow={Math.round(a.r * 2)}
            aria-valuetext={
              ende ? `Diameter ${mm(a.r * 2, 0)}` : `Diameter ${mm(a.r * 2, 0)}, ${mm(a.z, 0)} over bunnen`
            }
            onPointerDown={start({ type: 'anker', i: a.i })}
            onKeyDown={(ev) =>
              tast(`a${a.i}`, ev, (s, akse) =>
                endreLampe(
                  benk,
                  'Form silhuetten',
                  (x) => {
                    const r = ankerRadius(x, a.i);
                    const z = x.silhuett[a.i]!.t * x.hoyde;
                    return akse === 'x' ? flyttAnker(x, a.i, r + s / 2, z) : flyttAnker(x, a.i, r, z + s);
                  },
                  `lampe-anker-tast-${a.i}`,
                ),
              )
            }
          >
            <circle cx={q.x} cy={q.y} r={16} class="treff" />
            <circle cx={q.x} cy={q.y} r={ende ? 6 : 7} class="merke" />
          </g>
        );
      })}

      {vri && (
        <g
          class={`lampe-grep vri${fokus === 'vri' ? ' fokus' : ''}`}
          tabindex={0}
          role="slider"
          aria-label="Vridning av mønsteret"
          aria-valuemin={GRENSER.vridning.min}
          aria-valuemax={GRENSER.vridning.maks}
          aria-valuenow={p.vridning}
          aria-valuetext={`${tall(p.vridning, 0)} grader`}
          onPointerDown={(ev) => start({ type: 'vri', x0: ev.clientX, v0: p.vridning })(ev)}
          onKeyDown={(ev) =>
            tast('vri', ev, (s, akse) => {
              if (akse === 'x')
                endreLampe(
                  benk,
                  'Vri mønsteret',
                  (x) => ({ vridning: x.vridning + s * 5 }),
                  'lampe-vri-tast',
                );
            })
          }
        >
          <circle cx={vriGrep.x} cy={vriGrep.y} r={18} class="treff" />
          <ellipse cx={vriGrep.x} cy={vriGrep.y} rx={16} ry={6} class="merke-ring" />
          <text x={vriGrep.x} y={vriGrep.y - 12} text-anchor="middle" class="lampe-maletall">
            {tall(p.vridning, 0)}°
          </text>
        </g>
      )}

      {etikett && grep && (
        <text class="lampe-maletall aktiv" x={12} y={scene.lerret.clientHeight - 16}>
          {etikett}
        </text>
      )}
    </svg>
  );
}
