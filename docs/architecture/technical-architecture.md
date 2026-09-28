# Technical architecture

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Covers stack constraints, repository layout, the Skaperverksted domain model, rendering, export, responsive behaviour, accessibility and performance.

## Principles

- Work with the existing stack unless there is a strong technical reason to change it. Check for an existing solution before adding a dependency.
- Reuse components where reuse is real. No abstractions for hypothetical needs; extensibility only where a future requirement is known (the generator ecosystem, batch, profiles, plan limits).
- Product and geometry logic are separate from presentation.
- Nothing is built that only works at one viewport size.
- No custom cart, checkout or payment engine (Sivert, 2026-08-28).
- Do not refactor unrelated working code while editing a file.

## Stack

### Current state (inspected 2026-09-28)

- **This repository:** documents and empty folders only; no stack chosen (README).
- **Live designporten.no:** a simple set of static-looking pages («Vi gir ideer form», /tjenester.html, /designverksted.html «kommer snart»). The WordPress site registered for www.designporten.no is Jetpack-connected; the earlier sessions record WordPress + Divi 5.11.1 + WooCommerce 11.0.1 at one.com, with all old pages trashed on 2026-08-30 by Sivert to start over.
- **Aug–Sep 2026 prototype work** on Sivert's machine: a WordPress block-theme port (`wordpress/designporten/`, `theme.json`), plugins `designporten-projects` and `designporten-shop` (WooCommerce attributes `pa_farge`, `pa_plasttype`, custom text option, HPOS), a Stripe/Vipps plan (`DATABASE-OG-BETALING.md`). These files are not in this repo and are legacy, not source of truth.

### Fixed constraints (regardless of D-1)

- **Commerce and payments:** an established platform. WooCommerce is the existing choice; card via Stripe, Vipps as a separate gateway.
- **Skaperverksted:** a client-side TypeScript application (strict mode), built with Vite, with Three.js for 3D. Its core packages have no dependency on any UI framework or on WordPress.
- **Showroom pages:** server-rendered HTML with progressive enhancement; the page is complete without JavaScript except for the interactive sequences.
- **Fonts, images and 3D assets** are self-hosted.
- **Languages:** TypeScript, modern CSS (custom properties, container queries, `:has`, View Transitions with fallback). No CSS-in-JS runtime.
- **Quality tooling:** ESLint, Prettier, type check, Vitest for unit tests (geometry and domain above all), Playwright for end-to-end and visual checks at the standard widths, axe for automated accessibility checks. All run in CI.

### Recommended default for D-1

Keep **WordPress + WooCommerce at one.com**, replace Divi with a **new custom block theme** built from the tokens in this spec, use WooCommerce's own Cart and Checkout blocks, and mount Skaperverksted as a separately built app inside a WordPress page through a small plugin. Skaperverksted orders go to the WooCommerce cart through the Store API as a configurable product with the design attached.

**Why:** it reuses the hosting, commerce, payment plan and admin Sivert already has, gives him an editor for content, and keeps the heavy, novel work (Skaperverksted) in a clean TypeScript codebase that does not depend on WordPress. The alternative, a standalone front end (for example Astro) with WooCommerce headless, gives more control over transitions but adds a second deployment and a headless cart to maintain.

The choice is Sivert's (hosting, cost, who edits content). Phase 0 locks it.

## Repository layout (target)

```
DESIGNPORTEN_MASTER.md      authoritative spec entry point
CLAUDE.md                   working rules for people and agents
docs/                       spec detail (design, content, architecture, decisions)
reference/                  concept images and preserved prototypes (not shipped)
public/                     static assets: brand/, fonts/, images/, icons/, models/
src/
  tokens/                   design tokens (CSS custom properties + TS export)
  site/                     showroom: theme templates/blocks or pages, components, styles
  components/               shared UI components (header, cards, process slider, dialogs)
  skaperverksted/
    core/                   pure TS: units, geometry, document model, history, validation
    render2d/               canvas renderer, grid, rulers, hit testing
    render3d/               Three.js scene, materials, view cube
    export/                 3MF, STL writers
    shell/                  workspace UI (tool rail, panels, inspector, sheets)
    generators/
      signgen/
      lampe/
      drage/
tests/                      e2e and visual tests
```

The exact `src/site/` shape follows the D-1 decision (block theme vs pages). Everything else is stable.

## Domain model

The shared Skaperverksted model. Names are English in code; UI text is Norwegian.

| Concept | Description |
|---|---|
| `Units` | All geometry in millimetres (float). Formatting and parsing of user input live here. |
| `Vec2`, `Transform2D` | Position, scale, rotation (degrees) relative to the plate origin. |
| `Shape2D` | Closed paths (outer + holes) in mm; boolean union/difference/offset operations. Sources: text (font outlines), imported SVG, primitives. |
| `SceneObject` | `{ id, kind: 'text' \| 'svg' \| 'shape' \| generator-specific, source, transform, locked, visible, name }`. Text objects can be marked as a batch **field**. |
| `Layer` | `{ id, name, objectIds[], zBottom, height, materialId, profile, visible, locked }`. Order is physical order. |
| `Profile` | `{ kind: 'straight' \| preset, points: BezierPoint[], width, symmetric, reference: 'self' \| {layerId} }`. `straight` in the MVP. |
| `LayerInfluence` | An outline from one layer applied to another: `{ sourceLayerId, targetLayerId, operation: 'add' \| 'cut', offset }`. Phase 5. |
| `Material` | `{ id, name, type (PLA, PLA Silk, PETG, resin …), colourHex, finish, printer constraints (min wall, max overhang, nozzle), availability }`. Catalogue data from Designporten, not UI tokens. |
| `PrinterProfile` | Build volume, nozzle, layer height, number of colours per print (for example 4), plate size. |
| `Document` | `{ id, generator, version, units:'mm', plate, layers[], objects{}, parameters{}, meta }`. Serialisable to JSON with a schema version and migrations. |
| `Selection` | Selected object/layer ids; separate from the document so it is not in undo history. |
| `Viewport` | Zoom, pan, view mode (2D/3D), camera. Not in the document. |
| `Command` / `History` | Every document change is a command with `apply`/`invert`; drags coalesce. |
| `PlanLimits` | Capability limits per plan (max layers, SVGs, text objects, CSV on/off, watermark). One config object; default = no limits in development, set by Sivert later. |
| `Variant`, `BatchJob` | For CSV: field values per row, grouping keys (colour combination, material, alphabetical), plate assignment. Phase 5+. |
| `ExportJob` | Document → meshes per layer/material → 3MF/STL, plus preview PNG and a JSON copy of the document for production. |

### Geometry pipeline (Signgen)

1. Text → outlines (opentype.js or equivalent) in mm; SVG → paths (parsed, flattened to curves with tolerance).
2. Per layer: union of object outlines (+ layer influence in Phase 5) using a robust polygon clipping library (Clipper2 via WASM or equivalent).
3. Extrusion: straight in the MVP; profile-driven wall generation in Phase 5 (the outline is offset per profile sample and stitched into a watertight mesh).
4. Mesh validation (manifold, no self-intersections) before export.
5. Heavy steps run in a **Web Worker** so the UI never freezes.

Library choices are confirmed in Phase 2/3 after a small spike; the constraints are: maintained, permissive licence, works in a worker, no server round trip needed for preview.

### Export

- **3MF** as the production format: one mesh per layer/material with colour metadata, correct units (mm).
- **STL** per layer/material as a fallback.
- Every order stores: the document JSON, the 3MF and a preview PNG.
- Whether customers may download files is open decision D-4.

## Rendering

- **2D canvas:** HTML canvas (with devicePixelRatio scaling) for the grid, rulers and geometry; DOM overlays for handles and text inputs so they stay accessible. Redraw on demand (dirty flags), not every frame.
- **3D:** Three.js, loaded only when the 3D view or a generator opens. Physical materials approximating PLA matt/silk/PETG; soft studio lighting; view cube; orbit with damping; frameloop paused when idle.
- **Homepage hero:** images/video first; any WebGL enhancement is lazy, below 150 KB compressed, and skipped on low-power devices, `saveData` and reduced motion.

## Responsive behaviour

- Breakpoints (content-driven, tokens in Phase 0): 390 (phone), 768 (tablet), 1024 (small desktop), 1440 (desktop). Tested also at 320 px.
- Mobile is designed, not shrunk: simple navigation, obvious primary action, touch targets ≥44 px (≥24 px absolute minimum for dense controls, WCAG 2.2), readable 16 px+ body text, editors adapted to touch with sheets.
- Container queries for components (cards, panels) so they adapt to where they are placed.
- No horizontal page scroll at any width.

## Accessibility (WCAG 2.2 AA)

Built into components from the start, not added at the end.

- Semantic HTML landmarks and headings; one `h1` per page.
- Every interactive element is keyboard reachable with a visible focus ring (2 px `--dp-lilla` on light, `--dp-cyan` on dark, 2 px offset).
- Contrast: text ≥4.5:1, large text and UI components ≥3:1 (palette values in the brand doc are checked).
- Labels for every control; icon-only buttons have accessible names.
- Dialogs trap focus and restore it; sheets and menus are proper disclosure/dialog patterns.
- Sliders and carousels: pausable, not auto-advancing without controls, announce state.
- `prefers-reduced-motion` respected everywhere (see the interaction doc).
- Alternative text for all meaningful images; concept images say so.
- Editor: all objects reachable and editable through the Layers panel and Inspector with the keyboard; canvas actions have keyboard equivalents; live region announces selection and value changes; 3D view has a text summary (dimensions, layers, colours).
- Forms: visible labels, clear errors next to the field, no information conveyed by colour alone.
- Automated checks (axe) in CI plus a manual keyboard pass per feature.

## Performance

Budgets (showroom pages, mobile, 4G, mid-range device):

| Metric | Budget |
|---|---|
| LCP | ≤ 2.5 s |
| CLS | ≤ 0.05 |
| INP | ≤ 200 ms |
| JS on first load (showroom) | ≤ 90 KB compressed |
| Fonts on first load | ≤ 2 files, WOFF2, subset |

- Images: AVIF/WebP with responsive `srcset`, explicit dimensions, lazy below the fold, hero image preloaded.
- Skaperverksted, Three.js and generator code load on intent (hover/focus on the entry, or route), with a skeleton workspace while loading.
- 3D assets: glTF/GLB with Draco or Meshopt compression; dragon parts as a small library loaded per part.
- Animation on the compositor only; off-screen work paused.
- Avoid unnecessary re-renders in the editor: the document model notifies by change sets; panels subscribe to the slices they show.
