/** Preact binding for the framework-free Arbeidsbenk. */
import { useEffect, useState } from 'preact/hooks';
import type { Arbeidsbenk, BenkTilstand } from '../core/arbeidsbenk';

/** How often panels follow a drag on the canvas (ms); they catch up at once when it ends. */
const ROLIG_PANEL = 150;

/**
 * Re-render on every workbench change. While a drag runs on the canvas (`drar`), at most every
 * 150 ms, so the panels (layers, properties) do not hold back the canvas on every frame;
 * `straks` follows every change (overlays that move with the selection).
 */
export function brukBenk(benk: Arbeidsbenk, straks = false): BenkTilstand {
  const [t, settT] = useState(benk.tilstand);
  useEffect(() => {
    settT(benk.tilstand);
    let tidsur: ReturnType<typeof setTimeout> | undefined;
    const av = benk.lytt((ny) => {
      if (ny.drar && !straks) {
        tidsur ??= setTimeout(() => {
          tidsur = undefined;
          settT(benk.tilstand);
        }, ROLIG_PANEL);
        return;
      }
      clearTimeout(tidsur);
      tidsur = undefined;
      settT(ny);
    });
    return () => {
      av();
      clearTimeout(tidsur);
    };
  }, [benk, straks]);
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
