# Working rules for Designporten 2.0

For people and AI agents (Claude, Codex and others) working in this repository.

## Source of truth

- [`DESIGNPORTEN_MASTER.md`](DESIGNPORTEN_MASTER.md) is the authoritative specification and the single entry point. Read it before any task, then the detail documents it links for the area you touch.
- Old Designporten code, the live site and anything in `reference/` are not source of truth.
- If the spec is wrong or silent on something that matters, fix the spec first (and log it in `docs/decisions/decision-log.md`) or ask Sivert. Never let code silently diverge.

## Rules

1. **Preserve what works.** Do not remove functionality, rewrite established design decisions or "improve" unrelated areas while working on something else.
2. **Stay inside your area.** Parallel threads each own a phase or area from the master spec's phase table. Shared files (tokens, domain types, the spec) change only through small, explicit changes.
3. **No fake content or features.** No invented prices, reviews, stats, contact details or subscription behaviour. Placeholders are labelled as placeholders. Unfinished features are not shown as working.
4. **AI images are labelled «Konseptbilde».** Functional programmatic geometry is allowed; decorative vector artwork and invented decorative SVG icons are not (D-3).
5. **Payment only through the providers' hosted flows** (Stripe Checkout, Vipps ePayment); no card data on our server. Orders and stock live in the CMS (decision log 2026-10-15). Live payment is switched on only by Sivert.
6. **Accessibility (WCAG 2.2 AA), reduced motion and responsive behaviour are part of every component**, not a later pass.
7. **Before adding a dependency,** check whether the project already has a solution.
8. **Finish the task.** Implement, run the checks, inspect visually at 320/390/768/1024/1440 px, fix what you find, then report IMPLEMENTED vs NOT IMPLEMENTED / BLOCKED. Only real blockers stop work.
9. **Copy is Norwegian (bokmål),** concrete and human. **Code identifiers are Norwegian too, written in ASCII** (æ→ae, ø→o, å→a: `leggTil`, `Arbeidsbenk`, `hoyde`), matching the domain words in the spec. Library APIs stay as they are. See `docs/development.md`.

## Status

The specification was approved on 2026-09-28. Phases 0 to 7 are implemented on the integration branch (`claude/master-spec-58t4b2`, PR #1): foundation, showroom, products and cart with order requests, the Skaperverksted shell, Signgen with CSV batch, the lamp and the dragon generator. Open business decisions and unconfirmed facts are listed in `docs/decisions/decision-log.md`. See `docs/development.md` for how to run, test and build.
