import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Windows and macOS ignore case in file names. Two modules that differ only by
// case (fargesamlinger.ts and Fargesamlinger.tsx) build on Linux/CI but on
// Sivert's PC an import of './Fargesamlinger' finds the wrong one (2026-11-09).
const MODUL = /\.(?:ts|tsx|js|jsx|mjs|mts|astro|json)$/;

test('no two modules in a folder differ only by letter case', () => {
  const filer = spawnSync('git', ['ls-files'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const sett = new Map();
  for (const fil of filer.filter((f) => MODUL.test(f))) {
    const delt = fil.lastIndexOf('/');
    const mappe = fil.slice(0, delt + 1);
    // the import name: the file name without its extension (and without .test etc.)
    const navn = fil.slice(delt + 1).replace(MODUL, '');
    const nokkel = (mappe + navn).toLowerCase();
    const forrige = sett.get(nokkel);
    if (forrige && forrige !== mappe + navn)
      assert.fail(`Bare store/små bokstaver skiller ${forrige} og ${fil}`);
    sett.set(nokkel, mappe + navn);
  }
});
