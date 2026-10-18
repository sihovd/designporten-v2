/**
 * Splits the verified one.com build (dist/, from scripts/bygg-onecom.mjs) into
 * one upload package per part (stage D, docs/utgivelse.md):
 *
 *   nettside   the website: pages, /_astro/, CMS, forms, Apache settings
 *   konto      the account API: api/konto/
 *   signforge  Sign Forge: skaperverksted/signgen/ (its own build and versioned folder)
 *
 * Every file has exactly one owner, decided by its path (DELER below). Each
 * package gets a manifest beside it: part, version, source commit and whether
 * the working tree had changes, URL base, what it needs from the other parts,
 * the paths it owns and SHA-256 per file. Packages never delete anything on
 * the server; a Sign Forge package carries only its own version folder, so the
 * previous one stays for rollback.
 *
 * Writes var/release/deler/<del>-<versjon>.zip and <del>-<versjon>.manifest.json.
 */
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { finnHemmeligheter } from './hemmeligheter.mjs';

/** Owner by path; the first match wins, and the website owns the rest. */
export const DELER = [
  { id: 'signforge', navn: 'Sign Forge', eier: ['skaperverksted/signgen/'] },
  { id: 'konto', navn: 'Kontodelen (API)', eier: ['api/konto/'] },
  { id: 'nettside', navn: 'Nettsiden', eier: [''] },
];

export const eierAv = (fil) => DELER.find((d) => d.eier.some((e) => fil.startsWith(e))).id;

/** Every file under a folder, by relative path; refuses symbolic links. */
export function lesMappe(mappe) {
  const filer = {};
  const les = (lokal, sti) => {
    for (const navn of readdirSync(lokal)) {
      const l = `${lokal}/${navn}`;
      const r = sti ? `${sti}/${navn}` : navn;
      const info = lstatSync(l);
      if (info.isSymbolicLink()) throw new Error(`A package must not contain symbolic links: ${r}`);
      if (info.isDirectory()) les(l, r);
      else filer[r] = new Uint8Array(readFileSync(l));
    }
  };
  les(mappe, '');
  return filer;
}

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** The numbers the parts agree on, read from the PHP source in the build. */
function kontoversjoner(filer) {
  const tekst = (f) => new TextDecoder().decode(filer[f] ?? new Uint8Array());
  const grensesnitt = Number(
    /KONTO_GRENSESNITT_VERSJON = (\d+)/.exec(tekst('api/konto/_grensesnitt.php'))?.[1],
  );
  const steg = [...tekst('api/konto/_konto.php').matchAll(/^\s{8}(\d+) => \[/gm)].map((m) => Number(m[1]));
  return { grensesnitt, skjema: Math.max(...steg) };
}

export function delOpp(filer, bygg) {
  const konto = kontoversjoner(filer);
  const deler = Object.fromEntries(DELER.map((d) => [d.id, {}]));
  for (const [fil, innhold] of Object.entries(filer)) deler[eierAv(fil)][fil] = innhold;

  const versjon = { nettside: bygg.kort, konto: bygg.kort, signforge: bygg.signforge };
  const krever = {
    nettside: {
      konto: {
        skjema: konto.skjema,
        grensesnitt: konto.grensesnitt,
        hvorfor: 'Min konto (/konto/) og Studio → Medlemmer bruker api/konto/.',
      },
    },
    konto: {
      nettside: {
        filer: ['api/.htaccess', 'api/.user.ini', 'api/bygg.php'],
        valgfritt: ['api/cms/ (bare for admin-handlingene i Studio)'],
      },
    },
    signforge: {
      konto: { skjema: konto.skjema, hvorfor: 'Lagre på kontoen, Mine prosjekter og Publiser i galleriet.' },
      nettside: {
        filer: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'site.webmanifest', 'brand/'],
        sider: ['/', '/skaperverksted/', '/konto/', 'handlekurven (/handlekurv/)'],
      },
    },
  };
  const ut = {};
  for (const d of DELER) {
    const del = deler[d.id];
    if (!Object.keys(del).length) throw new Error(`The part ${d.id} has no files.`);
    if (Object.keys(del).some((f) => /(^|\/)konfig\.php$/.test(f)))
      throw new Error(`A konfig.php in ${d.id}.`);
    const funn = Object.entries(del).flatMap(([f, b]) => finnHemmeligheter(f, b));
    if (funn.length)
      throw new Error(
        `Possible secrets in ${d.id}:\n${funn.map((f) => `  ${f.sti}:${f.linje}: ${f.type}`).join('\n')}`,
      );
    ut[d.id] = {
      filer: del,
      manifest: {
        komponent: d.id,
        navn: d.navn,
        versjon: versjon[d.id],
        kildecommit: bygg.commit,
        kildeendringer: bygg.endret,
        test: bygg.test,
        base: bygg.base,
        eier: d.id === 'nettside' ? 'alt som ikke eies av de andre delene' : d.eier,
        ...(d.id === 'konto' ? { grensesnitt: konto.grensesnitt, skjema: konto.skjema } : {}),
        krever: krever[d.id],
        sletterIkke: 'Pakken laster bare opp filer. Ingenting på serveren slettes.',
        filer: Object.fromEntries(
          Object.entries(del)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([f, b]) => [f, sha(b)]),
        ),
      },
    };
  }
  return ut;
}

export function pakkDeler({ dist = 'dist', ut = 'var/release/deler' } = {}) {
  const bygg = JSON.parse(readFileSync(`${dist}/deployment.json`, 'utf8'));
  if (bygg.prosjekt !== 'designporten-v2' || !bygg.signforge)
    throw new Error('Run scripts/bygg-onecom.mjs first.');
  const kort = `${(bygg.commit ?? 'ukjent').slice(0, 7)}${bygg.endret ? '-endret' : ''}`;
  const deler = delOpp(lesMappe(dist), { ...bygg, kort });
  rmSync(ut, { recursive: true, force: true });
  mkdirSync(ut, { recursive: true });
  const resultat = [];
  for (const [id, { filer, manifest }] of Object.entries(deler)) {
    const navn = `${id}${bygg.test ? '-test' : ''}-${manifest.versjon}`;
    writeFileSync(`${ut}/${navn}.zip`, zipSync(filer, { level: 6 }));
    writeFileSync(`${ut}/${navn}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
    resultat.push({ id, navn, antall: Object.keys(filer).length });
  }
  return resultat;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const r of pakkDeler()) console.warn(`pakk-deler: ${r.navn}.zip (${r.antall} filer)`);
}
