/**
 * Icon registry for the workspace. Every icon is one entry in `ikoner`, so a
 * single icon (or the whole set) can be replaced without touching a toolbar,
 * a panel or any tool logic: change the SVG file, or call `byttIkoner`.
 *
 * The 92 Sign Forge icons are Sivert's own set (docs/design/signgen-ikoner).
 * The files in `ikonsvg/` are used as they are, one file per icon, inlined
 * as SVG so size, colour (`currentColor`), hover and active state are set by
 * the UI. Icons the set does not have (rectangle, ellipse, polygon, hole,
 * decor and the panel chrome) use temporary plain line icons, marked below.
 * An icon never means a feature: buttons keep their own accessible name.
 */
import type { JSX } from 'preact';

const filer = import.meta.glob('./ikonsvg/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The inside of each SVG file (the shared attributes are set by `Ikon`). */
const pakke: Record<string, string> = {};
for (const [sti, tekst] of Object.entries(filer)) {
  const id = sti.replace(/^.*\//, '').replace(/\.svg$/, '');
  pakke[id] = tekst
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .trim();
}

export type PakkeIkon =
  | 'select'
  | 'text'
  | 'shapes'
  | 'pen'
  | 'paint'
  | 'svg-import'
  | 'image'
  | 'ruler'
  | 'pan'
  | 'snap'
  | 'grid'
  | 'guides'
  | 'snap-object'
  | 'snap-guide'
  | 'layers'
  | 'group'
  | 'ungroup'
  | 'duplicate'
  | 'copy'
  | 'paste'
  | 'bring-forward'
  | 'send-backward'
  | 'align'
  | 'distribute'
  | 'union'
  | 'subtract'
  | 'intersect'
  | 'exclude'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'cut'
  | 'properties'
  | 'history'
  | 'transform'
  | 'lock'
  | 'unlock'
  | 'visible'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'actual-size'
  | 'cube'
  | 'color'
  | 'eyedropper'
  | 'fill'
  | 'stroke'
  | 'gradient'
  | 'palette'
  | 'filaments'
  | 'color-library'
  | 'settings'
  | 'smooth'
  | 'taper'
  | 'width'
  | 'pressure'
  | 'edit-point'
  | 'add-point'
  | 'remove-point'
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'save-template'
  | 'share-template'
  | 'export'
  | 'csv'
  | 'three-mf'
  | 'print-preview'
  | 'templates'
  | 'favorites'
  | 'store'
  | 'adjustments'
  | 'color-groups'
  | 'columns'
  | 'export-three-mf'
  | 'filter'
  | 'generate'
  | 'generate-stl'
  | 'import-csv'
  | 'license'
  | 'link-fields'
  | 'plate-layout'
  | 'plates-sorted'
  | 'premium'
  | 'preview'
  | 'print-queue'
  | 'printer-profile'
  | 'rows'
  | 'rules'
  | 'search'
  | 'send-printer';

/** Temporary line icons for what the set does not cover (D-3: functional glyphs only). */
export type MidlertidigIkon =
  | 'rektangel'
  | 'ellipse'
  | 'polygon'
  | 'trekant'
  | 'hull'
  | 'dekor'
  | 'meny'
  | 'minimer'
  | 'gjenopprett'
  | 'lukk'
  | 'dokk-venstre'
  | 'dokk-hoyre'
  | 'flyt'
  | 'paneler';

export type IkonId = PakkeIkon | MidlertidigIkon;

/** An icon is SVG markup (the inside of a 24 × 24 SVG) or a function that draws it. */
type Tegning = string | (() => JSX.Element);

const midlertidige: Record<MidlertidigIkon, () => JSX.Element> = {
  rektangel: () => <rect x="4" y="6.5" width="16" height="11" rx="1" />,
  ellipse: () => <ellipse cx="12" cy="12" rx="8" ry="6" />,
  polygon: () => <path d="M12 4l7 4v8l-7 4-7-4V8z" />,
  trekant: () => <path d="M12 5l8 14H4z" />,
  hull: () => (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  dekor: () => <path d="M12 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  meny: () => (
    <>
      <circle cx="6" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18" cy="12" r="1" />
    </>
  ),
  minimer: () => <path d="M6 12h12" />,
  gjenopprett: () => <path d="M7 10l5 5 5-5" />,
  lukk: () => <path d="M7 7l10 10M17 7L7 17" />,
  'dokk-venstre': () => (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M10 5v14" />
    </>
  ),
  'dokk-hoyre': () => (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M14 5v14" />
    </>
  ),
  flyt: () => (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <rect x="8" y="9" width="8" height="6" rx="0.5" />
    </>
  ),
  paneler: () => (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M4 10h16M10 10v9" />
    </>
  ),
};

export const ikoner: Record<string, Tegning> = { ...pakke, ...midlertidige };

/** Replace icons (all or some): the whole icon set can be swapped in one call. */
export function byttIkoner(nye: Record<string, Tegning>): void {
  Object.assign(ikoner, nye);
}

export function Ikon({ id, storrelse = 22 }: { id: IkonId; storrelse?: number }) {
  const tegn = ikoner[id];
  return (
    <svg
      class="ikon"
      data-ikon={id}
      width={storrelse}
      height={storrelse}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      {...(typeof tegn === 'string' ? { dangerouslySetInnerHTML: { __html: tegn } } : {})}
    >
      {typeof tegn === 'function' ? (
        tegn()
      ) : tegn === undefined ? (
        <text x="12" y="16" text-anchor="middle" font-size="12" fill="currentColor" stroke="none">
          {id.slice(0, 1).toUpperCase()}
        </text>
      ) : null}
    </svg>
  );
}
