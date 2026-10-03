/**
 * BuildForge scene setup for the shared 3D view: the switch as a see-through
 * reference (never exported), the protected zones, the top at the bottom of
 * its travel, the top pressed during «Prøv klikk», outlines for the selected
 * and pointed-out shapes, and a ghost of a part before it is attached.
 * Clicking the model selects the shape under the pointer.
 *
 * Everything drawn here is functional geometry (D-3) derived from the
 * profile and the project; none of it changes the model.
 */
import type * as THREE from 'three';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import type { Mesh } from '../../geometri/mesh';
import { cssFarge } from '../../shell/tema';
import { finnDel, plasserDel } from './bibliotek';
import { festepunkter } from './feste';
import { formBoks, formFelt } from './felt';
import { byggMekanikk, type Mekanikk } from './mekanikk';
import { tolkParametre, type BuildforgeParametre, type Form } from './parametre';
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
        new T.MeshStandardMaterial({ color: f, transparent: true, opacity: 0.45, depthWrite: false }),
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

  const tegnHjelp = () => {
    tom(fast);
    tom(bevegelig);
    const t = tolkParametre(benk.dok.parametre);
    if (!t.ok) return s.tegn();
    const p: BuildforgeParametre = t.p;
    const nokkel = `${p.profil.id}@${p.profil.versjon}`;
    if (nokkel !== mekNokkel) {
      const profil = finnProfil(p.profil.id, p.profil.versjon);
      mek = profil ? byggMekanikk(profil) : null;
      mekNokkel = nokkel;
    }
    const e = editor.t;
    if (mek) {
      if (e.visBryter)
        for (const r of mek.referanse)
          (r.beveger ? bevegelig : fast).add(boks(r.min, r.maks, graa, r.beveger ? 0.55 : 0.32, false));
      if (e.visLaast)
        for (const z of mek.sperresoner)
          (z.kropp === 'topp' ? bevegelig : fast).add(boks(z.min, z.maks, cyan, 0, true));
      if (e.visVolum) {
        // the top as it stands at the bottom of the travel
        const toppDel = s.modell.children.find((c) => c.userData.delId === 'topp') as THREE.Mesh | undefined;
        kildeTopp = toppDel ?? null;
        if (toppDel) {
          const kopi = new T.Mesh(
            toppDel.geometry,
            new T.MeshStandardMaterial({ color: cyan, transparent: true, opacity: 0.25, depthWrite: false }),
          );
          kopi.position.z = -mek.mal.vandring;
          kopi.userData.delt = true;
          fast.add(kopi);
        }
      }
    }
    for (const f of p.former) {
      const merket = e.merket.includes(f.id);
      if (f.id !== e.valgt && !merket) continue;
      (f.kropp === 'topp' ? bevegelig : fast).add(omriss(formMesh(f), merket ? feil : lilla));
    }
    if (e.plasserer && e.sikter) {
      const del = finnDel(e.plasserer);
      const punkt = festepunkter(p).find((x) => x.id === e.sikter);
      if (del && punkt)
        for (const f of plasserDel(del, punkt))
          (f.kropp === 'topp' ? bevegelig : fast).add(omriss(formMesh(f), lilla, true));
    }
    s.tegn();
  };

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
    }
    planlegg();
  });
  const avBenk = benk.lytt(planlegg);

  // click to select: the shape whose field is lowest where the ray meets the model
  let ned: { x: number; y: number } | null = null;
  const pekNed = (ev: PointerEvent) => {
    ned = { x: ev.clientX, y: ev.clientY };
  };
  const pekOpp = (ev: PointerEvent) => {
    if (!ned || Math.hypot(ev.clientX - ned.x, ev.clientY - ned.y) > 4) return;
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
    const kropp = treff.object.userData.delId as 'topp' | 'underdel';
    const dz = kropp === 'topp' ? editor.t.trykk : 0;
    const q = treff.point;
    let beste: { id: string; d: number } | null = null;
    for (const f of t.p.former) {
      if (f.kropp !== kropp || f.operasjon === 'trekk-fra') continue;
      const d = formFelt(f)(q.x, q.y, q.z + dz);
      if (!beste || d < beste.d) beste = { id: f.id, d };
    }
    editor.sett({ valgt: beste && beste.d < 1.5 ? beste.id : null, merket: [] });
    benk.melde(
      beste && beste.d < 1.5
        ? `Valgt: ${t.p.former.find((f) => f.id === beste!.id)?.navn}`
        : 'Det låste festet kan ikke endres.',
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
    tom(fast);
    tom(bevegelig);
    s.scene.remove(fast, bevegelig);
  };
}
