/**
 * Icon slots for the workspace. Every icon is a function in `ikoner`, so the
 * final icon set can replace them one by one (or all at once through
 * `byttIkoner`) without touching a single toolbar or panel. The glyphs here
 * are temporary: plain geometric line icons, no artwork (D-3). A missing id
 * falls back to a text glyph, so a tool never ends up without a visible mark.
 */
import type { JSX } from 'preact';

export type IkonId =
  | 'velg'
  | 'tekst'
  | 'former'
  | 'rektangel'
  | 'ellipse'
  | 'polygon'
  | 'penn'
  | 'hull'
  | 'mal'
  | 'panorer'
  | 'svg'
  | 'dekor'
  | 'snap'
  | 'rutenett'
  | 'meny'
  | 'minimer'
  | 'gjenopprett'
  | 'lukk'
  | 'dokk-venstre'
  | 'dokk-hoyre'
  | 'flyt'
  | 'paneler'
  | 'pil-ned';

type Tegning = () => JSX.Element;

export const ikoner: Record<IkonId, Tegning> = {
  velg: () => <path d="M6 4l11 7-5 1.5L9.5 18z" />,
  tekst: () => <path d="M6 7V5h12v2M12 5v14M9.5 19h5" />,
  former: () => (
    <>
      <rect x="4" y="4" width="10" height="10" rx="1" />
      <circle cx="15" cy="15" r="5" />
    </>
  ),
  rektangel: () => <rect x="4" y="6.5" width="16" height="11" rx="1" />,
  ellipse: () => <ellipse cx="12" cy="12" rx="8" ry="6" />,
  polygon: () => <path d="M12 4l7 4v8l-7 4-7-4V8z" />,
  penn: () => <path d="M5 19l1-4L16 5l3 3L9 18zM14 7l3 3M5 19l4-1" />,
  hull: () => (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  mal: () => <path d="M4 15L15 4l5 5L9 20zM8 11l2 2M11 8l2 2M6 13l1 1" />,
  panorer: () => (
    <path d="M12 4v16M4 12h16M12 4l-2 2M12 4l2 2M12 20l-2-2M12 20l2-2M4 12l2-2M4 12l2 2M20 12l-2-2M20 12l-2 2" />
  ),
  svg: () => (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  dekor: () => <path d="M12 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  snap: () => (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </>
  ),
  rutenett: () => <path d="M9 4v16M15 4v16M4 9h16M4 15h16" />,
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
  'pil-ned': () => <path d="M8 10l4 4 4-4" />,
};

/** Replace icons (all or some): the whole icon set can be swapped in one call. */
export function byttIkoner(nye: Partial<Record<IkonId, Tegning>>): void {
  Object.assign(ikoner, nye);
}

export function Ikon({ id, storrelse = 20 }: { id: IkonId; storrelse?: number }) {
  const tegn = ikoner[id];
  return (
    <svg
      class="ikon"
      width={storrelse}
      height={storrelse}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {tegn ? (
        tegn()
      ) : (
        <text x="12" y="16" text-anchor="middle" font-size="12" fill="currentColor" stroke="none">
          {id.slice(0, 1).toUpperCase()}
        </text>
      )}
    </svg>
  );
}
