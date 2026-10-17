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

- **Account → other parts on the server:** `php/api/konto/_grensesnitt.php` with `konto_innlogget()`, `konto_har_tilgang()`, `konto_versjon()`. Nothing else of the account module is used from outside it.
- **Account → CMS:** only for admin actions, through `_admin.php` (a signed-in CMS administrator). The accounts run with the CMS switched off or not installed.
- **Browser → account:** `api/konto/?r=…` (see `docs/konto.md`).

## Stages

- **A (done 2026-10-17, corrected the same evening):** on the working branch `claude/project-thread-fklm92`, PR #49 is integrated with main as of #50 (merge commit `161f9e5`, conflicts resolved by hand). #49 is **not** merged into main, and nothing of stage A is in main. One navigation model (`docs/design/skaperverksted.md#navigation`); accounts with their own settings and no CMS dependency (no automatic fallback); private by default with «Publiser i galleriet»; read-only survey as a command-line tool `scripts/kartlegg-konto.php`, off unless started with a settings file; source package with a bundle of the delivery branch only and a secret scan (`npm run pakk:kilde`). The commit message of `161f9e5` says «into main»; it means the main base on this branch.
- **B:** e-mail part (driver `fil` for tests, `mail`, `smtp`), confirmation, password reset, e-mail/password change, suspension, a table of access per service and feature, «Min konto» with Mine prosjekter / Mine tjenester / Profil. SMTP on one.com blocks a public launch, not the work.
- **C:** Sign Forge projects on the account (`api/signforge/`, owner from the session, revision number, 409 on conflict, local copy kept).
- **D:** a separate build and package per part with its own manifest; Sign Forge's assets under its own folder so a website update never removes them.
- **E:** the contract for Form Forge and Dragon Forge, documented only.

Each stage needs Sivert's approval; an approved stage does not approve the next.
