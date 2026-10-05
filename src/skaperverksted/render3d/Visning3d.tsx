/**
 * Shared 3D view. Renders the workbench's built model (millimetres, Z up)
 * on a build plate, with orbit controls and fixed view presets. Renders on
 * demand only. Generators can add overlays (Overlegg3d), scene setup
 * (tilpass3d) and custom materials (material3d).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Arbeidsbenk } from '../core/arbeidsbenk';
import type { Scene3d } from '../core/generator';
import { finnMateriale, materialtyper, standardPrinter } from '../core/materialer';
import { avgrensning, type ModellDel } from '../geometri/mesh';
import { brukUtdrag } from '../shell/bruk-benk';
import { mm } from '../core/enheter';
import { cssFarge, reduserBevegelse } from '../shell/tema';
import { leggTilPrintlag, settPrintlag } from './printlag';

type Vinkel = 'perspektiv' | 'topp' | 'front' | 'side';

const VINKLER: { id: Vinkel; navn: string }[] = [
  { id: 'perspektiv', navn: 'Perspektiv' },
  { id: 'topp', navn: 'Topp' },
  { id: 'front', navn: 'Front' },
  { id: 'side', navn: 'Side' },
];

function standardMateriale(del: ModellDel): THREE.Material {
  const m = finnMateriale(del.materialId);
  const t = materialtyper[m.type];
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(m.hex),
    roughness: t.ruhet,
    metalness: t.metallisk,
    flatShading: true,
  });
}

export interface Visning3dProps {
  benk: Arbeidsbenk;
  /** Compact variant for dialogs: no overlays. */
  kompakt?: boolean;
  etikett?: string;
}

export function Visning3d({ benk, kompakt = false, etikett }: Visning3dProps) {
  const vert = useRef<HTMLDivElement>(null);
  const [scene, settScene] = useState<Scene3d | null>(null);
  const [feil, settFeil] = useState<string | null>(null);
  const modell = brukUtdrag(benk, (t) => t.modell);
  const valgtLag = brukUtdrag(benk, (t) => t.utvalg.lag);
  const plate = brukUtdrag(benk, (t) => t.dok.plate);
  const parametre = brukUtdrag(benk, (t) => t.dok.parametre);
  const lagHoyde = typeof parametre.lagHoyde === 'number' ? parametre.lagHoyde : standardPrinter.lagHoyde;
  const [printlag, settPrintlagPa] = useState(false);
  const printlagRef = useRef(printlag);
  printlagRef.current = printlag;
  const tilpassRef = useRef<(v?: Vinkel) => void>(() => {});
  const forsteTilpasning = useRef(true);
  const plugin = benk.generator;
  const Overlegg = kompakt ? undefined : plugin.ui.Overlegg3d;

  // renderer, camera, controls
  useEffect(() => {
    const el = vert.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch {
      settFeil('3D-visningen trenger WebGL, som ikke er tilgjengelig i denne nettleseren.');
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(new THREE.Color(cssFarge(el, '--bg', '#141317')));
    const lerret = renderer.domElement;
    lerret.setAttribute('role', 'img');
    lerret.style.display = 'block';
    lerret.style.width = '100%';
    lerret.style.height = '100%';
    lerret.style.touchAction = 'none';
    el.prepend(lerret);

    const sc = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
    camera.up.set(0, 0, 1);
    camera.position.set(160, -260, 200);
    const kontroll = new OrbitControls(camera, lerret);
    kontroll.enableDamping = !reduserBevegelse();
    kontroll.dampingFactor = 0.12;
    kontroll.screenSpacePanning = true;

    sc.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(cssFarge(el, '--linje', '#3a3740')), 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.8);
    sol.position.set(-120, -200, 320);
    sc.add(sol);
    const motlys = new THREE.DirectionalLight(0xffffff, 0.5);
    motlys.position.set(200, 180, 120);
    sc.add(motlys);

    const modellGruppe = new THREE.Group();
    sc.add(modellGruppe);
    const plateGruppe = new THREE.Group();
    plateGruppe.name = 'plate';
    sc.add(plateGruppe);

    let ventende = false;
    const tegn = () => {
      if (ventende) return;
      ventende = true;
      requestAnimationFrame(() => {
        ventende = false;
        oppdaterForskyvning();
        if (kontroll.enableDamping) kontroll.update();
        renderer.render(sc, camera);
      });
    };
    kontroll.addEventListener('change', tegn);
    // refit on resize until the user has moved the camera
    let brukerHarFlyttet = false;
    kontroll.addEventListener('start', () => {
      brukerHarFlyttet = true;
    });

    // keep the model centred in the part of the view not covered by a floating panel
    let forrigeDekket = -1;
    const oppdaterForskyvning = () => {
      const panel = kompakt
        ? null
        : el.closest('.arbeidsomrade')?.querySelector<HTMLElement>('.flytpanel.venstre:not(.lukket)');
      const b = el.clientWidth || 1,
        h = el.clientHeight || 1;
      let dekket = panel ? panel.getBoundingClientRect().right - el.getBoundingClientRect().left : 0;
      if (dekket < 0 || dekket > b * 0.5) dekket = 0;
      if (dekket === forrigeDekket) return;
      forrigeDekket = dekket;
      if (dekket) camera.setViewOffset(b, h, -dekket / 2, 0, b, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };

    const storrelse = () => {
      const b = el.clientWidth || 1,
        h = el.clientHeight || 1;
      renderer.setSize(b, h, false);
      camera.aspect = b / h;
      forrigeDekket = -1;
      camera.updateProjectionMatrix();
      if (!brukerHarFlyttet && modellGruppe.children.length) tilpassRef.current();
      tegn();
    };
    const ro = new ResizeObserver(storrelse);
    ro.observe(el);
    storrelse();

    const s: Scene3d = {
      three: THREE,
      scene: sc,
      camera,
      lerret,
      modell: modellGruppe,
      tegn,
      prosjiser(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(camera);
        return {
          x: ((v.x + 1) / 2) * el.clientWidth,
          y: ((1 - v.y) / 2) * el.clientHeight,
          synlig: v.z < 1 && v.z > -1,
        };
      },
      straale(sx, sy) {
        const r = new THREE.Raycaster();
        r.setFromCamera(
          new THREE.Vector2((sx / el.clientWidth) * 2 - 1, -(sy / el.clientHeight) * 2 + 1),
          camera,
        );
        return r;
      },
      settKameraStyring(pa) {
        kontroll.enabled = pa;
      },
      fokuser(min, maks) {
        const boks = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...maks));
        if (boks.isEmpty()) return;
        const senter = boks.getCenter(new THREE.Vector3());
        const radius = Math.max(12, boks.getSize(new THREE.Vector3()).length() / 2);
        const halvV = THREE.MathUtils.degToRad(camera.fov / 2);
        const halvH = Math.atan(Math.tan(halvV) * camera.aspect);
        const avstand = (radius / Math.sin(Math.min(halvV, halvH))) * 1.25;
        const retning = camera.position.clone().sub(kontroll.target);
        if (retning.lengthSq() < 1e-6) retning.set(0.45, -1, 0.85);
        camera.position.copy(senter).add(retning.normalize().multiplyScalar(avstand));
        kontroll.target.copy(senter);
        camera.near = Math.max(0.5, avstand / 200);
        camera.far = Math.max(camera.far, avstand * 20);
        camera.updateProjectionMatrix();
        kontroll.update();
        brukerHarFlyttet = true;
        tegn();
      },
    };

    tilpassRef.current = (vinkel: Vinkel = 'perspektiv') => {
      const boks = new THREE.Box3().setFromObject(modellGruppe);
      if (boks.isEmpty()) boks.setFromObject(plateGruppe);
      if (boks.isEmpty()) return;
      const senter = boks.getCenter(new THREE.Vector3());
      const str = boks.getSize(new THREE.Vector3());
      const radius = Math.max(20, str.length() / 2);
      // fit the narrower of the vertical and horizontal field of view (portrait phones)
      const halvV = THREE.MathUtils.degToRad(camera.fov / 2);
      const halvH = Math.atan(Math.tan(halvV) * camera.aspect);
      const avstand = (radius / Math.sin(Math.min(halvV, halvH))) * 1.15;
      const retning =
        vinkel === 'topp'
          ? new THREE.Vector3(0, -0.0001, 1)
          : vinkel === 'front'
            ? new THREE.Vector3(0, -1, 0.0001)
            : vinkel === 'side'
              ? new THREE.Vector3(1, 0, 0.0001)
              : new THREE.Vector3(0.45, -1, 0.85);
      camera.position.copy(senter).add(retning.normalize().multiplyScalar(avstand));
      kontroll.target.copy(senter);
      camera.near = Math.max(0.5, avstand / 200);
      camera.far = avstand * 20;
      camera.updateProjectionMatrix();
      kontroll.update();
      tegn();
    };

    const kommandoer: [string, () => void][] = [
      ['tilpass', () => tilpassRef.current()],
      ['tegn', tegn],
    ];
    if (!kompakt) for (const [k, f] of kommandoer) benk.kommandoer.set(k, f);
    const rydd = plugin.tilpass3d?.(s, benk);
    settScene(s);
    return () => {
      if (!kompakt)
        for (const [k, f] of kommandoer) if (benk.kommandoer.get(k) === f) benk.kommandoer.delete(k);
      rydd?.();
      ro.disconnect();
      kontroll.dispose();
      sc.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      renderer.dispose();
      lerret.remove();
      settScene(null);
    };
  }, [benk, plugin, kompakt]);

  // build plate
  useEffect(() => {
    if (!scene) return;
    const g = scene.scene.getObjectByName('plate') as THREE.Group;
    g.clear();
    const el = vert.current!;
    const kant = new THREE.Color(cssFarge(el, '--linje', '#3a3740'));
    const svak = new THREE.Color(cssFarge(el, '--grafitt-2', '#2a282e'));
    const flate = new THREE.Mesh(
      new THREE.PlaneGeometry(plate.bredde, plate.dybde),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(cssFarge(el, '--grafitt', '#1c1b1f')),
        roughness: 1,
      }),
    );
    flate.position.z = -0.05;
    g.add(flate);
    // 10 mm grid, programmatic measurement geometry (D-3)
    const pts: number[] = [];
    const steg = 10;
    for (let x = -plate.bredde / 2; x <= plate.bredde / 2 + 1e-6; x += steg)
      pts.push(x, -plate.dybde / 2, 0, x, plate.dybde / 2, 0);
    for (let y = -plate.dybde / 2; y <= plate.dybde / 2 + 1e-6; y += steg)
      pts.push(-plate.bredde / 2, y, 0, plate.bredde / 2, y, 0);
    const rn = new THREE.BufferGeometry();
    rn.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(rn, new THREE.LineBasicMaterial({ color: svak })));
    const ramme = new THREE.BufferGeometry().setFromPoints(
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ].map(([a, b]) => new THREE.Vector3((a! * plate.bredde) / 2, (b! * plate.dybde) / 2, 0.01)),
    );
    g.add(new THREE.Line(ramme, new THREE.LineBasicMaterial({ color: kant })));
    scene.tegn();
  }, [scene, plate.bredde, plate.dybde]);

  // model meshes
  useEffect(() => {
    if (!scene) return;
    const g = scene.modell;
    for (const c of [...g.children]) {
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      g.remove(c);
    }
    for (const del of modell?.deler ?? []) {
      if (!del.mesh.indekser.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(del.mesh.posisjoner, 3));
      geo.setIndex(new THREE.BufferAttribute(del.mesh.indekser, 1));
      geo.computeBoundingSphere();
      const mat = plugin.material3d?.(del, THREE) ?? standardMateriale(del);
      leggTilPrintlag(mat, lagHoyde, printlagRef.current);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.delId = del.id;
      mesh.userData.lagId = del.lagId ?? del.id;
      mesh.name = del.navn;
      g.add(mesh);
    }
    if (forsteTilpasning.current && modell && modell.deler.length) {
      forsteTilpasning.current = false;
      tilpassRef.current();
    }
    scene.tegn();
    // lagHoyde is read when the model is rebuilt; its own effect below updates it.
  }, [scene, modell, plugin]);

  // print layer lines
  useEffect(() => {
    if (!scene) return;
    for (const c of scene.modell.children)
      settPrintlag((c as THREE.Mesh).material as THREE.Material, printlag, lagHoyde);
    scene.tegn();
  }, [scene, modell, printlag, lagHoyde]);

  // highlight the selected layer's part
  useEffect(() => {
    if (!scene || !vert.current) return;
    const lilla = new THREE.Color(cssFarge(vert.current, '--dp-lilla', '#883dff'));
    for (const c of scene.modell.children) {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (!('emissive' in m)) continue;
      const valgt = !kompakt && c.userData.lagId === valgtLag;
      m.emissive = valgt ? lilla : new THREE.Color(0, 0, 0);
      m.emissiveIntensity = valgt ? 0.07 : 0;
    }
    scene.tegn();
  }, [scene, modell, valgtLag, kompakt]);

  const beskrivelse = (() => {
    const deler = modell?.deler.filter((d) => d.mesh.indekser.length) ?? [];
    if (!deler.length) return 'Tom modell.';
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maksX = -Infinity,
      maksY = -Infinity,
      maksZ = -Infinity;
    for (const d of deler) {
      const b = avgrensning(d.mesh);
      minX = Math.min(minX, b.min[0]);
      minY = Math.min(minY, b.min[1]);
      minZ = Math.min(minZ, b.min[2]);
      maksX = Math.max(maksX, b.maks[0]);
      maksY = Math.max(maksY, b.maks[1]);
      maksZ = Math.max(maksZ, b.maks[2]);
    }
    const navn = deler.map((d) => `${d.navn} (${finnMateriale(d.materialId).navn})`).join(', ');
    return `${mm(maksX - minX)} bred, ${mm(maksY - minY)} dyp og ${mm(maksZ - minZ)} høy. ${deler.length} deler: ${navn}.`;
  })();

  useEffect(() => {
    scene?.lerret.setAttribute('aria-label', `${etikett ?? '3D-forhåndsvisning'}: ${beskrivelse}`);
  }, [scene, beskrivelse, etikett]);

  return (
    <div class={`visning3d${kompakt ? ' kompakt' : ''}`} ref={vert}>
      {feil && <p class="visning3d-feil">{feil}</p>}
      <div class="visning3d-verktoy">
        <div class="visning3d-vinkler" role="group" aria-label="Kameravinkel">
          {VINKLER.map((v) => (
            <button type="button" key={v.id} onClick={() => tilpassRef.current(v.id)}>
              {v.navn}
            </button>
          ))}
        </div>
        {!kompakt && (
          <div class="visning3d-printlag">
            <button type="button" aria-pressed={printlag} onClick={() => settPrintlagPa(!printlag)}>
              Printlag
            </button>
            {printlag && (
              <span class="visning3d-hint">
                Lag på {String(lagHoyde).replace('.', ',')} mm. Zoom inn for å se dem.
              </span>
            )}
          </div>
        )}
      </div>
      {scene && Overlegg && <Overlegg benk={benk} scene={scene} />}
    </div>
  );
}
