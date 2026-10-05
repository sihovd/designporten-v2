// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import { cp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
          injectRoute({ pattern: '/api/kasse', entrypoint: './src/server/ruter/kasse.ts' });
          injectRoute({ pattern: '/api/kasse/okt', entrypoint: './src/server/ruter/kasse-okt.ts' });
          injectRoute({ pattern: '/api/stripe/webhook', entrypoint: './src/server/ruter/stripe-webhook.ts' });
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

/**
 * Serves the content editor's script (Sveltia CMS, devDependency) at
 * /admin/sveltia-cms.js: from node_modules in dev, copied into the build.
 * @returns {import('astro').AstroIntegration}
 */
function sveltiaAdmin() {
  const kilde = fileURLToPath(new URL('./node_modules/@sveltia/cms/dist/', import.meta.url));
  const filer = ['sveltia-cms.js', 'chunks/react-dom.js'];
  return {
    name: 'designporten-sveltia-admin',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(async (req, res, neste) => {
          const fil = filer.find((f) => req.url === `/admin/${f}`);
          if (!fil) return neste();
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          res.end(await readFile(kilde + fil));
        });
      },
      'astro:build:done': async ({ dir }) => {
        for (const f of filer) await cp(kilde + f, fileURLToPath(new URL(`admin/${f}`, dir)));
      },
    },
  };
}

export default defineConfig({
  site: 'https://www.designporten.no',
  output: 'static',
  adapter: maal === 'node' ? node({ mode: 'standalone' }) : undefined,
  integrations: [preact(), serverruter(), sveltiaAdmin()],
  trailingSlash: 'always',
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: {
    worker: { format: 'es' },
  },
});
