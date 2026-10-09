/**
 * Icon registry for the workspace. Every icon is one entry in `ikoner`, so a
 * single icon (or the whole set) can be replaced without touching a toolbar,
 * a panel or any tool logic: change the SVG file, or call `byttIkoner`.
 *
 * The Sign Forge icons (92 from round 1, 24 from round 2) are Sivert's own set (docs/design/signgen-ikoner).
 * The files in `ikonsvg/` are used as they are, one file per icon, inlined
 * as SVG so size, colour (`currentColor`), hover and active state are set by
 * the UI. Icons the set does not have (the workspace button) use a temporary
 * plain line icon, marked below.
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
  | 'send-printer'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'triangle'
  | 'hole'
  | 'keyring-eye'
  | 'decor-gallery'
  | 'text-outline'
  | 'layer-add'
  | 'path-close'
  | 'path-finish'
  | 'path-repair'
  | 'panel-menu'
  | 'panel-minimize'
  | 'panel-restore'
  | 'panel-close'
  | 'panel-dock-left'
  | 'panel-dock-right'
  | 'panel-float'
  | 'decor-save'
  | 'help'
  | 'color-follow-layer'
  | 'distribute-horizontal'
  | 'distribute-vertical';

/** Temporary line icons for what the set does not cover (D-3: functional glyphs only). */
export type MidlertidigIkon =
  | 'paneler'
  | 'juster-venstre'
  | 'juster-midt-x'
  | 'juster-hoyre'
  | 'juster-topp'
  | 'juster-midt-y'
  | 'juster-bunn'
  | 'tekst-venstre'
  | 'tekst-midt'
  | 'tekst-hoyre';

export type IkonId = PakkeIkon | MidlertidigIkon;

/** An icon is SVG markup (the inside of a 24 × 24 SVG) or a function that draws it. */
type Tegning = string | (() => JSX.Element);

const midlertidige: Record<MidlertidigIkon, () => JSX.Element> = {
  paneler: () => (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M4 10h16M10 10v9" />
    </>
  ),
  // alignment: the edge or centre line and two bars lined up against it
  'juster-venstre': () => (
    <>
      <path d="M4 3v18" />
      <rect x="7" y="6" width="13" height="4" />
      <rect x="7" y="14" width="8" height="4" />
    </>
  ),
  'juster-midt-x': () => (
    <>
      <path d="M12 3v18" />
      <rect x="5" y="6" width="14" height="4" />
      <rect x="8" y="14" width="8" height="4" />
    </>
  ),
  'juster-hoyre': () => (
    <>
      <path d="M20 3v18" />
      <rect x="4" y="6" width="13" height="4" />
      <rect x="9" y="14" width="8" height="4" />
    </>
  ),
  'juster-topp': () => (
    <>
      <path d="M3 4h18" />
      <rect x="6" y="7" width="4" height="13" />
      <rect x="14" y="7" width="4" height="8" />
    </>
  ),
  'juster-midt-y': () => (
    <>
      <path d="M3 12h18" />
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="8" width="4" height="8" />
    </>
  ),
  // text alignment: four lines of text, flush left / centred / flush right
  'tekst-venstre': () => <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  'tekst-midt': () => <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  'tekst-hoyre': () => <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  'juster-bunn': () => (
    <>
      <path d="M3 20h18" />
      <rect x="6" y="4" width="4" height="13" />
      <rect x="14" y="9" width="4" height="8" />
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
