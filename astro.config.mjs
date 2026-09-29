// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

/**
 * Two build targets from the same pages (docs/development.md#deploy):
 *  - node (default): showroom pages are prerendered; the form and order
 *    routes run on the Node adapter.
 *  - php (DP_MAAL=php, `npm run build:onecom`): everything is static, and
 *    the form and order routes are PHP scripts from `php/`, for web hosts
 *    such as one.com that run PHP but not Node.
 */
const maal = process.env.DP_MAAL === 'php' ? 'php' : 'node';

/** @returns {import('astro').AstroIntegration} */
function serverruter() {
  return {
    name: 'designporten-serverruter',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        if (maal === 'node') {
          injectRoute({ pattern: '/api/foresporsel', entrypoint: './src/server/ruter/foresporsel.ts' });
          injectRoute({ pattern: '/api/bestilling', entrypoint: './src/server/ruter/bestilling.ts' });
          injectRoute({ pattern: '/skjema/kvittering', entrypoint: './src/server/ruter/kvittering.astro' });
        } else {
          injectRoute({ pattern: '/api/katalog.json', entrypoint: './src/server/statisk/katalog.json.ts' });
          injectRoute({
            pattern: '/skjema/kvittering/[...type]',
            entrypoint: './src/server/statisk/kvittering.astro',
          });
          injectRoute({ pattern: '/skjema/ikke-sendt', entrypoint: './src/server/statisk/ikke-sendt.astro' });
        }
      },
    },
  };
}

export default defineConfig({
  site: 'https://www.designporten.no',
  output: 'static',
  adapter: maal === 'node' ? node({ mode: 'standalone' }) : undefined,
  integrations: [preact(), serverruter()],
  trailingSlash: 'always',
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: {
    worker: { format: 'es' },
  },
});
