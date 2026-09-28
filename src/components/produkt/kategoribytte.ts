/**
 * Category change and re-sorting for the product grid (preserved work,
 * docs/design/interaction-and-motion.md#product-cards-and-grid):
 *  - cards that stay glide to their new place (FLIP, 460 ms);
 *  - cards that leave fall backwards, rotate slightly and fade (540 ms);
 *  - new cards rise in (360 ms).
 * With reduced motion the new set simply crossfades in.
 */

const FLYT_MS = 460;
const RYDD_MS = 620;

let ryddTimer: number | undefined;

function rydd(rutenett: HTMLElement): void {
  rutenett.querySelectorAll('.produktrutenett__faller').forEach((el) => el.remove());
  rutenett.querySelectorAll<HTMLElement>('[data-plass]').forEach((el) => {
    el.style.transition = '';
    el.style.transform = '';
    el.classList.remove('produktrutenett__kommer', 'produktrutenett__stille');
  });
}

/**
 * Shows exactly the ids in `rekkefolge`, in that order, animating the change.
 * Returns the number of visible cards.
 */
export function visUtvalg(rutenett: HTMLElement, rekkefolge: string[]): number {
  window.clearTimeout(ryddTimer);
  rydd(rutenett);

  const stille = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plasser = new Map(
    [...rutenett.querySelectorAll<HTMLElement>('[data-plass]')].map((el) => [el.dataset.plass!, el]),
  );
  const synlige = new Set(rekkefolge);
  const rutenettRekt = rutenett.getBoundingClientRect();

  // First: where every visible card is now.
  const for_ = new Map<string, DOMRect>();
  for (const [id, el] of plasser) if (!el.hidden) for_.set(id, el.getBoundingClientRect());

  // Leaving cards stay behind as inert copies that fall away.
  for (const [id, el] of plasser) {
    if (el.hidden || synlige.has(id)) continue;
    if (!stille) {
      const r = for_.get(id)!;
      const kopi = el.cloneNode(true) as HTMLElement;
      kopi.removeAttribute('data-plass');
      kopi.classList.add('produktrutenett__faller');
      kopi.setAttribute('aria-hidden', 'true');
      kopi.inert = true;
      Object.assign(kopi.style, {
        left: `${r.left - rutenettRekt.left}px`,
        top: `${r.top - rutenettRekt.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      rutenett.append(kopi);
    }
    el.hidden = true;
  }

  // New order; falling copies stay at the end of the list.
  const forsteKopi = rutenett.querySelector('.produktrutenett__faller');
  for (const id of rekkefolge) {
    const el = plasser.get(id);
    if (!el) continue;
    rutenett.insertBefore(el, forsteKopi);
  }
  for (const [id, el] of plasser) {
    if (!synlige.has(id)) rutenett.insertBefore(el, forsteKopi);
  }

  const nye: HTMLElement[] = [];
  for (const id of rekkefolge) {
    const el = plasser.get(id);
    if (!el) continue;
    const varSynlig = for_.has(id);
    el.hidden = false;
    if (stille) {
      if (!varSynlig) el.classList.add('produktrutenett__stille');
      continue;
    }
    if (!varSynlig) {
      el.classList.add('produktrutenett__kommer');
      continue;
    }
    // Invert: put the card back where it was, then let it glide.
    const gml = for_.get(id)!;
    const na = el.getBoundingClientRect();
    const dx = gml.left - na.left;
    const dy = gml.top - na.top;
    if (dx || dy) {
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      nye.push(el);
    }
  }

  if (nye.length) {
    // Force the inverted position to apply before the transition starts.
    void rutenett.offsetWidth;
    requestAnimationFrame(() => {
      for (const el of nye) {
        el.style.transition = `transform ${FLYT_MS}ms var(--ease-ut)`;
        el.style.transform = '';
      }
    });
  }

  ryddTimer = window.setTimeout(() => rydd(rutenett), RYDD_MS);
  return rekkefolge.filter((id) => plasser.has(id)).length;
}
