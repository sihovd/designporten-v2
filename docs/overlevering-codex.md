# Handover to Codex: the service platform (accounts, projects, packages)

Written 2026-10-19 by Claude for Sivert, who continues this work with Codex from another machine. Everything Codex needs is in this repository. The delivery folders Claude wrote during the work (zips, test guides) are **not** in GitHub, but every package can be rebuilt with the commands below.

State: `main` at `a34d1a4` (PR #52, merged by Sivert 2026-10-18 23:30 UTC). Stages A–D of Sivert's work order «tjenesteplattform» rev. 2 and the Skaper package are all in `main`.

## Read first

1. [`CLAUDE.md`](../CLAUDE.md) (working rules, also for Codex via [`AGENTS.md`](../AGENTS.md)) and [`DESIGNPORTEN_MASTER.md`](../DESIGNPORTEN_MASTER.md).
2. [`docs/architecture/tjenesteplattform.md`](architecture/tjenesteplattform.md): the goal, the parts and their owners, stages A–E.
3. [`docs/konto.md`](konto.md): accounts, e-mail, payment status, packages, projects on the account, open questions.
4. [`docs/utgivelse.md`](utgivelse.md): one package per part, install order, rollback.
5. [`docs/lansering-onecom.md`](lansering-onecom.md) and [`docs/development.md`](development.md): building, testing and one.com.
6. [`docs/decisions/decision-log.md`](decisions/decision-log.md): rows from 2026-10-17 and 2026-10-18 hold every decision in this work.

## Sivert's standing rules for this work

- **Never push to `main`**: Render deploys it automatically. Work on a branch and open a pull request. Only Sivert merges.
- No production publishing, production migration, DNS change or payment settings without Sivert's explicit word for that step. Never create paid services.
- **one.com:** a separate developer manages it and holds the SFTP access. Do not reset the SFTP password (it locks the developer out). Do not delete or overwrite anything in existing one.com folders (`test.designporten.no` holds work that may be the developer's). Test installs go to their own folder (`/designporten-test/`).
- Never ask for passwords in chat. Never commit `api/konto/konfig.php`, `api/cms/konfig.php`, test databases, captured e-mail or tokens. `npm run pakk:deler` and `pakk:kilde` refuse them and run a secret scan.
- No real e-mail is sent from a test build (the code refuses it), and no production data in automated tests.
- Prices: the only paid package is **Skaper, 59 kr/mnd or 590 kr/år incl. VAT, 50 projects and CSV** (Sivert 2026-10-18). Price and quota are changed in Studio (Medlemmer og skilt → Pakker og priser), not in code. It cannot be bought: there is no payment flow and there are no sales terms yet. Do not invent other packages, prices or terms.
- CSV is free for everyone until payment is ready (`gratisperiode` in `php/api/konto/tjenester.json`). Saved projects can always be opened and downloaded, also over the quota.
- Keep `/skaperverksted/signgen/` and `?mal=` / `?prosjekt=` links working.
- Copy in Norwegian bokmål; code identifiers Norwegian in ASCII (`leggTil`, `hoyde`).

## What is done (verified locally, not on one.com)

| Stage | What | Where |
|---|---|---|
| A | Accounts independent of the CMS (own `api/konto/konfig.php`, own migrations); #49 integrated with #50; one navigation contract; source zip + git bundle without GitHub | `php/api/konto/`, `scripts/kildepakke.mjs`, `scripts/kartlegg-konto.php` |
| B | Register, sign in/out, confirm e-mail, reset/change password and e-mail, suspension, account deletion, access per service/feature, rate limits, Min konto (Mine prosjekter, Mine tjenester, Profil) | `php/api/konto/`, `src/components/konto/KontoSide.tsx`, `src/components/cms/Medlemmer.tsx` |
| C | Projects on the account: one table `dp_prosjekter`, owner from the session, revision conflicts (409), 2 MB, quota across apps, Sign Forge «Lagre på kontoen» / «Mine prosjekter på kontoen» | `php/api/konto/_prosjekter.php`, `src/skaperverksted/shell/Kontoprosjekter.tsx` |
| D | Packages `nettside`, `konto`, `signforge` with manifests; Sign Forge has its own Vite build under `skaperverksted/signgen/_app/<versjon>/`; packages never delete; rollback tested | `scripts/bygg-signforge.mjs`, `scripts/pakk-deler.mjs`, `scripts/utgivelse.test.mjs` |
| Skaper | `planer.skaper` in `tjenester.json`; price/quota per package editable in Studio, stored in `dp_konto_planer` (migration 5) | `konto_planer()` in `php/api/konto/_konto.php` |

Tests at `a34d1a4`: `npm run verify` green (609 unit, PHP/deploy tests), 221 e2e, 39 one.com e2e, account API tests on SQLite and on MariaDB 10.11 (92 with the CMS tests). CI green.

## What is left, in the order Claude recommends

1. **Production e-mail (blocks opening accounts to customers).** The code has two drivers in `php/api/konto/_epost.php`: `fil` (writes to a folder outside the web root; tests and test builds, readable in Studio) and `mail` (PHP `mail()`, refused on test builds). SMTP is not built; it needs PHPMailer, a new dependency and Sivert's decision. Sivert must choose `mail()` on one.com or SMTP, and the sender address on the site's own domain. With `mail()`: set `'epost' => ['driver' => 'mail', 'fra' => '…']` in the production `api/konto/konfig.php` (template: `php/api/konto/konfig.eksempel.php`) and send one real confirmation to an address Sivert owns, with his OK. Nobody has tested whether one.com delivers it (SPF/DKIM for the sender domain must be checked).
2. **Test install on one.com** in `/designporten-test/`, with its own test database and its own `api/konto/konfig.php` (driver `fil`, folder outside the web root, e.g. under `httpd.private`). Build with `npm run build:onecom:test` then `npm run pakk:deler`, upload in order `nettside`, `konto`, `signforge` (see `docs/utgivelse.md`). Check that the upload client keeps dotfiles (`.htaccess`). Then walk the customer journey: register → confirm (captured mail in Studio) → open Sign Forge → «Lagre på kontoen» → open in a second browser. This needs whoever has one.com access (Sivert or the developer). Nothing here has run on one.com's MySQL yet.
3. **Before any production migration:** run `php scripts/kartlegg-konto.php` against the production database (read-only, counts only) and take a database backup. Migrations only add (1–5).
4. **Own database user for the accounts** with rights only to the `dp_*` tables, if the one.com plan allows it. Not done.
5. **Stage E** (needs Sivert's go): document the connection contract for Form Forge and Dragon Forge (how an app gets an `app` id in `prosjektapper`, its project format check, the quota). Documentation only; do not implement.
6. **Hardware test of canvas navigation** (trackpad, mouse, touch): the list is in `docs/design/skaperverksted.md` under «Navigation». Nothing was tried on a physical device.
7. **Backups:** keep the git bundle from `npm run pakk:kilde` somewhere outside the work disk. The Studio backup does not include members, projects or gallery signs yet.

Also open for Sivert (not code): sales terms and payment provider (Stripe Checkout / Vipps, hosted flows only), when the CSV free period ends, licence terms for gallery signs.

## How to build and test

```bash
npm ci
npm run verify                 # format, lint, typecheck, unit tests, PHP/deploy tests, build
npm run test:e2e               # Playwright against the Node build
npm run build:onecom:test      # the one.com test build in dist/ (run AFTER verify: verify's build overwrites dist)
npm run test:e2e:onecom        # Playwright against dist/ with PHP
npm run pakk:deler             # var/release/deler/<del>-test-<versjon>.zip + manifest per part
npm run pakk:kilde             # source zip + git bundle (needs a clean tree)
```

Account API tests on MariaDB/MySQL instead of SQLite: set `DP_CMS_MYSQL="host=127.0.0.1;port=3307"`, `DP_CMS_BRUKER` and `DP_CMS_PASSORD` for a local test server, then `node --test scripts/konto*.test.mjs scripts/cms.test.mjs`. Use a throwaway database, never production.

Known quirks: Sign Forge at 320 px is 38 px wider than the screen (sideways toolbar, older than this work). One lamp test can be flaky under heavy parallel load.

## Not verified by anyone yet

Upload to one.com and `.htaccess` handling there, one.com's MySQL, real e-mail delivery, a paid package in real use, the plate 3MFs in Bambu Studio, and a physical print.
