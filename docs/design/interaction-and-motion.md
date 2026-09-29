# Interaction and motion

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Covers motion principles, the homepage hero, the process slider, the top slider, header behaviour, product cards, the product window and page transitions.

## Motion principles

1. **Motion explains transformation.** Sketch becoming object, contours becoming surfaces, layers building upwards, parts assembling, an object appearing to be printed. Motion that explains nothing is removed.
2. **A few coordinated sequences** beat constant animation. The site has three signature sequences: the hero, the process slider and the portal transition into Skaperverksted.
3. **Motion never blocks use.** Content and actions are readable and clickable at every frame. No scroll-jacking: scroll-driven sequences use normal document scroll with sticky positioning.
4. **Reduced motion is a full design, not an off switch.** With `prefers-reduced-motion: reduce`, sequences show their end state or step as discrete states with crossfades ≤150 ms; parallax, autoplay and falling cards are off.
5. **Performance:** animate only `transform`, `opacity`, `clip-path` and `filter` on small layers. No layout-triggering animation. Pause off-screen animation (IntersectionObserver). Canvas/WebGL loops stop when not visible.

### Motion tokens (defined in Phase 0)

| Token | Value | Use |
|---|---|---|
| `--ease-ut` | `cubic-bezier(.2,.7,.2,1)` | Entrances, slides (from the test bench) |
| `--ease-inn-ut` | `cubic-bezier(.45,0,.65,1)` | Falling cards, symmetric moves |
| `--t-rask` | 120–180 ms | Hover, press, small state changes |
| `--t-trinn` | 300–340 ms | Step and slide changes |
| `--t-inngang` | 440–550 ms | Section reveals, page entrance |
| `--t-sekvens` | 1.2–2.4 s | Hero build sequence (total) |

## Homepage hero

**Purpose:** say VI GIR IDEER FORM and let the page appear to start making something in front of the visitor.

**Concept (default):** the portal. A single object is built in front of the visitor through these states:

> skisse → kontur → geometri → mesh → lag → printet objekt

- The statement «VI GIR IDEER FORM» is large display type and part of the composition, not a caption beside a picture. The word FORM can itself take part in the build (for example set on layer lines).
- The object is a real Designporten product (for example the lamp or the dragon) so the sequence ends in something the visitor can buy or make.
- The sequence plays once on load (≈1.2–2.4 s), then settles. Scrolling or pointer movement may scrub or gently rotate the object; it never replays on its own in a loop.
- **Implementation order:** the first version uses layered images/video frames of the same object in each state (as the process slider already does). A real-time WebGL version is an enhancement that loads after first paint and is skipped on low-power devices and reduced motion.
- **Implemented (2026-09-29, full-width pass):** the hero is one continuous field across the full browser width. Construction lines run from edge to edge; the spiral vase is built from programmatic geometry (axis, profile from 11 measurement points, 7 cross-sections, 14 ribs at 132° twist) and printed in 46 layers. Above the moving print line the object is still the model; below it, the concept photo of the printed vase. A mono readout names each stage. On load the stages draw in (≈1.4 s) and the print runs to about a third (half on narrow screens); from there **normal scrolling advances the print** to the finished object. On ≥1024 px the hero is pinned (sticky) for about 70 % of a screen of scroll so the print can finish; below 1024 px it is not pinned and the print follows the hero leaving the screen. A fine pointer turns the ribs slightly. The word FORM is printed with the same line. «Bygg på nytt» replays the load sequence. Without JavaScript the finished object shows; reduced motion shows one still frame with the model above the line and the object below it, all stages listed.
- **Primary actions**, visible from the first frame without waiting for the animation:
  - «START Å SKAPE» → Skaperverksted (primary, filled lilla)
  - «FORTELL OSS IDEEN DIN» → idea form (secondary, outline)
- The three paths (FINN NOE / LAG NOE / HAR DU EN IDÉ?) follow directly below the hero; see [information-architecture.md](../content/information-architecture.md#homepage).
- Earlier hero directions that are **retired**: the galaxy/smoke hero (Aug 2026), the stone-arch portal with a hiker (concept 06), headline-left/product-right splits.

## Process slider

**Status: preserved existing work.** Built in the test bench (`reference/prototypes/provebenk-2026-09-04.html`), iterated with Sivert 2026-09-03 to 2026-09-04. Re-implement to this spec; do not redesign.

**Section:** «Slik blir en idé til en del». Meta label in mono: «N steg · scroll for å følge dem».

### Scroll mechanics
- An outer track (`spor`) whose height is `viewport × 0.85 × N + viewport × 0.15` (about one screen drag per step).
- An inner block (`fest`) is `position: sticky`, pinned just below the header.
- `progress = (scrollY − trackTop) / (trackHeight − viewportHeight)`, clamped to 0–1. `step = floor(progress × N)`, capped at N−1.
- Only normal scrolling drives it. No wheel hijacking.

### Image
- **Full width** of the viewport. Aspect 21:9 on desktop, 4:3 on mobile.
- **Layered scene:** a background image (cover, oversized by 14 % top and bottom), a light radial veil (white .80 → .34 → 0) and the transparent product image(s) on top, centred, about 34 % wide on desktop and 52 % on mobile, with a soft physical drop shadow.
- **Background parallax:** the background moves slowly upwards with progress (`translateY(−progress × 11 %)`), «sakte men sikkert … som en optisk illusjon» (Sivert, 2026-09-03). Off under reduced motion.
- **Step change:** the new state **fades in with a quick slide** (about 340 ms, `--ease-ut`, from 26–30 px to the right). The thin violet/blue stripe effect is removed (Sivert, 2026-09-03).
- **States:** the same object shown as it moves from sketch → 3D model → prototype → finished product. The test bench simulated this with filters on one photo; production uses real images of each state.

### Text
- Placed **directly under the image**: 14 px from the image edge to the step counter, 12 px gap between elements (Sivert, 2026-09-04).
- Centred column, max 52ch.
- Step counter in mono («Steg 01 / 05»), then the step title, then one or two sentences.
- Text swaps with a short fade and 14 px upward slide (300 ms).

### Progress bar
- **Exactly as wide as the text column** and centred with it under the full-width image (Sivert, 2026-09-03).
- A 3 px track in `--kant`, filled with solid `--dp-lilla` (not a gradient) as progress moves.
- **Small dots on the bar**, one per step, evenly spaced from 0 to 100 %. Passed dots are filled violet; the current dot is slightly larger with a soft violet ring.
- Step labels under the bar in mono uppercase (10 px, 9 px on mobile); first left-aligned, last right-aligned; current in violet, passed in muted.
- Dots and labels are buttons: clicking one scrolls to that step. The whole component is keyboard reachable and announces the current step (`aria-current="step"`, live region for the title).

### Steps
- The component supports any number of steps (N ≥ 2).
- **Homepage:** IDÉ → SKISSE → MODELL → 3D-PRINT → FERDIG PRODUKT (5 steps, from the brief).
- **Spesialdesign:** IDÉ → DIALOG → DESIGN → PROTOTYPE → PRODUKSJON → FERDIG PRODUKT (6 steps, from the brief).
- The test bench copy for Skisse, 3D-modell, Prototype and Ferdig produkt is kept as the starting text for the matching steps; the "one reprint round included" and "file kept on your account" promises need Sivert's confirmation before publishing.

### Reduced motion and small screens
- Reduced motion: no parallax, crossfade only, the track is shorter (one step per 60 % of a screen).
- On mobile the component works the same way; labels shorten if needed, the bar keeps its dots.

## Top slider

**Status: preserved existing work** (test bench, 2026-09-03/04). Used where a page needs a sequence of scenes, for example product or inspiration highlights. It is not the homepage hero.

- **Control row on top**, above the image, with a hairline under it: category eyebrow (mono, pushed left) → dots (9 px; active dot stretches to 26 px in lilla) → counter «1 / 3» (mono) → «Forrige» / «Neste» buttons.
- Full-width scene as in the process slider.
- Text **directly under the image** (14 px), centred, headline + one line + CTAs.
- Autoplay at 6 s is allowed only if it pauses on hover, focus and interaction, has a visible pause control (WCAG 2.2.2) and is off under reduced motion.

## Header

**Status: preserved existing work** (Sivert, 2026-09-02).

- Sticky. At the top of the page it is a full-width bar (≈62 px).
- On scroll it **shrinks** (≈48 px), **becomes rounded** (a pill inset ≈16 px from the edges) and **translucent** (surface at ~72 % with a background blur). Transition ≈240 ms.
- Left: logo (the way home). Centre or left-of-centre: main navigation. Right: search, cart (and account when accounts exist).
- **Mobile:** only the menu button and cart are visible. The menu opens as a full-height sheet with large touch targets (≥48 px rows).
- A 2 px scroll-progress line at the very top is kept (it uses the brand gradient; this is one of the permitted brand-line uses).
- Current section is marked with a 2 px underline and `aria-current="page"`. With JavaScript a single marker slides between the links on hover and focus and returns to the current one (transform only).
- Over graphite sections (`data-mork`: the Skaperverksted portal, the idea band, the hub) and the footer the header turns graphite, detected with IntersectionObserver on a thin band at the header's position.
- Inside Skaperverksted the site header collapses to a slim workshop bar (logo, generator name, project name, save/export, exit to the showroom).

## Product cards and grid

**Status: preserved existing work** (Sivert, 2026-09-02/03).

- Cards are **square images** (1:1) with **0 px radius**, fixed width (208 px default at desktop), in a **centred grid**; more cards appear as space grows, **max 6 across**. Card size does not change with the viewport.
- On mobile (≤480 px) the grid is two equal columns.
- Card contents: image, name, one spec line in mono (dimensions), price (only when set; otherwise nothing, never a fake price), cart control.
- **Hover:** the card itself does not move, scale or lift. The image may crossfade to a second angle or detail when one exists (brief §26). Only the cart control changes state.
- **Cart control:** a cart icon (the project's own PNG, not a bag) in the card's corner. At rest it shows the icon (and the count if > 0). On hover/focus the cart becomes «+» and «−» appears, stacked vertically as a small capsule. Hit areas ≥24 px (WCAG 2.2 target size), 44 px on touch.
- Material type is not shown on the card (Sivert, 2026-09-03).
- **Category change:** remaining cards move to their new positions (FLIP, ≈460 ms). **Cards that leave fall backwards, rotate slightly and fade out** (`translate3d(0,58px,−360px) rotate(−15deg)`, ≈540 ms). New cards enter with a short scale-and-rise. Under reduced motion cards simply crossfade.

## Product window

**Status: preserved existing work** (Sivert, 2026-09-02).

- Clicking a card opens a **light** product window over the page; the page behind **darkens and blurs**.
- Contents: image (with «Konseptbilde» label when relevant), name, description, colour swatches, material/plastic type with a one-line explanation of what it tolerates, optional custom text field where the product allows it (with character counter), price updating with choices, «Legg i handlekurv».
- Focus is trapped while open, Esc closes, focus returns to the card. On mobile it is a full-height sheet.
- A full product page exists for every product as well (shareable URL, SEO); the window is a quick view.

## Page transitions

- Between showroom pages: the outgoing page fades and lifts slightly (≈220 ms), the incoming content enters in a short stagger (≈60 ms per block). Implemented with the View Transitions API where supported; plain navigation elsewhere.
- **Showroom → Skaperverksted («the portal»):** the one transition allowed to be theatrical. The warm showroom surface gives way to the graphite workshop and the measurement grid draws in from the centre. ≤700 ms, skipped under reduced motion. Implemented as a cross-document view transition of type `portal`: the workshop opens from a centre slit (clip-path, 640 ms) while the showroom page recedes; the hub's grid then draws in from the centre. On the homepage the portal section itself scales a graphite surface out to full width as it scrolls in, so the visitor enters the workshop before clicking.
- The thin line that slid down on page change is removed (Sivert, 2026-09-03).

## Scroll reveals

Sections may rise 20 px and fade in once, with a small stagger. Never on text the visitor is already reading, never repeated when scrolling back.

## Scroll sequences (2026-09-29)

A small shared engine (`src/scripts/rulle.ts`) drives the scroll-linked sequences by setting `--p` (0–1) on elements marked `data-rulle`. It uses IntersectionObserver to run only while an element is on screen, one rAF per scroll frame, and measures only on resize, never on scroll. Modes: `fest` (pinned track), `inn` (entering), `gjennom` (passing through), `ut` (leaving). `data-rulle-smal` picks another mode below 1024 px; `data-rulle-rolig` sets a fixed value under reduced motion, where content is never hidden. Used by: the hero, the Skaperverksted portal, the featured product, the Spesialdesign opening (sketch → post-processing → finished, «Konseptbilde») and the Bedrift photo. No scroll hijacking.

## Buttons and forms

- Buttons press physically: on hover they rise 2 px and show a 2 px edge below; on press they sink flush. Reduced motion keeps the colour change only.
- The idea form's send button shows a moving stripe while sending (`aria-busy`); status, error summary and receipt fade in.

## Generator previews

The portal and the Skaperverksted hub show each available generator's real default design on a 10 mm grid, computed at build time from the generator's own defaults (functional geometry, D-3). Hover or focus on the card animates what the tool does: Signgen's layers separate with their print slices, the lamp's ribs turn further and the light comes on, the dragon's parts turn at their joints. Touch screens show that state at rest; reduced motion shows the resting state.

## Cursor and hover

- Cursor-reactive effects only where they explain something: rotating a 3D object, previewing another angle, showing a measurement.
- No custom cursors on the showroom. The editor uses standard tool cursors (move, rotate, crosshair, grab).
