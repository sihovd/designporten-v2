# Dragon Forge: drawing editor

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Replaces the parameter picker described in [skaperverksted.md › Articulated dragon generator](skaperverksted.md#articulated-dragon-generator) for new dragons. Dragon Forge stays the `drage` generator on the same route. Dragons made with the earlier part picker open and work as before.

## Sources

| Source | Status |
|---|---|
| Sivert's project treatise «Dragon Forge – et modulært verksted for artikulerte, 3D-printbare drager» v1.0, 2026-11-02, kept unchanged as [dragon-forge-prosjektavhandling.md](dragon-forge-prosjektavhandling.md) | Background and phase 0 (map the existing code). Its brick-graph model was built first and then replaced, see below. Its rules on trial profiles and physical validation still apply. |
| Sivert in the Claude project thread, 2026-11-02: «Dette skal bygges fra bunnen.» and «Ønsker samme prinsipp med 2d editoren der man tegner og legger til elementer samtidig som man ser hvordan det blir. Så kan man også se fra siden.» | The direction this file describes: a new drawing editor in the spirit of Sign Forge, with a top view, a side view and the result shown at the same time. |

## Direction

The user draws the dragon. Seen from above they draw the spine and pull out the width; seen from the side they drag the height; they add spikes where they want them. The 3D model is built while they draw. Pieces and the joints between them are laid out along the spine automatically, and the joint's measurements are locked. The dragon prints in place in the pose that is drawn.

A brick builder (place bricks and join them at points, treatise phase 1) was built first on the same branch and replaced by this before it was merged. It is in the git history of PR #58.

## Phase 0: what exists and what is reused

Read 2026-11-02 on `main` (`affab66`).

| Existing | Verdict |
|---|---|
| `drage/ledd.ts`, `ledd-geometri.ts`: one joint standard, a vertical hinge printed in place (socket with a biconical cavity and wedge slot in the front piece, pin and arm on the rear piece), clearance 0.35–0.6 mm by size, own invariant check | **Reused** as the joint between drawn pieces. One small, compatible change: the socket's slot can open in another direction than straight back (`Sokkel.retning`, default straight back, so the classic dragon is unchanged). |
| `drage/utviklingsbibliotek.ts`: procedural bodies, head with snout, eyes and horns, spikes, tail tips | **Reused** per piece (exported). Wings and legs are not in the drawing editor yet. |
| `drage/skjelett.ts`: proportions, head and tail reach, arm length | **Reused** (exported). |
| `drage.test.ts`: closed shells, clearance between moving pieces | Helpers moved to `testgeometri.ts` and reused for drawn dragons. |
| Shell: history with merged drags, `lesInn`, autosave, files, 3MF/STL export with one body per part, export rules, the shared 3D view, the tool rail | **Reused** without changes to the shell. |
| Sign Forge | Pattern only (tools in the rail, handles, snap to grid). No Sign Forge code is imported or changed. |
| CityKit, BuildForge, Creature Forge, Form Forge | Not used and not changed. |

## The drawing (`tegning/modell.ts`)

Stored in `parametre.tegning` (schema 1, plain JSON) with `parametre.modus = 'tegning'`. Colours and pattern stay in the classic keys (`farger`, `monster`), so the colour zones are shared.

| Field | What |
|---|---|
| `rygg` | Spine points on the plate in mm (plate centre 0), nose first; 2–40 points. The spine is a centripetal Catmull-Rom curve through them. |
| `bredde`, `hoyde` | Full width and height along the spine as points `{t, verdi}` (t = 0 at the nose, 1 at the tail tip), smoothly interpolated. Width 6–80 mm, height 4–60 mm. |
| `antallDeler` | Number of pieces including head and tail tip, or `null` for automatic. |
| `hode`, `hale` | Head shape, horns, eyes; tail tip. Same catalogue as the classic dragon. |
| `elementer` | Spikes: `{id, type: 'pigg', t, form}`. A spike sits in the middle of the piece its position falls on; one per piece. |

Positions along the spine are fractions, so width, height and spikes follow when the spine is redrawn. `lesTegning` fills defaults, clamps every number, removes broken entries, makes ids unique and says what it repaired. It also runs on open (`lesInn`).

## From drawing to pieces (`tegning/geometri.ts`)

- The joint is sized for the spine length (`leddMal`, 100–240 mm). Its clearance is between 0.35 and 0.6 mm.
- The head takes about a fifth of the spine; the rest is shared by the other pieces, with the tail tip getting more because it carries the tip. Automatic count aims at about eleven pieces on a long spine and never goes below what the joint needs.
- Joints sit on the spine. Each piece is straight between its joints and built in its own frame from the classic recipe: socket at the rear, pin and arm into the piece in front, head details on the first, tail tip on the last.
- Where the spine bends, the gap between two pieces grows until their bodies clear each other by the joint clearance plus 0.15 mm (searched for each joint).
- The socket's slot turns to where the arm lies in the drawn pose, so the arm prints in the middle of it. From there the joint moves ±bevegelse (about 27° at 160 mm).
- A drawn width too narrow for the socket wall is widened, and the user is told.

**Checks**, shared by the 2D views, the 3D model and the export:

- red (export blocked): spine too short for head, one piece and tail; a bend so tight that a piece has no room for its joint; a joint bent more than 40° in the print; two pieces that touch on the plate (neighbours in a bend or pieces whose spine crosses); the joint's own invariants;
- warnings: outside the plate, taller than the printer, more colours than one print takes;
- notes: development geometry, the trial profile (not physically tested in a bent pose), widened pieces, extra spikes on one piece, a spike hidden by horns, fewer pieces than chosen.

## The editor

**Workspace** (`tegning/Lerret.tsx`). Three views at once: Ovenfra (large), Fra siden (below), 3D (right column). Medium widths put the side view and 3D side by side under the top view; small screens share the lower pane with tabs «Fra siden» / «3D».

- **Tools** in the workshop's tool rail: *Juster* (V), *Tegn rygg* (R), *Pigg* (P).
- *Juster*: drag spine points (cyan, the nose in purple), width handles (white squares on both sides) and spikes (diamonds). Drag a piece to move the whole dragon; tap a piece to select it. Double-click on the spine adds a point; double-click beside it adds a width point. Drag the empty plate to pan; the wheel zooms round the pointer; «Vis hele platen» shows the plate.
- *Tegn rygg*: one stroke from nose to tail tip becomes the new spine (simplified to at most 14 points). Strokes under 30 mm are refused, so a stray tap never erases the dragon.
- *Pigg*: tap a piece to put a spike in its middle, in the form chosen in the bar.
- *Fra siden*: the pieces' real silhouettes along the spine (nose to the right), joints as dashed lines, and the height curve with handles. Double-click on the curve adds a point.
- «Fest til 5 mm» snaps spine points and moves to a 5 mm grid (shared workshop setting; Alt skips it).
- Problems are drawn where they are: red dashed outline on pieces, red joints.
- Every handle is a button that can be reached with Tab: arrow keys move it 1 mm (Shift 5 mm), Delete removes it, Esc clears the selection. Handles have 28 px hit areas.

**Properties** (`tegning/Inspektor.tsx`): the selection (spine point X/Y; width or height and its place; a spike's form; a piece's width, height, gap and print angles, with «Legg til pigg» / «Fjern piggen»), the list of red findings (a finding about a piece selects it), pieces and joints (automatic or chosen count, spine length, size, clearance, movement, «Bytt nese og hale», «Tegn ny rygg»), head and tail, colours and pattern, and «Start med standarddragen».

**Older dragons.** A project without `modus: 'tegning'` opens in the part picker with its 3D view, bottom tray and wiggle, as before. Its inspector offers «Tegn dragen selv», which keeps the head, horns, eyes, tail and spikes and starts the standard drawing (one undo step).

**Export and order.** One STL per piece is offered (each piece is its own body in the 3MF). The note says it is a trial print. Export is blocked while a red finding stands; saving is not. The order summary lists spine length, pieces and joints, head, horns, tail, spikes, pattern and colours, and never a price.

## Tests

`tegning/tegning.test.ts`: the spine passes through its points; profile interpolation; the standard dragon has no red findings; every pin is exactly in the socket in front of it, also in bends; nose and tail tip land where the spine starts and ends; the gap grows in bends; the slot faces the arm; too sharp, too short and crossing spines give red findings; chosen piece counts are limited; narrow widths are widened; spikes land one per piece; closed shells; clearance between every moving neighbour (vertex to surface) in a straight and a bent pose; deterministic build; repair on read; the edit operations; the plug-in (new dragons are drawn, older dragons build as before, export rules, order). E2E: drawing, keyboard, undo, the three views on desktop and mobile, axe on the workspace and properties, the older dragon path and its switch to drawing.

## Not built yet

Drawing the outline of each piece freely (the width curve shapes it now), wings and legs, horns and other elements placed anywhere (horns follow the head choice), lifting the spine off the plate, posing the joints in 3D, the treatise's joint designer and other mechanism families, presets, and a physical test print. The drawn pose is checked digitally only: the joint is a trial profile that has not been printed bent. Nothing here is physically validated.

## Open questions for Sivert

- Should each piece's outline be drawn freely as well (as shapes in Sign Forge), or is the width along the spine enough? (Asked 2026-11-02.)
- Physical measurements and the printer for calibrating the joint in a bent print.
