/**
 * A small still picture of an uploaded 3D file (STL or 3MF), so the customer
 * sees which model they attached. Rendered once in the browser with Three.js,
 * which is loaded only when such a file is added. STEP needs a CAD kernel and
 * gets no picture. Returns null when the file cannot be read or WebGL is
 * missing; the caller then shows the file type instead.
 */
const STORRELSE = 240;

export function kanForhandsvise3d(filnavn: string): boolean {
  return /\.(stl|3mf)$/i.test(filnavn);
}

export async function lagMiniatyr3d(fil: File): Promise<string | null> {
  try {
    const THREE = await import('three');
    const data = await fil.arrayBuffer();
    let objekt: import('three').Object3D;
    if (/\.stl$/i.test(fil.name)) {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const geometri = new STLLoader().parse(data);
      geometri.computeVertexNormals();
      objekt = new THREE.Mesh(geometri);
    } else {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
      objekt = new ThreeMFLoader().parse(data);
    }

    // One even material: the picture shows form, not the file's colours.
    const materiale = new THREE.MeshStandardMaterial({ color: 0xd9d3c9, roughness: 0.62, metalness: 0 });
    objekt.traverse((o) => {
      if ((o as import('three').Mesh).isMesh) (o as import('three').Mesh).material = materiale;
    });

    // Files use Z up; turn to Three's Y up and stand the model on its base.
    objekt.rotation.x = -Math.PI / 2;
    const scene = new THREE.Scene();
    scene.add(objekt);
    objekt.updateMatrixWorld(true);
    const boks = new THREE.Box3().setFromObject(objekt);
    if (boks.isEmpty()) return null;
    const sentrum = boks.getCenter(new THREE.Vector3());
    const kule = boks.getBoundingSphere(new THREE.Sphere());
    objekt.position.sub(sentrum);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8680, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 2.2);
    sol.position.set(1, 2, 1.5);
    scene.add(sol);

    const kamera = new THREE.PerspectiveCamera(30, 1, kule.radius / 100, kule.radius * 100);
    const avstand = (kule.radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.04;
    kamera.position.set(avstand * 0.62, avstand * 0.48, avstand * 0.62);
    kamera.lookAt(0, 0, 0);

    const lerret = document.createElement('canvas');
    lerret.width = lerret.height = STORRELSE;
    const tegner = new THREE.WebGLRenderer({
      canvas: lerret,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    tegner.setSize(STORRELSE, STORRELSE, false);
    tegner.render(scene, kamera);
    const url = lerret.toDataURL('image/png');

    tegner.dispose();
    materiale.dispose();
    objekt.traverse((o) => (o as import('three').Mesh).geometry?.dispose());
    return url;
  } catch {
    return null;
  }
}
