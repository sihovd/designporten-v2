/**
 * The brick builder on the 3D view: tap a brick to select it (it is
 * highlighted in purple), connection points as buttons (cyan when a brick
 * can go there), and a see-through preview of a connection with «Koble» and
 * «Avbryt» before anything is made (DF-01). Every action here also has a
 * button in the properties panel, so nothing needs hover, right-click or a
 * precise drag (DF-15).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type * as THREE from 'three';
import type { Arbeidsbenk } from '../../../core/arbeidsbenk';
import type { Scene3d } from '../../../core/generator';
import { brukUtdrag } from '../../../shell/bruk-benk';
import { cssFarge } from '../../../shell/tema';
import { instansFraDelId, lokaleSkall, plasserMesh } from './bygg';
import {
  finnInstans,
  forbindelseVed,
  kanKoble,
  komponenterAv,
  navnPa,
  passendePunkt,
  plasseringer,
  punktIVerden,
  punktnavn,
} from './graf';
import { brikkerFra, endreBrikker } from './handlinger';
import { finnDefinisjon, HENGSEL_M, type Brikkeprosjekt, type Ende } from './modell';
import { brukEditor, forhandsvis, type Brikkeeditor, type Editorlager, type Kandidat } from './tilstand';

/** Re-render when the camera or the view size changes (markers follow the model). */
function brukKamera(scene: Scene3d): void {
  const [, settN] = useState(0);
  useEffect(() => {
    let forrige = '';
    let id = 0;
    const sjekk = () => {
      const c = scene.camera;
      c.updateMatrixWorld();
      const nokkel = `${scene.lerret.clientWidth}x${scene.lerret.clientHeight}|${c.matrixWorld.elements.map((v) => v.toFixed(3)).join(',')}|${c.projectionMatrix.elements[0]!.toFixed(4)}`;
      if (nokkel !== forrige) {
        forrige = nokkel;
        settN((x) => x + 1);
      }
      id = requestAnimationFrame(sjekk);
    };
    id = requestAnimationFrame(sjekk);
    return () => cancelAnimationFrame(id);
  }, [scene]);
}

interface Merke {
  ende: Ende;
  rolle: 'sokkel' | 'tapp';
  x: number;
  y: number;
  tekst: string;
  koblet: boolean;
  /** A brick can go here in the current action. */
  mulig: boolean;
  /** The point waiting for a partner. */
  kilde: boolean;
}

/** Which points to show, and what tapping them does. */
function merker(p: Brikkeprosjekt, e: Brikkeeditor): Merke[] {
  const W = plasseringer(p);
  const ut: Merke[] = [];
  const vis = new Set<string>();
  if (e.plasserer || e.kilde || e.kandidat) for (const i of p.instanser) vis.add(i.id);
  else if (e.valgt) vis.add(e.valgt);
  for (const id of vis) {
    const i = finnInstans(p, id);
    const def = i && finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
    if (!def) continue;
    for (const k of def.punkter) {
      const ende = { instans: id, punkt: k.id };
      const t = punktIVerden(p, ende, W);
      if (!t) continue;
      const f = forbindelseVed(p, ende);
      let mulig = false;
      if (e.plasserer && !f) mulig = passendePunkt(p, e.plasserer, ende) !== null;
      if (e.kilde && !f) mulig = kanKoble(p, e.kilde, ende) === null;
      const kilde = !!e.kilde && e.kilde.instans === id && e.kilde.punkt === k.id;
      // while placing, only the points that matter are shown
      if ((e.plasserer || e.kilde) && !mulig && !kilde) continue;
      ut.push({
        ende,
        rolle: k.rolle,
        x: t.x,
        y: t.y,
        koblet: !!f,
        mulig,
        kilde,
        tekst: `${punktnavn(p, ende)}: ${f ? 'opptatt' : mulig ? 'ledig, trykk for å forhåndsvise koblingen' : 'ledig'}`,
      });
    }
  }
  return ut;
}

function trykkPaMerke(p: Brikkeprosjekt, e: Brikkeeditor, lager: Editorlager, m: Merke): void {
  if (e.plasserer && m.mulig) {
    const punkt = passendePunkt(p, e.plasserer, m.ende);
    if (punkt) lager.sett({ kandidat: { type: 'ny', definisjon: e.plasserer, punkt, mal: m.ende } });
    return;
  }
  if (e.kilde && m.mulig) {
    lager.sett({ kandidat: { type: 'koble', flytt: e.kilde, mal: m.ende } });
    return;
  }
  if (!m.koblet) lager.sett({ kilde: m.ende, valgt: m.ende.instans, kandidat: null });
}

export function kandidatTekst(p: Brikkeprosjekt, k: Kandidat): string {
  if (k.type === 'ny') {
    const def = finnDefinisjon(k.definisjon);
    const punkt = def?.punkter.find((x) => x.id === k.punkt)?.navn.toLowerCase() ?? k.punkt;
    return `${def?.navn ?? 'Brikken'} kobles med ${punkt} til ${punktnavn(p, k.mal).toLowerCase()}.`;
  }
  return `${punktnavn(p, k.flytt)} kobles til ${punktnavn(p, k.mal).toLowerCase()}. Gruppen flyttes dit.`;
}

/** Make the previewed connection as one step and select the brick that moved in. */
export function bekreftKandidat(benk: Arbeidsbenk, lager: Editorlager, k: Kandidat): void {
  const r = endreBrikker(benk, (q) => forhandsvis(q, k));
  if (r.ok)
    lager.sett({
      kandidat: null,
      kilde: null,
      plasserer: null,
      valgt: r.ny ?? (k.type === 'koble' ? k.flytt.instans : null),
    });
}

export function BrikkeOverlegg({ benk, scene }: { benk: Arbeidsbenk; scene: Scene3d }) {
  const raa = brukUtdrag(benk, (t) => t.dok.parametre);
  const modell = brukUtdrag(benk, (t) => t.modell);
  const p = brikkerFra(raa).prosjekt;
  const [e, lager] = brukEditor(benk, p);
  brukKamera(scene);
  const tidspunkt = useRef<{ x: number; y: number; t: number } | null>(null);
  const eRef = useRef(e);
  eRef.current = e;

  // Tap to select (a drag still orbits the camera).
  useEffect(() => {
    const lerret = scene.lerret;
    const ned = (ev: PointerEvent) => {
      tidspunkt.current = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    };
    const opp = (ev: PointerEvent) => {
      const s = tidspunkt.current;
      tidspunkt.current = null;
      if (!s || Math.hypot(ev.clientX - s.x, ev.clientY - s.y) > 6 || performance.now() - s.t > 600) return;
      const r = lerret.getBoundingClientRect();
      const straale = scene.straale(ev.clientX - r.left, ev.clientY - r.top);
      const treff = straale.intersectObjects(scene.modell.children, false)[0];
      const id = treff ? instansFraDelId(String(treff.object.userData.delId ?? '')) : null;
      const naa = eRef.current;
      if (naa.plasserer || naa.kilde || naa.kandidat) return; // finish or cancel the action first
      lager.sett({ valgt: id });
      if (id) benk.melde(`Valgt: ${navnPa(brikkerFra(benk.dok.parametre).prosjekt, id)}`);
    };
    lerret.addEventListener('pointerdown', ned);
    lerret.addEventListener('pointerup', opp);
    return () => {
      lerret.removeEventListener('pointerdown', ned);
      lerret.removeEventListener('pointerup', opp);
    };
  }, [scene, lager, benk]);

  // Purple highlight on the selected brick (after the view's own highlight pass). The bodies are
  // often purple themselves, so the selection is lit with the light purple, strongly enough to read.
  useEffect(() => {
    const ramme = requestAnimationFrame(() => {
      const lilla = cssFarge(scene.lerret, '--dp-lilla-lys', '#b58cff');
      for (const c of scene.modell.children) {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (!m || !('emissive' in m)) continue;
        const valgt = !!e.valgt && instansFraDelId(String(c.userData.delId ?? '')) === e.valgt;
        m.emissive.set(valgt ? lilla : '#000000');
        m.emissiveIntensity = valgt ? 0.55 : 0;
      }
      scene.tegn();
    });
    return () => cancelAnimationFrame(ramme);
  }, [scene, modell, e.valgt]);

  // See-through preview of the previewed connection.
  const forhand = useMemo(() => (e.kandidat ? forhandsvis(p, e.kandidat) : null), [p, e.kandidat]);
  useEffect(() => {
    if (!forhand?.ok || !e.kandidat) return;
    const { three } = scene;
    const neste = forhand.p;
    const flytter =
      e.kandidat.type === 'ny' ? [forhand.ny!] : (komponenterAv(p, e.kandidat.flytt.instans) ?? []);
    const W = plasseringer(neste);
    const cyan = cssFarge(scene.lerret, '--dp-cyan', '#00c2d1');
    const mat = new three.MeshStandardMaterial({
      color: cyan,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      roughness: 0.5,
    });
    const gruppe = new three.Group();
    for (const id of flytter) {
      const i = neste.instanser.find((x) => x.id === id);
      const def = i && finnDefinisjon(i.definisjon.id, i.definisjon.versjon);
      const t = W.get(id);
      if (!i || !def || !t) continue;
      for (const s of lokaleSkall(def, i.verdier)) {
        const m = plasserMesh(s.mesh, t);
        const geo = new three.BufferGeometry();
        geo.setAttribute('position', new three.BufferAttribute(m.posisjoner, 3));
        geo.setIndex(new three.BufferAttribute(m.indekser, 1));
        geo.computeVertexNormals();
        gruppe.add(new three.Mesh(geo, mat));
      }
    }
    scene.scene.add(gruppe);
    scene.tegn();
    return () => {
      scene.scene.remove(gruppe);
      for (const c of gruppe.children) (c as THREE.Mesh).geometry.dispose();
      mat.dispose();
      scene.tegn();
    };
  }, [scene, forhand]);

  const liste = useMemo(() => merker(p, e), [p, e]);
  const z = HENGSEL_M.mal.hulromHoyde + 1;

  return (
    <div class="df-overlegg" role="group" aria-label="Koblingspunkter">
      {liste.map((m) => {
        const s = scene.prosjiser(m.x, m.y, z);
        if (!s.synlig) return null;
        return (
          <button
            key={`${m.ende.instans}/${m.ende.punkt}`}
            type="button"
            class={`df-punkt ${m.rolle}${m.koblet ? ' koblet' : ''}${m.mulig ? ' mulig' : ''}${m.kilde ? ' kilde' : ''}`}
            style={{ left: `${s.x}px`, top: `${s.y}px` }}
            aria-label={m.tekst}
            title={m.tekst}
            aria-pressed={m.kilde}
            onClick={() => trykkPaMerke(p, e, lager, m)}
          />
        );
      })}
      {(e.plasserer || e.kilde) && !e.kandidat && (
        <p class="df-hint" role="status">
          {e.plasserer
            ? `Trykk på et cyan punkt for å koble ${finnDefinisjon(e.plasserer)?.navn.toLowerCase() ?? 'brikken'}, eller velg «Legg løst på platen».`
            : 'Trykk på et cyan punkt på en annen gruppe for å koble dit.'}{' '}
          Esc avbryter.
        </p>
      )}
      {e.kandidat && forhand && (
        <div class="df-bekreft" role="dialog" aria-label="Bekreft koblingen">
          <p>{forhand.ok ? kandidatTekst(p, e.kandidat) : forhand.grunn}</p>
          <div class="knapperad">
            {forhand.ok && (
              <button
                type="button"
                class="kontroll-knapp df-hoved"
                onClick={() => bekreftKandidat(benk, lager, e.kandidat!)}
              >
                Koble
              </button>
            )}
            <button type="button" class="kontroll-knapp" onClick={() => lager.sett({ kandidat: null })}>
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
