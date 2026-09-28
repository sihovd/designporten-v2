/**
 * Capability limits per plan (spec: "Free and paid direction"). One
 * configuration object read by the editor, so introducing plans later is a
 * change of data. No plans, prices or subscription behaviour exist yet
 * (D-4): the default is "no limits".
 */
export interface Plangrenser {
  /** CSV batch generation available. */
  csvBatch: boolean;
}

export const plangrenser: Plangrenser = {
  csvBatch: true,
};
