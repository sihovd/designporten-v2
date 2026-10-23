/**
 * Thumbnails of the base shapes (handoff, UI_OG_IKONER.md): drawn from the
 * same fields the editor builds, never from icons. One shared offscreen
 * renderer, the same fixed camera angle (front, a little from the right and
 * above), soft light, centred, on a transparent background. Each image is
 * made once and kept as a PNG data URL. One is drawn per frame so the menu
 * never stalls. Without WebGL there is no image and the button keeps its text.
 */
import * as THREE from 'three';
import { boksFor, feltFor, type Formdata } from './grunnformer';
import { lagRutenett, marsjer } from './marsj';
import { utvid } from './sdf';

const STORRELSE = 136;
const ferdige = new Map<string, string | null>();
const ventende = new Map<string, ((url: string | null) => void)[]>();
const ko: { nokkel: string; d: Formdata; farge: string }[] = [];
let tegner: THREE.WebGLRenderer | null | undefined;
let kjorer = false;

const nokkelFor = (d: Formdata, farge: string) =>
  `${d.type}|${d.variant ?? ''}|${d.lengde}|${d.tykkelse}|${farge}`;

function hentTegner(): THREE.WebGLRenderer | null {
  if (tegner !== undefined) return tegner;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = STORRELSE;
    tegner = new THREE.WebGLRenderer({
      canvas: c,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    tegner.setPixelRatio(1);
    tegner.setSize(STORRELSE, STORRELSE, false);
    tegner.setClearColor(0x000000, 0);
    tegner.outputColorSpace = THREE.SRGBColorSpace;
  } catch {
    tegner = null;
  }
  return tegner;
}

function tegn(d: Formdata, farge: string): string | null {
  const r = hentTegner();
  if (!r) return null;
  const mesh = marsjer(lagRutenett(utvid(boksFor(d), 1), 0.6, 160_000), feltFor(d));
  if (!mesh.indekser.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.posisjoner, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.indekser, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(farge),
    roughness: 0.75,
    metalness: 0,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geo, mat));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f9c, 1.9));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(-60, -120, 160);
  scene.add(sol);
  const kule = geo.boundingSphere!;
  const kamera = new THREE.PerspectiveCamera(26, 1, 0.1, 5000);
  kamera.up.set(0, 0, 1);
  const retning = new THREE.Vector3(0.55, -1, 0.5).normalize();
  const avstand = (kule.radius / Math.sin(THREE.MathUtils.degToRad(13))) * 1.05;
  kamera.position.copy(kule.center).addScaledVector(retning, avstand);
  kamera.lookAt(kule.center);
  r.render(scene, kamera);
  const url = r.domElement.toDataURL('image/png');
  geo.dispose();
  mat.dispose();
  return url;
}

function kjor(): void {
  if (kjorer) return;
  const jobb = ko.shift();
  if (!jobb) return;
  kjorer = true;
  requestAnimationFrame(() => {
    let url: string | null;
    try {
      url = tegn(jobb.d, jobb.farge);
    } catch {
      url = null;
    }
    ferdige.set(jobb.nokkel, url);
    for (const l of ventende.get(jobb.nokkel) ?? []) l(url);
    ventende.delete(jobb.nokkel);
    kjorer = false;
    kjor();
  });
}

/** The thumbnail of a shape in a colour (hex), or null without WebGL. */
export function miniatyr(d: Formdata, farge: string): Promise<string | null> {
  const nokkel = nokkelFor(d, farge);
  if (ferdige.has(nokkel)) return Promise.resolve(ferdige.get(nokkel)!);
  return new Promise((los) => {
    const liste = ventende.get(nokkel);
    if (liste) liste.push(los);
    else {
      ventende.set(nokkel, [los]);
      ko.push({ nokkel, d, farge });
      kjor();
    }
  });
}

/** A thumbnail that is already drawn, for the first paint. */
export const ferdigMiniatyr = (d: Formdata, farge: string): string | null =>
  ferdige.get(nokkelFor(d, farge)) ?? null;
