# Development guide

How to run, test and extend Designporten 2.0. The product rules are in [DESIGNPORTEN_MASTER.md](../DESIGNPORTEN_MASTER.md); the platform decision is [ADR-001](decisions/adr-001-platform.md).

## Requirements

- Node 22 or newer, npm 10.
- For end-to-end tests: Chromium (Playwright). In the Claude cloud environment Chromium is preinstalled at `/opt/pw-browsers`; locally run `npx playwright install chromium` once.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Development server at http://localhost:4321 |
| `npm run build` | Production build into `dist/` (static client + Node server) |
| `npm start` | Run the production build (`HOST`, `PORT` env vars) |
| `npm run build:onecom` | Static build with PHP form routes, for web hosts without Node (one.com); see [Deploy](#deploy) |
| `npm run check` | Astro + TypeScript type check |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests at desktop and mobile sizes (Playwright + axe); builds and starts the server itself |
| `npm run verify` | Everything except e2e, in CI order |

Copy `.env.example` to `.env` to configure e-mail delivery for forms. Without SMTP, development stores submissions in `var/innsendinger/`.

## Deploy

There are two build targets from the same pages. Both pass the same e2e suite. The live site is the PHP build on one.com; the Node build is for local runs and tests.

**Node host** (`npm run build`, then `npm start`): showroom pages are static; the idea form, contact form and order requests run as server routes (`src/server/ruter/`) on the Node adapter and send e-mail over SMTP (`.env`).

**PHP web host without Node, such as one.com** (`npm run build:onecom`): everything is static, and the three server routes are replaced by PHP scripts from `php/` (`api/foresporsel/`, `api/bestilling/`) plus static receipt pages (`src/server/statisk/`). The PHP scripts send e-mail with the host's `mail()`, validate exactly like the TypeScript routes (a unit test keeps the shared lists in step) and check order requests against `api/katalog.json`, which the build writes from the product collection. `dist/` is uploaded as it is; `.htaccess` sets the 404 page, caching and headers. Requires PHP 8.1 or newer and Apache.


### Shop: content editor and card payment

**Shop editor: Studio** (one.com build, `/cms/` → Butikk og betaling, administrators only). Every product field (status, visible/hidden, name, category, price, texts, main and extra picture from the media library, dimensions, materials, colours from the fixed list, own text, Skaperverksted tool, order), new products, the card payment switch and shipping are edited there and apply at once. The rows in `cms_butikk` are written to `api/cms/data/butikk.json`; `php/api/_butikk.php` merges them over the build catalogue (`api/katalog.json`, which also carries the fixed lists under `referanse`). With that file present, `.htaccess` sends product and category pages to `php/api/cms/side.php`: product pages are filled from the product template the build writes (`src/pages/produkter/[slug].astro` with `lagerMal`, moved to `api/cms/maler/produkt.html`; placeholders `§felt§`, `<!--hvis:…-->` and `<!--gjenta:…-->`, see `src/lib/handel/mal.ts`), and every product grid (`data-utvalg`) is rebuilt by `php/api/_katalog.php`, which also injects `<script id="dp-katalog">` for the cart and the product choices (`src/lib/handel/overstyring.ts`). The files in `src/content/produkter/` and `src/content/butikk/` are the build defaults. Categories, material types, colours and tools stay in code.

**Page texts.** The words on the homepage, Om, Spesialdesign, For bedrifter and Kontakt live in `src/content/sider/<side>.json`, one file per page, described once in `src/lib/sidetekster/definisjon.ts`. That definition drives the build's validation (a missing or empty field stops the build) and the field list in Studio. Pages read them with `sidetekst('forside')`: `t('helt.tittel')` gives the text and `t.r('helt.tittel')` marks the element editable (`data-rediger="sider/forside#helt.tittel"`). On the one.com build Studio publishes them from the database and «Rediger innhold» edits them in place for a signed-in editor (`src/scripts/redigering.ts`); the files are the defaults. Prettier skips `src/content/**/*.json`.


What stays in code: links, pictures, prices, product facts, the process timeline's steps, header and footer navigation, form labels and the legal pages.

**Own CMS (one.com build).** `/cms/` and `php/api/cms/` keep page texts and the hero images (media library, upload, inline image swap) in a MySQL database on the web host, with drafts, publishing without a rebuild, history, roles, an agent API and backup. The texts in `src/content/sider/` are then the defaults. It is off until `api/cms/konfig.php` exists on the host. Everything about it, including how to switch it on, is in [docs/cms/README.md](cms/README.md). Tests: `scripts/cms.test.mjs` (in `npm run test:deploy`, needs PHP with pdo_sqlite and GD; set `DP_CMS_MYSQL`, `DP_CMS_BRUKER`, `DP_CMS_PASSORD` to run it against real MySQL) and `tests/onecom/cms.spec.ts`.

**Member accounts and the sign gallery (one.com build).** `/konto/` and `php/api/konto/` keep member accounts and the gallery «Nylig laget» of signs that members publish themselves from Sign Forge. The accounts have their own settings (`api/konto/konfig.php`; without it they are off, there is no automatic fallback to the CMS's settings) and run without the CMS. Everything is in [docs/konto.md](konto.md); the larger plan (one account, separate apps) is in [architecture/tjenesteplattform.md](architecture/tjenesteplattform.md). Tests: `scripts/konto.test.mjs`, `scripts/konto-sikkerhet.test.mjs` (stage B: links, e-mail, suspension, access, the upgrade from stage A) and `scripts/konto-prosjekter.test.mjs` (stage C: projects, quota, packages, conflicts; both in `npm run test:deploy`, shared helpers in `scripts/konto-testhjelp.mjs`; set `DP_CMS_MYSQL`, `DP_CMS_BRUKER`, `DP_CMS_PASSORD` to run them on MySQL/MariaDB) and `tests/onecom/cms.spec.ts`. Account e-mail on the local PHP preview is captured in `var/konto-post/`, never sent.

**Packages per part (stage D).** `npm run build:onecom[:test]` builds Sign Forge on its own (`scripts/bygg-signforge.mjs`, into `skaperverksted/signgen/_app/<versjon>/`), and `npm run pakk:deler` splits `dist/` into the parts `nettside`, `konto` and `signforge`, each with a zip and a manifest in `var/release/deler/`. Ownership, install order and rollback: [utgivelse.md](utgivelse.md). Tests: `scripts/utgivelse.test.mjs`.

**Source package without GitHub.** `npm run pakk:kilde` writes `var/release/kilde/`: a zip of the committed source, a git bundle with the checked-out delivery branch and the history it needs, no other branches (`git clone designporten-<commit>.bundle` restores it), and `manifest.json` with commit, branch, the bundled refs, the secret scan, whether the working tree had uncommitted changes (they are not packed) and a SHA-256 per file. Before anything is kept, the zip's contents and every file version and commit message in the bundle are scanned for secrets (`scripts/hemmeligheter.mjs`: key formats, passwords and tokens written as values, settings file names); a hit stops the package. `scripts/pakk-onecom.mjs` runs the same content scan on a deployment zip. A copy in the same cloud or on the same disk is not a backup; keep one somewhere else.

**Card payment** uses Stripe Checkout, a hosted payment page (ADR-001: no own payment engine). The cart offers «Gå til betaling» only when all three are true: «Kortbetaling» is switched on in Studio → Butikk og betaling, `STRIPE_SECRET_KEY` is set on the server, and at least one shipping option exists. The cart also has to hold only products marked «Klar for salg» (`status: bekreftet`) with a price. Placeholders, unpriced products and Skaperverksted designs are still sent as order requests, and the cart says why. The server recomputes every price from the catalogue (`src/lib/handel/kasse.ts`) and never trusts the browser. Server routes (both builds; the PHP twins are `php/api/kasse/` and `php/api/stripe/`):

| Route | Does |
|---|---|
| `GET /api/kasse/` | Tells the cart whether card payment is on |
| `POST /api/kasse/` | Checks the cart and returns the Stripe Checkout URL |
| `GET /api/kasse/okt/?okt=cs_…` | The thank-you page `/handlekurv/betalt/` asks whether the session is paid before it empties the cart |
| `POST /api/stripe/webhook/` | Verifies Stripe's signature and e-mails the paid order (same delivery as the forms) |

Setup in Stripe: create the account, take the **test** secret key (Developers → API keys) and put it in the server environment as `STRIPE_SECRET_KEY` (Node build). Then add a webhook endpoint `https://<site>/api/stripe/webhook/` with the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Turn on customer e-mail receipts under Settings → Customer emails. Orders, refunds and disputes are handled in the Stripe dashboard. Swap to live keys when the shop is ready. On one.com the keys go in `api/stripe/konfig.php` on the server (template `php/api/stripe/konfig.eksempel.php`; never committed, never sent by publishing); live keys are refused there unless the file says `'tillat_live' => true`, and always on test builds. Step-by-step guide in Norwegian: [betaling.md](betaling.md).

**Publishing to one.com:** see [the launch procedure](lansering-onecom.md) for verified backups, root cutover, release provenance, local PHP tests and the exact secrets for the safe test workflow. Root publication is separate from the test SFTP job.

## Project structure and ownership

Parallel work stays inside its own folders. Shared foundations change only in small, explicit commits, and only by the foundation owner unless agreed.

| Path | What | Owner |
|---|---|---|
| `DESIGNPORTEN_MASTER.md`, `docs/` | Specification and decisions | Foundation (spec changes are logged) |
| `src/styles/` (`tokens.css`, `base.css`, `bevegelse.css`), `src/tokens/` | Design tokens, base, motion | Foundation |
| `src/layouts/`, `src/components/Header.astro`, `Footer.astro`, `Knapp.astro`, `Ikon.astro`, `Konseptbilde.astro` | Site shell and primitives | Foundation |
| `src/lib/navigasjon.ts`, `src/lib/ressurser.ts`, `src/lib/kontakt.ts` | IA, asset registry, contact data | Foundation (add entries, don't restructure) |
| `src/lib/skjema/`, `src/server/`, `php/` | Form delivery (e-mail / dev file store), server routes, PHP versions for one.com | Foundation |
| `src/pages/` showroom pages, `src/components/showroom/`, `src/content/inspirasjon/` | Home, Spesialdesign, Bedrift, Inspirasjon, Om, Kontakt, Søk, legal, 404 | Showroom workstream |
| `src/pages/produkter/`, `src/pages/handlekurv/`, `src/components/produkt/`, `src/content/produkter/`, `src/lib/handel/` | Products, cart, commerce boundary | Products workstream |
| `src/skaperverksted/core/`, `geometri/`, `eksport/`, `shell/`, `render2d/`, `render3d/` | Shared editor architecture | Foundation (Skaperverksted) |
| `src/skaperverksted/generatorer/signgen/` | Signgen | Foundation (Skaperverksted) |
| `src/skaperverksted/generatorer/lampe/` | Lamp generator | Lamp workstream |
| `src/skaperverksted/generatorer/buildforge/` | BuildForge (build engine: clickers, figures) | BuildForge workstream |
| `src/skaperverksted/generatorer/creatureforge/` | Creature Forge (articulated figures, loose joints, Boolean dome; separate from Dragon Forge and BuildForge) | Creature Forge workstream |
| `src/pages/skaperverksted/` | Hub and editor routes | Foundation (Skaperverksted) |
| `public/midlertidig/` | Temporary placeholder assets | Anyone adds; all referenced via `src/lib/ressurser.ts` |
| `tests/e2e/` | Browser tests, one file per area | Each workstream its own file |

## Conventions

- **Language:** UI copy in Norwegian bokmål. Code identifiers in Norwegian ASCII (æ→ae, ø→o, å→a), following the spec's domain words: `lag` (layer), `objekt`, `hoyde`, `utvalg` (selection), `utsnitt` (viewport), `historikk`, `profil`, `materiale`, `eksport`. Comments in English.
- **Styling:** tokens only (`var(--…)`); no hard-coded colours outside `tokens.css` and `src/tokens/index.ts`. Scoped `<style>` in Astro components. No CSS framework.
- **JavaScript on showroom pages:** none by default. Small behaviours are `<script>` modules; complex widgets are Preact islands with `client:visible` or `client:idle`. Skaperverksted is `client:only="preact"` on its own route.
- **Images:** always through the registry in `src/lib/ressurser.ts` and the `Konseptbilde` component, so concept images carry their label and final assets replace placeholders in one place.
- **Honest content:** product and case data carry `status: 'bekreftet' | 'plassholder'`; placeholders are visibly marked. No invented prices, reviews, stats or contact details.
- **Accessibility:** every interactive element keyboard reachable with visible focus; dialogs use `<dialog>` with focus return; targets ≥ 24 px (44 px on touch); reduced motion respected.
- **Tests:** unit tests next to the code (`*.test.ts`); geometry and export always have tests. E2E per area in `tests/e2e/<area>.spec.ts`.
- **Commits:** one coherent change per commit, imperative subject line.

## Skaperverksted architecture in one page

- `core/dokument.ts` — the document: `lag` (bottom to top), `objekter`, `rekkefolge`, `parametre`, `plate`. Millimetres; X right, Y back, Z up; origin at the plate centre. Plain JSON.
- `core/historikk.ts` — undo/redo over immutable snapshots; `slaSammen` merges drags into one step.
- `core/arbeidsbenk.ts` — runtime state for one open editor: history, selection (`utvalg`), viewport (`utsnitt`), settings, the latest built model (debounced rebuild).
- `core/generator.ts` — the plug-in contract: `nyttDokument`, `byggModell` (pure; returns `ModellDel[]` + warnings) and UI contributions to the shell (`Lerret2d`, `Venstrepanel`, `Inspektor`, `Bunnbrett`, …). Optional `eksport` rules let a generator block export with a reason, show a notice, offer one STL per part and attach a report.
- `core/profil.ts` — side profiles as Bézier chains in normalised space; presets rett, avrundet, konveks, konkav, s-kurve, trapp, fas; `profilOverheng` for printability warnings.
- `core/rutenett.ts` — adaptive 1-2-5 grid, cm/mm switching.
- `core/materialer.ts` — material and printer catalogue (unconfirmed data flagged).
- `geometri/` — polygons, booleans and offsets (Clipper2), text outlines (opentype.js), SVG import, extrusion with profiles, mesh checks.
- `eksport/` — STL (binary) and 3MF writers.
- `shell/` — the shared workspace UI (workshop bar, tool rail, panels, sheets, status bar, 3D view).
- `core/plangrenser.ts` — capability limits per plan; one config object, no limits until the paid model is decided.
- `generatorer/<id>/` — one folder per generator, discovered by `generatorer/index.ts`.

To add a generator: create `generatorer/<id>/meta.ts` (a light `GeneratorMeta` for the hub and routes) and `generatorer/<id>/index.ts` (default export: the `GeneratorPlugin`, loaded lazily). Both are picked up by `import.meta.glob`, so the generator appears in the hub and at `/skaperverksted/<id>/` without touching shared files.
