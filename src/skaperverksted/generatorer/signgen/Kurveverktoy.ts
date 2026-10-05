/**
 * The tool for editing the points and curves of one vector (double-click on
 * it). Like the direct-selection tool in a drawing program: click a point
 * to select it, drag it, drag its handles, click a curve to select it,
 * double-click a curve to add a point, double-click a point to switch
 * between corner and smooth, click inside a shape to select it, drag round
 * points to select several.
 */
import type { Arbeidsbenk } from '../../core/arbeidsbenk';
import type { Vec2 } from '../../core/geometri2d';
import {
  baneVedPunkt,
  erKurve,
  flyttNoder,
  formAv,
  narmesteSegment,
  segmenter,
  settHandtak,
  type Bane,
  type NodeRef,
} from '../../geometri/bane';
import type { Verktoyhandler } from '../../render2d/Lerret';
import { erDobbeltklikk } from './dobbeltklikk';
import {
  avsluttKurveredigering,
  kurveObjekt,
  leggTilPunkt,
  lokalSkala,
  settKurve,
  skrivBaner,
  tilLokal,
  tilLokalVektor,
  tilVerden,
  veksleNodetype,
} from './kurver';
import { settForhandsvisning } from './Kurveoverlegg';
import { snapPunkt, treff } from './plukk';
import { signtilstand } from './tilstand';

/** The curves as they will be when the drag ends. */
interface Utkast {
  baner: Bane[];
  navn: string;
}

type Drag =
  | {
      type: 'noder';
      base: Bane[];
      noder: NodeRef[];
      anker: Vec2;
      forskyvning: Vec2;
      start: Vec2;
      flyttet: boolean;
      ny?: Utkast;
    }
  | {
      type: 'handtak';
      base: Bane[];
      bane: number;
      node: number;
      hvilken: 'inn' | 'ut';
      start: Vec2;
      flyttet: boolean;
      ny?: Utkast;
    }
  | {
      type: 'segment';
      base: Bane[];
      bane: number;
      seg: number;
      t: number;
      start: Vec2;
      pek: Vec2;
      flyttet: boolean;
      ny?: Utkast;
    }
  | { type: 'bane'; base: Bane[]; baner: number[]; start: Vec2; pek: Vec2; flyttet: boolean; ny?: Utkast }
  | { type: 'marker'; start: Vec2; legg: boolean; for: NodeRef[] };

const samme = (a: NodeRef, b: NodeRef) => a[0] === b[0] && a[1] === b[1];
const finnes = (liste: NodeRef[], r: NodeRef) => liste.some((x) => samme(x, r));

export function lagKurveverktoy(benk: Arbeidsbenk): Verktoyhandler {
  const lager = signtilstand(benk);
  let drag: Drag | null = null;

  /** Show the curves while dragging; the document changes once, when the drag ends. */
  const vis = (d: Exclude<Drag, { type: 'marker' }>, baner: Bane[], navn: string) => {
    d.ny = { baner, navn };
    settForhandsvisning(benk, kurveObjekt(benk)?.o.id ?? null, baner);
  };

  const slutt = (fullfor: boolean) => {
    const d = drag;
    drag = null;
    settForhandsvisning(benk, null, null);
    if (fullfor && d && d.type !== 'marker' && d.ny) skrivBaner(benk, d.ny.baner, d.ny.navn);
    lager.sett({ markering: null, maletikett: null });
  };

  return {
    markor: 'default',
    ned({ modell, skjerm, e, visning: v }) {
      const c = kurveObjekt(benk);
      if (!c) return;
      const dobbel = erDobbeltklikk(skjerm);
      const px = e.pointerType === 'touch' ? 16 : 8;
      const skjermAv = (lokal: Vec2) => v.tilSkjerm(tilVerden(c.o, lokal));
      const naer = (lokal: Vec2) => {
        const s = skjermAv(lokal);
        return Math.hypot(s.x - skjerm.x, s.y - skjerm.y);
      };

      // 1. handles of the selected points (and of the ends of a selected curve)
      const medHandtak: NodeRef[] = [...c.k.noder];
      if (c.k.segment) {
        const b = c.baner[c.k.segment.bane];
        const par = b && segmenter(b)[c.k.segment.seg];
        if (par) medHandtak.push([c.k.segment.bane, par[0]], [c.k.segment.bane, par[1]]);
      }
      for (const [b, n] of medHandtak) {
        const nd = c.baner[b]?.noder[n];
        if (!nd) continue;
        for (const hv of ['inn', 'ut'] as const) {
          const h = nd[hv];
          if (h && naer({ x: nd.p.x + h.x, y: nd.p.y + h.y }) < px) {
            drag = {
              type: 'handtak',
              base: c.baner,
              bane: b,
              node: n,
              hvilken: hv,
              start: skjerm,
              flyttet: false,
            };
            return;
          }
        }
      }

      // 2. anchor points
      let best: { ref: NodeRef; d: number } | null = null;
      c.baner.forEach((bane, b) =>
        bane.noder.forEach((nd, n) => {
          const d = naer(nd.p);
          if (d < px && (!best || d < best.d)) best = { ref: [b, n], d };
        }),
      );
      if (best) {
        const ref = (best as { ref: NodeRef }).ref;
        if (dobbel && finnes(c.k.noder, ref)) {
          veksleNodetype(benk, ref[0], ref[1]);
          return;
        }
        let valgt = c.k.noder;
        if (e.shiftKey) valgt = finnes(valgt, ref) ? valgt.filter((x) => !samme(x, ref)) : [...valgt, ref];
        else if (!finnes(valgt, ref)) valgt = [ref];
        settKurve(benk, { noder: valgt, baner: [], segment: null });
        if (!finnes(valgt, ref)) return;
        const p = tilVerden(c.o, c.baner[ref[0]]!.noder[ref[1]]!.p);
        drag = {
          type: 'noder',
          base: c.baner,
          noder: valgt,
          anker: p,
          forskyvning: { x: p.x - modell.x, y: p.y - modell.y },
          start: skjerm,
          flyttet: false,
        };
        return;
      }

      // 3. a curve
      const lokalPeker = tilLokal(c.o, modell);
      const sm = narmesteSegment(c.baner, lokalPeker, px / v.pxPerMm / lokalSkala(c.o));
      if (sm) {
        if (dobbel) {
          leggTilPunkt(benk, sm.bane, sm.seg, sm.t);
          return;
        }
        settKurve(benk, { segment: { bane: sm.bane, seg: sm.seg }, noder: [], baner: [] });
        drag = {
          type: 'segment',
          base: c.baner,
          bane: sm.bane,
          seg: sm.seg,
          t: sm.t,
          start: skjerm,
          pek: modell,
          flyttet: false,
        };
        return;
      }

      // 4. inside a shape
      const inni = baneVedPunkt(c.baner, lokalPeker);
      if (inni !== null) {
        const valgt = e.shiftKey && c.k.baner.length ? [...new Set([...c.k.baner, inni])] : [inni];
        settKurve(benk, { baner: valgt, noder: [], segment: null });
        drag = {
          type: 'bane',
          base: c.baner,
          baner: [...new Set(valgt.flatMap((b) => formAv(c.baner, b)))],
          start: skjerm,
          pek: modell,
          flyttet: false,
        };
        return;
      }

      // 5. another object: leave the editing and select it
      const annet = treff(benk, modell, px / v.pxPerMm);
      if (annet && annet.id !== c.o.id) {
        avsluttKurveredigering(benk);
        benk.velg({ objekter: [annet.id], lag: annet.lagId });
        return;
      }

      // 6. empty space: select points inside a box, or clear
      drag = { type: 'marker', start: modell, legg: e.shiftKey, for: e.shiftKey ? c.k.noder : [] };
      if (!e.shiftKey) settKurve(benk, { noder: [], baner: [], segment: null });
    },

    flytt({ modell, skjerm, e, visning: v }) {
      const d = drag;
      const c = kurveObjekt(benk);
      if (!d || !c) return;
      if (d.type !== 'marker') {
        if (!d.flyttet && Math.hypot(skjerm.x - d.start.x, skjerm.y - d.start.y) < 3) return;
        d.flyttet = true;
      }
      if (d.type === 'noder') {
        let mal = snapPunkt(
          benk,
          { x: modell.x + d.forskyvning.x, y: modell.y + d.forskyvning.y },
          v,
          e.altKey,
          c.o.id,
        );
        if (e.shiftKey) {
          if (Math.abs(mal.x - d.anker.x) > Math.abs(mal.y - d.anker.y)) mal = { x: mal.x, y: d.anker.y };
          else mal = { x: d.anker.x, y: mal.y };
        }
        const l = tilLokalVektor(c.o, { x: mal.x - d.anker.x, y: mal.y - d.anker.y });
        vis(d, flyttNoder(d.base, d.noder, l.x, l.y), d.noder.length > 1 ? 'Flytt punkter' : 'Flytt punkt');
      } else if (d.type === 'handtak') {
        const nd = d.base[d.bane]?.noder[d.node];
        if (!nd) return;
        const lokal = tilLokal(c.o, modell);
        vis(
          d,
          settHandtak(
            d.base,
            d.bane,
            d.node,
            d.hvilken,
            { x: lokal.x - nd.p.x, y: lokal.y - nd.p.y },
            e.altKey,
          ),
          'Flytt kurvehåndtak',
        );
      } else if (d.type === 'segment') {
        const bane = d.base[d.bane];
        const par = bane && segmenter(bane)[d.seg];
        if (!bane || !par) return;
        const [i, j] = par;
        const a = bane.noder[i]!,
          z = bane.noder[j]!;
        const l = tilLokalVektor(c.o, { x: modell.x - d.pek.x, y: modell.y - d.pek.y });
        let baner: Bane[];
        if (!erKurve(a, z)) {
          baner = flyttNoder(
            d.base,
            [
              [d.bane, i],
              [d.bane, j],
            ],
            l.x,
            l.y,
          );
        } else {
          // bend the curve so that the point under the pointer follows it
          const t = Math.min(0.85, Math.max(0.15, d.t));
          const k = 1 / (3 * t * (1 - t));
          baner = settHandtak(d.base, d.bane, i, 'ut', {
            x: (a.ut?.x ?? 0) + l.x * k,
            y: (a.ut?.y ?? 0) + l.y * k,
          });
          baner = settHandtak(baner, d.bane, j, 'inn', {
            x: (z.inn?.x ?? 0) + l.x * k,
            y: (z.inn?.y ?? 0) + l.y * k,
          });
        }
        vis(d, baner, erKurve(a, z) ? 'Bøy kurve' : 'Flytt linje');
      } else if (d.type === 'bane') {
        const l = tilLokalVektor(c.o, { x: modell.x - d.pek.x, y: modell.y - d.pek.y });
        const noder: NodeRef[] = d.baner.flatMap((b) =>
          (d.base[b]?.noder ?? []).map((_, n) => [b, n] as NodeRef),
        );
        vis(d, flyttNoder(d.base, noder, l.x, l.y), 'Flytt form');
      } else {
        const b = {
          minX: Math.min(d.start.x, modell.x),
          maksX: Math.max(d.start.x, modell.x),
          minY: Math.min(d.start.y, modell.y),
          maksY: Math.max(d.start.y, modell.y),
        };
        const inne: NodeRef[] = [];
        c.baner.forEach((bane, bi) =>
          bane.noder.forEach((nd, n) => {
            const w = tilVerden(c.o, nd.p);
            if (w.x >= b.minX && w.x <= b.maksX && w.y >= b.minY && w.y <= b.maksY) inne.push([bi, n]);
          }),
        );
        const alle = [...d.for];
        for (const r of inne) if (!finnes(alle, r)) alle.push(r);
        settKurve(benk, { noder: alle, baner: [], segment: null });
        lager.sett({ markering: b });
      }
    },

    opp() {
      if (drag?.type === 'marker') {
        const c = kurveObjekt(benk);
        const n = c ? c.k.noder.length : 0;
        if (n) benk.melde(n === 1 ? '1 punkt valgt.' : `${n} punkter valgt.`);
      }
      slutt(true);
    },

    avbryt: () => slutt(false),
  };
}
