# Member accounts and the sign gallery

Asked for by Sivert on 2026-10-16; decision log entry 2026-10-17.

## What it does

- **Members** are visitors with an account (name, e-mail, password). They are not CMS users: CMS users run the site, members use it. Sign up and sign in at `/konto/` («Min konto»), linked from the footer on the PHP build.
- **Signs are private; the maker publishes.** Since 2026-10-17 (Sivert): nothing is shared on download or in the cart. A signed-in member chooses **Fil → «Publiser i galleriet …»** in Sign Forge; the dialog shows the picture the gallery will show, says the text becomes public, and publishes, updates or removes the sign («Fjern fra galleriet»). Guests cannot publish. The CSV rows are never published, only the open sign. Signs that the earlier automatic sharing (PR #49, never in main) put in a gallery database stay as they are (nothing is taken down automatically); the browser that shared them as a guest keeps the key to remove them.
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

- Settings: `api/konto/konfig.php` on the web host (copy `konfig.eksempel.php`; never in the repository or a release zip). It may point at the same MySQL database as the CMS. **Without it the accounts are off:** `?r=status` says `aktiv: false`, every other call answers 503, and nothing connects, creates tables or writes (Sivert, 2026-10-17). There is no automatic fallback to `api/cms/konfig.php`. A host that already ran accounts on the CMS's settings can switch that on explicitly with `'bruk_cms_database' => true` (and no `dsn`) in `api/konto/konfig.php`; a test build ignores it. `?r=status` answers `oppsett: "konto" | "cms" | null` to say which is in use.
- Only the admin actions (`admin-*`) ask the CMS, through `_admin.php`: a signed-in CMS administrator may use them. Without the CMS they answer 503, and a member always gets 401/403.
- Other parts on the server use `_grensesnitt.php` (`konto_innlogget()`, `konto_har_tilgang()`, `konto_versjon()`), never the account tables.

API: `php/api/konto/index.php` (actions listed at the top of the file), shared code in `_konto.php`. Sign-in is a random token in an HttpOnly cookie, only its hash stored, 30 days. The cookie is `dp_konto` on the real site and `dp_konto_test` on a test build (path = the build's base), so signing out on a test site never touches a real sign-in. POSTs must be JSON with the header `X-Konto: 1`, which a form on another site cannot send, and a request whose `Origin` names another site is refused. Sign-up, sign-in and publishing are rate limited per IP in the accounts' own table `dp_konto_forsok` (migration 2). A published sign's preview must be a PNG; the server draws it again with GD before storing it. The sign itself is stored as a Sign Forge template and is cleaned by the editor whenever it is opened.

**Survey before a migration:** a command-line tool, not on the web and off unless someone starts it with a settings file: `php scripts/kartlegg-konto.php --konfig=sti/til/konfig.php` (the account or the CMS settings file), where PHP reaches the database (SSH on the host, or a local copy of a dump). It loads no account or CMS code, so nothing migrates; SQLite is opened read-only (a missing file is not created) and MySQL runs in a read-only transaction that is rolled back. It prints counts only: which tables exist, migration versions, members by status, case-insensitive duplicate e-mails (a count), gallery signs by visible/hidden/with or without owner, valid sign-ins. No names or addresses.

Tests: `scripts/konto.test.mjs` (in `npm run test:deploy`) runs the API against PHP's built-in server and SQLite (or MySQL/MariaDB, see the file): with the CMS, with the CMS removed, and without account settings (503, no tables, no file). The test servers always give the accounts their own settings, never the legacy fallback. It also checks which settings are picked and the survey tool.

## E-mail, links and account status (stage B)

Work order «Etappe B» (Sivert, 2026-10-18); decision log entry the same day. On the working branch `claude/project-thread-fklm92`, not in main.

**E-mail part** (`php/api/konto/_epost.php`, one function `konto_send_epost()`, the driver chosen in `api/konto/konfig.php`):

- `'epost' => ['driver' => 'fil', 'mappe' => '/absolute/path/outside/the/web/root']` writes each message as a JSON file (mode 0600). Used in development, tests and on test builds, where a CMS administrator reads them in Studio → «Medlemmer og skilt» → «Fanget e-post». A folder inside the site (checked before anything is created) is refused. Nothing leaves the machine.
- `'driver' => 'mail', 'fra' => 'konto@…'` uses PHP `mail()` like the site's forms. It is refused on a test build and on PHP's development server, so a test can never fall back to real delivery.
- No e-mail settings, or settings that are not allowed here: every action that needs a message answers 503 «E-post er ikke satt opp …» before anything changes. Sign-up still creates the account and says the confirmation could not be sent; nothing claims a message went.
- SMTP is not built. When production e-mail is switched on, the choice is `mail()` on one.com, or SMTP through a maintained library (PHPMailer, a new dependency to decide on then). We do not write our own SMTP client.
- Links are `offentlig_adresse` + the build's base + `konto/#handling=token`. `offentlig_adresse` (for example `https://designporten.no`) is read from the settings, never from Host or proxy headers; without it, links are not made (503). The token sits after «#», so it never reaches a server log or a Referer, the page removes it from the address bar at once, and `Referrer-Policy: no-referrer` is set. Passwords, tokens, addresses and links are never logged.

**Switching on production e-mail later** (only Sivert decides, not part of B): on one.com, add to `api/konto/konfig.php` (never in the repository): `'offentlig_adresse' => 'https://designporten.no'` and `'epost' => ['driver' => 'mail', 'fra' => '<a mailbox on the domain>']`, then test with one member's «Glemt passord» (Studio's «Fanget e-post» list only exists on test builds). No password is needed for `mail()`; if SMTP is chosen instead, its password goes in that file only.

**One-time links** (table `dp_konto_tokens`, migration 3): 32 random bytes (`random_bytes`), only the SHA-256 hash stored, bound to a purpose (`bekreft`, `reset`, `epost`), the member and the address the link was sent to (and the new address for a change). Expiry: confirmation 24 hours, password reset 1 hour, e-mail change 24 hours. A link is used up in one atomic `UPDATE … WHERE brukt IS NULL AND utloper >= now` inside a transaction, so two simultaneous clicks give one success and one «Lenken er ugyldig, utløpt eller allerede brukt». A new link of the same purpose replaces the unused older one. Opening a link changes nothing: «Min konto» shows what the link does and acts only on a button press (POST).

**Confirming the address:** new members get a link when they sign up and can ask for a new one under Profil. Unconfirmed members can sign in, see their account and use Sign Forge and CSV freely, but cannot publish in the gallery. A password reset also confirms the address (the member proved they read the mail).

**Members from before B:** migration 3 adds `status` (`aktiv`) and `epost_bekreftet` (empty) and nothing else; nobody loses their sign-in, sessions and passwords are untouched, and no old address is marked confirmed. An old member is therefore unconfirmed: everything works as before except publishing, which asks them to confirm first (one click on «Send ny lenke»). Signs they already published stay published.

**Forgot password:** always the same neutral answer, whether the address exists or not. A new password ends every sign-in and every reset link of that member, and the member signs in again.

**Change password:** needs the current password; ends every other sign-in and gives the current browser a new session (it stays signed in). **Change e-mail:** needs the current password; sends a link to the new address and a notice to the old one; the old address stays until the link is used; when it is used, the new address must still be free (else 409, nothing changes), the old address must be unchanged (an older link then fails), and the database's unique key settles two members racing for the same address. Accounts are never merged.

**Status:** `aktiv` or `suspendert` (the old column `aktiv` is kept in step, so older code also blocks a suspended member). Deleted means gone: the member row, sessions, links, access exceptions and published signs are removed in one transaction. Only a CMS administrator can suspend or reactivate (Studio, or `admin-status`); suspending ends every sign-in and unused link, and a suspended member who signs in with the right password is told the account is closed. Reactivating does not bring old sign-ins back. Without the CMS there are no admin actions (503). A member never becomes a CMS user.

**Access** (`tjenester.json` → `funksjoner`, `konto_tilganger()` in PHP): per service and feature, what is needed (`medlem`, `bekreftet-epost`) and why access is missing. Today: Sign Forge and CSV free for everyone; publishing in the gallery needs a confirmed member. An administrator can set an exception per member and key (`dp_konto_tilganger`: `ja` opens without payment, `nei` closes). The server decides on every call; what the page shows comes from the same answer, and a refusal never removes the sign from the browser.

**Rate limits** (all per 15 minutes or per hour, never permanent): sign-up 5/hour per IP; new confirmation link 3/hour per member and 10/hour per IP; forgot password 5/15 min per IP and at most 3 mails/hour per address (silently the same answer); wrong or used links 20/15 min per IP; wrong current password 5/15 min per member; e-mail change 3/hour per member; sign-in as before. Nobody outside can lock an account for good: the limits expire, and a reset link still works while sign-in is limited.

**Rollback boundary:** migrations 1–3 only add columns and tables. Code from stage A on a database migrated to 3 still runs: it ignores `status`, `epost_bekreftet`, links and exceptions, and a suspended member is still blocked through `aktiv`. Going back loses only what B adds (confirmations, links, exceptions). Removing the columns is not needed and not scripted.

**«Min konto»** has three parts: Mine tjenester (each service with Tilgang/Ikke tilgang and the reason, «Åpne Sign Forge» to `/skaperverksted/signgen/`), Profil (name, e-mail and confirmation status, change e-mail, change password, delete account) and Mine prosjekter (projects are still saved in the browser, project storage on the account is stage C; published signs are listed as «Publisert i galleriet»).

Tests: `scripts/konto-sikkerhet.test.mjs` (in `npm run test:deploy`; SQLite, or MySQL/MariaDB with `DP_CMS_MYSQL`) and the B flows in `tests/onecom/cms.spec.ts`.

## Open for Sivert

- Licence terms for shared signs (stored as «Ikke avklart ennå»).
- Whether guests may publish (today: no) and what happens to published signs when an account is deleted (today: they are deleted with it).
- Prices and which plan unlocks CSV when it becomes paid; Stripe and Vipps accounts.
- Production e-mail: `mail()` on one.com or SMTP (PHPMailer), and which sender address. Until then accounts cannot go public: no confirmation or reset mail can be sent.
- The CMS backup in Studio does not include member accounts or shared signs yet.
