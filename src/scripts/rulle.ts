/**
 * Scroll-linked progress for the site's few scroll sequences
 * (interaction-and-motion.md#scroll-sequences).
 *
 * An element with `data-rulle="<modus>"` gets the custom property `--p`
 * (0–1) while it is near the viewport. Components animate transforms and
 * opacity from `--p` in CSS, or subscribe with `folgRulling` for the rare
 * case that needs JavaScript.
 *
 *   fest     a tall track with a sticky child: 0 when the track's top reaches
 *            the top of the viewport, 1 when its bottom reaches the bottom.
 *            Falls back to `ut` when the track is no taller than the viewport
 *            (phones, where sequences are not pinned).
 *   inn      the element entering: 0 when its top meets the bottom of the
 *            viewport, 1 when its top is 30 % from the top.
 *   gjennom  the whole passage: 0 entering at the bottom, 1 leaving at the top.
 *   ut       the element leaving: 0 at the top of the viewport, 1 when 70 %
 *            of it has scrolled past.
 *
 * `data-rulle-smal="<modus>"` sets a different mode below 1024 px, so a
 * sequence pinned on desktop can play over a short, unpinned distance on
 * phones and tablets.
 *
 * Only normal document scroll drives anything: no wheel or touch handling.
 * Positions are measured on load and resize, never during scroll, and
 * updates run in one requestAnimationFrame for elements that are on screen.
 * With reduced motion no listener is attached and `--p` is set to the
 * element's `data-rulle-rolig` value (default 1), so every sequence shows
 * a complete, readable state.
 */

type Modus = 'fest' | 'inn' | 'gjennom' | 'ut';
type Lytter = (p: number) => void;

interface Spor {
  el: HTMLElement;
  modus: Modus;
  start: number;
  slutt: number;
  p: number;
  synlig: boolean;
  lyttere: Lytter[];
}

const spor = new Map<HTMLElement, Spor>();
const rolig = window.matchMedia('(prefers-reduced-motion: reduce)');
let planlagt = false;
let observator: IntersectionObserver | null = null;
let startet = false;

function maal(s: Spor): void {
  const r = s.el.getBoundingClientRect();
  const topp = r.top + window.scrollY;
  const vh = window.innerHeight;
  const smal = s.el.dataset.rulleSmal as Modus | undefined;
  let modus = smal && window.innerWidth < 1024 ? smal : s.modus;
  if (modus === 'fest' && r.height - vh < 8) modus = 'ut';
  switch (modus) {
    case 'fest':
      s.start = topp;
      s.slutt = topp + r.height - vh;
      break;
    case 'inn':
      s.start = topp - vh;
      s.slutt = topp - vh * 0.3;
      break;
    case 'gjennom':
      s.start = topp - vh;
      s.slutt = topp + r.height;
      break;
    case 'ut':
      s.start = topp;
      s.slutt = topp + Math.max(r.height * 0.7, 1);
      break;
  }
}

function sett(s: Spor, p: number): void {
  if (Math.abs(p - s.p) < 0.0005) return;
  s.p = p;
  s.el.style.setProperty('--p', p.toFixed(4));
  for (const l of s.lyttere) l(p);
}

function oppdater(): void {
  planlagt = false;
  const y = window.scrollY;
  for (const s of spor.values()) {
    if (!s.synlig) continue;
    const p = Math.min(1, Math.max(0, (y - s.start) / (s.slutt - s.start || 1)));
    sett(s, p);
  }
}

function planlegg(): void {
  if (!planlagt) {
    planlagt = true;
    requestAnimationFrame(oppdater);
  }
}

function maalAlle(): void {
  spor.forEach(maal);
  planlegg();
}

function roligTilstand(s: Spor): void {
  const v = Number(s.el.dataset.rulleRolig ?? '1');
  s.p = -1;
  sett(s, Number.isFinite(v) ? v : 1);
}

function start(): void {
  if (startet) return;
  startet = true;
  observator = new IntersectionObserver(
    (oppforinger) => {
      for (const o of oppforinger) {
        const s = spor.get(o.target as HTMLElement);
        if (s) s.synlig = o.isIntersecting;
      }
      planlegg();
    },
    { rootMargin: '25% 0px' },
  );
  spor.forEach((s) => observator!.observe(s.el));
  window.addEventListener('scroll', planlegg, { passive: true });
  window.addEventListener('resize', maalAlle);
  new ResizeObserver(maalAlle).observe(document.body);
  maalAlle();
}

function stopp(): void {
  if (!startet) return;
  startet = false;
  observator?.disconnect();
  observator = null;
  window.removeEventListener('scroll', planlegg);
  window.removeEventListener('resize', maalAlle);
  spor.forEach(roligTilstand);
}

/** Register every `[data-rulle]` under `rot` (idempotent). */
export function startRulling(rot: ParentNode = document): void {
  rot.querySelectorAll<HTMLElement>('[data-rulle]').forEach((el) => {
    if (spor.has(el)) return;
    const s: Spor = {
      el,
      modus: (el.dataset.rulle as Modus) || 'gjennom',
      start: 0,
      slutt: 1,
      p: -1,
      synlig: false,
      lyttere: [],
    };
    spor.set(el, s);
    if (rolig.matches) roligTilstand(s);
    else if (startet) {
      observator?.observe(el);
      maal(s);
    }
  });
  if (!rolig.matches) start();
}

/**
 * Call `lytter` with the element's progress whenever it changes (and once
 * with the current value). Returns an unsubscribe function.
 */
export function folgRulling(el: HTMLElement, lytter: Lytter): () => void {
  if (!spor.has(el)) startRulling(el.parentElement ?? document);
  const s = spor.get(el);
  if (!s) return () => {};
  s.lyttere.push(lytter);
  if (s.p >= 0) lytter(s.p);
  return () => {
    s.lyttere = s.lyttere.filter((l) => l !== lytter);
  };
}

rolig.addEventListener('change', () => (rolig.matches ? stopp() : start()));
