import { spawnSync } from 'node:child_process';

/**
 * A scan for secrets in file contents, used before a package leaves the
 * machine (scripts/kildepakke.mjs, scripts/pakk-onecom.mjs). A file name
 * filter is not enough: a password can sit in any file. Two kinds of hits:
 * known key formats (private keys, provider tokens), and a password, secret,
 * token or key written as a literal value in settings or code. Values that
 * are plainly test or example values are allowed (TESTVERDIER, and anything
 * containing «test», «eksempel», «example» or «lokal»).
 */

/** Known key formats: never allowed. */
const NOKKELFORMATER = [
  ['privat nøkkel', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS-nøkkel', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['Stripe-nøkkel', /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{20,}/],
  ['Slack-token', /\bxox[abprs]-[0-9A-Za-z-]{10,}/],
  ['Google API-nøkkel', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['nøkkel i URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:'"@]+:[^\s/'"@]{6,}@/i],
];

/** A literal value given to a setting whose name says it is secret. */
const TILORDNING =
  /\b(passord|password|passwd|secret|hemmelig\w*|api_?key|apinokkel|token|oppsettkode|smtp_pass\w*)['"]?\s*(?:=>|=|:)\s*['"]([^'"\s]{8,})['"]/gi;

/** The same in a shell or .env line, where the value has no quotes. */
const MILJOLINJE =
  /^\s*(?:export\s+)?([A-Z0-9_]*(?:PASSORD|PASSWORD|SECRET|TOKEN|API_?KEY)[A-Z0-9_]*)=([^\s'"#]{8,})/;

/** Values from the tests and docs that are not secrets. */
const TESTVERDIER = new Set([
  'et-langt-passord',
  'feil-passord-her',
  'et-nytt-passord',
  'et-annet-langt-passord',
  'feil-passord-123',
  'redaktor-passord',
  'hemmelig-kode-1234',
  'current-password',
  'new-password',
  'DATABASEVERT',
]);
const ufarlig = (v) =>
  TESTVERDIER.has(v) ||
  /test|eksempel|example|lokal|placeholder|plassholder|changeme|x{6,}|\*{6,}/i.test(v) ||
  /^[A-Z_]+$/.test(v) || // a constant's name, not a value
  /^\$|^\{\{|^%|^process\.env|^getenv/.test(v);

/** Text files only: a NUL byte in the first 8 kB means a binary file (images, fonts). */
export function erTekst(innhold) {
  const slutt = Math.min(innhold.length, 8192);
  for (let i = 0; i < slutt; i++) if (innhold[i] === 0) return false;
  return true;
}

/** @returns {{ sti: string, linje: number, type: string }[]} */
export function finnHemmeligheter(sti, innhold) {
  if (!erTekst(innhold)) return [];
  const tekst = Buffer.from(innhold).toString('utf8');
  const funn = [];
  const linjer = tekst.split('\n');
  linjer.forEach((linje, i) => {
    for (const [type, monster] of NOKKELFORMATER)
      if (monster.test(linje)) funn.push({ sti, linje: i + 1, type });
    for (const m of linje.matchAll(TILORDNING)) {
      if (!ufarlig(m[2])) funn.push({ sti, linje: i + 1, type: `verdi for «${m[1]}»` });
    }
    const miljo = MILJOLINJE.exec(linje);
    if (miljo && !ufarlig(miljo[2])) funn.push({ sti, linje: i + 1, type: `verdi for «${miljo[1]}»` });
  });
  return funn;
}

/** Settings files with real values, and builds or dependencies, by name. */
export const FORBUDTE_FILNAVN =
  /(^|\/)(node_modules|dist|var|\.env(?!\.example)[^/]*|konfig\.php|oppsett\.php|id_(?:rsa|ed25519|ecdsa)|[^/]*\.(?:pem|key|p12|pfx))(\/|$)/;

/**
 * Every file version and commit message reachable from `refs` (what a
 * bundle of those refs carries), scanned. Also every path that ever existed
 * there, against FORBUDTE_FILNAVN.
 * @returns {{ blobber: number, commits: number, funn: { sti: string, linje: number, type: string }[] }}
 */
export function skannHistorikk(refs) {
  const git = (args, input) => {
    const r = spawnSync('git', args, { input, maxBuffer: 2 ** 31 - 1 });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(r.stderr)}`);
    return r.stdout;
  };
  const stier = new Map();
  for (const l of git(['rev-list', '--objects', ...refs])
    .toString()
    .trim()
    .split('\n')) {
    const mellomrom = l.indexOf(' ');
    if (mellomrom > 0) stier.set(l.slice(0, mellomrom), l.slice(mellomrom + 1));
  }
  const funn = [...new Set(stier.values())]
    .filter((s) => FORBUDTE_FILNAVN.test(s))
    .map((sti) => ({ sti, linje: 0, type: 'filnavn i historikken' }));
  // one `git cat-file --batch` for all objects: "<sha> <type> <size>\n<content>\n" per object
  const ut = git(['cat-file', '--batch'], `${[...stier.keys()].join('\n')}\n`);
  let blobber = 0;
  for (let i = 0; i < ut.length;) {
    const slutt = ut.indexOf(10, i);
    const [sha, type, storrelse] = ut.subarray(i, slutt).toString().split(' ');
    const innhold = ut.subarray(slutt + 1, slutt + 1 + Number(storrelse));
    i = slutt + 2 + Number(storrelse);
    if (type !== 'blob') continue;
    blobber++;
    funn.push(...finnHemmeligheter(`${stier.get(sha)} (${sha.slice(0, 7)})`, innhold));
  }
  const meldinger = git(['log', '--format=%H%n%B%x00', ...refs])
    .toString()
    .split('\0');
  for (const m of meldinger) {
    const [sha, ...tekst] = m.trim().split('\n');
    if (sha) funn.push(...finnHemmeligheter(`commit ${sha.slice(0, 7)}`, Buffer.from(tekst.join('\n'))));
  }
  return { blobber, commits: meldinger.filter((m) => m.trim()).length, funn };
}
