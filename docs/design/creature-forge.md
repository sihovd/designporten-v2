# Creature Forge

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Creature Forge is a generator in Skaperverksted where the user builds **articulated, 3D-printable figures** from editable base shapes, joins them with loose moving joints and adds personal features.

## Sources

| Source | Status |
|---|---|
| Sivert's handoff [`creature_forge_claude/`](../../creature_forge_claude/README.md) (2026-10-23): `CLAUDE_START.md`, `KRAVSPESIFIKASJON.md`, `UI_OG_IKONER.md`, `TESTKRITERIER.md`, `icons/svg/` | Agreed product requirements. Kept unchanged in the repository; this document does not repeat them, it records how they are built. |
| Sivert's instructions in the Claude session of 2026-10-23 | Architecture and phases approved; the clarifications below. |

### Sivert's clarifications (2026-10-23)

1. **Creature Forge is a new, separate generator.** It is not a continuation of Dragon Forge or BuildForge. It has its own data model, joint mechanism, Boolean system and user interface, in `src/skaperverksted/generatorer/creatureforge/`. Existing code may be read for reference, but Dragon Forge and BuildForge are not changed, and no code is moved into shared modules now. Shared infrastructure changes only as far as needed to register and open the new generator (in practice none: generators are discovered by folder).
2. **The Boolean dome** is a negative 3D volume that cuts material away from **both** parts joined by a joint (for example the head and the upper body). It is centred on the joint and follows it when the joint is moved or rotated. The user adjusts its diameter, depth, angle and orientation, the thickness of the negative volume at the centre, and the thickness of the negative volume along the rim. **The thickness belongs to the cutting volume, not to the material left in the parts.** The dome is its own parametric geometry, edited independently of the joint's mechanical print clearance. Changing it updates the cut in both parts automatically.
3. **Joints are first and foremost loose, dangling chain-like joints**, as known from articulated 3D-printed dragons. A captured knob may be explored but is not approved as the final solution. The mechanism (F1) is decided only after a simple prototype has been tested.
4. **«Tilbehør»** stays in the UI design as a planned tab; its function waits.
5. The technical direction F2 to F6 below is approved as provisional.
6. Work proceeds phase by phase: phase 0 (this document) and a bounded phase 1. Nothing beyond phase 1 is built before Sivert has seen and approved the result.

## Technical direction

| Id | Direction | Status |
|---|---|---|
| F1 | Joint mechanism | **Under test.** Phase 1 builds two candidate mechanisms behind one contract so they can be printed and compared: the **chain joint** (`kjede`, default: an eye on one part and a capped bolt through it on the other, like two links of a chain) and the **knob joint** (`knott`, exploratory: a knob on a neck captured in a cavity). Neither is decided. |
| F2 | Print pose | Provisional. The figure prints in one pose, all joints at zero, lying on its back (the figure's front faces up). The editor shows the figure standing; «Printvisning» shows the pose that is exported. The export is always the print pose. |
| F3 | Tolerances | Provisional. Print clearance and play are a versioned profile; every number carries its certainty (trial value, design choice, measured). The user can override clearance and play per project, shown as their own values. Nothing is called tested until Sivert has confirmed a test print. |
| F4 | Calibration piece | Provisional (phase 5). In phase 1 the two-part test figure itself is the test piece; it can be exported with any clearance. |
| F5 | Storage and export | Provisional. The project is JSON in the shared document (`Dokument.parametre`); export is one STL per part, 3MF and a JSON control report. |
| F6 | Icons | Provisional. Function icons are SVG from Sivert's pack, adapted to the existing icon sheet's stroke (1.65) and kept inside Creature Forge. Model thumbnails (phase 3) are rendered from the generated geometry. |

## Model (phase 1)

- **Units and axes:** millimetres; figure coordinates with Z up and the figure's front towards −Y (the shared document convention).
- **Parts** (`deler`): a base shape (`hode` or `overkropp` in phase 1) with length and thickness, a name and a colour. The **root** is the part that hangs on no joint; the figure starts with a head (handoff: «Start med et hode»). Only the root has its own position and rotation; every other part is placed by its joint, so moving a parent moves its children.
- **Snap points** are predefined per base shape (never the nearest surface point). Each has a type (`hals`, `skulder`, `hofte` …), a side (`forelder` on the part that carries the next part, `barn` on the part that hangs on it), a position, an outward normal and an «up» direction that follow the shape's length and thickness. Two points connect only when the type matches and the sides differ, and a point takes one joint.
- **Joints** (`ledd`): parent point, child point, mechanism, distance (along the joint axis between the two snap points; negative lets the parts sink into each other, which the dome then separates), offset (moves the joint in the parent's frame) and rotation (turns the joint and with it the child, the mechanism and the dome).
- **The dome** (`kuppel`) of each joint, in the joint's frame: diameter, depth (the rise of the dome's mid-surface), tilt and direction of the tilt (angle and orientation), thickness at the centre and thickness at the rim. The cutting volume is a curved shell: its mid-surface is a spherical cap of the given diameter and depth, centred on the joint point, and its thickness changes linearly from the centre to the rim. The shell is subtracted from both parts. It is not coupled to the print clearance; whether the parts end up far enough apart is measured afterwards.
- **Joint profile** (`kjedeledd-prove` 0.1.0, trial): print clearance between moving surfaces, play (extra room so the joint dangles), the swing the mechanism is cut free for, and the sizes of eye, bolt, cap and knob. Every value is a trial value or a design choice, shown with its certainty.

## Build and checks (phase 1)

- Each part is a signed distance field: base shape, minus every dome of its joints, plus its own mechanism parts, minus the room the partner's mechanism needs (partner mechanism grown by clearance and play, swept through the swing). Each part is meshed on its own grid (marching tetrahedra), so parts never merge and every part is a closed mesh. Builds run in a web worker.
- Checks, each with a rule id: the part is a closed mesh (CF-DEL-01); the part is one piece (CF-DEL-02); the part is not empty (CF-DEL-03); the measured distance between two parts is at least the print clearance and they do not overlap (CF-KLAR-01); the joint's mechanism is captured, so the parts cannot come apart (CF-FANG-01); how far the joint can swing before the parts touch (CF-SVING-01, a notice with the angle reached); the wall left around the dome and the mechanism is at least the profile's minimum (CF-VEGG-01); the mechanism stands upright in the print pose (CF-PRINT-01). Overhangs and supports for the body shapes are not checked in phase 1, and the model always says it is not physically tested.
- Export is blocked while a check is red; the project can still be saved.

## UI (phase 1)

- Light workshop surface (`flate: 'lys'`), large 3D canvas.
- **Bottom tab bar**, partly transparent: «Kropp» (active), «Tekstur/Farge» and «Tilbehør» (planned, shown as «Kommer senere», not working). In «Kropp», round buttons for the base shapes that exist (Hode, Overkropp). Only one submenu is open at a time.
- Choose «Hode» to place the head. Drag «Overkropp» into the view: the compatible free snap points show, the nearest within reach is highlighted and the part attaches there with an automatic joint on release. Without dragging (keyboard, touch): choose the button, then the snap point from a list.
- Click a part or a joint marker to select it. Manipulators show only for the active object: the root part can be moved; a joint can be moved and rotated (three.js `TransformControls`); fields and sliders are the non-dragging alternative.
- **Egenskaper** (right panel) shows the active part (length, thickness, colour, position for the root), the active joint (mechanism, distance, offset, rotation and the dome's six values, with a translucent preview of the cutting volume) or, with nothing selected, the figure, the tolerances and the checks.

## Phases

| Phase | Deliverable | Status |
|---|---|---|
| 0 | This document, decision log, master spec | Done 2026-10-23 |
| 1 | Vertical prototype: head and upper body with length and thickness, predefined snap points, automatic joint, parent moves children, dome cut, the two candidate mechanisms, clearance, capture, swing and wall checks, export of the test figure | Built, awaiting Sivert's review |
| 2 | Joint editing in full (approved after phase 1) | Not started |
| 3 | Body library (hip, arm, leg, hand, foot, tail, variants), bottom menu with variant rows, 3D thumbnails, symmetry and centre line | Not started |
| 4 | Features side panel (eyes as a symmetric pair, nose, mouth, ears, horns, spikes), additive and subtractive features following the host surface, part editor, fur as surface texture | Not started |
| 5 | Print checks and export in full: overhangs and supports, bed contact, calibration piece, a 10 cm example figure | Not started |
| 6 | Physical test by Sivert; measured values become a new profile version | Not started |

## Open

- F1: which mechanism, after test prints of the phase 1 figure.
- Clearance, play, minimum wall and the printer and material for the first test.
- What «Tilbehør» contains.
- What happens to Dragon Forge and BuildForge's figure family once Creature Forge exists (not part of this work).
