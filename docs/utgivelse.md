# Releases per part (stage D)

Built 2026-10-18 on Sivert's «Fortsett d». The one.com build is split into three parts, each with its own package, version and manifest, so one can be updated without touching the others' files. See [the architecture note](architecture/tjenesteplattform.md#stages).

## The parts

| Part | Owns (by path) | Version | Built by |
|---|---|---|---|
| `nettside` | everything the others do not own: pages, `/_astro/`, `public/` files, `api/cms/`, forms, `.htaccess`, `api/.htaccess`, `api/.user.ini`, `api/bygg.php`, `deployment.json` | source commit | `astro build` (DP_MAAL=php) |
| `konto` | `api/konto/` | source commit; `skjema` (migration) and `grensesnitt` in the manifest | copied from `php/api/konto/` |
| `signforge` | `skaperverksted/signgen/` | source commit (`-endret` if the tree had changes) | its own Vite build, `scripts/bygg-signforge.mjs` |

The owner of a file is decided by its path alone (`DELER` in `scripts/pakk-deler.mjs`; the first match wins). The parts are on the same domain, so this separates files and releases, not security.

## Sign Forge's own build

`scripts/bygg-signforge.mjs` bundles the editor with Vite from `src/apper/signforge/main.tsx` (only Sign Forge: `src/apper/signforge/generatorer.ts` replaces the registry of all tools) into:

- `skaperverksted/signgen/index.html`: the page, written by the script as `src/layouts/Verksted.astro` writes it. It is not cached (the root `.htaccess` sets `no-cache` on HTML).
- `skaperverksted/signgen/_app/<versjon>/`: JS, CSS, the fonts and the decor licence (own copies of `public/skaperverksted/fonter/` and `dekor/`, read through `verkstedressurs()` in `src/lib/nettsti.ts`).
- `skaperverksted/signgen/_app/.htaccess`: long-lived cache, no directory listing.

The page refers only to its own version folder, never to `/_astro/`, so a website release cannot remove or change what Sign Forge uses. A new Sign Forge carries only its new folder; the previous one stays on the server. The address, `?mal=` and `?prosjekt=` links are unchanged. `npm run build:onecom` uses this build in place of the website's page for Sign Forge, so the whole-site package and the three part packages contain the same files. The Node build (Render) keeps the website's own page.

What Sign Forge still takes from the others is listed in its manifest under `krever`: the account API (schema 4 or newer) and a few website files (favicons, `site.webmanifest`, `brand/`) and pages it links to.

## Commands

```bash
npm run build:onecom:test   # or build:onecom: the whole site in dist/, with Sign Forge from its own build
npm run pakk:deler          # var/release/deler/<del>[-test]-<versjon>.zip and .manifest.json
node scripts/pakk-onecom.mjs  # still available: the whole site as one package
npm run build:signforge -- --test   # Sign Forge alone, in var/bygg/signforge/
```

None of these need GitHub. `pakk:deler` refuses a `konfig.php`, symbolic links and anything the secret scan flags, per package.

## Manifest

Beside each package: `komponent`, `versjon`, `kildecommit`, `kildeendringer` (working tree had changes), `test`, `base`, `eier`, for `konto` also `skjema` and `grensesnitt`, `krever` (what it needs from the other parts) and `filer` (SHA-256 per file).

## Installing, updating and rolling back

Upload a package by unpacking it over the folder (`/designporten-test/` for a test build). Packages never delete files.

- **First time:** `nettside`, then `konto`, then `signforge`.
- **Sign Forge only:** upload the new `signforge` package. The website and account files are not touched.
- **Rollback of Sign Forge:** upload the previous `signforge` package again. Its `index.html` points at its own version folder, which is still there.
- **Account part:** its migrations only add (see docs/konto.md). Code from an older `konto` package runs on a newer database; rolling back files does not roll back the database.
- **Old version folders** under `_app/` can be deleted by hand once no installed `index.html` refers to them. Nothing deletes them automatically.

## Tests

`scripts/utgivelse.test.mjs` (in `npm run test:deploy`) checks ownership by path and the manifests. It builds Sign Forge on its own twice and installs both into a pretend web folder like an upload, then checks:

- the page loads only from its own version folder;
- nothing comes from `/_astro/`;
- no other tool is bundled;
- the website and account files are byte for byte unchanged;
- the previous version can be put back.

`tests/onecom/*.spec.ts` run against `dist/`, where Sign Forge comes from its own build.
