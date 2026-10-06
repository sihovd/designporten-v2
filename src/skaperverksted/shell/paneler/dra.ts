/**
 * Pointer drags with capture and Escape to cancel. The element that got the
 * pointer-down keeps the pointer until the drag ends, also outside the window.
 */
export interface DraValg {
  /** Pixels the pointer must move before a drag starts (below that it is a click). */
  terskel?: number;
  start?: (e: PointerEvent) => void;
  flytt: (dx: number, dy: number, e: PointerEvent) => void;
  slutt: (dx: number, dy: number, e: PointerEvent, avbrutt: boolean) => void;
}

export function startDra(e: PointerEvent, valg: DraValg): void {
  const el = e.currentTarget as HTMLElement;
  const sx = e.clientX;
  const sy = e.clientY;
  const terskel = valg.terskel ?? 0;
  let i_gang = terskel === 0;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* the pointer is already gone */
  }
  if (i_gang) valg.start?.(e);

  const rydd = () => {
    el.removeEventListener('pointermove', flytt);
    el.removeEventListener('pointerup', opp);
    el.removeEventListener('pointercancel', avbryt);
    window.removeEventListener('keydown', tast, true);
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };
  const flytt = (ev: PointerEvent) => {
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    if (!i_gang) {
      if (Math.hypot(dx, dy) < terskel) return;
      i_gang = true;
      valg.start?.(ev);
    }
    valg.flytt(dx, dy, ev);
  };
  const opp = (ev: PointerEvent) => {
    rydd();
    if (i_gang) valg.slutt(ev.clientX - sx, ev.clientY - sy, ev, false);
  };
  const avbryt = (ev: PointerEvent) => {
    rydd();
    if (i_gang) valg.slutt(ev.clientX - sx, ev.clientY - sy, ev, true);
  };
  const tast = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    rydd();
    if (i_gang) valg.slutt(0, 0, e, true);
  };
  el.addEventListener('pointermove', flytt);
  el.addEventListener('pointerup', opp);
  el.addEventListener('pointercancel', avbryt);
  window.addEventListener('keydown', tast, true);
}
