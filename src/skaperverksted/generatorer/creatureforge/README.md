# Creature Forge

Articulated, 3D-printable figures built from base shapes with loose joints (spec: [creature-forge.md](../../../../docs/design/creature-forge.md), handoff: [creature_forge_claude/](../../../../creature_forge_claude/README.md)). A separate generator: nothing here is shared with Dragon Forge or BuildForge. Phase 1 is a vertical prototype, and nothing is test-printed.

| File | What |
|---|---|
| `vektor.ts` | Vectors and rotations (XYZ Euler as three.js uses it) |
| `sdf.ts` | Signed distance fields: ellipsoid, round cone, bicone, diamond bars and rings, swept bars; union, cut, grow, frames, boxes |
| `marsj.ts` | Narrow-band sampling and marching tetrahedra: one closed mesh per field |
| `grunnformer.ts` | Base shapes (head, upper body) with their predefined snap points |
| `parametre.ts` | The stored project, its limits and runtime validation (one root, a tree, fitting snap points) |
| `plassering.ts` | Placement through the joints (parents move children), free snap points, attach and delete |
| `kuppel.ts` | The Boolean dome: a curved shell cut from both parts of a joint, independent of the clearance |
| `ledd.ts` | The trial joint profile and the two candidate mechanisms under test: chain joint (eye and capped bolt) and knob joint |
| `bygg.ts` | The build: fields → meshes → checks (closed, one piece, clearance, capture, swing, walls, print pose) → print pose |
| `kontroll.ts` | Mesh measurements: closedness, pieces, specks, vertex-to-triangle distance, thin walls |
| `beregning.ts`, `arbeider.ts` | Builds in a web worker, newest request first |
| `kjerne.ts`, `index.ts`, `meta.ts` | Plug-in core, export rules and control report; UI wiring |
| `handlinger.ts`, `tilstand.ts` | Undoable changes; editor state (selection, handles, print view, drag) |
| `Kroppsmeny.tsx`, `Egenskaper.tsx`, `Overlegg.tsx`, `ikoner.tsx`, `creatureforge.css` | Bottom tab bar, properties panel, 3D overlay (selection, joint markers, snap points, handles, dome preview), function icons from Sivert's pack |

## Not verified

The clearance, the play, the minimum wall and whether either mechanism prints in place, comes loose after printing and survives use are unknown. Overhangs and supports of the body shapes are not checked. A measured profile is a new version in `ledd.ts`; only then may `fysiskStatus` become `testet`.
