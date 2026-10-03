/**
 * Listing behaviour: category change in place (with history), colour /
 * material / text filters, sorting, and the filter column that becomes a
 * bottom sheet below 1024 px.
 */
import type { Sortering } from '@/lib/handel/katalog';
import {
  antallAktiveFilter,
  antallTekst,
  utvalgFor,
  type Filter,
  type Sorteringsgrunnlag,
} from '@/lib/handel/sortering';
import { visUtvalg } from './kategoribytte';

interface Listedata {
  grunnlag: Sorteringsgrunnlag[];
  tekster: Record<string, { tittel: string; ingress: string; href: string }>;
}

const bred = window.matchMedia('(min-width: 1024px)');

export function startProduktliste(): void {
  const rot = document.querySelector<HTMLElement>('[data-produktliste]');
  const dataEl = document.querySelector('[data-produktliste-data]');
  const rutenett = rot?.querySelector<HTMLElement>('[data-produktrutenett]');
  if (!rot || !dataEl || !rutenett || rot.dataset.klar) return;
  rot.dataset.klar = '1';

  const data = JSON.parse(dataEl.textContent ?? '{}') as Listedata;
  const $ = <T extends Element>(s: string) => rot.querySelector<T>(s);
  const $$ = <T extends Element>(s: string) => [...rot.querySelectorAll<T>(s)];
  const tittel = $<HTMLElement>('[data-liste-tittel]');
  const ingress = $<HTMLElement>('[data-liste-ingress]');
  const antallEl = $$<HTMLElement>(
    '[data-liste-antall], [data-liste-antall-smal], [data-liste-antall-knapp]',
  );
  const tom = $<HTMLElement>('[data-liste-tom]');
  const velger = $<HTMLSelectElement>('[data-liste-sortering]');
  const lenker = $$<HTMLAnchorElement>('[data-kategori]');
  const farger = $$<HTMLInputElement>('[data-filter-farge]');
  const materialer = $$<HTMLInputElement>('[data-filter-materiale]');
  const tekst = $<HTMLInputElement>('[data-filter-tekst]');
  const teller = $<HTMLElement>('[data-filter-teller]');
  const nullstill = $<HTMLButtonElement>('[data-filter-nullstill]');
  const panel = $<HTMLElement>('[data-filter]');
  const ark = $<HTMLDialogElement>('[data-filterark]');
  const apneKnapp = $<HTMLButtonElement>('[data-filter-apne]');

  let kategori = rot.dataset.aktiv ?? 'alle';
  const sok = new URLSearchParams(location.search);
  const fraUrl = sok.get('sortering');
  if (velger && fraUrl && [...velger.options].some((o) => o.value === fraUrl)) velger.value = fraUrl;
  let sortering = (velger?.value ?? 'utvalgt') as Sortering;

  function filter(): Filter {
    return {
      farger: farger.filter((f) => f.checked).map((f) => f.value),
      materialer: materialer.filter((m) => m.checked).map((m) => m.value),
      egenTekst: !!tekst?.checked,
    };
  }

  function vis(): void {
    const f = filter();
    const n = visUtvalg(rutenett!, utvalgFor(data.grunnlag, kategori, sortering, f));
    const t = data.tekster[kategori];
    if (t) {
      if (tittel) tittel.textContent = t.tittel;
      if (ingress) ingress.textContent = t.ingress;
      document.title = `${t.tittel} – Designporten`;
    }
    antallEl.forEach((el) => (el.textContent = antallTekst(n)));
    if (tom) tom.hidden = n > 0;
    const aktive = antallAktiveFilter(f);
    if (teller) {
      teller.textContent = String(aktive);
      teller.hidden = aktive === 0;
    }
    if (nullstill) nullstill.disabled = aktive === 0;
    for (const a of lenker) {
      if (a.dataset.kategori === kategori) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }

  function url(): string {
    const base = data.tekster[kategori]?.href ?? '/produkter/';
    return sortering === 'utvalgt' ? base : `${base}?sortering=${sortering}`;
  }

  for (const a of lenker) {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const ny = a.dataset.kategori ?? 'alle';
      e.preventDefault();
      if (ny === kategori) return;
      kategori = ny;
      vis();
      history.pushState({ kategori }, '', url());
    });
  }

  velger?.addEventListener('change', () => {
    sortering = velger.value as Sortering;
    vis();
    history.replaceState({ kategori }, '', url());
  });

  [...farger, ...materialer, ...(tekst ? [tekst] : [])].forEach((el) => el.addEventListener('change', vis));

  const tilbakestill = () => {
    [...farger, ...materialer, ...(tekst ? [tekst] : [])].forEach((el) => (el.checked = false));
    vis();
  };
  nullstill?.addEventListener('click', tilbakestill);
  $('[data-filter-nullstill-tom]')?.addEventListener('click', tilbakestill);

  window.addEventListener('popstate', (e) => {
    const k = (e.state as { kategori?: string } | null)?.kategori ?? rot.dataset.aktiv ?? 'alle';
    if (k === kategori) return;
    kategori = k;
    vis();
  });

  // The filter: a sticky column on desktop; below 1024 px the same panel moves
  // into a modal sheet while it is open, and back into the page when it closes.
  const hjem = panel?.parentElement ?? null;
  const etter = panel?.nextSibling ?? null;
  function tilbake(): void {
    if (panel && hjem && panel.parentElement !== hjem) hjem.insertBefore(panel, etter);
  }
  bred.addEventListener('change', () => {
    if (bred.matches && ark?.open) ark.close();
  });
  apneKnapp?.addEventListener('click', () => {
    if (!ark || !panel) return;
    ark.append(panel);
    ark.showModal();
    apneKnapp.setAttribute('aria-expanded', 'true');
  });
  ark?.addEventListener('close', () => {
    tilbake();
    apneKnapp?.setAttribute('aria-expanded', 'false');
    if (!bred.matches) apneKnapp?.focus();
  });
  $('[data-filter-lukk]')?.addEventListener('click', () => ark?.close());
  $('[data-filter-ferdig]')?.addEventListener('click', () => ark?.close());
  ark?.addEventListener('click', (e) => {
    // A click on the backdrop lands on the dialog element, outside its box.
    if (e.target !== ark) return;
    const r = ark.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) ark.close();
  });

  history.replaceState({ kategori }, '', location.href);
  if (sortering !== 'utvalgt') vis();
}
