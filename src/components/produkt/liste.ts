/** Listing behaviour: category change in place (with history), sorting. */
import type { Sortering } from '@/lib/handel/katalog';
import { antallTekst, utvalgFor, type Sorteringsgrunnlag } from '@/lib/handel/sortering';
import { visUtvalg } from './kategoribytte';

interface Listedata {
  grunnlag: Sorteringsgrunnlag[];
  tekster: Record<string, { tittel: string; ingress: string; href: string }>;
}

export function startProduktliste(): void {
  const rot = document.querySelector<HTMLElement>('[data-produktliste]');
  const dataEl = document.querySelector('[data-produktliste-data]');
  const rutenett = rot?.querySelector<HTMLElement>('[data-produktrutenett]');
  if (!rot || !dataEl || !rutenett || rot.dataset.klar) return;
  rot.dataset.klar = '1';

  const data = JSON.parse(dataEl.textContent ?? '{}') as Listedata;
  const tittel = rot.querySelector<HTMLElement>('[data-liste-tittel]');
  const ingress = rot.querySelector<HTMLElement>('[data-liste-ingress]');
  const antall = rot.querySelector<HTMLElement>('[data-liste-antall]');
  const velger = rot.querySelector<HTMLSelectElement>('[data-liste-sortering]');
  const lenker = [...rot.querySelectorAll<HTMLAnchorElement>('[data-kategori]')];

  let kategori = rot.dataset.aktiv ?? 'alle';
  const fraUrl = new URLSearchParams(location.search).get('sortering');
  if (velger && fraUrl && [...velger.options].some((o) => o.value === fraUrl)) velger.value = fraUrl;
  let sortering = (velger?.value ?? 'utvalgt') as Sortering;

  function vis(): void {
    const n = visUtvalg(rutenett!, utvalgFor(data.grunnlag, kategori, sortering));
    const t = data.tekster[kategori];
    if (t) {
      if (tittel) tittel.textContent = t.tittel;
      if (ingress) ingress.textContent = t.ingress;
      document.title = kategori === 'alle' ? 'Produkter – Designporten' : `${t.tittel} – Designporten`;
    }
    if (antall) antall.textContent = antallTekst(n);
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

  window.addEventListener('popstate', (e) => {
    const k = (e.state as { kategori?: string } | null)?.kategori ?? rot.dataset.aktiv ?? 'alle';
    if (k === kategori) return;
    kategori = k;
    vis();
  });

  history.replaceState({ kategori }, '', location.href);
  if (sortering !== 'utvalgt') vis();
}
