/**
 * Generator registry. Discovery is by folder: a generator is registered by
 * adding generatorer/<id>/meta.ts (exporting `meta: GeneratorMeta`) and
 * generatorer/<id>/index.ts (default export: GeneratorPlugin). No shared
 * file needs editing, so parallel generator work never conflicts here.
 */
import type { GeneratorMeta, GeneratorPlugin } from '../core/generator';

const metaModuler = import.meta.glob<{ meta: GeneratorMeta }>('./*/meta.ts', { eager: true });
const pluginModuler = import.meta.glob<{ default: GeneratorPlugin }>('./*/index.ts');

export const katalog: GeneratorMeta[] = Object.values(metaModuler)
  .map((m) => m.meta)
  .sort((a, b) => a.rekkefolge - b.rekkefolge);

export function finnMeta(id: string): GeneratorMeta | undefined {
  return katalog.find((g) => g.id === id);
}

export async function lastGenerator(id: string): Promise<GeneratorPlugin | null> {
  const last = pluginModuler[`./${id}/index.ts`];
  if (!last) return null;
  return (await last()).default;
}
