/**
 * The part library boundary.
 *
 * The spec says the dragon's parts are modelled by Designporten, not
 * generated. Until that library exists, `utviklingsbibliotek` supplies
 * clearly labelled procedural development geometry through this same
 * interface, so modelled parts replace it by swapping `hentDelbibliotek`
 * and nothing else.
 *
 * Contract for any library:
 *   - Shells are closed, outward-facing meshes in millimetres on the
 *     skeleton's coordinates (nose towards +X, bed at z = 0).
 *   - Every shell belongs to one skeleton part (`del`) and moves with it.
 *   - Body shells must leave the joint free: the socket (cavity + slot, see
 *     `sokkelKropp`) and the neighbour's pin and arm. A modelled body is
 *     either built around the joint standard in `ledd.ts` or has the socket
 *     cut out with `sokkelKropp`'s keep-out before use.
 *   - Shells of one part stay at least the joint clearance away from every
 *     other part in the print pose.
 * The pins, arms and all clearances belong to the generator, not the
 * library, because they must scale with the printer tolerance.
 */
import type { Mesh } from '../../geometri/mesh';
import type { DrageParametre } from './parametre';
import type { Skjelett } from './skjelett';
import { utviklingsbibliotek } from './utviklingsbibliotek';

export type Skalltype =
  'kropp' | 'snute' | 'bein' | 'pigg' | 'horn' | 'haletupp' | 'vinge' | 'ribbe' | 'oye' | 'klo' | 'ledd';

export interface Skall {
  mesh: Mesh;
  type: Skalltype;
  /** Index of the skeleton part this shell belongs to. */
  del: number;
}

export interface Delbibliotek {
  id: string;
  navn: string;
  /** True while the parts are procedural development geometry. */
  utviklingsgeometri: boolean;
  byggDeler(skjelett: Skjelett, p: DrageParametre): Skall[];
}

/** The active library. Async so a modelled library can load its assets on demand. */
export async function hentDelbibliotek(): Promise<Delbibliotek> {
  return utviklingsbibliotek;
}
