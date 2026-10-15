/**
 * The CMS field list (api/cms/nokler.json), written by the one.com build from
 * the built pages: every text marked data-rediger="sider/…", with its type,
 * the pages it appears on and its default text from src/content/sider/.
 * The CMS only accepts these keys, and api/cms/side.php only replaces
 * elements of the shape checked here (plain text, or a run of <p>).
 * See docs/cms/README.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Same pattern as CMS_ELEMENT in php/api/cms/_side.php. */
export const ELEMENT =
  /<([a-z][a-z0-9]*)\b([^>]*?\sdata-rediger="([^"]+)"[^>]*)>([^<]*|(?:\s*<p\b[^>]*>[^<]*<\/p>)+\s*)<\/\1>/g;
const MERKE = /\sdata-rediger="(sider\/[^"]+)"/g;

const htmlfiler = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((f) => {
    const sti = join(dir, f.name);
    if (f.isDirectory()) return f.name === 'api' || f.name === '_astro' ? [] : htmlfiler(sti);
    return f.name === 'index.html' ? [sti] : [];
  });

const hent = (data, sti) =>
  sti.split('.').reduce((v, del) => (v !== null && typeof v === 'object' ? v[del] : undefined), data);

/** @returns {Record<string, {type: 'linje'|'avsnitt', standard: string, sider: string[]}>} */
export function lagNokler(dist, innhold = 'src/content/sider') {
  const nokler = {};
  const feil = [];
  for (const fil of htmlfiler(dist).sort()) {
    const html = readFileSync(fil, 'utf8');
    const side = `/${relative(dist, fil).split(sep).slice(0, -1).join('/')}${fil === join(dist, 'index.html') ? '' : '/'}`;
    const funnet = new Set();
    for (const m of html.matchAll(ELEMENT)) {
      const nokkel = m[3];
      if (!nokkel.startsWith('sider/')) continue;
      funnet.add(nokkel);
      const [filnavn, sti] = nokkel.slice('sider/'.length).split('#');
      const standard = hent(JSON.parse(readFileSync(join(innhold, `${filnavn}.json`), 'utf8')), sti);
      if (typeof standard !== 'string') {
        feil.push(`${nokkel}: finnes ikke i ${innhold}/${filnavn}.json`);
        continue;
      }
      const type = m[2].includes('data-rediger-type="avsnitt"') ? 'avsnitt' : 'linje';
      const felt = (nokler[nokkel] ??= { type, standard, sider: [] });
      if (!felt.sider.includes(side)) felt.sider.push(side);
    }
    for (const [, nokkel] of html.matchAll(MERKE)) {
      if (!funnet.has(nokkel))
        feil.push(
          `${nokkel} på ${side}: elementet har ikke ren tekst, så CMS-et kan ikke sette inn tekst der`,
        );
    }
  }
  if (feil.length) throw new Error(`CMS-feltlisten kan ikke lages:\n${[...new Set(feil)].join('\n')}`);
  return nokler;
}
