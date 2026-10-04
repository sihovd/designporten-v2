/**
 * BuildForge scene setup for the shared 3D view:
 *
 * - clicker: the switch as a see-through reference (never exported), the
 *   protected zones, the top at the bottom of its travel, the top pressed
 *   during «Prøv klikk»;
 * - both families: outlines for the selected and pointed-out shapes, a
 *   ghost of a part before it is attached, and handles (a gizmo) to move,
 *   turn and resize the selected shape. Clicking the model selects the
 *   shape under the pointer.
 *
 * Figure shapes live in their segment's frame, so their outlines and the
 * handles sit in a group at the segment's joint; the mirrored side of a
 * pair follows as a mirror image.
 *
 * Everything drawn here is functional geometry (D-3) derived from the
 * profile and the project; none of it changes the model until a handle is
 * let go, which is one undoable step.
 */
import type * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import type { Mesh } from '../../geometri/mesh';
import { cssFarge } from '../../shell/tema';
import { finnDel, plasserDel } from './bibliotek';
import { festepunkter } from './feste';
import { formBoks, formFelt } from './felt';
import { lagSkjelett, type Skjelett } from './figur';
import { transformerForm } from './handlinger';
import { byggMekanikk, type Mekanikk } from './mekanikk';
import {
  erPar,
  familieFor,
  formnavn,
  tolkParametre,
  type BuildforgeParametre,
  type Form,
  type Kropp,
} from './parametre';
import { finnProfil } from './profil';
import { lagRutenett, marsjer, sample } from './rutenett';
import { editor } from './tilstand';

const formMesher = new Map<string, Mesh>();
function formMesh(f: Form): Mesh {
  const nokkel = JSON.stringify([f.type, f.posisjon, f.rotasjon, f.mal, f.avrunding, f.speilet]);
  let m = formMesher.get(nokkel);
  if (!m) {
    m = marsjer(sample(lagRutenett(formBoks(f), 24_000, 0.35), formFelt(f)));
    if (formMesher.size > 200) formMesher.clear();
    formMesher.set(nokkel, m);
  }
  return m;
}

/** The shape alone at the origin, unturned: what the handles carry. */
const sentrert = (f: Form): Form => ({ ...f, posisjon: [0, 0, 0], rotasjon: [0, 0, 0], speilet: false });

const RAD = Math.PI / 180;

export function tilpassBuildforge3d(s: Scene3d, benk: Arbeidsbenk): () => void {
  const T = s.three;
  const el = s.lerret.parentElement ?? s.lerret;
  const farge = (navn: string, reserve: string) => new T.Color(cssFarge(el, navn, reserve));
  const lilla = farge('--dp-lilla', '#883dff');
  const cyan = farge('--dp-cyan', '#00c4d6');
  const feil = farge('--feil-mork', '#ff8a80');
  const graa = farge('--fg-dempet', '#a19fa6');

  const fast = new T.Group();
  fast.name = 'buildforge-hjelp';
  const bevegelig = new T.Group();
  bevegelig.name = 'buildforge-bevegelig';
  s.scene.add(fast, bevegelig);

  let mek: Mekanikk | null = null;
  let kildeTopp: THREE.Object3D | null = null;
  let mekNokkel = '';
  let skjelett: Skjelett | null = null;
  let skjelettNokkel = '';

  // handles
  const handtak = new TransformControls(s.camera, s.lerret);
  handtak.setSize(0.85);
  const hjelper = handtak.getHelper();
  s.scene.add(hjelper);
  let proxy: THREE.Object3D | null = null;
  let proxyForm: Form | null = null;
  /** Mirror images of the handled shape that follow it while it is dragged. */
  let kopier: THREE.Object3D[] = [];

  const tom = (g: THREE.Group) => {
    for (const c of [...g.children]) {
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        // the bottom-position copy shares the model's geometry
        if (!o.userData.delt) m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      g.remove(c);
    }
  };

  const boks = (min: number[], maks: number[], f: THREE.Color, opasitet: number, kanter: boolean) => {
    const geo = new T.BoxGeometry(maks[0]! - min[0]!, maks[1]! - min[1]!, maks[2]! - min[2]!);
    geo.translate((min[0]! + maks[0]!) / 2, (min[1]! + maks[1]!) / 2, (min[2]! + maks[2]!) / 2);
    if (kanter) {
      const l = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: f }));
      geo.dispose();
      return l;
    }
    return new T.Mesh(
      geo,
      new T.MeshStandardMaterial({
        color: f,
        transparent: true,
        opacity: opasitet,
        depthWrite: false,
        roughness: 0.6,
      }),
    );
  };

  const omriss = (m: Mesh, f: THREE.Color, gjennomsiktig = false) => {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(m.posisjoner, 3));
    geo.setIndex(new T.BufferAttribute(m.indekser, 1));
    if (gjennomsiktig) {
      geo.computeVertexNormals();
      return new T.Mesh(
        geo,
        new T.MeshStandardMaterial({
          color: f,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: T.DoubleSide,
        }),
      );
    }
    const l = new T.LineSegments(
      new T.EdgesGeometry(geo, 25),
      new T.LineBasicMaterial({ color: f, depthTest: false }),
    );
    l.renderOrder = 10;
    geo.dispose();
    return l;
  };

  /**
   * Groups a body's shapes are drawn in: its own frame, plus the mirrored
   * side for a figure pair. The first is where the handles go.
   */
  const holdere = (p: BuildforgeParametre, kropp: Kropp): THREE.Group[] => {
    if (kropp === 'topp' || kropp === 'underdel') {
      const g = new T.Group();
      (kropp === 'topp' ? bevegelig : fast).add(g);
      return [g];
    }
    const nokkel = JSON.stringify(p.grunnmodeller);
    if (nokkel !== skjelettNokkel) {
      skjelett = lagSkjelett(p.grunnmodeller ?? {});
      skjelettNokkel = nokkel;
    }
    const o = skjelett?.origo[kropp] ?? [0, 0, 0];
    const g = new T.Group();
    g.position.set(o[0], o[1], o[2]);
    fast.add(g);
    if (!erPar(kropp)) return [g];
    const sp = new T.Group();
    sp.position.set(-o[0], o[1], o[2]);
    sp.scale.x = -1;
    fast.add(sp);
    return [g, sp];
  };

  const settProxy = (f: Form) => {
    proxy!.position.set(f.posisjon[0], f.posisjon[1], f.posisjon[2]);
    proxy!.rotation.set(f.rotasjon[0] * RAD, f.rotasjon[1] * RAD, f.rotasjon[2] * RAD, 'ZYX');
    proxy!.scale.set(1, 1, 1);
  };

  const folgProxy = () => {
    if (!proxy) return;
    for (const k of kopier) {
      k.position.copy(proxy.position);
      k.quaternion.copy(proxy.quaternion);
      k.scale.copy(proxy.scale);
    }
  };

  const tegnHjelp = () => {
    // never rebuild under a handle that is being dragged
    if (handtak.dragging) return;
    handtak.detach();
    proxy = null;
    proxyForm = null;
    kopier = [];
    tom(fast);
    tom(bevegelig);
    const t = tolkParametre(benk.dok.parametre);
    if (!t.ok) return s.tegn();
    const p: BuildforgeParametre = t.p;
    const klikker = familieFor(p) === 'klikker';
    const e = editor.t;
    if (klikker) {
      const nokkel = `${p.profil.id}@${p.profil.versjon}`;
      if (nokkel !== mekNokkel) {
        const profil = finnProfil(p.profil.id, p.profil.versjon);
        mek = profil ? byggMekanikk(profil) : null;
        mekNokkel = nokkel;
      }
      if (mek) {
        if (e.visBryter)
          for (const r of mek.referanse)
            (r.beveger ? bevegelig : fast).add(boks(r.min, r.maks, graa, r.beveger ? 0.55 : 0.32, false));
        if (e.visLaast)
          for (const z of mek.sperresoner)
            (z.kropp === 'topp' ? bevegelig : fast).add(boks(z.min, z.maks, cyan, 0, true));
        if (e.visVolum) {
          // the top as it stands at the bottom of the travel
          const toppDel = s.modell.children.find((c) => c.userData.delId === 'topp') as
            THREE.Mesh | undefined;
          kildeTopp = toppDel ?? null;
          if (toppDel) {
            const kopi = new T.Mesh(
              toppDel.geometry,
              new T.MeshStandardMaterial({
                color: cyan,
                transparent: true,
                opacity: 0.25,
                depthWrite: false,
              }),
            );
            kopi.position.z = -mek.mal.vandring;
            kopi.userData.delt = true;
            fast.add(kopi);
          }
        }
      }
    }
    for (const f of p.former) {
      const merket = e.merket.includes(f.id);
      const valgt = f.id === e.valgt;
      if (!valgt && !merket) continue;
      const grupper = holdere(p, f.kropp);
      if (!valgt || e.plasserer) {
        for (const g of grupper) g.add(omriss(formMesh(f), merket ? feil : lilla));
        continue;
      }
      // the selected shape rides on the handles; its mirror images follow
      const lokal = formMesh(sentrert(f));
      proxy = new T.Object3D();
      proxyForm = f;
      grupper[0]!.add(proxy);
      settProxy(f);
      proxy.add(omriss(lokal, merket ? feil : lilla));
      grupper.forEach((g, i) => {
        const speil: THREE.Object3D[] = [];
        if (i > 0) speil.push(g);
        if (f.speilet) {
          const sg = new T.Group();
          sg.scale.x = -1;
          g.add(sg);
          speil.push(sg);
        }
        for (const sg of speil) {
          const k = new T.Object3D();
          k.add(omriss(lokal, merket ? feil : lilla));
          sg.add(k);
          kopier.push(k);
        }
      });
      folgProxy();
      handtak.attach(proxy);
    }
    if (e.plasserer && e.sikter) {
      const del = finnDel(e.plasserer);
      const punkt = festepunkter(p).find((x) => x.id === e.sikter);
      if (del && punkt)
        for (const f of plasserDel(del, punkt))
          for (const g of holdere(p, f.kropp)) g.add(omriss(formMesh(f), lilla, true));
    }
    settModus();
    s.tegn();
  };

  const settModus = () => {
    const v = editor.t.verktoy;
    handtak.setMode(v === 'flytt' ? 'translate' : v === 'roter' ? 'rotate' : 'scale');
    handtak.setSpace(v === 'flytt' ? 'world' : 'local');
    // a sphere only has one size
    const kule = proxyForm?.type === 'kule' && v === 'skaler';
    handtak.showX = !kule;
    handtak.showY = !kule;
    handtak.showZ = !kule;
  };

  /** Let go of a handle: the proxy's transform becomes one undoable change. */
  const bekreft = () => {
    const f = proxyForm;
    if (!proxy || !f) return;
    const e = new T.Euler().setFromQuaternion(proxy.quaternion, 'ZYX');
    const sc = proxy.scale;
    // the axis the user actually pulled decides a shape with a shared size
    const mest = (...v: number[]) => v.reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a), 1);
    const m = f.mal;
    const mal: Form['mal'] =
      f.type === 'kule'
        ? [m[0] * mest(sc.x, sc.y, sc.z), m[0] * mest(sc.x, sc.y, sc.z), m[0] * mest(sc.x, sc.y, sc.z)]
        : f.type === 'boks'
          ? [m[0] * sc.x, m[1] * sc.y, m[2] * sc.z]
          : [m[0] * mest(sc.x, sc.y), m[1] * mest(sc.x, sc.y), m[2] * sc.z];
    const v = editor.t.verktoy;
    transformerForm(
      benk,
      f.id,
      v === 'flytt' ? 'Flytt med håndtak' : v === 'roter' ? 'Roter med håndtak' : 'Skaler med håndtak',
      {
        posisjon: [proxy.position.x, proxy.position.y, proxy.position.z],
        rotasjon: [e.x / RAD, e.y / RAD, e.z / RAD],
        mal,
      },
    );
    benk.melde(`${f.navn || formnavn[f.type]} er endret.`);
    // nothing changed (a click on a handle): put the handles back where they were
    tegnHjelp();
  };

  handtak.addEventListener('change', () => s.tegn());
  handtak.addEventListener('objectChange', folgProxy);
  handtak.addEventListener('dragging-changed', (ev) => {
    const drar = !!(ev as unknown as { value: boolean }).value;
    s.settKameraStyring(!drar);
    if (!drar) bekreft();
  });

  let ventende = 0;
  const planlegg = () => {
    if (ventende) return;
    ventende = requestAnimationFrame(() => {
      ventende = 0;
      tegnHjelp();
    });
  };

  // the top (and everything that moves with it) is drawn pressed by `trykk`
  let forrigeTrykk = editor.t.trykk;
  let forrigeVerktoy = editor.t.verktoy;
  s.scene.onBeforeRender = () => {
    const z = -editor.t.trykk;
    bevegelig.position.z = z;
    for (const c of s.modell.children) {
      const g = (c as THREE.Mesh).geometry;
      if (g && !g.getAttribute('normal')) g.computeVertexNormals();
    }
    for (const c of s.modell.children)
      if (c.userData.delId === 'topp') {
        c.position.z = z;
        // the model was rebuilt: redraw the bottom-position copy from the new mesh
        if (editor.t.visVolum && c !== kildeTopp) planlegg();
      }
  };

  const avEditor = editor.lytt((e) => {
    if (e.trykk !== forrigeTrykk) {
      forrigeTrykk = e.trykk;
      s.tegn();
      return;
    }
    if (e.verktoy !== forrigeVerktoy) {
      forrigeVerktoy = e.verktoy;
      settModus();
      s.tegn();
      return;
    }
    planlegg();
  });
  const avBenk = benk.lytt(planlegg);

  // click to select: the shape whose field is lowest where the ray meets the model
  let ned: { x: number; y: number; handtak: boolean } | null = null;
  const pekNed = (ev: PointerEvent) => {
    ned = { x: ev.clientX, y: ev.clientY, handtak: handtak.axis !== null || handtak.dragging };
  };
  const pekOpp = (ev: PointerEvent) => {
    if (!ned || ned.handtak || Math.hypot(ev.clientX - ned.x, ev.clientY - ned.y) > 4) return;
    ned = null;
    const t = tolkParametre(benk.dok.parametre);
    if (!t.ok) return;
    const r = s.lerret.getBoundingClientRect();
    const treff = s
      .straale(ev.clientX - r.left, ev.clientY - r.top)
      .intersectObjects(s.modell.children, false)[0];
    if (!treff) {
      if (!editor.t.plasserer) editor.sett({ valgt: null, merket: [] });
      return;
    }
    const delId = treff.object.userData.delId as string;
    const q = treff.point;
    // the hit point in the frame the shapes are stored in
    let kropp: Kropp;
    let l: [number, number, number];
    if (delId === 'topp' || delId === 'underdel') {
      kropp = delId;
      l = [q.x, q.y, q.z + (delId === 'topp' ? editor.t.trykk : 0)];
    } else {
      const sk = lagSkjelett(t.p.grunnmodeller ?? {});
      const inst = sk?.instanser.find((i) => i.id === delId);
      if (!inst) return;
      kropp = inst.kropp;
      const o = inst.origo;
      l = inst.speilet ? [o[0] - q.x, q.y - o[1], q.z - o[2]] : [q.x - o[0], q.y - o[1], q.z - o[2]];
    }
    let beste: { id: string; d: number } | null = null;
    for (const f of t.p.former) {
      if (f.kropp !== kropp || f.operasjon === 'trekk-fra') continue;
      const d = formFelt(f)(l[0], l[1], l[2]);
      if (!beste || d < beste.d) beste = { id: f.id, d };
    }
    editor.sett({ valgt: beste && beste.d < 1.5 ? beste.id : null, merket: [] });
    benk.melde(
      beste && beste.d < 1.5
        ? `Valgt: ${t.p.former.find((f) => f.id === beste!.id)?.navn}`
        : familieFor(t.p) === 'klikker'
          ? 'Det låste festet kan ikke endres.'
          : 'Leddene er låst og kan ikke endres.',
    );
  };
  s.lerret.addEventListener('pointerdown', pekNed);
  s.lerret.addEventListener('pointerup', pekOpp);

  tegnHjelp();
  return () => {
    avEditor();
    avBenk();
    cancelAnimationFrame(ventende);
    s.lerret.removeEventListener('pointerdown', pekNed);
    s.lerret.removeEventListener('pointerup', pekOpp);
    s.scene.onBeforeRender = () => {};
    handtak.detach();
    handtak.dispose();
    s.scene.remove(hjelper);
    tom(fast);
    tom(bevegelig);
    s.scene.remove(fast, bevegelig);
  };
}
