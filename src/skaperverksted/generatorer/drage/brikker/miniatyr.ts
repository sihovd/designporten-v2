/**
 * Library thumbnails rendered from the brick itself (the same shells the
 * build uses), so the library never shows a picture that differs from the
 * brick the user gets. One off-screen renderer, one thumbnail per frame,
 * cached per definition and colours.
 */
import * as THREE from 'three';
import { finnMateriale } from '../../../core/materialer';
import { soneFor } from '../bygg';
import type { DrageParametre } from '../parametre';
import { lokaleSkall } from './bygg';
import { finnDefinisjon, oppsettFor } from './modell';

const B = 160;
const H = 112;

let renderer: THREE.WebGLRenderer | null | undefined;
const hurtig = new Map<string, string>();
const ko: {
  nokkel: string;
  definisjon: string;
  farger: DrageParametre;
  bakgrunn: string;
  ferdig: (u: string | null) => void;
}[] = [];
let kjorer = false;

function hentRenderer(): THREE.WebGLRenderer | null {
  if (renderer !== undefined) return renderer;
  try {
    const lerret = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas: lerret, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(B * 2, H * 2, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch {
    renderer = null;
  }
  return renderer;
}

function tegn(definisjon: string, farger: DrageParametre, bakgrunn: string): string | null {
  const r = hentRenderer();
  const def = finnDefinisjon(definisjon);
  if (!r || !def) return null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bakgrunn);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3740, 1.7));
  const sol = new THREE.DirectionalLight(0xffffff, 1.9);
  sol.position.set(-120, -200, 320);
  scene.add(sol);
  const gruppe = new THREE.Group();
  const rydd: { dispose(): void }[] = [];
  const del = oppsettFor(def, {}).del;
  for (const s of lokaleSkall(def, {})) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(s.mesh.posisjoner, 3));
    geo.setIndex(new THREE.BufferAttribute(s.mesh.indekser, 1));
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    geo.dispose();
    const farge = finnMateriale(farger.farger[soneFor(s.type, del, farger.monster)]).hex;
    const mat = new THREE.MeshStandardMaterial({ color: farge, roughness: 0.6 });
    rydd.push(flat, mat);
    gruppe.add(new THREE.Mesh(flat, mat));
  }
  scene.add(gruppe);
  const boks = new THREE.Box3().setFromObject(gruppe);
  const senter = boks.getCenter(new THREE.Vector3());
  const str = boks.getSize(new THREE.Vector3());
  const kamera = new THREE.PerspectiveCamera(28, B / H, 1, 5000);
  kamera.up.set(0, 0, 1);
  const radius = Math.max(str.x / 2, (str.y / 2) * (B / H), str.z) * 1.1;
  const avstand = radius / Math.tan(THREE.MathUtils.degToRad(14)) / (B / H);
  kamera.position
    .copy(senter)
    .add(new THREE.Vector3(0.35, -0.75, 0.9).normalize().multiplyScalar(Math.max(avstand, 20)));
  kamera.lookAt(senter);
  r.render(scene, kamera);
  const url = r.domElement.toDataURL('image/png');
  for (const x of rydd) x.dispose();
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
        url = tegn(neste.definisjon, neste.farger, neste.bakgrunn);
      } catch (feil) {
        console.error(feil);
        url = null;
      }
      if (url) {
        hurtig.set(neste.nokkel, url);
        while (hurtig.size > 60) hurtig.delete(hurtig.keys().next().value!);
      }
    }
    neste.ferdig(url);
    kjorer = false;
    kjor();
  });
}

/** A data URL of the brick, or null without WebGL. */
export function brikkeminiatyr(
  definisjon: string,
  farger: DrageParametre,
  bakgrunn: string,
): Promise<string | null> {
  const nokkel = `${definisjon}|${bakgrunn}|${JSON.stringify(farger.farger)}|${farger.monster}`;
  const ferdig = hurtig.get(nokkel);
  if (ferdig) return Promise.resolve(ferdig);
  return new Promise((ok) => {
    ko.push({ nokkel, definisjon, farger, bakgrunn, ferdig: ok });
    kjor();
  });
}
