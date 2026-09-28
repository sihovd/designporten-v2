# Artikulert drage

Generator for a print-in-place articulated dragon (spec: `docs/design/skaperverksted.md`, «Articulated dragon generator»).

## Pipeline

`parametre.ts` (part choices, limits) → `skjelett.ts` (chain of parts sized to the chosen length) → `bibliotek.ts` (part shells) + `ledd-geometri.ts` (pins and arms) → `bygg.ts` (one `ModellDel` per articulated piece and material, centred on the plate, with warnings).

## The joint standard (`ledd.ts`)

Every piece connects to the next through the same vertical hinge, printed in place lying on the bed:

- **Front piece:** a socket. A biconical cavity (radius `a` at the bed and at the top, `a + h/2` at mid height, 45° walls), open to the bed, roofed at `h + klaring`, with a wedge slot (half-angle 48°) towards the tail.
- **Rear piece:** a biconical pin inside the cavity, joined to its body by a straight arm through the slot.
- Only vertical and 45° faces, so no supports. The pin is wider at mid height than the slot and the openings, so it cannot fall out. The slot edges are the rotation stops (about ±27°).
- **Clearance** (`klaringFor`): 0.42 mm at 100 mm, 0.49 mm at 160 mm, 0.59 mm at 240 mm, never below 0.35 or above 0.6. It is measured normal to the moving faces (the horizontal gap on the 45° faces is √2 × clearance). The rest of the joint scales with the dragon, down to fixed minimums (pin radius, wall, arm width) so small dragons stay strong.
- Neighbouring bodies are `klaring + 0.3` mm apart in the print pose.

Printer tolerances in `core/materialer.ts` are not yet confirmed by Designporten. When they are, adjust `klaringFor` and re-run the tests.

## Part library (asset boundary)

The spec says the dragon parts are modelled by Designporten. Until they exist, `utviklingsbibliotek.ts` supplies **utviklingsgeometri**: simple procedural domes, cones and plates, clearly labelled in the editor. To use modelled parts, implement `Delbibliotek` (see `bibliotek.ts`) and return it from `hentDelbibliotek()`. Nothing else changes. Modelled bodies must keep the joint free: build them around the socket geometry above, or cut the socket out with the same dimensions. Pins, arms and clearances stay in the generator.

## Tests

`drage.test.ts` checks that every shell is closed and outward-facing, that no two moving pieces touch or come closer than the clearance in the print pose (vertex-to-surface distance and inside tests), that the skeleton hits the chosen length at every size and body type, that every catalogue variant builds, and that parameters are validated.
