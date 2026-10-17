/** Package only the verified PHP/static output, including Apache dotfiles. */
import { readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { finnHemmeligheter } from './hemmeligheter.mjs';

const bygg = JSON.parse(readFileSync('dist/deployment.json', 'utf8'));
if (bygg.prosjekt !== 'designporten-v2') throw new Error('Unexpected build.');
const filer = {};
function leggTil(mappe, sti = '') {
  for (const navn of readdirSync(mappe)) {
    const lokal = `${mappe}/${navn}`;
    const relativ = sti ? `${sti}/${navn}` : navn;
    const info = lstatSync(lokal);
    if (info.isSymbolicLink()) throw new Error('A deployment must not contain symbolic links.');
    if (info.isDirectory()) leggTil(lokal, relativ);
    else filer[relativ] = new Uint8Array(readFileSync(lokal));
  }
}
leggTil('dist');
for (const fil of [
  'index.html',
  '.htaccess',
  'api/.htaccess',
  'api/.user.ini',
  'api/foresporsel/index.php',
  'api/bestilling/index.php',
]) {
  if (!filer[fil]) throw new Error(`Missing deployment file: ${fil}`);
}
if (Object.keys(filer).some((fil) => /(^|\/)(node_modules|server|var|\.env)(\/|$)/.test(fil))) {
  throw new Error('Unexpected server/source files in deployment.');
}
// settings with passwords are never built in, but check the contents, not only the names
if (Object.keys(filer).some((fil) => /(^|\/)konfig\.php$/.test(fil)))
  throw new Error('A konfig.php in the deployment.');
const funn = Object.entries(filer).flatMap(([fil, innhold]) => finnHemmeligheter(fil, innhold));
if (funn.length) {
  throw new Error(
    `Possible secrets in the deployment:\n${funn.map((f) => `  ${f.sti}:${f.linje}: ${f.type}`).join('\n')}`,
  );
}
mkdirSync('var/release', { recursive: true });
const navn = `var/release/designporten-${bygg.test ? 'test' : 'production'}.zip`;
writeFileSync(navn, zipSync(filer, { level: 6 }));
console.warn(`Packaged ${Object.keys(filer).length} static/PHP files in ${navn}.`);
