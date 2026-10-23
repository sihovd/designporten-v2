/**
 * Function icons from Sivert's Creature Forge pack (`creature_forge_claude/icons/svg/`), used as they
 * are; the stroke is set here to the existing icon sheet's 1.65 (F6). Icons are decorative: the button
 * carries the accessible name. Model thumbnails are never drawn as icons (handoff, UI_OG_IKONER.md).
 */
const filer = import.meta.glob('../../../../creature_forge_claude/icons/svg/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const pakke: Record<string, string> = {};
for (const [sti, tekst] of Object.entries(filer))
  pakke[sti.replace(/^.*\//, '').replace(/\.svg$/, '')] = tekst
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .trim();

export type CfIkonId = 'move' | 'rotate' | 'eye' | 'delete' | 'add' | 'symmetry';

export function CfIkon({ id, storrelse = 18 }: { id: CfIkonId; storrelse?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={storrelse}
      height={storrelse}
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: pakke[id] ?? '' }}
    />
  );
}
