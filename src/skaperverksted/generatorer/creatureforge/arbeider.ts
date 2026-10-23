/** Web worker: runs the Creature Forge build off the main thread. */
import { byggCreature } from './bygg';

self.onmessage = (e: MessageEvent<{ parametre: unknown }>) => {
  const r = byggCreature(e.data.parametre);
  const overfor = [
    ...new Set(r.deler.flatMap((d) => [d.mesh.posisjoner.buffer, d.mesh.indekser.buffer]) as ArrayBuffer[]),
  ];
  (self as unknown as Worker).postMessage(r, overfor);
};
