# BuildForge

Clicker build engine (spec: [skaperverksted.md › BuildForge](../../../../docs/design/skaperverksted.md#buildforge), brief: [buildforge-handoff.md](../../../../docs/design/buildforge-handoff.md)). Digital prototype: the mechanics are a trial profile and nothing is physically tested.

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
| `bygg.ts` | The build pipeline and the findings |
| `beregning.ts`, `arbeider.ts` | Builds in a web worker, newest request first |
| `bibliotek.ts`, `feste.ts` | Library parts, start templates, attachment points on the current surface |
| `rapport.ts`, `kjerne.ts` | Control report, plug-in core and export rules |
| `handlinger.ts`, `tilstand.ts` | Undoable project changes; editor state (not saved) |
| `Bibliotekpanel.tsx`, `Inspektor.tsx`, `Klikkbrett.tsx`, `Festeoverlegg.tsx`, `tre.ts` | UI: parts panel, inspector, «Prøv klikk» and checks, attachment points in 3D, scene helpers |
| `snitt.ts` | Section outline for the showroom preview |

## Not verified

The switch model, its measurements, the clearances, the print orientation and the top's mass limit are not known (handoff §5.6, §17). A measured profile is a new profile version in `profil.ts`, followed by a calibration print and physical tests; only then may `fysiskStatus` become `testet`.
