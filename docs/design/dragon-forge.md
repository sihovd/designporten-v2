# Dragon Forge: brick builder

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Extends [skaperverksted.md › Articulated dragon generator](skaperverksted.md#articulated-dragon-generator). Dragon Forge stays the `drage` generator on the same route; the classic part-picker dragon is unchanged and every existing project opens as before.

## Sources

| Source | Status |
|---|---|
| Sivert's project treatise «Dragon Forge – et modulært verksted for artikulerte, 3D-printbare drager» v1.0, 2026-11-02, kept unchanged as [dragon-forge-prosjektavhandling.md](dragon-forge-prosjektavhandling.md) | New product direction. Its data model, phases and acceptance criteria (DF-01 to DF-18) are a proposal; this file records what is decided and built. |
| Sivert's message in the Claude project thread, 2026-11-02 | Do phase 0 (map the existing code) and phase 1 (a working, graph-based brick builder); keep existing functionality; stay inside Dragon Forge. |

## Direction (2026-11-02)

Dragon Forge becomes a CityKit-like workshop: the user builds a dragon by placing articulated **bricks** on the plate and joining them at **connection points**; bricks can be edited, repeated, swapped and saved as presets, and joints get their own designer. Four rooms in one project: Bygg drage, Rediger brikke, Design kobling, Klargjør print (treatise §5). This widens the older spec, which only described pre-modelled parts on fixed joints. The classic dragon remains as the «ferdig drage» mode of the same generator.

## Phase 0: what exists and what is reused

Read 2026-11-02 on `main` (`affab66`).

| Existing | Verdict |
|---|---|
| `drage/ledd.ts`, `ledd-geometri.ts`: one joint standard, a vertical hinge printed in place (socket with a biconical cavity and wedge slot in the front part, pin and arm on the rear part), clearance 0.35–0.6 mm by size, own invariant check | **Reused unchanged** as the brick joint. It is the only mechanism with geometry and tests in Dragon Forge, so it is the first (trial) profile. |
| `drage/utviklingsbibliotek.ts`: procedural bodies (dome over a superellipse, socket cut in by a loft), head with snout/eyes/horns, spikes, tail tips, wings, legs | **Reused**: body, head, spikes and tail are built per brick by the same functions (now exported). Wings and legs wait for later phases. |
| `drage/skjelett.ts`: proportions and the rule that sizes a part around its socket (`delmaal`) | **Reused** (exported): a brick's size comes from the same rule, so walls round the socket keep their minimum. |
| `drage.test.ts`: closed shells, clearance vertex-to-surface between moving parts | Helpers moved to `testgeometri.ts` and **reused** for brick pairs. |
| Shell: history (one step per change, merge on drags), `lesInn`, autosave, file save/open, 3MF/STL export with one body per `ModellDel`, export rules, the 3D view with overlays | **Reused** without changes to the shell. |
| BuildForge `graf.ts` (a modular body graph) | Read as a pattern only. Not imported: product models are kept apart (treatise §3). |
| CityKit code | **Not in this repository.** Only the treatise's summary was available; no CityKit class is copied. |

Missing for production: physically tested joint measurements, Designporten's modelled parts, the printer and material for calibration, and which mechanism family comes after the trial hinge (treatise §34).

## Phase 1: the brick builder (implemented)

**Mode.** «Bygg med brikker» in the classic inspector switches the project to brick mode (`parametre.modus = 'brikker'`); «Tilbake til ferdig drage» switches back. Both are undo steps, and the classic values and the bricks stay in the same `parametre`, so neither is lost. A project without `modus` is classic. A new brick project starts from the reference dragon (treatise §32: one head, three body pieces, one tail end) in the head and tail chosen in the classic picker.

**Project model** (`brikker/modell.ts`, `parametre.brikker`, schema 1, plain JSON):

- *Definition*: id + version, category (hode, kropp, hale), size in the skeleton's relative units, head or tail recipe, connection points. Nine definitions, all development geometry: three heads, two body pieces, a tail joint, three tail ends.
- *Point*: stable id (`foran`, `bak`), role (`tapp` = pin, `sokkel` = socket), profile id + version, capacity one. The point's frame (position and outward direction) is computed from the joint standard: the socket centre one socket radius inside the rear, a front pin `mellomrom` + one socket radius in front, exactly as in the classic skeleton.
- *Instance*: id, definition reference, optional own name, local values (width ×0.8–1.4 with the joint locked, spikes, and for heads horns and eyes).
- *Connection*: two ends, profile reference, joint angle (0 = print pose in phase 1), production `print-i-ett`.
- *Group*: one per connected set; its root carries the placement (x, y in mm, angle in degrees). Every other brick is placed from its parent: `T_barn = T_forelder · K_forelder · R(180° + q) · K_barn⁻¹`.
- *Profile*: `hengsel-m` v1, the existing joint at the 160 mm reference size, `fysiskStatus: 'proveprofil'`.

**Rules.** A pin joins a socket of the same profile; two pins, two sockets, an occupied point, the brick itself or a closed loop are refused with a reason, and nothing is created. Disconnect keeps both sides where they lie and makes the far side a loose group. Delete either leaves what hung on the brick as loose groups or deletes the branch behind it. Swap keeps every connection whose point id exists on the new brick with a fitting role and shows the ones it loses before the swap; what hung on a lost point stays where it lay. Each operation is one undo step. Reading a stored project (`lesBrikkeprosjekt`, also on open via `lesInn`) checks ids, references, capacity, compatibility and loops, repairs the groups, keeps an unknown definition version as it is and reports it.

**Geometry and checks** (`brikker/bygg.ts`). Each brick is built in its own frame from the classic recipe and placed by the graph; one `ModellDel` per brick and material, so each brick is a separate moving body in the 3MF. The build reports: development geometry, the trial profile, loose groups, plate and height limits, colour count, the joint's own check, and a red finding when two bricks that are not joined overlap seen from above (convex footprints). Brick-mode export offers one STL per brick and is blocked while a red finding stands; the project can still be saved.

**Editor.** Bottom tray: library (Hoder, Kropp, Hale) with thumbnails rendered from the brick itself. Choosing a brick lights up the free points it fits on the model (cyan) and lists them as buttons; tapping one shows a see-through cyan preview and the sentence of what will happen, with «Koble» / «Avbryt». «Legg løst på platen» adds it unconnected. Tapping a brick selects it (light purple). Properties: the model tree (★ root, children indented, loose groups), the selected brick's points with «Koble fra» / «Koble til …», Bytt, Dupliser, Slett, Slett med grenen, its own values («Kun denne brikken»), the group's X, Y and direction, colours, and facts about the joint. Esc cancels a pending action, Delete deletes the selected brick. Nothing needs hover, right-click or dragging.

**Tests** (`brikker/brikker.test.ts`): reference dragon, DF-01, DF-02, DF-03, DF-05, DF-07 (save and reopen gives the same bricks, connections and placement), DF-08, DF-11, DF-14, group move and turn, delete modes, repair on read, unknown version kept, closed shells for every definition, joint clearance in the print pose for ten neighbour pairs, mode switch with undo, export rules.

## Not built yet

Later phases of the treatise: the brick editor with positive/negative shapes and protected zones (phase 2), the joint designer and a chosen mechanism family with linking tests (phase 3), presets and a versioned library (phase 4), chains, mirrored pairs and paths (phase 5), print setup and a control report (phase 6). Also: posing a joint (the angle is stored but stays 0), dragging bricks in 3D (placement is by points and number fields), wings and legs as bricks, collision between bricks during movement, and a physical test print. Nothing here is physically validated.
