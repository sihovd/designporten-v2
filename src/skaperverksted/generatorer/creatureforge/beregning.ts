/**
 * Runs builds in a web worker, newest request first: while one build runs,
 * newer requests replace each other and every waiting caller gets the
 * newest result (the workbench drops results for older documents anyway).
 * Without workers (tests) or after a worker failure, builds run on the main
 * thread.
 */
import { byggCreature, type CfResultat } from './bygg';

let arbeider: Worker | null | undefined;
let kjorer = false;
let neste: { parametre: unknown; losere: ((r: CfResultat) => void)[] } | null = null;

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
    const r = byggCreature(jobb.parametre);
    for (const l of jobb.losere) l(r);
    return;
  }
  kjorer = true;
  w.onmessage = (e: MessageEvent<CfResultat>) => {
    kjorer = false;
    for (const l of jobb.losere) l(e.data);
    pump();
  };
  w.onerror = (e) => {
    e.preventDefault();
    console.error('Creature Forge-beregningen feilet i bakgrunnen; regner videre i hovedtråden.', e.message);
    w.terminate();
    arbeider = null;
    kjorer = false;
    neste = neste ? { parametre: neste.parametre, losere: [...jobb.losere, ...neste.losere] } : jobb;
    pump();
  };
  w.postMessage({ parametre: jobb.parametre });
}

export function beregn(parametre: unknown): Promise<CfResultat> {
  if (!hentArbeider()) return Promise.resolve(byggCreature(parametre));
  return new Promise((los) => {
    if (neste) {
      neste.parametre = parametre;
      neste.losere.push(los);
    } else neste = { parametre, losere: [los] };
    pump();
  });
}
