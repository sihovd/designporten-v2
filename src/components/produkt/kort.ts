/**
 * Behaviour for every product card on the page: the cart capsule (+/−, count)
 * and opening the product window. Runs once per page; safe to call again.
 */
import { hentKurv, leggTil, linjeNokkel, lyttPaKurv, settAntall, type KurvLinje } from '@/lib/handel/kurv';
import { beregnPris, valgTilPoster } from '@/lib/handel/pris';
import type { ProduktVisning } from '@/lib/handel/visning';
import { kunngjor } from './kunngjoring';

export interface Produktvindu {
  apne(produkt: ProduktVisning, kilde: HTMLElement): void;
}

declare global {
  interface Window {
    dpProduktvindu?: Produktvindu;
  }
}

function lesProdukt(kort: HTMLElement): ProduktVisning | null {
  try {
    return JSON.parse(kort.dataset.produkt ?? '') as ProduktVisning;
  } catch {
    return null;
  }
}

/** Default choices: the first colour and material the product lists. */
export function standardValg(p: ProduktVisning) {
  return { farge: p.farger[0]?.id ?? '', materiale: p.materialer[0]?.type ?? '' };
}

export function antallAvProdukt(produktId: string, linjer: KurvLinje[] = hentKurv()): number {
  return linjer.filter((l) => l.produktId === produktId).reduce((s, l) => s + l.antall, 0);
}

function leggTilStandard(p: ProduktVisning): void {
  const valg = standardValg(p);
  leggTil({
    produktId: p.id,
    navn: p.navn,
    antall: 1,
    enhetspris: beregnPris(p, valg),
    valg: valgTilPoster(valg),
  });
}

/** Removes one of the product: from the default-choice line first, else the newest line. */
function taUtEn(p: ProduktVisning): void {
  const linjer = hentKurv().filter((l) => l.produktId === p.id);
  if (linjer.length === 0) return;
  const standard = linjeNokkel(p.id, valgTilPoster(standardValg(p)));
  const linje = linjer.find((l) => l.nokkel === standard) ?? linjer[linjer.length - 1]!;
  settAntall(linje.nokkel, linje.antall - 1);
}

const beroring = () => window.matchMedia('(hover: none)').matches;

function oppdaterKort(kort: HTMLElement, linjer: KurvLinje[]): void {
  const id = kort.dataset.produktId ?? '';
  const n = antallAvProdukt(id, linjer);
  const kapsel = kort.querySelector<HTMLElement>('[data-kurvkapsel]');
  const merke = kort.querySelector<HTMLElement>('[data-kurv-merke]');
  const antall = kort.querySelector<HTMLElement>('[data-kurv-antall]');
  const minus = kort.querySelector<HTMLButtonElement>('[data-kurv-minus]');
  if (merke) {
    merke.textContent = String(n);
    merke.hidden = n === 0;
  }
  if (antall) {
    antall.textContent = String(n);
    antall.hidden = n === 0;
    antall.setAttribute('aria-label', `${n} i handlekurven`);
  }
  if (minus) {
    // Never show a «−» that can do nothing. Move focus to «+» if it had it.
    if (n === 0 && document.activeElement === minus) {
      kort.querySelector<HTMLButtonElement>('[data-kurv-pluss]')?.focus();
    }
    minus.hidden = n === 0;
  }
  if (kapsel && beroring()) kapsel.toggleAttribute('data-apen', n > 0);
}

function kobleKort(kort: HTMLElement): void {
  if (kort.dataset.klar) return;
  kort.dataset.klar = '1';
  const p = lesProdukt(kort);
  if (!p) return;
  const kapsel = kort.querySelector<HTMLElement>('[data-kurvkapsel]');

  const apne = () => kapsel?.setAttribute('data-apen', '');
  const lukk = () => {
    if (!kapsel || kapsel.contains(document.activeElement)) return;
    if (beroring() && antallAvProdukt(p.id) > 0) return;
    kapsel.removeAttribute('data-apen');
  };
  kort.addEventListener('mouseenter', () => !beroring() && apne());
  kort.addEventListener('mouseleave', lukk);
  kapsel?.addEventListener('focusin', apne);
  kapsel?.addEventListener('focusout', () => requestAnimationFrame(lukk));

  kort.querySelector('[data-kurv-pluss]')?.addEventListener('click', () => {
    leggTilStandard(p);
    kunngjor(`${p.navn} er lagt i handlekurven. ${antallAvProdukt(p.id)} i kurven.`);
  });
  kort.querySelector('[data-kurv-minus]')?.addEventListener('click', () => {
    taUtEn(p);
    const n = antallAvProdukt(p.id);
    kunngjor(n > 0 ? `Én ${p.navn} tatt ut. ${n} igjen i kurven.` : `${p.navn} er fjernet fra handlekurven.`);
  });

  kort.querySelector<HTMLAnchorElement>('[data-produktlenke]')?.addEventListener('click', (e) => {
    const vindu = window.dpProduktvindu;
    // Modifier clicks open the product page as usual.
    if (!vindu || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    vindu.apne(p, e.currentTarget as HTMLElement);
  });
}

let lytter: (() => void) | null = null;

export function startProduktkort(rot: ParentNode = document): void {
  const kort = [...rot.querySelectorAll<HTMLElement>('[data-produktkort]')];
  const linjer = hentKurv();
  for (const k of kort) {
    kobleKort(k);
    oppdaterKort(k, linjer);
  }
  if (!lytter) {
    lytter = lyttPaKurv((l) => {
      document.querySelectorAll<HTMLElement>('[data-produktkort]').forEach((k) => oppdaterKort(k, l));
    });
  }
}
