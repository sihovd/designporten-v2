import { nettsti } from '@/lib/nettsti';
/** Site structure. Source: docs/content/information-architecture.md. */

import { skaperverkstedApent } from '@/lib/flagg';

export interface NavPunkt {
  navn: string;
  href: string;
  /** The three paths stay visible at every desktop width. */
  sti?: boolean;
}

const alleMenypunkter: readonly NavPunkt[] = [
  { navn: 'Vårt utvalg', href: nettsti('/produkter/'), sti: true },
  { navn: 'Skaperverksted', href: nettsti('/skaperverksted/'), sti: true },
  { navn: 'Spesialdesign', href: nettsti('/spesialdesign/'), sti: true },
  { navn: 'For bedrifter', href: nettsti('/bedrift/') },
  { navn: 'Inspirasjon', href: nettsti('/inspirasjon/') },
  { navn: 'Om', href: nettsti('/om/') },
  { navn: 'Kontakt', href: nettsti('/kontakt/') },
];

export const hovedmeny: readonly NavPunkt[] = alleMenypunkter.filter(
  (p) => skaperverkstedApent || p.href !== nettsti('/skaperverksted/'),
);

export const juridisk: readonly NavPunkt[] = [
  { navn: 'Personvern', href: nettsti('/personvern/') },
  { navn: 'Vilkår', href: nettsti('/vilkar/') },
  { navn: 'Frakt og levering', href: nettsti('/frakt-og-levering/') },
];

/** True when `sti` (current path) is inside the section `href`. */
export function erAktiv(href: string, sti: string): boolean {
  if (href === '/') return sti === '/';
  return sti === href || sti.startsWith(href);
}
