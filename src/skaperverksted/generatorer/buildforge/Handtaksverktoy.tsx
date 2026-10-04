/**
 * Tool row for the handles on the selected shape (move, turn, resize) or
 * the selected part with what hangs on it (move, turn). The
 * handles need dragging, so the same changes are always available without
 * dragging: the fields in the inspector, the arrow keys and the move
 * buttons (WCAG 2.5.7).
 */
import { brukEditor, editor, verktoynavn, type Verktoy } from './tilstand';

const taster: Record<Verktoy, string> = { flytt: 'G', roter: 'R', skaler: 'S' };

export function Handtaksverktoy() {
  const e = brukEditor();
  if ((!e.valgt && !e.kropp) || e.plasserer || e.plassererKropp || e.dra || e.meny) return null;
  // a whole part is moved and turned; its size comes from its shapes
  const verktoy = (Object.keys(verktoynavn) as Verktoy[]).filter((v) => e.valgt || v !== 'skaler');
  return (
    <div
      class="bf-handtak"
      role="group"
      aria-label={e.valgt ? 'Håndtak på valgt form' : 'Håndtak på valgt del'}
    >
      {verktoy.map((v) => (
        <button
          key={v}
          type="button"
          class="kontroll-knapp"
          aria-pressed={e.verktoy === v}
          aria-keyshortcuts={taster[v]}
          onClick={() => editor.sett({ verktoy: v })}
        >
          {verktoynavn[v]} <kbd>{taster[v]}</kbd>
        </button>
      ))}
    </div>
  );
}
