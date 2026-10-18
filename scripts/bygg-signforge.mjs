/**
 * Sign Forge as its own build (stage D, docs/utgivelse.md): the editor
 * bundled by Vite on its own, not by the website's Astro build, into
 *
 *   skaperverksted/signgen/index.html             the page (no cache)
 *   skaperverksted/signgen/_app/<versjon>/…       JS, CSS, fonts, decor licence
 *
 * The page refers only to its own versioned folder, never to the website's
 * /_astro/, so a website update cannot break it, and installing a new Sign
 * Forge never deletes the folder of the previous one (rollback = put the old
 * index.html back). Same address and `?mal=` / `?prosjekt=` links as before.
 *
 * Usage: node scripts/bygg-signforge.mjs [--test] [--ut=<mappe>]
 * Writes to var/bygg/signforge/ (or --ut) and returns { versjon, filer }.
 */
import { build } from 'vite';
import preact from '@preact/preset-vite';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { byggoppsett } from './onecom-oppsett.mjs';

const ROT = fileURLToPath(new URL('..', import.meta.url));
export const APPSTI = 'skaperverksted/signgen/';

/** The release version: the source commit, marked when the working tree has changes. */
export function signforgeVersjon() {
  const commit = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROT, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: ROT, encoding: 'utf8' });
  const kort = commit.status === 0 ? commit.stdout.trim() : 'ukjent';
  const endret = status.status !== 0 || Boolean(status.stdout.trim());
  return { versjon: endret ? `${kort}-endret` : kort, commit: commit.stdout.trim() || null, endret };
}

const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The HTML page, as src/layouts/Verksted.astro writes it for the website build. */
function side({ base, test, appBase, js, css }) {
  const tittel = 'Sign Forge – Skaperverksted – Designporten';
  const beskrivelse = 'Lag skilt og navneskilt for 3D-print, og last dem ned som 3MF eller STL.';
  const kanonisk = `https://www.designporten.no/${APPSTI}`;
  return `<!doctype html>
<html lang="nb" class="verksted-html">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <link rel="icon" href="${base}favicon.ico" sizes="48x48" />
    <link rel="icon" href="${base}favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${base}apple-touch-icon.png" />
    <link rel="manifest" href="${base}site.webmanifest" />
    <title>${esc(tittel)}</title>
    <meta name="description" content="${esc(beskrivelse)}" />
${test ? '    <meta name="robots" content="noindex, nofollow" />' : `    <link rel="canonical" href="${kanonisk}" />`}
    <meta property="og:title" content="Sign Forge – Designporten" />
    <meta property="og:description" content="${esc(beskrivelse)}" />
    <meta name="theme-color" content="#141317" />
    <meta name="designporten-app" content="signforge" />
    <link rel="preload" href="${appBase}fonter/archivo-800.woff" as="fetch" crossorigin />
${css.map((c) => `    <link rel="stylesheet" href="${appBase}${c}" />`).join('\n')}
    <script type="module" src="${appBase}${js}"></script>
  </head>
  <body class="verksted-flate">
    <div id="signforge" style="display: contents"></div>
    <noscript>
      <p class="verksted-laster">
        Skaperverksted trenger JavaScript. <a href="${base}skaperverksted/">Tilbake</a>
      </p>
    </noscript>
  </body>
</html>
`;
}

/** Swaps the registry of every tool for one with only Sign Forge. */
function bareSignforge() {
  const register = fileURLToPath(new URL('../src/skaperverksted/generatorer/index.ts', import.meta.url));
  const erstatning = fileURLToPath(new URL('../src/apper/signforge/generatorer.ts', import.meta.url));
  return {
    name: 'designporten-bare-signforge',
    enforce: 'pre',
    async resolveId(kilde, importer, valg) {
      if (!importer || !/generatorer$/.test(kilde)) return null;
      const r = await this.resolve(kilde, importer, { ...valg, skipSelf: true });
      return r?.id === register ? erstatning : null;
    },
  };
}

export async function byggSignforge({ test = false, ut = 'var/bygg/signforge', versjon: fast } = {}) {
  if (test) process.env.DP_TEST = 'true';
  const { base } = byggoppsett();
  const kilde = signforgeVersjon();
  const { commit, endret } = kilde;
  // a fixed version only for tests (two releases side by side)
  const versjon = fast ?? kilde.versjon;
  const appBase = `${base}${APPSTI}_app/${versjon}/`;
  const mappe = `${ut}/${APPSTI}_app/${versjon}`;
  rmSync(ut, { recursive: true, force: true });

  await build({
    root: ROT,
    configFile: false,
    logLevel: 'warn',
    base: appBase,
    plugins: [preact(), bareSignforge()],
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    publicDir: false,
    define: {
      'import.meta.env.BASE_URL': JSON.stringify(base),
      'import.meta.env.PUBLIC_DP_TEST': JSON.stringify(String(test)),
      'import.meta.env.PUBLIC_DP_PHP': JSON.stringify('true'),
      'import.meta.env.PUBLIC_DP_VERKSTEDRESSURSER': JSON.stringify(appBase),
    },
    worker: { format: 'es' },
    build: {
      outDir: mappe,
      emptyOutDir: true,
      // the 3D view and the sign engine are large on their own, and both load only when needed
      chunkSizeWarningLimit: 1000,
      assetsDir: '',
      manifest: 'vite-manifest.json',
      rollupOptions: { input: 'src/apper/signforge/main.tsx' },
    },
  });

  const vm = JSON.parse(readFileSync(`${mappe}/vite-manifest.json`, 'utf8'));
  const inngang = vm['src/apper/signforge/main.tsx'];
  if (!inngang?.file) throw new Error('bygg-signforge: fant ikke inngangen i Vite-manifestet.');
  rmSync(`${mappe}/vite-manifest.json`);
  // its own copies of the run-time files, so the website's public/ can change freely
  cpSync('public/skaperverksted/fonter', `${mappe}/fonter`, { recursive: true });
  cpSync('public/skaperverksted/dekor', `${mappe}/dekor`, { recursive: true });
  writeFileSync(
    `${ut}/${APPSTI}_app/.htaccess`,
    '# Sign Forge releases: every file name is unique to its version and never changes.\n' +
      'Options -Indexes\n<IfModule mod_headers.c>\n  Header set Cache-Control "public, max-age=31536000, immutable"\n</IfModule>\n',
  );
  mkdirSync(`${ut}/${APPSTI}`, { recursive: true });
  writeFileSync(
    `${ut}/${APPSTI}index.html`,
    side({ base, test, appBase, js: inngang.file, css: inngang.css ?? [] }),
  );
  return { versjon, commit, endret, base, test, appBase };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ut = process.argv.find((a) => a.startsWith('--ut='))?.slice(5);
  const r = await byggSignforge({ test: process.argv.includes('--test'), ...(ut ? { ut } : {}) });
  console.warn(`bygg-signforge: versjon ${r.versjon} under ${r.appBase}`);
}
