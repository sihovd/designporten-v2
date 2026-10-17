# Member accounts and the sign gallery

Asked for by Sivert on 2026-10-16; decision log entry 2026-10-17.

## What it does

- **Members** are visitors with an account (name, e-mail, password). They are not CMS users: CMS users run the site, members use it. Sign up and sign in at `/konto/` («Min konto»), linked from the footer on the PHP build.
- **Signs are private; the maker publishes.** Since 2026-10-17 (Sivert): nothing is shared on download or in the cart. A signed-in member chooses **Fil → «Publiser i galleriet …»** in Sign Forge; the dialog shows the picture the gallery will show, says the text becomes public, and publishes, updates or removes the sign («Fjern fra galleriet»). Guests cannot publish. The CSV rows are never published, only the open sign. Signs that PR #49's earlier automatic sharing put in the gallery stay as they are (nothing is taken down automatically); the browser that shared them as a guest keeps the key to remove them.
- **Templates from the gallery:** «Bruk som mal» on the site opens `/skaperverksted/signgen/?mal=<id>`; inside Sign Forge, «Fra mal» lists «Nylig laget av andre». Using one copies it into a new project (the shared sign is not changed) and counts the use.
- **The slider «Nylig laget»** is on the homepage (before the Skaperverksted portal) and on the Skaperverksted page. It only ever shows real shared signs. With none, or where accounts are not switched on, it says so and links to Sign Forge.
- **Removing:** members see and remove their signs under «Min konto» or in the publish dialog, and can delete the account (with its signs). Signs shared earlier without an account can be removed from the same browser (the browser keeps a key per sign).
- **Administrators** (CMS role admin) see the member register and every shared sign in Studio → «Medlemmer og skilt», and can hide a sign from the gallery or show it again.

## Payment: free for now

`php/api/konto/tjenester.json` is the one list of services and what they cost, read by the PHP API and the editor (`src/lib/konto/tjenester.ts`):

| Service | `betaling` |
|---|---|
| Sign Forge | `gratis` |
| CSV batch in Sign Forge | `gratis-inntil-videre` (to become paid later) |

`gratis-inntil-videre` is open to everyone, signed in or not. Changing a service to `betalt` closes it to anyone without an active payment (`konto_tilgang()` in PHP, `plangrenser.csvBatch` in the editor) — do that only when a payment flow exists. No prices are set anywhere.

Providers: Stripe Checkout and Vipps ePayment are listed, both `aktiv: false` (decision log 2026-10-15: hosted flows only, no card data on our server). The member row has `plan`, `betaling_status` (`ingen | aktiv | utlopt | avbrutt`), `betaling_leverandor`, `betaling_kunde` and `betalt_til`, and `dp_betalinger` has one row per payment; a provider's webhook will fill these when payment is switched on. Nothing writes them yet.

## Where it runs

On the PHP build (one.com) once the accounts have a database. The tables are created on first use. On the Node preview (Render) the pages say accounts are not switched on and nothing is sent.

**The accounts do not need the CMS** (work order «tjenesteplattform», 2026-10-17; see [the architecture note](architecture/tjenesteplattform.md)). They have their own settings, connection, migrations and rate limits in `php/api/konto/_db.php`:

- Settings: `api/konto/konfig.php` on the web host (copy `konfig.eksempel.php`; never in the repository or a release zip). It may point at the same MySQL database as the CMS. Until it exists, `api/cms/konfig.php` is read as before, so a host that already runs accounts on the CMS database keeps working. `?r=status` answers `oppsett: "konto" | "cms" | null` to say which file is in use.
- Only the admin actions (`admin-*` and `kartlegg.php`) ask the CMS, through `_admin.php`: a signed-in CMS administrator may use them. Without the CMS they answer 503, and a member always gets 401/403.
- Other parts on the server use `_grensesnitt.php` (`konto_innlogget()`, `konto_har_tilgang()`, `konto_versjon()`), never the account tables.

API: `php/api/konto/index.php` (actions listed at the top of the file), shared code in `_konto.php`. Sign-in is a random token in an HttpOnly cookie, only its hash stored, 30 days. The cookie is `dp_konto` on the real site and `dp_konto_test` on a test build (path = the build's base), so signing out on a test site never touches a real sign-in. POSTs must be JSON with the header `X-Konto: 1`, which a form on another site cannot send, and a request whose `Origin` names another site is refused. Sign-up, sign-in and publishing are rate limited per IP in the accounts' own table `dp_konto_forsok` (migration 2). A published sign's preview must be a PNG; the server draws it again with GD before storing it. The sign itself is stored as a Sign Forge template and is cleaned by the editor whenever it is opened.

**Survey before a migration:** `api/konto/kartlegg.php`, for a signed-in CMS administrator only, reads (never writes, never migrates) and answers with counts: which tables exist, migration versions, members by status, case-insensitive duplicate e-mails (a count), gallery signs by visible/hidden/with or without owner, valid sign-ins. No names or addresses. Remove it from the web host after use.

Tests: `scripts/konto.test.mjs` (in `npm run test:deploy`) runs the API against PHP's built-in server and SQLite, once on the CMS database and once with the CMS removed and the accounts' own settings.

## Open for Sivert

- Licence terms for shared signs (stored as «Ikke avklart ennå»).
- Whether guests may publish (today: no) and what happens to published signs when an account is deleted (today: they are deleted with it).
- Prices and which plan unlocks CSV when it becomes paid; Stripe and Vipps accounts.
- E-mail confirmation and password reset are stage B; SMTP on one.com blocks a public launch of accounts.
- The CMS backup in Studio does not include member accounts or shared signs yet.
