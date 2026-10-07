# Signgen – komplett ikonstilark

[Åpne stilarket](icon-style-sheet.html) · [Hele arket som SVG](icon-style-sheet.svg) · [PNG-forhåndsvisning](icon-style-sheet.png) · [Alle 92 ikoner som ZIP](signgen-icons.zip)

## Omfang og disposisjon

Alle 92 ikonposisjonene fra brukerens referansebilde er tegnet som vektorer. Arket beholder referansens 1536 × 1024-format, tolv grupper, seks rader, panelbredder, etiketter og rekkefølge:

| Venstre gruppe | Antall | Høyre gruppe | Antall |
| --- | ---: | --- | ---: |
| Tegneverktøy | 9 | Snapping og hjelp | 5 |
| Lag og organisering | 10 | Boolean (ved markering) | 4 |
| Redigering og historikk | 10 | Visning | 5 |
| Fyll og farger | 9 | Modifikatorer (Paint/Penn) | 7 |
| Fil og prosjekt | 10 | Maler og bibliotek | 7 |
| CSV / Batch | 9 | Produksjon og eksport | 7 |

[Manifestet](icons-manifest.json) kobler alle etiketter til individuelle SVG-filer i icons/. Tidligere supplerende ikoner er beholdt i mappen, men inngår ikke i dette arket eller ZIP-pakken.

Dette er et komplett designbibliotek, ikke en oversikt over ferdig implementerte verktøy. Ingen ikoner er integrert i editoren i denne leveransen. Eksisterende prosjektstatus og funksjonsgrenser gjelder fortsatt.

## Vektorregler

- Individuelle ikoner: `viewBox="0 0 24 24"`, transparent bakgrunn og én arvet farge via `currentColor`.
- Normal strek: 1,65 enheter, avrundede ender og sammenføyninger. Enkelte silhuetter har fyll eller varierende opasitet i samme farge.
- Ingen rasterutklipp, eksterne ressurser, skript eller innebygde bakgrunnsflater i ikonfilene.
- Oversiktsarket setter fargeaksenter utenfra og tegner paneler separat. Referansens flerfargede motiver er forenklet til monokrome silhuetter i tråd med vektorkravet.
- Inline SVG arver CSS-fargen. SVG lastet via et vanlig img-element arver ikke sidens currentColor.
- Anbefalt visningsstørrelse i editoren er 24 px. Behold tekst eller et konkret tilgjengelig navn på knappen, minst 44 × 44 px treffområde og synlig tastaturfokus.
- Bruk `aria-hidden="true"` og `focusable="false"` på dekorative inline-ikoner, og `aria-pressed` på faktiske modusknapper. Farge alene skal ikke angi tilstand.

## Vedlikehold og kontroll

[build-icon-sheet.mjs](build-icon-sheet.mjs) er kilden for SVG-geometri, etiketter, gruppering, HTML og manifest. Kjør `node docs/design/build-icon-sheet.mjs` fra repoet for å regenerere disse filene. PNG og ZIP oppdateres separat etterpå.

Verifisert 2026-10-07: 92 unike manifestoppføringer i 12 grupper, gyldig XML, korrekt viewBox og currentColor for alle filer, og filkoblinger. Arket er rendret i Chromium/Edge ved 1536 × 1024 og visuelt inspisert. Lange etiketter i modifikatorpanelet er justert for å unngå overlapp. PNG er en forhåndsvisning; SVG er originalformatet. Ingen appkode er endret, og appens build/funksjonstester er ikke kjørt for denne designleveransen.
