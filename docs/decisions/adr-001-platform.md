# ADR-001: Platform and stack

- **Status:** Accepted, 2026-09-28
- **Decided by:** Claude, as instructed by Sivert's master execution instruction of 2026-09-28 (D-1: choose on the product's actual requirements, not compatibility with the old site).
- **Replaces:** the "keep WordPress + WooCommerce" recommendation in the first spec draft.

## Requirements that decide

1. **Skaperverksted is a first-class product:** a large client-side application with a 2D canvas, Three.js, a document model with layers, commands and undo/redo, Bézier profile geometry, polygon booleans, mesh generation, STL/3MF export, workers, and future batch and multiple generators.
2. **The showroom** needs server-rendered HTML for SEO, very small JavaScript, fine control over layout and motion (scroll-driven slider, View Transitions, the portal transition) and strict performance budgets.
3. **Products and content** are few, curated and changed by Designporten itself; they need typed data with a clear "confirmed vs placeholder" status.
4. **Commerce** must use an established provider (no custom payment engine), with card (Stripe) and Vipps planned. No provider account exists for the new site yet.
5. **Maintainability:** one language (TypeScript) across site and editor, tests for geometry, one repository, one build.
6. **Deployment:** simple, cheap, portable; no dependency on one host.

## Options compared

| | A. WordPress + WooCommerce (block theme), editor embedded | B. Standalone Astro site + TS editor, commerce via hosted provider adapter | C. Headless WooCommerce + standalone front end |
|---|---|---|---|
| Skaperverksted | Built separately anyway; mounted via plugin; two build systems | Same repo, same build, shared tokens and components, route-level code splitting | Same as B |
| Showroom control, motion, performance | Theme + block markup constraints; WP/Woo scripts on every page | Full control; zero JS by default; islands only where needed | Full control |
| SEO | Good | Good (static HTML, sitemap) | Good |
| Content editing | WP admin | Typed files in the repo (Markdown/JSON collections); a CMS can be added later behind the same schema | WP admin |
| Commerce | Native Woo cart/checkout, Stripe/Vipps plugins | Adapter boundary; checkout handed to a hosted provider (Stripe Checkout, Vipps, Shopify or Woo) when an account exists | Woo Store API headless cart: most complex |
| Ops | PHP + MySQL host, plugin updates, security patching | Static files + one small Node server for forms/checkout sessions | Both stacks to run |
| Testing | PHP + JS split | One TS toolchain, Vitest + Playwright | Split |
| Coupling to the old site | High | None | Medium |

## Decision

**Option B: a standalone TypeScript application.**

- **Framework:** Astro (static-first HTML, file-based routing, content collections, islands, View Transitions support), with the `@astrojs/node` adapter so the few server routes (idea form, checkout hand-off) run in the same app. Showroom pages are prerendered.
- **Interactive UI:** Preact islands for the Skaperverksted shell and complex showroom widgets (product window, filters). Small behaviours (header, sliders) are plain TypeScript modules.
- **Skaperverksted core:** framework-free TypeScript in `src/skaperverksted/core` (document, layers, transforms, units, commands, history, profiles, serialisation) with unit tests.
- **Geometry:** Clipper2 (`clipper2-js`) for polygon booleans and offsets; `opentype.js` for text outlines; own extrusion and profile meshing; Three.js for rendering.
- **Export:** own STL (binary) and 3MF (zip + XML model with per-object materials) writers, validated by tests (manifold checks, parse-back).
- **Commerce:** a `CommerceProvider` interface. The shipped provider is **"forespørsel"** (enquiry): the cart is kept in the browser and "Send bestilling" sends it as an order request through the same server route as the idea form. No payment is taken and the UI says so. A hosted checkout provider is added when Designporten has an account (business decision, needs credentials).
- **Content:** Astro content collections with Zod schemas. Every product and case carries `status: "bekreftet" | "plassholder"`; placeholder data is visibly marked in the UI.
- **Forms:** server route validates and delivers by e-mail (SMTP from environment variables). Without SMTP configured (development), submissions are written to `var/innsendinger/` and the response says so; production start refuses to run the form route unconfigured rather than silently dropping messages.
- **Tooling:** npm, TypeScript strict, ESLint (typescript-eslint, astro plugin), Prettier, Vitest, Playwright + axe, `astro check`.
- **Deployment:** `npm run build` produces `dist/` (static client files + a Node server entry). Any Node 22 host or container works. For PHP web hosting without Node (one.com), `npm run build:onecom` produces a static site with the form and order routes as PHP scripts (2026-09-29, see the decision log).

## Consequences

- The old WordPress site is not reused. Content moves into typed files; a headless CMS can be added later without changing page code.
- Payment is not live until a provider account exists. This is stated in the UI and in the final report.
- One repository and toolchain for site and editor; parallel threads share tokens, components and the core model.
