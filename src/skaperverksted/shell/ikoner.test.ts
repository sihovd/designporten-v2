import { describe, expect, it } from 'vitest';
import manifest from '../../../docs/design/signgen-ikoner/icons-manifest.json';
import { byttIkoner, ikoner } from './ikoner';

describe('ikonregisteret', () => {
  it('har alle 92 ikonene fra Siverts sett, som ren SVG uten skript eller eksterne ressurser', () => {
    expect(manifest).toHaveLength(92);
    for (const { id } of manifest as { id: string }[]) {
      const t = ikoner[id];
      expect(typeof t, id).toBe('string');
      expect(t as string, id).toMatch(/<(path|circle|rect|ellipse|line|polyline|polygon)/);
      expect(t as string, id).not.toMatch(/<script|<image|href=|url\(/i);
    }
  });

  it('lar ett ikon byttes uten å røre noe annet', () => {
    const for_ = ikoner['pen'];
    const annet = ikoner['text'];
    byttIkoner({ pen: '<path d="M0 0h24"/>' });
    expect(ikoner['pen']).toBe('<path d="M0 0h24"/>');
    expect(ikoner['text']).toBe(annet);
    byttIkoner({ pen: for_! });
  });
});
