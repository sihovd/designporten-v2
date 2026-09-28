/**
 * Personality (spec): when a part is swapped, the dragon wiggles through
 * its real joints once, a travelling wave well inside each joint's
 * rotation limit. Off under reduced motion. Renders nothing itself.
 */
import { useEffect, useRef } from 'preact/hooks';
import type * as THREE from 'three';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import { brukUtdrag } from '../../shell/bruk-benk';
import { reduserBevegelse } from '../../shell/tema';
import { leddMal, tappRadius } from './ledd';
import { lesParametre } from './parametre';

const VARIGHET = 1100;

function stykke(mesh: THREE.Object3D): number {
  const id = String(mesh.userData.delId ?? '');
  const n = Number(id.split('-')[1]);
  return Number.isFinite(n) ? n : 0;
}

export function DrageVrikk({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  const modell = brukUtdrag(benk, (t) => t.modell);
  const nokkel = brukUtdrag(benk, (t) => JSON.stringify(t.dok.parametre));
  const forrigeNokkel = useRef(nokkel);
  const venter = useRef(false);

  useEffect(() => {
    if (nokkel !== forrigeNokkel.current) {
      // Size changes are not a part swap; they would wiggle on every step.
      const a = lesParametre(JSON.parse(forrigeNokkel.current) as Record<string, unknown>);
      const b = lesParametre(JSON.parse(nokkel) as Record<string, unknown>);
      venter.current = JSON.stringify({ ...a, lengde: 0 }) !== JSON.stringify({ ...b, lengde: 0 });
      forrigeNokkel.current = nokkel;
    }
  }, [nokkel]);

  useEffect(() => {
    if (!venter.current || !modell || reduserBevegelse()) return;
    venter.current = false;
    const { three } = scene;
    let ramme = 0;
    let mesher: THREE.Mesh[] = [];
    const nullstill = () => {
      for (const m of mesher) {
        m.matrixAutoUpdate = true;
        m.matrix.identity();
        m.updateMatrix();
      }
      scene.tegn();
    };
    // The shell swaps in the new meshes after this effect; start next frame.
    ramme = requestAnimationFrame(() => {
      mesher = scene.modell.children as THREE.Mesh[];
      const antall = Math.max(...mesher.map(stykke)) + 1;
      if (antall < 2) return;

      // Joint pivot of each piece: its pin sits at the front, one pin radius in.
      const p = lesParametre(JSON.parse(nokkel) as Record<string, unknown>);
      const r = tappRadius(leddMal(p.lengde), leddMal(p.lengde).h / 2);
      const fremst = new Array<number>(antall).fill(-Infinity);
      for (const m of mesher) {
        m.geometry.computeBoundingBox();
        const i = stykke(m);
        fremst[i] = Math.max(fremst[i]!, m.geometry.boundingBox!.max.x);
      }
      const ledd = fremst.map((x) => x - r);
      const maks = (leddMal(p.lengde).bevegelse * 0.35 * 180) / Math.PI;

      const start = performance.now();
      const matriser = Array.from({ length: antall }, () => new three.Matrix4());
      const tmp = new three.Matrix4();
      const tilbake = new three.Matrix4();
      const rot = new three.Matrix4();

      const steg = (na: number) => {
        const t = Math.min(1, (na - start) / VARIGHET);
        const omhylling = Math.sin(Math.PI * t);
        matriser[0]!.identity();
        for (let i = 1; i < antall; i++) {
          const vinkel = three.MathUtils.degToRad(maks * omhylling * Math.sin(t * Math.PI * 4 - i * 0.6));
          tmp.makeTranslation(ledd[i]!, 0, 0);
          rot.makeRotationZ(vinkel);
          tilbake.makeTranslation(-ledd[i]!, 0, 0);
          matriser[i]!.copy(matriser[i - 1]!)
            .multiply(tmp)
            .multiply(rot)
            .multiply(tilbake);
        }
        for (const m of mesher) {
          m.matrixAutoUpdate = false;
          m.matrix.copy(matriser[stykke(m)]!);
          m.matrixWorldNeedsUpdate = true;
        }
        scene.tegn();
        if (t < 1) ramme = requestAnimationFrame(steg);
        else nullstill();
      };
      ramme = requestAnimationFrame(steg);
    });
    return () => {
      cancelAnimationFrame(ramme);
      nullstill();
    };
  }, [modell, scene]);

  return null;
}
