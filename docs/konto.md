# Member accounts and the sign gallery

Asked for by Sivert on 2026-10-16; decision log entry 2026-10-17.

## What it does

- **Members** are visitors with an account (name, e-mail, password). They are not CMS users: CMS users run the site, members use it. Sign up and sign in at `/konto/` («Min konto»), linked from the footer on the PHP build.
- **Every sign made in Sign Forge is public.** When a sign is downloaded (3MF or STL) or put in the cart, Sign Forge shares it in the gallery «Nylig laget» with a preview picture, and anyone can start a new sign from it. The export dialog says so before the download. The CSV rows are never shared, only the open sign. A changed sign updates its gallery entry instead of adding a new one.
- **Templates from the gallery:** «Bruk som mal» on the site opens `/skaperverksted/signgen/?mal=<id>`; inside Sign Forge, «Fra mal» lists «Nylig laget av andre». Using one copies it into a new project (the shared sign is not changed) and counts the use.
- **The slider «Nylig laget»** is on the homepage (before the Skaperverksted portal) and on the Skaperverksted page. It only ever shows real shared signs. With none, or where accounts are not switched on, it says so and links to Sign Forge.
- **Removing:** members see and remove their signs under «Min konto» and can delete the account (with its signs). Signs shared without an account can be removed from the same browser (the browser keeps a key per sign).
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

Only on the PHP build with the CMS database switched on (one.com with `api/cms/konfig.php`); the tables are created on first use. On the Node preview (Render) the pages say accounts are not switched on and nothing is sent.

API: `php/api/konto/index.php` (actions listed at the top of the file), shared code in `_konto.php`. Sign-in is a random token in an HttpOnly cookie `dp_konto` (30 days; only its hash is stored). POSTs must be JSON with the header `X-Konto: 1`, which a form on another site cannot send. Sign-up, sign-in and sharing are rate limited per IP. A shared sign's preview must be a PNG; the server draws it again with GD before storing it. The sign itself is stored as a Sign Forge template and is cleaned by the editor whenever it is opened.

Tests: `scripts/konto.test.mjs` (in `npm run test:deploy`) runs the API against PHP's built-in server and SQLite.

## Open for Sivert

- Licence terms for shared signs (stored as «Ikke avklart ennå»).
- Whether people should be able to keep a sign private (today every downloaded sign is shared, as asked). Signs often carry names, so the export dialog warns about it.
- Prices and which plan unlocks CSV when it becomes paid; Stripe and Vipps accounts.
- Password reset by e-mail is not built (the site has no e-mail sending on one.com set up for it yet).
- The CMS backup in Studio does not include member accounts or shared signs yet.
