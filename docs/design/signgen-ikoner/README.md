# Sign Forge icon set

Sivert's own icon set for the Skiltgenerator (92 icons in 12 groups, delivered 2026-10-07 as «signgen-claude-handoff.zip»). The files here are the reference; the icons the editor uses are the individual SVG files in `src/skaperverksted/shell/ikonsvg/`.

- [`ICONS.md`](ICONS.md): Sivert's original rules for the set (24 × 24, `currentColor`, stroke 1.65, accessibility notes). Links to files that were left out of the repository (the HTML sheet, the SVG sheet, the generator script and the ZIP) point to the handoff.
- [`icons-manifest.json`](icons-manifest.json): id, label and group of every icon.
- [`icon-style-sheet.png`](icon-style-sheet.png): overview only. It is never used as one image in the UI.

## How the editor uses them

- `shell/ikoner.tsx` is the central registry. Every icon is inlined as SVG, so size, colour, hover and active state are set by CSS and the UI. Icons are always decorative (`aria-hidden`); the button carries the accessible name and `aria-pressed`.
- One icon is replaced by changing its SVG file, or at run time with `byttIkoner({ pen: '<path …/>' })`. No tool, panel or toolbar code names an icon's drawing.
- An icon does not mean a feature. Only functions that exist use an icon; the rest of the set waits for its phase.
- The set has no icons for rectangle, ellipse, polygon, hole, decoration or the panel chrome (menu, minimise, close, dock). Those keep temporary plain line icons in the registry until the set covers them.
