/** The «Sidetekster» collection in /admin, generated from the page definitions. */
import { sideFil, sideIder, sider, type Felt } from './definisjon';

function cmsFelt(navn: string, f: Felt): Record<string, unknown> {
  if (f.type === 'tekst') {
    return {
      name: navn,
      label: f.etikett,
      widget: f.lang ? 'text' : 'string',
      ...(f.hint ? { hint: f.hint } : {}),
      ...(f.valgfri ? { required: false } : {}),
    };
  }
  const felt = Object.entries(f.felt).map(([n, u]) => cmsFelt(n, u));
  if (f.type === 'gruppe')
    return { name: navn, label: f.etikett, widget: 'object', collapsed: true, fields: felt };
  return {
    name: navn,
    label: f.etikett,
    label_singular: f.entall,
    widget: 'list',
    collapsed: true,
    summary: `{{${f.sammendrag}}}`,
    ...(f.min !== undefined ? { min: f.min } : {}),
    ...(f.max !== undefined ? { max: f.max } : {}),
    ...(f.min !== undefined && f.min === f.max
      ? { allow_add: false, allow_remove: false, allow_reorder: false }
      : {}),
    fields: felt,
  };
}

export function sidetekstSamling() {
  return {
    name: 'sider',
    label: 'Sidetekster',
    description:
      'Tekstene på sidene. De kan også endres rett på siden: logg inn her, åpne siden og trykk «Rediger tekst» nederst.',
    files: sideIder.map((id) => ({
      name: id,
      label: sider[id].etikett,
      file: sideFil(id),
      format: 'json',
      preview_path: sider[id].sti,
      fields: Object.entries(sider[id].felt).map(([navn, f]) => cmsFelt(navn, f)),
    })),
  };
}
