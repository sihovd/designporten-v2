/** Preact binding for the framework-free Arbeidsbenk. */
import { useEffect, useState } from 'preact/hooks';
import type { Arbeidsbenk, BenkTilstand } from '../core/arbeidsbenk';

/** Re-render on every workbench change. */
export function brukBenk(benk: Arbeidsbenk): BenkTilstand {
  const [t, settT] = useState(benk.tilstand);
  useEffect(() => {
    settT(benk.tilstand);
    return benk.lytt(settT);
  }, [benk]);
  return t;
}

/** Re-render only when the selected slice changes (shallow compare). */
export function brukUtdrag<T>(benk: Arbeidsbenk, velg: (t: BenkTilstand) => T): T {
  const [v, settV] = useState(() => velg(benk.tilstand));
  useEffect(() => {
    let forrige = velg(benk.tilstand);
    settV(forrige);
    return benk.lytt((t) => {
      const neste = velg(t);
      if (!likt(neste, forrige)) {
        forrige = neste;
        settV(neste);
      }
    });
    // `velg` is read once per change; the benk identity drives resubscription
  }, [benk]);
  return v;
}

function likt(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a),
    kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
