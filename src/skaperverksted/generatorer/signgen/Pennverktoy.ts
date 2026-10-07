/**
 * The pen tool, as in a drawing program (Sivert, 2026-10-05): click for a
 * corner point, click and drag for a smooth point with handles (hold Alt
 * to pull out only the next handle), click the first point to close the
 * path, Enter or double-click to finish an open path, Esc to stop.
 * Hold Space while placing a point to move the point itself; Shift locks the
 * next segment (or the handle being pulled) to 45°.
 * The path is kept in sign coordinates until it is finished.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Vec2 } from '../../core/geometri2d';
import type { Node } from '../../geometri/bane';
import type { Verktoyhandler } from '../../render2d/Lerret';
import { erDobbeltklikk } from './dobbeltklikk';
import { leggTilPennBane } from './kurver';
import { laas45Punkt, snapPunkt } from './plukk';
import { signtilstand, type PennUtkast } from './tilstand';

const node = (p: Vec2): Node => ({ p, inn: null, ut: null, glatt: false });
const avstand = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Is a path being drawn? */
export function pennPagar(benk: Arbeidsbenk): boolean {
  return !!signtilstand(benk).t.penn?.bane;
}

/** Finish the path being drawn, closed or open. Too short paths are dropped. */
export function fullforPenn(benk: Arbeidsbenk, lukket: boolean): void {
  const lager = signtilstand(benk);
  const u = lager.t.penn;
  if (!u?.bane) return;
  // a double-click leaves a second point on top of the last
  const noder = [...u.bane.noder];
  while (noder.length > 1 && avstand(noder[noder.length - 1]!.p, noder[noder.length - 2]!.p) < 1e-6)
    noder.pop();
  if (noder.length < 3) {
    lager.sett({ penn: { ...u, bane: null, peker: null } });
    benk.melde('En bane trenger minst tre punkter. Tegningen ble forkastet.');
    return;
  }
  const id = leggTilPennBane(benk, { noder, lukket }, u.objektId);
  lager.sett({ penn: { objektId: id, bane: null, peker: null } });
  if (!lukket)
    benk.melde(
      'Åpen bane lagt til. Lukk den med «Lukk bane» i panelet, ellers fylles den som om den var lukket.',
    );
}

/** Take back the last point (Backspace). */
export function angrePennpunkt(benk: Arbeidsbenk): boolean {
  const lager = signtilstand(benk);
  const u = lager.t.penn;
  if (!u?.bane) return false;
  const noder = u.bane.noder.slice(0, -1);
  lager.sett({ penn: { ...u, bane: noder.length ? { ...u.bane, noder } : null } });
  return true;
}

export function lagPennverktoy(benk: Arbeidsbenk): Verktoyhandler {
  const lager = signtilstand(benk);
  let drag: { indeks: number; start: Vec2; flyttet: boolean; sist: Vec2 } | null = null;
  /** Shift: keep the new point on a 45° line from the previous one. */
  const laas = (bane: PennUtkast['bane'], p: Vec2, skift: boolean): Vec2 => {
    const forrige = bane?.noder[bane.noder.length - 1]?.p;
    return skift && forrige ? laas45Punkt(forrige, p) : p;
  };

  return {
    markor: 'crosshair',
    ned({ modell, skjerm, e, visning: v }) {
      const u: PennUtkast = lager.t.penn ?? {
        objektId: lager.t.kurve?.objektId ?? null,
        bane: null,
        peker: null,
      };
      const bane = u.bane;
      if (erDobbeltklikk(skjerm) && bane) {
        fullforPenn(benk, false);
        return;
      }
      if (bane && bane.noder.length >= 3) {
        const f = v.tilSkjerm(bane.noder[0]!.p);
        if (avstand(f, skjerm) < (e.pointerType === 'touch' ? 14 : 9)) {
          fullforPenn(benk, true);
          return;
        }
      }
      const p = laas(bane, snapPunkt(benk, modell, v, e.altKey), e.shiftKey);
      const noder = [...(bane?.noder ?? []), node(p)];
      lager.sett({ penn: { ...u, bane: { noder, lukket: false }, peker: p } });
      drag = { indeks: noder.length - 1, start: skjerm, flyttet: false, sist: modell };
    },
    flytt({ modell, skjerm, e, visning: v, mellomrom }) {
      const u = lager.t.penn;
      if (!u?.bane) return;
      if (drag) {
        const sist = drag.sist;
        drag.sist = modell;
        if (mellomrom) {
          // Space held: the point moves with the pointer (its handles stay as they are)
          const dx = modell.x - sist.x,
            dy = modell.y - sist.y;
          const noder = u.bane.noder.map((x, i) =>
            i === drag!.indeks ? { ...x, p: { x: x.p.x + dx, y: x.p.y + dy } } : x,
          );
          lager.sett({ penn: { ...u, bane: { ...u.bane, noder }, peker: modell } });
          return;
        }
        if (!drag.flyttet && avstand(skjerm, drag.start) < 4) return;
        drag.flyttet = true;
        const nd = u.bane.noder[drag.indeks];
        if (!nd) return;
        const mal = e.shiftKey ? laas45Punkt(nd.p, modell) : modell;
        const d = { x: mal.x - nd.p.x, y: mal.y - nd.p.y };
        const noder = u.bane.noder.map((x, i) =>
          i === drag!.indeks
            ? { ...x, ut: d, inn: e.altKey ? x.inn : { x: -d.x, y: -d.y }, glatt: !e.altKey }
            : x,
        );
        lager.sett({ penn: { ...u, bane: { ...u.bane, noder }, peker: modell } });
      } else {
        lager.sett({ penn: { ...u, peker: laas(u.bane, snapPunkt(benk, modell, v, e.altKey), e.shiftKey) } });
      }
    },
    opp() {
      drag = null;
    },
    avbryt() {
      drag = null;
    },
  };
}
