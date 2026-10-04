/**
 * Tool row for the handles on the selected shape (move, turn, resize). The
 * handles need dragging, so the same changes are always available without
 * dragging: the fields in the inspector, the arrow keys and the move
 * buttons (WCAG 2.5.7).
 */
import { brukEditor, editor, verktoynavn, type Verktoy } from './tilstand';

const taster: Record<Verktoy, string> = { flytt: 'G', roter: 'R', skaler: 'S' };

export function Handtaksverktoy() {
  const e = brukEditor();
  if (!e.valgt || e.plasserer) return null;
  return (
    <div class="bf-handtak" role="group" aria-label="Håndtak på valgt form">
      {(Object.keys(verktoynavn) as Verktoy[]).map((v) => (
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
