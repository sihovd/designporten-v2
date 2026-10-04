# BuildForge – komplett konsept- og UX-handoff til Claude

**Prosjekt:** Designporten / Skaperverksted  
**Verktøy:** BuildForge  
**Dato:** 4. oktober 2026  
**Status:** Revidert hovedretning  
**Mottaker:** Claude / videre utvikling i `designporten-v2`  

---

## 0. Viktig før videre utvikling

Dette dokumentet beskriver den nye retningen for BuildForge etter en lengre UX- og produktgjennomgang.

Det viktigste er at BuildForge **ikke lenger skal forstås primært som en fast figur-editor med forhåndsdefinerte deler**. Den skal utvikles til en generell, modulær byggemotor for 3D-printbare objekter.

Den viktigste setningen er:

> **Brukeren bygger objektet av Body Parts. Brukeren former hver Body Part med Sub-parts. BuildForge håndterer connectors, mekanikk og printrelaterte begrensninger.**

BuildForge skal oppleves som et kreativt, fysisk byggesystem – ikke som tradisjonell CAD.

Referanser for interaksjonsfilosofi:

- **Tinkerplay:** ferdige kroppsdeler som kan dras inn og kobles sammen.
- **Womp:** enkel, direkte forming og "smeltende" geometri.
- **Meshmixer:** surface-aware plassering der detaljer følger overflatens normaler og retning.
- **Fysisk bygging / magneter:** Body Parts skal oppføre seg som om de søker mot kompatible koblinger.

Referansene gjelder **interaksjonsprinsipper**, ikke visuell kopiering.

---

# 1. Produktvisjon

BuildForge skal gjøre det mulig for en bruker uten CAD-kompetanse å bygge avanserte, modulære og 3D-printbare modeller gjennom direkte manipulering.

Brukeren skal ikke måtte forstå:

- nodegrafer
- boolean-logikk
- constraints
- mating systems
- koordinatsystemer
- mesh topology
- CAD-terminologi

BuildForge skal oversette brukerens intensjon til geometri og mekanikk.

I praksis:

- **Body Parts søker connectors**
- **Sub-parts søker surfaces**
- **Dobbeltklikk går dypere inn i modellen**
- **BuildForge beskytter mekanikken**
- **Brukeren designer uttrykket**

---

# 2. UX-prinsipp: Canvas first

Eksisterende prototype har en god grunnstruktur: mørkt canvas, stor arbeidsflate, 3D-modellen i sentrum, enkel topplinje og liten venstre/høyre UI.

Denne roen skal beholdes.

BuildForge skal **ikke** utvikle seg til et tett CAD-grensesnitt med mange permanente paneler, tekniske ikoner og kontroller.

Regel:

> **Vis bare en funksjon når brukerens handling gjør den relevant.**

Eksempler:

- Connectors trenger ikke være synlige når brukeren bare ser på modellen.
- Connector-markører dukker opp under dragging / editing.
- Eksakte mål vises først når brukeren ber om dem.
- Body Chain-funksjoner vises bare ved relevant seleksjon.
- Sub-part-verktøy vises først når brukeren går inn i en Body Part.
- Kontrollrapport vises som en kompakt status og åpnes ved behov.
- Avanserte mekaniske innstillinger skal ikke dominere standardvisningen.

Målet er at canvaset visuelt skal være klart viktigst.

---

# 3. Oppstart – “LET’S BUILD A…”

Når brukeren kommer inn i byggemotoren, vises selve canvaset og byggeplaten.

Midt over canvaset vises en liten startvelger:

## LET’S BUILD A…

Under ligger en horisontal slider / carousel med starttyper.

Forslag:

- Dragon
- Snake
- Hero
- Human
- Creature
- Basic / Blank
- Mine Bodies (for innloggede brukere)

Hvert valg skal ha:

1. tydelig navn
2. en 3D-preview av start-Bodyen
3. gjerne et lite inspirasjons-preview av hvordan en ferdig modell **kan** se ut

Inspirasjonseksempelet skal ikke oppfattes som den faktiske modellen brukeren får.

Når brukeren velger f.eks. `Dragon`:

- startmenyen forsvinner
- **kun én Body Part** opprettes
- denne er prosjektets Root Body / Main Body
- brukeren bygger resten derfra

Det skal ikke automatisk opprettes ferdige armer, hode, hale, vinger osv.

---

# 4. Root Body / Main Body

Et BuildForge-prosjekt starter alltid med én Body Part som fungerer som roten i hovedkonstruksjonen.

Teknisk anbefalt begrep:

`Root Body`

I brukergrensesnittet kan den gjerne omtales som:

`Main Body`

Dette gjør datamodellen generell nok til å kunne brukes til mer enn figurer.

En Root Body kan senere være:

- torso
- dragekropp
- slangeledd
- chassis
- lampebase
- beholder
- annen hovedkomponent

BuildForge skal ikke være låst til humanoide figurer.

---

# 5. Body Parts

En **Body Part** er en selvstendig fysisk hoveddel.

Eksempler:

- Head
- Body
- Arm
- Leg
- Hand
- Foot
- Wing
- Tail
- Neck segment
- Spider leg segment
- Jaw
- Claw
- Mechanical segment
- osv.

Systemet skal ikke anta at én modell må ha en fast anatomisk struktur.

Det skal være fullt mulig å lage:

- tre hoder
- seks armer
- åtte bein
- fire vinger
- asymmetriske skapninger
- mekaniske konstruksjoner
- slanger
- edderkopper
- fantasifigurer

uten at BuildForge vurderer dette som strukturelt feil.

---

# 6. Body Part-bibliotek

På vanlig Body-nivå brukes venstrepanelet primært som bibliotek.

Forslag til toppnivå:

- **Bodies**
- **Body Parts**
- **Body Chains**
- **Mine**

Body Parts kategoriseres visuelt:

- Heads
- Bodies
- Arms
- Legs
- Hands
- Feet
- Wings
- Tails
- Necks
- Other

Brukeren drar som hovedregel **én Body Part om gangen** fra Body Part-galleriet.

Dette er en sentral regel.

Unntaket er eksplisitt lagrede **Body Chains**, som beskrives senere.

---

# 7. Grunnleggende canvas-interaksjoner

BuildForge bør ha et enkelt, konsekvent interaksjonsspråk.

## Ett klikk
Velg objektet.

## Dobbeltklikk Body Part
Gå inn i Body Part / Sub-part Mode.

## Esc
Gå ett nivå ut.

## Høyreklikk
Åpne kontekstsensitiv radialmeny.

## Drag
Flytt / koble / erstatt avhengig av hva objektet dras over.

## Shift + klikk
Multi-select.

Dette skal være stabilt gjennom hele BuildForge.

---

# 8. Drag-and-drop: Body Part → Connector

Når en Body Part dras nær en kompatibel, ledig connector på en annen Body Part:

- kompatible connectorer blir synlige
- nærmeste relevante connector fremheves
- target connector lyser grønt
- den dratte Body Parten begynner å orientere seg mot koblingen
- det skal føles magnetisk
- ved slipp opprettes forbindelsen

Visuelt skal dette oppleves som at delen fysisk “trekkes” mot festepunktet.

---

# 9. Magnetisk connector-valg ved Body Part-dragging

En Body Part kan ha flere åpne connectors.

Når brukeren drar én Body Part mot en target connector:

1. BuildForge finner alle **åpne og kompatible** connectors på Body Parten som dras.
2. Den connectoren som er nærmest target blir automatisk aktiv.
3. Body Parten roterer slik at den aktive connectorens retning/akse møter target connectorens retning.
4. Delen trekkes visuelt mot target når den nærmer seg snap-sonen.

Dette skal skape en tydelig magnetisk effekt.

## Høyreklikk mens Body Parten dras

Hvis den dratte Body Parten har flere kompatible connectors:

- høyreklikk mens dragging pågår
- BuildForge bytter til neste kompatible connector
- Body Parten roterer umiddelbart slik at den nye connectoren peker mot target
- høyreklikk igjen sykler videre

Vis gjerne en liten, midlertidig indikator:

`Connector 2 / 3`

eller tilsvarende.

Dette er en power-user-funksjon, men skal være lett å forstå visuelt.

Touch må senere få en alternativ mekanisme, eksempelvis en liten midlertidig `Bytt connector`-knapp under dragging.

---

# 10. Viktig unntak: Body Chains bruker IKKE connector-cycling

Den magnetiske “nærmeste connector + høyreklikk for å bytte”-logikken gjelder **enkeltstående Body Parts**.

Den skal **ikke** brukes når en Body Chain dras.

En Body Chain skal ha en eksplisitt definert:

- root connector
- attachment connector
- chain attachment point

Når Body Chain dras:

- kun denne connectoren brukes til snapping
- hele kjeden følger
- intern geometri og connectors skal ikke begynne å sykle
- høyreklikk skal ikke bytte mellom tilfeldige connectors inni chainen

Dette er viktig for forutsigbarhet.

---

# 11. Drag-and-drop: Body Part → eksisterende Body Part = Replace

Hvis brukeren drar en ny Body Part fra biblioteket og holder den over en eksisterende Body Part:

- hele eksisterende Body Part lyser grønt
- dette signaliserer **Replace**
- ny Body Part vises som ghost / preview
- slipp erstatter eksisterende Body Part

Dette skal være den mest direkte måten å bytte en del på.

Det kan fortsatt finnes `Change Body` i radialmenyen som sekundær / eksplisitt metode, men begge skal bruke **samme underliggende replace-operasjon**.

---

# 12. Replace og connector-matching

Når en Body Part erstattes, skal BuildForge forsøke å bevare eksisterende forbindelser.

Eksempel:

`Body → Arm → Hand`

Hvis Arm erstattes med en ny arm med kompatible parent/child connectors:

`Body → New Arm → Hand`

skal BuildForge koble dette automatisk.

## Viktig

Matching må ikke bare baseres på nærmeste geometri.

Connectorer bør ha metadata som gjør matching deterministisk:

- connector family/type
- male/female
- compatibility
- role
- orientation/axis
- open/occupied
- eventuelt semantic role, f.eks. shoulder / wrist / neck

Hvis den nye Body Parten har for få kompatible connectors:

- BuildForge kobler det som kan kobles
- resten slettes ikke
- deler som ikke får plass blir liggende som løse Body Parts / løse sammenkoblede strukturer

Dette er en hard UX-regel:

> **Replace skal aldri slette brukerens eksisterende konstruksjon uten eksplisitt handling.**

---

# 13. Løse Body Parts og løse assemblies

Body Parts kan ligge løst på canvaset.

Flere Body Parts kan også være koblet sammen med connectors uten å være koblet til Root Body.

Eksempel:

`Arm → Hand → Claw`

Dette er en **løs sammenkoblet struktur**.

Når brukeren drar en del av denne strukturen:

- hele den sammenkoblede strukturen følger
- connectorene mellom delene brytes ikke
- strukturen kan flyttes som én assembly

Når den kobles til en ledig connector på hovedmodellen:

- hele strukturen blir en del av hovedkonstruksjonen

Dette gjør at brukeren kan bygge moduler ved siden av hovedmodellen og montere dem senere.

---

# 14. Disconnect

En sammenkobling skal ikke brytes bare fordi brukeren “drar hardt”.

Hvis brukeren vil bryte en fysisk forbindelse:

- velg connector / relevant Body Part
- høyreklikk
- `Disconnect`

Da brytes forbindelsen eksplisitt.

Hvis:

`Arm → Hand → Claw`

og forbindelsen Arm–Hand brytes:

- Arm blir én struktur
- Hand → Claw forblir sammenkoblet og blir en løs assembly

Dette er viktig for å unngå utilsiktet destruktiv redigering.

---

# 15. Body Chains – definisjon

En **Body Chain** er en brukerdefinert, gjenbrukbar struktur bestående av flere Body Parts.

Krav:

> **Alle Body Parts i en Body Chain må være fysisk sammenkoblet via connectors.**

Dette er en hard regel.

Eksempel:

`Coxa → Femur → Tibia → Foot`

kan lagres som:

`Spider Leg`

En Body Chain er **ikke** én sammenslått mesh.

Alle Body Parts forblir individuelle og redigerbare.

Body Chain er et høyere logisk nivå som forteller BuildForge:

> Disse sammenkoblede delene skal behandles/gjenbrukes som én konstruksjon.

---

# 16. Body Chain trenger ikke være lineær internt

Selv om brukerbegrepet er “Body Chain”, kan strukturen teknisk være forgrenet så lenge den er sammenhengende.

Eksempel:

```
    B
    |
A - C - D
    |
    E
```

Dette kan fortsatt være én Body Chain dersom alle delene er koblet gjennom én sammenhengende connector-graf.

Internt bør datamodellen derfor gjerne hete noe mer generelt, f.eks.:

`BodyAssembly`

UI-navnet kan fortsatt være **Body Chain**.

---

# 17. Opprette Body Chain

Brukeren markerer flere Body Parts, f.eks. med Shift+klikk.

Eksempel:

`Coxa + Femur + Tibia + Foot`

Høyreklikk.

Hvis alle markerte deler tilhører én sammenhengende connector-graf:

- radialmenyen viser `Create Body Chain`

Hvis de **ikke** er sammenkoblet:

- handlingen deaktiveres
- kort melding:
  `Alle deler i en Body Chain må være sammenkoblet.`

Oppretting av Body Chain skal ikke endre geometri eller connectors.

Det oppretter bare et logisk høyere nivå.

---

# 18. Redigere eksisterende Body Chain

Høyreklikk på en Body Part som tilhører en Body Chain.

Velg:

`Edit Body Chain`

Når denne funksjonen aktiveres:

- alle Body Parts i chainen lyser grønne
- brukeren kan visuelt se medlemskapet
- en ny, allerede sammenkoblet Body Part kan legges til
- en grønn Body Part kan tas ut
- alle medlemmer må fortsatt være del av én sammenhengende connector-graf

Det skal **ikke** åpnes en separat editor.

Samme canvas brukes.

Målet er enkelhet:

> Body Chain-redigering = vis hvilke Body Parts som tilhører kjeden.

---

# 19. Hvis en Body Chain brytes

Hvis brukeren `Disconnect`-er en connector midt i en Body Chain og strukturen ikke lenger er sammenhengende:

Eksempel:

`A → B → C → D`

blir:

`A → B`     `C → D`

Da kan dette ikke lenger være én gyldig Body Chain.

BuildForge bør:

- markere at chainen er brutt
- ikke late som den fortsatt er gyldig
- tilby å opprette to separate Body Chains av de gjenværende sammenhengende gruppene

Ikke reparer automatisk forbindelsen.

---

# 20. Lagre Body Chains

En bruker med konto kan lagre en Body Chain i biblioteket.

Eksempel:

`Spider Leg`

Når den dras inn senere:

- hele chainen kommer inn
- den består fortsatt av individuelle Body Parts
- interne connectors beholdes
- chainens root/attachment connector brukes for montering

Dette er et eksplisitt unntak fra regelen om at Body Part-galleriet alltid gir én del.

---

# 21. Speilvending av Body Chains

Body Chains skal kunne speilvendes som én samlet konstruksjon.

Dette gjelder:

- Body Part-geometri
- relative transformasjoner
- Sub-parts
- connector-posisjoner
- connector-retninger
- joint-orientering
- mekanisk funksjonell geometri

Dette må være en ekte speilet konstruksjon, ikke bare `scaleX(-1)`.

Brukstilfelle:

- bygg ett edderkoppbein
- lagre / velg Body Chain
- `Mirror`
- fest speilet kopi på motsatt side

Mulige handlinger:

- Mirror in place
- Create mirrored copy

En lagret Body Chain kan gjerne håndtere original og mirrored variant under samme bibliotekelement.

---

# 22. Body Part vs Body Chain – viktig forskjell

**Body Part**
- én fysisk hovedkomponent
- kan ha flere åpne connectors
- ved dragging velges nærmeste connector automatisk
- høyreklikk under dragging kan sykle connector

**Body Chain**
- flere fysisk sammenkoblede Body Parts
- har eksplisitt root/attachment connector
- ingen connector-cycling under dragging
- hele chainen følger som én assembly

Denne forskjellen må være tydelig i både UX og intern arkitektur.

---

# 23. Hierarki som del av UI

Modellhierarkiet skal kunne vises som en del av interface.

Brukeren skal kunne klikke seg **innover i modellen**.

Eksempel:

```
★ Main Body
├─ Head
│  ├─ Eye L
│  ├─ Eye R
│  ├─ Horns
│  └─ Neck Connector
├─ Left Arm
│  └─ Hand
├─ Right Arm
│  └─ Hand
└─ Tail
```

Når Body Chains finnes:

```
★ Main Body
├─ Head
├─ ▾ Spider Leg
│  ├─ Coxa
│  ├─ Femur
│  ├─ Tibia
│  └─ Foot
└─ Tail
```

Hierarkiet skal være synkronisert med canvas:

- klikk i 3D → markering i hierarkiet
- klikk i hierarkiet → markering i 3D
- dobbeltklikk Body Part → gå inn i den

Men hierarkiet bør **ikke nødvendigvis være et stort permanent panel**.

Forslag:

- liten `Modell` / hierarchy-knapp
- et smalt panel kan åpnes/lukkes
- breadcrumbs er viktigere under dyp redigering

---

# 24. Breadcrumbs og navigasjon innover

Når brukeren går inn i modellstrukturen, vises breadcrumb.

Eksempel:

`Monster › Head`

eller:

`Spider › Left front leg › Tibia`

eller:

`Dragon › Head › Horn group`

Regel:

- dobbeltklikk går inn
- breadcrumb hopper direkte til et høyere nivå
- Esc går ett nivå ut

Dette skal oppleves som å åpne mapper / objekter, ikke som å bytte editor.

---

# 25. Sub-part Mode

Dobbeltklikk på en Body Part.

Da går brukeren inn i Body Partens interne redigering.

Eksempel:

`Monster › Head`

I denne modusen:

- aktiv Body Part forblir skarp
- andre Body Parts blir dempet / svakt blurred
- de andre delene kan eventuelt låses for selection
- kameraet fokuserer på aktiv Body Part
- venstrebiblioteket endrer kontekst

Viktig:

Det skal **ikke** oppleves som en ny app eller ny editor.

Samme canvas.
Samme navigasjon.
Bare et dypere nivå.

---

# 26. Blurring / context i Sub-part Mode

Når en Body Part redigeres:

- andre Body Parts skal bli visuelt tilbaketrukket
- bruk gjerne lavere opacity + svak blur
- ikke gjør dem så blurry at brukeren mister romforståelsen
- vurder `Show context / Hide context`

Aktiv Body Part skal være tydelig.

Formålet er fokus, ikke å skjule resten av modellen fullstendig.

---

# 27. Sub-parts

Sub-parts bygger utseendet på en Body Part.

Eksempler:

- Eyes
- Horns
- Spikes
- Scales
- Ears
- Teeth
- Nose
- Mouth
- Decorative plates
- shapes
- custom details

Sub-parts kan bestå av enklere geometri som:

- Sphere
- Rounded Box
- Cylinder
- Cone
- andre senere

Disse kan:

- flyttes
- roteres
- skaleres
- speiles
- kombineres
- smeltes visuelt
- grupperes
- lagres

---

# 28. Sub-part-bibliotek i Sub-part Mode

Når brukeren går inn i en Body Part, endrer venstrepanelet innhold.

Forslag:

- **Shapes**
- **Details**
- **Connectors**
- **Mine**

Eksempel:

### Shapes
- Sphere
- Rounded Box
- Cylinder
- Cone

### Details
- Eyes
- Horns
- Spikes
- Scales
- Ears
- Teeth

### Connectors
- Ball Joint
- Swivel Joint
- Articulated Joint
- Snap Fit
- Print-in-Place
- Magnet Insert
- Screw Hole
- osv.

### Mine
- lagrede Sub-parts
- lagrede Sub-part Groups

---

# 29. Sub-part Groups

Flere Sub-parts kan grupperes og lagres som én gjenbrukbar gruppe.

Eksempel:

`Dragon Spikes 01`

består av fem pigger.

En Sub-part Group:

- brukes på én Body Part / surface
- kan flyttes som gruppe
- kan åpnes og redigeres
- kan lagres
- kan gjenbrukes på andre Body Parts

Dette må skilles tydelig fra Body Chain.

## Definisjon

**Sub-part Group**
= flere detaljer på / i én Body Part.

**Body Chain**
= flere separate Body Parts som er fysisk koblet med connectors.

Ikke bruk en generisk `Group`-kommando på Body-nivå som kan forveksle disse begrepene.

---

# 30. Surface Detector

Dette er en kjernefunksjon og en viktig differensiator.

Sub-parts skal forstå overflaten de plasseres på.

Når en Sub-part dras over en Body Part:

- BuildForge finner lokal surface normal
- delen orienteres i forhold til overflaten
- delen skal oppleves som om den “legges på huden”
- brukeren skal normalt ikke måtte rotere den manuelt for å passe til surface

Eksempel:

En pigg plassert:

- på toppen av et hode → peker opp
- på siden → peker ut til siden
- på skrå rygg → peker skrått ut

---

# 31. Surface Detector for Sub-part Groups

Dette er spesielt viktig.

Hvis `Dragon Spikes 01` består av flere pigger:

- gruppen skal ikke oppføre seg som én rigid plate
- hver pigg bør ha eget lokalt kontaktpunkt
- hver pigg følger lokal surface normal
- hele gruppen kan derfor bøye/orientere seg over en buet rygg

Eksempel:

En piggrekke flyttes fra rygg til hale.

Hver pigg justerer sin lokale retning etter overflaten.

Dette er ønsket oppførsel, inspirert av surface-aware plassering som i Meshmixer.

---

# 32. Connectors er en egen type Sub-part

Connectors legges til inne i Sub-part Mode.

De er ikke bare dekorativ geometri.

De beskriver:

- fysisk festing
- kompatibilitet
- retning
- mekanisk relasjon
- eventuelt bevegelse
- printtoleranser

Connectorer skal kunne:

- legges til
- flyttes
- roteres
- endres
- slettes
- speiles

---

# 33. Connector-typer

BuildForge skal støtte / planlegges for minst:

- **Ball Joint**
- **Swivel Joint**
- **Articulated Joint**
- **Snap Fit Connector**
- **Print-in-Place Connector / Joint**
- **Magnet Insert**
- **Screw Hole / Screw Connector**

Senere kan systemet utvides med:

- hinges
- dovetails
- peg/socket
- click-fit
- bayonet
- andre mekaniske systemer

Viktig:

Snap-fit og print-in-place må være eksplisitte valg i connector-biblioteket.

---

# 34. Hann / hunn

Connectors må skille mellom:

- **Male / Hann**
- **Female / Hunn**

Dette er en del av connectorens datamodell.

Eksempel:

`Ball Joint – Male`

skal kobles med:

`Ball Joint – Female`

Ikke med en annen Male dersom profilen ikke eksplisitt tillater det.

BuildForge skal kun vise/snappe mot kompatible motparter.

---

# 35. Endre hann/hunn i Sub-part Mode

En eksisterende connector kan velges inne i Body Part-editoren.

Brukeren skal kunne endre:

`Male ↔ Female`

Når dette skjer:

- BuildForge regenererer den funksjonelle geometrien
- eventuell eksisterende sammenkobling kontrolleres

Hvis endringen gjør en eksisterende kobling ugyldig:

> `Dette vil bryte forbindelsen til [del].`

Brukeren må eksplisitt bekrefte.

BuildForge skal **ikke** automatisk endre connectoren på den andre Body Parten.

---

# 36. Connector-data

En connector bør minst kunne inneholde:

- unique id
- connector family/type
- male/female
- compatibility profile
- semantic role
- position
- axis/orientation
- open/occupied
- paired connector id dersom koblet
- mechanical profile/version
- tolerances
- print-related constraints
- root/attachment role hvis relevant

Eksempel på semantic roles:

- shoulder
- wrist
- neck
- hip
- chain-root
- generic-parent
- generic-child

Men UX skal ikke nødvendigvis eksponere disse tekniske feltene.

---

# 37. Radial høyreklikkmeny

Høyreklikk brukes som kontekstsensitiv snarvei.

Menyen skal være liten og enkel.

Ikke vis 12–15 alternativer samtidig.

## Høyreklikk Body Part

Forslag:

- Edit
- Duplicate
- Mirror
- Change Body
- Save Part
- Delete

Eventuelt mer under `…`.

## Multi-select av sammenkoblede Body Parts

- Create Body Chain
- Duplicate
- Mirror
- Delete

## Body Part som tilhører Body Chain

- Edit Body Chain
- Duplicate / Duplicate Chain
- Mirror
- Save
- Delete

## Connector

- Connect
- Disconnect
- Change Connector
- Change Male/Female
- Mirror
- Properties

Den eksakte menyen kan tilpasses etter kontekst.

---

# 38. “Change Body” som sekundær metode

Selv om direkte drag-over-replace er hovedmetoden, skal `Change Body` gjerne finnes i radialmenyen.

Det er nyttig for:

- discoverability
- touch
- brukere som ikke kjenner drag-replace
- eksplisitt bytte

Men begge metoder skal kalle samme underliggende replace-logikk.

---

# 39. Direkte gizmo og egenskaper

Eksisterende prototype har en enkel lokal kontroll:

- Flytt
- Roter
- Skaler

Dette bør beholdes.

Når et objekt velges, skal brukeren først få direkte manipulasjon.

Ikke åpne stort property-panel automatisk.

Eksakte verdier og avanserte egenskaper kan åpnes via:

- høyreklikk → Properties
- eventuelt `…`
- avansert panel ved behov

Dette holder UX-en ren.

---

# 40. Høyrepanelet

Dagens prototype har et stort permanent høyrepanel med:

- digital kontroll
- fysisk profil
- farger
- joint profile
- eksakte mål
- tekniske beskrivelser

Dette er nyttig informasjon, men for mye av den bør **ikke være permanent synlig**.

Anbefaling:

- høyrepanelet lukket som standard
- åpnes ved Properties / Advanced / Diagnostics
- standardbrukeren skal ikke måtte lese teknisk dokumentasjon mens hen bygger

Status og avanserte verdier skal fortsatt finnes, men de skal være progressive.

---

# 41. Modellstatus / printbarhetskontroll

BuildForge skal fortsatt kontrollere modellen.

Men standardvisningen kan reduseres til noe i retning av:

`✓ Modell OK`

`⚠ 2 problemer`

`● Kan ikke eksporteres`

Klikk åpner detaljer.

Ikke la store kontrolltekster dominere canvaset.

Det er fortsatt viktig å skille:

- digital check status
- fysisk testet profil / ikke fysisk testet

Men dette kan vises mer kompakt.

---

# 42. “Ikke fysisk testet” skal fortsatt være ærlig

BuildForge skal ikke hevde at en mekanisk connector er produksjonsklar dersom den bare er digitalt validert.

Forskjell:

- **Digital kontroll:** geometri/regler passer etter motorens sjekker
- **Fysisk profil:** fysisk testet eller ikke testet

Dette må fortsatt bevares i systemet.

Men varselet trenger ikke visuelt dominere alle arbeidssteg.

---

# 43. Bed Side / 3D-printing

Alle deler i BuildForge skal være designet med 3D-printing som premiss.

Det skal finnes konsept for:

`Bed Side`

Geometri som går under byggeplanet skal kunne kuttes slik at delen får flat underside.

Dette gjelder også Sub-parts.

Eksempel:

- en kule som brukes som fot får flat underside
- en detalj som går under byggeplanet kuttes

Men datamodellen må skille mellom:

## Assembly Orientation
Hvordan delen sitter i den ferdige modellen.

## Print Orientation / Bed Side
Hvordan delen skal ligge på byggeplaten.

Disse er ikke nødvendigvis det samme.

Dette bør støttes arkitektonisk fra starten, selv om UX for printorientering kommer senere.

---

# 44. Hierarki og fysisk konstruksjon

Hierarkiet skal gjenspeile den faktiske connector-grafen.

Eksempel:

```
★ Main Body
├─ Head
├─ Arm L
│  └─ Hand
│     └─ Claw
├─ Arm R
└─ Tail
```

Løse strukturer kan vises separat:

```
LOOSE
├─ Wing
└─ Assembly
   ├─ Leg
   └─ Foot
```

Når en løs assembly kobles til Main Body, flyttes den automatisk til hovedstrukturen.

---

# 45. Body Chain i hierarki

Body Chain er et høyere logisk nivå, men de individuelle Body Parts skal fortsatt være synlige.

Eksempel:

```
★ Main Body
└─ ▾ Spider Leg
   ├─ Coxa
   ├─ Femur
   ├─ Tibia
   └─ Foot
```

Hierarkiet må ikke slå chainen sammen til en anonym mesh.

---

# 46. Konto og lagring

## Bruker uten konto

Kan:

- åpne BuildForge
- bygge
- eksperimentere
- bruke funksjonene som er tillatt i gratisopplevelsen

Men:

- kan ikke lagre modellen permanent i Designporten-kontoen

Det skal ikke kreves registrering før brukeren får prøve byggemotoren.

Når brukeren velger `Lagre`:

> `Opprett en gratis konto for å lagre modellen og fortsette senere.`

Dette er en bedre registreringsmekanisme enn å stoppe brukeren før han har laget noe.

---

# 47. Bruker med konto

Innloggede brukere skal kunne lagre:

- modeller / prosjekter
- egne Body Parts
- egne Body Chains
- egne Sub-parts
- egne Sub-part Groups
- eventuelt presets / startbodies

Dette bygger et personlig bibliotek som blir mer verdifullt over tid.

---

# 48. Lagringskapasitet

Hvor mye lagringskapasitet hver konto får er **ikke endelig bestemt**.

Arkitekturen bør derfor støtte kvoter uten å hardkode produktmodellen.

Senere kan det skilles mellom:

- gratis lagring
- større lagringspakker
- eventuelt abonnement

Ikke koble lagringsmengde direkte til commercial licence.

---

# 49. Privat vs kommersiell lisens

Lagring og lisens skal behandles som to forskjellige konsepter.

Mulige lisensnivåer:

## Private Licence
For personlig bruk.

## Commercial Licence
Gir kommersiell bruk etter Designportens vilkår.

Detaljene er ennå ikke bestemt.

Det må senere defineres:

- om lisensen gjelder eksporterte modeller
- egne designs vs Designporten-komponenter
- salg av fysiske prints
- salg av digitale filer
- krav til abonnement eller engangskjøp
- eventuell attribution
- eventuelle begrensninger

Ikke lås dette i koden før forretningsmodellen er bestemt.

---

# 50. Visuell stil

Viktig basert på siste UX-review:

BuildForge skal **ikke se robotaktig ut**.

Tidligere konseptbilder ble for:

- mekaniske
- sci-fi
- dashboard-tunge
- CAD-aktige
- fulle av blå ringer og teknisk chrome

Det er feil retning.

Bruk:

- organiske og vennlige eksempelmodeller
- monstre, drager, dyr og karakterer
- enkle matte 3D-materialer
- rolig mørkt canvas
- Designportens lilla som aktiv/selection-farge
- grønt kun når det faktisk kommuniserer gyldig snapping / replace / chain membership
- teknisk visualisering bare når den forklarer en handling

Canvaset skal føles kreativt, ikke industrielt.

---

# 51. Connector-markører skal ikke være permanente

Ikke vis blå/grønne connector-ringer over hele modellen hele tiden.

Normaltilstand:

- connectors skjult

Under relevant handling:

- bruker begynner å dra Body Part
- kompatible connectors fades inn
- nærmeste / aktive blir tydelig grønn
- øvrige er diskrete
- etter fullført eller avbrutt dragging fades de ut igjen

Dette reduserer visuelt rot kraftig.

---

# 52. Farger i interaksjon

Forslag:

- **Lilla:** vanlig selection / BuildForge action
- **Grønn:** gyldig attach / replace / Body Chain membership under Edit Body Chain
- **Rød:** ugyldig / collision / blokkert
- **Grå/dempet:** inaktiv / utenfor nåværende edit-scope

Grønt bør ha en klar semantikk og ikke brukes tilfeldig.

---

# 53. Replace-visualisering

Når en Body Part fra biblioteket holdes over en eksisterende Body Part:

- target Body Part blir grønn
- ghost av ny Body Part vises
- eventuell tekst kan være svært kort:
  `Replace`

Ikke åpne dialog før slipp dersom matching er entydig.

Hvis resultatet vil etterlate løse deler, kan BuildForge etter slipp vise en kort beskjed:

> `2 deler ble frakoblet fordi den nye delen mangler kompatible connectors.`

Deler skal fortsatt være på canvaset.

---

# 54. Body Chain-dragging fra bibliotek

Når lagret Body Chain dras fra biblioteket:

- hele chainen følger som én assembly
- interne deler forblir individuelle
- chainens definerte root connector brukes
- kompatible target connectors vises
- snapping skjer med chain root
- ingen connector cycling

Dette må ikke blandes med den magnetiske Body Part-interaksjonen.

---

# 55. Speiling og symmetry

Speiling skal finnes både for:

- Body Part
- Body Chain
- Sub-parts
- Sub-part Groups

Men oppførselen avhenger av nivået.

Speiling av mekaniske objekter må ta hensyn til:

- male/female geometry
- axis
- orientation
- connector roles
- clearances

Ikke bare visuell transform.

---

# 56. Lagre egne Body Parts

Brukeren kan lage en Body Part med:

- grunnform
- Sub-parts
- connectors
- mekanikk
- farge/materiale
- metadata

og velge:

`Save Body Part`

Eksempel:

`Dragon Head 01`

Neste gang finnes den under:

`Mine Body Parts`

Når den dras inn:

- all intern struktur følger med
- connectors følger med
- Sub-parts forblir redigerbare
- delen kan dobbeltklikkes og åpnes igjen

---

# 57. Lagre Sub-part Groups

Brukeren kan lage:

- en rekke pigger
- et hornsett
- et øyesett
- en skjellgruppe
- et ornament
- andre surface-aware detaljer

og lagre dette som:

`Sub-part Group`

Ved gjenbruk:

- gruppen kan festes på ny Body Part
- surface detector tilpasser detaljene til ny overflate
- brukeren kan åpne gruppen og redigere individuelle komponenter

---

# 58. Fremtidig utvidbarhet

Arkitekturen må unngå å låse BuildForge til dagens figurbruk.

Det bør senere være mulig å legge til produktfamilier som:

- clickers
- animals
- characters
- articulated toys
- robots
- hooks
- knobs
- holders
- desk objects
- modular decorations
- enclosures
- parts built around real hardware

Det viktigste er at samme objektmodell fortsatt kan brukes:

- Root Body
- Body Parts
- Connectors
- Sub-parts
- Body Chains
- Surface-aware details

---

# 59. Viktig forskjell fra tidligere BuildForge-figurmodell

Tidligere modell hadde i praksis en fast struktur:

- Head
- Body
- Left Arm
- Right Arm
- Left Leg
- Right Leg
- etc.

Denne strukturen skal **ikke være kjernen videre**.

BuildForge må gå over til en mer generell grafmodell.

Forslag teknisk:

- prosjekt inneholder Body nodes
- Body nodes har Connector nodes
- connectors kobler Body nodes
- én Body node markeres som Root
- Sub-parts tilhører en Body
- Body Chains er named subsets / assemblies av sammenhengende Body nodes
- loose assemblies er connected components som ikke inneholder Root

Dette passer UX-en langt bedre.

---

# 60. Forslag til konseptuell datamodell

Dette er ikke et krav om eksakt TypeScript-shape, men illustrerer forholdene:

```ts
Project {
  rootBodyId: string
  bodies: BodyPart[]
  bodyChains: BodyChain[]
  looseAssemblies: ...
}

BodyPart {
  id
  name
  bodyType
  transform
  subParts[]
  connectors[]
  printOrientation
  metadata
}

Connector {
  id
  family
  gender // male | female | neutral if profile permits
  role
  transform
  compatibilityProfile
  connectedTo?
  mechanicalProfileVersion
}

SubPart {
  id
  type
  transform
  surfaceBinding?
  groupId?
}

BodyChain {
  id
  name
  bodyIds[]
  rootConnectorId
}
```

Viktigere enn datastrukturen er invariants:

1. Body Chain må være connected.
2. Root Body er entydig.
3. Connector-pairs må være kompatible.
4. Loose assembly = connected component uten Root.
5. Sub-part Groups tilhører Body-nivå, ikke Body graph.
6. Mechanics lagres ikke som fri, tilfeldig bruker-geometri dersom de styres av profiler.

---

# 61. Undo / redo

Direkte manipulering må være trygg.

Én naturlig brukerhandling = ett undo-steg.

Eksempler:

- attach Body Part
- replace Body Part
- disconnect
- mirror
- create Body Chain
- add connector
- change male/female
- add Sub-part Group
- surface placement

Ikke lag hundre historikksteg mens en del roteres kontinuerlig under dragging.

---

# 62. Mobil / touch

Desktop-interaksjon bruker:

- høyreklikk
- hover
- drag
- multi-select

Touch må ha ekvivalenter.

Eksempler:

- long press = radial/context menu
- tap = select
- double tap = enter Body Part
- drag = move
- midlertidig `Bytt connector`-knapp mens dragging pågår
- multi-select via explicit selection mode / checkmarks

Ikke design systemet slik at kritiske funksjoner kun finnes på høyreklikk.

---

# 63. Kritiske UX-regler som skal beskyttes

Disse bør behandles som produktprinsipper:

### Regel 1
**Canvas er hovedgrensesnittet.**

### Regel 2
**Body Part → Connector = Connect.**

### Regel 3
**Body Part → eksisterende Body Part = Replace.**

### Regel 4
**Sub-part → Surface = Attach to surface.**

### Regel 5
**Dobbeltklikk Body Part = gå inn i Body Part.**

### Regel 6
**Esc = gå ett nivå ut.**

### Regel 7
**Body Chains består kun av fysisk sammenkoblede Body Parts.**

### Regel 8
**Body Chain bruker definert root connector, ikke connector-cycling.**

### Regel 9
**Enkeltstående Body Part med flere connectors bruker nærmeste kompatible connector, og høyreklikk under dragging sykler mellom dem.**

### Regel 10
**Connectors har hann/hunn der connectorprofilen krever det.**

### Regel 11
**Connectors redigeres inne i Sub-part Mode.**

### Regel 12
**Ikke slett brukerens geometri automatisk ved Replace.**

### Regel 13
**Løse connected assemblies beholdes og kan monteres på nytt.**

### Regel 14
**Sub-part Groups følger surface lokalt.**

### Regel 15
**BuildForge er alltid bevisst på 3D-printing.**

---

# 64. Ting som IKKE skal gjøres

Ikke:

- gjør BuildForge til Tinkercad light
- fyll canvaset med permanente connector-ringer
- vis alle tekniske data samtidig
- åpne store property-paneler ved hvert klikk
- lås figurer til humanoid anatomi
- slett frakoblede deler automatisk
- bruk robotestetikk som hovedidentitet
- bland Body Chain og Sub-part Group
- la Body Chain inneholde ukoblede deler
- bruk tilfeldig nærmeste connector ved Replace uten compatibility/role
- kall digital check “print safe” hvis fysisk profil ikke er testet
- lag separate editorer for hvert nivå hvis samme canvas kan brukes
- bruk unødvendig mange modes
- la avansert funksjonalitet dominere førstegangsopplevelsen

---

# 65. Det som fortsatt ikke er endelig bestemt

Claude skal ikke hardkode forretnings- eller mekaniske valg som fortsatt er åpne.

## Konto / produkt
- lagringskvote per konto
- gratisnivå
- eventuell betalt lagring
- Private Licence-vilkår
- Commercial Licence-vilkår
- prisstruktur
- hva gratisbruker får eksportere

## Mekanikk
- eksakte toleranser per connectorprofil
- hvilke connectorer som er fysisk testet
- standard printer/materiale/orientering
- hvilke snap-fit-profiler som skal tilbys først
- hvilke print-in-place joints som skal tilbys først

## UX
- eksakt touch-variant for connector cycling
- om hierarchy er drawer, popover eller smalt panel
- nøyaktig innhold i radialmeny per objekttype
- endelig terminologi “Main Body” vs “Root Body” i UI

Arkitekturen bør støtte valgene uten å tvinge dem nå.

---

# 66. Kritiske områder Claude bør løse før større implementering

## A. Generaliser gammel Figure-modell
Den faste figurstrukturen må ikke bli liggende som grunnarkitektur.

Flytt mot:
- general Body graph
- connectors som edges
- Root Body
- connected components
- Body Chains som logiske connected subsets

## B. Definer connector schema
Dette må være robust før drag/replace blir avansert.

Minimum:
- family
- gender
- role
- axis
- compatibility
- pair state
- mechanical profile version

## C. Skill Assembly Orientation fra Print Orientation
Ikke bruk bare global Z/bed cut som eneste modell.

## D. Lag én sentral drag-resolution-motor
Dragging bør kunne klassifisere:

- connect
- replace
- invalid
- surface attach
- chain attach

Ikke implementer disse som separate tilfeldige kodebaner.

## E. Bygg kontekstuell UI
Unngå permanent feature exposure.

## F. Bevar undo/redo
Alle nye handlinger må integreres i én konsistent command/history-modell.

---

# 67. Foreslått implementeringsrekkefølge

Dette er et forslag, ikke absolutt krav.

## Fase 1 – datamodell
- generaliser BodyPart
- Root Body
- connector schema
- connected graph
- loose assemblies
- invariants

## Fase 2 – grunnleggende canvasbygging
- drag Body Part fra bibliotek
- connector snapping
- connect/disconnect
- magnetic rotation
- right-click connector cycling

## Fase 3 – Replace
- drag over Body Part
- green replace state
- deterministic connector remapping
- preserve unmatched assemblies

## Fase 4 – hierarchy
- graph tree
- selection sync
- breadcrumbs
- enter/exit Body Part

## Fase 5 – Sub-part Mode
- contextual library
- surface binding
- surface normals
- save Sub-parts
- Sub-part Groups

## Fase 6 – connector editor
- add connector
- male/female
- Ball Joint
- Swivel
- Articulated
- Snap Fit
- Print-in-Place
- Magnet
- Screw

## Fase 7 – Body Chains
- create from connected selection
- validate connectedness
- edit membership
- save/load
- mirror
- root attachment connector
- drag as assembly

## Fase 8 – print orientation / bed logic
- Assembly vs Print orientation
- flat bed-side rules
- print previews

## Fase 9 – accounts / storage / licensing
Etter at produktreglene er bestemt.

---

# 68. Akseptansekriterier for første gode BuildForge-opplevelse

En ny bruker bør kunne gjøre følgende uten å lese manual:

1. Åpne BuildForge.
2. Se `LET’S BUILD A…`.
3. Velge Dragon.
4. Få én start-Body på canvaset.
5. Dra et Head fra biblioteket.
6. Se kompatible connectors når Head nærmer seg kroppen.
7. Oppleve magnetisk snapping.
8. Dra inn en Arm.
9. Høyreklikke under dragging og bytte mellom armens åpne connectors.
10. Slippe og koble armen.
11. Dra inn en annen Arm over den eksisterende og forstå at grønn Body Part betyr Replace.
12. Dobbeltklikke Head.
13. Se resten av modellen dempet.
14. Dra pigger på hodet og se at de følger overflaten.
15. Legge til en Ball Joint / Snap Fit / Print-in-Place connector.
16. Velge Male/Female der det er relevant.
17. Gå ut igjen med Esc.
18. Bygge flere sammenkoblede deler ved siden av modellen.
19. Dra hele den løse assemblyen til Root Body og koble den.
20. Markere sammenkoblede Body Parts og opprette Body Chain.
21. Speile Body Chain.
22. Lagre Chain / Part dersom brukeren er innlogget.
23. Se en kompakt `✓ Modell OK` eller relevant problemstatus.
24. Eksportere når alle blocking checks er bestått.

Hvis dette krever at brukeren forstår tradisjonell CAD, er UX-en for komplisert.

---

# 69. Oppsummering til Claude

BuildForge skal ikke være en parametereditor for ferdig definerte figurer.

Det skal være:

> **Et modulært, 3D-printbevisst byggesystem der brukeren konstruerer objekter av Body Parts, former dem med surface-aware Sub-parts og kobler dem sammen med intelligente connectors.**

De tre viktigste interaksjonene:

> **Body Part søker Connector.**  
> **Sub-part søker Surface.**  
> **Dobbeltklikk går innover i modellen.**

Og den viktigste UX-regelen:

> **Ikke vis hele BuildForge samtidig. La funksjonene komme frem når brukeren trenger dem.**

Eksisterende mørke canvas og relativt rolige visuelle struktur er et bedre utgangspunkt enn mer avanserte CAD-lignende mockups.

Videre utvikling bør derfor fokusere på:

- generalisert modellgraf
- intuitiv fysisk snapping
- contextual UI
- hierarkisk inn-og-ut-redigering
- surface-aware details
- robuste connectorprofiler
- 3D-printing som innebygd premiss

Dette dokumentet skal brukes som revidert retning for BuildForge og bør ses opp mot tidligere `buildforge-handoff.md`. Der tidligere spesifikasjon beskriver fast figurstruktur som arkitektonisk grunnlag, er dette dokumentet den nyere retningen.
