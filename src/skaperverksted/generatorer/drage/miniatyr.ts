/**
 * Thumbnails for the part pickers: each variant is rendered from the real
 * generator output (the whole dragon with that variant swapped in), so a
 * picker never shows a part the generator cannot build. One shared
 * off-screen renderer, a queue that renders one thumbnail per frame, and
 * a cache keyed on the full parameter set.
 */
import * as THREE from 'three';
import { finnMateriale } from '../../core/materialer';
import { byggDrage } from './bygg';
import type { DrageParametre } from './parametre';
import { utviklingsbibliotek } from './utviklingsbibliotek';

export type Utsnitt = 'hel' | 'hode' | 'hale';

const B = 176;
const H = 120;

let renderer: THREE.WebGLRenderer | null | undefined;
const hurtig = new Map<string, string>();
const ko: {
  nokkel: string;
  p: DrageParametre;
  utsnitt: Utsnitt;
  bakgrunn: string;
  ferdig: (url: string | null) => void;
}[] = [];
let kjorer = false;

function hentRenderer(): THREE.WebGLRenderer | null {
  if (renderer !== undefined) return renderer;
  try {
    const lerret = document.createElement('canvas');
    lerret.width = B * 2;
    lerret.height = H * 2;
    renderer = new THREE.WebGLRenderer({ canvas: lerret, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(B * 2, H * 2, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch {
    renderer = null;
  }
  return renderer;
}

function tegnMiniatyr(p: DrageParametre, utsnitt: Utsnitt, bakgrunn: string): string | null {
  const r = hentRenderer();
  if (!r) return null;
  const resultat = byggDrage(p, utviklingsbibliotek);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bakgrunn);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3740, 1.7));
  const sol = new THREE.DirectionalLight(0xffffff, 1.9);
  sol.position.set(-120, -200, 320);
  scene.add(sol);
  const gruppe = new THREE.Group();
  const geometrier: THREE.BufferGeometry[] = [];
  const materialer: THREE.Material[] = [];
  for (const del of resultat.deler) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(del.mesh.posisjoner, 3));
    geo.setIndex(new THREE.BufferAttribute(del.mesh.indekser, 1));
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    geo.dispose();
    const mat = new THREE.MeshStandardMaterial({ color: finnMateriale(del.materialId).hex, roughness: 0.6 });
    geometrier.push(flat);
    materialer.push(mat);
    gruppe.add(new THREE.Mesh(flat, mat));
  }
  scene.add(gruppe);

  // Frame the whole dragon, or the head / tail third of it.
  const boks = new THREE.Box3().setFromObject(gruppe);
  const lengde = boks.max.x - boks.min.x;
  if (utsnitt === 'hode') boks.min.x = boks.max.x - lengde * 0.3;
  if (utsnitt === 'hale') boks.max.x = boks.min.x + lengde * 0.3;
  const senter = boks.getCenter(new THREE.Vector3());
  const str = boks.getSize(new THREE.Vector3());
  const kamera = new THREE.PerspectiveCamera(28, B / H, 1, 5000);
  kamera.up.set(0, 0, 1);
  const radius = Math.max(str.x / 2, (str.y / 2) * (B / H), str.z) * 1.05;
  const avstand = radius / Math.tan(THREE.MathUtils.degToRad(14)) / (B / H);
  const retning = new THREE.Vector3(0.35, -0.75, 0.9).normalize();
  kamera.position.copy(senter).add(retning.multiplyScalar(Math.max(avstand, 20)));
  kamera.lookAt(senter);
  r.render(scene, kamera);
  const url = r.domElement.toDataURL('image/png');
  geometrier.forEach((g) => g.dispose());
  materialer.forEach((m) => m.dispose());
  return url;
}

function kjor(): void {
  if (kjorer) return;
  const neste = ko.shift();
  if (!neste) return;
  kjorer = true;
  requestAnimationFrame(() => {
    let url = hurtig.get(neste.nokkel) ?? null;
    if (!url) {
      try {
        url = tegnMiniatyr(neste.p, neste.utsnitt, neste.bakgrunn);
      } catch (feil) {
        console.error(feil);
        url = null;
      }
      if (url) {
        hurtig.set(neste.nokkel, url);
        // Keep the cache small: drop the oldest entries.
        while (hurtig.size > 120) hurtig.delete(hurtig.keys().next().value!);
      }
    }
    neste.ferdig(url);
    kjorer = false;
    kjor();
  });
}

/** Queue a thumbnail; resolves with a data URL, or null without WebGL. */
export function miniatyr(p: DrageParametre, utsnitt: Utsnitt, bakgrunn: string): Promise<string | null> {
  const nokkel = `${utsnitt}|${bakgrunn}|${JSON.stringify(p)}`;
  const ferdig = hurtig.get(nokkel);
  if (ferdig) return Promise.resolve(ferdig);
  return new Promise((ok) => {
    ko.push({ nokkel, p, utsnitt, bakgrunn, ferdig: ok });
    kjor();
  });
}

/** Drop queued work that is no longer on screen (a new tab or new parameters). */
export function tomKo(): void {
  for (const x of ko.splice(0)) x.ferdig(null);
}
