# Ikoner i Sign Forge: brukt, ikke brukt og manglende

Status 2026-10-08. Pakken har 92 ikoner (`icons-manifest.json`). Ikonene limes inn som de er fra `src/skaperverksted/shell/ikonsvg/`, ett register i `src/skaperverksted/shell/ikoner.tsx`. Ingen nye ikoner er tegnet av oss (D-3). Et ikon vises bare der funksjonen faktisk finnes.

## 1. Tatt i bruk (56 av 92)

De 53 som var i bruk fra før, pluss disse nye i denne runden:

| Ikon | Hvor |
| --- | --- |
| `layers`, `properties`, `transform`, `align`, `palette`, `history`, `plate-layout` | Panelnavn og faner (Lag, Egenskaper, Transform, Juster, Fargeprofil, Historikk, Produksjon) |
| `properties`, `undo`, `redo`, `open` | Topplinjen: Egenskaper, Angre, Gjør om, Fil |
| `new`, `open`, `save-as`, `save-template`, `templates`, `export` | Fil-menyen og «Eksporter / Bestill» |
| `edit-point`, `smooth`, `add-point`, `remove-point`, `delete` | Kurvepanelet |
| `export-three-mf`, `generate-stl` | Eksportvinduet |
| `import-csv`, `link-fields`, `properties`, `rows`, `generate`, `plates-sorted` | De seks CSV-stegene |

## 2. Ikoner i pakken som ikke er brukt, fordi funksjonen ikke finnes som knapp ennå

Å plassere dem uten funksjon ville vist en knapp som ikke gjør noe. De tas i bruk når funksjonen bygges.

| Ikon | Navn i pakken | Hva som mangler i Sign Forge |
| --- | --- | --- |
| `snap-object`, `snap-guide` | Snap til objekt / guide | Fangst har bare én felles bryter i dag |
| `ungroup` | Ungrupper | Tekstgrupper tas ut via en liste, ikke en knapp |
| `copy`, `paste`, `cut` | Kopier, Lim inn, Klipp ut | Utklippstavle finnes ikke (bare «Dupliser») |
| `distribute` | Fordel | Fordeling finnes som to knapper (vannrett og loddrett). Pakken har ett ikon, og vi vet ikke hvilken retning det viser. Vi trenger en loddrett variant, eller du sier at ett ikon duger |
| `zoom-in`, `zoom-out`, `fit`, `actual-size` | Zoom og tilpass | Zoom styres med hjul og tastatur, det er ingen knapper på lerretet |
| `cube` | 3D-visning | 2D/3D-bryteren er tekst («2D», «3D») |
| `eyedropper`, `gradient`, `stroke` | Fargeplukker, gradient, strek | Funksjonene finnes ikke |
| `taper`, `pressure` | Taper, trykkfølsomhet | Penselen har breddepunkter, men ikke disse to modifikatorene |
| `filaments`, `color-library`, `settings`, `color-groups` | Filamentfarger, fargebibliotek, rediger profil, fargegrupper | Kan settes på knapper i Fargepanelet (kandidat til neste runde) |
| `save`, `share-template`, `favorites`, `premium`, `license` | Lagre, del mal, mine maler, premium, lisens | Maler er private i nettleseren; ingen deling, premium eller lisensvalg |
| `three-mf`, `print-preview` | 3MF, forhåndsvis plater | Eksporten bruker `export-three-mf`; plateforhåndsvisning har eget vindu uten ikon |
| `filter`, `columns`, `rules`, `preview`, `adjustments` | CSV: filter, kolonner, regler, forhåndsvisning, innstillinger | CSV-trinnene har ikke disse knappene som egne handlinger |
| `printer-profile`, `send-printer`, `print-queue` | Printerprofil, send til printer, utskriftskø | Ingen printerkobling |

## 3. Funksjoner som finnes, men mangler ikon i pakken

Disse bruker midlertidige linjeikoner (enkle, funksjonelle) eller bare tekst. Her trenger vi ikoner fra deg:

| Funksjon | I dag | Forslag til ikon |
| --- | --- | --- |
| Rektangel, ellipse, polygon, trekant | Midlertidige linjeikoner i formverktøyet | Fire formikoner |
| Hull / nøkkelring-øye | Midlertidig sirkel i sirkel | Hull og øye (to ikoner) |
| Dekorgalleri | Midlertidig stjerne | Dekor / galleri |
| Omriss («+ Omriss») | Bare tekst | Omriss rundt tekst |
| Nytt lag | Bare tekst | Nytt lag |
| Flytt lag opp / ned | `bring-forward` og `send-backward` står på valgene i lagmenyen, men ikke på knappene «Flytt opp» og «Flytt ned» | Ingen nye, kan gjenbrukes |
| Lukk bane, Fullfør åpen bane, Reparer | Bare tekst | Lukk bane, reparer |
| Lagre i galleriet («Dine egne») | Bare tekst | Lagre dekor |
| Panelknapper: meny, minimer, gjenopprett, lukk, dokk venstre/høyre, flytende | Midlertidige linjeikoner | Ett sett til panelrammen |
| Hjelp og hurtigtaster («?») | Tegnet «?» | Hjelp |
| Farge på objektet / «Følg laget» | Fargerute og tekst | Koble til laget |

## 4. Vektorillustrasjoner

Ingen vektorillustrasjoner er i bruk i Sign Forge. Hvis du vil ha dem, trengs:

- Tomtilstander (ingen lag, ingen objekter, ingen CSV-rader).
- Startsiden: Tomt, Fra mal, Fra CSV.
- Horisonten i arbeidsområdet er en ren fargegradient (ingen illustrasjon). Hvis du vil ha en silhuett langs horisonten, må den leveres av deg.

## 5. Hvordan et ikon byttes

Legg SVG-filen i `src/skaperverksted/shell/ikonsvg/` med samme filnavn som id-en, eller kall `byttIkoner({ id: '<svg-innhold>' })`. Knappene beholder sine egne tilgjengelige navn.


## Oppdatering 2026-10-08, runde 2

De 24 ikonene fra «sign-forge-icons-round-2» er tatt i bruk (116 ikonfiler i alt). Det som sto under punkt 3 som manglende er nå dekket, bortsett fra:

- Arbeidsrom-knappen («Paneler») bruker fortsatt et midlertidig linjeikon.
- «Fordel» i justeringspanelet og i egenskaper bruker nå `distribute-horizontal` og `distribute-vertical`.
- Ikonene i seksjon 2 (zoom, kopier/lim inn osv.) venter fortsatt på at funksjonene finnes som knapper.
- Rotasjon i Transform-panelet bruker tegnet «↻» (ingen SVG tegnet): et rotasjonsikon mangler i pakken. Lås-ikonet for «Behold proporsjoner» bruker `lock`/`unlock`.
- Drahåndtaket i lagpanelet er tegnet med CSS-prikker (ingen SVG): et eget håndtak-ikon med riller mangler i pakken.

## Midlertidige (fase 4, 2026-10-08)

Funksjonsglyfer tegnet i kode til de ferdige ikonene kommer (D-3: bare funksjonelle glyfer). Bytt ved å legge SVG-filer med samme id i `shell/ikonsvg/`.

| id | Brukes til |
| --- | --- |
| `tekst-venstre`, `tekst-midt`, `tekst-hoyre` | Tekstjustering i egenskapene (venstre, midt, høyre) |
| `juster-venstre`, `juster-midt-x`, `juster-hoyre`, `juster-topp`, `juster-midt-y`, `juster-bunn` | Justering i kontekstlinjen (venstre, midt vannrett, høyre, topp, midt loddrett, bunn) |

- Fase 5: «Legg i handlekurven» bruker `store` (butikk) fordi pakken ikke har et handlekurvikon. Tidslinjen velger ikon etter navnet på steget (`ikonForTrinn`); steg uten treff får `edit-point`.
