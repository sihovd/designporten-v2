/**
 * Builds the site for web hosting with PHP and no Node (one.com):
 * a fully static build (DP_MAAL=php) plus the PHP form routes and Apache
 * settings from php/. The result in dist/ is uploaded as it is.
 * See docs/development.md#deploy.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { byggoppsett } from './onecom-oppsett.mjs';

if (process.argv.includes('--test')) process.env.DP_TEST = 'true';
const { base, test } = byggoppsett();

rmSync('dist', { recursive: true, force: true });

const bygg = spawnSync('npx', ['astro', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DP_MAAL: 'php' },
});
if (bygg.status !== 0) process.exit(bygg.status ?? 1);

cpSync('php', 'dist', { recursive: true });
rmSync('dist/api/oppsett.eksempel.php');
writeFileSync(
  'dist/api/bygg.php',
  `<?php\nreturn ['base' => '${base}', 'test' => ${test ? 'true' : 'false'}];\n`,
);
let apache = readFileSync('dist/.htaccess', 'utf8')
  .replace('ErrorDocument 404 /404.html', `ErrorDocument 404 ${base}404.html`)
  .replace('m#^/_astro/#', `m#^${base}_astro/#`);
apache = apache.replace(/(RewriteRule \^\S+\.html\$ )\/(\S+)( \[R=301,L\])/g, `$1${base}$2$3`);
// Skaperverksted closed (src/lib/flagg.ts): tool pages left on the server by an
// earlier upload must not stay reachable, so Apache answers 404 for them.
if (process.env.DP_SKAPERVERKSTED !== 'pa') {
  const verktoy = readdirSync('src/skaperverksted/generatorer', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  apache = apache.replace(
    '</IfModule>',
    `  # Skaperverksted is not open yet: old tool pages answer 404.\n  RewriteRule ^skaperverksted/(${verktoy.join('|')})(?:/|$) - [R=404,L]\n</IfModule>`,
  );
}
if (test)
  apache +=
    '\n<IfModule mod_headers.c>\n  Header always set X-Robots-Tag "noindex, nofollow, noarchive"\n</IfModule>\n';
writeFileSync('dist/.htaccess', apache);
const manifest = JSON.parse(readFileSync('dist/site.webmanifest', 'utf8'));
manifest.start_url = base;
manifest.scope = base;
manifest.icons = manifest.icons.map((ikon) => ({ ...ikon, src: `${base}${ikon.src.slice(1)}` }));
writeFileSync('dist/site.webmanifest', JSON.stringify(manifest, null, 2));
// A subdirectory robots.txt is informational only: crawlers use the origin root.
// HTML meta + X-Robots-Tag enforce test noindex without changing live robots.txt.
if (test) writeFileSync('dist/robots.txt', `User-agent: *\nDisallow: ${base}\n`);
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
writeFileSync(
  'dist/deployment.json',
  JSON.stringify({
    prosjekt: 'designporten-v2',
    base,
    test,
    commit: commit.status === 0 ? commit.stdout.trim() : null,
    endret: status.status !== 0 || Boolean(status.stdout.trim()),
  }),
);

for (const fil of [
  'index.html',
  '404.html',
  'api/katalog.json',
  'skjema/kvittering/index.html',
  'api/foresporsel/index.php',
  'api/bestilling/index.php',
  'api/bygg.php',
  '.htaccess',
  'api/.htaccess',
  'api/.user.ini',
  'skjema/ikke-sendt/index.html',
]) {
  if (!existsSync(`dist/${fil}`)) {
    console.error(`bygg-onecom: dist/${fil} mangler.`);
    process.exit(1);
  }
}
if (existsSync('dist/server') || existsSync('dist/client')) throw new Error('Unexpected Node build output.');
console.warn('bygg-onecom: dist/ er klar til opplasting.');
