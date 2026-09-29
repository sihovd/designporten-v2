# Brand and visual identity

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Covers brand, colour, typography, materiality, imagery, iconography and copy voice.

## Brand core

- **Name:** Designporten. The portal is the concept, not just the name: an idea goes in and a physical object comes out.
- **Statement:** VI GIR IDEER FORM
- **Supporting line:** FRA TANKE TIL NOE DU KAN BERØRE
- **Special-order line:** DU TRENGER IKKE HA EN FERDIG MODELL. START MED IDEEN.
- **Character:** creative, modern, tactile, playful, professional, technological, personal, surprising, approachable, crafted. Not childish, not chaotic.
- **Tension:** MAKER / WORKSHOP / MATERIAL / CRAFT against DIGITAL DESIGN / CAD / 3D / FUTURE. Every page should show a little of both.

## Colour

Colour communicates hierarchy and identity. It does not decorate.

### Identity colours (fixed)

| Token | Hex | Role |
|---|---|---|
| `--dp-lilla` | `#883DFF` | Identity, primary action fill, active state, selection |
| `--dp-cyan` | `#00C4D6` | Identity, technical/measurement accent, focus on dark, active tool on dark |

These values come from the brief and match the «Designporten Lilla / Designporten Cyan» swatches in the concept editor. They replace the earlier approximations (`#9B4DE0`, `#29ABE2`, `#7B3FF2`, `#00D4FF`) and the test bench's action colour `#5433EB`.

### Showroom palette (light, warm)

| Token | Hex | Use |
|---|---|---|
| `--papir` | `#F6F3EE` | Page background: warm off-white, not sterile white |
| `--flate` | `#FFFDF9` | Raised surfaces: cards, modal, form fields |
| `--kalk` | `#ECE7DF` | Quiet bands, image mats, product backgrounds |
| `--kant` | `#D9D3C9` | Hairlines and dividers (decorative only) |
| `--kant-sterk` | `#8C8680` | Field borders and control outlines (3:1 on papir) |
| `--blekk` | `#18171C` | Text (16:1 on papir) |
| `--dempet` | `#5E5A57` | Secondary text (6.2:1 on papir) |
| `--lenke` | `#6E24E6` | Text links and violet text on light (6.2:1) |
| `--cyan-tekst` | `#00717C` | Cyan text on light, only when needed (5.2:1) |

### Workshop palette (dark, graphite)

| Token | Hex | Use |
|---|---|---|
| `--verksted` | `#141317` | Skaperverksted background, dark bands, footer |
| `--grafitt` | `#1C1B1F` | Panels on the dark background |
| `--grafitt-2` | `#2A282E` | Raised controls, input backgrounds on dark |
| `--linje-mork` | `#3A3740` | Hairlines on dark |
| `--tekst-mork` | `#F1EEE8` | Text on dark |
| `--dempet-mork` | `#A7A3A0` | Secondary text on dark (6.8:1) |
| `--lilla-lys` | `#B797FF` | Violet text and outlines on dark (7.3:1) |

### Material colours

Filament and material colours are **product data**, not UI tokens. They live with the material catalogue (see [technical-architecture.md](../architecture/technical-architecture.md#domain-model)) and are shown as swatches, previews and in 3D.

### Rules

- White text on `--dp-lilla` is 5.0:1 and is the primary button. Violet text on light uses `--lenke`.
- Cyan is never body text on light surfaces (1.9:1). On graphite it is 8:1 and may be used for text and focus.
- The **violet→cyan gradient** is used only in the logo and as the thin brand line. Not on buttons, headings, backgrounds, cards or icons.
- No purple/cyan full-page gradients, no neon glow, no gradient spheres.
- Dark surfaces are the workshop's material: Skaperverksted, the footer, and at most one or two deliberate dark bands on a showroom page (Sivert, 2026-08-28: «episodisk i verkstedprosess, konfigurator eller footer»).
- Status colours (success, warning, error) are defined in Phase 0 tokens with AA contrast on both palettes, and are always paired with text or an icon.

## Typography

| Role | Face | Settings |
|---|---|---|
| Display | **Archivo** (variable, OFL) | Wide width (`wdth` 112–125), weight 700–800, tight tracking (−0.02 to −0.035em). Large sizes may act as graphic elements. |
| Body and UI | **Archivo** | Normal width (`wdth` 100), weight 400/500/600, 16–18 px body, line height 1.5–1.6 |
| Technical | **IBM Plex Mono** (OFL) | Measurements, dimensions, coordinates, counters, step numbers, labels, editor values. Uppercase with 0.06–0.1em tracking for labels. |

- Both families are self-hosted as WOFF2 subsets (Latin + Norwegian æøå), `font-display: swap`, with the display weights preloaded on the homepage only.
- Archivo keeps Sivert's choice of 2026-08-28 («går for C»: Archivo + IBM Plex Mono). Its width axis gives the display face the character the brief asks for without adding a third family.
- Not used: Inter, Roboto, Arial, generic system stacks as the brand face. Satoshi and Manrope (earlier trials) are retired.
- Headlines may break the grid: oversized words, words that build letter by letter or layer by layer, words set against measurement lines. Readability always wins.
- Numbers in prices and dimensions use tabular figures.
- **Type scale** (fluid, defined as tokens in Phase 0): display 56–120 px, h1 40–72, h2 28–44, h3 20–28, body 16–18, small 14, mono label 10–12.

## Materiality

The visual language is drawn from how objects are actually made:

- print layers and layer lines;
- contours, offsets and outlines;
- construction lines and measurement marks with real values;
- coordinates and dimensions in mm;
- grids that mean scale;
- sectional and exploded views;
- extrusion, stacked surfaces;
- filament and material swatches;
- slicer-like layer previews.

**Rule:** each element must explain scale, construction, material or process where it appears. A measurement line shows a real measurement. A grid appears where size matters. Nothing is scattered for atmosphere.

**Surface treatment:** flat, matte and precise. Hairlines rather than heavy shadows; soft, physical shadows only under objects. Radius is small: 0 px on product images and cards (Sivert, 2026-09-02), 2–4 px on inputs and panels, pill shapes only for primary/secondary buttons and chips. No glassmorphism except the header's translucent scrolled state, which Sivert asked for.

## Logo and mascot

- **Logo:** the existing "dp" mark of two linked loops with the violet→cyan gradient, above the wordmark «Designporten». Sivert's file (supplied 2026-09-28) is in `public/brand/`: `designporten-logo.svg` is the full stacked lockup, `designporten-merke.svg` is the "dp" mark alone, cut from the same file. Both are only optimised (SVGO, lossless recompression of the embedded gradient PNG) and given an accessible title; never redrawn or re-generated. Referenced through `src/lib/ressurser.ts` (`logo`, `logomerke`).
  - **Where:** the site header uses the mark (40 px, 34 px when the header shrinks), because the lockup's wordmark is too small to read at header height. The footer uses the full lockup (180–240 px wide). The workshop bar shows the mark as a link home on wide screens; at 760 px and below that bar is already full, so the mark is hidden there. The favicons, the web manifest icons and the default social preview (`delingsbilde.png`, 1200×630, lockup on paper) are generated from these files.
  - **Contrast:** logotypes are exempt from WCAG text contrast, but for reference: violet `#9B51E0` is 4.1:1 on paper and on graphite; cyan `#1FA8E2` is 2.5:1 on paper and 6.8:1 on graphite. The lockup reads on both surfaces.
  - **Minimum size in use:** mark 24 px, lockup 160 px wide (below that the wordmark stops being legible). Sivert may set formal clear-space rules later.
- **Mascot:** a cute, slightly spiky baby dragon. The concepts show a cream/white version (portal and workshop scenes) and a purple/dark-blue articulated version (product). Colours: purple, dark blue, beige/cream. It appears in a few chosen moments (404, empty states, the dragon generator, Inspirasjon stories), never on every section. The articulated dragon product and the mascot are related but not the same thing.

## Imagery

- **Goal:** real photographs of the workshop, printers, materials, hands, process stages and finished products. Warm, natural light, real surfaces, shallow depth where it helps.
- **Until then:** AI concept images from the project's own sets are allowed and are always labelled «Konseptbilde» with the mono tag (black, 9 px, uppercase, top-left, as in the test bench).
- **Transparent product cut-outs** (PNG/WebP with real alpha) over a background image with a light veil is the established scene technique (test bench, 2026-09-03).
- No stock-photo aesthetics, no invented people presented as staff or customers.
- **Vector rule** (Sivert, 2026-08-28, clarified 2026-09-28 as D-3): no arbitrary decorative vector artwork and no invented decorative SVG iconography. Functional programmatic geometry is allowed: grids, rulers, measurement marks, construction lines, Bézier curves, geometry paths, editor overlays, snapping guides and technical visualisation.

## Iconography

- Icons only where they carry meaning: tools in the editor, cart, search, menu, close, and the three paths if tested to help.
- Icons are **functional geometry** drawn from a small, documented set in `src/components/Ikon.astro` (tool, cart, search, menu, close, arrows, eye, lock): simple strokes that explain a function, not decorative illustration. Sivert's own PNG icons replace them when added.
- No decorative icon rows, no icon above every card.

## Copy and voice

Simple, direct, human, Norwegian (bokmål). Let products, process and interaction carry most of the story.

**Do:**
- «Har du tegningen, bildet eller bare ideen? Vi hjelper deg å gjøre den fysisk.»
- «Delen du leter etter finnes kanskje ikke ennå.»
- «Materialet avgjør om delen holder.»
- «Send en skisse, et mål eller et bilde av delen som er ødelagt.»
- Concrete nouns: skisse, mål, bilde, del, lag, mm, PLA, PETG.

**Don't:** «innovative løsninger», «skreddersydde løsninger for dine behov», «kvalitet er vårt fokus», «vi brenner for», «der kreativitet møter teknologi», «Kreativitet møter teknologi», «Idéer som beveger deg».

**Rules:**
- Headlines are short statements or questions. No exclamation marks in headlines.
- Uppercase is used for the core statements and CTAs listed in the brief; body copy is sentence case.
- Numbers only when documented: no invented delivery times, ratings, counts or prices. Placeholders are marked as placeholders.
- First person: «vi» (the workshop). The live site's «jeg» is retired.
