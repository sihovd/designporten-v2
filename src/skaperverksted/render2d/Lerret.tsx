/**
 * Shared 2D workspace canvas: real millimetres, adaptive 1-2-5 grid,
 * rulers with the selection's extent, the printable plate, pan and zoom
 * (wheel, Space/middle drag, pinch) and pointer routing to the active
 * tool. Generators draw their content through `tegn`.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Arbeidsbenk } from '../core/arbeidsbenk';
import type { Boks, Vec2 } from '../core/geometri2d';
import { linjalEtikett, rutenettnivaa } from '../core/rutenett';
import { cssFarge } from '../shell/tema';
import { LINJAL, lagVisning, tilpass, zoomRundt, type Visning } from './visning';

export interface Pekerhendelse {
  modell: Vec2;
  skjerm: Vec2;
  e: PointerEvent;
  visning: Visning;
}

export interface Verktoyhandler {
  /** CSS cursor while this tool is active. */
  markor?: string;
  ned?(h: Pekerhendelse): void;
  flytt?(h: Pekerhendelse): void;
  opp?(h: Pekerhendelse): void;
  /** Pointer left the canvas or was cancelled. */
  avbryt?(): void;
}

export interface Farger {
  bakgrunn: string;
  plate: string;
  linje: string;
  linjeSterk: string;
  tekst: string;
  dempet: string;
  lilla: string;
  cyan: string;
}

export interface LerretProps {
  benk: Arbeidsbenk;
  /** Draw generator content (model space helpers in `v`). */
  tegn: (ctx: CanvasRenderingContext2D, v: Visning, f: Farger) => void;
  verktoy?: Verktoyhandler | null;
  /** Extent highlighted on the rulers (mm). */
  markering?: Boks | null;
  /** Bounds for «tilpass» (fit); defaults to the plate. */
  innhold?: () => Boks | null;
  /** Pan with a plain drag (the pan tool). */
  panorer?: boolean;
  /**
   * Dragging out of a ruler: `topp` is the ruler along the top (it makes horizontal guides), `venstre`
   * the one down the left side. The handler gets the pointer until it is released.
   */
  linjalverktoy?: (side: 'topp' | 'venstre') => Verktoyhandler | null;
  etikett: string;
  children?: ComponentChildren;
}

function lesFarger(el: Element): Farger {
  return {
    bakgrunn: cssFarge(el, '--bg', '#141317'),
    plate: cssFarge(el, '--grafitt', '#1c1b1f'),
    linje: cssFarge(el, '--linje', '#3a3740'),
    linjeSterk: cssFarge(el, '--linje-sterk', '#6b6671'),
    tekst: cssFarge(el, '--fg', '#f1eee8'),
    dempet: cssFarge(el, '--fg-dempet', '#a7a3a0'),
    lilla: cssFarge(el, '--dp-lilla', '#883dff'),
    cyan: cssFarge(el, '--dp-cyan', '#00c4d6'),
  };
}

export function Lerret({
  benk,
  tegn,
  verktoy,
  markering,
  innhold,
  panorer,
  linjalverktoy,
  etikett,
  children,
}: LerretProps) {
  const vert = useRef<HTMLDivElement>(null);
  const lerret = useRef<HTMLCanvasElement>(null);
  const siste = useRef({ tegn, verktoy, markering, innhold, panorer, linjalverktoy });
  siste.current = { tegn, verktoy, markering, innhold, panorer, linjalverktoy };
  const planlagt = useRef(false);
  const tegnNa = useRef<() => void>(() => {});

  useEffect(() => {
    const el = vert.current!;
    const c = lerret.current!;
    const ctx = c.getContext('2d')!;
    let farger = lesFarger(el);
    let b = 1,
      h = 1;

    const visning = () => lagVisning(benk.tilstand.utsnitt, b, h);

    const tegnAlt = () => {
      planlagt.current = false;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const v = visning();
      const { dok } = benk.tilstand;
      ctx.fillStyle = farger.bakgrunn;
      ctx.fillRect(0, 0, b, h);

      // printable plate
      const p0 = v.tilSkjerm({ x: -dok.plate.bredde / 2, y: dok.plate.dybde / 2 });
      const p1 = v.tilSkjerm({ x: dok.plate.bredde / 2, y: -dok.plate.dybde / 2 });
      ctx.fillStyle = farger.plate;
      ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);

      // adaptive grid
      if (benk.tilstand.innstillinger.rutenett) {
        const niva = rutenettnivaa(v.pxPerMm);
        const a = v.tilModell({ x: LINJAL, y: h });
        const z = v.tilModell({ x: b, y: LINJAL });
        const linjer = (steg: number, farge: string, alfa: number) => {
          ctx.globalAlpha = alfa;
          ctx.strokeStyle = farge;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = Math.ceil(a.x / steg) * steg; x <= z.x; x += steg) {
            const sx = Math.round(v.tilSkjerm({ x, y: 0 }).x) + 0.5;
            ctx.moveTo(sx, LINJAL);
            ctx.lineTo(sx, h);
          }
          for (let y = Math.ceil(a.y / steg) * steg; y <= z.y; y += steg) {
            const sy = Math.round(v.tilSkjerm({ x: 0, y }).y) + 0.5;
            ctx.moveTo(LINJAL, sy);
            ctx.lineTo(b, sy);
          }
          ctx.stroke();
        };
        linjer(niva.liten, farger.linje, 0.45 * niva.litenSynlighet);
        linjer(niva.stor, farger.linje, 0.95);
        ctx.globalAlpha = 1;
      }

      // plate outline and centre cross
      ctx.strokeStyle = farger.linjeSterk;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        Math.round(p0.x) + 0.5,
        Math.round(p0.y) + 0.5,
        Math.round(p1.x - p0.x),
        Math.round(p1.y - p0.y),
      );
      ctx.setLineDash([]);
      const o = v.tilSkjerm({ x: 0, y: 0 });
      ctx.beginPath();
      ctx.moveTo(o.x - 6, o.y);
      ctx.lineTo(o.x + 6, o.y);
      ctx.moveTo(o.x, o.y - 6);
      ctx.lineTo(o.x, o.y + 6);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(LINJAL, LINJAL, b - LINJAL, h - LINJAL);
      ctx.clip();
      siste.current.tegn(ctx, v, farger);
      ctx.restore();

      tegnLinjaler(ctx, v, farger, siste.current.markering ?? null);
    };

    const planlegg = () => {
      if (planlagt.current) return;
      planlagt.current = true;
      requestAnimationFrame(tegnAlt);
    };
    tegnNa.current = planlegg;

    const storrelse = () => {
      const dpr = window.devicePixelRatio || 1;
      b = el.clientWidth || 1;
      h = el.clientHeight || 1;
      c.width = Math.round(b * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${b}px`;
      c.style.height = `${h}px`;
      planlegg();
    };
    const ro = new ResizeObserver(storrelse);
    ro.observe(el);
    storrelse();
    const avLytt = benk.lytt(planlegg);
    const tema = matchMedia('(prefers-contrast: more)');
    const nyeFarger = () => {
      farger = lesFarger(el);
      planlegg();
    };
    tema.addEventListener('change', nyeFarger);

    // view commands for shortcuts and toolbars
    const fit = () => {
      const i = siste.current.innhold?.() ?? null;
      const d = benk.tilstand.dok.plate;
      const boks = i ?? { minX: -d.bredde / 2, minY: -d.dybde / 2, maksX: d.bredde / 2, maksY: d.dybde / 2 };
      const panel = el
        .closest('.arbeidsomrade')
        ?.querySelector<HTMLElement>('.flytpanel.venstre:not(.lukket)');
      const dekket = panel ? panel.getBoundingClientRect().right - el.getBoundingClientRect().left : 0;
      benk.settUtsnitt(tilpass(boks, b, h, 48, Math.max(0, dekket)));
    };
    const senter = () => ({ x: LINJAL + (b - LINJAL) / 2, y: LINJAL + (h - LINJAL) / 2 });
    const kommandoer: [string, () => void][] = [
      ['tilpass', fit],
      ['zoom-100', () => benk.settUtsnitt({ zoom: 1 })],
      ['zoom-inn', () => benk.settUtsnitt(zoomRundt(benk.tilstand.utsnitt, b, h, senter(), 1.25))],
      ['zoom-ut', () => benk.settUtsnitt(zoomRundt(benk.tilstand.utsnitt, b, h, senter(), 0.8))],
      ['tegn', planlegg],
    ];
    for (const [k, f] of kommandoer) benk.kommandoer.set(k, f);
    if (!benk.tilstand.utsnittSatt) requestAnimationFrame(fit);

    // pointer routing, pan and pinch
    const pekere = new Map<number, Vec2>();
    let pan: { start: Vec2; senter: Vec2 } | null = null;
    let klype: { avstand: number; midt: Vec2; zoom: number } | null = null;
    let mellomrom = false;
    let verktoyAktiv = false;
    /** A ruler drag: this handler has the pointer instead of the active tool. */
    let linjalHandler: Verktoyhandler | null = null;
    const aktivtVerktoy = () => linjalHandler ?? siste.current.verktoy;

    const pos = (e: PointerEvent | WheelEvent): Vec2 => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hendelse = (e: PointerEvent): Pekerhendelse => {
      const v = visning();
      const s = pos(e);
      return { modell: v.tilModell(s), skjerm: s, e, visning: v };
    };
    const oppdaterMarkor = () => {
      c.style.cursor = pan
        ? 'grabbing'
        : mellomrom || siste.current.panorer
          ? 'grab'
          : (siste.current.verktoy?.markor ?? 'default');
    };

    const ned = (e: PointerEvent) => {
      c.focus({ preventScroll: true });
      pekere.set(e.pointerId, pos(e));
      c.setPointerCapture(e.pointerId);
      if (pekere.size === 2) {
        // second finger: switch to pinch, cancel any tool drag
        if (verktoyAktiv) aktivtVerktoy()?.avbryt?.();
        verktoyAktiv = false;
        linjalHandler = null;
        pan = null;
        const [a, bb] = [...pekere.values()] as [Vec2, Vec2];
        klype = {
          avstand: Math.hypot(a.x - bb.x, a.y - bb.y),
          midt: { x: (a.x + bb.x) / 2, y: (a.y + bb.y) / 2 },
          zoom: benk.tilstand.utsnitt.zoom,
        };
        return;
      }
      if (e.button === 1 || mellomrom || siste.current.panorer) {
        e.preventDefault();
        pan = {
          start: pos(e),
          senter: { x: benk.tilstand.utsnitt.senterX, y: benk.tilstand.utsnitt.senterY },
        };
        oppdaterMarkor();
        return;
      }
      if (e.button !== 0) return;
      const s = pos(e);
      const side = s.y < LINJAL && s.x >= LINJAL ? 'topp' : s.x < LINJAL && s.y >= LINJAL ? 'venstre' : null;
      linjalHandler =
        side && e.pointerType !== 'touch' ? (siste.current.linjalverktoy?.(side) ?? null) : null;
      verktoyAktiv = true;
      aktivtVerktoy()?.ned?.(hendelse(e));
    };
    const flytt = (e: PointerEvent) => {
      if (pekere.has(e.pointerId)) pekere.set(e.pointerId, pos(e));
      if (klype && pekere.size >= 2) {
        const [a, bb] = [...pekere.values()] as [Vec2, Vec2];
        const avstand = Math.hypot(a.x - bb.x, a.y - bb.y);
        const midt = { x: (a.x + bb.x) / 2, y: (a.y + bb.y) / 2 };
        let u = zoomRundt(
          { ...benk.tilstand.utsnitt, zoom: klype.zoom },
          b,
          h,
          klype.midt,
          avstand / Math.max(1, klype.avstand),
        );
        const px = u.zoom * (96 / 25.4);
        u = {
          ...u,
          senterX: u.senterX - (midt.x - klype.midt.x) / px,
          senterY: u.senterY + (midt.y - klype.midt.y) / px,
        };
        benk.settUtsnitt(u);
        return;
      }
      if (pan) {
        const s = pos(e);
        const px = visning().pxPerMm;
        benk.settUtsnitt({
          senterX: pan.senter.x - (s.x - pan.start.x) / px,
          senterY: pan.senter.y + (s.y - pan.start.y) / px,
        });
        return;
      }
      aktivtVerktoy()?.flytt?.(hendelse(e));
    };
    const opp = (e: PointerEvent) => {
      pekere.delete(e.pointerId);
      if (klype) {
        if (pekere.size < 2) klype = null;
        return;
      }
      if (pan) {
        pan = null;
        oppdaterMarkor();
        return;
      }
      if (verktoyAktiv) {
        verktoyAktiv = false;
        const h = aktivtVerktoy();
        linjalHandler = null;
        h?.opp?.(hendelse(e));
      }
    };
    const avbryt = (e: PointerEvent) => {
      pekere.delete(e.pointerId);
      pan = null;
      klype = null;
      if (verktoyAktiv) aktivtVerktoy()?.avbryt?.();
      verktoyAktiv = false;
      linjalHandler = null;
    };
    const hjul = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey && !e.ctrlKey) {
        const px = visning().pxPerMm;
        benk.settUtsnitt({ senterX: benk.tilstand.utsnitt.senterX + (e.deltaY || e.deltaX) / px });
        return;
      }
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const faktor = Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015));
      benk.settUtsnitt(zoomRundt(benk.tilstand.utsnitt, b, h, pos(e), faktor));
    };
    const erSkrivefelt = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const tastNed = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !erSkrivefelt(e.target) && !mellomrom) {
        mellomrom = true;
        oppdaterMarkor();
        if (e.target === c) e.preventDefault();
      }
    };
    const tastOpp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        mellomrom = false;
        oppdaterMarkor();
      }
    };

    c.addEventListener('pointerdown', ned);
    c.addEventListener('pointermove', flytt);
    c.addEventListener('pointerup', opp);
    c.addEventListener('pointercancel', avbryt);
    c.addEventListener('wheel', hjul, { passive: false });
    window.addEventListener('keydown', tastNed);
    window.addEventListener('keyup', tastOpp);
    const markorLytter = benk.lytt(oppdaterMarkor);
    oppdaterMarkor();

    return () => {
      ro.disconnect();
      avLytt();
      markorLytter();
      tema.removeEventListener('change', nyeFarger);
      for (const [k, f] of kommandoer) if (benk.kommandoer.get(k) === f) benk.kommandoer.delete(k);
      c.removeEventListener('pointerdown', ned);
      c.removeEventListener('pointermove', flytt);
      c.removeEventListener('pointerup', opp);
      c.removeEventListener('pointercancel', avbryt);
      c.removeEventListener('wheel', hjul);
      window.removeEventListener('keydown', tastNed);
      window.removeEventListener('keyup', tastOpp);
    };
  }, [benk]);

  // props changed (tool, selection): redraw
  useEffect(() => {
    tegnNa.current();
    if (lerret.current) {
      lerret.current.style.cursor = panorer ? 'grab' : (verktoy?.markor ?? 'default');
    }
  });

  return (
    <div class="lerret" ref={vert}>
      <canvas
        ref={lerret}
        tabIndex={0}
        role="application"
        aria-roledescription="tegneflate"
        aria-label={etikett}
      />
      {children}
    </div>
  );
}

function tegnLinjaler(ctx: CanvasRenderingContext2D, v: Visning, f: Farger, markering: Boks | null): void {
  const { bredde: b, hoyde: h } = v;
  const niva = rutenettnivaa(v.pxPerMm, 8);
  ctx.fillStyle = f.plate;
  ctx.fillRect(0, 0, b, LINJAL);
  ctx.fillRect(0, 0, LINJAL, h);

  if (markering) {
    const a = v.tilSkjerm({ x: markering.minX, y: markering.maksY });
    const z = v.tilSkjerm({ x: markering.maksX, y: markering.minY });
    ctx.fillStyle = f.cyan;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(Math.max(LINJAL, a.x), 0, z.x - Math.max(LINJAL, a.x), LINJAL);
    ctx.fillRect(0, Math.max(LINJAL, a.y), LINJAL, z.y - Math.max(LINJAL, a.y));
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = f.linjeSterk;
  ctx.fillStyle = f.dempet;
  ctx.font = `10px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace'}`;
  ctx.textBaseline = 'top';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const a = v.tilModell({ x: LINJAL, y: h });
  const z = v.tilModell({ x: b, y: LINJAL });
  const smaa = niva.liten;
  for (let x = Math.ceil(a.x / smaa) * smaa; x <= z.x; x += smaa) {
    const sx = Math.round(v.tilSkjerm({ x, y: 0 }).x) + 0.5;
    const stor = Math.abs(x / niva.stor - Math.round(x / niva.stor)) < 1e-6;
    ctx.moveTo(sx, LINJAL);
    ctx.lineTo(sx, LINJAL - (stor ? 10 : 4));
    if (stor) ctx.fillText(linjalEtikett(x, niva.enhet), sx + 3, 3);
  }
  for (let y = Math.ceil(a.y / smaa) * smaa; y <= z.y; y += smaa) {
    const sy = Math.round(v.tilSkjerm({ x: 0, y }).y) + 0.5;
    const stor = Math.abs(y / niva.stor - Math.round(y / niva.stor)) < 1e-6;
    ctx.moveTo(LINJAL, sy);
    ctx.lineTo(LINJAL - (stor ? 10 : 4), sy);
    if (stor) {
      ctx.save();
      ctx.translate(3, sy - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(linjalEtikett(y, niva.enhet), 0, 0);
      ctx.restore();
    }
  }
  ctx.stroke();
  ctx.strokeStyle = f.linje;
  ctx.beginPath();
  ctx.moveTo(0, LINJAL + 0.5);
  ctx.lineTo(b, LINJAL + 0.5);
  ctx.moveTo(LINJAL + 0.5, 0);
  ctx.lineTo(LINJAL + 0.5, h);
  ctx.stroke();
  ctx.fillStyle = f.plate;
  ctx.fillRect(0, 0, LINJAL, LINJAL);
  ctx.fillStyle = f.dempet;
  ctx.fillText(niva.enhet, 3, 6);
}
