/**
 * The 3D overlay: the figure pose and the print view, selection by click,
 * joint markers, the snap points while a part is dragged in, the manipulator
 * for the active object and the preview of the selected joint's dome.
 *
 * The built meshes are in the print pose. In the figure view the model group
 * is turned back into figure coordinates; the overlay's own group holds
 * figure coordinates and is turned into the print pose in the print view.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type * as THREE_T from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Scene3d } from '../../core/generator';
import { brukUtdrag } from '../../shell/bruk-benk';
import { cssFarge } from '../../shell/tema';
import type { CfResultat } from './bygg';
import { boksFor, grunnformer } from './grunnformer';
import { les, settDel, settLedd, settSymmetri } from './handlinger';
import { CfIkon } from './ikoner';
import { Kroppsmeny } from './Kroppsmeny';
import { kuppelBoks, kuppelFelt } from './kuppel';
import { lagRutenett, marsjer } from './marsj';
import { boksIRamme } from './sdf';
import { GRENSER, valider, type Kuppel } from './parametre';
import {
  etterkommere,
  finnDel,
  finnPunkt,
  grunnramme,
  leddTil,
  ledigeFor,
  plasser,
  punktIVerden,
  type Oppsett,
} from './plassering';
import { tilstand } from './tilstand';
import { anvend, gange, minus, pluss, tilEuler, transponer, type M3, type V3 } from './vektor';

/** How close (px) the pointer must come to a snap point to attach there. */
const SNAP_RADIUS = 72;

const klem = (v: number, g: { min: number; maks: number }) => Math.min(g.maks, Math.max(g.min, v));
const rund = (v: number) => Math.round(v * 10) / 10;

function matrise4(T: typeof THREE_T, R: M3, t: V3): THREE_T.Matrix4 {
  return new T.Matrix4().set(
    R[0]!,
    R[1]!,
    R[2]!,
    t[0],
    R[3]!,
    R[4]!,
    R[5]!,
    t[1],
    R[6]!,
    R[7]!,
    R[8]!,
    t[2],
    0,
    0,
    0,
    1,
  );
}

const fraMatrise4 = (m: THREE_T.Matrix4): { R: M3; t: V3 } => {
  const e = m.elements; // column major
  return { R: [e[0]!, e[4]!, e[8]!, e[1]!, e[5]!, e[9]!, e[2]!, e[6]!, e[10]!], t: [e[12]!, e[13]!, e[14]!] };
};

export function CfOverlegg({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  const T = scene.three;
  const t = tilstand(benk);
  const p = brukUtdrag(benk, (s) => les(s.dok));
  const modell = brukUtdrag(benk, (s) => s.modell) as CfResultat | null;
  const foreldet = brukUtdrag(benk, (s) => s.modellForeldet || s.bygger);
  const gyldig = useMemo(() => valider(p).ok, [p]);
  const oppsett = useMemo<Oppsett | null>(() => (gyldig ? plasser(p) : null), [p, gyldig]);
  const valgt = t.valgt.value;
  const printvisning = t.printvisning.value;
  const dra = t.dra.value;
  const [, settTikk] = useState(0);

  // three.js objects that live as long as the scene
  const objekter = useMemo(() => {
    const gruppe = new T.Group();
    gruppe.name = 'cf-overlegg';
    gruppe.matrixAutoUpdate = false;
    const proxy = new T.Object3D();
    gruppe.add(proxy);
    const handtak = new TransformControls(scene.camera, scene.lerret);
    handtak.setSize(0.8);
    const hjelper = handtak.getHelper();
    return { gruppe, proxy, handtak, hjelper, kuppel: null as THREE_T.Mesh | null };
  }, [scene, T]);

  const utskrift = useMemo(
    () => (modell?.utskrift ? matrise4(T, modell.utskrift.R, modell.utskrift.t) : new T.Matrix4()),
    [modell, T],
  );
  /**
   * Figure coordinates → the view. In the print view: the print pose. In the figure view: the figure
   * lifted so its lowest point stands on the plate (from the built meshes: figure z = print y − t_y).
   */
  const visning = useMemo(() => {
    if (printvisning) return utskrift;
    let minY = Infinity;
    for (const d of modell?.deler ?? []) {
      const q = d.mesh.posisjoner;
      for (let i = 1; i < q.length; i += 3) minY = Math.min(minY, q[i]!);
    }
    const loft = Number.isFinite(minY) && modell?.utskrift ? -(minY - modell.utskrift.t[1]) : 0;
    return new T.Matrix4().makeTranslation(0, 0, loft);
  }, [printvisning, utskrift, modell, T]);

  // mount and unmount
  useEffect(() => {
    const { gruppe, handtak, hjelper } = objekter;
    scene.scene.add(gruppe);
    scene.scene.add(hjelper);
    handtak.addEventListener('change', scene.tegn);
    const draEndret = (e: { value: unknown }) => scene.settKameraStyring(!e.value);
    handtak.addEventListener('dragging-changed', draEndret);
    return () => {
      handtak.removeEventListener('change', scene.tegn);
      handtak.removeEventListener('dragging-changed', draEndret);
      handtak.detach();
      handtak.dispose();
      scene.scene.remove(hjelper);
      scene.scene.remove(gruppe);
      if (objekter.kuppel) {
        objekter.kuppel.geometry.dispose();
        (objekter.kuppel.material as THREE_T.Material).dispose();
      }
      scene.modell.matrixAutoUpdate = true;
      scene.modell.matrix.identity();
      scene.tegn();
    };
  }, [objekter, scene]);

  // figure pose or print pose
  useEffect(() => {
    scene.modell.matrixAutoUpdate = false;
    // the meshes are in the print pose: back to figure coordinates, then into the view
    scene.modell.matrix.copy(visning.clone().multiply(utskrift.clone().invert()));
    scene.modell.matrixWorldNeedsUpdate = true;
    objekter.gruppe.matrix.copy(visning);
    objekter.gruppe.matrixWorldNeedsUpdate = true;
    scene.tegn();
  }, [scene, objekter, utskrift, visning, modell, T]);

  // the centre line of the figure, when symmetry is on (programmatic measurement geometry, D-3)
  const symmetri = !!p.symmetri;
  useEffect(() => {
    if (!symmetri || !oppsett) return;
    const rot = p.deler.find((d) => !leddTil(p, d.id));
    const prot = rot && oppsett.deler.get(rot.id);
    if (!prot) return;
    // the figure's extent in the root's frame
    let min: V3 = [Infinity, Infinity, Infinity],
      maks: V3 = [-Infinity, -Infinity, -Infinity];
    const inv = transponer(prot.R);
    for (const d of p.deler) {
      const pl = oppsett.deler.get(d.id);
      if (!pl) continue;
      const b = boksIRamme(boksFor(d), gange(inv, pl.R), anvend(inv, minus(pl.t, prot.t)));
      min = min.map((v, k) => Math.min(v, b.min[k]!)) as V3;
      maks = maks.map((v, k) => Math.max(v, b.maks[k]!)) as V3;
    }
    const y0 = min[1] - 4,
      y1 = maks[1] + 4,
      z0 = min[2] - 4,
      z1 = maks[2] + 4;
    const hjorner = [
      [0, y0, z0],
      [0, y0, z1],
      [0, y1, z1],
      [0, y1, z0],
    ].map((q) => {
      const w = pluss(anvend(prot.R, q as V3), prot.t);
      return new T.Vector3(...w);
    });
    const el = scene.lerret.parentElement ?? scene.lerret;
    const geo = new T.BufferGeometry().setFromPoints(hjorner);
    const linje = new T.LineLoop(
      geo,
      new T.LineDashedMaterial({
        color: new T.Color(cssFarge(el, '--dp-cyan', '#00c4d6')),
        dashSize: 3,
        gapSize: 2,
      }),
    );
    linje.computeLineDistances();
    linje.name = 'Midtlinje';
    objekter.gruppe.add(linje);
    scene.tegn();
    return () => {
      objekter.gruppe.remove(linje);
      geo.dispose();
      (linje.material as THREE_T.Material).dispose();
      scene.tegn();
    };
  }, [symmetri, oppsett, p, objekter, scene, T]);

  // a new part may reach outside the view: frame the figure again when it grows
  const antallDeler = modell?.deler.length ?? 0;
  const tilpasset = useRef(0);
  useEffect(() => {
    if (antallDeler > tilpasset.current) requestAnimationFrame(() => benk.kommando('tilpass'));
    tilpasset.current = antallDeler;
  }, [antallDeler, benk]);

  // highlight the selected part (after the shared view has reset its own highlight)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = scene.lerret.parentElement ?? scene.lerret;
      const lilla = new T.Color(cssFarge(el, '--dp-lilla', '#883dff'));
      for (const c of scene.modell.children) {
        const m = (c as THREE_T.Mesh).material as THREE_T.MeshStandardMaterial;
        if (!('emissive' in m)) continue;
        const pa = valgt?.type === 'del' && c.userData.delId === valgt.id;
        m.emissive = pa ? lilla : new T.Color(0, 0, 0);
        m.emissiveIntensity = pa ? 0.22 : 0;
      }
      scene.tegn();
    });
    return () => cancelAnimationFrame(id);
  }, [scene, modell, valgt, T]);

  // the camera moved or the view resized: place the HTML markers again
  useEffect(() => {
    let id = 0,
      forrige = '';
    const loop = () => {
      const e = scene.camera.matrixWorld.elements;
      const nokkel = `${e.map((v) => v.toFixed(3)).join(',')}|${scene.lerret.clientWidth}x${scene.lerret.clientHeight}`;
      if (nokkel !== forrige) {
        forrige = nokkel;
        settTikk((x) => x + 1);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [scene]);

  /** A figure point → CSS px in the view. */
  const prosjiser = (q: V3) => {
    const v = new T.Vector3(...q);
    v.applyMatrix4(visning);
    return scene.prosjiser(v.x, v.y, v.z);
  };

  // click to select (not after orbiting or using the handles)
  useEffect(() => {
    let ned: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => {
      ned = { x: e.clientX, y: e.clientY };
    };
    const pu = (e: PointerEvent) => {
      if (!ned || objekter.handtak.dragging) return;
      const flyttet = Math.hypot(e.clientX - ned.x, e.clientY - ned.y);
      ned = null;
      if (flyttet > 5 || e.button !== 0) return;
      const r = scene.lerret.getBoundingClientRect();
      const treff = scene
        .straale(e.clientX - r.left, e.clientY - r.top)
        .intersectObjects(scene.modell.children, false);
      const id = treff[0]?.object.userData.delId as string | undefined;
      t.valgt.value = id ? { type: 'del', id } : null;
    };
    scene.lerret.addEventListener('pointerdown', pd);
    scene.lerret.addEventListener('pointerup', pu);
    return () => {
      scene.lerret.removeEventListener('pointerdown', pd);
      scene.lerret.removeEventListener('pointerup', pu);
    };
  }, [scene, objekter, t]);

  // the manipulator follows the active object
  const rot = oppsett && p.deler.find((d) => !leddTil(p, d.id));
  const valgtLedd = valgt?.type === 'ledd' ? p.ledd.find((l) => l.id === valgt.id) : undefined;
  const valgtRot = valgt?.type === 'del' && rot?.id === valgt.id ? rot : undefined;
  const modus = t.modus.value;
  useEffect(() => {
    const { proxy, handtak } = objekter;
    handtak.detach();
    if (!oppsett) return;
    let start: { R: M3; t: V3 } | null = null;
    if (valgtLedd) {
      const r = oppsett.ledd.get(valgtLedd.id);
      if (r) start = { R: r.R, t: r.punkt };
    } else if (valgtRot) {
      const pl = oppsett.deler.get(valgtRot.id);
      if (pl) start = { R: pl.R, t: pl.t };
    }
    if (!start) return;
    proxy.matrixAutoUpdate = true;
    matrise4(T, start.R, start.t).decompose(proxy.position, proxy.quaternion, proxy.scale);
    proxy.updateMatrixWorld(true);
    scene.tegn();
    if (printvisning) return;
    handtak.setMode(modus === 'roter' ? 'rotate' : 'translate');
    handtak.setSpace(modus === 'roter' ? 'local' : 'world');
    handtak.attach(proxy);

    // which meshes move with the object while it is dragged
    const flyttes = new Set(
      valgtLedd ? [valgtLedd.barn.del, ...etterkommere(p, valgtLedd.barn.del)] : p.deler.map((d) => d.id),
    );
    const utskriftInv = utskrift.clone().invert();
    const startM = matrise4(T, start.R, start.t);
    const startInv = startM.clone().invert();
    const forhand = () => {
      proxy.updateMatrix();
      const D = proxy.matrix.clone().multiply(startInv); // figure coordinates
      // the meshes are in print coordinates under a group that turns them into figure coordinates
      const iUtskrift = utskrift.clone().multiply(D).multiply(utskriftInv);
      for (const c of scene.modell.children) {
        if (!flyttes.has(c.userData.delId)) continue;
        c.matrixAutoUpdate = false;
        c.matrix.copy(iUtskrift);
        c.matrixWorldNeedsUpdate = true;
      }
      scene.tegn();
    };
    const slipp = (e: { value: unknown }) => {
      if (e.value) return;
      proxy.updateMatrix();
      const ny = fraMatrise4(proxy.matrix);
      if (valgtRot) {
        settDel(
          benk,
          valgtRot.id,
          modus === 'roter'
            ? `Roterte ${valgtRot.navn.toLowerCase()}`
            : `Flyttet ${valgtRot.navn.toLowerCase()}`,
          {
            posisjon: ny.t.map((v) => rund(klem(v, GRENSER.posisjon))) as V3,
            rotasjon: tilEuler(ny.R).map((v) => rund(v)) as V3,
          },
        );
      } else if (valgtLedd) {
        const f = finnDel(p, valgtLedd.forelder.del)!;
        const pl = oppsett.deler.get(f.id)!;
        if (modus === 'roter') {
          const grunn = grunnramme(p, oppsett, valgtLedd);
          if (grunn)
            settLedd(benk, valgtLedd.id, 'Roterte leddet', {
              rotasjon: tilEuler(gange(transponer(grunn), ny.R)).map((v) => rund(v)) as V3,
            });
        } else {
          const delta = anvend(transponer(pl.R), minus(ny.t, start!.t));
          settLedd(benk, valgtLedd.id, 'Flyttet leddet', {
            forskyvning: pluss(valgtLedd.forskyvning, delta).map((v) =>
              rund(klem(v, GRENSER.forskyvning)),
            ) as V3,
          });
        }
      }
    };
    handtak.addEventListener('objectChange', forhand);
    handtak.addEventListener('dragging-changed', slipp);
    return () => {
      handtak.removeEventListener('objectChange', forhand);
      handtak.removeEventListener('dragging-changed', slipp);
      handtak.detach();
    };
  }, [objekter, oppsett, valgtLedd, valgtRot, modus, printvisning, utskrift, benk, p, scene, T]);

  // the dome of the selected joint, as a translucent preview of the cut
  const kuppel: Kuppel | undefined = valgtLedd?.kuppel;
  const visKuppel = t.visKuppel.value && !!kuppel;
  const kuppelNokkel = kuppel ? JSON.stringify(kuppel) : '';
  useEffect(() => {
    const { proxy } = objekter;
    if (objekter.kuppel) {
      proxy.remove(objekter.kuppel);
      objekter.kuppel.geometry.dispose();
      (objekter.kuppel.material as THREE_T.Material).dispose();
      objekter.kuppel = null;
    }
    if (!visKuppel || !kuppel) {
      scene.tegn();
      return;
    }
    const mesh = marsjer(lagRutenett(kuppelBoks(kuppel), 0.6, 600_000), kuppelFelt(kuppel));
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(mesh.posisjoner, 3));
    geo.setIndex(new T.BufferAttribute(mesh.indekser, 1));
    geo.computeVertexNormals();
    const el = scene.lerret.parentElement ?? scene.lerret;
    const mat = new T.MeshStandardMaterial({
      color: new T.Color(cssFarge(el, '--dp-cyan', '#00c4d6')),
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: T.DoubleSide,
      roughness: 0.5,
    });
    const m = new T.Mesh(geo, mat);
    m.renderOrder = 10;
    m.name = 'Kuppel';
    proxy.add(m);
    objekter.kuppel = m;
    scene.tegn();
    // the dome is rebuilt only when its own values change (kuppelNokkel), not on every new object
  }, [objekter, visKuppel, kuppelNokkel, scene, T]);

  // snap points while a part is dragged in from the menu
  const r = scene.lerret.getBoundingClientRect();
  const kandidater = useMemo(() => {
    if (!dra || !oppsett) return [];
    return ledigeFor(p, dra.type).map((k) => {
      const f = finnDel(p, k.forelder.del)!;
      const s = finnPunkt(f, k.forelder.punkt)!;
      return { ...k, punkt: punktIVerden(oppsett.deler.get(f.id)!, s).punkt };
    });
  }, [dra?.type, oppsett, p]);
  const plassert = kandidater.map((k) => ({ ...k, skjerm: prosjiser(k.punkt) }));
  let naermest: (typeof plassert)[number] | null = null;
  if (dra) {
    let best = SNAP_RADIUS;
    for (const k of plassert) {
      if (!k.skjerm.synlig) continue;
      const d = Math.hypot(dra.x - r.left - k.skjerm.x, dra.y - r.top - k.skjerm.y);
      if (d < best) {
        best = d;
        naermest = k;
      }
    }
  }
  useEffect(() => {
    if (!dra) return;
    const mal = naermest?.forelder ?? null;
    if (JSON.stringify(mal) !== JSON.stringify(dra.mal)) t.dra.value = { ...dra, mal };
  });

  const status = modell?.status;
  const antall = modell ? modell.funn.filter((f) => f.niva !== 'info').length : 0;
  const statusTekst = foreldet
    ? 'Kontrollerer …'
    : status === 'rod'
      ? `● Kan ikke eksporteres (${antall})`
      : status === 'gul'
        ? `⚠ ${antall} ${antall === 1 ? 'merknad' : 'merknader'}`
        : status === 'gronn'
          ? '✓ Modell OK'
          : null;

  return (
    <div class="cf-overlegg">
      {!p.deler?.length && (
        <div class="cf-tom">
          <h2>Start med et hode</h2>
          <p>Velg «Hode» i menyen nederst. Så drar du en overkropp opp til halsen.</p>
        </div>
      )}
      <div class="cf-verktoy" role="toolbar" aria-label="Visning og håndtak">
        <button
          type="button"
          aria-pressed={printvisning}
          onClick={() => {
            t.printvisning.value = !printvisning;
            requestAnimationFrame(() => benk.kommando('tilpass'));
          }}
          title="Vis figuren slik den printes: liggende på ryggen, alle ledd i null"
        >
          Printvisning
        </button>
        <button
          type="button"
          aria-pressed={symmetri}
          onClick={() => settSymmetri(benk, !symmetri)}
          title="Symmetri: det du gjør på én side, gjøres på den andre. Midtlinjen vises."
        >
          <CfIkon id="symmetry" />
          Symmetri
        </button>
        {(valgtLedd || valgtRot) && !printvisning && (
          <div class="cf-segment" role="radiogroup" aria-label="Håndtak">
            {(['flytt', 'roter'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modus === m}
                title={m === 'flytt' ? 'Flytt' : 'Roter'}
                onClick={() => (t.modus.value = m)}
              >
                <CfIkon id={m === 'flytt' ? 'move' : 'rotate'} />
                <span class="visuelt-skjult">{m === 'flytt' ? 'Flytt' : 'Roter'}</span>
              </button>
            ))}
          </div>
        )}
        {valgtLedd && (
          <button
            type="button"
            aria-pressed={t.visKuppel.value}
            onClick={() => (t.visKuppel.value = !t.visKuppel.value)}
            title="Vis kuppelen som skjæres ut"
          >
            <CfIkon id="eye" />
            Kuppel
          </button>
        )}
      </div>
      {statusTekst && (
        <button
          type="button"
          class={`cf-status ${foreldet ? 'gra' : (status ?? '')}`}
          onClick={() => {
            t.valgt.value = null;
            benk.settInnstillinger({ ark: 'egenskaper' });
          }}
          title="Vis kontrollen"
        >
          {statusTekst}
          <span class="cf-status-merk">Ikke fysisk testet</span>
        </button>
      )}
      {oppsett &&
        p.ledd.map((l) => {
          const r = oppsett.ledd.get(l.id);
          if (!r) return null;
          const s = prosjiser(r.punkt);
          if (!s.synlig) return null;
          const f = finnDel(p, l.forelder.del),
            b = finnDel(p, l.barn.del);
          const pa = valgt?.type === 'ledd' && valgt.id === l.id;
          return (
            <button
              key={l.id}
              type="button"
              class={`cf-leddmerke${pa ? ' valgt' : ''}`}
              style={{ left: `${s.x}px`, top: `${s.y}px` }}
              aria-pressed={pa}
              aria-label={`Ledd mellom ${f?.navn ?? ''} og ${b?.navn ?? ''}`}
              title={`Ledd: ${f?.navn ?? ''} – ${b?.navn ?? ''}`}
              onClick={() => (t.valgt.value = { type: 'ledd', id: l.id })}
            />
          );
        })}
      <section class="cf-bunn" aria-label="Kroppsdeler og meny">
        <Kroppsmeny benk={benk} />
      </section>
      {dra && (
        <>
          {plassert.map((k) =>
            k.skjerm.synlig ? (
              <div
                key={`${k.forelder.del}/${k.forelder.punkt}`}
                class={`cf-snap${naermest === k ? ' aktiv' : ''}`}
                style={{ left: `${k.skjerm.x}px`, top: `${k.skjerm.y}px` }}
                aria-hidden="true"
              >
                <span>{k.navn}</span>
              </div>
            ) : null,
          )}
          <p class="cf-drahjelp" role="status">
            {plassert.length
              ? naermest
                ? `Slipp for å feste ${grunnformer[dra.type].navn.toLowerCase()} på ${naermest.navn.toLowerCase()}.`
                : `Dra ${grunnformer[dra.type].navn.toLowerCase()} til et markert punkt.`
              : !p.deler.length && dra.type === 'hode'
                ? 'Slipp hodet i visningen.'
                : 'Ingen ledige punkter passer.'}
          </p>
        </>
      )}
    </div>
  );
}
