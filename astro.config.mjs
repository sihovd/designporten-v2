// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

// Showroom-sider forhåndsrendres. Serverruter (skjema, bestilling) setter
// `export const prerender = false` og kjøres av Node-adapteren.
export default defineConfig({
  site: 'https://www.designporten.no',
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  trailingSlash: 'always',
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: {
    worker: { format: 'es' },
  },
});
