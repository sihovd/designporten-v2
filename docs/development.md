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

There are two build targets from the same pages. Both pass the same e2e suite.

**Node host** (`npm run build`, then `npm start`): showroom pages are static; the idea form, contact form and order requests run as server routes (`src/server/ruter/`) on the Node adapter and send e-mail over SMTP (`.env`).

**PHP web host without Node, such as one.com** (`npm run build:onecom`): everything is static, and the three server routes are replaced by PHP scripts from `php/` (`api/foresporsel/`, `api/bestilling/`) plus static receipt pages (`src/server/statisk/`). The PHP scripts send e-mail with the host's `mail()`, validate exactly like the TypeScript routes (a unit test keeps the shared lists in step) and check order requests against `api/katalog.json`, which the build writes from the product collection. `dist/` is uploaded as it is; `.htaccess` sets the 404 page, caching and headers. Requires PHP 8.1 or newer and Apache.

**Preview on Render** (`render.yaml`): the Node build runs as a free Render web service, deployed from `main` on every push, at a `*.onrender.com` address. Nothing on one.com is touched. Create it in Render with New → Blueprint and this repository. Form e-mail needs the SMTP variables from `.env.example` under Environment; without them submissions are stored on the server (and lost on redeploy) and the receipt says e-mail is not set up. The free plan sleeps when idle, so the first visit after a pause is slow.

### Shop: content editor and card payment

**Content editor** at `/admin/` (Sveltia CMS, git-based). Products (`src/content/produkter/data/`), uploaded product photos (`src/content/produkter/bilder/`) and the shop settings (`src/content/butikk/innstillinger.json`: the card payment switch and shipping options) are edited there. Signing in uses GitHub: «Sign In with GitHub» needs an OAuth helper, so use «Sign In Using Access Token» with a fine-grained GitHub token that has **Contents: read and write** on this repository only. Publishing commits to `main`, and Render rebuilds the site from that commit. The editor's field lists (categories, materials, colours, concept images, generators) are generated from the same TypeScript the build validates against (`src/lib/admin/oppsett.ts`, served as `/admin/config.yml`), so it cannot offer a value the build rejects. The script is self-hosted from the `@sveltia/cms` devDependency.

**Card payment** uses Stripe Checkout, a hosted payment page (ADR-001: no own payment engine). The cart offers «Gå til betaling» only when all three are true: «Kortbetaling» is switched on in `/admin` → Butikk, `STRIPE_SECRET_KEY` is set on the server, and at least one shipping option exists. The cart also has to hold only products marked «Klar for salg» (`status: bekreftet`) with a price. Placeholders, unpriced products and Skaperverksted designs are still sent as order requests, and the cart says why. The server recomputes every price from the catalogue (`src/lib/handel/kasse.ts`) and never trusts the browser. Server routes (Node build only):

| Route | Does |
|---|---|
| `GET /api/kasse/` | Tells the cart whether card payment is on |
| `POST /api/kasse/` | Checks the cart and returns the Stripe Checkout URL |
| `GET /api/kasse/okt/?okt=cs_…` | The thank-you page `/handlekurv/betalt/` asks whether the session is paid before it empties the cart |
| `POST /api/stripe/webhook/` | Verifies Stripe's signature and e-mails the paid order (same delivery as the forms) |

Setup in Stripe: create the account, take the **test** secret key (Developers → API keys) and put it in Render → Environment as `STRIPE_SECRET_KEY`. Then add a webhook endpoint `https://<site>/api/stripe/webhook/` with the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Turn on customer e-mail receipts under Settings → Customer emails. Orders, refunds and disputes are handled in the Stripe dashboard. Swap to live keys when the shop is ready. The PHP/one.com build has no payment routes; there the cart falls back to order requests.

**Publishing to one.com** is automatic on every push to `main` once these GitHub secrets exist (Settings → Secrets and variables → Actions); without them the workflow skips itself:

| Secret | Value |
|---|---|
| `ONECOM_SFTP_HOST`, `ONECOM_SFTP_BRUKER`, `ONECOM_SFTP_PASSORD` | From one.com: Advanced settings → SSH & SFTP |
| `ONECOM_MAPPE` | The site's own folder on the server, relative to where SFTP logs in (for example `ny` for a subdomain `ny.designporten.no`). Never the root, and the workflow refuses a folder with WordPress files in it (`wp-config.php`, `wp-content`, `wp-admin`, `oc-migrator`) |
| `SKJEMA_TIL` | Where form e-mails go |
| `SKJEMA_FRA` | Sender address; must be a mailbox on the site's own domain |

The workflow (`.github/workflows/onecom.yml`) builds, writes `api/oppsett.php` from the two e-mail secrets, and mirrors `dist/` into the folder, deleting files that are no longer part of the site. It can also be run by hand from the Actions tab; with «Bare vis mappene på serveren» ticked it only lists the folders SFTP sees (three levels), to find the value for `ONECOM_MAPPE`.

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
| `src/skaperverksted/generatorer/drage/` | Dragon generator | Dragon workstream |
| `src/skaperverksted/generatorer/buildforge/` | BuildForge (build engine: clickers, figures) | BuildForge workstream |
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
