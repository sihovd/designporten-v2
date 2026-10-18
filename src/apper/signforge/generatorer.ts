/**
 * The generator registry in the separate Sign Forge build: only Sign Forge,
 * so the build carries none of the other tools. Same API as
 * skaperverksted/generatorer/index.ts, which this replaces there
 * (scripts/bygg-signforge.mjs).
 */
import type { GeneratorMeta, GeneratorPlugin } from '@/skaperverksted/core/generator';
import { meta } from '@/skaperverksted/generatorer/signgen/meta';

export const katalog: GeneratorMeta[] = [meta];

export function finnMeta(id: string): GeneratorMeta | undefined {
  return katalog.find((g) => g.id === id);
}

export async function lastGenerator(id: string): Promise<GeneratorPlugin | null> {
  if (id !== 'signgen') return null;
  return (await import('@/skaperverksted/generatorer/signgen/index')).default;
}
