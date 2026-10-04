# BuildForge

Build engine for clickers and jointed figures (spec: [skaperverksted.md › BuildForge](../../../../docs/design/skaperverksted.md#buildforge), brief: [buildforge-handoff.md](../../../../docs/design/buildforge-handoff.md)). Digital prototype: the switch and the joints are trial profiles and nothing is physically tested.

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
| `bygg.ts` | The clicker build pipeline and its findings |
| `figur.ts` | Figure family: joint profile, base models per segment, skeleton, joint geometry (pegs, sockets, cut planes) |
| `figurbygg.ts` | The figure build pipeline: segments, one-piece check, overlap check in the standing pose |
| `funn.ts` | Findings, status and the result type shared by both families |
| `beregning.ts`, `arbeider.ts` | Builds in a web worker, newest request first |
| `bibliotek.ts`, `feste.ts` | Library parts, start templates, attachment points on the current surface |
| `rapport.ts`, `kjerne.ts` | Control report, plug-in core and export rules |
| `handlinger.ts`, `tilstand.ts` | Undoable project changes; editor state (not saved) |
| `Bibliotekpanel.tsx`, `Inspektor.tsx`, `Klikkbrett.tsx`, `Festeoverlegg.tsx`, `Handtaksverktoy.tsx`, `tre.ts` | UI: parts panel, inspector, «Prøv klikk» and checks, attachment points in 3D, the handle tools, scene helpers and handles (three.js `TransformControls`) |
| `snitt.ts` | Section outline for the showroom preview |

## Not verified

The switch model, its measurements, the clearances, the print orientation and the top's mass limit are not known (handoff §5.6, §17). For figures, the peg fit (too tight or too loose), the print orientation of each part and whether friction holds the joints are not known. A measured profile is a new profile version in `profil.ts`, followed by a calibration print and physical tests; only then may `fysiskStatus` become `testet`.
