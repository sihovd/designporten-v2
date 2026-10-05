/**
 * BuildForge scene setup for the shared 3D view.
 *
 * Clicker: the switch as a see-through reference (never exported), the
 * protected zones, the top at the bottom of its travel, the top pressed
 * during «Prøv klikk».
 *
 * Modular builder (handoff 2026-10-04):
 * - on the whole model, clicking a part selects it (tinted purple),
 *   double-clicking goes inside it, right-clicking opens its menu, and
 *   dragging it moves it with everything connected to it;
 * - dragging a part from the library or across the plate shows the fitting
 *   free connectors only while dragging; the nearest turns green and the
 *   part swings onto it, a part held over another part turns it green for
 *   Replace, anywhere else it lands loose on the plate (dra.ts);
 * - inside a part, the other parts fade back and the part's shapes can be
 *   selected and handled as before.
 *
 * Both: outlines for the selected and pointed-out shapes, a ghost of a
 * detail before it is attached, and handles (a gizmo) to move, turn and
 * resize. Everything drawn here is functional geometry (D-3) derived from
 * the profile and the project; none of it changes the model until a drag
 * or a handle is let go, which is one undoable step.
 */
import type * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import type { Mesh } from '../../geometri/mesh';
import { cssFarge } from '../../shell/tema';
import { finnDel, plasserDel } from './bibliotek';
import { registrerLerret, startDra, avbrytDra, type Drakilde } from './dra';
import { festepunkter } from './feste';
import { formFelt, formerI, dekorBoks } from './felt';
import { formMesh } from './formmesh';
import {
  anvend,
  finnKropp,
  forbindelseVed,
  gange,
  kompatible,
  passerNy,
  komponentAv,
  koble,
  koblingIVerden,
  koblingsnavn,
  kropperAv,
  leggTilOgKoble,
  plasser,
  SPEIL,
  transponer,
  type Plassering,
} from './graf';
import {
  erstattKropp,
  flyttGruppe,
  gaInn,
  kobleGruppe,
  kobleNyKropp,
  leggNyKroppLost,
  leggTilKobling,
  transformerForm,
} from './handlinger';
import { finnKroppsmal, lagKropp } from './kroppsbibliotek';
import { byggMekanikk, type Mekanikk } from './mekanikk';
import {
  familieFor,
  formnavn,
  tolkParametre,
  type BuildforgeParametre,
  type Ende,
  type Form,
  type Kobling,
  type V3,
} from './parametre';
import { finnProfil } from './profil';
import { editor, type Drastatus } from './tilstand';

/** The shape alone at the origin, unturned: what the handles carry. */
const sentrert = (f: Form): Form => ({ ...f, posisjon: [0, 0, 0], rotasjon: [0, 0, 0], speilet: false });

const RAD = Math.PI / 180;
/** How close (px) the pointer must come to a free connector to snap to it. */
const SNAPPAVSTAND = 56;

/** Placements of the current project, computed once per project revision. */
const plassHurtig = new WeakMap<object, Map<string, Plassering>>();
function plassFor(p: BuildforgeParametre): Map<string, Plassering> {
  let m = plassHurtig.get(p);
  if (!m) {
    m = plasser(p);
    plassHurtig.set(p, m);
  }
  return m;
}

/** A 4×4 THREE matrix from a placement. */
function matrise4(T: typeof THREE, pl: Plassering): THREE.Matrix4 {
  const m = pl.m;
  return new T.Matrix4().set(
    m[0]!,
    m[1]!,
    m[2]!,
    pl.t[0],
    m[3]!,
    m[4]!,
    m[5]!,
    pl.t[1],
    m[6]!,
    m[7]!,
    m[8]!,
    pl.t[2],
    0,
    0,
    0,
    1,
  );
}

/** Placement a → b relative: b · a⁻¹. */
function relativ(a: Plassering, b: Plassering): Plassering {
  const inv = transponer(a.m);
  const m = gange(b.m, inv);
  const t = anvend(m, a.t);
  return { m, t: [b.t[0] - t[0], b.t[1] - t[1], b.t[2] - t[2]] };
}

type Losning =
  | {
      type: 'koble';
      mal: Ende;
      egen: Ende;
      /** Preview: where parts move (part id → displacement), and the new part's placement. */
      flytt: Map<string, Plassering>;
      ny?: Plassering;
      kandidater: number;
      indeks: number;
    }
  | { type: 'erstatt'; kropp: string; ny: Plassering }
  | { type: 'los'; punkt: V3; ny?: Plassering; flytt: Map<string, Plassering> }
  | { type: 'ugyldig' };

export function tilpassBuildforge3d(s: Scene3d, benk: Arbeidsbenk): () => void {
  const T = s.three;
  const el = s.lerret.parentElement ?? s.lerret;
  const farge = (navn: string, reserve: string) => new T.Color(cssFarge(el, navn, reserve));
  const lilla = farge('--dp-lilla', '#883dff');
  const cyan = farge('--dp-cyan', '#00c4d6');
  const feil = farge('--feil-mork', '#ff8a80');
  const graa = farge('--fg-dempet', '#a19fa6');
  const gronn = farge('--ok-mork', '#5fd18f');

  const fast = new T.Group();
  fast.name = 'buildforge-hjelp';
  const bevegelig = new T.Group();
  bevegelig.name = 'buildforge-bevegelig';
  const draLag = new T.Group();
  draLag.name = 'buildforge-dra';
  s.scene.add(fast, bevegelig, draLag);

  let mek: Mekanikk | null = null;
  let kildeTopp: THREE.Object3D | null = null;
  let mekNokkel = '';

  // handles
  const handtak = new TransformControls(s.camera, s.lerret);
  handtak.setSize(0.85);
  const hjelper = handtak.getHelper();
  s.scene.add(hjelper);
  let proxy: THREE.Object3D | null = null;
  /** What the handles carry: a shape (in a body frame) or a whole part. */
  let proxyForm: { f: Form; speilet: boolean } | null = null;
  let proxyKropp: { id: string; start: Plassering } | null = null;
  /** Mirror images of the handled shape that follow it while it is dragged. */
  let kopier: THREE.Object3D[] = [];

  // drag preview state
  let draVisning: { flytt: Map<string, Plassering>; gronn: string | null } = {
    flytt: new Map(),
    gronn: null,
  };
  /** After a drop, keep the preview until the rebuilt model arrives. */
  let ventPaModell: object | null = null;

  const tom = (g: THREE.Group) => {
    for (const c of [...g.children]) {
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        // shared geometry is not ours to dispose
        if (!o.userData.delt) m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (!o.userData.deltMateriale)
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

  const geometri = (m: Mesh) => {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(m.posisjoner, 3));
    geo.setIndex(new T.BufferAttribute(m.indekser, 1));
    return geo;
  };

  const omriss = (m: Mesh, f: THREE.Color, gjennomsiktig = false) => {
    const geo = geometri(m);
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

  const tolk = (): BuildforgeParametre | null => {
    const t = tolkParametre(benk.dok.parametre);
    return t.ok ? t.p : null;
  };

  /** A group placed like a part, without its mirror (rotation and position only). */
  const kroppGruppe = (pl: Plassering, speilet: boolean): THREE.Group => {
    const g = new T.Group();
    const r = speilet ? gange(pl.m, SPEIL) : pl.m;
    g.matrixAutoUpdate = false;
    g.matrix.copy(matrise4(T, { m: r, t: pl.t }));
    return g;
  };

  /**
   * Groups a shape is drawn in. `ytre` is unmirrored (the handles go here);
   * `indre` is the body's own frame (mirrored for a mirrored part).
   */
  const holdere = (
    p: BuildforgeParametre,
    kropp: string,
  ): { ytre: THREE.Group; indre: THREE.Group; speilet: boolean } => {
    if (familieFor(p) === 'klikker') {
      const g = new T.Group();
      (kropp === 'topp' ? bevegelig : fast).add(g);
      return { ytre: g, indre: g, speilet: false };
    }
    const k = finnKropp(p, kropp);
    const pl = plassFor(p).get(kropp) ?? { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] as V3 };
    const ytre = kroppGruppe(pl, !!k?.speilet);
    fast.add(ytre);
    if (!k?.speilet) return { ytre, indre: ytre, speilet: false };
    const indre = new T.Group();
    indre.scale.x = -1;
    ytre.add(indre);
    return { ytre, indre, speilet: true };
  };

  /** A shape's transform as seen in the unmirrored group (mirrored when its part is). */
  const settProxyForm = (f: Form, speilet: boolean) => {
    const R = new T.Matrix4().makeRotationFromEuler(
      new T.Euler(f.rotasjon[0] * RAD, f.rotasjon[1] * RAD, f.rotasjon[2] * RAD, 'ZYX'),
    );
    if (speilet) {
      const S = new T.Matrix4().makeScale(-1, 1, 1);
      R.premultiply(S).multiply(S);
    }
    proxy!.position.set(speilet ? -f.posisjon[0] : f.posisjon[0], f.posisjon[1], f.posisjon[2]);
    proxy!.quaternion.setFromRotationMatrix(R);
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
    proxyKropp = null;
    kopier = [];
    tom(fast);
    tom(bevegelig);
    const p = tolk();
    if (!p) return s.tegn();
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
      if (!klikker && e.inne !== f.kropp && !merket) continue;
      const h = holdere(p, f.kropp);
      if (!valgt || e.plasserer) {
        h.indre.add(omriss(formMesh(f), merket ? feil : lilla));
        continue;
      }
      // the selected shape rides on the handles; its mirror image follows
      const lokal = formMesh(sentrert(f));
      proxy = new T.Object3D();
      proxyForm = { f, speilet: h.speilet };
      h.ytre.add(proxy);
      settProxyForm(f, h.speilet);
      proxy.add(omriss(lokal, merket ? feil : lilla));
      if (f.speilet) {
        const sg = new T.Group();
        sg.scale.x = -1;
        h.ytre.add(sg);
        const k = new T.Object3D();
        k.add(omriss(lokal, merket ? feil : lilla));
        sg.add(k);
        kopier.push(k);
      }
      folgProxy();
      handtak.attach(proxy);
    }
    // a whole part on the handles (move and turn its group)
    if (!klikker && !e.inne && e.kropp && !e.dra && !e.meny) {
      const k = finnKropp(p, e.kropp);
      const pl = plassFor(p).get(e.kropp);
      if (k && pl) {
        const r = k.speilet ? gange(pl.m, SPEIL) : pl.m;
        proxy = new T.Object3D();
        proxy.matrix.copy(matrise4(T, { m: r, t: pl.t }));
        proxy.matrix.decompose(proxy.position, proxy.quaternion, proxy.scale);
        proxyKropp = { id: k.id, start: { m: r, t: [...pl.t] } };
        fast.add(proxy);
        handtak.attach(proxy);
      }
    }
    if (e.plasserer && e.sikter) {
      const del = finnDel(e.plasserer);
      const punkt = festepunkter(p).find((x) => x.id === e.sikter);
      if (del && punkt)
        for (const f of plasserDel(del, punkt))
          holdere(p, f.kropp).indre.add(omriss(formMesh(f), lilla, true));
    }
    settModus();
    s.tegn();
  };

  const settModus = () => {
    let v = editor.t.verktoy;
    // a whole part is moved or turned, never resized (its joints have fixed sizes)
    if (proxyKropp && v === 'skaler') v = 'flytt';
    handtak.setMode(v === 'flytt' ? 'translate' : v === 'roter' ? 'rotate' : 'scale');
    handtak.setSpace(v === 'flytt' ? 'world' : 'local');
    // a sphere only has one size
    const kule = proxyForm?.f.type === 'kule' && v === 'skaler';
    handtak.showX = !kule;
    handtak.showY = !kule;
    // a part stands on the plate, so moving it up or down does nothing
    handtak.showZ = !kule && !(proxyKropp && v === 'flytt');
  };

  /** Let go of a handle: the proxy's transform becomes one undoable change. */
  const bekreft = () => {
    if (!proxy) return;
    if (proxyKropp) {
      proxy.updateMatrix();
      const e = proxy.matrix.elements;
      const til: Plassering = {
        m: [e[0]!, e[4]!, e[8]!, e[1]!, e[5]!, e[9]!, e[2]!, e[6]!, e[10]!],
        t: [e[12]!, e[13]!, e[14]!],
      };
      flyttGruppe(
        benk,
        proxyKropp.id,
        relativ(proxyKropp.start, til),
        editor.t.verktoy === 'roter' ? 'Vri' : 'Flytt',
      );
      tegnHjelp();
      return;
    }
    const pf = proxyForm;
    if (!pf) return;
    const f = pf.f;
    // back from the unmirrored group to the part's own frame
    const R = new T.Matrix4().makeRotationFromQuaternion(proxy.quaternion);
    if (pf.speilet) {
      const S = new T.Matrix4().makeScale(-1, 1, 1);
      R.premultiply(S).multiply(S);
    }
    const e = new T.Euler().setFromRotationMatrix(R, 'ZYX');
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
        posisjon: [pf.speilet ? -proxy.position.x : proxy.position.x, proxy.position.y, proxy.position.z],
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

  // ---------------------------------------------------------------------------
  // Drag: resolve, preview, apply

  const ghostGeo = new Map<string, THREE.BufferGeometry>();
  const ghostGeometri = (malId: string): THREE.BufferGeometry | null => {
    let g = ghostGeo.get(malId);
    if (g) return g;
    const km = finnKroppsmal(malId);
    if (!km) return null;
    const meshes = lagKropp(km).former.map((f) => formMesh(f));
    const n = meshes.reduce((a, m) => a + m.posisjoner.length, 0);
    const pos = new Float32Array(n);
    const ind: number[] = [];
    let o = 0;
    for (const m of meshes) {
      pos.set(m.posisjoner, o);
      for (const i of m.indekser) ind.push(i + o / 3);
      o += m.posisjoner.length;
    }
    g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(ind);
    g.computeVertexNormals();
    ghostGeo.set(malId, g);
    return g;
  };
  const markorGeo = new T.SphereGeometry(1, 16, 12);
  const markorSvak = new T.MeshBasicMaterial({
    color: lilla,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
  });
  const markorAktiv = new T.MeshBasicMaterial({ color: gronn, depthTest: false });

  const markor = (punkt: V3, aktiv: boolean) => {
    const m = new T.Mesh(markorGeo, aktiv ? markorAktiv : markorSvak);
    m.position.set(punkt[0], punkt[1], punkt[2]);
    m.scale.setScalar(aktiv ? 3.2 : 2.2);
    m.renderOrder = 20;
    m.userData.delt = true;
    m.userData.deltMateriale = true;
    draLag.add(m);
  };

  const ghost = (malId: string, pl: Plassering, f: THREE.Color) => {
    const geo = ghostGeometri(malId);
    if (!geo) return;
    const m = new T.Mesh(
      geo,
      new T.MeshStandardMaterial({
        color: f,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        roughness: 0.7,
      }),
    );
    m.matrixAutoUpdate = false;
    m.matrix.copy(matrise4(T, pl));
    m.userData.delt = true;
    draLag.add(m);
  };

  const skjerm = (punkt: V3) => s.prosjiser(punkt[0], punkt[1], punkt[2]);
  const iLerret = (x: number, y: number) => {
    const r = s.lerret.getBoundingClientRect();
    return {
      sx: x - r.left,
      sy: y - r.top,
      inni: x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
    };
  };
  /** Where the pointer meets the horizontal plane at height z. */
  const paPlan = (sx: number, sy: number, z = 0): V3 | null => {
    const r = s.straale(sx, sy).ray;
    if (Math.abs(r.direction.z) < 1e-6) return null;
    const t = (z - r.origin.z) / r.direction.z;
    if (t <= 0) return null;
    return [r.origin.x + r.direction.x * t, r.origin.y + r.direction.y * t, z];
  };
  const treffKropp = (sx: number, sy: number): { kropp: string; punkt: V3 } | null => {
    const t = s.straale(sx, sy).intersectObjects(s.modell.children, false)[0];
    if (!t) return null;
    return { kropp: t.object.userData.delId as string, punkt: [t.point.x, t.point.y, t.point.z] };
  };

  /** Free connectors on parts outside `utenfor` that fit at least one of `egne`, nearest the pointer first. */
  const mal = (
    p: BuildforgeParametre,
    egne: Kobling[],
    utenfor: Set<string>,
    sx: number,
    sy: number,
    ny = false,
  ) => {
    const plass = plassFor(p);
    const ut: { ende: Ende; kb: Kobling; punkt: V3; d: number }[] = [];
    for (const k of kropperAv(p)) {
      if (utenfor.has(k.id)) continue;
      const pl = plass.get(k.id)!;
      for (const kb of k.koblinger) {
        if (forbindelseVed(p, { kropp: k.id, kobling: kb.id })) continue;
        if (!egne.some((x) => (ny ? passerNy(x, kb) : kompatible(x, kb)))) continue;
        const punkt = koblingIVerden(pl, kb).punkt;
        const sk = skjerm(punkt);
        if (!sk.synlig) continue;
        ut.push({ ende: { kropp: k.id, kobling: kb.id }, kb, punkt, d: Math.hypot(sk.x - sx, sk.y - sy) });
      }
    }
    return ut.sort((a, b) => a.d - b.d);
  };

  /** Displacements of every part whose placement changes from p to q, keeping the target part still. */
  const forskyvninger = (p: BuildforgeParametre, q: BuildforgeParametre, fast_: string) => {
    const a = plassFor(p),
      b = plasser(q);
    // q may stand the group differently on the plate; keep the part we snap to where it is
    const pa = a.get(fast_)!,
      pb = b.get(fast_)!;
    const just = relativ(pb, pa);
    const ut = new Map<string, Plassering>();
    for (const [id, pl] of b) {
      const juster: Plassering = {
        m: gange(just.m, pl.m),
        t: anvend(just.m, pl.t).map((v, i) => v + just.t[i]!) as V3,
      };
      const fra = a.get(id);
      if (fra) ut.set(id, relativ(fra, juster));
      else ut.set(id, juster);
    }
    return ut;
  };

  const losDra = (
    kilde: Drakilde,
    x: number,
    y: number,
    syklus: number,
    startX: number,
    startY: number,
  ): Losning => {
    const p = tolk();
    if (!p || familieFor(p) !== 'modul') return { type: 'ugyldig' };
    const { sx, sy, inni } = iLerret(x, y);
    if (!inni) return { type: 'ugyldig' };

    if (kilde.type === 'bibliotek') {
      const km = finnKroppsmal(kilde.malId);
      if (!km) return { type: 'ugyldig' };
      const ny = lagKropp(km);
      const kobleTil = (kandidatMal: { ende: Ende; kb: Kobling }): Losning | null => {
        const kandidater = ny.kropp.koblinger
          .map((kb, i) => ({ kb, i }))
          .filter(({ kb }) => passerNy(kb, kandidatMal.kb))
          .sort(
            (a, b) =>
              (a.kb.rolle === kandidatMal.kb.rolle ? 0 : 1) - (b.kb.rolle === kandidatMal.kb.rolle ? 0 : 1) ||
              a.i - b.i,
          );
        if (!kandidater.length) return null;
        const indeks = syklus % kandidater.length;
        const egen = kandidater[indeks]!.kb;
        const r = leggTilOgKoble(p, ny, egen.id, kandidatMal.ende);
        if (!r.ok) return null;
        const flytt = forskyvninger(p, r.p, kandidatMal.ende.kropp);
        const nyPl = flytt.get(ny.kropp.id);
        flytt.delete(ny.kropp.id);
        return {
          type: 'koble',
          mal: kandidatMal.ende,
          egen: { kropp: '', kobling: egen.id },
          flytt,
          ny: nyPl,
          kandidater: kandidater.length,
          indeks,
        };
      };
      const alle = mal(p, ny.kropp.koblinger, new Set(), sx, sy, true);
      const treff = treffKropp(sx, sy);
      const under = treff ? finnKropp(p, treff.kropp) : undefined;
      // the same kind of part held over a part replaces it (handoff §11): an arm over an arm
      const erstatt = (): Losning | null => {
        const pl = under ? plassFor(p).get(under.id) : undefined;
        return under && pl ? { type: 'erstatt', kropp: under.id, ny: { m: pl.m, t: pl.t } } : null;
      };
      if (under && under.kategori === km.kategori) return erstatt()!;
      const naer = alle[0];
      if (naer && naer.d < SNAPPAVSTAND) {
        const l = kobleTil(naer);
        if (l) return l;
      }
      // over another kind of part: snap to its nearest fitting connector, else replace it
      if (under) {
        const paDelen = alle.find((x) => x.ende.kropp === under.id);
        const l = paDelen ? kobleTil(paDelen) : null;
        return l ?? erstatt()!;
      }
      const punkt = paPlan(sx, sy);
      if (!punkt) return { type: 'ugyldig' };
      const b = dekorBoks(ny.former);
      return {
        type: 'los',
        punkt,
        ny: { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [punkt[0], punkt[1], -(b?.min[2] ?? 0)] },
        flytt: new Map(),
      };
    }

    // a part (and its group) dragged across the plate
    const komp = new Set(komponentAv(p, kilde.kropp));
    const plass = plassFor(p);
    const grep = plass.get(kilde.kropp)!;
    const s0 = iLerret(startX, startY);
    const a0 = paPlan(s0.sx, s0.sy, grep.t[2]);
    const a1 = paPlan(sx, sy, grep.t[2]);
    const delta: V3 = a0 && a1 ? [a1[0] - a0[0], a1[1] - a0[1], 0] : [0, 0, 0];
    const egneFrie: { ende: Ende; kb: Kobling; punkt: V3 }[] = [];
    for (const id of komp) {
      const k = finnKropp(p, id)!;
      for (const kb of k.koblinger) {
        if (forbindelseVed(p, { kropp: id, kobling: kb.id })) continue;
        const pk = koblingIVerden(plass.get(id)!, kb).punkt;
        egneFrie.push({
          ende: { kropp: id, kobling: kb.id },
          kb,
          punkt: [pk[0] + delta[0], pk[1] + delta[1], pk[2]],
        });
      }
    }
    const kandidatMal = mal(
      p,
      egneFrie.map((x) => x.kb),
      komp,
      sx,
      sy,
    )[0];
    if (kandidatMal && kandidatMal.d < SNAPPAVSTAND) {
      const kandidater = egneFrie
        .filter((x) => kompatible(x.kb, kandidatMal.kb))
        .map((x) => ({ ...x, d: Math.hypot(...(x.punkt.map((v, i) => v - kandidatMal.punkt[i]!) as V3)) }))
        .sort((a, b) => a.d - b.d);
      const indeks = syklus % kandidater.length;
      const egen = kandidater[indeks]!;
      const r = koble(p, egen.ende, kandidatMal.ende);
      if (r.ok)
        return {
          type: 'koble',
          mal: kandidatMal.ende,
          egen: egen.ende,
          flytt: forskyvninger(p, r.p, kandidatMal.ende.kropp),
          kandidater: kandidater.length,
          indeks,
        };
    }
    const flytt = new Map<string, Plassering>();
    for (const id of komp) flytt.set(id, { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: delta });
    return { type: 'los', punkt: delta, flytt };
  };

  const visDra = (kilde: Drakilde, l: Losning): Drastatus | null => {
    tom(draLag);
    draVisning = { flytt: new Map(), gronn: null };
    const p = tolk();
    if (!p) return null;
    const malId = kilde.type === 'bibliotek' ? kilde.malId : null;
    const navn = malId
      ? finnKroppsmal(malId)?.navn
      : finnKropp(p, kilde.type === 'gruppe' ? kilde.kropp : '')?.navn;
    // the fitting free connectors show only while dragging (handoff §51)
    const egne =
      kilde.type === 'bibliotek'
        ? (finnKroppsmal(kilde.malId)?.koblinger ?? []).map((x) => ({ ...x, familie: 'svivel' as const }))
        : komponentAv(p, kilde.kropp).flatMap((id) =>
            finnKropp(p, id)!.koblinger.filter((kb) => !forbindelseVed(p, { kropp: id, kobling: kb.id })),
          );
    const utenfor = new Set(kilde.type === 'gruppe' ? komponentAv(p, kilde.kropp) : []);
    const plass = plassFor(p);
    for (const k of kropperAv(p)) {
      if (utenfor.has(k.id)) continue;
      for (const kb of k.koblinger) {
        if (
          forbindelseVed(p, { kropp: k.id, kobling: kb.id }) ||
          !egne.some((x) => (kilde.type === 'bibliotek' ? passerNy(x, kb) : kompatible(x, kb)))
        )
          continue;
        const aktiv = l.type === 'koble' && l.mal.kropp === k.id && l.mal.kobling === kb.id;
        markor(koblingIVerden(plass.get(k.id)!, kb).punkt, aktiv);
      }
    }
    let status: Drastatus;
    if (l.type === 'koble') {
      draVisning.flytt = l.flytt;
      if (malId && l.ny) ghost(malId, l.ny, gronn);
      const egenNavn =
        kilde.type === 'bibliotek'
          ? finnKroppsmal(kilde.malId)?.koblinger.find((x) => x.id === l.egen.kobling)?.navn
          : finnKobling(p, l.egen)?.navn;
      status = {
        type: 'koble',
        tekst: `Fest ${navn?.toLowerCase() ?? 'delen'} med ${egenNavn?.toLowerCase() ?? 'koblingen'} på ${koblingsnavn(p, l.mal).toLowerCase()}`,
        indeks: l.indeks + 1,
        antall: l.kandidater,
      };
    } else if (l.type === 'erstatt') {
      draVisning.gronn = l.kropp;
      if (malId) ghost(malId, l.ny, gronn);
      status = {
        type: 'erstatt',
        tekst: `Bytt ut ${finnKropp(p, l.kropp)?.navn.toLowerCase()} med ${navn?.toLowerCase()}`,
        indeks: 0,
        antall: 0,
      };
    } else if (l.type === 'los') {
      draVisning.flytt = l.flytt;
      if (malId && l.ny) ghost(malId, l.ny, lilla);
      status = {
        type: 'los',
        tekst:
          kilde.type === 'bibliotek'
            ? `Legg ${navn?.toLowerCase()} løst på platen`
            : `Flytt ${navn?.toLowerCase()}`,
        indeks: 0,
        antall: 0,
      };
    } else status = { type: 'ugyldig', tekst: 'Slipp over modellen eller platen', indeks: 0, antall: 0 };
    s.tegn();
    return status;
  };
  const finnKobling = (p: BuildforgeParametre, e: Ende) =>
    finnKropp(p, e.kropp)?.koblinger.find((x) => x.id === e.kobling);

  const avRegistrer = registrerLerret({
    vis(kilde, x, y, syklus, sx0, sy0) {
      return visDra(kilde, losDra(kilde, x, y, syklus, sx0, sy0));
    },
    slipp(kilde, x, y, syklus, sx0, sy0) {
      const l = losDra(kilde, x, y, syklus, sx0, sy0);
      const for_ = benk.dok.parametre;
      let ok = false;
      if (kilde.type === 'bibliotek') {
        if (l.type === 'koble') ok = kobleNyKropp(benk, kilde.malId, l.egen.kobling, l.mal);
        else if (l.type === 'erstatt') ok = erstattKropp(benk, l.kropp, kilde.malId);
        else if (l.type === 'los') ok = leggNyKroppLost(benk, kilde.malId, l.punkt);
      } else {
        if (l.type === 'koble') ok = kobleGruppe(benk, l.egen, l.mal);
        else if (l.type === 'los' && Math.hypot(l.punkt[0], l.punkt[1]) > 0.5) {
          flyttGruppe(benk, kilde.kropp, { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: l.punkt });
          ok = benk.dok.parametre !== for_;
        }
      }
      // keep the preview until the rebuilt model replaces it
      ventPaModell = ok ? benk.tilstand.modell : null;
    },
    avbryt() {
      if (ventPaModell) {
        // drop the markers but keep the ghost and the moved parts until the new model is in
        for (const c of [...draLag.children]) if (c.userData.deltMateriale) draLag.remove(c);
        draVisning.gronn = null;
      } else {
        tom(draLag);
        draVisning = { flytt: new Map(), gronn: null };
      }
      s.tegn();
      planlegg();
    },
  });

  // ---------------------------------------------------------------------------
  // Per frame: pressed top, normals, fading, tints and the drag preview

  let forrigeTrykk = editor.t.trykk;
  let forrigeVerktoy = editor.t.verktoy;
  const svart = new T.Color(0, 0, 0);
  s.scene.onBeforeRender = () => {
    const z = -editor.t.trykk;
    bevegelig.position.z = z;
    const e = editor.t;
    for (const c of s.modell.children) {
      const mesh = c as THREE.Mesh;
      const g = mesh.geometry;
      if (g && !g.getAttribute('normal')) g.computeVertexNormals();
      const id = c.userData.delId as string;
      if (id === 'topp') {
        c.position.z = z;
        // the model was rebuilt: redraw the bottom-position copy from the new mesh
        if (e.visVolum && c !== kildeTopp) planlegg();
        continue;
      }
      if (id === 'underdel') continue;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      // inside a part, the others fade back or hide (handoff §26)
      const dempet = !!e.inne && id !== e.inne;
      c.visible = !(dempet && e.skjulAndre);
      if (mat.transparent !== dempet) {
        mat.transparent = dempet;
        mat.depthWrite = !dempet;
        mat.needsUpdate = true;
      }
      mat.opacity = dempet ? 0.16 : 1;
      if (mat.emissive)
        mat.emissive.copy(
          draVisning.gronn === id
            ? gronn
            : !e.inne && (e.kropp === id || e.flere.includes(id)) && !e.dra
              ? lilla
              : svart,
        );
      mat.emissiveIntensity = draVisning.gronn === id ? 0.55 : 0.28;
      const d = draVisning.flytt.get(id);
      c.matrixAutoUpdate = false;
      if (d) c.matrix.copy(matrise4(T, d));
      else c.matrix.identity();
    }
  };

  // going into a part brings it to the middle of the view; going out shows the whole model
  let forrigeInne = editor.t.inne;
  const avEditor = editor.lytt((e) => {
    if (e.inne !== forrigeInne) {
      forrigeInne = e.inne;
      const del = e.inne ? s.modell.children.find((c) => c.userData.delId === e.inne) : null;
      if (del) {
        const b = new T.Box3().setFromObject(del);
        if (!b.isEmpty()) s.fokuser([b.min.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.max.z]);
      } else if (!e.inne) benk.kommando('tilpass');
    }
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
  const avBenk = benk.lytt((t) => {
    if (ventPaModell && t.modell !== ventPaModell && !t.bygger) {
      ventPaModell = null;
      tom(draLag);
      draVisning = { flytt: new Map(), gronn: null };
    }
    planlegg();
  });

  // ---------------------------------------------------------------------------
  // Pointer: select, drag a part, double-click to go inside, right-click for the menu

  /** The shape under a hit point in a part (or a clicker body). */
  const formVed = (p: BuildforgeParametre, kropp: string, verden: V3): { id: string; d: number } | null => {
    let l: V3 = verden;
    if (familieFor(p) === 'modul') {
      const pl = plassFor(p).get(kropp);
      if (!pl) return null;
      l = anvend(transponer(pl.m), [verden[0] - pl.t[0], verden[1] - pl.t[1], verden[2] - pl.t[2]]);
    } else if (kropp === 'topp') l = [verden[0], verden[1], verden[2] + editor.t.trykk];
    let beste: { id: string; d: number } | null = null;
    for (const f of formerI(p.former, kropp)) {
      if (f.operasjon === 'trekk-fra') continue;
      const d = formFelt(f)(l[0], l[1], l[2]);
      if (!beste || d < beste.d) beste = { id: f.id, d };
    }
    return beste;
  };

  const velgVed = (sx: number, sy: number, shift = false) => {
    const p = tolk();
    if (!p) return;
    const treff = treffKropp(sx, sy);
    const e = editor.t;
    if (familieFor(p) === 'modul' && !e.inne) {
      // Shift+click adds or removes a part from the selection (handoff §7)
      if (shift && treff) {
        const alle = new Set(e.flere.length ? e.flere : e.kropp ? [e.kropp] : []);
        if (alle.has(treff.kropp)) alle.delete(treff.kropp);
        else alle.add(treff.kropp);
        const flere = [...alle];
        editor.sett({
          flere: flere.length > 1 ? flere : [],
          kropp: flere.length === 1 ? flere[0]! : null,
          valgt: null,
          merket: [],
          meny: null,
        });
        benk.melde(flere.length > 1 ? `${flere.length} deler valgt.` : 'Én del valgt.');
        return;
      }
      editor.sett({ kropp: treff?.kropp ?? null, flere: [], valgt: null, merket: [], meny: null });
      if (treff) benk.melde(`Valgt: ${finnKropp(p, treff.kropp)?.navn}. Dobbeltklikk for å gå inn i den.`);
      return;
    }
    if (familieFor(p) === 'modul' && e.nyKobling) {
      if (treff && treff.kropp === e.inne) leggKoblingVed(p, treff, sx, sy);
      return;
    }
    if (!treff || (familieFor(p) === 'modul' && treff.kropp !== e.inne)) {
      if (!e.plasserer) editor.sett({ valgt: null, merket: [], kobling: null });
      return;
    }
    const beste = formVed(p, treff.kropp, treff.punkt);
    editor.sett({ valgt: beste && beste.d < 1.5 ? beste.id : null, merket: [], kobling: null });
    benk.melde(
      beste && beste.d < 1.5
        ? `Valgt: ${p.former.find((f) => f.id === beste.id)?.navn}`
        : familieFor(p) === 'klikker'
          ? 'Det låste festet kan ikke endres.'
          : 'Leddene er låst og kan ikke endres.',
    );
  };

  /** A new connector where the user clicked on the part: on the surface, pointing out of it. */
  const leggKoblingVed = (
    p: BuildforgeParametre,
    treff: { kropp: string; punkt: V3 },
    sx: number,
    sy: number,
  ) => {
    const pl = plassFor(p).get(treff.kropp);
    const hit = s.straale(sx, sy).intersectObjects(s.modell.children, false)[0];
    if (!pl || !hit?.face) return;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const inv = transponer(pl.m);
    const lokal = anvend(inv, [treff.punkt[0] - pl.t[0], treff.punkt[1] - pl.t[1], treff.punkt[2] - pl.t[2]]);
    const akse = anvend(inv, [n.x, n.y, n.z]);
    leggTilKobling(benk, treff.kropp, { kjonn: 'hunn', familie: 'svivel', posisjon: lokal, akse });
  };

  /** Open the radial menu for what is under a point in the view (handoff §37). */
  const apneMeny = (sx: number, sy: number) => {
    const p = tolk();
    if (!p || familieFor(p) !== 'modul') return;
    const treff = treffKropp(sx, sy);
    const e = editor.t;
    if (e.inne) {
      if (treff && treff.kropp === e.inne) {
        const beste = formVed(p, treff.kropp, treff.punkt);
        if (beste && beste.d < 1.5) {
          editor.sett({ valgt: beste.id, meny: { x: sx, y: sy, mal: { type: 'form', id: beste.id } } });
          return;
        }
      }
      editor.sett({ meny: { x: sx, y: sy, mal: { type: 'tom' } } });
      return;
    }
    if (!treff) {
      editor.sett({ meny: { x: sx, y: sy, mal: { type: 'tom' } } });
      return;
    }
    if (e.flere.length > 1 && e.flere.includes(treff.kropp)) {
      editor.sett({ meny: { x: sx, y: sy, mal: { type: 'flere', ider: [...e.flere] } } });
      return;
    }
    editor.sett({
      kropp: treff.kropp,
      flere: [],
      valgt: null,
      meny: { x: sx, y: sy, mal: { type: 'kropp', id: treff.kropp } },
    });
  };

  // touch: a long press opens the menu, a double tap goes inside (handoff §62)
  let langtrykk = 0;
  let sisteTrykk: { tid: number; kropp: string | null } | null = null;
  const LANGTRYKK_MS = 500;

  let ned: { x: number; y: number; knapp: number; handtak: boolean; touch: boolean } | null = null;
  const pekNed = (ev: PointerEvent) => {
    if (ev.target !== s.lerret) return;
    const handtakTreff = handtak.axis !== null || handtak.dragging;
    const touch = ev.pointerType === 'touch';
    ned = { x: ev.clientX, y: ev.clientY, knapp: ev.button, handtak: handtakTreff, touch };
    const p = tolk();
    if (touch && !handtakTreff && p && familieFor(p) === 'modul') {
      clearTimeout(langtrykk);
      const x = ev.clientX,
        y = ev.clientY;
      langtrykk = window.setTimeout(() => {
        if (!ned || Math.hypot(ned.x - x, ned.y - y) > 8) return;
        ned = null;
        const { sx, sy } = iLerret(x, y);
        apneMeny(sx, sy);
      }, LANGTRYKK_MS);
    }
    if (handtakTreff || ev.button !== 0 || touch || !p || familieFor(p) !== 'modul') return;
    if (editor.t.inne) return;
    const { sx, sy } = iLerret(ev.clientX, ev.clientY);
    const treff = treffKropp(sx, sy);
    if (!treff) return;
    // a press on a part drags the part (and its group), not the camera
    s.settKameraStyring(false);
    ev.stopPropagation();
    const shift = ev.shiftKey;
    startDra({ type: 'gruppe', kropp: treff.kropp }, ev, s.lerret, () => velgVed(sx, sy, shift));
    const slipp = () => {
      s.settKameraStyring(true);
      window.removeEventListener('pointerup', slipp, true);
      window.removeEventListener('pointercancel', slipp, true);
    };
    window.addEventListener('pointerup', slipp, true);
    window.addEventListener('pointercancel', slipp, true);
    ned = null;
  };
  const pekFlytt = (ev: PointerEvent) => {
    if (ned?.touch && Math.hypot(ev.clientX - ned.x, ev.clientY - ned.y) > 8) clearTimeout(langtrykk);
  };
  const pekOpp = (ev: PointerEvent) => {
    clearTimeout(langtrykk);
    if (!ned || ned.handtak || Math.hypot(ev.clientX - ned.x, ev.clientY - ned.y) > 4) {
      ned = null;
      return;
    }
    const { knapp, touch } = ned;
    ned = null;
    const { sx, sy } = iLerret(ev.clientX, ev.clientY);
    if (knapp === 2) {
      apneMeny(sx, sy);
      return;
    }
    if (knapp !== 0) return;
    if (touch) {
      const p = tolk();
      const treff = p && familieFor(p) === 'modul' ? treffKropp(sx, sy) : null;
      const na = performance.now();
      if (treff && sisteTrykk && na - sisteTrykk.tid < 350 && sisteTrykk.kropp === treff.kropp) {
        sisteTrykk = null;
        if (treff.kropp !== editor.t.inne) {
          gaInn(benk, treff.kropp);
          return;
        }
      }
      sisteTrykk = { tid: na, kropp: treff?.kropp ?? null };
    }
    velgVed(sx, sy, ev.shiftKey);
  };
  const dobbelt = (ev: MouseEvent) => {
    const p = tolk();
    if (!p || familieFor(p) !== 'modul') return;
    const { sx, sy } = iLerret(ev.clientX, ev.clientY);
    const treff = treffKropp(sx, sy);
    if (treff && treff.kropp !== editor.t.inne) gaInn(benk, treff.kropp);
  };
  const ingenMeny = (ev: MouseEvent) => ev.preventDefault();
  el.addEventListener('pointerdown', pekNed, true);
  s.lerret.addEventListener('pointermove', pekFlytt);
  s.lerret.addEventListener('pointerup', pekOpp);
  s.lerret.addEventListener('dblclick', dobbelt);
  s.lerret.addEventListener('contextmenu', ingenMeny);

  tegnHjelp();
  return () => {
    avbrytDra();
    avRegistrer();
    avEditor();
    avBenk();
    cancelAnimationFrame(ventende);
    clearTimeout(langtrykk);
    el.removeEventListener('pointerdown', pekNed, true);
    s.lerret.removeEventListener('pointermove', pekFlytt);
    s.lerret.removeEventListener('pointerup', pekOpp);
    s.lerret.removeEventListener('dblclick', dobbelt);
    s.lerret.removeEventListener('contextmenu', ingenMeny);
    s.scene.onBeforeRender = () => {};
    for (const c of s.modell.children) {
      c.matrixAutoUpdate = true;
      c.visible = true;
      c.updateMatrix();
    }
    handtak.detach();
    handtak.dispose();
    s.scene.remove(hjelper);
    tom(fast);
    tom(bevegelig);
    tom(draLag);
    for (const g of ghostGeo.values()) g.dispose();
    markorGeo.dispose();
    markorSvak.dispose();
    markorAktiv.dispose();
    s.scene.remove(fast, bevegelig, draLag);
  };
}
