/**
 * The build plate of the CSV workflow with movable signs (Sivert, 2026-10-10, Edge Snap). Seen from above and to
 * scale, each sign drawn from its real parts. A sign is dragged with the pointer or moved with the arrow keys;
 * with Edge Snap on it holds on to the contour of the signs next to it at the minimum distance, and a guide
 * line shows where it holds. Alt held down switches snapping off while the sign is moved. The component only
 * reports where a sign was put (`onFlytt`); the geometry, the colours and the CSV connections are not touched.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Boks, Vec2 } from '../../core/geometri2d';
import { tall } from '../../core/enheter';
import type { ModellDel } from '../../geometri/mesh';
import { Filamentliste, farge, tegnPlate, trekanterOvenfra } from '../../shell/Plateforhandsvisning';
import { snapSkilt, type PlassertSkilt, type SnapKontakt } from './snapmotor';
import { OPPLOSNING, avstandVed, type Silhuett } from './silhuett';

export interface Platesilt {
  /** CSV row. */
  id: number;
  /** The parts in the sign's own coordinates. */
  deler: ModellDel[];
  silhuett: Silhuett;
  boks: Boks;
  /** Snap points in the sign's own coordinates, read off its own geometry. */
  punkter: Vec2[];
  /** Total offset to the plate (mm). */
  dx: number;
  dy: number;
  etikett: string;
}

interface Sprite {
  deler: ModellDel[];
  s: number;
  dpr: number;
  c: HTMLCanvasElement;
  /** Plate millimetres of the sprite's top-left corner, relative to the sign's offset. */
  x: number;
  y: number;
}

/** Margin (mm) around a sign in its picture, for the soft edge of the lines. */
const KANT = 1;

/** The sign painted from above once, so a frame of a drag is only a copy of a picture. */
function lagSprite(sk: Platesilt, s: number, dpr: number): Sprite {
  const w = sk.boks.maksX - sk.boks.minX + 2 * KANT;
  const h = sk.boks.maksY - sk.boks.minY + 2 * KANT;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * s * dpr));
  c.height = Math.max(1, Math.ceil(h * s * dpr));
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (x: number) => (x - (sk.boks.minX - KANT)) * s;
    const Y = (y: number) => (sk.boks.maksY + KANT - y) * s;
    for (const t of trekanterOvenfra(sk.deler)) {
      ctx.fillStyle = t.hex;
      ctx.strokeStyle = t.hex;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(X(t.p[0]), Y(t.p[1]));
      ctx.lineTo(X(t.p[2]), Y(t.p[3]));
      ctx.lineTo(X(t.p[4]), Y(t.p[5]));
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (t.lys < 0.98) {
        ctx.fillStyle = '#000';
        ctx.globalAlpha = (1 - t.lys) * 0.35;
        ctx.fill();
      }
    }
  }
  return { deler: sk.deler, s, dpr, c, x: sk.boks.minX - KANT, y: sk.boks.maksY + KANT };
}

interface Drag {
  id: number;
  /** Pointer in plate mm when the drag began, and the sign's offset then. */
  fraX: number;
  fraY: number;
  dx0: number;
  dy0: number;
  dx: number;
  dy: number;
  kontakt: SnapKontakt | null;
  flyttet: boolean;
}

export function Platebrett({
  plate,
  skilt,
  valgt,
  problemer,
  snap,
  nummer,
  antallPlater,
  merknad,
  melde,
  onVelg,
  onFlytt,
}: {
  plate: { bredde: number; dybde: number };
  skilt: Platesilt[];
  valgt: number | null;
  /** Signs that overlap another sign or stick out over the plate (CSV rows). */
  problemer: ReadonlySet<number>;
  snap: { paa: boolean; avstand: number; fangavstand: number; punkter: boolean };
  nummer: number;
  antallPlater: number;
  /** Extra sentence under the plate. */
  merknad?: string;
  melde: (tekst: string) => void;
  onVelg: (id: number) => void;
  onFlytt: (id: number, dx: number, dy: number) => void;
}) {
  const lerret = useRef<HTMLCanvasElement>(null);
  const sprites = useRef(new Map<number, Sprite>());
  const drag = useRef<Drag | null>(null);
  const kontaktSynlig = useRef<SnapKontakt | null>(null);
  const tid = useRef<number>(0);
  const tegnRef = useRef<() => void>(() => undefined);
  // the latest props for the handlers, which are set up once per plate
  const na = useRef({ skilt, valgt, snap, problemer, plate, onVelg, onFlytt, melde });
  na.current = { skilt, valgt, snap, problemer, plate, onVelg, onFlytt, melde };
  // where a sign was put until the new placement has come back in the props, so it does not jump back
  const ventende = useRef<{ id: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const c = lerret.current;
    if (!c) return;
    const geo = { s: 1, x0: 0, y0: 0 };
    const ctx2 = () => c.getContext('2d');

    const tegn = () => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      const { skilt: liste, valgt: v, problemer: feil } = na.current;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = ctx2();
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = Math.min((w - 24) / plate.bredde, (h - 24) / plate.dybde);
      geo.s = s;
      geo.x0 = w / 2;
      geo.y0 = h / 2;
      const X = (x: number) => geo.x0 + x * s;
      const Y = (y: number) => geo.y0 - y * s;
      tegnPlate(ctx, c, plate, X, Y, s);
      const accent = farge(c, '--handling', '#7b3ff2');
      const d = drag.current;
      const vent = ventende.current;
      const pos = (sk: Platesilt) =>
        d && d.id === sk.id
          ? { dx: d.dx, dy: d.dy }
          : vent && vent.id === sk.id
            ? { dx: vent.dx, dy: vent.dy }
            : { dx: sk.dx, dy: sk.dy };

      // the signs, the one being moved last so it lies on top
      const rekkefolge = [...liste].sort((a, b) => Number(d?.id === a.id) - Number(d?.id === b.id));
      for (const sk of rekkefolge) {
        let sp = sprites.current.get(sk.id);
        if (!sp || sp.deler !== sk.deler || sp.s !== s || sp.dpr !== dpr) {
          sp = lagSprite(sk, s, dpr);
          sprites.current.set(sk.id, sp);
        }
        const p = pos(sk);
        ctx.drawImage(sp.c, X(sp.x + p.dx), Y(sp.y + p.dy), sp.c.width / dpr, sp.c.height / dpr);
      }

      // outline of the chosen sign and the one it holds on to: the real contour, cell by cell
      const kontur = (sk: Platesilt, farg: string, alfa: number) => {
        const p = pos(sk);
        ctx.fillStyle = farg;
        ctx.globalAlpha = alfa;
        const cell = Math.max(1, OPPLOSNING * s);
        ctx.beginPath();
        for (const i of sk.silhuett.rand) {
          const cx = i % sk.silhuett.b;
          const cy = (i - cx) / sk.silhuett.b;
          ctx.rect(
            X(sk.silhuett.minX + cx * OPPLOSNING + p.dx),
            Y(sk.silhuett.minY + (cy + 1) * OPPLOSNING + p.dy),
            cell,
            cell,
          );
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      };
      const k = d?.kontakt ?? kontaktSynlig.current;
      if (k) {
        const nabo = liste.find((x) => x.id === k.nabo);
        if (nabo) kontur(nabo, accent, 0.9);
      }
      const valgtSkilt = liste.find((x) => x.id === v);
      if (valgtSkilt) kontur(valgtSkilt, accent, 0.55);

      // a sign that overlaps or sticks out is marked red
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = farge(c, '--feil-mork', '#b3261e');
      for (const sk of liste) {
        if (!feil.has(sk.id)) continue;
        const p = pos(sk);
        ctx.strokeRect(
          X(sk.boks.minX + p.dx),
          Y(sk.boks.maksY + p.dy),
          (sk.boks.maksX - sk.boks.minX) * s,
          (sk.boks.maksY - sk.boks.minY) * s,
        );
      }
      ctx.setLineDash([]);

      // snap points of the signs: small rings, drawn on the geometry they follow
      if (na.current.snap.paa && na.current.snap.punkter) {
        ctx.lineWidth = 1.5;
        for (const sk of liste) {
          const p = pos(sk);
          for (const q of sk.punkter) {
            ctx.beginPath();
            ctx.arc(X(q.x + p.dx), Y(q.y + p.dy), 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.stroke();
          }
        }
      }

      // the guide: where it holds on, and the distance between the two contours
      if (k) {
        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.lineWidth = 2;
        if (k.type === 'punkt') {
          ctx.beginPath();
          ctx.arc(X(k.b[0]), Y(k.b[1]), 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(X(k.b[0]), Y(k.b[1]), 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(X(k.a[0]), Y(k.a[1]));
          ctx.lineTo(X(k.b[0]), Y(k.b[1]));
          ctx.stroke();
          for (const q of [k.a, k.b]) {
            ctx.beginPath();
            ctx.arc(X(q[0]), Y(q[1]), 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        const tekst = k.type === 'punkt' ? 'Punkt mot punkt' : `${tall(k.d)} mm`;
        ctx.font = '600 12px sans-serif';
        const mx = X((k.a[0] + k.b[0]) / 2) + 10;
        const my = Y((k.a[1] + k.b[1]) / 2) - 10;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(tekst, mx, my);
        ctx.fillStyle = '#111';
        ctx.fillText(tekst, mx, my);
      }

      // the CSV row on each sign, top left
      ctx.font = `600 ${Math.max(10, Math.min(16, s * 7))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      for (const sk of liste) {
        const p = pos(sk);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(sk.etikett, X(sk.boks.minX + p.dx + 0.5), Y(sk.boks.maksY + p.dy - 0.5));
        ctx.fillStyle = '#111';
        ctx.fillText(sk.etikett, X(sk.boks.minX + p.dx + 0.5), Y(sk.boks.maksY + p.dy - 0.5));
      }
    };
    tegnRef.current = tegn;
    tegn();
    const ro = new ResizeObserver(tegn);
    ro.observe(c);

    // ---- pointer and keyboard ----
    const tilMm = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [(e.clientX - r.left - geo.x0) / geo.s, -(e.clientY - r.top - geo.y0) / geo.s];
    };
    const treff = (x: number, y: number): Platesilt | null => {
      const { skilt: liste, valgt: v } = na.current;
      // the chosen sign first, then from the top of the stack: the last drawn
      const ordnet = [...liste].sort((a, b) => Number(b.id === v) - Number(a.id === v));
      for (const sk of ordnet) {
        if (avstandVed(sk.silhuett, x - sk.dx, y - sk.dy) <= OPPLOSNING) return sk;
      }
      return null;
    };
    const plassert = (sk: Platesilt): PlassertSkilt => ({
      id: sk.id,
      silhuett: sk.silhuett,
      boks: sk.boks,
      dx: sk.dx,
      dy: sk.dy,
      punkter: sk.punkter,
    });
    const snapRadius = () => na.current.snap.fangavstand;
    const beregn = (sk: Platesilt, dx: number, dy: number, snapPaa: boolean, radius: number) => {
      const { skilt: liste, snap: valg, plate: pl } = na.current;
      return snapSkilt(plassert(sk), dx, dy, liste.filter((x) => x.id !== sk.id).map(plassert), pl, {
        paa: valg.paa && snapPaa,
        avstand: valg.avstand,
        radius,
        punkter: valg.punkter,
      });
    };

    const ned = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const [x, y] = tilMm(e);
      const sk = treff(x, y);
      if (!sk) return;
      c.setPointerCapture(e.pointerId);
      c.focus({ preventScroll: true });
      if (na.current.valgt !== sk.id) na.current.onVelg(sk.id);
      drag.current = {
        id: sk.id,
        fraX: x,
        fraY: y,
        dx0: sk.dx,
        dy0: sk.dy,
        dx: sk.dx,
        dy: sk.dy,
        kontakt: null,
        flyttet: false,
      };
      c.style.cursor = 'grabbing';
      kontaktSynlig.current = null;
      tegn();
    };
    const flytt = (e: PointerEvent) => {
      const d = drag.current;
      const [x, y] = tilMm(e);
      if (!d) {
        c.style.cursor = treff(x, y) ? 'grab' : 'default';
        return;
      }
      const sk = na.current.skilt.find((q) => q.id === d.id);
      if (!sk) return;
      const r = beregn(sk, d.dx0 + (x - d.fraX), d.dy0 + (y - d.fraY), !e.altKey, snapRadius());
      d.dx = r.dx;
      d.dy = r.dy;
      d.kontakt = r.kontakt;
      d.flyttet = d.flyttet || Math.hypot(r.dx - d.dx0, r.dy - d.dy0) > 0.01;
      tegn();
    };
    const opp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      c.style.cursor = 'grab';
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      if (d.flyttet && e.type === 'pointerup') {
        ventende.current = { id: d.id, dx: d.dx, dy: d.dy };
        na.current.onFlytt(d.id, d.dx, d.dy);
        na.current.melde(
          d.kontakt
            ? d.kontakt.type === 'punkt'
              ? `Skilt ${d.id + 1} er flyttet og sitter på snap-punktet til skilt ${d.kontakt.nabo + 1}.`
              : `Skilt ${d.id + 1} er flyttet og holder ${tall(d.kontakt.d)} mm avstand til skilt ${d.kontakt.nabo + 1}.`
            : `Skilt ${d.id + 1} er flyttet.`,
        );
      }
      tegn();
    };
    const taster = (e: KeyboardEvent) => {
      const { skilt: liste, valgt: v } = na.current;
      if (e.key === 'Escape' && drag.current) {
        drag.current = null;
        tegn();
        return;
      }
      const retning: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      };
      const r = retning[e.key];
      const sk = liste.find((x) => x.id === v);
      if (!r || !sk) return;
      e.preventDefault();
      const steg = e.shiftKey ? 10 : 1;
      // by the keyboard the sign is only kept at its distance, never pulled in, so it can be moved away again
      const res = beregn(sk, sk.dx + r[0] * steg, sk.dy + r[1] * steg, !e.altKey, 0);
      if (Math.abs(res.dx - sk.dx) < 1e-6 && Math.abs(res.dy - sk.dy) < 1e-6) return;
      kontaktSynlig.current = res.kontakt;
      window.clearTimeout(tid.current);
      tid.current = window.setTimeout(() => {
        kontaktSynlig.current = null;
        tegn();
      }, 900);
      ventende.current = { id: sk.id, dx: res.dx, dy: res.dy };
      na.current.onFlytt(sk.id, res.dx, res.dy);
      na.current.melde(
        `Skilt ${sk.id + 1} er flyttet til ${tall(res.dx + sk.boks.minX + plate.bredde / 2)} mm fra venstre kant og ${tall(plate.dybde / 2 - (res.dy + sk.boks.maksY))} mm fra øvre kant.`,
      );
    };
    // while a sign is dragged on a touch screen the page must not scroll
    const hindreRulling = (e: TouchEvent) => {
      if (drag.current && e.cancelable) e.preventDefault();
    };
    const hindreRullingStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !e.cancelable) return;
      const r = c.getBoundingClientRect();
      const x = (t.clientX - r.left - geo.x0) / geo.s;
      const y = -(t.clientY - r.top - geo.y0) / geo.s;
      if (treff(x, y)) e.preventDefault();
    };

    c.addEventListener('pointerdown', ned);
    c.addEventListener('pointermove', flytt);
    c.addEventListener('pointerup', opp);
    c.addEventListener('pointercancel', opp);
    c.addEventListener('keydown', taster);
    c.addEventListener('touchstart', hindreRullingStart, { passive: false });
    c.addEventListener('touchmove', hindreRulling, { passive: false });
    return () => {
      window.clearTimeout(tid.current);
      ro.disconnect();
      c.removeEventListener('pointerdown', ned);
      c.removeEventListener('pointermove', flytt);
      c.removeEventListener('pointerup', opp);
      c.removeEventListener('pointercancel', opp);
      c.removeEventListener('keydown', taster);
      c.removeEventListener('touchstart', hindreRullingStart);
      c.removeEventListener('touchmove', hindreRulling);
    };
    // the handlers read the latest props through `na`
  }, [plate.bredde, plate.dybde]);

  useEffect(() => {
    ventende.current = null;
    tegnRef.current();
  }, [skilt, valgt, problemer, snap.paa, snap.avstand, snap.punkter]);

  const alleDeler = skilt.flatMap((x) => x.deler.map((d) => ({ ...d, id: `${x.id}-${d.id}` })));
  return (
    <figure class="plateforhandsvisning platebrett">
      <canvas
        ref={lerret}
        tabIndex={0}
        role="application"
        aria-roledescription="byggeplate"
        aria-label={`Byggeplaten sett ovenfra, plate ${nummer} av ${antallPlater}, ${tall(plate.bredde)} × ${tall(plate.dybde)} mm, med ${skilt.length} skilt. Dra et skilt, eller velg det og bruk piltastene. Hold Alt for å slå av Edge Snap mens du flytter.`}
      />
      <figcaption>
        <p class="dempet">
          Slik ligger skiltene på plata i 3MF-filen, sett ovenfra og i skala. Tallene er radnumre i CSV-filen.
          Dra et skilt for å flytte det; med Edge Snap på legger det seg inntil konturen til skiltet ved siden
          av. {merknad}
        </p>
        <Filamentliste deler={alleDeler as ModellDel[]} />
      </figcaption>
    </figure>
  );
}
