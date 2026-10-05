# Designporten – autoritativ masterspesifikasjon

**Status:** Established 2026-09-28 from Sivert's master brief ("DESIGNPORTEN 2.0 — MASTER BRIEF AND PROJECT INSTRUCTION"), reconciled with all earlier Designporten material that could be inspected. Implementation starts only when Sivert gives the next instruction.

## Autoritativ regel

DESIGNPORTEN_MASTER.md is the authoritative product specification for this project. Implementations must follow this document. Existing or legacy Designporten implementations must not be treated as the design or architectural source of truth unless explicitly stated.

This file is the **single entry point**. It holds the decisions every contributor must know. Detail lives in the linked documents under `docs/`, which are part of this specification and carry the same authority. If a detail document ever contradicts this file, this file wins and the detail document must be corrected.

### How to change the specification

1. A new explicit decision from Sivert overrides anything written here.
2. Record the change in [`docs/decisions/decision-log.md`](docs/decisions/decision-log.md) with date, source and what it replaces.
3. Update this file and the affected detail document in the same change.
4. Never let an implementation silently diverge. If the spec is wrong, fix the spec first.

### Source hierarchy (used when sources conflict)

1. Sivert's newest explicit instruction.
2. This master specification and its detail documents.
3. Earlier explicit decisions by Sivert that the spec records as preserved (see [decision log](docs/decisions/decision-log.md)).
4. Existing prototypes and concept images in `reference/`: inspiration and preserved components, not binding layouts.
5. The current designporten.no (WordPress/Divi) and the Aug 2026 WordPress theme work: legacy, not source of truth.

---

## Specification map

| Area | Document |
|---|---|
| Brand, colour, typography, materiality, imagery, copy voice | [docs/design/brand-and-identity.md](docs/design/brand-and-identity.md) |
| Interaction, motion, hero, process slider, header, product cards | [docs/design/interaction-and-motion.md](docs/design/interaction-and-motion.md) |
| Information architecture, navigation, every page, special orders, business, contact | [docs/content/information-architecture.md](docs/content/information-architecture.md) |
| Skaperverksted: workspace, canvas, Signgen, lamp generator, dragon generator, BuildForge, ecosystem | [docs/design/skaperverksted.md](docs/design/skaperverksted.md) |
| BuildForge product brief (Sivert's handoff, 2026-10-03) and the newer direction (modular build engine, 2026-10-04) | [docs/design/buildforge-handoff.md](docs/design/buildforge-handoff.md), [docs/design/buildforge-handoff-2026-10-04.md](docs/design/buildforge-handoff-2026-10-04.md) |
| Technical architecture, domain model, responsive, accessibility, performance | [docs/architecture/technical-architecture.md](docs/architecture/technical-architecture.md) |
| Decisions, preserved work, conflicts resolved, open decisions | [docs/decisions/decision-log.md](docs/decisions/decision-log.md) |
| Reference material and what to take from it | [reference/README.md](reference/README.md) |
| Rules for people and agents working in the repo | [CLAUDE.md](CLAUDE.md) |

---

## 1. Product vision

Designporten is a Norwegian creative design and production workshop: 3D printing, custom design, personalised products, prototypes, small production runs, graphic design and profiling, and digital tools that let customers design physical products themselves.

**Core statement:** VI GIR IDEER FORM
**Supporting line:** FRA TANKE TIL NOE DU KAN BERØRE

The central concept is **transformation**. An idea enters the portal; a physical object comes out:

> idé → design → modell → produksjon → fysisk objekt

The website is a **digital entrance into a physical workshop**. It does not tell people that Designporten makes things; it demonstrates making. It is not a generic webshop, advertising agency, 3D-print service or SaaS template.

**Compass for every major decision:** the visitor's reaction should be *«Oi. Hva kan jeg lage her?»*

### The five questions a first-time visitor must answer quickly

1. What is Designporten?
2. What can Designporten make for me?
3. Can I create something myself?
4. What do I do if I only have an idea?
5. How do I continue?

Creativity must never make these harder to answer.

### Three paths (the product's backbone)

| Path | Meaning | Destination |
|---|---|---|
| **FINN NOE** | Explore existing products and inspiration | Vårt utvalg, Inspirasjon |
| **LAG NOE** | Design something yourself | Skaperverksted |
| **HAR DU EN IDÉ?** | Tell Designporten what you want made | Spesialdesign → idéskjema |

## 2. Experience principles

1. **Show transformation, don't describe it.** Sketch → contour → geometry → mesh → layers → object is the site's recurring visual logic.
2. **Two worlds in tension:** maker / workshop / material / craft **and** digital design / CAD / 3D / technology. Neither may win completely.
3. **Showroom and workshop.** The public site is the showroom (warm, tactile, editorial). Skaperverksted is the workshop (technical, precise, darker, tool-like). Entering Skaperverksted should feel like stepping through the portal.
4. **Fewer, stronger ideas.** Distinctiveness comes from composition, typography, interaction, materiality, spatial relationships, motion and hierarchy, never from added effects.
5. **Every technical graphic must have a reason.** Grids, measurement marks, contours and coordinates appear where they explain scale, construction or process.
6. **Honesty.** No fake prices, reviews, statistics, team members, stock, subscriptions or features. Unfinished features are shown as unfinished. AI-generated images are labelled as concept images.
7. **Human, concrete Norwegian copy.** Short, direct, specific. See the voice rules in [brand-and-identity.md](docs/design/brand-and-identity.md#copy-and-voice).
8. **Low threshold for ideas.** *DU TRENGER IKKE HA EN FERDIG MODELL. START MED IDEEN.*

**Avoid** (from the brief, binding): standard SaaS heroes, headline-left/3D-blob-right, excessive rounded cards, glassmorphism, purple gradients everywhere, arbitrary neon, decorative gradient spheres, dashboards on content pages, excessive pills, endless identical sections, stock-photo aesthetics, purposeless icons, excessive centring, meaningless badges.

**Priority order when goals conflict:**
1. Functionality and understandable UX
2. Designporten identity
3. Ease of use
4. Visual quality
5. Responsive behaviour and accessibility
6. Performance
7. Visual spectacle

## 3. Established decisions (summary)

Full rationale is in the detail documents and the decision log.

### Brand and visual identity
- **Identity colours:** Designporten Lilla `#883DFF` and Designporten Cyan `#00C4D6`. They are accents with meaning, never full-page gradients.
- **Surfaces:** warm off-white *papir* `#F6F3EE` for the showroom, graphite *verksted* `#141317` / `#1C1B1F` for Skaperverksted and episodic dark sections.
- **Action colour:** Lilla `#883DFF` with white text (5.0:1). Text links use `#6E24E6`. Cyan is never text on light surfaces; it is used on graphite, as a technical/measurement accent, and in the logo.
- **The violet→cyan gradient** is reserved for the logo and the thin brand line. It is not used on buttons, backgrounds or headlines.
- **Typography (revised 2026-10-02):** Sora (light, geometric) for headings and Manrope for body and UI, IBM Plex Mono for measurements and editor values. Calm scale, no gigantic headings. See [brand and identity](docs/design/brand-and-identity.md#typography).
- **Logo:** the existing "dp" two-loop mark. It is not redrawn.
- **Mascot:** the cute, slightly spiky dragon in purple, dark blue and beige/cream seen in the concepts. It is used sparingly, never as decoration on every page.
- **Imagery:** real workshop and product photography is the goal. AI concept images are allowed until then and are always labelled «Konseptbilde».
- **Vector rule (D-3, clarified 2026-09-28):** functional programmatic geometry is allowed: grids, rulers, measurement marks, construction lines, Bézier curves, geometry paths, editor overlays, snapping guides, technical visualisation. Arbitrary decorative vector artwork and invented decorative SVG iconography are not. Transparent images are PNG/WebP with alpha.

### Information architecture
- **Main navigation:** Vårt utvalg (/produkter/) · Skaperverksted · Spesialdesign · For bedrifter · Inspirasjon · Om · Kontakt. The logo is the way home; «Hjem» is not a menu item (decision of 2026-09-03).
- **Header utilities:** search, cart. Account is added when accounts exist.
- **Homepage CTA pair:** «START Å SKAPE» (primary, to Skaperverksted) and «FORTELL OSS IDEEN DIN» (secondary, opens the enquiry form). One is visually dominant; they never compete at equal strength.
- **Product categories:** Personlige gaver · Interiør · Figurer · Tilbehør · Bedrift · Spesialbestillinger.
- **Legacy labels retired:** «Kjøp ferdig», «Lag noe eget», «Butikk», «Designverksted(et)». Their meanings map to the new names; see the decision log.

### Signature components kept from earlier work
- **Scroll-driven process timeline** («Slik blir en idé til et ferdig produkt»), revised 2026-10-02 as specified in [interaction-and-motion.md](docs/design/interaction-and-motion.md#process-timeline): the line is the main character and a point lights only when the line reaches it; the background changes per step and the object evolves in front.
- **Sticky header** that is centred and shrinks into a centred, rounded, floating bar on scroll; on mobile only the menu button and cart show.
- **Product cards:** square, fixed width, centred grid, at most 6 across; the card does not move on hover; the image may change to another angle; only the cart control reacts.
- **Product window:** a light modal over a darkened, blurred page, with colour, material and optional custom text.
- **Category change:** cards that leave fall backwards, rotate slightly and fade out.

### Skaperverksted
- A real browser application: large central canvas, floating toolbars, Layers panel, Inspector, contextual controls, selection, snapping, zoom, pan, undo/redo, dimensions in millimetres, 2D and 3D views, export/order flow. It is not "form left, preview right".
- **Adaptive measurement grid** that switches between cm and mm subdivisions with zoom.
- **Generators are plug-ins** into a shared workspace shell and shared domain model. The tools are named **Sign Forge** (signs, code id `signgen`), **Form Forge** (general parametric form generator, first used for lamp shades; code id `lampe`), **Dragon Forge** (articulated dragons, `drage`) and **BuildForge** (a shared build engine where the user forms the expression and the engine protects the mechanics; families: clickers around a keyboard switch and modular models built from body parts joined at connectors; code id `buildforge`, a digital prototype until a profile is physically tested). Use these names consistently (2026-10-02; BuildForge replaced the planned Clicker Forge on 2026-10-03).
- **Signgen** builds 3D-printed (never wooden) signs from SVG + text + shapes → layers → heights → profiles → colours → 3D model, with an architecture ready for Bézier side profiles, CSV batch generation and a free/paid split. None of the future features are faked.

### Technical
- **Platform (D-1, decided 2026-09-28):** a standalone TypeScript application: Astro (prerendered showroom, Node adapter for the few server routes), Preact islands, framework-free Skaperverksted core, Three.js. See [ADR-001](docs/decisions/adr-001-platform.md). The old WordPress/WooCommerce site is not reused.
- **Commerce is not custom-built.** No own cart, checkout or payment engine (Sivert, 2026-08-28). A `CommerceProvider` boundary. Card payment uses **Stripe Checkout** (hosted) once Sivert has switched it on in the content editor and the keys exist on the server; only confirmed, priced products can be paid by card, and everything else (placeholders, unpriced products, Skaperverksted designs) is sent as an order request, with the UI saying no payment is taken. Products, photos, prices and shipping are edited in the git-based content editor at `/admin` (Sveltia CMS). See [development.md](docs/development.md#shop-content-editor-and-card-payment). Vipps is still planned.
- **Skaperverksted core is framework-agnostic TypeScript:** geometry, layers, profiles, units, history and export live in pure modules with tests, separate from UI.
- **3D:** Three.js (WebGL) for previews, loaded only where needed. **Export (D-4):** real 3MF (per-layer colour/material objects) and STL downloads from Signgen, not order-only. No commercial-use, pricing or plan limits are invented.
- **Accessibility target:** WCAG 2.2 AA (Sivert, 2026-08-28).
- **Performance:** the homepage hero must never block first paint. Heavy 3D and editor code is split out and loaded on intent.

## 4. Implementation phases

Each phase ends with its own definition of done (section 5). Phases 1 and 2 may run in parallel threads once Phase 0 is merged, because they share only the tokens and domain contracts defined in Phase 0.

| Phase | Deliverable | Parallel? |
|---|---|---|
| **0 — Foundation** | Stack locked (ADR-001), repo scaffold, lint/format/test/CI, design tokens (colour, type, spacing, motion) as code, fonts self-hosted, base layout and accessibility primitives, a living token/component page. | No, it comes first |
| **1 — Showroom core** | Header and navigation, footer, homepage (hero, three paths, process slider, top slider), Spesialdesign page with the idea form, Kontakt, Om. | Yes, with 2 |
| **2 — Skaperverksted shell** | Workspace shell, adaptive grid canvas (pan/zoom/select/snap), Layers panel, Inspector, history, units, 2D/3D view switch, generator plug-in contract. | Yes, with 1 |
| **3 — Signgen MVP** | Text, SVG import, basic shapes, multiple layers, per-layer height/Z/colour, transforms, straight extrusion, 3D preview, 3MF/STL export, order hand-off. | After 2 |
| **4 — Products and commerce** | Produkter listing and filters, product page, product window, cart hand-off to the chosen commerce platform, For bedrifter, Inspirasjon. | After 0, parallel with 3 |
| **5 — Signgen advanced** | Profiles (preset → Bézier), outline/offset, layer influence, multi-select, fonts library, project saving. CSV batch and plate organisation (built without limits; plan limits stay a config switch until the paid model is decided). | After 3 |
| **6 — Lamp generator** | Parametric lamp in the shared shell with direct manipulation. | After 2 |
| **7 — Articulated dragon generator** | Part-based configurable dragon with live 3D. | After 2 |
| **8 — BuildForge** | Build engine from Sivert's handoff (2026-10-03): clicker MVP as a digital prototype with a trial switch profile, SDF shapes, attachment points, Enkel/Avansert, collision through the travel, checks and export with a report. 2026-10-04: figure family, handles, colour per body, cone, horns and spikes; then the newer handoff: a modular build engine (body graph with a Main Body, connectors, magnetic drag-to-connect with connector cycling, Replace, loose parts, inside a part, start picker). 2026-10-05: ball joints (trial profile, bend per connection), radial right-click menu, canvas-first editor with properties on demand, compact status, multi-select, start carousel with previews, touch drag and a connector editor. Body Chains, print orientation, accounts and physical profile tests follow the handoff's later phases. | After 2 |

## 5. Definition of done

A task is done only when the requested deliverable is actually implemented as far as the tools and project allow. Before calling anything complete, verify that it:

- solves the requested task and integrates with the existing project;
- preserves unrelated working functionality;
- works at 320, 390, 768, 1024, 1440 px and wider, and on touch;
- has clear visual hierarchy and follows this specification and the Designporten identity;
- does not fall back to generic AI/SaaS design;
- uses real interactions where functionality is claimed, and does not pretend unfinished features work;
- works with the keyboard, shows visible focus, has correct labels and semantics, and meets WCAG 2.2 AA contrast;
- respects `prefers-reduced-motion`;
- has no runtime errors and no console errors;
- passes the repo's lint, type check and tests;
- has been inspected visually (screenshots at the widths above) where tools allow;
- is maintainable and readable.

Report clearly what is **IMPLEMENTED** and what is **NOT IMPLEMENTED / BLOCKED**. Do not call work complete while a central agreed deliverable is unfinished.

## 6. Working method

After the spec is in place, implementation tasks run to completion without approval stops between normal steps. Only genuine blockers (missing access, assets, permissions or an owner-only decision) are raised. See [CLAUDE.md](CLAUDE.md) for the working rules every thread follows.

## 7. Resolved and open decisions

The four open decisions of the first draft were resolved by Sivert on 2026-09-28:

| ID | Decision |
|---|---|
| D-1 | Platform chosen on the product's requirements: standalone TypeScript app (Astro + Preact + Three.js). See [ADR-001](docs/decisions/adr-001-platform.md). |
| D-2 | The website does not wait for advanced Signgen features. Site and Skaperverksted are developed in parallel; nothing is faked. |
| D-3 | Functional programmatic geometry is allowed; decorative vector artwork and invented decorative SVG icons are not. |
| D-4 | Signgen exports real STL and 3MF. Commercial-use terms, pricing and plan limits are not invented. |

**Missing assets do not stop work** (Sivert, 2026-09-28). Logo, mascot, workshop and product photography use clearly marked temporary placeholders from `public/midlertidig/`, referenced through one asset registry (`src/lib/ressurser.ts`) so final files replace them in one place. No replacement brand assets are invented or presented as final.

Still open (business, needs Sivert): the commerce provider account (Stripe/Vipps or other) and the free/paid terms for Skaperverksted. Neither blocks implementation.
