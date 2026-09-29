# Decision log

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Records where decisions came from, what earlier work is preserved, how conflicts were resolved and what is still open. New decisions are appended with a date.

## Sources inspected for the 2026-09-28 specification

| Source | What it contained |
|---|---|
| Sivert's master brief, 2026-09-28 (project thread "Write the master spec") | The governing instruction for this spec: vision, identity, IA, Skaperverksted, Signgen, generators, motion, a11y, performance, technical principles. Newest explicit source. |
| This repository (`main`, one commit) | README, stub `DESIGNPORTEN_MASTER.md` with the authority rule, `.gitignore`, empty `src/`, `public/`, `docs/*`, `reference/`. No code, no stack. |
| Project folder «Designporten Opus5» | The same README and master stub (identical apart from line endings). |
| Nine concept images posted by Sivert, 2026-09-28 | Signgen editors (light and dark), SVG library, Bézier profile and outline tools, homepage/Produkter/Skaperverksted page concepts, a full page board. Saved in `reference/concepts/`; see [reference/README.md](../../reference/README.md). |
| Test bench «Designporten prøvebenk» (Artifact 98283df1…, last version 2026-09-04) | Working prototype: header, top slider, scroll-driven process slider, product grid and window, category animation, account/checkout mock-ups, palette and font experiments. Saved as `reference/prototypes/provebenk-2026-09-04.html`. |
| Earlier Claude sessions with Sivert: "Designporten visuell design" (Aug 28–30), the test bench sessions (Sep 2–4), "JSON-import og tilpasning" (Aug 30), "AI Bridge lokal tilkobling" (Aug 8) | Working rules, approved directions, corrections, the process slider iterations, WordPress/WooCommerce facts. Read in full from their transcripts. |
| Live www.designporten.no (home, /tjenester.html, /designverksted.html) | Current public copy: «Vi gir ideer form», «Fra tanke til noe du kan berøre», services list, Designverksted «kommer snart», first-person «jeg». |
| WordPress.com account listing | www.designporten.no is a Jetpack-connected site; site-level tools need a paid Jetpack plan, so its admin content could not be read. |

**Not inspectable from here:** files on Sivert's machine (`C:\Users\Sivert\OneDrive\claude\` handoff folders, `claude-build/` prototype pages such as `hjem.html`, `butikk.html`, `lag-noe-eget.php`, `designsystem.html`, the WordPress theme and plugins, the logo SVG at `E:\3d print\designporten\profil\`, product cut-outs in `assets/product-horizon/` and editorial images such as `workshop-hero-concept-v1.webp`, `process-strip-concept-v1.webp`), and the WordPress admin at one.com. No Skaperverksted, Signgen, lamp or dragon generator code or mascot source files were found in any inspected source; the concept images are the only material on those.

## Preserved decisions and work

Earlier explicit decisions by Sivert that remain in force.

| Date | Decision | Where it lives now |
|---|---|---|
| 2026-08-28 | Accessibility target WCAG 2.2 AA | Technical architecture |
| 2026-08-28 | Do not build an own cart, checkout or payment engine | Master §3, technical architecture |
| 2026-08-28 | Generated images are marked as concept material | Brand: imagery |
| 2026-08-28 | Dark surfaces are episodic: workshop process, configurator, footer | Brand: colour rules |
| 2026-08-28 | Gradient only signals action, focus, progress or the brand line (now narrowed to logo and brand line) | Brand: colour rules |
| 2026-08-28 | Do not generate vector graphics without asking; use PNG where transparency is needed | Brand: imagery (scope open in D-3) |
| 2026-08-28 | No invented stats, team, prices or delivery times | Master §2, IA |
| 2026-08-28 | «går for C»: Archivo + IBM Plex Mono, precision direction with visible grid and hairlines | Brand: typography, materiality |
| 2026-09-02 | Product cards square, radius 0, max 6 across, fixed size, centred grid | Interaction: product cards |
| 2026-09-02 | Sticky header that shrinks, rounds and turns translucent on scroll; mobile shows only menu and cart | Interaction: header |
| 2026-09-02 | Product click opens a light window over a darker, blurred page with colour, plastic type and optional text | Interaction: product window |
| 2026-09-02 | Cards leaving on category change fall backwards, rotate and fade | Interaction: product cards |
| 2026-09-02 | Stripe for card payment; Vipps planned | Technical architecture, IA |
| 2026-09-03 | Card does not move on hover; only the cart control reacts; cart icon instead of «Velg»; no material on the card | Interaction: product cards |
| 2026-09-03 | Remove the thin line that slides down on page change; keep the top scroll-progress bar | Interaction: header, page transitions |
| 2026-09-03 | «Hjem» removed from the menu; the logo leads home | IA: navigation |
| 2026-09-03 | Homepage has a top slider, a creative process animation, a CTA and customer proof | IA: homepage (updated by the brief) |
| 2026-09-03 | Process: scroll-based with scroll progress; fade in with a quick slide between sketch, 3D model, prototype and finished product; no violet-blue stripe effect | Interaction: process slider |
| 2026-09-03 | Full-width images; progress bar exactly as wide as the text; small dots on the bar; bar and text centred under the image; background drifts slowly upwards | Interaction: process slider |
| 2026-09-04 | Slider text directly under the image; slider controls on top with the category text | Interaction: process slider, top slider |

## Conflicts resolved

| # | Conflict | Resolution | Reason |
|---|---|---|---|
| C-1 | Identity colours: `#9B4DE0`/`#29ABE2` (logo approximations, test bench), `#7B3FF2`/`#00D4FF` (Aug brand board), `#5433EB` (test bench action), vs `#883DFF`/`#00C4D6` (brief) | `#883DFF` and `#00C4D6` are the identity colours; `#883DFF` is also the action colour (5.0:1 with white) | The brief is newest and explicit; the concept editor's "Designporten Cyan #00C4D6 / Designporten Lilla" swatches agree |
| C-2 | Cool grey canvas `#F2F4F5` (test bench) vs warm off-white (brief) | Warm off-white `#F6F3EE` | Brief is newer and explicit ("warm neutral surfaces, off-white") |
| C-3 | Fonts: Archivo + IBM Plex Mono (chosen Aug 28), Satoshi (old theme), Manrope default in the test bench (a trial, never confirmed), brief bans Inter/generic | Archivo (expressive at wide/heavy settings) + IBM Plex Mono | Keeps Sivert's explicit choice and satisfies the brief's call for character; Manrope was only a test bench default |
| C-4 | Direction: C «Presisjon» (Aug 28) vs Shop.app base (Sep 2, «Jeg liker best Shop delen») vs dark «maker studio» galaxy hero (Codex, Aug) vs the brief | The brief's showroom/workshop identity. From Shop: the product grid, card and window behaviour Sivert specified. From C: type, hairlines, visible grid and mono specs. Galaxy hero retired. | The brief is the newest direction and explicitly asks for materiality and construction language (C) and warns against effects unrelated to the concept (galaxy) |
| C-5 | Hero CTAs: «Kjøp ferdig» sole primary + «Lag noe eget» secondary (Aug 28) vs «START Å SKAPE» + «FORTELL OSS IDEEN DIN» (brief) | Brief labels. The Aug principle survives: one dominant action, the other clearly secondary | Brief is newer; the hierarchy rule does not conflict with it |
| C-6 | Names: «Lag noe eget» meant *send us your idea* (test bench) while the brief's «LAG NOE» means *design it yourself* | «LAG NOE» = Skaperverksted. Special orders are «Spesialdesign» / «HAR DU EN IDÉ?» / «FORTELL OSS IDEEN DIN». «Lag noe eget» is retired to avoid confusion | Brief is newer and defines the three paths |
| C-7 | «Designverksted(et)» (live site, Aug nav, concept 02) vs «Skaperverksted» (brief, concepts 07–08) | Skaperverksted | Brief is newer and explicit |
| C-8 | «Butikk» (test bench, concepts) vs «Produkter» (brief, concepts 07/09) | Produkter | Brief |
| C-9 | Navigation sets differ across test bench (Butikk · Lag noe eget · Om oss), Aug header (Slik fungerer det · For bedrifter) and concepts | Brief IA: Produkter · Skaperverksted · Spesialdesign · For bedrifter · Inspirasjon · Om · Kontakt; logo = home | Brief; the "no Hjem item" rule from Sep 3 is kept |
| C-10 | Process steps: 4 (test bench: Skisse, 3D-modell, Prototype, Ferdig produkt), 4 (live/concepts: Del din idé, Vi designer, Vi produserer, Du mottar), 6 (Aug flow), 5 and 6 (brief) | One process component with N steps; homepage uses the brief's 5 steps, Spesialdesign the brief's 6-step service flow | Preserves the component and uses the brief's newer content |
| C-11 | Concept images show generic patterns the brief forbids: icon-card rows, pills everywhere, purple gradient buttons, glass panels, handwritten script accents, stock-like lifestyle scenes, fake reviews and client quotes | Concepts are used for content, feature scope and editor structure, not for surface styling | Brief §6 and §34 (understand why a reference works; do not copy mechanically) |
| C-12 | Brief: product hover may show another angle; Sep 3: the card does not move on hover | The card stays still; the image may crossfade to another angle; only the cart control changes | Both hold at once |
| C-13 | Brief warns against glassmorphism; Sivert asked for a translucent scrolled header | The scrolled header is the only translucent surface | Sivert's explicit, specific request; one instance is not "excessive" |
| C-14 | Signgen concept 02 shows a wooden «Emilie» sign; brief says Signgen does not make wooden signs | Signgen makes 3D-printed signs only; wood-look filament is a material option | Brief is explicit |
| C-15 | Live site speaks as «jeg»; brief and concepts use «vi» | «vi» | Brief's copy examples; a workshop voice |
| C-16 | Test bench shipped fake content (rating 4.8, 126 reviews, prices, delivery times, shipping costs) marked as placeholders | Placeholders are never published; content appears only when documented | Aug 28 rule, brief §6 honesty |

## Resolved decisions (2026-09-28, Sivert's master execution instruction)

- **D-1 Platform:** evaluate on actual requirements, not old-site compatibility. Result: standalone TypeScript application (Astro + Preact + framework-free core + Three.js), commerce behind a provider boundary. Full comparison in [ADR-001](adr-001-platform.md).
- **D-2 Launch:** the website does not need to wait for every advanced Signgen feature; site and Skaperverksted are developed in parallel; nothing that does not exist is faked.
- **D-3 Vector rule:** functional programmatic geometry is allowed (grids, rulers, measurement marks, construction lines, Bézier curves, geometry paths, editor overlays, snapping guides, technical visualisation). The restriction covers arbitrary decorative vector artwork and invented decorative SVG iconography.
- **D-4 Export:** Signgen supports real STL and 3MF export; it is not order-only. Commercial-use restrictions, pricing, subscription tiers and free/paid limits are not locked and must not be invented.
- **Assets:** missing logo, mascot and photography must not stop work; use clearly identified temporary placeholders that can be replaced cleanly; prefer existing project assets.

## Still open (business)

- Commerce provider account and payment setup (Stripe/Vipps or other). Until then orders are sent as requests; the UI says no payment is taken.
- Free/paid terms, commercial-use rules and prices for Skaperverksted.

## Facts that need confirmation before they are published

Not blocking implementation; content stays out until confirmed.

- Capabilities: UV printing (asked in August, never answered), 3D scanning and reproduction, resin printing, jewellery.
- Materials and colours actually stocked; printers and multi-colour capacity (the brief mentions about four colours).
- Prices, delivery times, response time for enquiries, what an enquiry costs, whether a reprint round is included, whether customers keep their files.
- Real contact details, opening hours, organisation details.
- Real customer reviews and references.
- Lamp fittings (for example E27) and electrical safety wording.
- The dragon generator part library: who models the parts and in which tool.

## Log

| Date | Change |
|---|---|
| 2026-09-28 | Master specification established from the brief and all inspected sources. |
| 2026-09-28 | Spec approved by Sivert. D-1 to D-4 resolved; ADR-001 platform decision recorded. |
| 2026-09-28 | Polygon library: **clipper2-ts** (BSL-1.0) instead of clipper2-js. clipper2-js returned empty results from PolyTree operations and wrong miter offsets in testing; clipper2-ts is a maintained port of the same Clipper2 algorithms. |
| 2026-09-28 | Asset registry path corrected to `src/lib/ressurser.ts` (was `src/content/assets.ts` in the master spec). Generators register through `meta.ts` + `index.ts` discovered by `import.meta.glob`. |
| 2026-09-28 | Signgen CSV batch built in phase 5, as the execution instruction asks. It runs without limits; `core/plangrenser.ts` holds the on/off switch so plan limits become a data change once the paid model is decided. No plan, price or subscription behaviour is shown. |
| 2026-09-28 | Real logo added from Sivert's SVG. The header uses the "dp" mark alone, since the stacked lockup's wordmark is illegible at header height; the footer uses the full lockup. Favicons and a default social preview are generated from the file. See [brand and identity](../design/brand-and-identity.md#logo-and-mascot). |
| 2026-09-29 | Full-width visual pass (Sivert, sections 62–73): the hero is scroll-driven and pinned on desktop; homepage order changed (products after the process, the Skaperverksted portal before the idea band); header gets a sliding nav marker and a graphite state over dark sections; buttons press physically; subpage openings span the full width; the showroom → Skaperverksted view transition is implemented. See [interaction and motion](../design/interaction-and-motion.md) and [information architecture](../content/information-architecture.md#homepage). |
