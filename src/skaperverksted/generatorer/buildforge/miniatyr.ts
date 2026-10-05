/**
 * Previews for the library cards and the start picker: each body part is
 * drawn from its own base shapes (the same shapes it is built from), so a
 * card never shows a part BuildForge cannot make. One shared off-screen
 * renderer, one preview per frame, cached by key. Without WebGL the cards
 * show their names only.
 */
import * as THREE from 'three';
import { finnMateriale } from '../../core/materialer';
import { formMesh } from './formmesh';
import type { Form } from './parametre';

const B = 160;
const H = 120;

let renderer: THREE.WebGLRenderer | null | undefined;
const hurtig = new Map<string, string>();
const ko: {
  nokkel: string;
  former: Form[];
  farge: (f: Form) => string;
  bakgrunn: string;
  ferdig: (u: string | null) => void;
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

function tegn(former: Form[], farge: (f: Form) => string, bakgrunn: string): string | null {
  const r = hentRenderer();
  if (!r) return null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bakgrunn);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3740, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 2);
  sol.position.set(-120, -200, 320);
  scene.add(sol);
  const gruppe = new THREE.Group();
  const rydd: { dispose(): void }[] = [];
  for (const f of former) {
    if (f.operasjon === 'trekk-fra') continue;
    const m = formMesh(f);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.posisjoner, 3));
    geo.setIndex(new THREE.BufferAttribute(m.indekser, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: farge(f), roughness: 0.55 });
    rydd.push(geo, mat);
    gruppe.add(new THREE.Mesh(geo, mat));
  }
  scene.add(gruppe);
  const boks = new THREE.Box3().setFromObject(gruppe);
  if (boks.isEmpty()) return null;
  const senter = boks.getCenter(new THREE.Vector3());
  const str = boks.getSize(new THREE.Vector3());
  const kamera = new THREE.PerspectiveCamera(30, B / H, 1, 5000);
  kamera.up.set(0, 0, 1);
  const radius = Math.max(4, str.length() / 2);
  const avstand = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 0.82;
  const retning = new THREE.Vector3(0.5, -1, 0.7).normalize();
  kamera.position.copy(senter).add(retning.multiplyScalar(avstand));
  kamera.lookAt(senter);
  r.render(scene, kamera);
  const url = r.domElement.toDataURL('image/png');
  rydd.forEach((x) => x.dispose());
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
        url = tegn(neste.former, neste.farge, neste.bakgrunn);
      } catch (feil) {
        console.error(feil);
        url = null;
      }
      if (url) hurtig.set(neste.nokkel, url);
    }
    neste.ferdig(url);
    kjorer = false;
    kjor();
  });
}

/** A preview of these shapes as a data URL, or null without WebGL. */
export function miniatyr(
  nokkel: string,
  former: Form[],
  materiale: string | ((f: Form) => string),
  bakgrunn: string,
): Promise<string | null> {
  const n = `${nokkel}|${bakgrunn}`;
  const ferdig = hurtig.get(n);
  if (ferdig) return Promise.resolve(ferdig);
  const farge = (f: Form) => finnMateriale(typeof materiale === 'string' ? materiale : materiale(f)).hex;
  return new Promise((ok) => {
    ko.push({ nokkel: n, former, farge, bakgrunn, ferdig: ok });
    kjor();
  });
}

/** A preview that is already drawn, for the first paint. */
export const ferdigMiniatyr = (nokkel: string, bakgrunn: string): string | null =>
  hurtig.get(`${nokkel}|${bakgrunn}`) ?? null;
