# Creature Forge — overlevering til Claude

Creature Forge er en webapp i Designportens skaperverksted der brukeren bygger artikulerte 3D-printbare figurer av grunnformer og legger til personlige trekk. Claude skal utvikle løsningen. Denne pakken inneholder krav og referanser, ikke ferdig kode.

## Les i denne rekkefølgen
1. `CLAUDE_START.md` — startprompt
2. `KRAVSPESIFIKASJON.md` — funksjoner og atferd
3. `UI_OG_IKONER.md` — design og ikonregler
4. `TESTKRITERIER.md` — hva som skal virke

## Viktig
Eksisterende Designporten-kodebase må undersøkes før arkitektur og integrasjon velges. Ingen implementasjon av faktisk 3D-geometri eller full ikonstilark er vedlagt. SVG-ene i `icons/svg` er en liten startpakke for funksjonsikoner, ikke de modellbaserte ikonene. 3D-miniatyrer skal genereres fra de reelle geometriene Claude lager.
