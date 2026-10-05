/**
 * A mesh of one shape alone (no blending with its neighbours), cached by
 * its geometry. Used for outlines, ghosts while dragging and the library
 * previews; the exported parts always come from the full build.
 */
import type { Mesh } from '../../geometri/mesh';
import { formBoks, formFelt } from './felt';
import type { Form } from './parametre';
import { lagRutenett, marsjer, sample } from './rutenett';

const formMesher = new Map<string, Mesh>();

export function formMesh(f: Form): Mesh {
  const nokkel = JSON.stringify([f.type, f.posisjon, f.rotasjon, f.mal, f.avrunding, f.speilet]);
  let m = formMesher.get(nokkel);
  if (!m) {
    m = marsjer(sample(lagRutenett(formBoks(f), 24_000, 0.35), formFelt(f)));
    if (formMesher.size > 200) formMesher.clear();
    formMesher.set(nokkel, m);
  }
  return m;
}
