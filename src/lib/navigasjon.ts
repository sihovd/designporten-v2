/** Site structure. Source: docs/content/information-architecture.md. */

import { skaperverkstedApent } from '@/lib/flagg';

export interface NavPunkt {
  navn: string;
  href: string;
  /** The three paths stay visible at every desktop width. */
  sti?: boolean;
}

const alleMenypunkter: readonly NavPunkt[] = [
  { navn: 'Vårt utvalg', href: '/produkter/', sti: true },
  { navn: 'Skaperverksted', href: '/skaperverksted/', sti: true },
  { navn: 'Spesialdesign', href: '/spesialdesign/', sti: true },
  { navn: 'For bedrifter', href: '/bedrift/' },
  { navn: 'Inspirasjon', href: '/inspirasjon/' },
  { navn: 'Om', href: '/om/' },
  { navn: 'Kontakt', href: '/kontakt/' },
];

export const hovedmeny: readonly NavPunkt[] = alleMenypunkter.filter(
  (p) => skaperverkstedApent || p.href !== '/skaperverksted/',
);

export const juridisk: readonly NavPunkt[] = [
  { navn: 'Personvern', href: '/personvern/' },
  { navn: 'Vilkår', href: '/vilkar/' },
  { navn: 'Frakt og levering', href: '/frakt-og-levering/' },
];

/** True when `sti` (current path) is inside the section `href`. */
export function erAktiv(href: string, sti: string): boolean {
  if (href === '/') return sti === '/';
  return sti === href || sti.startsWith(href);
}
