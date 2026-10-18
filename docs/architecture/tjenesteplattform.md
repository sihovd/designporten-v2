# One account, separate apps («tjenesteplattform»)

Sivert's work order «Designporten med felles kundekonto og separate apper», revision 2 (2026-10-17), and his answers to it the same evening. The full plan (Norwegian) is in the project files under `tjenesteplattform/plan.md`; this note keeps what the code relies on.

## Goal

One Designporten account for every customer, used by Sign Forge and later by other apps. The apps stay separate from the website and from each other: each can be built, tested and published on its own. GitHub is optional: building, testing and packaging run from a local command line (`npm run verify`, the test commands in `docs/development.md`, `npm run pakk:kilde`).

## Parts and owners

| Part | Owns | Never |
|---|---|---|
| Website | Pages, products, navigation, the way into the apps | App editor logic, project formats |
| Account (`php/api/konto/`, `/konto/`) | Members, sign-ins, profile, access to services (`dp_medlemmer`, `dp_konto_*`) | CMS content, the apps' own data |
| Sign Forge (`/skaperverksted/signgen/`) | The editor, its project format, the gallery signs (`dp_skilt`), later its saved projects | Passwords, reading account tables |
| CMS (`/cms/`, `php/api/cms/`) | Page texts, media, its own users | Writing account tables |

Same domain and same database server to start with. Same domain is **not** isolation between the apps; the borders are in the code (own files, own tables, one contract file), not a security wall.

## Contracts

- **Account → other parts on the server:** `php/api/konto/_grensesnitt.php` with `konto_innlogget()`, `konto_har_tilgang()`, `konto_har_funksjon()`, `konto_versjon()` (contract version 2). Nothing else of the account module is used from outside it.
- **Account → CMS:** only for admin actions, through `_admin.php` (a signed-in CMS administrator). The accounts run with the CMS switched off or not installed.
- **Browser → account:** `api/konto/?r=…` (see `docs/konto.md`).

## Stages

- **A (done 2026-10-17, corrected the same evening):** on the working branch `claude/project-thread-fklm92`, PR #49 is integrated with main as of #50 (merge commit `161f9e5`, conflicts resolved by hand). (Sivert merged #49 and then #51, stages A and B, into main on 2026-10-18.) One navigation model (`docs/design/skaperverksted.md#navigation`); accounts with their own settings and no CMS dependency (no automatic fallback); private by default with «Publiser i galleriet»; read-only survey as a command-line tool `scripts/kartlegg-konto.php`, off unless started with a settings file; source package with a bundle of the delivery branch only and a secret scan (`npm run pakk:kilde`). The commit message of `161f9e5` says «into main»; it means the main base on this branch.
- **B (done 2026-10-18; merged into main by Sivert with PR #51 the same morning; follow-up the same day):** e-mail part (driver `fil` for tests, `mail`; SMTP left for when production e-mail is chosen), confirmation, password reset, e-mail/password change, suspension, access per service and feature with per-member exceptions, «Min konto» with Mine tjenester / Profil / Mine prosjekter. Follow-up after Sivert's review: a new or changed password revokes every unused link (an address change included), and the capture folder is refused anywhere the web may serve it, the site's root above `/designporten-test/` included. See [docs/konto.md](../konto.md#e-mail-links-and-account-status-stage-b). Production e-mail blocks a public launch, not the work.
- **C (planned, not started; needs Sivert's go):** projects on the account, with the access model Sivert set on 2026-10-18:

  | Who | Access |
  |---|---|
  | Visitor (no account) | Uses the tools and downloads signs. Nothing is stored on the server; projects stay in the browser. |
  | Free account | Saves at most **five projects in total, across all apps** (Sign Forge now, the other forges later). |
  | Paying member | Access and storage quota by the chosen package; CSV belongs to a paid package. |

  How: one table for every app's projects (`dp_prosjekter`: owner from the session, `app`, name, document, revision, size, timestamps), so the quota of five is one count per member across apps; the API is `api/prosjekter/?app=…` behind the `_grensesnitt.php` contract. The server enforces the quota and the package; the editor only shows the result. At the limit a save is refused with a clear message, nothing is deleted, the local copy stays, and the member can delete a project to make room. Conflicts: revision number, 409 with «Åpne nyeste» / «Lagre som kopi». Size limit per project (about 2 MB, to be measured). No automatic upload of local projects; the member chooses «Lagre på kontoen».

  Packages are data in `php/api/konto/tjenester.json` (`planer`: id, quota, features) read by `konto_tilganger()`; package control is built in C. No prices, payment integration or sales terms are added in C.

  Decided by Sivert on 2026-10-18:
  - **CSV free period as an explicit exception.** CSV belongs to a paid package, but stays free for everyone, account or not, until the payment flow is ready. In C this is written as its own named exception in `tjenester.json` (for example `unntak: { csv: { apen_for: "alle", til: "betalingslosning-klar", grunn: "gratisperiode" } }`). It is not a hidden default: «Mine tjenester» and the docs say that CSV is free for now. Ending the free period means removing that one exception, once payment is live.
  - **Existing projects survive the transition.** When package control or a quota takes effect, and also when someone drops from a package to free or ends up over the quota, every project already saved can still be **opened and downloaded**. Nothing is deleted or locked away. A save that needs a quota the member no longer has is refused, and the message says how to make room.

  Defaults chosen by Claude, open for Sivert: gallery signs do not count towards the five; over the quota, a member can open, download and delete projects, but not save new ones. Still open: which packages and quotas, and the terms for commercial sale.
- **D:** a separate build and package per part with its own manifest; Sign Forge's assets under its own folder so a website update never removes them.
- **E:** the contract for Form Forge and Dragon Forge, documented only.

Each stage needs Sivert's approval; an approved stage does not approve the next.
