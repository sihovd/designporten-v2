/** Measurements of a built model for the status bar and the export review. */
import type { ModellDel } from '../geometri/mesh';
import { avgrensning, volum } from '../geometri/mesh';

export interface Modellmal {
  bredde: number;
  dybde: number;
  hoyde: number;
  min: [number, number, number];
  maks: [number, number, number];
  /** Solid volume, mm³ (not an estimate of filament: infill varies). */
  volum: number;
  deler: number;
}

export function mal(deler: ModellDel[]): Modellmal | null {
  const med = deler.filter((d) => d.mesh.indekser.length > 0);
  if (!med.length) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const maks: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let v = 0;
  for (const d of med) {
    const b = avgrensning(d.mesh);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, b.min[k]!);
      maks[k] = Math.max(maks[k]!, b.maks[k]!);
    }
    v += volum(d.mesh);
  }
  return {
    bredde: maks[0] - min[0],
    dybde: maks[1] - min[1],
    hoyde: maks[2] - min[2],
    min,
    maks,
    volum: v,
    deler: med.length,
  };
}
