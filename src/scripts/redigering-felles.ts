/** Shared by both inline editors: the GitHub one (redigeringsverktoy.ts) and the CMS one (cmsverktoy.ts). */
import { normaliser, type Felttype } from '@/lib/redigering/kjerne';

export const typeFor = (el: HTMLElement): Felttype =>
  el.dataset.redigerType === 'avsnitt' ? 'avsnitt' : 'linje';

/** innerText needs layout; textContent keeps the stored form for hidden elements. */
export function lesTekst(el: HTMLElement, type: Felttype): string {
  const synlig = el.getClientRects().length > 0;
  if (type === 'avsnitt' && !synlig) {
    const avsnitt = [...el.querySelectorAll('p')].map((p) => p.textContent ?? '');
    return normaliser(avsnitt.length ? avsnitt.join('\n\n') : (el.textContent ?? ''), type);
  }
  return normaliser(synlig ? el.innerText : (el.textContent ?? ''), type);
}

export function skrivTekst(el: HTMLElement, tekst: string, type: Felttype) {
  if (type === 'linje') {
    el.textContent = tekst;
    return;
  }
  el.replaceChildren(
    ...tekst.split('\n\n').map((a) => {
      const p = document.createElement('p');
      p.textContent = a;
      return p;
    }),
  );
}

export function lagKnapp(tekst: string, klasse: string, handling: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `dp-red__knapp ${klasse}`;
  b.textContent = tekst;
  b.addEventListener('click', handling);
  return b;
}

export const flertall = (n: number, en: string, flere: string) => `${n} ${n === 1 ? en : flere}`;

/** Turn the marked texts into editable fields, or back. */
export function settRedigerbar(elementer: HTMLElement[], pa: boolean) {
  for (const el of elementer) {
    if (pa) {
      try {
        el.contentEditable = 'plaintext-only';
      } catch {
        el.contentEditable = 'true';
      }
      el.spellcheck = true;
    } else {
      el.removeAttribute('contenteditable');
    }
  }
}

/**
 * Typing, keys, paste and clicks while editing: plain text only, no line
 * breaks in one-line fields, Ctrl/Cmd+S saves, and a click on a text inside a
 * link or button edits it instead of following it.
 */
export function lyttEtterRedigering(o: {
  erPa: () => boolean;
  erFelt: (el: HTMLElement) => boolean;
  bar: HTMLElement;
  vedEndring: (el: HTMLElement) => void;
  vedLagre: () => void;
}) {
  const felt = (e: Event): HTMLElement | null => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-rediger]') ?? null;
    return el && o.erFelt(el) ? el : null;
  };

  document.addEventListener('input', (e) => {
    const el = felt(e);
    if (el && o.erPa()) o.vedEndring(el);
  });

  document.addEventListener('keydown', (e) => {
    if (!o.erPa()) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      o.vedLagre();
      return;
    }
    const el = felt(e);
    if (!el) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      el.blur();
    } else if (e.key === 'Enter' && typeFor(el) === 'linje') {
      e.preventDefault();
    }
  });

  // Plain text only, also where contenteditable="plaintext-only" is missing.
  document.addEventListener('paste', (e) => {
    if (!o.erPa() || !felt(e)) return;
    const tekst = e.clipboardData?.getData('text/plain');
    if (tekst === undefined) return;
    e.preventDefault();
    document.execCommand('insertText', false, tekst);
  });

  window.addEventListener(
    'click',
    (e) => {
      if (!o.erPa()) return;
      const mal = e.target as Element | null;
      const handling = mal?.closest?.('a, button');
      if (!handling || o.bar.contains(handling)) return;
      const inni =
        mal?.closest?.<HTMLElement>('[data-rediger]') ??
        handling.querySelector<HTMLElement>('[data-rediger]');
      if (!inni || !o.erFelt(inni)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!inni.contains(document.activeElement)) inni.focus();
    },
    true,
  );
}
