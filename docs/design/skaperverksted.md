# Skaperverksted

Part of the [master specification](../../DESIGNPORTEN_MASTER.md). Covers the workspace, the canvas and grid, the shared editor model, Signgen, the lamp generator, the articulated dragon generator and the future ecosystem. Domain types are in [technical-architecture.md](../architecture/technical-architecture.md#domain-model).

Skaperverksted is one of the most important parts of Designporten. Moving into it is moving **from the showroom into the workshop**. It must feel like a genuine creative application in the browser, borrowing the interaction language of CAD, graphics and 3D tools without copying any one of them, while staying understandable to people who have never used such tools.

It is **not** "a form on the left and a preview on the right".

## Workspace

### Layout (desktop, ≥1024 px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Workshop bar: logo · generator · project name · undo/redo · save ·   │
│               2D/3D · Eksporter / Bestill                            │
├────┬───────────────────────────────────────────────────────┬─────────┤
│Tool│                                                       │Inspector│
│rail│                CANVAS (the object is the focus)       │(context)│
│    │   floating toolbar near selection                     │         │
│    │                                                       │         │
│    │ ┌Layers (floating, collapsible)┐        view cube (3D)│         │
├────┴───────────────────────────────────────────────────────┴─────────┤
│ Status bar: object size W × H × D mm · layer count · zoom · est. weight │
└──────────────────────────────────────────────────────────────────────┘
```

- **Tool rail** (left, narrow, icons + labels on hover/focus): select, text, SVG/image, shapes, profile (Bézier), zoom, pan, measure. Generator-specific tools are added by the generator.
- **Canvas** fills all remaining space. The designed object is the visual focus; chrome is quiet.
- **Floating contextual toolbar** appears near the selected object with the most common actions (duplicate, delete, align, arrange, lock).
- **Layers panel** floats over the canvas's left edge and can collapse. It is the physical construction list.
- **Inspector** (right) shows properties of the current selection: position, size, rotation, layer, height, colour/material, profile. With nothing selected it shows the project: build size, plate, material set.
- **Status bar** shows real dimensions and useful facts. Estimated weight/material only once the estimate is computed from geometry, never guessed.
- **Workshop bar** replaces the site header. «Eksporter / Bestill» is the single primary action. There is always a clear way back to the showroom.

### Visual language

- Graphite workshop palette (`--verksted`, `--grafitt`), Archivo for UI text, IBM Plex Mono for all values and units.
- Lilla = selection and active state. Cyan = measurement, guides, snapping indicators and the active tool on dark. The user's material colours are the only saturated colour on the object.
- Panels: 4 px radius, 1 px hairlines, no glass, no shadows beyond a subtle lift for floating panels.
- Dense but calm: 12–13 px mono values, 14 px labels, 32 px control height (44 px on touch).

### Tablet and mobile

- Canvas gets the maximum space. Panels become **bottom sheets** (Layers, Inspector, Library) opened from a compact bottom toolbar. Only one sheet is open at a time; it snaps to peek / half / full.
- Touch gestures: one finger selects and moves, two fingers pan and pinch-zoom, two-finger rotate on a selected object rotates it (snapping to 15°), long press opens the context menu.
- Numeric inputs remain available in the Inspector sheet for precision.
- Nothing essential is removed on mobile. If a function genuinely needs a larger screen (for example batch plate layout), the tool says so plainly and offers to continue on a larger screen; it never silently breaks.

## Canvas and adaptive measurement grid

- **No photographic background.** A neutral graphite (or a light technical variant for 2D printing previews) with the grid.
- **Real units.** The canvas knows millimetres. 100 % zoom renders 1 mm as one CSS millimetre (≈3.78 CSS px), so a sign at 100 % is roughly its real size on a typical screen; the status bar shows the current zoom.
- **Adaptive grid:** major and minor lines chosen from the sequence 1 · 2 · 5 · 10 · 20 · 50 · 100 · 200 mm so that minor lines stay ≥ 8 screen px apart. Zoomed out the user sees centimetres (10 mm major, labelled in cm); zooming in reveals millimetre subdivisions, then 0.5/0.1 mm. Minor lines fade in with zoom rather than popping.
- **Rulers** along the top and left edges in mm, with the selection's extent highlighted on the rulers.
- **Build plate / bounds:** the printable area (from the printer profile) is drawn as a subtle outline; objects outside it are flagged.
- **Selection:** clear bounding box with handles; the active object is unmistakable; other objects stay fully visible but quieter when needed.
- **Snapping:** to grid, to other objects' edges and centres, to the plate centre, and to 15° rotation steps. Snap guides appear in cyan with the distance in mm. Holding Alt (or a toggle on touch) disables snapping temporarily. Snapping on/off is a visible toggle.
- **Measurement:** dimensions appear while dragging and resizing; a measure tool shows distances between points or objects.
- **Pan and zoom:** wheel/trackpad zoom to cursor, Space-drag or middle-drag to pan, `0` fit to object, `1` to 100 %, `+`/`−`.
- **Clutter control:** labels and guides appear only while relevant.

## Shared editor behaviour

| Behaviour | Rule |
|---|---|
| Undo / redo | Every model change is a command in the history; Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z; drags merge into one step |
| Selection | Click, Shift-click to add, drag-marquee, Ctrl/Cmd+A; Esc clears |
| Transform | Move (drag, arrows 1 mm, Shift+arrows 10 mm), scale (proportional by default, lock toggle), rotate |
| Duplicate / delete | Ctrl/Cmd+D, Delete/Backspace |
| Visibility / lock | Per object and per layer |
| Units | All values in mm with one decimal by default; inputs accept simple arithmetic («40+2.5») |
| 2D / 3D | One model, two views. 2D for layout and precision, 3D for form, height and colour. The view switch never loses selection. |
| Autosave | Local autosave of the current project (browser storage) so a reload never loses work. Server-side project saving comes with accounts. |
| Export / order | A review step shows the 3D model, dimensions, layers, colours and printability warnings, then offers «Bestill» (adds to cart) and, subject to D-4, file export |
| Keyboard | All tools and panels reachable; shortcuts listed in a help overlay (`?`); canvas objects selectable via the Layers panel for keyboard and screen-reader users |

## Signgen — 3D-printed sign generator

**Name:** Signgen. Norwegian descriptor: «skiltgenerator». Signgen makes **3D-printed signs and nameplates**. It does not make wooden signs; a wood-look filament is only a material option.

### Model

> SVG + TEXT + SHAPES → LAYERS → HEIGHTS → PROFILES → COLOURS → 3D MODEL

The user constructs the physical sign **layer by layer**. A layer is a physical slab of printed material with a height and a colour/material role; it contains one or more 2D objects whose union forms the layer's outline.

### Capabilities

MVP (Phase 3) and later (Phase 5) are marked. The architecture supports all of them from the start.

| Capability | Phase |
|---|---|
| Multiple layers, each with one or more objects | 3 |
| Text objects with font selection (curated Open Font License fonts, loaded on demand) | 3 |
| SVG import (paths, basic shapes; text in SVG converted or rejected with a message) | 3 |
| Basic shapes (rectangle, rounded rectangle, ellipse, plate outlines, hanging hole) | 3 |
| Per-layer height (thickness) and Z position | 3 |
| X/Y position, scale, rotation per object | 3 |
| Colour/material per layer | 3 |
| Visibility, deletion, duplication | 3 |
| Snapping, dimensions in mm | 3 |
| 2D editing and 3D preview | 3 |
| Straight (vertical) extrusion | 3 |
| Export 3MF (one object per colour/layer) and STL | 3 |
| Multi-selection and alignment | 5 |
| Outline / offset («Kontur»): outward, inward, double, custom distance; corner type round/sharp/chamfer | 5 |
| Layer influence: an outline adds to or cuts from layers below with a gap | 5 |
| Side profiles: presets, then Bézier | 5 |
| Library of SVGs, fonts, colour profiles, presets | 5 |
| Project saving (account) | 5 |
| CSV batch generation, variant groups, plate organisation | 5 (limits per plan are a config switch, off until the paid model is decided) |

### Layers panel

The Layers panel makes the physical construction understandable. For every layer the user sees:

- what it contains (object thumbnails and names);
- its **physical height** (thickness, mm) and **Z range** (from–to, mm);
- its order in the stack, top to bottom, matching physical order;
- its **colour/material role** (swatch and material name);
- visibility and lock toggles;
- which objects belong to it (expand to list; drag objects between layers).

A small **stack diagram** next to the list (an exploded side view, as in concept 05) shows the layers as physical slabs with Z values, so the relation between digital layer and printed layer is obvious. Hovering a layer highlights it on the canvas and in 3D.

### Side profile and Bézier editing

A layer is not limited to a vertical extrusion. Its **side profile** describes how the edge rises from the layer's bottom (Z₀) to its top (Z₁) across a profile width.

- **Presets:** Rett (straight), Bue (rounded/convex), Konkav, Knekk, Trapp (stepped), S-kurve, Egendefinert.
- **Profile editor:** a 2D graph with the layer's inside/outside on the horizontal axis (profile width in mm) and height on the vertical axis (bottom Z to top Z in mm). Anchor points and Bézier handles can be dragged; values are also editable numerically. Symmetric profile toggle. Other layers can be shown as reference.
- **Profile reference:** the profile follows the selected object's outline, or the projection of the layer below («følger toppen av Lag N»), or another geometric reference.
- **This is geometry, not a visual effect.** The profile produces real sloped/curved walls in the mesh and in the export, and the 3D preview shows exactly what will print.
- Printability warnings when a profile creates overhangs beyond the material's limit.

### Batch (CSV)

- A **master sign** marks one or more text objects as **fields** (for example `navn`).
- Import a CSV; columns map to fields; the tool previews every row and flags rows whose text overflows the sign.
- Generates one sign per row as variants of the master design.
- Organisation: group by colour combination, by printer/material requirements, alphabetically; distribute across build plates. A common real workflow uses about four colours.
- Output: one 3MF per plate or per variant, with a manifest.
- **Not shown in the UI until it actually works.**

### Free and paid direction

Architecture must allow limits per plan without faking a subscription. A possible free tier: one SVG, one text object, max three layers, non-commercial, Designporten attribution/watermark. Paid capabilities could include project saving, CSV, batch and commercial workflows. **No prices are invented and no subscription behaviour is built** until Sivert decides the model. The capability limits are a single configuration object read by the editor, so switching them on later is a change of data, not of architecture.

## Lamp generator

The user should feel that they are **designing a lamp**, not filling in a configurator.

- **Parameters:** overall height, top and bottom diameter, profile curve (the silhouette, edited directly), wall pattern (ribs, twist, waves, facets, perforation) with density and depth, twist angle, wall thickness, light source (hardware profile, below), material and colour, surface finish.
- **Hardware profiles (Sivert, 2026-09-29):** the light source is a data-driven profile (`generatorer/lampe/maskinvare.ts`): Bambu Lab LED Lamp Kit 001, E27 holder, E14 holder, a user-defined round module, or no light source (open or closed bottom). Every dimension carries its provenance (`produsentoppgitt`, `uklar`, `vanlig-mal`, `designstandard`, `ukjent`, `fysisk-verifisert`) and its sources, and the editor shows it next to the number. Unconfirmed numbers are never shown as facts; a verified value is a data change.
- **Geometry follows the hardware.** A module sits in a recess in a solid base: recess (module + tolerance), optional retaining lip, floor, cable hole and an open cable channel under the lamp out through the back. Holders get a bottom plate with an adjustable hole. The module is drawn in the 3D preview as a plain cylinder at its real size (preview only, never exported).
- **Fitting mode for Lamp Kit 001:** shows «Bambu Lab Lamp Kit 001», its dimensions with their certainty and «Ikke fysisk verifisert» until a test print has proven the fit. Basic controls: fastening (tape or lip), recess depth, fit-test piece, show module. «Avansert passform»: tolerance, lip, cable hole, channel size, floor, measured module size. The **fit-test piece** exports only the recess, lip and cable route in a thin ring, so the fit can be checked before printing the lamp.
- **Hardware-aware checks** (geometric only): module does not fit the base, too little material around it, recess clamped by the lamp height, cable hole leaves no ledge, floor too thin, channel smaller than a known cable, lip below the module top or too wide, shade wall hits a module that stands up, module cannot pass down through the lamp, holder hole larger than the bottom, thin holder plate. The editor states that these checks say nothing about electrical safety and that a printed lamp is not certified or approved because a supported kit is selected.
- **Direct manipulation:** drag the top edge to change height, drag a silhouette point to change the profile, drag around the lamp to twist the pattern. Numeric fields stay available for precision.
- **Light behaviour:** a light on/off toggle in the preview shows how the pattern and wall thickness let light through (translucency approximated in WebGL); a day/night background switch.
- **Printability:** vase-mode compatibility, overhang limits and minimum wall thickness are enforced or warned about with plain explanations.
- Shares the workspace shell, history, units, export and order flow.

## Articulated dragon generator

Allowed to have more personality than the other tools while clearly being Designporten.

- **Parts:** body, head, horns, spikes, tail, wings, pattern, size, colours, details. Each part has a small set of pre-modelled variants designed to connect at fixed articulation joints, so every combination prints and moves.
- **Choice UI:** visual pickers (thumbnails of each variant) in a bottom tray; the dragon stays visible in 3D at all times and **changes live** as parts are swapped. Colours per part or per zone.
- **Size:** set in mm (overall length) with the joint tolerances scaled correctly; limits enforced.
- **Personality:** the dragon can wiggle or react when a part is swapped (off under reduced motion).
- Must stay consistent with the mascot direction: cute, slightly spiky, purple/dark blue/beige.
- Model parts are prepared by Designporten (not procedurally generated), so the generator needs the part library as an asset; see open question in the decision log.

## BuildForge

A shared build engine where **the user forms the expression and the engine protects the mechanics** (Sivert, 2026-10-03). Sivert's first brief is kept as [buildforge-handoff.md](buildforge-handoff.md); his **newer direction** of 2026-10-04, which makes BuildForge a general modular build engine, is [buildforge-handoff-2026-10-04.md](buildforge-handoff-2026-10-04.md). Where they differ, the newer one wins. This section records what is decided and built. Two product families:

- **Clicker:** a printed base with a seat for a bought mechanical keyboard switch, and a printed top on the switch's stem.
- **Modular build** (handoff 2026-10-04): a model is a graph of body parts joined at connectors, with one **Main Body**. Dragons, snakes, heroes, people and creatures are all built the same way from one library; there is no fixed figure structure. The 0.2 figure family (six fixed segments) is converted to this on read.

- **Status:** digital prototype. The mechanism profiles are trial profiles (`mx-lignende-prove` 0.1.0 for the switch, `figurledd-prove` 0.1.0 for peg joints, `kuleledd-prove` 0.1.0 for ball joints). Every number carries its certainty (common published value, trial value, design choice) and the editor and report show it. Profiles are marked «Ikke testet» until a test print has proven them; nothing is called printable, safe or production-ready, and «Bestill» is not offered.
- **Project:** `Dokument.parametre` holds the family (missing = clicker, so 0.1 projects still open), the decorative shapes, the template, the profile id + version and, for modular models, the parts (`kropper`: library component, name, kind, colour, mirrored, placement, connectors), the connections (`forbindelser`: two connector ends, a turn angle at the joint and, for ball joints, a bend and its direction), the Main Body (`rot`) and, once the model has a ball joint, the ball joint profile id + version (`kuleprofil`). Shapes are stored in their part's own frame. The mechanics are never stored in the project, so a hand-edited file cannot change them; stored data is validated at runtime (invalid numbers, duplicate ids, unknown parts or connectors, male-to-male connections, a connector used twice, loops and unknown profile versions are rejected, not repaired). A 0.2 figure becomes ten parts and nine connections with its shapes unchanged; nothing is rewritten until the user edits.
- **Geometry (hybrid):** decoration is signed distance fields (sphere, rounded box, cylinder, cone; union, sharp add, subtract and smooth union with a blend radius in mm), meshed by marching tetrahedra into closed meshes. The locked mechanics (switch seat, cross socket, top plate, joint pegs and sockets) are exact meshes from the profile, never voxelised. Decoration is cut back from protected zones and from below the build plate. Each part is exported as one part made of overlapping closed shells.
- **Checks:** for clickers, collision through the whole travel (the swept volume of the moving top against everything fixed, with the clearance from the profile and a stated error bound), anchoring, cut-back notices, subtractions reaching the locked part, and trial limits for the top. For modular models: every part is one piece holding its joint parts, no part is empty, no two parts overlap as placed, subtractions do not reach a joint, and parts not connected to the Main Body are a yellow notice (they print, but loose). Each finding has a rule id, the shapes it concerns, cause, consequence, fix and evidence level. Status is green / yellow / red, and grey («Beregner») whenever the shown result belongs to an older revision. Digital status and physical profile status are shown separately.
- **Connectors and joints:** a connector has a family (`svivel` = peg joint, `kule` = ball joint), a gender (male = peg or ball, female = hole or socket) and a role (neck, shoulder, hip, wrist, ankle, tail, wing, generic). Only same family and opposite gender connect, and a connector takes one connection. A part straight from the library fits any family and takes the family of the connector it meets; changing the joint type of a connection changes both connectors together. A peg joint turns about one axis; a ball joint also bends up to the profile's largest bend (25°) about the ball's centre. Turn and bend are stored on the connection.
- **Ball joint (trial):** an 8 mm ball on a 3.6 mm neck (male) snaps into a spherical socket (female) through a 7 mm mouth, with 0.2 mm radial clearance and a 1.6 mm wall. The mouth is a cone with its tip in the ball's centre, so the neck meets the rim at the same bend all the way out; the profile check requires the drawn bend plus 5° margin to stay below that limit. The ball's centre sits far enough from the joint face that the socket rim clears the male part at full bend. The female part is cut back along a cone (slope tan of the largest bend + 5°) instead of a plane; rotating it about the ball's centre by up to that bend then keeps it clear of the male part's plane cut, so the male side needs only the plane. The cavity and the space the neck swings through are kept free of the female part's decoration. A stored bend above the profile's limit is a red finding (BF-KULE-01). Nothing is test-printed: whether the ball snaps in, holds or breaks the neck is unknown. Pegs and sockets are only made where two parts are connected; open connectors print nothing. Around each joint the decoration of both parts is kept out of the partner's swing cylinder, so the parts stay clear as the joint turns. Clearance is checked between the two parts a joint connects; whether other parts hit each other while turning is not checked.
- **Placement:** the Main Body and each loose group keep their own position; every other part is placed from its parent by the connection (connector meets connector, axes opposed, turned about the joint axis). Each group stands on the plate. A part from the library with a side (arms, legs, wings) is mirrored automatically when it goes on the other side of its parent, so a right arm is the mirror image of a left one.
- **Editor layout (modular, handoff §2, §39–41, §50–52):** canvas first. There is no tool rail, and on wide screens the properties panel is closed by default; it floats over the right side of the canvas when asked for (the «Egenskaper» button in the top bar, or «Egenskaper» in the radial menu). Small screens keep the «Deler» / «Egenskaper» sheets. The check is a compact status on the canvas («✓ Modell OK», «⚠ 2 problemer», «● Kan ikke eksporteres», «Kontrollerer …») that opens the findings and always says the model is not physically tested; the bottom tray is only used by clickers. Colours: purple = selected, green = valid attach, replace or connected, red = invalid or a fault, grey or faded = outside what you are working on.
- **Editor (modular):** a new document opens **«La oss bygge en …»** as a carousel over the canvas (not a dialog), with Drage, Slange, Helt, Menneske, Skapning and Blank, each shown with a preview drawn from its own shapes; each start gives exactly one part, the Main Body. The clicker templates follow at the end of the carousel. The left panel has two tabs: **Bibliotek** (body-part cards with previews drawn from each part's base shapes, category chips and a search field) and **Modell** (the model tree: ★ Main Body with what hangs on it, then loose parts). Drag a part from the library into the view: fitting free connectors show, the nearest within reach is chosen and the part snaps to it with a preview; right-click or C during the drag switches to the part's next fitting connector («Kobling 2 av 3»); held over a part of the **same kind** it replaces that part; over another kind of part it snaps to that part's nearest fitting connector, or replaces it when nothing fits; over the empty plate it goes loose. Without dragging (keyboard, touch): choose the part, then a connector from the list or on the model, «Legg løst på platen» or «Bytt ut». Dragging a part on the plate moves its group and can snap a loose group to a connector. **Replace** keeps every connection the new part has a fitting connector for (same role first, then nearest), leaves the rest loose where they were, keeps the user's own shapes on the part and swaps only the base shapes. Click selects a part, **Shift+click** adds parts to the selection. The part panel has name, colour, connectors and Rediger / Bytt ut / Speil / Koble fra / Dupliser / Slett (the Main Body can be replaced, not deleted); its **Ledd** panel switches the joint to the parent between Pluggledd and Kuleledd and has sliders for turn and, for a ball joint, bend and bend direction. **Right-click** (a long press on touch, the menu key or Shift+F10 from the keyboard) opens a **radial menu** for what is under the pointer: a part (Rediger, Bytt ut, Speil, Dupliser, joint type, Koble fra, Egenskaper, Slett), several selected parts (Speil alle, Fjern valget, Slett), the empty plate (Legg til del, Vis modelltreet, Tilpass visning, Egenskaper, Start på nytt), and inside a part a shape (Flytt, Roter, Skaler, Dupliser, mirror, Egenskaper, Slett), a connector (hann/hunn, joint type, Koble fra, Egenskaper, Slett) or the empty view (Gå ut, Legg til form, Ny kobling, Skjul/Vis resten, Tilpass visning). Arrow keys go round the ring, Esc closes it. «Save Part» waits for accounts (§65) and is not shown. **Double-click** (double tap on touch, or Enter) goes inside a part: the view frames the part, the rest fades (or hides with «Skjul resten»), a breadcrumb shows where you are, and Esc goes back out. Inside, the left panel has **Former** (shapes and details attach to that part's surface) and **Koblinger** (the connector editor): the part's connectors show on it as points (filled = male, ring = female, green = connected); a connector can be added by clicking on the part's surface (it points straight out of it), renamed, switched between male and female (a connection on it is broken first, after «Dette vil bryte forbindelsen til …»; the other part is never changed), switched between joint types, disconnected or deleted. A part can have up to 12 connectors. Touch: hold a library card, then drag it into the view. Each action is one undo step. Handles move and turn a selected part with its group (G / R) or move, turn and resize a selected shape (G / R / S); arrow keys and fields remain the non-dragging alternative.
- **Editor (clicker):** as before: library (Kule, Avrundet boks, Sylinder, Kjegle; Øyne, Horn, Pigger, Ører), attachment points on the current surface, Enkel and Avansert on the same project, «Prøv klikk» (reduced motion shows the end position), one mirror relation across the YZ plane, handles, colour per body.
- **Export:** blocked while the check is red (the project can still be saved). Otherwise 3MF, one STL per part, and a JSON control report with the project revision, the exact profile and its status, units, each part's checksum and every finding. The switch is never in the files. Modular models carry a notice that the joints are not physically tested and the model is not tested as a toy.
- **Builds** run in a web worker; while one runs, newer requests replace older ones and stale results are dropped.
- **Not built yet** (handoff 2026-10-04 §65–67, later phases): Body Chains, Sub-part Groups and hierarchy inside a part, moving a connector by dragging it (it is placed by clicking on the surface), separate print orientation per part, «Save Part» / «Mine» and other accounts, cloud storage, sharing and licensing, snap fits, print-in-place joints, magnets and screws. Whether parts other than the two a joint connects hit each other while it turns or bends is not checked. Clothes, import, permanent or snap-in joints, poses, modular letters, stacked clickers and production hand-off from the first brief are also not built and not shown.

## Ecosystem

Skaperverksted is an ecosystem, not a page. Future generators could include vases, pots, egg cups, cans/containers, trays, articulated snakes and other configurable products.

**A generator is a plug-in** that provides:

1. its **parameter schema** or object types;
2. its **geometry builder** (parameters/objects → mesh), pure and testable;
3. its **tools and inspector sections** (UI contributions to the shared shell);
4. its **presets and thumbnails**;
5. its **product mapping** (how a design becomes an orderable item: product id, price rule input, material set).

Everything else (shell, canvas, grid, units, selection, history, 2D/3D views, material catalogue, printer profiles, export, order hand-off, autosave, accessibility) is shared. Adding a generator must not require redesigning Skaperverksted. None of the future generators are built now.
