/**
 * A source package that does not need GitHub: a zip of the committed source,
 * a git bundle with the history and every branch, and a manifest with the
 * commit, the branch, whether the working tree had changes, and a SHA-256
 * hash per file. Only committed files are packed (never node_modules, dist,
 * var or settings with passwords, which are not in git). See
 * docs/architecture/tjenesteplattform.md.
 *
 *   node scripts/kildepakke.mjs            → var/release/kilde/
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

function git(...args) {
  const r = spawnSync('git', args, { encoding: 'buffer', maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(r.stderr)}`);
  return r.stdout;
}

const commit = git('rev-parse', 'HEAD').toString().trim();
const kort = commit.slice(0, 7);
const gren = git('rev-parse', '--abbrev-ref', 'HEAD').toString().trim();
const endringer = git('status', '--porcelain').toString().trim();
const ut = 'var/release/kilde';
rmSync(ut, { recursive: true, force: true });
mkdirSync(ut, { recursive: true });

const zipnavn = `designporten-kilde-${kort}.zip`;
git('archive', '--format=zip', `--prefix=designporten-${kort}/`, '-o', `${ut}/${zipnavn}`, commit);
const bundlenavn = `designporten-${kort}.bundle`;
git('bundle', 'create', `${ut}/${bundlenavn}`, '--all');
git('bundle', 'verify', `${ut}/${bundlenavn}`);

// guard: nothing that looks like settings with passwords or a build in the source zip
const filer = unzipSync(new Uint8Array(readFileSync(`${ut}/${zipnavn}`)));
const forbudt = Object.keys(filer).filter((f) =>
  /(^|\/)(node_modules|dist|var|\.env[^/]*|konfig\.php|oppsett\.php)(\/|$)/.test(f),
);
if (forbudt.length) throw new Error(`Uventede filer i kildepakken: ${forbudt.join(', ')}`);

const sha = (b) => createHash('sha256').update(b).digest('hex');
const manifest = {
  komponent: 'kilde',
  prosjekt: 'designporten-v2',
  commit,
  gren,
  arbeidstreEndret: endringer !== '',
  endringerIkkeMed: endringer ? endringer.split('\n') : [],
  laget: new Date().toISOString(),
  pakker: {
    [zipnavn]: sha(readFileSync(`${ut}/${zipnavn}`)),
    [bundlenavn]: sha(readFileSync(`${ut}/${bundlenavn}`)),
  },
  filer: Object.fromEntries(
    Object.entries(filer)
      .filter(([f]) => !f.endsWith('/'))
      .map(([f, innhold]) => [f.slice(`designporten-${kort}/`.length), sha(innhold)]),
  ),
};
writeFileSync(`${ut}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.warn(
  `Kildepakke for ${kort} (${gren}${manifest.arbeidstreEndret ? ', arbeidstreet hadde ucommittede endringer som IKKE er med' : ''}) i ${ut}/.`,
);
