# Dragon Forge

Part of the [master specification](../../DESIGNPORTEN_MASTER.md).

**Status 2026-11-02: removed, to be rebuilt from scratch.** Sivert wrote «Slett hele dragonforge og begynn på igjen. Dette er for dårlig». All Dragon Forge code (`src/skaperverksted/generatorer/drage/`), its route `/skaperverksted/drage/`, its showroom preview and its tests are deleted. Neither the part picker nor the drawing editor is a basis for the new tool. The earlier code can be read in git history (merge commit of PR #58) if something is wanted back.

Why, in Sivert's words (2026-11-02): «Dragens kropp er av grunnformer. De er umulig å endre parametrisk. Detaljene er for dårlige og hengslene er ikke klar for å endres.» The new tool must therefore have a body whose shape can be changed parametrically (not assembled from base shapes), much better detail, and joints whose design can be changed.

Still apply:

- Sivert's treatise [dragon-forge-prosjektavhandling.md](dragon-forge-prosjektavhandling.md) is background. Its rules on trial profiles and physical validation still hold: no mechanism is called validated before a physical test.
- The direction for the new tool is decided with Sivert before anything is built. This file is rewritten when it is.

BuildForge's own dragon template (`buildforge/kroppsbibliotek.ts`) is part of BuildForge and is not affected.
