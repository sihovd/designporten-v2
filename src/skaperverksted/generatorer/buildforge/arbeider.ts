/** Web worker: runs the BuildForge build off the main thread (handoff §10). */
import { byggBuildforge } from './bygg';

self.onmessage = (e: MessageEvent<{ parametre: unknown }>) => {
  const r = byggBuildforge(e.data.parametre);
  const overfor = r.deler.flatMap((d) => [d.mesh.posisjoner.buffer, d.mesh.indekser.buffer]) as ArrayBuffer[];
  (self as unknown as Worker).postMessage(r, overfor);
};
