/**
 * Capability limits per plan (spec: "Free and paid direction"). One
 * configuration object read by the editor, so introducing plans later is a
 * change of data. No prices or subscription behaviour exist yet (D-4).
 * Which services will cost something comes from the shared service list
 * (src/lib/konto/tjenester.ts): everything is free for now, CSV batch
 * included (Sivert, 2026-10-16).
 */
import { erApen } from '@/lib/konto/tjenester';

export interface Plangrenser {
  /** CSV batch generation available. */
  csvBatch: boolean;
}

export const plangrenser: Plangrenser = {
  csvBatch: erApen('csv'),
};
