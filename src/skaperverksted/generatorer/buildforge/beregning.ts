/**
 * Runs builds in a web worker, latest request first (handoff §10): while one
 * build runs, newer requests replace each other, and every waiting caller
 * gets the newest result. The workbench drops results for older revisions
 * anyway, so nothing stale is ever shown. Without workers (tests, old
 * browsers) or after a worker failure, builds run on the main thread.
 */
import { byggBuildforge, type BuildforgeResultat } from './bygg';

let arbeider: Worker | null | undefined;
let kjorer = false;
let neste: { parametre: unknown; losere: ((r: BuildforgeResultat) => void)[] } | null = null;

function hentArbeider(): Worker | null {
  if (arbeider !== undefined) return arbeider;
  try {
    arbeider =
      typeof Worker === 'undefined'
        ? null
        : new Worker(new URL('./arbeider.ts', import.meta.url), { type: 'module' });
  } catch {
    arbeider = null;
  }
  return arbeider;
}

function pump(): void {
  const w = arbeider;
  if (kjorer || !neste) return;
  const jobb = neste;
  neste = null;
  if (!w) {
    const r = byggBuildforge(jobb.parametre);
    for (const l of jobb.losere) l(r);
    return;
  }
  kjorer = true;
  w.onmessage = (e: MessageEvent<BuildforgeResultat>) => {
    kjorer = false;
    for (const l of jobb.losere) l(e.data);
    pump();
  };
  w.onerror = (e) => {
    e.preventDefault();
    console.error('BuildForge-beregningen feilet i bakgrunnen; regner videre i hovedtråden.', e.message);
    w.terminate();
    arbeider = null;
    kjorer = false;
    neste = neste ? { parametre: neste.parametre, losere: [...jobb.losere, ...neste.losere] } : jobb;
    pump();
  };
  w.postMessage({ parametre: jobb.parametre });
}

export function beregn(parametre: unknown): Promise<BuildforgeResultat> {
  if (!hentArbeider()) return Promise.resolve(byggBuildforge(parametre));
  return new Promise((los) => {
    if (neste) {
      neste.parametre = parametre;
      neste.losere.push(los);
    } else neste = { parametre, losere: [los] };
    pump();
  });
}
