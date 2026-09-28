/**
 * Lamp scene setup for the shared 3D view: a light inside the shade and an
 * approximation of light passing through the printed wall.
 *
 * Translucency is approximated per vertex, not simulated: a vertex glows by
 * how directly it faces the bulb, falls off with distance, and outer
 * surfaces are dimmed by the distance the light travels through the wall. Ribs, facets and twist
 * therefore show as brighter and darker bands, as they do on a real print.
 */
import type * as THREE from 'three';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import { finnMateriale } from '../../core/materialer';
import { cssFarge } from '../../shell/tema';
import { lesParametre } from './modell';
import { sokler, type LampeParametre } from './parametre';
import { lys } from './lys';

/** Where the bulb sits (mm above the plate). */
export function paerePosisjon(p: LampeParametre): number {
  const harBunn = sokler[p.sokkel].hullDiameter !== null;
  return harBunn ? Math.min(p.bunnTykkelse + 60, p.hoyde * 0.45) : p.hoyde * 0.4;
}

/** Per-vertex glow colours (linear RGB, 0–1). Pure, for tests and the view. */
export function gloedFarger(
  posisjoner: ArrayLike<number>,
  normaler: ArrayLike<number>,
  p: LampeParametre,
  farge: [number, number, number],
): Float32Array {
  const bz = paerePosisjon(p);
  const r0 = (p.diameterBunn + p.diameterTopp) / 4;
  const ut = new Float32Array(posisjoner.length);
  const minAvstand2 = (0.25 * r0) ** 2;
  for (let i = 0; i < posisjoner.length; i += 3) {
    const dx = posisjoner[i]!;
    const dy = posisjoner[i + 1]!;
    const dz = posisjoner[i + 2]! - bz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const d = Math.sqrt(d2) || 1;
    const cos = (normaler[i]! * dx + normaler[i + 1]! * dy + normaler[i + 2]! * dz) / d;
    const fall = (r0 * r0) / Math.max(d2, minAvstand2);
    // cos < 0: the surface faces the bulb (inside); cos > 0: light has passed through the wall.
    // Light crossing the wall at an angle travels further through material (Beer–Lambert).
    const gjennom = cos > 0 ? cos * Math.exp(-p.veggtykkelse / (0.7 * Math.max(cos, 0.05))) : 0;
    const k = 0.04 + fall * (cos < 0 ? -cos * 1.2 : gjennom * 3.2);
    for (let c = 0; c < 3; c++) {
      const f = farge[c]!;
      ut[i + c] = Math.min(1, f * k + (1 - f) * Math.max(0, k - 1) * 0.4);
    }
  }
  return ut;
}

export function tilpassLampe3d(s: Scene3d, benk: Arbeidsbenk): () => void {
  const T = s.three;
  const paere = new T.PointLight(0xffffff, 0, 0, 2);
  paere.name = 'lampe-paere';
  s.scene.add(paere);

  const andreLys: { lys: THREE.Light; styrke: number }[] = [];
  s.scene.traverse((o) => {
    if ((o as THREE.Light).isLight && o !== paere)
      andreLys.push({ lys: o as THREE.Light, styrke: (o as THREE.Light).intensity });
  });
  const dag = s.scene.background;
  const natt = new T.Color(cssFarge(s.lerret, '--verksted', '#141317')).multiplyScalar(0.3);

  const lagGlod = (m: THREE.Mesh) => {
    const p = lesParametre(benk.dok);
    const geo = m.geometry;
    geo.computeVertexNormals();
    const farge = new T.Color(finnMateriale(p.materialId).hex);
    const f = gloedFarger(geo.getAttribute('position').array, geo.getAttribute('normal').array, p, [
      farge.r,
      farge.g,
      farge.b,
    ]);
    geo.setAttribute('color', new T.BufferAttribute(f, 3));
    return new T.MeshBasicMaterial({ vertexColors: true });
  };

  const oppdaterMesh = (m: THREE.Mesh, pa: boolean) => {
    const original = m.userData.lampeOriginal as THREE.Material | undefined;
    if (pa && !original) {
      m.userData.lampeOriginal = m.material;
      m.material = lagGlod(m);
    } else if (!pa && original) {
      (m.material as THREE.Material).dispose();
      m.material = original;
      delete m.userData.lampeOriginal;
    }
  };

  const oppdater = () => {
    const { pa, natt: erNatt } = lys.t;
    const p = lesParametre(benk.dok);
    paere.position.set(0, 0, paerePosisjon(p));
    paere.intensity = pa ? 2.5 * ((p.diameterBunn + p.diameterTopp) / 2) ** 2 : 0;
    for (const x of andreLys) x.lys.intensity = x.styrke * (erNatt ? 0.12 : 1);
    s.scene.background = erNatt ? natt : dag;
    for (const c of s.modell.children) oppdaterMesh(c as THREE.Mesh, pa);
    s.tegn();
  };

  const lagtTil = (e: { child: THREE.Object3D }) => {
    oppdaterMesh(e.child as THREE.Mesh, lys.t.pa);
    paere.position.z = paerePosisjon(lesParametre(benk.dok));
  };
  // The view disposes the active material on rebuild; release the swapped-out original too.
  const fjernet = (e: { child: THREE.Object3D }) => {
    (e.child.userData.lampeOriginal as THREE.Material | undefined)?.dispose();
  };
  s.modell.addEventListener('childadded', lagtTil);
  s.modell.addEventListener('childremoved', fjernet);
  const slutt = lys.lytt(oppdater);
  oppdater();

  return () => {
    slutt();
    s.modell.removeEventListener('childadded', lagtTil);
    s.modell.removeEventListener('childremoved', fjernet);
    for (const c of s.modell.children) oppdaterMesh(c as THREE.Mesh, false);
    for (const x of andreLys) x.lys.intensity = x.styrke;
    s.scene.background = dag;
    s.scene.remove(paere);
    paere.dispose();
  };
}
