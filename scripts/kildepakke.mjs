/**
 * A source package that does not need GitHub: a zip of the committed source,
 * a git bundle with the delivery branch and the history it needs (no other
 * branches), and a manifest with the commit, the branch, the bundled refs,
 * whether the working tree had changes, the secret scan and a SHA-256 hash
 * per file. Only committed files are packed. Before anything is kept, the
 * zip's contents and every file version and commit message in the bundle
 * are scanned for secrets (scripts/hemmeligheter.mjs); a hit stops the
 * package. See docs/architecture/tjenesteplattform.md.
 *
 *   node scripts/kildepakke.mjs            → var/release/kilde/
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { FORBUDTE_FILNAVN, finnHemmeligheter, skannHistorikk } from './hemmeligheter.mjs';

function git(...args) {
  const r = spawnSync('git', args, { encoding: 'buffer', maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(r.stderr)}`);
  return r.stdout;
}

// a bundle from a shallow clone cannot be cloned again: refuse instead of writing a broken backup
if (git('rev-parse', '--is-shallow-repository').toString().trim() === 'true') {
  throw new Error('Repoet er en grunn kopi (shallow). Kjør `git fetch --unshallow` først.');
}
const commit = git('rev-parse', 'HEAD').toString().trim();
const kort = commit.slice(0, 7);
const gren = git('rev-parse', '--abbrev-ref', 'HEAD').toString().trim();
if (gren === 'HEAD') throw new Error('Sjekk ut leveransegrenen først (HEAD peker ikke på en gren).');
const endringer = git('status', '--porcelain').toString().trim();
const ut = 'var/release/kilde';
rmSync(ut, { recursive: true, force: true });
mkdirSync(ut, { recursive: true });

const zipnavn = `designporten-kilde-${kort}.zip`;
git('archive', '--format=zip', `--prefix=designporten-${kort}/`, '-o', `${ut}/${zipnavn}`, commit);
const bundlenavn = `designporten-${kort}.bundle`;
// the delivery branch only (HEAD too, so a clone checks it out); its history includes what it was built on
const refs = [`refs/heads/${gren}`];
const historikk = skannHistorikk(refs);
const filer = unzipSync(new Uint8Array(readFileSync(`${ut}/${zipnavn}`)));
const funn = [
  ...Object.keys(filer)
    .filter((f) => FORBUDTE_FILNAVN.test(f.slice(`designporten-${kort}/`.length)))
    .map((sti) => ({ sti, linje: 0, type: 'filnavn' })),
  ...Object.entries(filer).flatMap(([f, innhold]) => finnHemmeligheter(f, innhold)),
  ...historikk.funn,
];
if (funn.length) {
  rmSync(ut, { recursive: true, force: true });
  throw new Error(
    `Mulige hemmeligheter, ingen pakke laget:\n${funn.map((f) => `  ${f.sti}${f.linje ? `:${f.linje}` : ''}: ${f.type}`).join('\n')}`,
  );
}
git('bundle', 'create', `${ut}/${bundlenavn}`, 'HEAD', ...refs);
git('bundle', 'verify', `${ut}/${bundlenavn}`);
const iBundle = git('bundle', 'list-heads', `${ut}/${bundlenavn}`).toString().trim().split('\n');

const sha = (b) => createHash('sha256').update(b).digest('hex');
const manifest = {
  komponent: 'kilde',
  prosjekt: 'designporten-v2',
  commit,
  gren,
  bundle: {
    refs: iBundle.map((l) => l.split(' ')[1]),
    commits: historikk.commits,
  },
  hemmelighetsskann: {
    resultat: 'ingen funn',
    kildefiler: Object.keys(filer).filter((f) => !f.endsWith('/')).length,
    filversjonerIHistorikken: historikk.blobber,
    commitmeldinger: historikk.commits,
    regler: 'scripts/hemmeligheter.mjs',
  },
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
