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

**Revised 2026-10-02 (design revision, §3 and §13).** The scroll-driven print hero (2026-09-29) and the Spesialdesign scroll image are retired: they showed animation before identity, and the picture left the screen before its sequence ended.

- One component, `BildeHelt.astro`, for the homepage, Spesialdesign and For bedrifter: a strong full-width picture, an eyebrow, a calm headline and the page's actions. Nothing in it moves on its own.
- **Parallax only:** the picture drifts about 10 % slower than the page as it scrolls away (`data-rulle="ut"`). Off under reduced motion.
- Desktop and tablet: text on the picture's light side over a soft paper-coloured veil. Phones: picture on top (4:3), text below it on the page.
- Homepage: «Vi gir ideer form», with «Start å skape» (primary) and «Fortell oss ideen din» (secondary, opens the enquiry modal).
- AI pictures carry the «Konseptbilde» tag until real photos replace them.

## Process timeline

**Revised 2026-10-02 (§6, §19).** The timeline is the main character. Component: `ProsessSlider.astro`; arithmetic in `src/components/showroom/prosess.ts` (unit-tested).

- A sticky scene, full width inside the page gutters with rounded corners, pinned just below the compact header. Track height: `n × takt + scene height`; `takt` is 55 svh per step on the homepage and 38 svh on Spesialdesign (faster, §19).
- **The line fills with scrolling, and a point lights up only when the line reaches it.** Points sit at `i / (n − 1)`; the active step is the last point the line has reached. A short rest at each end of the track (4 % and 10 %) lets the first and last steps be read. The old `floor(progress × n)` rule, which lit points before the line got there, is gone.
- **Background slideshow:** each step has its own picture (or part of one), cross-faded (700 ms). A dark gradient from the bottom keeps white text readable. The whole background drifts 6 % upward through the track.
- **Foreground object:** a light framed card shows the object evolving (sketch sheet, model, print layers, sanding, finished). A step with `scene: ingen` hides the card so the picture carries it.
- **Over the scene:** step counter (mono), title, one or two sentences, and the timeline with labels. Labels are buttons that scroll to just after the line reaches their point (`aria-current="step"`, live region). Phones: dots only, labels kept for screen readers.
- **Homepage steps:** Idé → Skisse → Modell → Print → Etterarbeid → Ferdig (6). **Spesialdesign:** Idé → Dialog → Design → Prototype → Produksjon → Ferdig (6).
- Reduced motion: no drift, fades shortened to 120 ms. Without JavaScript all steps are listed under the scene.

## Top slider

**Retired 2026-10-02 (§7).** The homepage section before the Skaperverksted portal is removed and the component deleted.

## Skaperverksted transition

**Revised 2026-10-02 (§8).** No door or circle. The light page darkens over a long gradient into the graphite portal; the measurement grid and content settle in with scrolling (`data-rulle="inn"`). Reduced motion shows the end state.

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
