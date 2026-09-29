/**
 * Builds the site for web hosting with PHP and no Node (one.com):
 * a fully static build (DP_MAAL=php) plus the PHP form routes and Apache
 * settings from php/. The result in dist/ is uploaded as it is.
 * See docs/development.md#deploy.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

const bygg = spawnSync('npx', ['astro', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DP_MAAL: 'php' },
});
if (bygg.status !== 0) process.exit(bygg.status ?? 1);

cpSync('php', 'dist', { recursive: true });
rmSync('dist/api/oppsett.eksempel.php');

for (const fil of [
  'index.html',
  '404.html',
  'api/katalog.json',
  'skjema/kvittering/index.html',
  'api/foresporsel/index.php',
]) {
  if (!existsSync(`dist/${fil}`)) {
    console.error(`bygg-onecom: dist/${fil} mangler.`);
    process.exit(1);
  }
}
console.warn('bygg-onecom: dist/ er klar til opplasting.');
