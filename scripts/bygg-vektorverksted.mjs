/**
 * The Vektorverksted as one self-contained HTML file (JS and CSS inlined),
 * for trying the converter before it is built into Sign Forge.
 *
 * Usage: node scripts/bygg-vektorverksted.mjs [--ut=<mappe>]
 * Writes var/bygg/vektorverksted/vektorverksted.html.
 */
import { build } from 'vite';
import preact from '@preact/preset-vite';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = fileURLToPath(new URL('..', import.meta.url));
const SIDE = join(ROT, 'src/skaperverksted/generatorer/signgen/vektorverksted/side');
const utArg = process.argv.find((a) => a.startsWith('--ut='));
const UT = utArg ? utArg.slice(5) : join(ROT, 'var/bygg/vektorverksted');
const MIDL = join(UT, '_midl');

rmSync(MIDL, { recursive: true, force: true });
await build({
  root: SIDE,
  base: './',
  logLevel: 'warn',
  plugins: [preact()],
  build: {
    outDir: MIDL,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { codeSplitting: false } },
  },
});

let html = readFileSync(join(MIDL, 'index.html'), 'utf8');
const filer = readdirSync(join(MIDL, 'assets'));
for (const f of filer) {
  const innhold = readFileSync(join(MIDL, 'assets', f), 'utf8');
  if (f.endsWith('.js')) {
    html = html.replace(
      new RegExp(`<script type="module" crossorigin src="./assets/${f.replace('.', '\\.')}"></script>`),
      () => `<script type="module">${innhold.replace(/<\/script/g, '<\\/script')}</script>`,
    );
  } else if (f.endsWith('.css')) {
    html = html.replace(
      new RegExp(`<link rel="stylesheet" crossorigin href="./assets/${f.replace('.', '\\.')}">`),
      () => `<style>${innhold}</style>`,
    );
  }
}
mkdirSync(UT, { recursive: true });
const fil = join(UT, 'vektorverksted.html');
writeFileSync(fil, html);
rmSync(MIDL, { recursive: true, force: true });
process.stdout.write(`Skrev ${fil} (${Math.round(html.length / 1024)} kB)\n`);
