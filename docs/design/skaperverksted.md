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
| Export / order | A review step opens on a preview of the build plate (the exported parts from above, to scale, in their colours, with the numbered filament slots) with the 3D model as a second tab, shows dimensions, parts, colours and printability warnings, then offers «Bestill» (adds to cart) and, subject to D-4, file export. 3MF files are placed on the plate as in the editor and carry a filament slot per colour for Bambu Studio / OrcaSlicer (`Metadata/model_settings.config`) |
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

### Text layers and outlines

Sivert, 2026-10-05. Text spread over many layers at different heights became hard to follow, so text has its own kind of layer, and the outlines around a text belong to it.

- **Text layer.** Text lives only in text layers, and text layers hold only text (vectors can join them, see [Decor](#decor-and-vectors)). A new text gets a text layer of its own (above the active layer) **unless a text layer is selected: then the text goes into that layer and is grouped with what is there** (Sivert, 2026-10-05). «+ Nytt lag → Tekstlag» makes an empty, separate text layer. Text layers can still be moved, hidden, locked and duplicated like other layers.
- **Grouping.** Several texts can be grouped in one text layer («Grupper tekst» with two or more texts selected); they then share its height, look and outlines, and the outlines follow all of them. Ungrouped texts are separate text layers and never affect each other's outlines. «Eget tekstlag» on a grouped text takes it out into a new text layer with a copy of the group's settings and outlines.
- **Dragging.** In the layers panel a text, or a whole text layer, can be dragged onto another text layer: it then joins that layer's group and gets its look, its outlines and its height. Dragging an object out of a group (the dashed zone «Slipp her for å ta det ut av gruppen») gives it a layer of its own: a text gets a text layer with a copy of the group's settings and outlines. The inspector's «Lag eller gruppe» list does the same without dragging (keyboard and touch). A layer emptied by this is removed, except the last one.
- **Outlines** («omriss»): a text layer has any number, listed inside out, each its own row in the layers panel. Choosing an outline row selects **only that outline**: the inspector shows its settings alone, with «Vis alle omrissene» to see them all. Each has a type, **fyll** (filled out to its width; closes holes such as the inside of «o» and the gaps between letters) or **omriss** (a ring that follows the edge), a width (at least **0.6 mm**), a gap from what is inside it, its own **height**, its own colour and corner style. Outlines never cover the text or each other; the text is always in the centre. Each outline is its own part in the model and the export.
- **Heights.** Text and outlines start at the text layer's Z. The text's height is the layer's height; changing it does not change the outlines. In the stack, the layer takes the height of its tallest part.
- **Text display.** The text **stands up** (default) or is **cut out** («Skåret ut»): no text part is printed, and the text is a hole through the outlines, so whatever is below shows through.
- **Influences** between layers work as before. A text layer acting on another layer acts with its text and its outlines together.
- The side profile applies to the text; outlines are straight. A layer's own Kontur stays for plain layers (and for text layers from older projects that already use it).
- Projects from before text layers open unchanged: layers that hold only text become text layers (their texts a group, no outlines). Text in a layer with shapes stays where it is, prints as before and is reported until the user moves it to a text layer.

### Start sign, colour profiles, new layers and holes

Sivert, 2026-10-05.

- **No base plate.** A new sign is one text layer with one filled outline, «Underlag», as its base (text 3 mm, base 2 mm). A plate is still possible as a layer of its own.
- **Colour profiles.** A sign has a colour profile (`parametre.farger`): the filaments the user has in the printer or can get. A new sign opens a **start window** to pick it: ready-made profiles (combinations from the catalogue, not confirmed stock) or the user's own, saved in this browser. A profile has **four colours by default**; colours can be added from the catalogue or removed. The colour pickers offer the profile first; picking a catalogue colour outside it adds it to the profile. «Endre fargeprofil» in the project inspector reopens the window; colours the new profile drops are swapped for the closest one in it. Projects from before profiles get the colours they already use.
- **New layers.** «+ Nytt lag» offers: **Rundt teksten** (a layer at the bottom shaped by every text layer and its outlines, 4 mm wider, through influences, so it follows the text), **SVG som ramme** (an SVG in a layer at the bottom, scaled to go round the sign), **SVG som pynt** (an SVG in a layer of its own above the active layer; also the tool rail's SVG button) and **Tomt lag**.
- **Hanging holes and eyes.** The hole tool's size is the inner diameter. Over the model (at least half the hole on it) it is a hole through every layer. Dragged off the model it becomes an **eye**: a ring (3 mm by default, at least 0.6 mm) round the hole, joined to the lowest layer, or to that layer's outermost outline when it is a text layer with outlines. An eye that does not touch the sign is reported. Holes need no layer of their own; when there is no plain layer they get one, «Hull og øyne», which takes no room in the stack.
- **CSV.** A field is «too long for the sign» only when the sign has a plate or frame (shapes in plain layers); text and outlines grow with the text.

### Decor and vectors

Sivert, 2026-10-05.

- **Gallery.** «Dekor» in the tool rail (and «+ Nytt lag → Dekor fra galleri») opens a gallery of 24 vector elements: star, heart, moon, sun, flower, fir, horse, unicorn, butterfly, cat, dog, fish, shark, rabbit, paw, rocket, crown, anchor, bolt, tractor, excavator, football, game controller and owl. They are icons from **Material Design Icons** (Pictogrammers, Apache License 2.0), taken from the open-source package, with the credit shown in the gallery. They are not drawn by Designporten. Sizes are 24 mm at a 24-unit grid; the shapes are copied into the project as ordinary vector paths.
- **Own vectors.** «Legg til egen vektor (SVG)» imports an SVG into the gallery. Own vectors are stored in this browser only (no accounts yet), can be removed and are never uploaded.
- **Holes.** A vector keeps its holes by default (the openings in a butterfly, the counters in a flower). In the inspector, «Hull i vektoren» can be set to **Fyll igjen** so only the silhouette remains. Overlapping paths use each path's own fill rule, so paths drawn as negative space cut as holes.
- **Placement.** Under «Legges» the user picks **I tekstlaget «X»** (default when a text layer exists: the vector is grouped with the text, so it shares the text layer's outlines, height and colour, and is placed beside the text group, 1.3 times the text height, between 10 and 40 mm) or **I eget lag** (a plain layer «Pynt» above the active layer; top right of the sign, a third of its height). A vector can be dragged between a text layer and a layer of its own at any time, or moved with the inspector's «Lag eller gruppe» list. A vector in a text layer joins the layer's union and is covered by its outlines like the letters; a «Kutter» vector cuts out of the text layer. Plain shapes (rectangles, ellipses) are not allowed in text layers.
- **Parts, masking and colours** (Sivert, 2026-10-05). An SVG with more than one part (a sheet of icons, a horse with a separate mane) opens the **part picker** instead of going straight onto the sign, from the tool rail's SVG button, «+ Nytt lag → SVG som pynt/ramme» and the gallery's «Legg til egen vektor». Every filled shape in the file is split into its separate pieces; a piece inside a hole of another (the disc in a flower, the pentagons in a ball) stays with the shape around it. Pieces are chosen by clicking, by dragging a frame (a piece is chosen when it lies wholly inside; Shift/Ctrl adds) or from the list under the drawing (checkbox and colour per part), which is the keyboard and touch way. **Masking:** «Behold bare de valgte», «Ta bort de valgte» and «Ta med alle igjen»; a part set to «Ikke med» is left out. **Colours:** each kept part gets a filament from the sign's colour profile; a file with several fills starts with the closest unused filament per fill, a file with one fill starts in the first colour. Where parts of different colours lie on top of each other the one painted later wins (an eye drawn over a head cuts the head), so each point is printed in one colour. Over 300 parts the file is split by shape only, and the picker says so.
- **Result.** «Legg på skiltet» puts the kept parts on the sign: one colour as an ordinary decoration (in the text layer or a layer of its own, as above); several colours as **one layer per colour on the same level** (see «Samme nivå» below), named «navn · farge», keeping their places relative to each other. A frame is one colour, so for a frame the picker only masks. «Lagre i galleriet» keeps the kept parts as the user's own vector under «Dine egne» **with their colours** (a vector with several colours is put on a sign in a layer per colour; in a text layer and in a CSV cell it becomes one colour). «Last ned SVG» writes the kept parts out as an SVG file in the chosen filament colours. Nothing is uploaded; own vectors stay in this browser.
- **Same level.** A layer can be set to «Samme nivå som laget under»: it starts at the same Z as the layer under it instead of on top of it (and the next layer stacks on the tallest of them). This is what lets coloured parts lie side by side as one flat picture; it works for any layers while «Stable lagene automatisk» is on. Picture layers are placed like other decorations (top right, a third of the sign's height, above the active layer), so a picture partly outside the sign hangs in the air until the user moves it or sets the layer's level; the existing check reports it.
- **Variable decor.** A vector can be a **batch field** («Batchfelt (dekor)» in the inspector), see Batch below.

### Layers panel

The Layers panel makes the physical construction understandable. For every layer the user sees:

- what it contains (object thumbnails and names);
- its **physical height** (thickness, mm) and **Z range** (from–to, mm);
- its order in the stack, top to bottom, matching physical order;
- its **colour/material role** (swatch and material name);
- visibility and lock toggles;
- which objects belong to it (expand to list; drag objects between layers).
- for a text layer: its texts and its outlines (inside out), each outline with its type, width, height, colour and visibility, and «+ Omriss».

The stack diagram (an exploded side view) was removed at Sivert's request on 2026-10-05; Z ranges stay in each row. Selecting a layer highlights it in 3D.

### Side profile and Bézier editing

A layer is not limited to a vertical extrusion. Its **side profile** describes how the edge rises from the layer's bottom (Z₀) to its top (Z₁) across a profile width.

- **Presets:** Rett (straight), Bue (rounded/convex), Konkav, Knekk, Trapp (stepped), S-kurve, Egendefinert.
- **Profile editor:** a 2D graph with the layer's inside/outside on the horizontal axis (profile width in mm) and height on the vertical axis (bottom Z to top Z in mm). Anchor points and Bézier handles can be dragged; values are also editable numerically. Symmetric profile toggle. Other layers can be shown as reference.
- **Profile reference:** the profile follows the selected object's outline, or the projection of the layer below («følger toppen av Lag N»), or another geometric reference.
- **This is geometry, not a visual effect.** The profile produces real sloped/curved walls in the mesh and in the export, and the 3D preview shows exactly what will print.
- Printability warnings when a profile creates overhangs beyond the material's limit.

### Batch (CSV)

- A **master sign** marks one or more text objects as **fields** (for example `navn`), and vectors as **decor fields** (for example `dekor`).
- Import a CSV; columns map to fields; the tool previews every row and flags rows whose text overflows the sign.
- Generates one sign per row as variants of the master design.
- **Decor variables.** A decor field takes the name of a gallery element or one of the user's own vectors in the cell («stjerne», «Enhjørning»; case and æ/ø/å insensitive). An empty cell, «-», «ingen» or «nei» hides the decor on that sign. An unknown name is a problem on that row («ukjent dekor …»), not a silent fallback. The decor keeps its size and position from the master sign.
- **Group spacing.** Two or more texts (or vectors) that sit side by side or stacked, where at least one is a field, keep the **same gap on every sign**: first and last name end up equally far apart whatever the names are (option «Hold avstanden mellom tekstene som hører sammen lik på alle skilt», on by default when such a group exists). The texts may be in one text layer or in several. The gap is measured on the master sign; side by side it is the visible gap between the printed letters, stacked it is the gap between the line boxes, so baselines keep a steady pitch whatever ascenders and descenders the names have. The order stays; the group keeps its centre and grows outwards from it. A decoration in the group that a row leaves out (empty cell or «ingen») takes no room, and the names keep their own gap.
- **Preview.** The CSV window shows the real **build plate** with the signs as they will lie in the 3MF files, from the same meshes as the export, numbered by CSV row, with the filament list. The plate packing uses each sign's footprint including outlines and eyes.
- **Entry from export.** The export dialog has a button «Eksporter via CSV» next to the downloads; it opens the same window.
- Organisation: group by colour combination, by printer/material requirements, alphabetically; distribute across build plates. A common real workflow uses about four colours.
- Output: one 3MF per plate or per variant, with a manifest.

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
