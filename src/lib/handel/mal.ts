/**
 * The product template for the PHP build (one.com). Studio keeps the whole
 * catalogue in the CMS database, so a product can be added or changed after
 * the site was built. The build therefore renders one product page and one
 * card for this made-up product, with «§felt§» where a value goes and HTML
 * comments around the parts that depend on the product:
 *
 *   <!--hvis:felt--> … <!--/hvis:felt-->     kept only when the product has it
 *   <!--gjenta:felt--> … <!--/gjenta:felt-->  repeated once per entry
 *
 * php/api/_katalog.php fills it in for each product. The template never
 * reaches visitors: the build moves it to api/cms/maler/ (closed to the web).
 * The Node build (local development) never renders it.
 */
import type { ProduktVisning } from './visning';

export const MAL_ID = 'mal';

/** Whether this build renders the template (the PHP build only). */
export const lagerMal = import.meta.env.PUBLIC_DP_PHP === 'true';

const f = (felt: string) => `§${felt}§`;

/** Marks a part of the template that is kept only when the product has `felt`. */
export const hvis = (felt: string, slutt = false) => `<!--${slutt ? '/' : ''}hvis:${felt}-->`;
/** Marks a part of the template that is repeated for every entry of `felt`. */
export const gjenta = (felt: string, slutt = false) => `<!--${slutt ? '/' : ''}gjenta:${felt}-->`;

export const malfelt = f;

/** The made-up product. Every optional part is present so the template has it. */
export const malprodukt: ProduktVisning = {
  id: f('id'),
  navn: f('navn'),
  status: 'bekreftet',
  kategori: f('kategori'),
  kategoriNavn: f('kategoriNavn'),
  kortBeskrivelse: f('kortBeskrivelse'),
  href: f('href'),
  bilde: {
    src: f('bilde.src'),
    alt: f('bilde.alt'),
    bredde: 900,
    hoyde: 900,
    konsept: true,
    midlertidig: false,
  },
  bildeAlternativ: {
    src: f('alt.src'),
    alt: f('alt.alt'),
    bredde: 900,
    hoyde: 900,
    konsept: true,
    midlertidig: false,
  },
  mal: { bredde: 1, dybde: 1, hoyde: 1 },
  prisOre: 100,
  materialer: [{ type: f('m.type'), beskrivelse: f('m.beskrivelse') }],
  farger: [{ id: f('f.id'), navn: f('f.navn'), hex: '#000000' }],
  egenTekst: { maksTegn: 1, tilleggOre: null },
  generator: f('generator'),
};

/**
 * What the template's choices island gets: only the id. It renders in the
 * browser (client:only) from Studio's catalogue, and its props are JSON the
 * server must not fill in (a quote in a name would break it).
 */
export const malValg: ProduktVisning = {
  ...malprodukt,
  navn: '',
  kategori: '',
  kategoriNavn: '',
  kortBeskrivelse: '',
  href: '',
  bilde: { ...malprodukt.bilde, src: '', alt: '' },
  bildeAlternativ: null,
  materialer: [],
  farger: [],
  generator: null,
};
