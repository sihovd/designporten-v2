import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// PHP_BIN permits a portable local PHP; CI and normal installations use PATH.
const php = process.env.PHP_BIN || 'php';
const args = [];
if (process.platform === 'win32' && process.env.PHP_BIN) {
  args.push('-d', `extension_dir=${resolve(php, '../ext')}`, '-d', 'extension=mbstring');
}
if (process.argv.includes('--lint')) {
  const filer = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((f) =>
      f.isDirectory() ? filer(`${dir}/${f.name}`) : f.name.endsWith('.php') ? [`${dir}/${f.name}`] : [],
    );
  for (const fil of [
    ...filer('php'),
    ...filer('tests/php'),
    ...(existsSync('dist/api') ? filer('dist/api') : []),
  ]) {
    const r = spawnSync(php, [...args, '-l', fil], { stdio: 'inherit' });
    if (r.error || r.status !== 0) process.exit(r.status || 1);
  }
} else {
  // Only the local router is allowed to serve tests; mail() is disabled as a second guard.
  const r = spawnSync(
    php,
    [
      ...args,
      '-d',
      'disable_functions=mail',
      '-d',
      'upload_max_filesize=18M',
      '-d',
      'post_max_size=128M',
      '-d',
      'max_file_uploads=20',
      '-S',
      '127.0.0.1:4322',
      'tests/php/router.php',
    ],
    { stdio: 'inherit' },
  );
  if (r.error) console.error('PHP is required: set PHP_BIN or add PHP 8.1+ with mbstring to PATH.');
  process.exit(r.status || (r.error ? 1 : 0));
}
