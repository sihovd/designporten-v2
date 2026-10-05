# BuildForge

Build engine for clickers and modular models of body parts joined at connectors (spec: [skaperverksted.md › BuildForge](../../../../docs/design/skaperverksted.md#buildforge), briefs: [buildforge-handoff.md](../../../../docs/design/buildforge-handoff.md) and the newer [buildforge-handoff-2026-10-04.md](../../../../docs/design/buildforge-handoff-2026-10-04.md)). Digital prototype: the switch and the joints are trial profiles and nothing is physically tested.

| File | What |
|---|---|
| `profil.ts` | Mechanism profiles with provenance per number; `sjekkProfil` checks the profile's own consistency |
| `parametre.ts` | The stored project (`Dokument.parametre`), runtime validation (zod), revision checksum |
| `sdf.ts` | Signed distance primitives and operations, rays, boxes |
| `felt.ts` | Shapes → fields, body decoration, cut-back from protected zones |
| `mekanikk.ts` | Locked mechanics from the profile: exact meshes, fields, protected zones, switch reference |
| `prisme.ts` | Exact prism meshes with stepped and blind holes |
| `rutenett.ts` | Grid sampling, marching tetrahedra, volume, centroid, connected regions |
| `sveip.ts` | Collision through the travel with an error bound |
| `bygg.ts` | The clicker build pipeline and its findings; routes modular projects to `modulbygg.ts` |
| `kroppsbibliotek.ts` | Body-part library (bodies, heads, necks, arms, hands, legs, feet, tails, wings) with connectors; the starts for «La oss bygge en …» |
| `graf.ts` | The body graph: placement from connections (turn and ball-joint bend), groups, tree, and the operations (connect, disconnect, replace, delete, mirror, duplicate, turn, bend, joint type, add/edit/delete connectors) |
| `ledd.ts` | Joint profiles and joint geometry: peg joints (pegs, sockets, the partner's swing cylinder kept clear) and ball joints (`kuleledd-prove`: ball and neck, socket with a cone mouth, bend limit) |
| `modulbygg.ts` | The modular build pipeline: parts, one-piece check, overlap check, loose-part notice |
| `migrering.ts` | Converts 0.2 figure projects to the modular model on read |
| `dra.ts` | One drag engine: library or group drags, connector cycling (right-click, C, «Bytt kobling»), Esc |
| `funn.ts` | Findings, status and the result type shared by both families |
| `beregning.ts`, `arbeider.ts` | Builds in a web worker, newest request first |
| `bibliotek.ts`, `feste.ts` | Library parts, start templates, attachment points on the current surface |
| `rapport.ts`, `kjerne.ts` | Control report, plug-in core and export rules |
| `handlinger.ts`, `tilstand.ts` | Undoable project changes; editor state (not saved) |
| `Bibliotekpanel.tsx`, `Inspektor.tsx`, `Klikkbrett.tsx`, `Festeoverlegg.tsx`, `Handtaksverktoy.tsx`, `Startvelger.tsx`, `Lerretsoverlegg.tsx`, `Statusbrikke.tsx`, `Koblingsmerker.tsx`, `miniatyr.ts`, `formmesh.ts`, `tre.ts` | UI: library cards and model tree, inspector with joint and connector panels, «Prøv klikk» and checks, attachment points and connectors in 3D, the handle tools, the «La oss bygge en …» carousel, drag hint, radial menu and breadcrumb, compact status chip, connector markers inside a part, 3D thumbnails, shape meshes, scene, drag preview and handles (three.js `TransformControls`) |
| `snitt.ts` | Section outline for the showroom preview |

## Not verified

The switch model, its measurements, the clearances, the print orientation and the top's mass limit are not known (handoff §5.6, §17). For modular models, the peg fit (too tight or too loose), the print orientation of each part and whether friction holds the joints are not known; the same goes for the ball joint's snap fit and bend range. A measured profile is a new profile version in `profil.ts`, followed by a calibration print and physical tests; only then may `fysiskStatus` become `testet`.
